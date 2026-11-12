# Roadmap

This file lists the **current state, the next steps and all pending work**. Completed tasks and their
delivery records are in [roadmap-history.md](roadmap-history.md); shipped changes are in the
[changelog](../CHANGELOG.md). Working rules are in [AGENTS.md](../AGENTS.md).

## How to use this roadmap

1. Read [Status and handoff](#status-and-handoff) first. It names the branch, the last checked commit, the
   checks still due and the next steps, in order.
2. If checks are pending, run them before anything else ([AGENTS.md §5](../AGENTS.md#5-delivering-a-change)).
3. Work only on the task and step the maintainer authorised. Each task states its scope and **Acceptance**
   criteria; a task is complete only when all of them are met and the required checks pass.
4. Do not start another task, refactor or audit because it looks useful. Record it here as a proposal instead.
5. When you stop, update the status block: branch, last commit, checks run and their result, next step,
   open decisions. A new session must be able to continue from this file alone.
6. When a task becomes `[x]`, add its changelog link, then move its detailed record to
   [roadmap-history.md](roadmap-history.md) and leave a one-line entry here.

| Marker | Meaning |
|---|---|
| `[ ]` | Pending. The task is in the backlog. |
| `[ ]` **Ready** | The scope and acceptance criteria are defined. This is the next candidate for authorisation. |
| `[ ]` **In progress** | An editor is assigned. Record the next step at handoff. |
| `[ ]` **In review** | The reviewer can inspect the diff or commit. Include its reference and the checks still due. |
| `[ ]` **Blocked** | Record the blocker and what is needed to resume. |
| `[x]` | Complete. Link the matching changelog entry; the detailed record lives in the history file. |

## Status and handoff

Updated 12 November 2026.

- **Released version:** [V0.148](../CHANGELOG.md#v0148--2026-11-12) on local `master` (`2aca696`). `master` is
  ahead of `origin/master`; pushing needs the maintainer's authorisation.
- **Active work branch:** `work/2026-11-12`. Its changes are listed under `## Unreleased` in the changelog.
  No version number has been assigned; do that only when the maintainer asks (AGENTS.md §5, step 5).
- **Checks: pending.** Focused checks passed for each commit (engine-runtime Node tests, release/version
  Python tests, Ruff, type check, version sync). The full end-of-session suite has **not** been run on the
  branch. Run, one after another: `pytest -q`, `npm test`, `npm run typecheck`,
  `python tools/sync_version.py --check`, `ruff check src tests tools`, and the desktop E2E test
  (`tests/e2e/desktop.mjs`), because `desktop/engine.js` and `desktop/main.js` changed.
- **Current task:** [M8.2.3 - Packaging and lifecycle acceptance](#m8---desktop-simplification-and-a-single-scientific-engine),
  in progress (editor: Claude; author-run checks, no independent reviewer).
- **Next steps, in order:**
  1. Run the pending checks above and record the result here.
  2. Done: Windows portable ZIP and the verification record are measured (see M8.2.3). The tool accepts
     `--keep-profile` to reuse one user-data folder across launches. Build with `npm run dist` in `desktop/`
     (ignored output in `desktop/dist/`), extract the ZIP to a temporary folder and run
     `node tools/measure_packaged_startup.mjs <folder>\SedCoreTool.exe --runs 5 --out <file>`
     (needs `npm i --no-save puppeteer-core@23`).
  3. Repeat the ZIP launches on an idle machine to clear or reproduce the intermittent no-window failure.
  4. Done at idle (see M8.2.3). Remaining Windows work: process tree with a project open and during a job.
  5. Decide, with the maintainer, how to meet or restate the 5 s gate for the cold first launch (11–25 s).
     The window opens in about 0.45 s regardless; only engine readiness is late. Options to put to the
     maintainer with measurements, not to implement unasked: start the verification at program start-up while
     the interface is already usable; accept a documented first-launch cost; verify at install time.
- **Open maintainer decisions:**
  - macOS and Linux acceptance needs either those machines or a CI run, which requires an authorised push
    and a manual run of the *Desktop builds* workflow with `draft_release=false`.
  - Whether M8.3 may start before M8.2 acceptance is complete. The current rule is: complete M8.2 first.

## Milestones toward 1.0

### Cross-cutting objective: modularity and reviewability

Requested by the maintainer on 12 November 2026 ([V0.145](../CHANGELOG.md#v0145--2026-11-12)): make the program
modular, easy to understand and easy to edit, so that a local change needs less repeated reading, fewer
assistant tokens and fewer review rounds. Apply the [shared implementation rule](../AGENTS.md#4-rules-for-code)
throughout M8 and later features.

For each authorised modularisation slice, identify a representative maintenance task, the responsible module,
its explicit contract and callers, and the focused set of files needed to understand the change. Verify that
the new boundary preserves behaviour and scientific results, and update the source map. Report token or review
savings only from comparable measurements; module or file counts alone do not establish them. M5.4 and the
R1/R2 extractions are existing work to build on. This objective does not reorder M8 or start a whole-program
refactor.

### Active priority: desktop and one scientific engine

Approved by the maintainer on 12 November 2026 ([V0.140](../CHANGELOG.md#v0140--2026-11-12)). This order
supersedes earlier orderings; completed work and task IDs remain valid.

**Target architecture.** Keep the existing Electron/JavaScript interface and move scientific calculation
behind one local Python/NumPy engine in a separate process. The Python API and CLI call that same engine.
JavaScript owns interaction and presentation; it does not keep an independent implementation of the
scientific methods. Native libraries and optional measured Rust kernels may be internal engine components.
The goal is one authoritative implementation per method, not one language for every component. A
whole-program Rust rewrite and a new browser engine are outside this sequence. Electron remains the
interface shell throughout M8; a more fluid shell may replace it later, evaluated only after M8.6 under
[M9.1](#m9---interface-shell-evolution-conditional). Therefore keep the engine protocol, method contracts and
result formats independent of Electron and the renderer, and keep shell-specific process, IPC and packaging
code in `desktop/`.

**Distribution.** Desktop packages are the primary full-capability product and include a tested 64-bit
scientific runtime, so users do not need their own Python. Shipped forms: Windows installer (NSIS) and
portable ZIP, universal macOS disk image, Linux AppImage and DEB. Each form is accepted separately; a passing
installed build does not certify the portable one. The browser/standalone HTML stays as a temporary
compatibility and reference path until the explicit cutover in M8.6; do not remove it or change storage
identifiers now. The Python package remains a supported interface to the same engine, not a second
calculation path.

| Execution order | Deliverable | Existing tasks coordinated with it |
|---|---|---|
| 1 | M8.1: inventory, scientific ownership and engine contract (done) | M5.1, M5.4; retain current reference fixtures |
| 2 | M8.2: packaged local runtime and cancellable process boundary | M3.2.4, M3.1.7 |
| 3 | M8.3: one section analysed by the engine through the existing interface | M3.1.6, M0.1, M1.2 |
| 4 | M8.4: bounded image/data ownership and large-file integration | M2.3.1–M2.3.5 |
| 5 | M8.5: remaining methods migrated in independent vertical slices | M3.2.5 before training migration; M3.3 contracts |
| 6 | M8.6: desktop promotion and retirement of duplicate scientific paths | M5.1; legacy-project/export and packaging gates |
| 7 | Advanced statistics and radiographs on the accepted engine | M6.1–M6.6, M7.1–M7.4; no new parallel JavaScript science |
| 8 | Conditional acceleration and remaining backlog | M4.1, remaining audit/validation/release tasks |
| 9 | M9.1: conditional interface-shell evaluation, only after M8.6 | M2.3 responsiveness evidence; project migration through packages |

Assign an editor and reviewer at each implementation handoff. Fixes needed to preserve data or to meet a
phase's acceptance criteria belong to that phase; unrelated refactors wait. Publication and 1.0 are owner
decisions.

### M8 - Desktop simplification and a single scientific engine

Contract and predeclared gates for every M8 task: [roadmap-engine-contract.md](roadmap-engine-contract.md).
Current engine implementation: [technical manual §26.2–§26.3](TECHNICAL_DOCUMENTATION.md#262-experimental-engine-process).
The engine experiment stays **off by default** (`SEDCORETOOL_ENGINE_EXPERIMENT=1` enables it).

- [x] **M8.1 - Engine inventory and migration contract.** [V0.141](../CHANGELOG.md#v0141--2026-11-12);
      [record](roadmap-history.md#m8---completed-engine-migration-tasks).
- [ ] **M8.2 - Local engine process and reproducible packaging. In progress.** Build the desktop process boundary and
      include a tested 64-bit Python runtime with the minimal scientific dependencies. Use M3.2.4 for tested
      constraints, checksums and update policy; keep optional training dependencies separate from basic analysis.
  - Acceptance: clean-machine startup without a separately installed Python/Node or runtime dependency
    download for basic analysis; verify portable/installed packages across the supported desktop systems.
    Bound messages, queue length, concurrent jobs and CPU/RAM budgets. Isolate process failure, restart,
    timeout and cancellation; obsolete results cannot overwrite newer edits. Preserve unsaved live data and
    the last good project after engine failure. Keep the normal interface available while jobs run.
  - [x] **M8.2.1 - Experimental process/transport foundation.** [V0.142](../CHANGELOG.md#v0142--2026-11-12);
        [record](roadmap-history.md#m8---completed-engine-migration-tasks).
  - [x] **M8.2.2 - Reproducible runtime bundle.** [V0.143](../CHANGELOG.md#v0143--2026-11-12);
        [record](roadmap-history.md#m8---completed-engine-migration-tasks),
        [evidence](validation/M8.2.2-v0.143.json).
  - [ ] **M8.2.3 - Packaging and lifecycle acceptance. In progress** on branch `work/2026-11-12`.
        Verify offline portable/installed startup on clean Windows, macOS and Linux, lifecycle under load,
        CPU/RAM accounting, process-tree cleanup and project preservation. Keep the flag off; do not mark M8.2
        complete from development protocol tests alone.
    - Acceptance (from M8.1's gates): engine ready ≤5 s from spawn through the hello handshake, including
      runtime verification, measured cold and warm with the platform's default malware scanning; cancel
      acknowledgement ≤250 ms; cancelled terminal response and release ≤2 s; no process or temporary folder left
      after close or forced termination; download and installed sizes recorded. Measure each shipped form
      separately. If a form fails, record the measurement and present options to the maintainer; never weaken
      integrity checks silently or widen deadlines without evidence.
    - **Measuring tools** (all write a JSON report with `--out`):
      `tools/measure_engine_lifecycle.mjs` (verification, ready, stop, forced kill, leftovers; optional CPU load),
      `tools/measure_packaged_startup.mjs` (packaged program: time to window and engine ready, close, leftovers),
      `tools/measure_engine_cancellation.mjs` (transfer, cancellation latency, engine memory).
    - **Measured on Windows 11 (Ryzen 7 7700X, 16 logical CPUs):**
      - Lifecycle, development layout ([evidence](validation/M8.2.3-lifecycle-windows-v0.148.json)): idle
        verification 2.1 s + ready 0.31 s (passes); orderly stop 8 ms; no leftovers. With all 16 CPUs saturated,
        verification takes 16 s median (27 s max) and fails the 5 s gate. This explains the V0.144
        [concurrent-run observation](validation/M8.2.3-load-observation-v0.144.json) as CPU contention.
      - Forced termination: was 1.7 s idle and 2.6 s under load (`taskkill /T`). Fixed on this branch: the
        engine joins a kill-on-close Windows Job Object (`src/sedcoretool/engine/lifetime.py`); now 5 ms idle
        and 29 ms under load, no leftovers.
      - Packaged start-up ([evidence](validation/M8.2.3-packaged-startup-windows-v0.148.json)): installed or
        unpacked layout shows the window in 0.4 s; engine ready 2.6–2.95 s warm but 17–20 s on the first launch
        after building or installing. The NSIS installer installs in 56 s (7,428 files, 614 MB) and uninstalls in
        7 s leaving nothing behind. The former self-extracting portable `.exe` needed about 51 s to show the window.
      - Cancellation and memory with the diagnostic job ([evidence](validation/M8.2.3-cancellation-windows-v0.148.json)):
        acknowledgement 0.7 ms; running-job terminal response 170 ms median (200 ms max); queued job under 1 ms;
        engine tree 24 MB idle, 47 MB peak. Passes the gates for this diagnostic method only.
    - **Maintainer decisions of 12 November 2026, implemented on this branch:**
      - The Windows portable is a ZIP of the program folder (electron-builder `zip` target) instead of the
        self-extracting `portable` target. Built once (224 MB); its start-up is **not yet measured**.
      - Launch verification keeps a verified-identity record in the user-data folder and skips content hashing
        while file identity is unchanged ([evidence](validation/M8.2.3-verification-record-windows-v0.148.json),
        [technical manual §26.3](TECHNICAL_DOCUMENTATION.md#263-bundled-scientific-runtime)): 4.7 s full,
        0.18 s with the record, warm file cache. The first launch after installation still verifies everything.
    - **Portable ZIP measured on Windows** (`tools/measure_packaged_startup.mjs`, ZIP extracted to a temporary
      folder; evidence: [shared profile](validation/M8.2.3-portable-zip-record-windows-v0.148.json),
      [fresh profile](validation/M8.2.3-portable-zip-fresh-profile-windows-v0.148.json),
      [quiet rerun](validation/M8.2.3-portable-zip-rerun-windows-v0.148.json)):
      - Window visible after about 0.45 s on every launch (the self-extracting build needed 51 s). Close 70–120 ms,
        exit code 0, no leftover process or temporary folder.
      - Engine ready: 11.5 s on the first launch after extraction (cold file cache, full verification);
        0.72–0.79 s on later launches that reuse the verification record; 2.6–3.0 s when every launch verifies
        everything with a warm cache. The 5 s gate therefore passes for warm launches with or without the record
        and fails only for the first cold launch.
      - **Unexplained intermittent failure:** 2 of 12 launches in the first two batches (both the second launch)
        showed no application page within 120 s and were killed; 0 of 3 in a later rerun with the computer
        otherwise idle. Those two batches overlapped with heavy disk activity from other work in the same session,
        which is a possible but unproven cause. The tool now records the stage where waiting fails. Treat this as
        open until reproduced or cleared by more idle-machine runs.
      - Extracting the 224 MB ZIP with PowerShell `Expand-Archive` took 57 s (about 613 MB unpacked); the
        archive has no top-level folder, so users must use "Extract all" into a new folder.
    - **Idle process tree of the packaged ZIP** ([evidence](validation/M8.2.3-process-tree-windows-v0.148.json),
      3 launches, shared profile, no project open, engine experiment on): 5 processes under the program folder
      (Electron processes plus the engine coordinator; the diagnostic worker is not started until a job runs),
      309–370 MiB summed working set (shared pages are counted once per process, so this overstates real
      use) and 0.35–1 % of one core when idle. The first launch of this batch, after the machine had been idle,
      needed 24.7 s to reach engine ready (cold file cache, full verification), against 11.5 s for the first
      launch in the earlier batch: the cold first launch is 11–25 s and fails the 5 s gate; later launches 0.74–0.76 s.
      Memory while a job runs and with a project open is not measured.
    - **Remaining** (see the next steps in the status block):
      - [x] Portable ZIP start-up measurement (above), except the intermittent failure.
      - [x] Packaged start-up with the verification record (above: 11.5 s first launch, then 0.72–0.79 s).
      - [ ] Repeat the ZIP launches several more times on an idle machine to clear or reproduce the intermittent failure.
      - [x] Electron-plus-engine idle process-tree memory and CPU (above). Still open: with a project open and
            while a job runs.
      - [ ] macOS (Intel, Apple Silicon, universal DMG) and Linux (AppImage, DEB) execution.
      - [ ] Clean-machine runs and other antivirus configurations.
      - [ ] First-launch cold start (17–20 s) against the 5 s gate: still failing; needs a measured proposal
            for the maintainer if it remains above the gate after the record is in place.
- [ ] **M8.3 - First scientific vertical slice: section counts and indices.** Connect one section's
      current mask, ROI, exclusions, overlaps and class assignments to engine interval analysis, then display
      the returned percentages and BI/ii in the existing interface. Reuse the public Python analysis path;
      evaluate the measured NumPy implementation under M3.1.6 without silently changing its default.
  - Acceptance: exact row/count/index/missing-value equality and the established numerical tolerances on
    M0.1/M3.1.3 fixtures, including fractional boundaries and custom schemes. Verify edits, undo/redo,
    cancellation, failed jobs, CSV output and save/reopen through the actual desktop workflow. Measure engine
    startup, transfers, full job latency and total Electron/engine/worker RSS, not only the counting kernel.
    Keep this experiment default-off until its predeclared gates pass; retain explicit developer rollback.
  - Read first: the contract's representation gaps, no-data/manual/age processing and custom-tier
    precedence differences between existing public interfaces. Preserve supported semantics and test them
    explicitly; do not substitute a library default or delete the reference implementation.
- [ ] **M8.4 - Bounded engine data and image services.** Implement M2.3.1–M2.3.5 through engine-owned
      native data, chunked operations and a bounded tile/cache interface. The renderer receives visible tiles,
      editing updates and result summaries, rather than a second resident copy of every original image.
  - Acceptance: the multi-gigabyte contract covers the complete Electron/engine process tree, disk usage,
    buffer ownership and memory release after project close. Preserve native pixels, editing coordinates,
    masks/history and atomic save/backup recovery. Raising heap or image-load limits alone does not pass.
    Apply bounded CPU concurrency and leave agreed RAM/CPU headroom for the interface and operating system.
- [ ] **M8.5 - Migrate the remaining scientific methods.** Deliver one workflow at a time from M8.1's
      matrix: depth/age and record transformations; image processing and object features; classifiers and
      spatial interpolation; model inference/training integration. Reuse existing Python methods where
      equivalent and implement missing methods once in the engine. Address M3.2.5 before changing training.
  - Acceptance: every slice has independent reference fixtures, explicit provenance and unchanged public
    contracts. Counts/masks/labels are exact where required; other numerical tolerances and decoder differences
    are declared before comparison. Replacing a method with a library's different defaults is not an equivalent
    migration. Match current figure/export behaviour while rendering engine results; test failure, cancellation,
    invalidation and reload. Transitional comparisons use snapshots/reference outputs and are not two promoted engines.
- [ ] **M8.6 - Promote desktop and retire duplicate computation.** After all required slices pass,
      make the local engine authoritative, remove migrated JavaScript calculations from the supported desktop
      runtime, and replace their regression role with versioned reference fixtures and Git provenance.
  - Acceptance: one production implementation per scientific method, identical API/CLI/desktop results,
    complete desktop and interrupted-save regressions, clean-machine/offline packaging and documented runtime
    identity. Retain the desktop origin, storage keys, compatibility alias and old project/package readers.
    Record the last supported HTML delivery and a tested export/import path for its stored projects before
    freezing it; keep that artifact retrievable. Update contributor/user/technical documentation and CI to
    the actual cutover in the same delivery. Remove temporary flags only after acceptance; engine errors must
    remain visible rather than silently choosing another scientific implementation.

### M9 - Interface shell evolution (conditional)

The maintainer stated on 12 November 2026 that Electron is the interface shell for now and that a more fluid
system may replace it later. This records a future evaluation; it is not authorised work, selects no candidate
shell and does not change the M8 order.

- [ ] **M9.1 - Evaluate the interface shell after the engine migration.** Start only after M8.6, and after
      M8.4 has moved image ownership and heavy computation out of the renderer, so that remaining slowness is
      attributed to the shell or to application rendering on evidence rather than assumption.
  - Acceptance: first measure the accepted Electron build on M2.3 fixtures (startup, input-to-frame latency
    during pan/zoom/editing, idle and peak process-tree RSS, download and installed size) and identify which
    costs belong to the shell. Compare a candidate only against that baseline, on the same hardware and
    fixtures, and only if shell-bound costs justify it. The candidate reuses the engine protocol, method
    contracts and results unchanged; provides a tested migration of projects stored by the Electron program
    (IndexedDB under `app://corantool`), packages and folder backups; and ships portable and installed forms
    on every supported system. Record build, signing, platform web-view and maintenance costs. Keep Electron
    as the default and rollback until the maintainer accepts the transition.

### Capacity, advanced statistics and radiographs

Planned on 12 November 2026 ([V0.138](../CHANGELOG.md#v0138--2026-11-12)). These capabilities are **not
available** and not started; no editor is assigned. Their order follows the M8 sequence above; the maintainer
chooses which are required for 1.0.

| Goal | Tasks | Dependencies and proposed sequence |
|---|---|---|
| Fluid work with individual images of several gigabytes | M2.3.1–M2.3.5 | Establish real file/decoded-size benchmarks, then bounded tile access, viewing, analysis and saving. |
| Faster calculations with a responsive interface | M3.1.6–M3.1.7, M4.1.1–M4.1.2 | Build on the single engine and bounded scheduling; native Rust/GPU work remains conditional and later. |
| An implemented advanced-statistics module | M6.1–M6.6 | Use the accepted Python engine contract; methods are not reimplemented independently in the interface. |
| Radiographs alongside core photographs and records | M7.1–M7.4 | Use engine image/data services for native samples and measurements, with shared depth coordinates. |

M2.3.1 is the first large-image contract inside M8.4. M6.1 and M7.1 define scientific/input contracts after
the relevant engine/data services are accepted. Large radiographs depend on M2.3's bounded image path. Each
phase must be small enough to review and roll back independently; statistical methods are added one at a time.
Benchmarks use public or generated data; unpublished images are never committed.

### M0 - Baseline and project safety

All M0 tasks are complete: M0.1 baseline ([acceptance criteria](roadmap-history.md#m01-acceptance-criteria)),
M0.2 import/export safety, M0.3 project validation, M0.4 desktop protocol paths, M0.5/M0.5.1 untrusted
presentation values. Records: [history](roadmap-history.md#m0---baseline-and-project-safety).

### M1 - Editing and recovery

M1.1 (editing history), M1.2 (interrupted saves), M1.2.1 and M1.2.3 are complete
([history](roadmap-history.md#m1---editing-and-recovery)).

- [ ] **M1.2.2 - Diagnose remaining desktop hangs if reported.** Capture the triggering action, project
      dimensions, terminal/renderer error and whether the process is busy or waiting. Reproduce with public
      or synthetic data before attributing a memory, GPU or computation cause. The focused backup audit
      does not establish the cause of every hang reported by the maintainer. Reproduce the multiple-waiter
      `saveToDB` path flagged by source review before changing its concurrency controller. The opt-in desktop
      diagnostics of M1.2.3 record the evidence; remove them in a separate delivery once the diagnosis is accepted.

### M2 - Large projects and responsive display

M2.1 (large tables) and M2.2 (large images) are complete ([history](roadmap-history.md#m2---large-projects-and-responsive-display)).

- [ ] **M2.3 - Multi-gigabyte image workflows.** Extend the measured M2.2 scope to individual source files
      of several gigabytes and larger decoded rasters, including native grayscale/16-bit images. Raising
      the current input/memory limits alone is not an implementation of this task. Delivered through M8.4.
  - [ ] **M2.3.1 - Define fixtures, hardware and responsiveness targets.** Build deterministic 2, 4 and 8 GiB
        source-file cases, plus compressed cases whose decoded rasters exceed those sizes. Record dimensions,
        channels, bit depth, compression, tile/strip layout and exact encoded/decoded byte counts separately.
        Compare local-SSD hosts with 16/32 GiB RAM, measuring the complete desktop/engine pipeline. Use the
        current browser path only as a historical reference while it remains in the migration support matrix.
    - Acceptance: reproduce opening, first useful preview, cold/cached pan/zoom, editing, analysis, export and
      save/reopen with process-tree RSS, temporary-disk usage, copies and CPU/I/O attribution. Initial proposed
      targets are cached-navigation p95 frame time <=33 ms, control response <=100 ms and cancellation
      acknowledgement <=250 ms. Ratify achievable targets and an absolute working-memory/cache budget on
      named hardware before implementation; report cold loading and analysis throughput separately.
  - [ ] **M2.3.2 - Bounded image source and multiresolution tiles.** Read supported TIFF/BigTIFF regions on
        demand and generate/reuse a disk-backed pyramid without decoding the full raster into memory. Define
        a cancellable conversion path for non-random-access sources and a source/cache identity contract.
    - Acceptance: sampled native pixels, dimensions and coordinates match independent references exactly;
      peak working memory follows the declared tile budget rather than full raster size. Handle corrupt
      tiles, oversized declarations, interruption and exhausted disk space. Preserve originals and existing
      supported inputs; compare dependency, distribution and offline costs before selecting a decoder.
  - [ ] **M2.3.3 - Responsive tiled viewer and editing.** Load visible tiles with bounded prefetch/cache,
        level-of-detail selection, background decoding and cancellation of obsolete viewport requests.
        Store masks/exclusions and editing history in bounded chunks; keep full-resolution coordinates.
    - Acceptance: meet M2.3.1's agreed responsiveness/RSS targets during repeated pan/zoom and edits; evict
      buffers and worker/GPU resources predictably. Verify depth mapping, overlaps, exclusions, undo/redo,
      invalidation and identical exported masks. A lower-resolution preview must not silently change analysis.
  - [ ] **M2.3.4 - Analysis and export beyond resident memory.** Stream counting, filtering, detection,
        U-Net tiling and exports in independently delivered operations. Define filter halos, border rules
        and cross-tile object merging before replacing a whole-image operation.
    - Acceptance: exact integer masks/counts and reference-equivalent scientific results at predeclared
      tolerances, including objects crossing tile seams, fractional intervals and exclusions. Bound scratch
      memory, expose progress/cancellation and verify that cancellation publishes no partial result as complete.
  - [ ] **M2.3.5 - Large-project storage and recovery.** Stream original-image import, project packaging,
        backup and recovery with bounded buffers; make portable-copy versus external-source references
        explicit, with checksums and missing/moved-source recovery. Treat generated pyramids as disposable caches.
    - Acceptance: reopen multi-gigabyte projects with unchanged source bytes, masks and results; preserve
      the last good save after quota, disk-full, interrupted transfer and partial-cache failures. Verify
      legacy projects and portable desktop exports; validate the transitional HTML export/import route.

### M3 - Analysis and learned segmentation

Complete: M3.1.1–M3.1.5 (interval analysis performance; opt-in NumPy counting via
`SEDCORETOOL_EXPERIMENTAL_COUNTS=1`), M3.2.1–M3.2.3 (U-Net device fallback, safe dataset paths, preserved
models), M3.3.1 and M3.3.3 (palette inputs, manifest escaping). Records:
[M3](roadmap-history.md#m3---analysis-and-learned-segmentation),
[M3.3](roadmap-history.md#m33---python-input-and-export-contracts).

- [ ] **M3.1 - Analysis performance.** Profile Python and JavaScript before optimising shared algorithms.
      Preserve configurable interval boundaries and regression results.
  - [ ] **M3.1.6 - Review promotion of the measured NumPy counting path.** Review M3.1.5's accepted workload
        results and extend coverage to representative overlaps, class counts, strided masks and radiograph-sized
        tiles before proposing a default change. Preserve the current rollback path and scientific contract.
    - Acceptance: matched end-to-end latency/RSS measurements, exact counts/indices and documented numerical
      parity; no universal speed claim from the original two fixtures. Promotion and flag removal remain
      separate maintainer decisions.
  - [ ] **M3.1.7 - Cancellable background calculation and bounded reuse.** Implement scheduling behind the
        M8 engine boundary with explicit buffer ownership, bounded worker concurrency, progress and cancellation.
        Evaluate dependency-aware reuse of counts, derived series and map grids after edits. Renderer workers
        may support presentation; new scientific worker implementations in JavaScript are not a separate backend.
    - Acceptance: the interface meets agreed response/cancellation targets while calculations run; stale jobs
      cannot overwrite newer edits/results. Include worker startup, buffer transfers and cache memory in
      end-to-end comparisons; require identical outputs and correct invalidation on every relevant input.
      Establish the accepted engine baseline before considering M4.1.1.
- [ ] **M3.2 - U-Net reliability.** Exercise representative CPU and GPU workloads. Test device fallback and
      memory failures, and record model identity and checksums for reproducible inference.
  - [ ] **M3.2.4 - Reproduce the managed trainer environment (AUD-09).** The optional desktop installer
        downloads dependencies whose versions can vary between installations. Select constraints from tested
        configurations, not the audit's example caps. Share tested constraints and update policy with the
        packaged base engine of M8.2; the optional trainer/CPU/CUDA matrix stays separate and must not make
        training packages mandatory for ordinary section analysis.
    - **Approach.** Document training-related network access in `SECURITY.md` and define tested
      dependency constraints for the supported Python, CPU and CUDA configurations.
    - **Acceptance.** Document the downloads and when they occur. Verify that two clean installs
      of a supported configuration resolve to the same dependency versions and can run a trainer
      smoke check. Keep coverage for CPU and each supported CUDA configuration.
    - **Likely touchpoints.** `desktop/trainer.js`, the Python U-Net dependency configuration,
      `SECURITY.md` and the trainer installation checks.
    - **Decision before implementation.** Define the supported environment matrix and how its
      constraints are updated and tested.
  - [ ] **M3.2.5 - Isolate caller random state during training (AUD-08).** Review Python, NumPy and
        Torch CPU/device seeding in `unet/train.py`, including model initialisation and data loaders.
    - Acceptance: caller random streams are preserved on success, failure and cancellation, while seeded
      training and checkpoint resume remain reproducible. Use local generators or scoped state restoration
      where framework operations require global generators. Exercise supported CPU/device paths without
      weakening the existing determinism contract or changing scientific defaults silently.

### M3.3 - Python input and export contracts

- [ ] **M3.3.2 - Describe fractional bin sizes accurately (AUD-05).** Align `CoreSection.bin_px`'s
      annotation with the existing float-valued API and documented fractional boundary rules.
  - Acceptance: inspect public annotations/documentation and retain fractional-bin and legacy numerical
    regressions. This is a type correction, not a new conversion or rounding algorithm.
- [ ] **M3.3.4 - Choose LAS ASCII metadata policy (AUD-07).** Decide how non-ASCII names, headers and
      units are represented before replacing the current ASCII substitution in `export.py`.
  - Acceptance: document predictable transliteration/rejection/warning behaviour, test accented and
    non-transliterable text and possible naming collisions, preserve numeric curves and valid LAS 2.0 syntax.
    Avoid silently treating all Unicode symbols as equivalent to accent removal.

### M4 - Optional acceleration

- [ ] **M4.1 - Targeted experiments.** After the M8 engine baseline, evaluate native kernels, GPU rendering
      or alternative tabular storage when a measured bottleneck justifies it. Compare performance,
      compatibility and maintenance costs. Browser/WebAssembly experiments are deferred.
  - [ ] **M4.1.1 - Conditional native Rust image kernel.** After the engine baseline is accepted, select one
        measured hotspot such as preview reduction, mask traversal or connected components. Compare the best
        accepted Python/NumPy/native-library path with a small Rust component called through the same engine API.
    - Acceptance: define the numerical contract and inputs first, count all buffer copies/bridge overhead,
      and preserve the engine API, supported Python callers and legacy scientific references. Initial promotion target:
      >=25% lower end-to-end median latency on each selected representative workload and <=10% peak-RSS growth,
      subject to M2.3's stricter absolute budget where applicable. Record build, portable/installer,
      platform-testing and dependency costs. Keep a default-off experiment and working fallback; stop if the
      target fails. The kernel is internal to the single engine; no broad language migration is selected.
  - [ ] **M4.1.2 - Conditional GPU display or computation.** After separating CPU, I/O and rendering costs,
        evaluate GPU tile display or one suitable numerical operation only where profiling justifies it.
    - Acceptance: compare with the best accepted CPU path, include upload/readback and GPU memory, handle
      device loss with CPU fallback, and validate deterministic/exact outputs or justified tolerances before
      implementation. Training-provider changes and GPU rendering are separate experiments.

### M5 - Release readiness

Complete: M5.2.1, M5.2.2 (documentation corrections) and M5.3 (type checking)
([history](roadmap-history.md#m5---release-readiness)).

- [ ] **M5.1 - Compatibility and reproducibility.** Verify that representative legacy projects open and can be
      recovered, that shared analysis agrees between JavaScript and Python, and that exported tables and figures
      include the information needed to reproduce them. Before a release, verify that the GitHub Actions
      versions used by the workflows run on the supported build matrix (AUD-11; tag existence alone is not proof).
- [ ] **M5.2 - Scientific validation and documentation.** Complete the release requirements in
      [Validation](#validation) and the relevant user guidance. The maintainer decides when to declare 1.0
      and publish it.
- [ ] **M5.4 - Reduce legacy JavaScript type diagnostics (AUD-14).** Replace the baseline entries with checked
      contracts as the corresponding modules are changed.
  - Evaluate `figview.js`, `navpreview.js`, `exportio.js`, `tableview.js` and `edit.js` one at a time
    (`unetmodel.js` and `sectiondepth.js` are already strict). Accept only checked contracts with no new
    diagnostics; prune resolved baseline entries without regenerating a baseline that admits new errors.
  - On the next TypeScript upgrade, migrate the deprecated `moduleResolution: "node"` setting and check
    both typecheck configurations and the diagnostic baseline against the new compiler.
- [ ] **M5.5 - Enforce the standalone module syntax contract (AUD-10).** Make unsupported module syntax
      fail at build time rather than producing an HTML file that fails from disk.
  - Deferred under M8: fix a blocker if the transitional standalone build needs it, otherwise reassess at
    the last-HTML cutover. Keep existing build checks until that documented cutover.
  - Acceptance: fixtures cover supported multiline imports and comments, residual imports/exports,
    export lists/re-exports and relative dynamic imports. Support or explicitly reject each construct with
    actionable diagnostics and no false positives from ordinary strings/comments. Preserve top-level name
    collision checks and dependency order; verify the result from `file://`. Compare standard-library checks
    with a parser only if needed, documenting dependency/offline costs before adding one.
  - Already done (R2, V0.126): local unaliased export lists, with explicit errors for unsupported lists.

### M6 - Advanced-statistics module

- [ ] **M6.1 - Data and method contracts.** Define an analysis dataset from selected cores, proxies,
      ichnological results and event families, with depth/age coordinates, units, missingness, provenance and
      an immutable input snapshot. Specify transformations, compositional variables and independent sampling
      units before selecting methods. Implement methods inside the M8 Python engine; assess required libraries,
      dependency costs and offline desktop packaging without creating another scientific backend.
  - Acceptance: explicit alignment/resampling rules, reproducible filters and transformations, memory limits,
    cancellation and a method registry with assumptions, outputs and predeclared reference tolerances.
- [ ] **M6.2 - Exploratory and association methods.** Implement descriptive/robust summaries, distributions,
      outlier diagnostics and Pearson/Spearman/Kendall association with effective sample counts, missing-data
      handling and uncertainty. Add inspectable plots linked to the selected observations and cores.
  - Acceptance: hand-computed and independent reference fixtures, constants/ties/missingness/unequal units,
    no mutation of measurements and explicit warnings when independence assumptions are unsuitable.
- [ ] **M6.3 - Multivariate analysis.** Implement PCA and hierarchical clustering with explicit scaling,
      distance/linkage choices, explained variance, scores/loadings and sensitivity to variable selection.
      Reuse current clustering/classifier machinery where appropriate instead of duplicating its definitions.
  - Acceptance: reproducible reference results, rank-deficient/collinear and missing-data cases, permutation
    and sign ambiguities handled in validation, and clear separation of exploratory groups from known classes.
- [ ] **M6.4 - Inference and statistical models.** Add regression/GLM and selected group-comparison methods,
      effect sizes, confidence intervals, multiple-testing correction and seeded bootstrap/permutation tests.
      Define blocked or core-level resampling for stratigraphic autocorrelation and repeated observations.
  - Acceptance: assumptions/diagnostics and independent sample counts accompany outputs; synthetic null and
    known-effect tests check calibration. Prevent leakage when choosing variables/scaling and evaluating models;
    document supported designs and validate each method independently before making it available.
- [ ] **M6.5 - Down-core and age-series statistics.** Develop cross-correlation, change-point and spectral
      analyses in separate deliveries, with an explicit treatment of uneven spacing, gaps, detrending,
      autocorrelation and age-model uncertainty. Do not infer causality from correlation or classification.
  - Acceptance: recover known synthetic signals/change depths within declared resolution, test null/aliasing
    cases and report uncertainty/sensitivity to resampling and age models. Define computational limits first.
- [ ] **M6.6 - Program integration and reproducible delivery.** Implement the statistics workspace with
      explicit input selection, transformations, method settings, progress/cancellation and saved analysis runs.
      Export result tables and SVG/PNG figures with input identity, method/version, parameters and random seed.
  - Acceptance: restore the same analysis after project reload, preserve source data and existing workflows,
    invalidate or label outdated results after edits, and verify portable/installed desktop operation offline.
    The interface displays engine results; no standalone-browser scientific implementation is required.
    Deliver validated methods incrementally; do not wait for every proposed method to release the first module.

### M7 - Radiographs and multimodal core images

Use M8's engine-owned source data, calibration and measurements. JavaScript provides the viewer and controls;
it does not implement a second radiograph-analysis path. Large inputs use M8.4/M2.3 services.

- [ ] **M7.1 - Radiograph input and metadata contract.** Inventory public/owner-approved examples and define
      a first 2-D format matrix: native grayscale TIFF/BigTIFF and relevant exported image formats, bit depth,
      intensity polarity, pixel spacing, orientation and depth coverage. Evaluate DICOM only if actual sources
      require it; record decoder, metadata, dependency and offline constraints before implementation.
  - Acceptance: approved fixtures with known raw samples/dimensions and metadata, invalid/unsupported-input
    behaviour, storage estimates and a versioned modality schema. Keep 3-D CT volumes outside this first scope.
- [ ] **M7.2 - Import and radiograph viewer.** Attach radiographs as an additional modality of a core/section,
      retaining the original bytes/native intensities. Provide grayscale window/level, inversion and display
      controls without overwriting calibrated values; use M2.3 for sources beyond resident memory.
  - Acceptance: exact raw sample preservation, high-bit-depth and orientation fixtures, bounded viewing,
    project save/reload and recovery. Previous single-photo projects retain their appearance and results.
- [ ] **M7.3 - Optical/radiograph alignment.** Add physical-scale and depth tie points, side-by-side and
      overlay inspection, cropping/registration controls and explicit handling of unequal resolution, gaps,
      distortion and partial section coverage. Map depth to age through the same selected-core age model.
  - Acceptance: independent known-coordinate fixtures establish alignment error limits before implementation;
    original coordinates remain recoverable and display transforms cannot silently alter analysis depths.
    Persist transformations, calibration provenance and uncertainty independently for each modality.
- [ ] **M7.4 - Radiograph measurements and figures.** Implement reproducible intensity/texture profiles,
      modality-specific annotations and selected analysis-region measurements; integrate them as labelled
      records/image tracks in Data, Multiproxy, statistics and publication figures.
  - Acceptance: reference profiles and region measurements, explicit raw/display/calibrated value distinctions,
    source identity and units in exports, synchronized optical/radiograph depth windows and SVG/PNG output.
    Radiographic contrast must not be treated automatically as density, ichnotaxon identity or bioturbation
    percentage without its own calibration/validation. Validate any such interpretation as a separate method.

## Existing backlog

Unscheduled ideas. None is authorised; each needs scope, acceptance criteria and the maintainer's approval
before work starts. Completed backlog items (F1–F4, G1, R1, R2 and others) are in the
[history](roadmap-history.md#multiproxy-analysis-maps-and-program-features).

### Distribution and publication
- [ ] First public release of the installers
- [ ] Python package on PyPI (`sedcoretool`)
- [ ] Archived release with a DOI (Zenodo)
- [ ] Software paper (`paper/`)
- [ ] Documentation website with example notebooks

### Segmentation and identification
- [ ] U-Net models trained and evaluated on annotated real cores
- [ ] Open dataset of annotated core images and masks, with an annotation protocol and inter-annotator agreement
- [ ] Classical segmentation baselines in Python for comparison
- [ ] Click-assisted segmentation with promptable models
- [ ] Texture descriptors for ichnotaxa

### Validation
- [ ] Automatic versus manual masks versus experts' visual BI/ii estimates
- [ ] Blind comparison of ichnotaxa identification with ichnologists
- [ ] Multiproxy classification on cores with an independent, published interpretation

### Multiproxy analysis and maps
- [ ] Permutation importance of variables (also for the neural network)
- [ ] Kriging variance maps
- [ ] Location map: cores from other projects and an inset location map

### Program
- [ ] Unified data import; age model edited in the core dialog
- [ ] Dedicated horizontal layout for each figure type
- [ ] Simultaneous editing of a shared project
- [ ] Split `app.js` into smaller modules (R1 and R2 done; next candidates: composition and class selectors,
      remaining interface import cycles)

### Further ichnological parameters
- [ ] Ichnodiversity, burrow size, tiering and cross-cutting relationships
- [ ] 3-D CT volumes: scope separately after M7's 2-D input, storage and calibration contracts are evaluated.
