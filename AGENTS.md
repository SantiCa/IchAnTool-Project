# Contributor and AI-assistant guide

This file is the single set of working rules for anyone changing SedCoreTool: human contributors and AI coding
assistants alike (Codex, ChatGPT, Claude, Gemini and others). `CLAUDE.md` and `GEMINI.md` are thin entry points
that import this file. Keep the rules here and nowhere else. If a client does not expand these imports, open
`AGENTS.md` explicitly before working. A new session should read the [current migration handoff](#8-current-migration-handoff)
and the roadmap as well as the general rules; it must not depend on the previous assistant's chat history.

Owner and maintainer: Santiago Casanova-Arenillas. **Reply to the owner in Spanish**; everything committed to the
repository (code, comments, documentation, commit messages) is written in English.

## 1. What the project is

SedCoreTool quantifies bioturbation and ichnotaxa in sediment-core images and combines them with other down-core
records. It has two parts that share the same analysis definitions:

| Part | Path | Language |
|------|------|----------|
| The program (desktop and browser) | `app/` (web application), `desktop/` (Electron packaging) | JavaScript, no build step |
| The Python package `sedcoretool` | `src/sedcoretool/` (`src/ichantool/` is a compatibility alias) | Python ≥ 3.10 |
| Reference version 2.1 (2019) | `legacy/` | Python 3.7 — never modify |

Start with [README.md](README.md) for users and [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md)
for how every part works (§1.4 maps the source files).

## 2. Repository map

```
app/            program: index.html, js/ (ES modules), vendor/ (bundled libraries and fonts)
desktop/        Electron main process, preload, U-Net trainer, build scripts, release notes
src/sedcoretool Python package (analysis, command line, U-Net)
tests/          Python tests, program tests (tests/app), end-to-end tests (tests/e2e), fixtures
examples/       public example data used by tests and by the program when run from the repository
tools/          offline build, version sync, release, vendor update, synthetic data generators
docs/           technical documentation and roadmap
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

## 4. Rules for code

- **Clean Code.** Follow Robert C. Martin's principles, adapted to the language and this repository. Use
  domain-specific names that reveal intent and keep units/state explicit. Give functions/modules coherent
  responsibilities, consistent abstraction levels and clear interfaces; make side effects visible and distinguish
  queries from mutations. Prefer the simplest design that supports the behaviour. Share rules that must evolve
  together, extract meaningful boundaries, and explain rationale rather than restating code. Validate boundaries,
  preserve useful error context, and make small, verifiable improvements within the authorised scope.
- **Shared definitions.** Interval limits, percentages, indices and depth mapping must stay identical in Python
  (`src/sedcoretool/`) and JavaScript (`app/js/core.js`); U-Net tiling likewise (`unet/tiling.py`, `app/js/unet.js`).
  Keep the regression test against `legacy/v2.1_console/example_output.csv` passing.
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
  environment and measured quantities, and use the baseline in [M0.1](docs/roadmap.md#m01-acceptance-criteria)
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

Every delivery that changes code, algorithms, defaults or files includes, in the same commit:

1. **Next version number** `V0.<n>` (the latest is the top entry of `CHANGELOG.md`). Set `DELIVERY` in
   `app/js/app.js` and run `python3 tools/sync_version.py`, which writes `0.<n>.0` to `pyproject.toml`,
   `src/sedcoretool/__init__.py`, `CITATION.cff` and `desktop/package.json` (a test checks them).
2. **`CHANGELOG.md`:** a new entry at the top, `## V0.<n> — YYYY-MM-DD`, with short user-facing bullets (what changed
   for the user, not how the work was organised).
3. **`docs/TECHNICAL_DOCUMENTATION.md`** if an algorithm, formula, default value, file format or validation result
   changes. Formulas there must match the code exactly. It describes current behaviour for any reader: no history, no
   notes addressed to reviewers.
4. **README** if what users see or do changes.
5. **Tests pass:** `pytest -q`, `npm test`, `npm run typecheck`, `python3 tools/sync_version.py --check`, `ruff check src tests tools`;
   run the end-to-end test when the interface or saving changes. Do not re-run them on an unchanged, already verified
   state.
6. **Commit** on `master` with the message `V0.<n>: <summary>` and a short body. Select files explicitly.

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
| Planned work | `docs/roadmap.md` |
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
- **Before committing:** fetch again; if someone else delivered meanwhile, rebase or merge and take the next free
  version number. Never force-push or overwrite others' work.
- **Start each iteration** by reading this file and the current [roadmap](docs/roadmap.md). Find the task
  the maintainer authorised, its acceptance criteria and its editor and reviewer, when assigned. The roadmap
  orders the work. Starting a task requires the maintainer's authorisation.
- **Handoff.** Update the roadmap status when handing work over or delivering it. For an unfinished task,
  record the next step or blocker and point to the work under review if available. Mark a task complete once
  its criteria and required checks pass, and link its changelog entry in the same delivery. Sessions rely on
  the repository for handoffs.
- **GitHub handoff.** At each reviewable checkpoint, check whether the next editor or reviewer can retrieve the
  commit from GitHub. If a push is needed, tell the maintainer promptly and provide the branch, commit SHA,
  checks run and next step. If the work is still local and uncommitted, say what needs to be committed first.
  Raise this at the checkpoint so the handoff can happen even if the session ends early. Push only when authorised.
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
- **Reporting to the owner:** briefly, in Spanish — result, how it was checked, version number, and anything that is
  genuinely pending.

## 8. Current migration handoff

**Scientific implementation baseline:** [V0.143](CHANGELOG.md#v0143--2026-11-12), commit `59ef5dc`,
12 November 2026. Later documentation/version-only deliveries do not imply a new engine capability. Read the
top changelog entry and inspect the actual checkout before relying on this snapshot. Update these pointers
when handing over a later implementation; detailed task status and acceptance criteria stay in the roadmap.

### Approved direction and current boundary

The maintainer chose to simplify the program into a portable/installed desktop application: keep the existing
Electron/JavaScript interface and use one local Python/NumPy scientific engine in a separate process. The
Python API and CLI must reuse that engine's methods. Follow the
[approved M8 sequence](docs/roadmap.md#active-priority-desktop-and-one-scientific-engine); language/framework
selection is settled for this sequence. Rust kernels require measured need and a separate task; a UI rewrite,
Qt/Tauri migration, GPU/Wasm work or another production scientific engine is not part of the current phase.

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

Resume **M8.2.3 — Packaging and lifecycle acceptance** when the maintainer asks to continue; this handoff
request itself changes documentation only. Use its [roadmap criteria](docs/roadmap.md#m8---desktop-simplification-and-a-single-scientific-engine)
and M8.1's gates. Confirm the requested editor/reviewer and available native test environments. Verify
offline installers/portable execution on clean systems, process-tree shutdown/recovery, CPU/RAM accounting,
project preservation and cold verification/startup. Commit validation tools/evidence as small deliveries;
record any unexecuted platform or failed gate instead of marking the aggregate phase complete.

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

Use `master` and the working-copy procedure in §7. These migration deliveries were committed locally;
the handoff does not imply they were pushed or released. Before a remote Claude/Gemini session, verify that
GitHub contains the implementation baseline and the current handoff commit. If it does not, tell the owner
which branch/commits need an authorised push. A session sharing this local checkout can read the commits
directly. Never discard an existing dirty tree or start a second editor on the shared checkout.

Pushing `master` alone does not run the current tag/manual desktop workflow. When remote validation is
authorised, use its manual `workflow_dispatch` with `draft_release=false` for artifacts without a release.
Do not push a version tag merely to obtain CI: tags trigger publication. The owner alone decides releases.

Start by reading this guide, the active M8 roadmap, the contract and the recorded evidence, then report in
Spanish the next concrete phase and the validation gaps. Preserve the maintainer's decisions across models;
do not restart the architecture discussion or present unimplemented roadmap items as available features.
