"""Semi-quantitative bioturbation indices derived from percentage.

Schemes are data, so users can add or modify them without touching code.
Each tier is a half-open interval [lower, upper) in percent. Where tiers overlap the last declared tier wins in this
public API; the classification itself is ``kernels.classification`` (the desktop program uses the first-match rule).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property

import numpy as np

from .kernels.classification import TierTable


@dataclass(frozen=True)
class IndexScheme:
    name: str
    tiers: tuple[tuple[float, float, int], ...]  # (lower, upper, value)
    reference: str = ""

    @cached_property
    def _table(self) -> TierTable:
        return TierTable(self.tiers, precedence="last")

    def classify(self, percentage: np.ndarray) -> np.ndarray:
        return self._table.classify(percentage)


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
