"""Acceptance must fail on either latency criterion or memory growth."""
import copy
import importlib
from pathlib import Path


def test_counterbalanced_summary_rejects_failed_latency_or_memory(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "tools"))
    benchmark = importlib.import_module("benchmark_counts")
    pair = {"kind": "measurement"}
    for mode, elapsed in (("default", 100), ("experimental", 70)):
        pair[mode] = {"peak_rss_mib": 100, "scenarios": [{"elapsed_ms": elapsed} for _ in range(2)]}
    pairs = [copy.deepcopy(pair) for _ in range(6)]
    assert benchmark.summarize_pairs(pairs)["accepted"]
    for p in pairs:
        p["experimental"]["scenarios"][1]["elapsed_ms"] = 81
    assert not benchmark.summarize_pairs(pairs)["accepted"]
    for p in pairs:
        p["experimental"]["scenarios"][1]["elapsed_ms"] = 70
        p["experimental"]["peak_rss_mib"] = 111
    assert not benchmark.summarize_pairs(pairs)["accepted"]
