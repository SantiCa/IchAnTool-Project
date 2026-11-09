"""Measure SedCoreTool editing history in a disposable browser profile."""

from __future__ import annotations

import argparse
import json
import math
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

from benchmark import MIB, ROOT, SAMPLE_SECONDS, TIMEOUT, QuietHandler, describe_environment, run_sample, source_metadata

DRIVER = ROOT / "tools" / "benchmark_history.mjs"
HISTORY_SOURCES = ("tools/benchmark_history.py", "tools/benchmark_history.mjs")
CASES = {"sparse": 256, "dense": 8192}


class HistoryServer(ThreadingHTTPServer):
    # Leave room for Chromium's parallel requests for the app's ES modules.
    request_queue_size = 32


def summary(values):
    return {"median": statistics.median(values), "min": min(values), "max": max(values)}


def action_summary(values):
    ordered = sorted(values)
    return {"count": len(ordered), **summary(ordered), "p95": ordered[math.ceil(0.95 * len(ordered)) - 1]}


def measure_case(case, args, url, workspace):
    def command(profile, mode):
        return ["node", str(DRIVER), url, str(profile), args.chrome, str(CASES[case]), str(args.cycles), mode]

    runs, first = [], None
    for index in range(args.warmups + args.repetitions):
        with tempfile.TemporaryDirectory(prefix=f"{case}-", dir=workspace) as profile:
            result, rss, samples = run_sample(command(profile, "measure"), browser_tree=True)
        if first is None:
            first = result
        elif result["history"] != first["history"] or result["fixture"] != first["fixture"]:
            raise ValueError(f"{case} did not reproduce its fixture and history payload")
        heap = result["heap_bytes"]
        entry = {
            "kind": "warmup" if index < args.warmups else "measurement",
            "latency_ms": {action: action_summary(times) for action, times in result["latency_ms"].items()},
            "heap_bytes": heap,
            "history_heap_mib": (heap["full"] - heap["without_history"]) / MIB,
            "snapshot_heap_mib": (heap["full"] - heap["without_objects"]) / MIB,
            "other_history_heap_mib": (heap["without_objects"] - heap["without_history"]) / MIB,
            "browser_peak_rss_mib": rss, "browser_rss_samples": samples,
            "reload_verified": result["reload_verified"],
        }
        runs.append(entry)
        print(f"{case} {entry['kind']} {index + 1}: retained {entry['history_heap_mib']:.2f} MiB, "
              f"peak browser RSS {rss:.1f} MiB", file=sys.stderr)

    print(f"{case}: separate CPU profile", file=sys.stderr)
    with tempfile.TemporaryDirectory(prefix=f"{case}-profile-", dir=workspace) as profile:
        profiled = json.loads(subprocess.check_output(command(profile, "profile"), cwd=ROOT, timeout=TIMEOUT))
    if profiled["history"] != first["history"] or profiled["fixture"] != first["fixture"]:
        raise ValueError(f"{case} CPU profile ran on a different fixture or history payload")

    measured = [entry for entry in runs if entry["kind"] == "measurement"]
    metrics = ("history_heap_mib", "snapshot_heap_mib", "other_history_heap_mib", "browser_peak_rss_mib")
    timings = {
        action: {stat: summary([r["latency_ms"][action][stat] for r in measured]) for stat in ("median", "p95")}
        for action in first["latency_ms"]
    }
    return {
        "case": case, "fixture": first["fixture"], "history": first["history"],
        "runtimes": {key: first[key] for key in ("chrome", "node", "puppeteer")},
        "runs": runs, "latency_ms": timings,
        "memory_mib": {metric: summary([r[metric] for r in measured]) for metric in metrics},
        "cpu_profile": profiled["cpu"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", default=os.getenv("CHROME"), help="Chrome or Chromium executable (or set CHROME)")
    parser.add_argument("--case", choices=("all", *CASES), default="all")
    parser.add_argument("--cycles", type=int, default=8, help="Batches of 30 Undo and 30 Redo actions")
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--output", type=Path, help="Write the JSON report here instead of stdout")
    args = parser.parse_args()
    if min(args.cycles, args.warmups, args.repetitions) < 1:
        parser.error("cycles, warmups and repetitions must be positive")
    args.chrome = args.chrome or shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chrome")
    if not args.chrome:
        parser.error("Set --chrome to a Chrome or Chromium executable")
    args.chrome = str(Path(args.chrome).resolve(strict=True))
    report = {
        "started_utc": datetime.now(timezone.utc).isoformat(), "source": source_metadata(HISTORY_SOURCES),
        "environment": describe_environment(), "cycles": args.cycles,
        "warmups": args.warmups, "repetitions": args.repetitions, "rss_poll_target_ms": SAMPLE_SECONDS * 1000,
    }
    with tempfile.TemporaryDirectory(prefix="sedcoretool-history-") as tmp:
        with HistoryServer(("127.0.0.1", 0), QuietHandler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/app/index.html"
                cases = CASES if args.case == "all" else (args.case,)
                report["cases"] = [measure_case(case, args, url, Path(tmp)) for case in cases]
            finally:
                server.shutdown()
                thread.join()
    output = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
