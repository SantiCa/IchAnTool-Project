"""Batch processing: many images, and cores made of several sections, from a manifest table.

The manifest is a CSV with one row per section image::

    image,core,top,bottom,units,name,exclude
    U1385_1H_1.png,U1385I,0,150,cm,1H-1,U1385_1H_1_excl.png

``image``, ``top`` and ``bottom`` are required; ``core`` (default: one core named after the manifest), ``units``
(default cm), ``name`` (default: file stem) and ``exclude`` (an exclusion image, white = excluded) are optional.
Relative paths are read from the manifest's folder. Write a starting manifest for a folder with
:func:`write_manifest_template`.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np
import pandas as pd

from .export import spreadsheet_text, write_csv_table
from .io import SUPPORTED, load_image, load_mask
from .pipeline import UNIT_TO_CM, CoreSection, analyze_mask

REQUIRED = ("image", "top", "bottom")
_MANIFEST_ESCAPE = "__sedcoretool_csv_escape__"
_ESCAPE_VERSION = "apostrophe-v1"
_MANIFEST_TYPES = {**dict.fromkeys(("image", "core", "name", "exclude", "units", _MANIFEST_ESCAPE), "string"),
                   "top": "float64", "bottom": "float64"}


def load_exclusion(path: str | Path) -> np.ndarray:
    """Exclusion image: pixels with grey > 127 (white) are excluded, black pixels are valid."""
    img = load_image(path, "L")
    return img > 127


def _read_matching_exclusion(path: str | Path, image_path: str | Path, image_shape: tuple[int, ...]) -> np.ndarray:
    exclusion = load_exclusion(path)
    if exclusion.shape != image_shape:
        raise ValueError(f"{Path(path).name}: size {exclusion.shape[::-1]} differs from "
                         f"{Path(image_path).name} {image_shape[::-1]} (width, height)")
    return exclusion


def read_manifest(path: str | Path) -> pd.DataFrame:
    """Read section data, preserving literal identifiers and decoding only explicitly marked rows."""
    path = Path(path)
    headers = pd.read_csv(path, nrows=0, compression=None).columns
    columns = {c: c.strip().lower() for c in headers if c.strip().lower() in _MANIFEST_TYPES}
    if len(set(columns.values())) != len(columns):
        raise ValueError(f"manifest {path.name}: duplicate column names")
    # Names such as "NA" are valid identifiers; only empty CSV cells mean missing data.
    m = pd.read_csv(path, usecols=list(columns), dtype={c: _MANIFEST_TYPES[key] for c, key in columns.items()},
                    compression=None, keep_default_na=False, na_values=[""]).rename(columns=columns)
    missing = [c for c in REQUIRED if c not in m]
    if missing:
        raise ValueError(f"manifest {path.name}: missing column(s) {', '.join(missing)}")
    if m.empty:
        raise ValueError(f"manifest {path.name} has no rows")
    for c in REQUIRED:
        if m[c].isna().any():
            rows = ", ".join(str(i + 2) for i in m.index[m[c].isna()])
            raise ValueError(f"manifest {path.name}: empty '{c}' in line(s) {rows}")
    if _MANIFEST_ESCAPE in m:
        escaped = m.pop(_MANIFEST_ESCAPE).eq(_ESCAPE_VERSION).fillna(False)
        for column in ("image", "core", "name", "exclude", "units"):
            if column in m:
                m.loc[escaped, column] = m.loc[escaped, column].str.removeprefix("'")
    m["core"] = m["core"].fillna(path.stem) if "core" in m else path.stem
    m["units"] = m["units"].fillna("cm") if "units" in m else "cm"
    base = path.parent
    m["image"] = [str((base / p).resolve()) for p in m["image"]]
    if "exclude" in m:
        m["exclude"] = [str((base / p).resolve()) if isinstance(p, str) and p.strip() else None for p in m["exclude"]]
    else:
        m["exclude"] = None
    m["name"] = [n if isinstance(n, str) and n.strip() else Path(i).stem
                 for n, i in zip(m["name"] if "name" in m else [None] * len(m), m["image"])]
    return m


def write_manifest_template(folder: str | Path, out: str | Path | None = None) -> Path:
    """List the images of a folder in a manifest with empty depths, to be filled in by the user."""
    folder = Path(folder)
    imgs = sorted(p for p in folder.iterdir() if p.suffix.lower() in SUPPORTED and not p.stem.endswith("_excl"))
    if not imgs:
        raise ValueError(f"no images ({', '.join(sorted(SUPPORTED))}) in {folder}")
    out = Path(out) if out else folder / "sections.csv"
    rows = [{"image": p.name, "core": folder.name, "top": "", "bottom": "", "units": "cm", "name": p.stem,
             "exclude": (p.stem + "_excl.png") if (folder / (p.stem + "_excl.png")).exists() else ""} for p in imgs]
    for i, row in enumerate(rows):
        if any(spreadsheet_text(value) != value for value in row.values()):
            rows[i] = {key: "'" + value if value.startswith("'") else spreadsheet_text(value)
                       for key, value in row.items()} | {_MANIFEST_ESCAPE: _ESCAPE_VERSION}
    return write_csv_table(pd.DataFrame(rows), out)


def run_manifest(manifest: str | Path, to_mask: Callable[[Path], tuple] | None = None,
                 **analysis) -> dict[str, list[CoreSection]]:
    """Analyse every section of a manifest. Returns {core: [sections, top to bottom]}.

    to_mask(path) -> (mask, class_names[, exclusion]) turns an image into a label mask (default: an integer label mask, as
    exported by the program or by ``unet predict``). ``analysis`` goes to :func:`analyze_mask` (bin_cm, min_valid…).
    """
    m = read_manifest(manifest)
    to_mask = to_mask or (lambda p: (load_mask(p), None))
    cores: dict[str, list[CoreSection]] = {}
    for r in m.itertuples(index=False):
        mask, names, *rest = to_mask(Path(r.image))
        exclude = rest[0] if rest else None
        if isinstance(r.exclude, str):
            ex = _read_matching_exclusion(r.exclude, r.image, mask.shape[-2:])
            exclude = ex if exclude is None else (exclude | ex)
        s = analyze_mask(mask, float(r.top), float(r.bottom), units=r.units, class_names=names,
                         exclude=exclude, name=r.name, **analysis)
        s.data.insert(0, "core", r.core)
        s.metadata["core"] = r.core
        cores.setdefault(r.core, []).append(s)
    for secs in cores.values():
        secs.sort(key=lambda s: s.top * UNIT_TO_CM[s.units])
    return cores
