"""Classification of percentages into index values by half-open tiers ``[lower, upper)``."""

from __future__ import annotations

from collections.abc import Sequence
from heapq import heappop, heappush

import numpy as np

PRECEDENCE = ("first", "last")


class TierTable:
    """Compiled tiers. Where tiers overlap, ``precedence`` decides: ``"first"`` keeps the earliest declared tier (the
    desktop program, ``app/js/core.js::classify``), ``"last"`` the latest (the public Python ``IndexScheme``).

    Tiers with ``lower >= upper`` are ignored. A percentage that is NaN, below every tier or in a gap gets -1.
    """

    def __init__(self, tiers: Sequence[tuple[float, float, int]], precedence: str = "last"):
        if precedence not in PRECEDENCE:
            raise ValueError(f"precedence must be one of {PRECEDENCE}, not {precedence!r}")
        # Sweep the bounds once; ``priority`` makes the wanted tier the smallest heap item.
        sign = -1 if precedence == "last" else 1
        starts = sorted((lo, i, hi, value) for i, (lo, hi, value) in enumerate(tiers) if lo < hi)
        self.edges = np.array(sorted({edge for lo, _, hi, _ in starts for edge in (lo, hi)}), dtype=float)
        self.classes = np.full(self.edges.size + 1, -1, dtype=int)
        active: list[tuple[int, float, int]] = []
        next_start = 0
        for j, edge in enumerate(self.edges, 1):
            while next_start < len(starts) and starts[next_start][0] <= edge:
                _, order, hi, value = starts[next_start]
                heappush(active, (sign * order, hi, value))
                next_start += 1
            while active and active[0][1] <= edge:
                heappop(active)
            if active:
                self.classes[j] = active[0][2]
        self._dense = self._dense_lookup()

    def _dense_lookup(self) -> np.ndarray | None:
        """Table for integer-edged tiers within [0, 256]; None when the tiers do not allow it."""
        edges = self.edges
        if not edges.size or edges[0] < 0 or edges[-1] > 256 or np.any(edges != np.floor(edges)):
            return None
        samples = np.arange(int(edges[-1]) + 1)
        return np.r_[self.classes[np.searchsorted(edges, samples, side="right")], -1]

    def classify(self, percentage) -> np.ndarray:
        p = np.asarray(percentage, dtype=float)
        lookup = self._dense
        if lookup is None:
            return np.asarray(self.classes[np.searchsorted(self.edges, p, side="right")])
        # NaN and negative percentages use the sentinel at index -1.
        samples = np.empty_like(p)
        np.fmax(p, -1, out=samples)
        np.minimum(samples, lookup.size - 2, out=samples)
        np.floor(samples, out=samples)
        return np.asarray(lookup[samples.astype(np.intp)])


def classify_tiers(percentage, tiers: Sequence[tuple[float, float, int]], precedence: str = "last") -> np.ndarray:
    """One-off classification; build a ``TierTable`` once when classifying many arrays with the same tiers."""
    return TierTable(tiers, precedence).classify(percentage)
