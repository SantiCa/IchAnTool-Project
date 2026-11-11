"""Exact public API equivalence for bounded experimental label histograms."""
import numpy as np
import pandas as pd
import pytest

from sedcoretool import IndexScheme, analyze_mask
from sedcoretool.pipeline import _label_row_counts


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


@pytest.mark.parametrize("shape,classes", [((145, 79), 4), ((3, 70001), 255), ((65, 1), 0), ((3, 0), 2)])
def test_multirow_histogram_exact_counts_and_scratch_bound(monkeypatch, shape, classes):
    rng = np.random.default_rng(138501)
    # Reverse-strided inputs must not require full-image contiguous copies.
    mask = rng.integers(0, classes + 1, shape, dtype=np.uint16)[:, ::-1]
    valid = (rng.random(shape) > .3)[:, ::-1]
    saved_mask, saved_valid = mask.copy(), valid.copy()
    original = np.bincount
    calls = []

    def bounded(keys, *, minlength):
        calls.append((keys.size, minlength))
        assert keys.size <= 65536
        assert minlength <= 64 * (classes + 1)
        return original(keys, minlength=minlength)

    monkeypatch.setattr(np, "bincount", bounded)
    actual = _label_row_counts(mask, valid, classes)
    expected = np.stack([((mask == label) & valid).sum(axis=1) for label in range(classes + 1)], axis=1)
    np.testing.assert_array_equal(actual, expected)
    np.testing.assert_array_equal(mask, saved_mask)
    np.testing.assert_array_equal(valid, saved_valid)
    assert actual.dtype == np.int64
    if shape == (145, 79):
        assert len(calls) == 3


def test_fully_excluded_bins_keep_missing_values_in_experiment(monkeypatch):
    mask = np.ones((66, 9), dtype=bool)
    exclude = np.ones_like(mask)
    monkeypatch.delenv("SEDCORETOOL_EXPERIMENTAL_COUNTS", raising=False)
    expected = analyze_mask(mask, 0, 66, exclude=exclude, bin_px=12.5)
    monkeypatch.setenv("SEDCORETOOL_EXPERIMENTAL_COUNTS", "1")
    actual = analyze_mask(mask, 0, 66, exclude=exclude, bin_px=12.5)
    pd.testing.assert_frame_equal(actual.data, expected.data, check_exact=True)
