"""Semi-quantitative bioturbation indices derived from percentage.

Schemes are data, so users can add or modify them without touching code.
Each tier is a half-open interval [lower, upper) in percent.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from heapq import heappop, heappush

import numpy as np


@dataclass(frozen=True)
class IndexScheme:
    name: str
    tiers: tuple[tuple[float, float, int], ...]  # (lower, upper, value)
    reference: str = ""

    @cached_property
    def _partition(self) -> tuple[np.ndarray, np.ndarray]:
        # Sweep the bounds once. The last declared tier wins on overlaps.
        starts = sorted((lo, i, hi, value) for i, (lo, hi, value) in enumerate(self.tiers) if lo < hi)
        edges = np.array(sorted({edge for lo, _, hi, _ in starts for edge in (lo, hi)}), dtype=float)
        classes = np.full(edges.size + 1, -1, dtype=int)
        active: list[tuple[int, float, int]] = []
        next_start = 0
        for j, edge in enumerate(edges, 1):
            while next_start < len(starts) and starts[next_start][0] <= edge:
                _, order, hi, value = starts[next_start]
                heappush(active, (-order, hi, value))
                next_start += 1
            while active and active[0][1] <= edge:
                heappop(active)
            if active:
                classes[j] = active[0][2]
        return edges, classes

    @cached_property
    def _dense_lookup(self) -> np.ndarray | None:
        edges, classes = self._partition
        if not edges.size or edges[0] < 0 or edges[-1] > 256 or np.any(edges != np.floor(edges)):
            return None
        samples = np.arange(int(edges[-1]) + 1)
        return np.r_[classes[np.searchsorted(edges, samples, side="right")], -1]

    def classify(self, percentage: np.ndarray) -> np.ndarray:
        p = np.asarray(percentage, dtype=float)
        lookup = self._dense_lookup
        if lookup is None:
            edges, classes = self._partition
            return np.asarray(classes[np.searchsorted(edges, p, side="right")])

        # NaN and negative percentages use the sentinel at index -1.
        samples = np.empty_like(p)
        np.fmax(p, -1, out=samples)
        np.minimum(samples, lookup.size - 2, out=samples)
        np.floor(samples, out=samples)
        return np.asarray(lookup[samples.astype(np.intp)])


# Tiers identical to IchAnTool v2.1 (legacy/v2.1_console).
BI_TAYLOR_GOLDRING = IndexScheme(
    name="BI",
    tiers=((0, 1, 0), (1, 5, 1), (5, 31, 2), (31, 61, 3), (61, 91, 4), (91, 100, 5), (100, 101, 6)),
    reference="Reineck (1963); Taylor & Goldring (1993)",
)

II_DROSER_BOTTJER = IndexScheme(
    name="ii",
    tiers=((0, 1, 1), (1, 10, 2), (10, 40, 3), (40, 60, 4), (60, 100, 5), (100, 101, 6)),
    reference="Droser & Bottjer (1986)",
)

DEFAULT_SCHEMES = (BI_TAYLOR_GOLDRING, II_DROSER_BOTTJER)
