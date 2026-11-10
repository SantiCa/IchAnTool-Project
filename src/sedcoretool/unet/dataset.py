"""Training data for the U-Net (V0.15).

Input: the ZIP (or its unpacked folder) exported from the app with *Results → U-Net training data*:
``manifest.json`` + ``images/*.png`` (original analysis area) + ``masks/*.png`` (0 = matrix or artefact,
k = class k, 255 = ignore: excluded zones and traces without a confirmed class).

``prepare_dataset`` resamples every image to a common resolution (px/cm), cuts overlapping tiles and
splits them **by core**: all tiles of a core go to the same set, so the test score measures performance
on cores the model has never seen.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from ..io import open_training_export
from .tiling import IGNORE, resample_bilinear, tile_starts


@dataclass
class Item:
    core: str
    section: str
    image: np.ndarray  # (h, w, 3) uint8
    mask: np.ndarray   # (h, w) uint8
    px_per_cm: float



def load_export(src: str | Path) -> tuple[list[Item], list[dict]]:
    """Items and classes of an exported training set (ZIP file or folder)."""
    with open_training_export(src) as read:
        man = json.loads(read("manifest.json"))
        if man.get("kind") != "segmentation-dataset":
            raise ValueError("not a SedCoreTool (or CorAnTool) segmentation dataset (manifest kind)")
        items, decoded = [], 0
        for it in man["items"]:
            with Image.open(io.BytesIO(read(it["image"]))) as image, Image.open(io.BytesIO(read(it["mask"]))) as mask:
                if image.size != mask.size:
                    raise ValueError(f"image and mask sizes differ: {it['image']}")
                pixels = image.width * image.height
                decoded += 4 * pixels  # RGB plus the grayscale mask
                if 4 * pixels > 256 * 1024**2 or decoded > 1024**3:
                    raise ValueError("decoded training images exceed the import limit")
                img, msk = np.asarray(image.convert("RGB")), np.asarray(mask.convert("L"))
            items.append(Item(it["core"], it["section"], img, msk, float(it["pxPerCm"])))
    return items, man["classes"]


def resample_mask(mask: np.ndarray, out_h: int, out_w: int) -> np.ndarray:
    """Nearest-neighbour resampling (labels must not be averaged), same pixel-centre rule as the images."""
    h, w = mask.shape
    ys = np.clip(np.floor((np.arange(out_h) + 0.5) * h / out_h), 0, h - 1).astype(int)
    xs = np.clip(np.floor((np.arange(out_w) + 0.5) * w / out_w), 0, w - 1).astype(int)
    return mask[ys][:, xs]


def binary_mask(mask: np.ndarray) -> np.ndarray:
    """All classes merged into bioturbation (1); matrix 0; ignore kept."""
    out = (mask > 0).astype(np.uint8)
    out[mask == IGNORE] = IGNORE
    return out


def split_cores(cores: list[str], val: list[str] | None = None, test: list[str] | None = None,
                val_frac: float = 0.2, test_frac: float = 0.2, seed: int = 42) -> dict[str, str]:
    """Core -> 'train' | 'val' | 'test'. Named cores are used as given; the rest are shuffled with ``seed``."""
    val, test = list(val or []), list(test or [])
    if set(val) & set(test):
        raise ValueError("validation and test cores must be disjoint")
    unknown = [c for c in val + test if c not in cores]
    if unknown:
        raise ValueError(f"unknown cores: {unknown}")
    rest = sorted(c for c in set(cores) if c not in val and c not in test)
    rng = np.random.default_rng(seed)
    rng.shuffle(rest)
    n = len(set(cores))
    if not test and n >= 3:
        test = rest[:max(1, round(test_frac * n))]
        rest = rest[len(test):]
    if not val and len(rest) >= 2:
        val = rest[:max(1, round(val_frac * n))]
        rest = rest[len(val):]
    out = {c: "train" for c in rest}
    out.update({c: "val" for c in val})
    out.update({c: "test" for c in test})
    return out


def tiles_of(item: Item, tile: int, overlap: int, px_per_cm: float | None, min_valid: float = 0.5):
    """Yield (y0, x0, image tile, mask tile) for tiles with at least ``min_valid`` non-ignored pixels."""
    img, msk = item.image, item.mask
    if px_per_cm:
        s = px_per_cm / item.px_per_cm
        if abs(s - 1) > 0.02:
            H, W = max(1, round(img.shape[0] * s)), max(1, round(img.shape[1] * s))
            img, msk = resample_bilinear(img, H, W), resample_mask(msk, H, W)
    h, w = msk.shape
    for y0 in tile_starts(h, tile, overlap):
        for x0 in tile_starts(w, tile, overlap):
            ys = np.minimum(h - 1, y0 + np.arange(tile))
            xs = np.minimum(w - 1, x0 + np.arange(tile))
            m = msk[ys][:, xs].copy()
            # padding outside the image is ignored, not matrix
            m[(y0 + np.arange(tile)) >= h, :] = IGNORE
            m[:, (x0 + np.arange(tile)) >= w] = IGNORE
            if (m != IGNORE).mean() < min_valid:
                continue
            yield y0, x0, img[ys][:, xs], m


def _tile_stems(items: list[Item]) -> list[str]:
    """Portable, bounded names whose identity does not depend on sanitised display labels."""
    stems, used = [], set()
    for item in items:
        labels = []
        for field, value in (("core", item.core), ("section", item.section)):
            if not isinstance(value, str) or not value:
                raise ValueError(f"invalid {field} identifier: expected a non-empty string")
            labels.append(re.sub(r"[^A-Za-z0-9_-]+", "_", value)[:32])
        identity = json.dumps([item.core, item.section], ensure_ascii=True, separators=(",", ":")).encode("ascii")
        stem = "__".join([*labels, hashlib.sha256(identity).hexdigest()])
        if stem.casefold() in used:
            raise ValueError(f"duplicate core/section identifiers: {item.core!r}, {item.section!r}")
        used.add(stem.casefold())
        stems.append(stem)
    return stems


def _dataset_path(output: Path, *parts: str) -> Path:
    """Reject aliases as well as escapes, before writing or replacing dataset contents."""
    path = output.joinpath(*parts)
    resolved = path.resolve()
    if not resolved.is_relative_to(output) or resolved != path:
        raise ValueError(f"unsafe dataset output path: {path}")
    return path


def prepare_dataset(src: str | Path, out: str | Path, tile: int = 512, overlap: int = 64,
                    px_per_cm: float | None = None, binary: bool = True, val_cores=None, test_cores=None,
                    seed: int = 42, min_valid: float = 0.5, overwrite: bool = False) -> dict:
    """Write ``out/{train,val,test}/{images,masks}/*.png`` and ``out/dataset.json``; return the summary.

    ``out`` must be empty, so that tiles of two datasets are never mixed. With ``overwrite=True`` a previous dataset
    in ``out`` (recognised by its ``dataset.json``) is replaced; any other non-empty directory is refused.
    Tile names use portable labels and the exact core/section identity. Duplicate identities and aliased output
    paths are refused before replacement; existing files are never silently overwritten during tile creation.
    """
    items, classes = load_export(src)
    if not items:
        raise ValueError("the export has no images")
    stems = _tile_stems(items)
    if px_per_cm is None:
        px_per_cm = float(np.median([it.px_per_cm for it in items]))
    split = split_cores([it.core for it in items], val_cores, test_cores, seed=seed)
    out = Path(out).resolve()
    partitions = {part: _dataset_path(out, part) for part in ("train", "val", "test")}
    directories = {(part, kind): _dataset_path(out, part, kind) for part in partitions for kind in ("images", "masks")}
    metadata = _dataset_path(out, "dataset.json")
    if out.exists() and any(out.iterdir()):
        if not overwrite:
            raise ValueError("output directory must be empty; choose a new directory or use --overwrite to replace "
                             "a previous dataset")
        if not metadata.is_file():
            raise ValueError("--overwrite only replaces a previous dataset (a directory containing dataset.json)")
        for directory in partitions.values():
            shutil.rmtree(directory, ignore_errors=True)
        metadata.unlink()
    counts = {k: {"tiles": 0, "cores": sorted({c for c, v in split.items() if v == k})} for k in ("train", "val", "test")}
    for directory in directories.values():
        directory.mkdir(parents=True, exist_ok=True)
    for it, stem in zip(items, stems, strict=True):
        part = split[it.core]
        for y0, x0, im, m in tiles_of(it, tile, overlap, px_per_cm, min_valid):
            if binary:
                m = binary_mask(m)
            name = f"{stem}__y{y0}_x{x0}.png"
            image_path = _dataset_path(out, part, "images", name)
            mask_path = _dataset_path(out, part, "masks", name)
            with image_path.open("xb") as image_file:
                Image.fromarray(im).save(image_file, format="PNG")
            with mask_path.open("xb") as mask_file:
                Image.fromarray(m).save(mask_file, format="PNG")
            counts[part]["tiles"] += 1
    names = ["bioturbation"] if binary else [c["name"] for c in classes]
    summary = {"tile": tile, "overlap": overlap, "pxPerCm": px_per_cm, "binary": binary, "classes": names,
               "ignore": IGNORE, "seed": seed, "split": counts}
    with metadata.open("x", encoding="utf-8") as file:
        file.write(json.dumps(summary, indent=2))
    return summary
