"""Image input. Images are oriented with the core top at row 0."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from struct import Struct
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

import numpy as np
from PIL import Image

SUPPORTED = {".png", ".tif", ".tiff", ".jpg", ".jpeg", ".bmp"}
LOSSY = {".jpg", ".jpeg"}


def load_image(path: str | Path, mode: str | None = None) -> np.ndarray:
    """Load an image as a numpy array.

    mode: optional PIL mode ("L" grayscale, "RGB"). None keeps the original.
    Lossy formats (JPEG) are accepted but discouraged for masks, because
    compression alters the pixel values the analysis relies on.
    """
    path = Path(path)
    if path.suffix.lower() not in SUPPORTED:
        raise ValueError(f"Unsupported format {path.suffix!r}; use one of {sorted(SUPPORTED)}")
    with Image.open(path) as im:
        if mode is not None:
            im = im.convert(mode)
        elif im.mode not in ("L", "RGB", "RGBA", "I", "I;16"):
            im = im.convert("RGB")
        return np.asarray(im)


def load_mask(path: str | Path) -> np.ndarray:
    """Load a label mask (0 = background, 1..n = classes) saved as PNG/TIFF."""
    arr = load_image(path)
    if arr.ndim != 2:
        raise ValueError("A label mask must be single-channel (2-D). "
                         "For colour-coded masks use segmentation.mask_from_palette.")
    return arr.astype(np.int32)


def to_gray(img: np.ndarray) -> np.ndarray:
    """Luminance conversion (same weights as v2.1: 0.30, 0.56, 0.11)."""
    if img.ndim == 2:
        return img.astype(np.float64)
    rgb = img[..., :3].astype(np.float64)
    return rgb @ np.array([0.30, 0.56, 0.11])


# U-Net ZIPs contain images and a small manifest, all loaded into RAM by the reader.
_DATASET_ZIP_LIMIT = 2 * 1024**3
_DATASET_TOTAL_LIMIT = 1024**3
_DATASET_ENTRY_LIMIT = 256 * 1024**2
_DATASET_DIRECTORY_LIMIT = 16 * 1024**2
_DATASET_MANIFEST_LIMIT = 16 * 1024**2
_ZIP_END = Struct("<4s4H2IH")


def _dataset_entry_limit(name: str) -> int:
    return _DATASET_MANIFEST_LIMIT if name == "manifest.json" else _DATASET_ENTRY_LIMIT


def _check_dataset_zip_directory(file) -> int:
    size = file.seek(0, 2)
    if size > _DATASET_ZIP_LIMIT:
        raise ValueError("training ZIP exceeds the archive size limit")
    start = max(0, size - (65535 + _ZIP_END.size))
    file.seek(start)
    tail = file.read()
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0 or pos + _ZIP_END.size > len(tail):
        raise ValueError("invalid training ZIP directory")
    _, disk, dir_disk, disk_entries, count, length, offset, comment = _ZIP_END.unpack_from(tail, pos)
    if (pos + _ZIP_END.size + comment != len(tail) or disk or dir_disk or disk_entries != count or
            length > _DATASET_DIRECTORY_LIMIT or length < 46 * count or offset + length != start + pos):
        raise ValueError("invalid or oversized training ZIP directory")
    # Refuse ZIP64 here so zipfile cannot override the directory size checked above.
    if start + pos >= 20:
        file.seek(start + pos - 20)
        if file.read(4) == b"PK\x06\x07":
            raise ValueError("ZIP64 training archives are unsupported")
    return count


def _safe_zip_name(name: str) -> bool:
    return (not name.startswith("/") and "\\" not in name and "\x00" not in name and
            ":" not in name.split("/", 1)[0] and
            all(part not in ("", ".", "..") for part in name.removesuffix("/").split("/")))


@contextmanager
def open_training_export(path: str | Path):
    """Yield a bounded member reader for a U-Net ZIP or an unpacked training folder."""
    root = Path(path).resolve()
    if root.is_dir():
        consumed = 0

        def read_file(name):
            nonlocal consumed
            if not _safe_zip_name(name):
                raise ValueError("invalid training export member path")
            item = (root / name).resolve()
            if not item.is_relative_to(root):
                raise ValueError("training export member escapes its folder")
            if not item.is_file():
                raise ValueError(f"missing or invalid training export file: {name}")
            with item.open("rb") as file:
                size = file.seek(0, 2)
                if size > _dataset_entry_limit(name):
                    raise ValueError(f"training export member exceeds the size limit: {name}")
                consumed += size
                if consumed > _DATASET_TOTAL_LIMIT:
                    raise ValueError("training export reads exceed the size limit")
                file.seek(0)
                data = file.read(size + 1)
            if len(data) != size:
                raise ValueError(f"training export member size changed: {name}")
            return data

        yield read_file
        return

    with root.open("rb") as file:
        count = _check_dataset_zip_directory(file)
        with ZipFile(file) as archive:
            members = archive.infolist()
            if len(members) != count:
                raise ValueError("training ZIP directory entry count mismatch")
            entries, expanded = {}, 0
            for member in members:
                name = member.orig_filename
                if not _safe_zip_name(name) or name in entries or member.flag_bits & 0x41:
                    raise ValueError("invalid or duplicate training ZIP member")
                if member.compress_type not in (ZIP_STORED, ZIP_DEFLATED):
                    raise ValueError("unsupported training ZIP compression")
                if member.compress_type == ZIP_STORED and member.file_size != member.compress_size:
                    raise ValueError("invalid stored training ZIP member size")
                expanded += member.file_size
                if member.file_size > _dataset_entry_limit(name) or expanded > _DATASET_TOTAL_LIMIT:
                    raise ValueError("training ZIP uncompressed size exceeds the import limit")
                entries[name] = member

            consumed = 0

            def read_member(name):
                nonlocal consumed
                member = entries[name]
                consumed += member.file_size
                if consumed > _DATASET_TOTAL_LIMIT:
                    raise ValueError("training ZIP read exceeds the uncompressed size limit")
                with archive.open(member) as source:
                    # ZipExtFile enforces its declared size and checks the CRC while reading.
                    data = source.read(member.file_size + 1)
                if len(data) != member.file_size:
                    raise ValueError(f"training ZIP member size mismatch: {name}")
                return data

            yield read_member
