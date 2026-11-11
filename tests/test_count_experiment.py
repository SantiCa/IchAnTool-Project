"""Exact public API equivalence for bounded experimental label histograms."""
import numpy as np
import pandas as pd
import pytest

from sedcoretool import IndexScheme, analyze_mask


@pytest.mark.parametrize("overlap", [False, True])
def test_experimental_counts_preserve_complete_results(monkeypatch, overlap):
    rng = np.random.default_rng(138501)
    mask = rng.integers(0, 4, (137, 79), dtype=np.uint8)
    if overlap:
        mask = np.stack([mask == 1, mask > 1, mask == 3])
    exclude = rng.random((137, 79)) < .25
    schemes = (IndexScheme("custom", ((0, 100, 1), (30, 60, 7))),)
    for bin_px in (1, 12.5, 200):
        monkeypatch.delenv("SEDCORETOOL_EXPERIMENTAL_COUNTS", raising=False)
        old = analyze_mask(mask, 1.5, 2.99, bin_px=bin_px, exclude=exclude, schemes=schemes,
                           class_names=["a", "b", "c", "absent"] if not overlap else None)
        monkeypatch.setenv("SEDCORETOOL_EXPERIMENTAL_COUNTS", "1")
        new = analyze_mask(mask, 1.5, 2.99, bin_px=bin_px, exclude=exclude, schemes=schemes,
                           class_names=["a", "b", "c", "absent"] if not overlap else None)
        pd.testing.assert_frame_equal(old.data, new.data, check_exact=True)
