"""Strict, closed-field checks shared by method ``parse`` functions. Every failure raises ``MethodError`` naming the field."""

from __future__ import annotations

import math

import numpy as np

from .errors import MethodError

MAX_RECORDS = 65536
MAX_TEXT = 4096
INT32 = (-(2 ** 31), 2 ** 31 - 1)


def fail(code: str, field: str):
    raise MethodError(code, field)


def integer(value, field: str, low: int | None = None, high: int | None = None, code: str = "INVALID_REQUEST") -> int:
    """An int (not a bool) within ``[low, high]``."""
    if type(value) is not int or (low is not None and value < low) or (high is not None and value > high):
        fail(code, field)
    return value


def number(value, field: str, low: float | None = None, high: float | None = None, *, strict_low: bool = False) -> float:
    """A finite int or float (not a bool); ``strict_low`` excludes the lower bound itself."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail("INVALID_REQUEST", field)
    if (low is not None and (value <= low if strict_low else value < low)) or (high is not None and value > high):
        fail("INVALID_REQUEST", field)
    return value


def boolean(value, field: str) -> bool:
    if type(value) is not bool:
        fail("INVALID_REQUEST", field)
    return value


def text(value, field: str, *, empty: bool = False) -> str:
    if not isinstance(value, str) or (not empty and not value) or len(value.encode("utf-8", "surrogatepass")) > MAX_TEXT:
        fail("INVALID_REQUEST", field)
    return value


def record(value, fields: tuple[str, ...], field: str) -> dict:
    """A dict with exactly ``fields``: an unknown or missing member is rejected, never ignored."""
    if not isinstance(value, dict) or set(value) != set(fields):
        fail("INVALID_REQUEST", field)
    return value


def records(value, field: str) -> list:
    if not isinstance(value, list) or len(value) > MAX_RECORDS:
        fail("INVALID_REQUEST", field)
    return value


def buffer(value, field: str, dtype: str, ndim: int) -> np.ndarray:
    """A NumPy array of exactly ``dtype`` (for example ``"<i4"``) and ``ndim`` dimensions, all of positive length."""
    if not isinstance(value, np.ndarray) or value.dtype != np.dtype(dtype) or value.ndim != ndim or 0 in value.shape:
        fail("INVALID_BUFFER", field)
    return value
