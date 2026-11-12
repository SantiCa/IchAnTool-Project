"""Building label masks from treated images.

A label mask is a 2-D integer array: 0 = non-bioturbated matrix,
1..n = bioturbation classes (e.g. ichnotaxa).

Current methods reproduce the published workflow (features painted on
the image). Future learned segmenters (e.g. U-Net) should expose the
same output: ``(mask, class_names)``.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

import numpy as np

from .io import to_gray


def mask_from_threshold(img: np.ndarray, threshold: float = 5,
                        class_name: str = "bioturbation") -> tuple[np.ndarray, list[str]]:
    """Binary mask: pixels with gray value <= threshold are bioturbation.

    This is the v2.1 behaviour (features painted black, threshold 5).
    """
    mask = (to_gray(img) <= threshold).astype(np.int32)
    return mask, [class_name]


def _hex_to_rgb(color: str | Sequence[int]) -> np.ndarray:
    if isinstance(color, str):
        c = color.strip().removeprefix("#")
        if not re.fullmatch(r"[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?", c):
            raise ValueError("expected 3 or 6 hexadecimal digits with an optional leading '#'; "
                             "only surrounding whitespace is allowed")
        if len(c) == 3:
            c = "".join(digit * 2 for digit in c)
        return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.int32)
    return np.asarray(color[:3], dtype=np.int32)


def mask_from_palette(img: np.ndarray, palette: Mapping[str, str | Sequence[int]],
                      tolerance: int = 10) -> tuple[np.ndarray, list[str]]:
    """Multi-class mask from a colour-coded image.

    palette: {"Zoophycos": "#ff0000", "Chondrites": (0, 0, 255), ...}
    Hex colours accept 3 or 6 digits, optional '#', either case and surrounding
    whitespace. Short form '#abc' means '#aabbcc'. RGB sequences retain their
    existing first-three-channel interpretation.
    A pixel belongs to a class when every RGB channel is within
    ``tolerance`` of the class colour. Unmatched pixels are background.
    """
    if img.ndim != 3:
        raise ValueError("Palette masks need an RGB image.")
    rgb = img[..., :3].astype(np.int32)
    mask = np.zeros(rgb.shape[:2], dtype=np.int32)
    names = list(palette)
    for label, name in enumerate(names, start=1):
        try:
            ref = _hex_to_rgb(palette[name])
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError(f"Invalid colour for palette class {name!r}: {error}") from error
        hit = np.all(np.abs(rgb - ref) <= tolerance, axis=-1) & (mask == 0)
        mask[hit] = label
    return mask, names


def mask_from_unet(img: np.ndarray, model, px_per_cm: float | None = None,
                   threshold: float = 0.5, *, cpu_only: bool = False) -> tuple[np.ndarray, list[str]]:
    """Label mask from a trained U-Net (V0.15).

    ``model``: path to the .onnx file (its .json next to it) or an ``sedcoretool.unet.predict.OnnxUnet``.
    ``px_per_cm`` of the image, so it is resampled to the training resolution. Pixels with probability of
    bioturbation >= ``threshold`` get class 1 (binary model) or the most probable class (multi-class model).
    ``cpu_only`` enforces CPU execution even for a caller-configured ONNX session.
    """
    from .unet.predict import OnnxUnet

    net = model if isinstance(model, OnnxUnet) else OnnxUnet(model)
    rgb = img if img.ndim == 3 else np.repeat(img[..., None], 3, axis=2)
    kwargs = {"cpu_only": True} if cpu_only else {}
    prob, cls = net.predict(rgb[..., :3].astype(np.uint8), px_per_cm, **kwargs)
    on = prob >= threshold
    mask = np.where(on, cls if cls is not None else 1, 0).astype(np.int32)
    return mask, list(net.config.classes)
