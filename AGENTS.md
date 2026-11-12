# Contributor and AI-assistant guide

This file is the **only source of working instructions**, shared unchanged by human contributors and every
AI assistant. Keep all rules, objectives and handoff instructions here, with no model-specific policy copies.
`CLAUDE.md` and `GEMINI.md` are compatibility entry points containing only the same single-line import of this
file. They have no independent instructions or status to maintain. If a client does not expand imports, open
`AGENTS.md` explicitly before working. A new session should read the [current migration handoff](#8-current-migration-handoff)
and the roadmap as well as the general rules; it must not depend on the previous assistant's chat history.

Owner and maintainer: Santiago Casanova-Arenillas. **Reply to the owner in Spanish**; everything committed to the
repository (code, comments, documentation, commit messages) is written in English.

## 0. Quick start for any assistant (read this first)

Follow these steps in order. They apply to every model, including smaller ones.

1. **Read the state.** Open [docs/roadmap.md § Status and handoff](docs/roadmap.md#status-and-handoff). It names the
   active branch, the checks still due and the next steps. You do not need the rest of the roadmap unless a
   task points to it; completed tasks are in `docs/roadmap-history.md` and rarely need reading.
2. **Check the checkout.** `git status --short --branch`. On a clean tree, stay on the branch the handoff names.
   A dirty tree is someone else's work: do not stash, reset, clean or switch branches (§7).
3. **Run pending checks first** if the handoff says "checks pending" (§5, step 4).
4. **Do only what the maintainer asked**, using the smallest scope that satisfies the request. A task's
   acceptance criteria in the roadmap define "done". If the request is broad, pick one task, state your
   assumption and continue; ask only when a consequential choice cannot be inferred (§7).
5. **Change code the safe way (§4).** Find the owner of the behaviour with the source map in
   [docs/TECHNICAL_DOCUMENTATION.md §1.4](docs/TECHNICAL_DOCUMENTATION.md); keep Python and JavaScript
   definitions identical; add a test next to the code you change.
6. **Document in the same commit (§5, step 2):** `CHANGELOG.md` under `## Unreleased`, plus the technical
   manual or README when behaviour changes. Do not create a version number; the maintainer asks for it.
7. **Commit on the branch** with explicit file names and a descriptive message. Never force-push, and push
   only when asked.
8. **Update the handoff** in the roadmap (branch, commit, checks run, next step, open decisions), then
   **report to the maintainer in Spanish** (§7).

Where things are: `app/js/` interface and shared calculations · `src/sedcoretool/` Python package and engine ·
`desktop/` Electron shell · `tools/` measuring and build scripts · `tests/` all tests · `docs/validation/` measured
evidence · `legacy/` never modify.

## 1. What the project is

SedCoreTool quantifies bioturbation and ichnotaxa in sediment-core images and combines them with other down-core
records. It currently has two parts that share the same analysis definitions; the desktop migration in
[§8](#8-current-migration-handoff) is replacing those duplicated calculations with one local Python engine:

| Part | Path | Language |
|------|------|----------|
| The program (desktop and browser) | `app/` (web application), `desktop/` (Electron packaging) | JavaScript, no build step |
| The Python package `sedcoretool` | `src/sedcoretool/` (`src/ichantool/` is a compatibility alias) | Python ≥ 3.10 |
| Experimental desktop engine, off by default | `src/sedcoretool/engine/`, started by `desktop/engine.js` with the bundled runtime | Python 3.12 runtime |
| Reference version 2.1 (2019) | `legacy/` | Python 3.7 — never modify |

Start with [README.md](README.md) for users and [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md)
for how every part works (§1.4 maps the source files).

### 1.1 Maintainability objective

The maintainer requires a **modular, understandable and easily editable program**, with a small amount of
context needed to change or review one workflow. Clear responsibilities, explicit interfaces and focused
changes should reduce repeated reading, assistant token consumption and avoidable review rounds while
preserving scientific validation and review quality. This is a continuing objective for the desktop/engine
migration and later features; see the [roadmap objective](docs/roadmap.md#cross-cutting-objective-modularity-and-reviewability).

## 2. Repository map

```
app/            program: index.html, js/ (ES modules), vendor/ (bundled libraries and fonts)
desktop/        Electron main process, preload, engine client, runtime lock, U-Net trainer, build scripts, release notes
src/sedcoretool Python package (analysis, command line, U-Net, engine/ process)
tests/          Python tests, program tests (tests/app), end-to-end tests (tests/e2e), fixtures
examples/       public example data used by tests and by the program when run from the repository
tools/          offline build, version sync, release, vendor update, synthetic data generators
docs/           technical documentation, roadmap (+ roadmap-history), engine contract, validation evidence, benchmarks, diagnostics
paper/          software paper (JOSS) and its bibliography
legacy/         original version 2.1, unchanged
```

## 3. Setting up and running

```bash
pip install -e ".[dev]"                 # Python package with test dependencies
pytest -q                               # Python tests
npm test                                # program tests (Node 22; same as: node --test tests/app/*.test.mjs)
npm ci && npm run typecheck             # JavaScript type checks (Node 22)
python3 -m http.server 8765             # then open http://localhost:8765/app/
python3 tools/build_standalone.py       # offline file -> dist/SedCoreTool_V0.<n>.html (dist/ is not committed)
cd desktop && npm ci && npm start       # desktop program; npm run dist builds installers for the current system
npm i --no-save puppeteer-core@23 && node tests/e2e/smoke.mjs   # browser end-to-end test (needs the server above and Chrome)
```

On Windows with a local virtual environment: `python -m venv .venv`, `.\.venv\Scripts\python.exe -m pip install -e
".[dev]"`, then `.\.venv\Scripts\python.exe -m pytest -q`. Do not reinstall dependencies if the environment works.
`pytest` finds the package through `pythonpath = ["src"]`, so an existing Python with the test dependencies works
without an editable install. On the maintainer's workstation `.venv/` holds build caches and review tools (Ruff
under `.venv/review-tools`), not a virtual environment.

**Tools on the maintainer's Windows workstation** (verified 12 November 2026; the shell may not have them on
PATH, so call them by full path): Python 3.12 with pytest at `C:\Users\Santiago\anaconda3\python.exe`
(`python` in Git Bash may resolve to a different Python without pytest); Node 22 in `C:\Program Files\nodejs`
(`$env:Path += ';C:\Program Files\nodejs'`, then `npm.cmd`); Ruff at `.venv\review-tools\bin\ruff.exe`.
Quick checks that need no setup: `node --test tests/app/<file>.test.mjs`,
`<python> -m pytest -q <file>`, `<ruff> check src tests tools`.

## 4. Rules for code

- **Clean Code.** Follow Robert C. Martin's principles, adapted to the language and this repository. Use
  domain-specific names that reveal intent and keep units/state explicit. Give functions/modules coherent
  responsibilities, consistent abstraction levels and clear interfaces; make side effects visible and distinguish
  queries from mutations. Prefer the simplest design that supports the behaviour. Share rules that must evolve
  together, extract meaningful boundaries, and explain rationale rather than restating code. Validate boundaries,
  preserve useful error context, and make small, verifiable improvements within the authorised scope.
- **Modularity and review cost.** Organise code around meaningful domain responsibilities, with explicit
  inputs, outputs, dependencies and ownership. Keep scientific methods, persistence/process IO and interface
  wiring behind their respective boundaries. A reviewer should be able to locate a behaviour and understand
  its contract without reading the whole application. Use discoverable names, concise module documentation,
  targeted source reads and small, independently verifiable diffs. Keep context sufficient to validate the
  change; spend fewer tokens by improving structure and avoiding repeated exploration. Preserve the clarity
  of each workflow when choosing module boundaries and abstraction levels. Scope extractions to the authorised
  phase, retain supported APIs, and update the source map and relevant tests when a boundary changes.
- **Shared definitions.** Interval limits, percentages, indices and depth mapping must stay identical in Python
  (`src/sedcoretool/`) and JavaScript (`app/js/core.js`); U-Net tiling likewise (`unet/tiling.py`, `app/js/unet.js`).
  Keep the regression test against `legacy/v2.1_console/example_output.csv` passing.
- **Scientific ownership during the migration.** Implement new scientific methods once, in the Python engine
  (`src/sedcoretool/`), following the [migration contract](docs/roadmap-engine-contract.md); the interface
  requests and displays their results. Change existing JavaScript calculations only to fix or preserve current
  behaviour until their M8 slice replaces them. Keep the engine protocol, method contracts and result formats
  independent of Electron and of the renderer, so that a later interface shell can reuse them unchanged (§8);
  Electron-specific process, IPC and packaging code stays in `desktop/`.
- **Pure modules.** `core.js`, `edit.js`, `imageproc.js`, `learn.js`, `log.js`, `zip.js`, `geo.js`, `interp.js`,
  `locmap.js`, `plot.js`, `sheet.js`, `exportio.js` and `unet.js` must not use the DOM, so they can be tested with
  Node. A new module must be added to `ORDER` in `tools/build_standalone.py`, and top-level names must not clash
  across modules.
- **Compatibility of saved data.** Do not rename the browser storage keys (`ichantool.*`, `corantool.*`), the
  IndexedDB database `ichantool`, the desktop origin `app://corantool` or `window.corantoolDesktop`: users would lose
  their projects. Keep reading project files written as `IchAnTool` or `CorAnTool` and `.corantool` packages. Keep the
  `ichantool` Python alias.
- **Public APIs.** Preserve existing callers. Any approved breaking change needs a documented migration path
  and regression coverage for supported inputs.
- **Measure performance.** Back performance claims with a reproducible benchmark. Record the inputs,
  environment and measured quantities, and use the baseline in [M0.1](docs/roadmap-history.md#m01-acceptance-criteria)
  when it covers the affected path.
- **Safe I/O.** Handle corrupt, oversized and hostile inputs. Bound resource use when processing untrusted
  files. For filesystem project saves, use a temporary file and atomic replacement where supported. For
  IndexedDB, use transactions. Verify recovery and preservation of the last good save after a failed write.
- **Incremental delivery.** Split broad changes into small, independently testable deliveries. Gate major refactors
  behind a feature flag and keep the current path as the default until the new path passes its acceptance criteria.
  Define how to roll back and when to remove the flag.
- **Dependency discipline.** Prefer existing or standard-library facilities. Justify new dependencies with a
  concrete capability or measured benefit. Before adding a heavy dependency, compare it with the smallest viable
  alternative and document the maintenance, runtime and distribution costs, including offline and desktop use.
- **No private data.** Never commit unpublished data or results of the owner or anyone else. The repository and the
  downloads contain only public example data.
- **Interface texts** go in `app/js/i18n.js`, in Spanish and English.
- **Regression coverage.** Add tests for new features and behaviour changes. Use property-based tests for
  critical invariants where appropriate. When changing scientific code, test numerical equivalence against
  reference results on representative inputs and relevant edge cases. Use exact equality where required and
  define and justify any tolerances before validation. Test an explicitly requested scientific change against
  its new expected results and verify that unaffected outputs remain equivalent. Documentation-only edits
  require no new tests.
- **Documentation.** Update user and technical documentation as required by [section 5](#5-delivering-a-change).

## 5. Delivering a change

**Session work happens on a branch; a version is created only when the maintainer asks.** Set by the
maintainer on 12 November 2026 to avoid a new version for every request and repeated full test runs.

1. **Work branch.** Start or continue the active branch recorded in the
   [roadmap handoff](docs/roadmap.md#status-and-handoff), or create `work/<YYYY-MM-DD>` from `master`. Commit there
   with descriptive messages and explicitly selected files. Do not change the version number on the branch.
2. **Documentation with each change**, in the same branch commit:
   - **`CHANGELOG.md`:** short user-facing bullets (what changed for the user, not how the work was organised)
     under `## Unreleased` at the top.
   - **`docs/TECHNICAL_DOCUMENTATION.md`** if an algorithm, formula, default value, file format or validation result
     changes. Formulas there must match the code exactly. It describes current behaviour for any reader: no history,
     no notes addressed to reviewers.
   - **README** if what users see or do changes.
3. **Checks during the session:** run only quick, focused checks for what changed (for example one test file).
   Do not run the full suite after every request.
4. **End of session:** run the full checks once — `pytest -q`, `npm test`, `npm run typecheck`,
   `python3 tools/sync_version.py --check`, `ruff check src tests tools`, plus the end-to-end test when the interface
   or saving changed — and record the result and the commit checked in the roadmap handoff. If the session ends
   before they run, record **checks pending** with the branch and commit; the next assistant runs them first.
   Do not re-run them on an unchanged, already verified state. Run independent suites serially (see the open
   M8.2.3 load observation).
5. **New version, only on the maintainer's request:** take the next number `V0.<n>` (the latest is the top
   versioned entry of `CHANGELOG.md`). Set `DELIVERY` in `app/js/app.js` and run `python3 tools/sync_version.py`,
   which writes `0.<n>.0` to `pyproject.toml`, `src/sedcoretool/__init__.py`, `CITATION.cff`, `desktop/package.json`
   and the release notes (a test checks them). Rename `## Unreleased` to `## V0.<n> — YYYY-MM-DD`, point roadmap
   references to that entry, make sure the full checks pass on the final state, and integrate the branch into
   `master` as one commit `V0.<n>: <summary>` with a short body.

Version 1.0 is reserved for when the owner declares the program complete.

**Releases.** `tools/release.sh` checks branch, clean tree, versions and tests, and pushes the tag `V0.<n>`; GitHub
Actions (`.github/workflows/desktop.yml`) then builds Windows, macOS and Linux installers and publishes the Release.
A manual run of *Desktop builds* on `master` with `draft_release` prepares an unpublished draft instead. Before a
release, update `desktop/RELEASE_NOTES.md` (the text of the GitHub Release). Only the owner decides when to publish a
release or a DOI.

## 6. Documentation: what goes where

| Content | Place |
|---------|-------|
| What the software is for, installation, how to use it | `README.md` |
| How each part works: methods, formulas, defaults, file formats, validation | `docs/TECHNICAL_DOCUMENTATION.md` |
| What changed in each version | `CHANGELOG.md` |
| Planned and in-progress work, current status and next steps | `docs/roadmap.md` |
| Records of completed roadmap tasks (read only when a task asks for them) | `docs/roadmap-history.md` |
| Desktop release notes (text of the GitHub Release) | `desktop/RELEASE_NOTES.md` |
| How to contribute (humans) | `CONTRIBUTING.md` (short; points here) |
| Working rules (humans and AI assistants) | this file |
| Software paper | `paper/` |

Do not repeat content between these files; link instead. Keep the tone factual and professional.

## 7. Working with several people or assistants

- **One editor at a time** on a shared working copy, even for different files: the version number and the changelog
  are shared. Other sessions may read and review.
- **Before editing:** `git fetch origin`, `git status --short --branch`, and `git pull --ff-only` on a clean tree.
  A dirty tree may contain someone else's work: do not stash, reset, clean or discard it, and do not switch branches.
  On a clean tree, continue the active work branch recorded in the roadmap handoff (§5).
- **Before committing:** fetch again; if someone else delivered meanwhile, rebase or merge and take the next free
  version number when creating a version. Never force-push or overwrite others' work.
- **Start each iteration** by reading this file and the current [roadmap](docs/roadmap.md). If its handoff records
  checks pending, run them before new work. Find the task the maintainer authorised, its acceptance criteria and
  its editor and reviewer, when assigned. The roadmap orders the work. Starting a task requires the maintainer's
  authorisation.
- **Handoff.** Update the roadmap status when handing work over or delivering it. For an unfinished task,
  record the next step or blocker and point to the work under review if available. Mark a task complete once
  its criteria and required checks pass, and link its changelog entry in the same delivery. Sessions rely on
  the repository for handoffs.
- **Local handoff.** The maintainer runs all assistants on one computer in this same checkout and editor
  (12 November 2026), so handoffs use local commits and the roadmap; GitHub is not needed for them. At each
  reviewable checkpoint, make sure the work is committed and the roadmap names the branch, commit, checks run
  and next step. Push only when the maintainer asks (for example for CI, a release or a remote reviewer).
- **Explain each step to the maintainer.** After completing each step, report in Spanish what you did, how you
  checked it and how any implementation works within SedCoreTool as a whole. Describe the affected components and
  how data or control passes between them. Include open work and limitations in the final report.
- **Interpret requests by intent.** If the maintainer gives a broad instruction, infer the smallest concrete scope
  from the request, the repository and the roadmap. Identify the affected workflow and acceptance criteria before
  editing. For performance work, choose the specific path, representative inputs and a reproducible benchmark for
  before-and-after comparison. State material assumptions and ask only when the goal or a consequential choice
  cannot be inferred.
- **One phase at a time.** Split requests that combine independent workstreams, such as UI, GPU, WASM and DuckDB,
  into ordered, independently verifiable phases. Work on the first authorised phase and record the others in the
  roadmap. Do not start unrelated refactors, audits or backlog work. Do not launch sub-agents or automations unless
  asked.
- **Reporting to the owner:** briefly, in Spanish — result, how it was checked, branch and commit (or version
  number when one was created), and anything that is genuinely pending, including checks not yet run.

## 8. Current migration handoff

**Scientific implementation baseline:** [V0.143](CHANGELOG.md#v0143--2026-11-12), commit `59ef5dc`,
12 November 2026. Later deliveries (V0.144–V0.148 and the `## Unreleased` entries) do not add a scientific
method; they add documentation, workflow rules, lifecycle fixes and measuring tools for the engine process.
Read the top changelog entries and inspect the actual checkout before relying on this snapshot. Update these
pointers when handing over a later implementation; detailed task status and acceptance criteria stay in the roadmap.

### Approved direction and current boundary

The maintainer chose to simplify the program into a portable/installed desktop application: keep the existing
Electron/JavaScript interface and use one local Python/NumPy scientific engine in a separate process. The
Python API and CLI must reuse that engine's methods. Follow the
[approved M8 sequence](docs/roadmap.md#active-priority-desktop-and-one-scientific-engine); language/framework
selection is settled for this sequence. Rust kernels require measured need and a separate task; a UI rewrite,
Qt/Tauri migration, GPU/Wasm work or another production scientific engine is not part of the current phase.

**Interface shell and distribution.** On 12 November 2026 the maintainer confirmed that Electron is the interface
shell for now and that a more fluid shell may replace it later. That is a conditional evaluation after M8.6
([M9.1](docs/roadmap.md#m9---interface-shell-evolution-conditional)), not current work, and no candidate is
selected. Design M8 so that such a change touches only the interface: a shell-independent engine protocol and
method contracts (§4), and stored projects that can be migrated through supported packages. The program is
delivered per platform as portable and installed packages with the scientific runtime included; each shipped
form needs its own acceptance. The browser/HTML file remains a transitional compatibility path until M8.6.

**The scientific migration is not complete.** The interface still performs its current JavaScript analysis.
The experimental process advertises only `buffer.digest/1`, a transport/worker diagnostic. It does not yet
calculate section percentages or BI/ii for the interface. The bundled numerical/image libraries and public
Python API have been smoke-tested; that is not evidence that the desktop analysis was migrated. Keep the
current browser/HTML reference path and saved-data compatibility until M8.6's explicit cutover criteria pass.

The experiment is **off by default**, enabled only by `SEDCORETOOL_ENGINE_EXPERIMENT=1`. Keep that default.
An invalid/missing bundled runtime must report unavailable, with no system-Python search, runtime dependency
download or silent scientific fallback. A source-development-only absolute `SEDCORETOOL_ENGINE_PYTHON`
override is unverified and is ignored in packaged mode. User projects, editing and saving keep their existing
owners; runtime integrity failure must not replace live results or change the last good save.

### Delivered work and authoritative evidence

| Delivery | Reference | Continue from |
|---|---|---|
| M8.1: inventory and protocol/scientific contracts | V0.141, `6b4368a` | [Contract and predeclared gates](docs/roadmap-engine-contract.md); do not reconstruct scientific semantics from names alone. |
| M8.2.1: bounded process/transport foundation | V0.142, `e7f3390` | [Technical manual §26.2](docs/TECHNICAL_DOCUMENTATION.md#262-experimental-engine-process); framing, immutable buffers, queues, cancellation, failure and restart. |
| M8.2.2: locked portable runtime and integrity checks | V0.143, `59ef5dc` | [Technical manual §26.3](docs/TECHNICAL_DOCUMENTATION.md#263-bundled-scientific-runtime), [runtime lock](desktop/runtime-lock.json), [recorded evidence](docs/validation/M8.2.2-v0.143.json). |

The evidence identifies what was tested on Windows, test counts, runtime hashes and what was **not** validated.
Read it before claiming acceptance. In particular, an unpacked Windows build, restricted-PATH startup and
source-mode Electron E2E do not certify clean-machine installation, Windows portable/NSIS execution, native
macOS Intel/Apple Silicon, Linux, the final universal DMG, or whole-process performance/memory gates. M8.2
remains open. No independent reviewer or completed remote CI run is implied by author-run local checks.

**Open observation for M8.2.3:** during V0.144's documentation checks, running both test suites alongside an
offline runtime reconstruction produced worker wait/liveness timeouts and one Node ENGINE_UNAVAILABLE failure.
This is [recorded evidence](docs/validation/M8.2.3-load-observation-v0.144.json), not an established causal
diagnosis or a new acceptance result. Preserve the observation even if a serial run passes; reproduce matched
idle/load cases before certifying lifecycle deadlines. Do not widen deadlines or suppress tests to make this
handoff green. No engine implementation change is authorised by the documentation-only handoff request.

### Next implementation candidate

**M8.2.3 (Windows packaging and lifecycle acceptance) was closed on 12 November 2026** on the branch recorded in
the [roadmap status](docs/roadmap.md#status-and-handoff); its measurements are in the
[history](docs/roadmap-history.md#m823---packaging-and-lifecycle-acceptance-windows). **M8.2.4** carries what it
left open (cold first launch against the 5 s gate, intermittent ZIP no-window launch, process tree with a project,
macOS/Linux, clean machine) and must be closed or waived item by item before M8.2 is complete and M8.3 is
authorised. Decisions of 12 November 2026: the Windows portable is a ZIP of the program folder, and launch
verification keeps a verified-identity record (technical manual §26.3). Commit tools and evidence as small
deliveries; record any unexecuted platform or failed gate instead of marking the aggregate phase complete.

**M8.3 comes after this acceptance phase:** the first scientific section slice, including masks, ROI,
exclusions, overlaps and assignments. Its contract records representation gaps, no-data/manual/age processing
and custom-tier precedence differences between existing public interfaces. Preserve supported semantics and
test them explicitly; do not silently substitute a library default or delete the reference implementation.
Large images, remaining methods, advanced statistics and radiographs follow the roadmap dependencies.

### Implementation entry points

| Concern | Files |
|---|---|
| Process lifecycle and status-only Electron bridge | `desktop/engine.js`, `desktop/main.js`, `desktop/preload.js` |
| Wire framing and packaged-resource verification | `desktop/engine-protocol.js`, `desktop/engine-runtime.js` |
| Coordinator, buffers and isolated diagnostic worker | `src/sedcoretool/engine/` |
| Exact runtime/wheel artifacts, hashes and update policy | `desktop/runtime-lock.json`, [SECURITY.md](SECURITY.md#desktop-scientific-runtime) |
| Preparation, native smoke and package checks | `tools/prepare_engine_runtime.py`, `tools/check_engine_runtime.py`, `desktop/scripts/prepare-runtime.js`, `desktop/scripts/build.js`, `desktop/scripts/check-package.js` |
| Regression and real desktop workflow checks | `tests/test_engine_transport.py`, `tests/test_runtime_bundle.py`, `tests/app/engine*.test.mjs`, `tests/app/trainer.test.mjs`, `tests/e2e/desktop.mjs` |
| Native build/CI configuration | `.github/workflows/desktop.yml`; configured jobs are not proof they ran successfully. |

Keep algorithm/format/limit definitions in the technical manual and migration contract, not duplicated here.
The compatibility identifiers and preservation requirements in §4 still apply. Do not modify `legacy/`.

### Reconstructing the development environment

Runtime binaries, `desktop/runtime/`, `.venv/` caches and `desktop/dist/` are ignored by Git. Another checkout
must reconstruct resources from the lock; copied local binaries are not an authoritative dependency source.
Reuse a working dependency environment rather than reinstalling it. On Windows use `npm.cmd` if execution
policy blocks `npm.ps1`. Discover available Python/Node/Ruff executables explicitly if a noninteractive shell
does not load the previous session's aliases or PATH. In a fresh PowerShell at the repository root, replace the placeholder with an
existing Python **3.12** executable with pip (this is a build-time requirement):

```powershell
$env:Path += ';C:\Program Files\nodejs'
$env:SEDCORETOOL_BUILD_PYTHON = 'C:\path\to\python.exe'
Push-Location desktop
npm.cmd run prepare-runtime
# With all verified artifacts already cached, use: npm.cmd run prepare-runtime -- --offline
$env:SEDCORETOOL_ENGINE_EXPERIMENT = '1'
Remove-Item Env:SEDCORETOOL_ENGINE_PYTHON -ErrorAction SilentlyContinue
npm.cmd start
Pop-Location
```

Inspect `await window.corantoolDesktop.engine.status()`; the bundled path reports `bundled-verified` and
`ready` with only the diagnostic method. Unset the experiment variable and restart for the default path.
See README and §26.3 for build/check commands, native resource layouts and rollback/update policy.

**After a version bump or Python source change, prepare the runtime again before testing the experiment.**
Its manifest binds the application version and prepared source hashes; rejection of a stale bundle is
intentional. `tools/sync_version.py` does not rebuild it. Keep historical delivery evidence tied to the
version it validated; a metadata-only delivery must not relabel old measurements as new acceptance results.

### Moving to another assistant or machine

Use the active work branch recorded in the roadmap handoff, or `master` when none is recorded, and the
working-copy procedure in §7. Assistants normally share this local checkout and read the commits directly;
local commits are not pushed or released. Only if the maintainer starts a session on another machine or a
remote service, check whether GitHub contains the needed commits and tell the owner which branch/commits
need an authorised push. Never discard an existing dirty tree or start a second editor on the shared checkout.

Pushing `master` alone does not run the current tag/manual desktop workflow. When remote validation is
authorised, use its manual `workflow_dispatch` with `draft_release=false` for artifacts without a release.
Do not push a version tag merely to obtain CI: tags trigger publication. The owner alone decides releases.

Start by reading this guide, the active M8 roadmap, the contract and the recorded evidence, then report in
Spanish the next concrete phase and the validation gaps. Preserve the maintainer's decisions across models;
do not restart the architecture discussion or present unimplemented roadmap items as available features.
