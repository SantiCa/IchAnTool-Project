"""Core analysis: label mask -> continuous series per depth bin."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .depth import depth_to_age, pixel_depths
from .indices import DEFAULT_SCHEMES, IndexScheme
from .io import load_image
from .segmentation import mask_from_threshold


@dataclass
class CoreSection:
    """Result for one core section. ``data`` has one row per depth bin."""
    name: str
    top: float
    bottom: float
    units: str
    bin_px: int
    class_names: list[str]
    data: pd.DataFrame
    metadata: dict = field(default_factory=dict)

    def add_age(self, model_depth, model_age, extrapolate: bool = False) -> "CoreSection":
        self.data["age"] = depth_to_age(self.data["depth"], model_depth, model_age, extrapolate)
        return self


def _binned_mean(values: np.ndarray, bin_px: int, keep_partial: bool) -> np.ndarray:
    n = values.shape[0]
    full = n // bin_px
    out = values[: full * bin_px].reshape(full, bin_px, *values.shape[1:]).mean(axis=1)
    if keep_partial and n % bin_px:
        out = np.concatenate([out, values[full * bin_px:].mean(axis=0, keepdims=True)])
    return out


def analyze_mask(mask: np.ndarray, top: float, bottom: float, *, units: str = "cm",
                 bin_px: int = 1, class_names: Sequence[str] | None = None,
                 schemes: Sequence[IndexScheme] = DEFAULT_SCHEMES,
                 keep_partial: bool = True, name: str = "section_1") -> CoreSection:
    """Compute bioturbation percentage (total and per class) along depth.

    mask: 2-D int array, 0 = matrix, 1..n = bioturbation classes; row 0 = top.
    bin_px: number of pixel rows averaged into each data point.
    """
    mask = np.asarray(mask)
    if mask.ndim != 2:
        raise ValueError("mask must be 2-D")
    if bin_px < 1:
        raise ValueError("bin_px must be >= 1")
    n_rows, n_cols = mask.shape
    n_classes = int(mask.max()) if mask.size else 0
    names = list(class_names) if class_names else [f"class_{i}" for i in range(1, n_classes + 1)]
    if len(names) < n_classes:
        raise ValueError("fewer class_names than classes present in the mask")

    row_total = (mask > 0).mean(axis=1) * 100
    depths = pixel_depths(n_rows, top, bottom)

    cols = {
        "depth": _binned_mean(depths, bin_px, keep_partial),
        "bioturbation_pct": _binned_mean(row_total, bin_px, keep_partial),
    }
    if len(names) > 1:
        for label, cname in enumerate(names, start=1):
            row_c = (mask == label).mean(axis=1) * 100
            cols[f"{cname}_pct"] = _binned_mean(row_c, bin_px, keep_partial)
    df = pd.DataFrame(cols)
    for scheme in schemes:
        df[scheme.name] = scheme.classify(df["bioturbation_pct"].to_numpy())
    df.insert(0, "section", name)

    return CoreSection(name=name, top=top, bottom=bottom, units=units, bin_px=bin_px,
                       class_names=names, data=df,
                       metadata={"image_rows": n_rows, "image_cols": n_cols,
                                 "px_per_unit": n_rows / (bottom - top)})


def analyze_image(path, top: float, bottom: float, *, threshold: float = 5, **kwargs) -> CoreSection:
    """v2.1-compatible entry point: treated image with bioturbation painted black."""
    mask, names = mask_from_threshold(load_image(path), threshold)
    return analyze_mask(mask, top, bottom, class_names=names, **kwargs)
