"""Profile shared interval analysis on the edited M0.1 public and synthetic fixtures."""

from __future__ import annotations

import argparse
import cProfile
import hashlib
import json
import os
import pstats
import shutil
import subprocess
import sys
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter, process_time

import numpy as np
from benchmark import (
    ABS_TOL,
    CASES,
    ROOT,
    SAMPLE_SECONDS,
    TIMEOUT,
    browser_args,
    describe_environment,
    digest,
    make_synthetic,
    run_sample,
    source_metadata,
    unpack,
    verify_bins,
)
from benchmark_images import ImageServer, QuietHandler, application_provenance, normalised_hash, write_report

from sedcoretool import analyze_mask

DRIVER = ROOT / "tools/benchmark_analysis.mjs"
SOURCES = ("tools/benchmark_analysis.py", "tools/benchmark_analysis.mjs", "tools/benchmark_images.py")
BIN_CM = (2, 1.37)
METRICS = ("cold_ms", "cached_ms", "class_mapping_ms", "row_counts_ms", "bin_rows_ms", "elapsed_ms", "cpu_ms")


def provenance():
    result = application_provenance()
    result["tool_sha256"].update({name: normalised_hash((ROOT / name).read_bytes()) for name in SOURCES})
    return result


def prepare_inputs(snapshot):
    inputs = []
    for section in snapshot["sections"]:
        labels = unpack(section["labels"], section)
        if labels.size == 0 or labels.min() < 0 or labels.max() >= len(section["eff"]):
            raise ValueError("Analysis fixtures require nonoverlapping, mapped object labels")
        lookup = np.asarray(section["eff"], dtype=np.int32) + 1
        mask = lookup[labels]
        if mask.min() < 0 or mask.max() > len(snapshot["classes"]):
            raise ValueError("Effective class mapping is outside the fixture class list")
        inputs.append((mask, unpack(section["exclude"], section).astype(bool), section))
    return inputs


def analyze_inputs(inputs, snapshot, bin_cm):
    return [analyze_mask(mask, section["top"], section["bottom"], units=section["units"], bin_cm=bin_cm,
                         min_valid=snapshot["settings"]["minValid"], keep_partial=True,
                         class_names=snapshot["classes"], exclude=exclude, name=section["name"])
            for mask, exclude, section in inputs]


def result_bins(results, classes):
    columns = ["depth_top", "depth_bottom", "depth", "valid_pct", "bioturbation_pct",
               *(f"{name}_pct" for name in classes), "BI", "ii"]
    return [json.loads(result.data[columns].to_json(orient="values", double_precision=15)) for result in results]


def input_digest(inputs):
    hashed = hashlib.sha256()
    for mask, exclude, _ in inputs:
        hashed.update(mask.tobytes())
        hashed.update(exclude.tobytes())
    return hashed.hexdigest()


def profile_sites(profiler):
    sites = []
    for (filename, line, function), (primitive, calls, own, cumulative, _) in pstats.Stats(profiler).stats.items():
        path = Path(filename)
        try:
            source = path.resolve().relative_to(ROOT).as_posix()
        except ValueError:
            source = "/".join(path.parts[-3:]) if filename != "~" else "(native)"
        sites.append({"source": source, "line": line, "function": function, "primitive_calls": primitive,
                      "calls": calls, "self_ms": own * 1000, "cumulative_ms": cumulative * 1000})
    return sorted(sites, key=lambda site: site["self_ms"], reverse=True)


def python_worker(snapshot_file, profiled=False):
    snapshot = json.loads(snapshot_file.read_text(encoding="utf-8"))
    inputs = prepare_inputs(snapshot)
    before = input_digest(inputs)
    scenarios = []
    for bin_cm in BIN_CM:
        cpu_start, start = process_time(), perf_counter()
        results = analyze_inputs(inputs, snapshot, bin_cm)
        elapsed_ms, cpu_ms = (perf_counter() - start) * 1000, (process_time() - cpu_start) * 1000
        bins = result_bins(results, snapshot["classes"])
        sections = []
        for item in inputs:
            start = perf_counter()
            result = analyze_inputs([item], snapshot, bin_cm)
            sections.append({"name": item[2]["name"], "elapsed_ms": (perf_counter() - start) * 1000})
            if result_bins(result, snapshot["classes"])[0] != bins[len(sections) - 1]:
                raise ValueError("Per-section analysis changed results")
        scenario = {"bin_cm": bin_cm, "elapsed_ms": elapsed_ms, "cpu_ms": cpu_ms, "sections": sections, "bins": bins}
        if profiled:
            profiler = cProfile.Profile()
            passes = 5
            profiler.enable()
            for _ in range(passes):
                results = analyze_inputs(inputs, snapshot, bin_cm)
            profiler.disable()
            if result_bins(results, snapshot["classes"]) != bins:
                raise ValueError("Python profiling changed results")
            scenario["cpu"] = {"passes": passes, "sites": profile_sites(profiler)}
        scenarios.append(scenario)
    if input_digest(inputs) != before:
        raise ValueError("Python analysis changed the input masks")
    return {"workerPid": os.getpid(), "scenarios": scenarios, "inputs_unchanged": True}


def summarize(runs):
    import statistics

    measured = [run for run in runs if run["kind"] == "measurement"]
    summaries = []
    for index, bin_cm in enumerate(BIN_CM):
        metrics = {}
        for runtime, names in (("javascript", METRICS[:5]), ("python", METRICS[5:])):
            metrics[runtime] = {}
            for name in names:
                values = [run[runtime][index][name] for run in measured]
                metrics[runtime][name] = {"median": statistics.median(values), "min": min(values), "max": max(values)}
        summaries.append({"bin_cm": bin_cm, **metrics})
    memory = {}
    for name in ("browser_peak_rss_mib", "python_peak_rss_mib"):
        values = [run[name] for run in measured]
        memory[name] = {"median": statistics.median(values), "min": min(values), "max": max(values)}
    return {"scenarios": summaries, **memory}


def interval_differences(browser, python):
    """Keep scientific disagreements visible instead of relaxing the numerical tolerance."""
    differences = []
    for section, (js_rows, py_rows) in enumerate(zip(browser, python, strict=True)):
        if len(js_rows) != len(py_rows):
            differences.append({"section": section, "kind": "interval_count", "javascript": len(js_rows), "python": len(py_rows)})
        for row, (js, py) in enumerate(zip(js_rows, py_rows)):
            for column, (a, b) in enumerate(zip(js, py, strict=True)):
                equal = a == b if column >= len(js) - 2 or a is None or b is None else abs(a - b) <= ABS_TOL
                if not equal:
                    differences.append({"section": section, "interval": row, "column": column,
                                        "javascript": a, "python": b})
    return differences


def validate_results(browser, python, reference=None, *, diagnose_fractional=False):
    if [scenario["bin_cm"] for scenario in browser["scenarios"]] != list(BIN_CM):
        raise ValueError("Unexpected JavaScript interval settings")
    if [scenario["bin_cm"] for scenario in python["scenarios"]] != list(BIN_CM):
        raise ValueError("Unexpected Python interval settings")
    if not browser["inputs_unchanged"] or not python["inputs_unchanged"]:
        raise ValueError("Analysis did not preserve inputs")
    fingerprints, parity = [], []
    for js, py in zip(browser["scenarios"], python["scenarios"], strict=True):
        try:
            parity.append({"passed": True, **verify_bins(js["bins"], py["bins"])})
        except ValueError as error:
            if not diagnose_fractional or js["bin_cm"] != 1.37:
                raise
            parity.append({"passed": False, "first_error": str(error),
                           "differences": interval_differences(js["bins"], py["bins"]),
                           "javascript_bins": js["bins"], "python_bins": py["bins"]})
        fingerprints.append(digest(json.dumps(js["bins"], separators=(",", ":")).encode()))
    if reference is not None and fingerprints != reference:
        raise ValueError("JavaScript interval results changed between trials")
    return fingerprints, parity


def measure_case(case, args, url, workspace):
    directory = workspace / case
    directory.mkdir()
    seed, fixture = directory / "seed", directory / "synthetic.sedcoretool"
    print(f"Preparing edited M0.1 fixture: {case}", file=sys.stderr, flush=True)
    if case == "synthetic":
        make_synthetic(fixture)
    subprocess.check_output(browser_args("prepare", url, seed, args.chrome, case, fixture), cwd=ROOT, timeout=TIMEOUT)
    # The original driver performs the ordinary deletion/autosave and verifies the persisted edit after reload.
    setup = json.loads(subprocess.check_output(browser_args("measure", url, seed, args.chrome, case, "snapshot"),
                                              cwd=ROOT, timeout=TIMEOUT))
    snapshot_file = directory / "analysis-input.json"
    snapshot = setup.pop("snapshot")
    snapshot_file.write_text(json.dumps(snapshot, separators=(",", ":")), encoding="utf-8")
    baseline = json.loads((ROOT / "docs/benchmarks/M0.1-v0.94-clean-2026-11-10.json").read_text(encoding="utf-8"))
    baseline_case = next(item for item in baseline["cases"] if item["case"] == case)
    baseline_hash = digest(json.dumps(setup["bins"], separators=(",", ":")).encode())
    if baseline_hash != baseline_case["browser_intervals_sha256"]:
        raise ValueError("The edited fixture no longer matches the accepted M0.1 interval results")
    runs, reference, python_reference, cpu = [], None, None, None
    for index in range(args.warmups + args.repetitions + 1):
        profiled = index == args.warmups + args.repetitions
        mode = "profile" if profiled else "measure"
        with tempfile.TemporaryDirectory(prefix="analysis-trial-", dir=directory) as temp:
            profile = Path(temp) / "profile"
            shutil.copytree(seed, profile)
            browser, browser_peak, browser_samples = run_sample(
                ["node", str(DRIVER), url, str(profile), args.chrome, str(snapshot_file), mode], browser_tree=True)
        python, python_peak, python_samples = run_sample(
            [sys.executable, __file__, "--python-worker", str(snapshot_file), *( ["--profile"] if profiled else [])])
        fingerprints, parity = validate_results(browser, python, reference, diagnose_fractional=True)
        python_fingerprints = [digest(json.dumps(item["bins"], separators=(",", ":")).encode()) for item in python["scenarios"]]
        if python_reference is not None and python_fingerprints != python_reference:
            raise ValueError("Python interval results changed between trials")
        if reference is None:
            reference = fingerprints
            python_reference = python_fingerprints
            if reference[0] != baseline_hash:
                raise ValueError("Analysis did not reproduce the M0.1 setup results")
        if profiled:
            cpu = {runtime: [{"bin_cm": item["bin_cm"], **item["cpu"]} for item in result["scenarios"]]
                   for runtime, result in (("javascript", browser), ("python", python))}
            break
        for result in (browser, python):
            for scenario in result["scenarios"]:
                del scenario["bins"]
        entry = {"kind": "warmup" if index < args.warmups else "measurement",
                 "javascript": browser["scenarios"], "python": python["scenarios"], "parity": parity,
                 "inputs_unchanged": True, "browser_peak_rss_mib": browser_peak, "python_peak_rss_mib": python_peak,
                 "browser_rss_samples": browser_samples, "python_rss_samples": python_samples}
        runs.append(entry)
        print(f"{case} {entry['kind']} {index + 1}: JS cold {browser['scenarios'][0]['cold_ms']:.1f} ms, "
              f"cached {browser['scenarios'][0]['cached_ms']:.3f} ms; Python {python['scenarios'][0]['elapsed_ms']:.1f} ms",
              file=sys.stderr, flush=True)
    return {"case": case, "seed": 138501 if case == "synthetic" else None,
            "package_sha256": digest(fixture.read_bytes()) if case == "synthetic" else None,
            "analysis_input_sha256": digest(snapshot_file.read_bytes()), "interval_sha256": reference,
            "python_interval_sha256": python_reference,
            "scientific_parity_passed": all(item["passed"] for run in runs for item in run["parity"]),
            "accepted_m01_baseline_intervals_match": True,
            "m01_analysis_input_matches": digest(snapshot_file.read_bytes()) == baseline_case["analysis_input_sha256"],
            "classes": snapshot["classes"], "settings": snapshot["settings"],
            "sections": [{k: v for k, v in section.items() if k not in {"labels", "exclude", "stacks", "eff"}}
                         for section in snapshot["sections"]],
            "deleted_trace": {key: setup[key] for key in ("id", "bbox", "count")}, "setup_reload_verified": True,
            "runtimes": {key: browser[key] for key in ("chrome", "node", "puppeteer")},
            "verified_trials": len(runs) + 1, "runs": runs, "summary": summarize(runs), "cpu": cpu}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", default=os.getenv("CHROME"))
    parser.add_argument("--case", choices=("all", *CASES), default="all")
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workspace", type=Path)
    args = parser.parse_args()
    if min(args.warmups, args.repetitions) < 1:
        parser.error("warmups and repetitions must be positive")
    args.chrome = args.chrome or shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chrome")
    if not args.chrome:
        parser.error("Set --chrome to Chrome or Chromium")
    args.chrome = str(Path(args.chrome).resolve(strict=True))
    initial = provenance()
    report = {"started_utc": datetime.now(timezone.utc).isoformat(), "application": initial,
              "source": source_metadata(SOURCES), "environment": describe_environment(),
              "warmups": args.warmups, "repetitions": args.repetitions, "absolute_tolerance": ABS_TOL,
              "bin_cm": BIN_CM, "rss_poll_target_ms": SAMPLE_SECONDS * 1000, "complete": False, "cases": []}
    if args.workspace:
        args.workspace = args.workspace.resolve()
        args.workspace.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sedcoretool-analysis-", dir=args.workspace) as temp:
        with ImageServer(("127.0.0.1", 0), QuietHandler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/app/index.html"
                for case in CASES if args.case == "all" else (args.case,):
                    report["cases"].append(measure_case(case, args, url, Path(temp)))
                    write_report(args.output, report)
            finally:
                server.shutdown()
                thread.join()
    if provenance() != initial:
        raise RuntimeError("Application or benchmark source changed during measurement")
    report["complete"] = True
    report["scientific_parity_passed"] = all(case["scientific_parity_passed"] for case in report["cases"])
    write_report(args.output, report)


if __name__ == "__main__":
    if "--python-worker" in sys.argv:
        print(json.dumps(python_worker(Path(sys.argv[sys.argv.index("--python-worker") + 1]), "--profile" in sys.argv)))
    else:
        main()
