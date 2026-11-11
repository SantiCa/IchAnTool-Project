"""Counterbalanced public-API comparison of default and multi-row Python counts."""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

from benchmark import CASES, ROOT, TIMEOUT, browser_args, describe_environment, digest, make_synthetic, run_sample
from benchmark_analysis import DRIVER, provenance, python_worker, validate_results
from benchmark_images import ImageServer, QuietHandler, normalised_hash, write_report

FLAG = "SEDCORETOOL_EXPERIMENTAL_COUNTS"


def fingerprints(result):
    return [digest(json.dumps(s["bins"], separators=(",", ":")).encode()) for s in result["scenarios"]]


def summarize_pairs(pairs):
    measured = [p for p in pairs if p["kind"] == "measurement"]
    scenarios = []
    for index, size in enumerate((2, 1.37)):
        modes = {}
        for mode in ("default", "experimental"):
            values = [p[mode]["scenarios"][index]["elapsed_ms"] for p in measured]
            modes[mode] = dict(median=statistics.median(values), min=min(values), max=max(values))
        ratios = [p["experimental"]["scenarios"][index]["elapsed_ms"] /
                  p["default"]["scenarios"][index]["elapsed_ms"] for p in measured]
        ratio = modes["experimental"]["median"] / modes["default"]["median"]
        scenarios.append(dict(bin_cm=size, **modes, median_ratio=ratio, paired_ratios=ratios,
                              paired_median_ratio=statistics.median(ratios),
                              latency_passed=ratio <= .8 and statistics.median(ratios) <= .8))
    memory = {mode: statistics.median(p[mode]["peak_rss_mib"] for p in measured)
              for mode in ("default", "experimental")}
    memory_ratio = memory["experimental"] / memory["default"]
    return dict(scenarios=scenarios, median_peak_rss_mib=memory, memory_ratio=memory_ratio,
                memory_passed=memory_ratio <= 1.1,
                accepted=memory_ratio <= 1.1 and all(s["latency_passed"] for s in scenarios))


def measure_case(case, args, url, directory):
    directory.mkdir()
    seed, fixture = directory / "seed", directory / "synthetic.sedcoretool"
    print(f"Preparing {case}", file=sys.stderr, flush=True)
    if case == "synthetic":
        make_synthetic(fixture)
    subprocess.check_output(browser_args("prepare", url, seed, args.chrome, case, fixture), cwd=ROOT, timeout=TIMEOUT)
    setup = json.loads(subprocess.check_output(browser_args("measure", url, seed, args.chrome, case, "snapshot"),
                                              cwd=ROOT, timeout=TIMEOUT))
    snapshot = directory / "analysis-input.json"
    snapshot.write_text(json.dumps(setup.pop("snapshot"), separators=(",", ":")), encoding="utf-8")
    reference = json.loads((ROOT / "docs/benchmarks/M3.1.3-v0.121.json").read_text(encoding="utf-8"))
    reference = next(c for c in reference["cases"] if c["case"] == case)
    if digest(snapshot.read_bytes()) != reference["analysis_input_sha256"]:
        raise ValueError("Input fingerprint differs from corrected M0.1 fixture")
    browser = json.loads(subprocess.check_output(
        ["node", str(DRIVER), url, str(seed), args.chrome, str(snapshot), "measure"], cwd=ROOT, timeout=TIMEOUT))
    if fingerprints(browser) != reference["interval_sha256"]:
        raise ValueError("Browser results changed")
    pairs = []
    for index in range(7):
        order = ["default", "experimental"] if index % 2 == 0 else ["experimental", "default"]
        pair = dict(kind="warmup" if index == 0 else "measurement", order=order)
        for mode in order:
            result, peak, samples = run_sample([sys.executable, __file__, "--worker", str(snapshot), "--mode", mode])
            _, parity = validate_results(browser, result)
            hashes = fingerprints(result)
            if hashes != reference["python_interval_sha256"]:
                raise ValueError("Python result fingerprint changed")
            for scenario in result["scenarios"]:
                del scenario["bins"]
            pair[mode] = dict(**result, peak_rss_mib=peak, rss_samples=samples,
                              parity=parity, interval_sha256=hashes)
        pairs.append(pair)
        print(f"{case} pair {index}: {order}, "
              f"{pair['default']['scenarios'][0]['elapsed_ms']:.1f}/"
              f"{pair['experimental']['scenarios'][0]['elapsed_ms']:.1f} ms", file=sys.stderr, flush=True)
    return dict(case=case, analysis_input_sha256=digest(snapshot.read_bytes()),
                package_sha256=digest(fixture.read_bytes()) if case == "synthetic" else None,
                browser_interval_sha256=fingerprints(browser), setup_reload_verified=True,
                runtimes={k: browser[k] for k in ("chrome", "node", "puppeteer")},
                pairs=pairs, summary=summarize_pairs(pairs))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    # The driver selects each worker mode explicitly; avoid inherited experimental defaults.
    os.environ.pop(FLAG, None)
    initial = provenance()
    tool_hash = normalised_hash(Path(__file__).read_bytes())
    report = dict(started_utc=datetime.now(timezone.utc).isoformat(), application=initial,
                  driver_sha256=tool_hash, environment=describe_environment(), warmup_pairs=1,
                  measured_pairs=6, absolute_tolerance=1e-9, rss_poll_target_ms=25,
                  modes={"default": {FLAG: None}, "experimental": {FLAG: "1"}}, cases=[], complete=False)
    with tempfile.TemporaryDirectory(prefix="sedcoretool-counts-") as temp:
        with ImageServer(("127.0.0.1", 0), QuietHandler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                for case in CASES:
                    report["cases"].append(measure_case(case, args, f"http://127.0.0.1:{server.server_port}/app/",
                                                        Path(temp) / case))
                    write_report(args.output, report)
            finally:
                server.shutdown()
                thread.join()
    if provenance() != initial or normalised_hash(Path(__file__).read_bytes()) != tool_hash:
        raise RuntimeError("Source changed during measurement")
    report["complete"] = True
    report["accepted"] = all(c["summary"]["accepted"] for c in report["cases"])
    write_report(args.output, report)


if __name__ == "__main__":
    if "--worker" in sys.argv:
        mode = sys.argv[sys.argv.index("--mode") + 1]
        if mode not in ("default", "experimental"):
            raise ValueError("Invalid counting mode")
        os.environ.pop(FLAG, None)
        if mode == "experimental":
            os.environ[FLAG] = "1"
        result = python_worker(Path(sys.argv[sys.argv.index("--worker") + 1]))
        result["mode"] = mode
        print(json.dumps(result))
    else:
        main()
