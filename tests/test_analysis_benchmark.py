"""Scientific equivalence and rejection boundaries of the analysis profiling harness."""

import copy
import importlib
import json
from pathlib import Path

import numpy as np
import pytest


@pytest.fixture(scope="module")
def analysis_benchmark():
    with pytest.MonkeyPatch.context() as patch:
        patch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "tools"))
        return importlib.import_module("benchmark_analysis")


@pytest.fixture
def snapshot(analysis_benchmark):
    from benchmark import rle

    labels = np.full((6, 6), 2, dtype=np.int32)
    labels[1:5, 1:5] = [[1, 0, 3, 2], [1, 2, 0, 0], [0, 0, 0, 0], [2, 2, 2, 2]]
    exclude = np.zeros((6, 6), dtype=np.uint8)
    exclude[3:5, 1:5] = 1
    return {"classes": ["a", "b"], "settings": {"binCm": 2, "minValid": 0.2, "noDataPad": 0},
            "sections": [{"name": "cropped", "w": 6, "h": 6, "top": 0, "bottom": 4, "units": "cm",
                          "roi": {"x0": 1, "x1": 5, "y0": 1, "y1": 5},
                          "eff": [-1, 0, 1, -1], "labels": rle(labels), "exclude": rle(exclude)}]}


def test_worker_profiles_the_public_api_with_cropped_classes_exclusions_and_partial_bins(analysis_benchmark, snapshot, tmp_path):
    path = tmp_path / "snapshot.json"
    path.write_text(json.dumps(snapshot), encoding="utf-8")
    before = path.read_bytes()
    result = analysis_benchmark.python_worker(path, profiled=True)
    assert result["inputs_unchanged"] and path.read_bytes() == before
    normal, fractional = result["scenarios"]
    assert normal["bins"] == [[[0, 2, 1, 100, 50, 25, 25, 3, 4], [2, 4, 3, 0, None, None, None, None, None]]]
    assert fractional["bins"] == [[[0, 1, 0.5, 100, 50, 25, 25, 3, 4],
                                    [1, 3, 2, 50, 50, 25, 25, 3, 4],
                                    [3, 4, 3.5, 0, None, None, None, None, None]]]
    for scenario in result["scenarios"]:
        calls = [site for site in scenario["cpu"]["sites"] if site["function"] == "analyze_mask"]
        assert len(calls) == 1 and calls[0]["calls"] == scenario["cpu"]["passes"] == 5


@pytest.mark.parametrize("labels", [[-1, 36], [4, 36]])
def test_unmapped_or_overlapping_fixture_labels_fail_before_remapping(analysis_benchmark, snapshot, labels):
    snapshot["sections"][0]["labels"] = labels
    with pytest.raises(ValueError, match="mapped object labels"):
        analysis_benchmark.prepare_inputs(snapshot)


def test_result_validation_rejects_wrong_indices_and_changed_repetitions(analysis_benchmark):
    bins = [[[0, 2, 1, 100, 50, 25, 25, 3, 3]]]
    result = {"scenarios": [{"bin_cm": size, "bins": bins} for size in analysis_benchmark.BIN_CM], "inputs_unchanged": True}
    reference, _ = analysis_benchmark.validate_results(result, copy.deepcopy(result))
    wrong_index = copy.deepcopy(result)
    wrong_index["scenarios"][0]["bins"][0][0][-1] = 4
    with pytest.raises(ValueError, match="BI/ii differ"):
        analysis_benchmark.validate_results(result, wrong_index)
    different_results = copy.deepcopy(result)
    different_results["scenarios"][0]["bins"][0][0][4] += 1
    with pytest.raises(ValueError, match="between trials"):
        analysis_benchmark.validate_results(different_results, copy.deepcopy(different_results), reference)
    roundoff = copy.deepcopy(result)
    roundoff["scenarios"][0]["bins"][0][0][4] += 1e-10
    analysis_benchmark.validate_results(result, roundoff)
    roundoff["scenarios"][0]["bins"][0][0][4] += 1e-6
    with pytest.raises(ValueError, match="Numerical mismatch"):
        analysis_benchmark.validate_results(result, roundoff)


def test_fractional_diagnostics_preserve_failed_parity_and_full_evidence(analysis_benchmark):
    bins = [[[0, 1, 0.5, 100, 50, 25, 25, 3, 4]]]
    browser = {"scenarios": [{"bin_cm": size, "bins": copy.deepcopy(bins)} for size in analysis_benchmark.BIN_CM],
               "inputs_unchanged": True}
    python = copy.deepcopy(browser)
    python["scenarios"][1]["bins"][0][0][1] = 2
    _, parity = analysis_benchmark.validate_results(browser, python, diagnose_fractional=True)
    assert parity[0]["passed"] is True and parity[1]["passed"] is False
    assert parity[1]["differences"] == [{"section": 0, "interval": 0, "column": 1, "javascript": 1, "python": 2}]
    assert parity[1]["javascript_bins"] == bins
    assert parity[1]["python_bins"] == python["scenarios"][1]["bins"]
    python["scenarios"][0]["bins"][0][0][1] = 2
    with pytest.raises(ValueError, match="Numerical mismatch"):
        analysis_benchmark.validate_results(browser, python, diagnose_fractional=True)
