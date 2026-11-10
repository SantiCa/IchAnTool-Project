"""Profile large-image opening, section navigation and viewport interaction on public fixtures."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path

from benchmark import (
    ROOT,
    SAMPLE_SECONDS,
    TIMEOUT,
    QuietHandler,
    browser_args,
    describe_environment,
    git,
    make_synthetic,
    run_sample,
    source_metadata,
)

DRIVER = ROOT / "tools" / "benchmark_images.mjs"
SOURCES = ("tools/benchmark_images.py", "tools/benchmark_images.mjs")
CASES = ("u1385", "synthetic", "large")
METRICS = ("open_ready_ms", "open_painted_ms", "navigation_total_ms", "first_visits_total_ms", "return_first_ms",
           "warm_return_ms", "zoom_total_ms", "pan_total_ms", "browser_peak_rss_mib")


class ImageServer(ThreadingHTTPServer):
    request_queue_size = 32


def normalised_hash(data):
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def application_provenance():
    names = sorted(filter(None, git("ls-files", "-z", "--", "app", "src/sedcoretool").decode().split("\0")))
    digest = hashlib.sha256()
    mismatches = []
    for name in names:
        data = (ROOT / name).read_bytes()
        text = Path(name).suffix in {".js", ".py", ".html", ".json", ".css", ".txt", ".svg", ".md"}
        text = text or Path(name).name.startswith(("LICENSE", "OFL"))
        binary = not text
        current = hashlib.sha256(data).hexdigest() if binary else normalised_hash(data)
        head = git("show", "HEAD:" + name)
        expected = hashlib.sha256(head).hexdigest() if binary else normalised_hash(head)
        if current != expected:
            mismatches.append(name)
        digest.update(name.encode() + b"\0" + bytes.fromhex(current))
    delivery = re.search(r"const DELIVERY = '(V[^']+)'", (ROOT / "app/js/app.js").read_text(encoding="utf-8"))[1]
    return {"commit": git("rev-parse", "HEAD").decode().strip(), "delivery": delivery,
            "files_sha256": digest.hexdigest(), "matches_head": not mismatches, "modified_files": mismatches,
            "tool_sha256": {name: normalised_hash((ROOT / name).read_bytes()) for name in (*SOURCES, "tools/benchmark.py", "tools/benchmark_browser.mjs")}}


def identities(result):
    return {key: result[key] for key in ("fixture", "initial", "saved", "firstPixels", "edit", "exported")}


def measure_case(case, args, url, workspace):
    directory = workspace / case
    directory.mkdir()
    seed, fixture = directory / "seed", directory / "synthetic.sedcoretool"
    if case != "u1385":
        make_synthetic(fixture, height=16000 if case == "large" else 6400)
    print(f"Preparing {case}", file=sys.stderr, flush=True)
    subprocess.check_output(browser_args("prepare", url, seed, args.chrome, case, fixture), cwd=ROOT, timeout=TIMEOUT)
    reference, runs, runtime = None, [], None
    for index in range(args.warmups + args.repetitions + 1):
        profiled = index == args.warmups + args.repetitions
        with tempfile.TemporaryDirectory(prefix="image-trial-", dir=directory) as temp:
            profile = Path(temp) / "profile"
            shutil.copytree(seed, profile)
            result, peak, samples = run_sample(["node", str(DRIVER), url, str(profile), args.chrome, case,
                                                "profile" if profiled else "measure"], browser_tree=True)
        if reference is None:
            reference = identities(result)
        elif identities(result) != reference:
            raise ValueError(f"{case} inputs or scientific/image results changed between trials")
        runtime = {key: result[key] for key in ("chrome", "node", "puppeteer")}
        if profiled:
            cpu = {"main": result["cpu_main"], "workers": result["cpu_workers"]}
            break
        entry = {"kind": "warmup" if index < args.warmups else "measurement",
                 **{metric: result[metric] for metric in METRICS if metric != "browser_peak_rss_mib"},
                 "browser_peak_rss_mib": peak, "browser_rss_samples": samples,
                 "navigation": result["navigation"], "interactions": result["interactions"]}
        runs.append(entry)
        print(f"{case} {entry['kind']} {index + 1}: open {entry['open_painted_ms']:.1f} ms, "
              f"navigation {entry['navigation_total_ms']:.1f} ms, peak {peak:.1f} MiB", file=sys.stderr, flush=True)
    measured = [run for run in runs if run["kind"] == "measurement"]
    return {"case": case, **reference, "seed": None if case == "u1385" else 138501,
            "package_sha256": None if case == "u1385" else hashlib.sha256(fixture.read_bytes()).hexdigest(),
            "runtimes": runtime, "runs": runs, "cpu": cpu,
            "summary": {metric: {"median": statistics.median(run[metric] for run in measured),
                                 "min": min(run[metric] for run in measured), "max": max(run[metric] for run in measured)}
                        for metric in METRICS}}


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", default=os.getenv("CHROME"))
    parser.add_argument("--case", choices=("all", *CASES), default="all")
    parser.add_argument("--warmups", type=int, default=1)
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, help="Parent for disposable profiles/fixtures; useful in restricted environments")
    args = parser.parse_args()
    if min(args.warmups, args.repetitions) < 1:
        parser.error("warmups and repetitions must be positive")
    args.chrome = args.chrome or shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chrome")
    if not args.chrome:
        parser.error("Set --chrome to the browser executable")
    args.chrome = str(Path(args.chrome).resolve(strict=True))
    provenance = application_provenance()
    report = {"started_utc": datetime.now(timezone.utc).isoformat(), "source": source_metadata(SOURCES),
              "application": provenance, "environment": describe_environment(),
              "warmups": args.warmups, "repetitions": args.repetitions, "rss_poll_target_ms": SAMPLE_SECONDS * 1000,
              "complete": False, "cases": []}
    if args.workspace:
        args.workspace = args.workspace.resolve()
        args.workspace.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sedcoretool-images-", dir=args.workspace) as temp:
        workspace = Path(temp)
        with ImageServer(("127.0.0.1", 0), QuietHandler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/app/index.html"
                for case in CASES if args.case == "all" else (args.case,):
                    report["cases"].append(measure_case(case, args, url, workspace))
                    write_report(args.output, report)
            finally:
                server.shutdown()
                thread.join()
    if application_provenance() != provenance:
        raise RuntimeError("Measured application or benchmark tools changed during the run")
    report["complete"] = True
    write_report(args.output, report)


if __name__ == "__main__":
    main()
