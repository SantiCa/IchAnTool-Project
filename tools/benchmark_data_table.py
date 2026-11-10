"""Measure opening and interacting with the Data table on deterministic imported records."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path

from benchmark import ROOT, SAMPLE_SECONDS, TIMEOUT, QuietHandler, describe_environment, run_sample, source_metadata

DRIVER = ROOT / "tools" / "benchmark_data_table.mjs"
SOURCES = ("tools/benchmark_data_table.py", "tools/benchmark_data_table.mjs", "tools/data_table_fixture.mjs")
CASES = {"small": 2000, "medium": 20000, "large": 100000}
METRICS = ("open_ms", "edit_ms", "select_ms", "more_ms", "scroll_ms", "export_ms", "browser_peak_rss_mib",
           "expansion_total_ms", "last_expansion_ms", "expanded_select_ms",
           "initial_dom_rows", "expanded_dom_rows", "final_dom_rows")


class TableServer(ThreadingHTTPServer):
    request_queue_size = 32


def measure_case(case, args, url, workspace):
    def command(profile, mode):
        return ["node", str(DRIVER), url, profile, args.chrome, str(CASES[case]), mode, str(args.expansion_steps),
                "viewport" if args.viewport else "native"]

    runs, first = [], None
    for index in range(args.warmups + args.repetitions):
        with tempfile.TemporaryDirectory(prefix=f"{case}-", dir=workspace) as profile:
            result, peak, samples = run_sample(command(profile, "measure"), browser_tree=True)
        identity = {key: result[key] for key in ("fixture", "csv_sha256", "csv_rows_verified", "initial", "expanded", "displayed", "expansion_steps")}
        if first is None:
            first = identity
        elif identity != first:
            raise ValueError(f"{case} fixture or table results changed between runs")
        entry = {"kind": "warmup" if index < args.warmups else "measurement",
                 **{metric: result[metric] for metric in METRICS if metric != "browser_peak_rss_mib"},
                 "browser_peak_rss_mib": peak, "browser_rss_samples": samples,
                 "expansion_timings": result["expansion_timings"]}
        runs.append(entry)
        print(f"{case} {entry['kind']} {index + 1}: open {entry['open_ms']:.1f} ms, edit {entry['edit_ms']:.1f} ms, "
              f"more {entry['more_ms']:.1f} ms", file=sys.stderr, flush=True)
    with tempfile.TemporaryDirectory(prefix=f"{case}-cpu-", dir=workspace) as profile:
        profiled = json.loads(subprocess.check_output(command(profile, "profile"), cwd=ROOT, timeout=TIMEOUT))
    if profiled["csv_sha256"] != first["csv_sha256"]:
        raise ValueError("CPU-profile trial produced different data")
    measured = [run for run in runs if run["kind"] == "measurement"]
    return {"case": case, **first, "runs": runs,
            "runtimes": {key: result[key] for key in ("chrome", "node", "puppeteer")},
            "summary": {metric: {"median": statistics.median(run[metric] for run in measured),
                                 "min": min(run[metric] for run in measured), "max": max(run[metric] for run in measured)}
                        for metric in METRICS}, "cpu_profile": profiled["cpu"],
            "csv_cpu_profile": profiled["cpu_export"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", default=os.getenv("CHROME"))
    parser.add_argument("--case", choices=("all", *CASES), default="all")
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--expansion-steps", type=int, default=1)
    parser.add_argument("--viewport", action="store_true", help="Enable the experimental visible-row checkbox")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if min(args.warmups, args.repetitions, args.expansion_steps) < 1:
        parser.error("warmups, repetitions and expansion-steps must be positive")
    args.chrome = args.chrome or shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chrome")
    if not args.chrome:
        parser.error("Set --chrome to the browser executable")
    args.chrome = str(Path(args.chrome).resolve(strict=True))
    report = {"started_utc": datetime.now(timezone.utc).isoformat(), "source": source_metadata(SOURCES),
              "environment": describe_environment(), "warmups": args.warmups, "repetitions": args.repetitions,
              "rss_poll_target_ms": SAMPLE_SECONDS * 1000, "expansion_steps": args.expansion_steps,
              "viewport": args.viewport}
    with tempfile.TemporaryDirectory(prefix="sedcoretool-data-table-") as workspace:
        with TableServer(("127.0.0.1", 0), QuietHandler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/app/index.html"
                cases = CASES if args.case == "all" else (args.case,)
                report["cases"] = [measure_case(case, args, url, workspace) for case in cases]
            finally:
                server.shutdown()
                thread.join()
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
