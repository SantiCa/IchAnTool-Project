"""Linear interpolation of an age model."""

from __future__ import annotations

import numpy as np


def interpolate_age(depth, model_depth, model_age, extrapolate: bool = False) -> np.ndarray:
    """Age at each depth by linear interpolation; NaN outside the model unless ``extrapolate`` is True.

    ``model_depth`` must be finite and strictly increasing and ``model_age`` finite and as long; callers validate and
    sort (``depth.depth_to_age`` does for the public API). Both ends of the model belong to it. A model with one point
    gives its age at exactly that depth; an empty model gives NaN everywhere. Extrapolation continues the first and
    last segment and needs at least two points.
    """
    d = np.asarray(depth, dtype=float)
    md = np.asarray(model_depth, dtype=float)
    ma = np.asarray(model_age, dtype=float)
    if md.size == 0:
        return np.full(d.shape, np.nan)
    if md.size == 1:
        return np.where(d == md[0], ma[0], np.nan)
    age = np.interp(d, md, ma)
    if extrapolate:
        lo = (ma[1] - ma[0]) / (md[1] - md[0])
        hi = (ma[-1] - ma[-2]) / (md[-1] - md[-2])
        age = np.where(d < md[0], ma[0] + (d - md[0]) * lo, age)
        return np.where(d > md[-1], ma[-1] + (d - md[-1]) * hi, age)
    return np.where((d < md[0]) | (d > md[-1]), np.nan, age)
