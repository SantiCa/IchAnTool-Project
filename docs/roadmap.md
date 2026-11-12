# Roadmap

## Status and handoff

Use the [shared working rules](../AGENTS.md#7-working-with-several-people-or-assistants) for each iteration.
Keep task IDs stable. The changelog records what shipped.

| Marker | Meaning |
|---|---|
| `[ ]` | Pending. The task is in the backlog. |
| `[ ]` **Ready** | The scope and acceptance criteria are defined. This is the next candidate for authorisation. |
| `[ ]` **In progress** | An editor is assigned. Record the next step at handoff. |
| `[ ]` **In review** | The reviewer can inspect the diff or commit. Include its reference and the checks still due. |
| `[ ]` **Blocked** | Record the blocker and what is needed to resume. |
| `[x]` | Complete. For new deliveries, link the matching changelog entry. |

## Milestones toward 1.0

### Active priority: desktop and one scientific engine

The maintainer approved this direction and roadmap reprioritisation on 12 November 2026, delivered in
[V0.140](../CHANGELOG.md#v0140--2026-11-12). This order supersedes earlier "next candidate" handoffs and
the previous audit/expansion ordering. Completed work and task IDs remain valid. This delivery changes
planning and version metadata; the current runtime, supported files and calculations remain unchanged.

**Target architecture:** retain the existing Electron/JavaScript interface and move scientific calculation
behind one local Python/NumPy engine in a separate process. The Python API and CLI call that same engine.
JavaScript owns interaction and presentation; it does not maintain an independent implementation of the
scientific methods. Native libraries and optional measured Rust kernels may be internal engine components.
One authoritative implementation per method is the goal, not one programming language for every component.
Replacing Electron with Qt or Tauri, a whole-program Rust rewrite and a new browser engine are outside this sequence.

**Distribution:** desktop portable/installed packages become the primary full-capability product, with a
tested 64-bit scientific runtime included rather than depending on the user's Python installation. Keep the
current browser/standalone path working as a temporary compatibility/reference path during migration. New
engine-dependent scientific features target desktop; a later explicit cutover freezes the last standalone
version and its project-export route. Do not remove the current HTML or change storage identifiers now.
The scriptable Python package remains a supported interface to the same engine, not a second calculation path.

| Execution order | Deliverable | Existing tasks coordinated with it |
|---|---|---|
| 1 | M8.1: inventory, scientific ownership and engine contract | M5.1, M5.4; retain current reference fixtures |
| 2 | M8.2: packaged local runtime and cancellable process boundary | M3.2.4, M3.1.7 |
| 3 | M8.3: one section analysed by the engine through the existing interface | M3.1.6, M0.1, M1.2 |
| 4 | M8.4: bounded image/data ownership and large-file integration | M2.3.1–M2.3.5 |
| 5 | M8.5: remaining methods migrated in independent vertical slices | M3.2.5 before training migration; M3.3 contracts |
| 6 | M8.6: desktop promotion and retirement of duplicate scientific paths | M5.1; legacy-project/export and packaging gates |
| 7 | Advanced statistics and radiographs on the accepted engine | M6.1–M6.6, M7.1–M7.4; no new parallel JavaScript science |
| 8 | Conditional acceleration and remaining backlog | M4.1, remaining audit/validation/release tasks |

M8.1 is the next implementation task. Assign editor/reviewer at each implementation handoff; no runtime
migration is marked started by this planning commit. Fixes required to preserve data or satisfy a phase's
acceptance criteria stay within that phase; unrelated refactors wait. Publication and 1.0 remain owner decisions.

Planning delivery checks: 313 Python tests passed (six optional/permission skips), 218 Node tests,
JavaScript types without new diagnostics, Ruff, version consistency, whitespace and standalone build pass.
The interface/save implementation is unchanged, so no new tests or repeated browser E2E are needed.
Local delivery on `master`; GitHub retrieval requires the maintainer's authorised push.

### M8 - Desktop simplification and a single scientific engine

- [ ] **M8.1 - Engine inventory and migration contract. Ready.** Map current JavaScript/Python calculations,
      callers, caches and image/data ownership. Include interval counts/indices, depth/age mapping, image
      operations/features, classification, interpolation and U-Net. Identify both duplicated methods and
      methods that currently exist only in JavaScript; do not assume the Python package already covers the app.
  - Acceptance: a source-backed ownership/migration matrix, versioned request/result/data contracts and an
    ordered list of independently testable slices. Define identifiers, units, masks/overlaps/exclusions,
    input revisions, seeds, provenance, errors, progress and cancellation. Select a bounded private local
    transport; large pixel buffers must not become JSON arrays copied through every request.
    Establish matched numerical, latency, cancellation and total-process memory gates before implementation.
- [ ] **M8.2 - Local engine process and reproducible packaging.** Build the desktop process boundary and
      include a tested 64-bit Python runtime with the minimal scientific dependencies. Use M3.2.4 for tested
      constraints, checksums and update policy; keep optional training dependencies separate from basic analysis.
  - Acceptance: clean-machine startup without a separately installed Python/Node or runtime dependency
    download for basic analysis; verify portable/installed packages across the supported desktop systems.
    Bound messages, queue length, concurrent jobs and CPU/RAM budgets. Isolate process failure, restart,
    timeout and cancellation; obsolete results cannot overwrite newer edits. Preserve unsaved live data and
    the last good project after engine failure. Keep the normal interface available while jobs run.
- [ ] **M8.3 - First scientific vertical slice: section counts and indices.** Connect one section's
      current mask, ROI, exclusions, overlaps and class assignments to engine interval analysis, then display
      the returned percentages and BI/ii in the existing interface. Reuse the public Python analysis path;
      evaluate the measured NumPy implementation under M3.1.6 without silently changing its default.
  - Acceptance: exact row/count/index/missing-value equality and the established numerical tolerances on
    M0.1/M3.1.3 fixtures, including fractional boundaries and custom schemes. Verify edits, undo/redo,
    cancellation, failed jobs, CSV output and save/reopen through the actual desktop workflow. Measure engine
    startup, transfers, full job latency and total Electron/engine/worker RSS, not only the counting kernel.
    Keep this experiment default-off until its predeclared gates pass; retain explicit developer rollback.
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

### Capacity, advanced statistics and radiographs

The maintainer requested this planning extension on 12 November 2026, delivered in
[V0.138](../CHANGELOG.md#v0138--2026-11-12). It defines pending development and implementation phases;
it does not claim these capabilities are available or start their implementation. No editor or reviewer is
assigned to these feature tasks. The active M8 sequence now defines their dependencies and priority;
the maintainer chooses which capabilities are required for 1.0.

| Goal | Tasks | Dependencies and proposed sequence |
|---|---|---|
| Fluid work with individual images of several gigabytes | M2.3.1–M2.3.5 | Establish real file/decoded-size benchmarks, then bounded tile access, viewing, analysis and saving. |
| Faster calculations with a responsive interface | M3.1.6–M3.1.7, M4.1.1–M4.1.2 | Build on the single engine and bounded scheduling; native Rust/GPU work remains conditional and later. |
| An implemented advanced-statistics module | M6.1–M6.6 | Use the accepted Python engine contract; methods are not reimplemented independently in the interface. |
| Radiographs alongside core photographs and records | M7.1–M7.4 | Use engine image/data services for native samples and measurements, with shared depth coordinates. |

M2.3.1 is the first large-image contract inside M8.4, after the initial engine slice. M6.1 and M7.1 define
scientific/input contracts after the relevant engine/data services are accepted. Large radiographs depend on M2.3's bounded image
path. Each phase must be small enough to review and roll back independently; statistical methods are added
one at a time. Retain the current implementation as the default during major experiments and define flag
removal only after acceptance. Benchmarks use public or generated data; unpublished images are not committed.

Planning delivery verification: 267 Python tests passed (six optional/permission skips), 218 Node tests,
JavaScript types, Ruff, version consistency, whitespace and standalone build pass. No analysis, interface or
save implementation changes; no new tests or repeated browser E2E are needed. Local delivery on `master`;
GitHub retrieval requires an authorised push. Earlier audit priority is superseded by the active M8 sequence;
M3.2.5 remains a dependency before the training migration.

### Audit triage and proposed priority

The maintainer requested incorporation of the supplied V0.123 technical audit on 11 November 2026;
the planning update is delivered in [V0.125](../CHANGELOG.md#v0125--2026-11-11).
The findings below were checked against V0.124 source and existing tasks. This is source triage, not
an independent security review or a completed reproduction of every reported defect. The audit's
implementation checklist, suggested dependency versions and agent assignments are not execution authority.
Tasks without a subsequent authorisation recorded below remain pending; incorporation alone assigns no
editor or reviewer and does not authorise implementation.

Historical proposed order, now subordinate to the active M8 sequence: address desktop path containment, untrusted presentation values and preservation of trained
models first (M0.4, M0.5, M3.2.3); correct scientific documentation next (M5.2.1–M5.2.2); then validate manifest,
palette and training reproducibility contracts, build safety and trainer dependencies. Type-only corrections,
further modularisation and LAS metadata policy follow as separate small deliveries. Pending audit tasks remain
tracked below and enter the migration when their contracts are touched; this does not authorise a release.

| Audit ID | Disposition after source review | Roadmap task |
|---|---|---|
| AUD-01 | Retraining is staged and complete model/evaluation generations are published atomically in [V0.130](../CHANGELOG.md#v0130--2026-11-11) | M3.2.3 |
| AUD-02 | Prefix-only containment check replaced with directory-boundary and URL validation in [V0.127](../CHANGELOG.md#v0127--2026-11-11) | M0.4 |
| AUD-03 | No-data and presentation colours validated against `#rgb`/`#rrggbb` with attribute escaping in [V0.128](../CHANGELOG.md#v0128--2026-11-11) | M0.5 |
| AUD-04 | Short/full hexadecimal palette inputs and class-specific errors validated in [V0.139](../CHANGELOG.md#v0139--2026-11-12) | M3.3.1 |
| AUD-05 | Fractional bin size still has an integer annotation | M3.3.2 |
| AUD-06 | Existing escaping verified through CSV/literal-text XLSX round trips; missing-value-like identifiers preserved and editing rules documented in [V0.137](../CHANGELOG.md#v0137--2026-11-12) | M3.3.3 |
| AUD-07 | LAS uses ASCII replacement; choose an explicit metadata policy before changing output | M3.3.4 |
| AUD-08 | Training seeds process-global random generators | M3.2.5 |
| AUD-09 | Managed trainer constraints are already pending; do not adopt untested example version caps | M3.2.4 |
| AUD-10 | Standalone import/export stripping has a restricted syntax contract | M5.5 |
| AUD-11 | Missing-tag allegation not confirmed; currently referenced major tags exist | Verification note below; M5.1 release checks |
| AUD-12 | Python exclusion support and application-only drawing/noDataPad differences documented in [V0.131](../CHANGELOG.md#v0131--2026-11-11) | M5.2.1 |
| AUD-13 | Source-code table and experimental-count navigation repaired in [V0.132](../CHANGELOG.md#v0132--2026-11-11) | M5.2.2 |
| AUD-14 | Addressed incrementally by R1/R2; composition dependencies and further strict modules remain candidates | M5.4 and R2 |

AUD-11 verification used `git ls-remote --tags` against the official `actions/*` repositories on
11 November 2026. The workflow references resolve: checkout v7 `3d3c42e`, setup-python v7 `6d4fd22`,
setup-node v7 `949feb2`, upload-artifact v7 `cf430e0`, download-artifact v8 `9000827`.
Tag existence does not prove runner compatibility or successful workflows. Verify the supported CI/build
matrix before release under M5.1; do not downgrade actions solely on the audit's older version examples.
This delivery changes planning and version metadata only. Required Python/Node/type/Ruff/version checks
and the standalone build pass; the unchanged interface/save implementation does not require a new E2E run.
The planning commit remains local on master until an authorised push. No audit fix is marked complete here.

### M0 - Baseline and project safety

- [x] **M0.1 - Reproducible performance baseline.** Benchmark and original measurements delivered in
      [V0.94](../CHANGELOG.md#v094--2026-11-09); independently reviewed and accepted in
      [V0.107](../CHANGELOG.md#v0107--2026-11-10).
  - Codex verified a source-fingerprint mismatch between the original report and clean V0.94, then repeated both
    cases from the clean delivery with one warm-up and five measurements each. Inputs, interval results and
    the synthetic ZIP fingerprints match the original; all reload and parity checks pass.
    [Clean-checkout evidence and provenance](benchmarks/M0.1.md#clean-checkout-repetition),
    [V0.106](../CHANGELOG.md#v0106--2026-11-10).
  - The maintainer authorised a separate Codex reviewer in place of Claude on 10 November 2026. That reviewer
    independently ran both complete cases, audited measurement boundaries and RSS accounting, recalculated the
    statistics, and verified source/input/result fingerprints, reloads and numerical/categorical parity.
    [Independent review and evidence](benchmarks/M0.1-independent-review-2026-11-10.md).
    The source-provenance finding is resolved by the matching clean-checkout reports; no implementation findings
    remain. Required delivery checks pass. The baseline remains informational, with no CI performance thresholds.
- [x] **M0.2 - Import and export safety.** Bound ZIP expansion and escape formula-like spreadsheet text
      while preserving numeric measurements. [V0.91](../CHANGELOG.md#v091--2026-11-09)
  - [x] **M0.2.1 - Verify stored ZIP member integrity.** Check the CRC in bounded blocks before delivering
        stored members. Verify corruption in project JSON and images and preserve existing projects.
        [V0.98](../CHANGELOG.md#v098--2026-11-09)
  - [x] **M0.2.2 - Budget Python image and mask loading.** Apply a documented per-load estimate before
        pixel decoding, including conversion and mask copies. Verify rejection through both loaders
        and the label-mask CLI. [V0.99](../CHANGELOG.md#v099--2026-11-09)
  - [x] **M0.2.3 - Bound Python mask label expansion.** Validate label IDs and class counts before
        allocating class results. Preserve exact interval results, sparse IDs and CLI exclusions.
        [V0.100](../CHANGELOG.md#v0100--2026-11-09)
  - [x] **M0.2.4 - Prevent batch LAS filename collisions.** Check all multi-core destinations before writing
        and create each output exclusively. Verify collisions, existing files and valid exports.
        [V0.101](../CHANGELOG.md#v0101--2026-11-09)
- [x] **M0.3 - Project validation.** Cover current and legacy projects with diagnostic warnings.
      [V0.96](../CHANGELOG.md#v096--2026-11-09)
  - [x] **M0.3.1 - Format inventory and depth diagnostics.** Document the import and migration paths and warn
        about suspect depth metadata. [V0.95](../CHANGELOG.md#v095--2026-11-09)
  - [x] **M0.3.2 - Mask and region diagnostics.** Flag invalid regions and unresolved trace or overlap
        references, and preserve the original project when opening for inspection. [V0.96](../CHANGELOG.md#v096--2026-11-09)
  - [x] **M0.3.3 - Validate Python analysis inputs.** Validate finite thresholds from 0 to 1 in the API
        and CLI. Report both filenames and dimensions for mismatched exclusion images.
        [V0.102](../CHANGELOG.md#v0102--2026-11-09)

- [x] **M0.4 - Bound desktop protocol paths (AUD-02).** [V0.127](../CHANGELOG.md#v0127--2026-11-11).
      Authorised by the maintainer on 11 November 2026. Replace prefix-only containment with a
      directory-boundary-aware check in `desktop/main.js`, after reproducing URL parsing and decoding.
  - Acceptance: requests resolving outside the web root cannot reach files, including sibling-prefix
    directories, encoded separators/traversal, Windows drive/UNC forms and malformed escapes. Legitimate
    assets and the existing `app://corantool` origin keep working. Cover platform path semantics and
    Electron protocol behaviour; distinguish a rejected request from one already normalised by URL parsing.
  - Reproduced before patching: unencoded `/../` and `/%2e%2e/` at the URL root are clamped to `/` by
    standard URL parsing (`new URL`), mapping inside `desktop/web`; percent-encoded separators (`..%2f`,
    `%2e%2e%2f`, `..%5c`) survive URL parsing and, after `decodeURIComponent`, escaped `desktop/web` into
    sibling-prefix directories (`web-sibling/...`) under the old `file.startsWith(WEB)` check, while
    malformed percent-escapes threw `URIError`.
  - Delivered: `isWithinRoot`, `resolveAppPath` and `handleAppRequest` in `desktop/main.js` validate the
    `app://corantool` origin, decode once with `URIError` handling, reject NUL bytes, encoded/literal
    separators (`%2f`, `%5c`, `\`), colons/Windows drive/UNC/device forms and directory URLs, and enforce
    strict directory containment via `path.resolve` and `path.relative`. Window-open and trainer IPC origin
    checks reuse `resolveAppPath`.
  - Verified across POSIX and Windows path semantics and on a temporary filesystem with sibling-prefix and
    parent sentinels (`tests/app/desktop-protocol.test.mjs`, `tests/e2e/desktop.mjs`). Required Python, Node,
    typecheck, Ruff, version and standalone checks pass. Local delivery on `master`; GitHub handoff requires
    an authorised push. Next candidate in priority order: M0.5.
- [x] **M0.5 - Validate untrusted presentation colours (AUD-03).** [V0.128](../CHANGELOG.md#v0128--2026-11-11).
      Authorised by the maintainer on 11 November 2026. Review no-data colour merging and
      all affected DOM/SVG consumers in `log.js`, `columns.js` and shared figure controls.
  - Acceptance: validate both `ndColor` and `ndLine` against supported hex forms, escape interpolated
    attributes, and test malformed strings/types from saved projects. No injected attribute or element
    appears in controls or exported SVG; invalid values fall back to the actual `ND_STYLE` defaults.
    Preserve valid short/full hex colours, legacy projects, figure settings and scientific arrays.
    The audit's listed default and description of the current colour loop differ from this source;
    derive the patch and tests from actual merge/render paths rather than copying the proposed fix.
  - Audited before patching: `ND_STYLE` defaults in `app/js/log.js` are `ndColor: '#f2f2f0'` and
    `ndLine: '#b9bdbb'`; `noDataDefs` interpolated `q.ndColor` and `q.ndLine` into `<pattern id="nodata">`
    without validation while `mergedStyle` only checked `Object.keys(LOG_STYLE).filter((k) => k.endsWith('Color'))`
    and did not merge `ND_STYLE` or validate `ndLine`, `markStroke`, class/record/band colours or map styles;
    `columns.js`, `figures.js`, `locmap.js`, `geo.js`, `multiproxy.js` and `app.js` also interpolated raw style
    and colour fields into `<input type="color">` and SVG attributes.
  - Delivered: `validHexColor(value, fallback)` (`^#[0-9a-f]{3}([0-9a-f]{3})?$/i`) and `mergedStyle` in
    `app/js/log.js` merge `ND_STYLE` and `LOG_STYLE`, validate all `LOG_STYLE` `*Color` keys, `ndColor`,
    `ndLine` and `markStroke`, normalise `ndFill`, `ndText`, `colOrder`, `colHide` and `speciesHide`, and guard
    non-primitive `fontSize`/`opacity` inputs; `columns.js`, `figures.js`, `locmap.js`, `geo.js`,
    `multiproxy.js` and `app.js` validate presentation, class, record, marker, band and map colours against
    their respective defaults and escape interpolated attributes (`&`, `<`, `>`, `"`, `'`).
  - Verified with unit tests across malformed strings, non-string types, `Object.create(null)`, valid `#rgb`
    and `#rrggbb` colours, form builders and SVG exporters (`tests/app/log.test.mjs`,
    `tests/app/locmap.test.mjs`), plus live DOM/SVG figure-composition checks (`tests/e2e/figure-composition.mjs`).
    Required Python, Node, typecheck, Ruff, version and standalone checks pass. Local delivery on `master`;
    GitHub handoff requires an authorised push. Next candidate in priority order: M3.2.3.

- [x] **M0.5.1 - Numeric map styles and completed figure safety checks.**
      [V0.129](../CHANGELOG.md#v0129--2026-11-11).
      Authorised by the maintainer on 11 November 2026 after review of V0.120–V0.128. Editor: Codex;
      author verification, no independent reviewer assigned. Work on `fix/map-svg-style-safety`, as
      explicitly requested; integrated into master with V0.130 on 11 November 2026.
  - Acceptance: normalise numeric multiproxy/location map presentation values before geometry/SVG output;
    fall back to field defaults for malformed strings, non-finite values and non-primitive inputs while
    retaining finite numeric settings, numeric strings and zero. Preserve saved inputs and exact scientific
    arrays. Wait for each completed figure before inspecting DOM and exported SVG in served/offline builds.
  - Reproduced: `labelSize` and `gridWidth` could inject SVG elements/event handlers. The previous colour
    regression sampled stale output while `busy()` had not started rendering, skipping the six requested
    figure types. Numeric style validation and sequential checks for eight types are delivered. The new
    browser regression fails when either pre-fix map module is served, confirming detection of both cases.
  - Verified: 227 Python tests (six optional/permission skips), 167 Node tests, JavaScript types, Ruff,
    version consistency, whitespace, standalone build and full Chrome smoke (356 traces, identical reload).
    Standalone U-Net and all three figure regressions pass from `file://`, including per-type safety/export
    checks and exact scientific-array preservation. No new dependency or scientific calculation changes.
  - Integrated into local `master` with V0.130 at `46a6dc6` on the maintainer's request of 11 November 2026.
    GitHub retrieval requires an authorised push of master. M3.2.3 is delivered below.

#### M0.1 acceptance criteria

- Document one command through `tools/benchmark.py` that exercises the application's normal browser paths
  and the Python package's public analysis API. Use the public U1385I-1H example and one larger deterministic
  synthetic case. Record the fixture inputs, including the seed, image dimensions, section count and analysis settings.
- For both cases, report elapsed times for opening a prepared project, persisting a defined edit through normal
  saving and calculating interval results. Report Python analysis time separately on matching inputs. Report peak
  process memory and identify the processes counted, the sampling method and the units.
- Use at least one warm-up and five measured repetitions per case. Record the commit, runtime versions, operating
  system, hardware, per-run results, median and range. State the timing boundaries and how the fixture is reset
  between repetitions.
- Verify that the saved edit survives reopening and that JavaScript and Python agree on shared interval results
  under the same analysis settings. Document the tolerance for floating-point results and check categorical results
  for exact agreement.
- An independent reviewer reruns both cases and checks the measurement boundaries, memory accounting and result parity.
  The maintainer authorised a separate Codex reviewing agent in place of Claude on 10 November 2026.
  Codex addresses review findings before marking the task complete. Collect an informational baseline before
  proposing CI regression thresholds.

### M1 - Editing and recovery

- [x] **M1.1 - Editing history.** Measure long editing sessions and use overlap, undo and reload tests to guide
      changes to editing history and stack compaction. [V0.104](../CHANGELOG.md#v0104--2026-11-09)
  - [x] **M1.1.1 - Reclaim unused overlap stacks during editing.** Share stack entries with undo and rebuild
        active pixel codes independently. [V0.88](../CHANGELOG.md#v088--2026-11-09)
  - [x] **M1.1.2 - Measure object history costs.** Reproduce long sessions at two trace densities and measure
        retained snapshots, action latency and sampled CPU. [V0.97](../CHANGELOG.md#v097--2026-11-09)
  - [x] **M1.1.3 - Prototype object deltas for undo.** Record changed objects and share immutable descriptors.
        Keep typed image and mask buffers outside immutable state. Check equivalent undo, overlap order and
        reload results, then compare retained heap and action latency with the [M1.1.2 benchmark](benchmarks/M1.1.2.md).
        [Comparison and raw measurements](benchmarks/M1.1.2.md#m113-trace-deltas).
        [V0.103](../CHANGELOG.md#v0103--2026-11-09)
  - [x] **M1.1.4 - Native redo.** Replay the same trace and pixel records in both directions within a
        shared session budget. Evict complete groups and expose Redo through the localised toolbar and shortcuts.
    - Verified trace records, masks, exclusions, interval results and overlap order across Undo, Redo and
      compaction. Verified shortcut isolation in text fields, invalidation after a new edit and reload
      with empty history.
    - Recorded native Undo and Redo latency and combined retained heap at both densities in the
      [editing-history benchmark](benchmarks/M1.1.2.md#m114-native-redo).
      [V0.104](../CHANGELOG.md#v0104--2026-11-09)
- [x] **M1.2 - Interrupted saves.** Preserve the last successful save through IndexedDB and file backup failures.
      [V0.105](../CHANGELOG.md#v0105--2026-11-10). Integrated into `master` through [PR #23](https://github.com/SantiCa/SedCoreTool/pull/23).
  - Verified with synthetic data: synchronous clone failure after queuing metadata/data, transaction abort after
    a section write, interrupted image streaming, image replacement before manifest failure, and backup manifest
    open/write/close failures on real OPFS files.
    Prior metadata, sections, masks and image bytes remain intact; previous and retried saves reopen in a separate page.
  - Verified visible failure states, pending live edits, blocked project switching after a failed save, pending edits
    after a failed replacement import, and user-triggered retry for both storage paths.
  - Required Python, Node, type, version, Ruff and browser checks pass (82 Python tests; two optional U-Net tests
    skipped without ONNX/Torch; 124 Node tests). File tests cover the browser's staged-write contract; physical
    power loss and external folder synchronisation are outside the automated simulation.

  - [x] **M1.2.1 - Desktop backup recovery audit.** [V0.133](../CHANGELOG.md#v0133--2026-11-11).
        Authorised by the maintainer on
        11 November 2026 after repeated hangs and failed backup reactivation when starting from `desktop`.
        Editor: Codex; author verification, no independent reviewer assigned.
    - Scope: reproduce backup coordination, permission recovery and project-navigation waits on synthetic
      data, then verify the normal desktop example/detection/save/restart workflow. No private project access.
    - Acceptance: one folder writer per renderer, local navigation independent of slow external writes,
      pending edits copied after an in-flight run, all stored projects eligible in a new destination,
      actionable missing/denied/failed permission recovery and a settled restricted-folder event.
      Preserve the last good manifest/images and the existing failed-local-save navigation guard.
    - Delivered: coordinated background copies retain in-flight edits and refresh new destinations; recovery
      errors explain folder reselection, missing originals abort instead of producing empty images, and
      restricted Electron requests receive a denial callback. Local failed-save guards remain in place.
    - Verified: 227 Python tests (six optional/permission skips), 199 Node tests, JavaScript types, Ruff,
      version consistency, whitespace, standalone build, full Chrome smoke (356 traces, identical reload),
      offline backup controls and actual Electron backup/detection/save/restart checks. The
      [audit report](diagnostics/desktop-backup-audit-2026-11-11.md) separates reproduced failures, source findings
      and native-picker/cloud/private-project limits. Local commit on master; GitHub handoff needs an
      authorised push. M1.2.2 records remaining hang diagnosis and the unverified local-save concurrency path.
  - [ ] **M1.2.2 - Diagnose remaining desktop hangs if reported.** Capture the triggering action, project
        dimensions, terminal/renderer error and whether the process is busy or waiting. Reproduce with public
        or synthetic data before attributing a memory, GPU or computation cause. The focused backup audit
        does not establish the cause of every hang reported by the maintainer. Reproduce the multiple-waiter
        `saveToDB` path flagged by source review before changing its concurrency controller.

  - [x] **M1.2.3 - Temporary desktop operating diagnostics.** [V0.134](../CHANGELOG.md#v0134--2026-11-11).
        Authorised by the maintainer
        on 11 November 2026 to record application use while investigating failures. Editor: Codex;
        author verification, no independent reviewer assigned.
    - Scope: opt-in, local, bounded diagnostics across renderer failures and application restarts; activation,
      visible state, export, stop and clear controls. No raw messages, typed text, project contents or images.
    - Acceptance: off by default, automatic seven-day expiry, maximum two 2 MiB log files and 256 pending
      events, allowlisted technical fields, non-blocking recording, origin-checked IPC, atomic configuration
      and export replacement. Verify redaction, bounded storms, write/export failure, restart, real renderer
      crash and unchanged saved scientific state. Browser/offline builds keep these desktop controls hidden.
    - Rollback: disable recording or stop and clear it; no project format or storage key changes. Remove the
      instrumentation and controls in a separate delivery after the maintainer accepts the hang diagnosis.
      M1.2.2 remains the follow-up for interpreting the captured failure; adding a recorder does not resolve it.
    - Delivered: desktop controls and active indicator; filtered JSONL records in the application data folder;
      operation/backup stage markers, heartbeat, main-process resource and native failure events. No dependency,
      project format or default analysis change. Startup completion is exposed to automated checks to avoid
      premature clicks and redundant native-window navigation through the close guard.
    - Verified: 227 Python tests (six optional/permission skips), 208 Node tests, strict/all-module types,
      Ruff, version consistency, whitespace and standalone build. Full Chrome smoke passes (356 traces,
      identical reload); offline backup controls keep diagnostics hidden. Actual Electron testing verifies
      opt-in, synthetic private-text redaction, foreign-origin rejection, a real renderer crash, restart,
      export, stop, clear and exact preserved saved scientific state. Required packaging includes both modules.
    - Handoff: local delivery on master; an authorised push is needed for GitHub retrieval. The maintainer
      must enable recording and export the retained log after a real failure so M1.2.2 can identify its cause.

### M2 - Large projects and responsive display

The first-run project-entry blocker found while preparing M2.2 is corrected in
[V0.116](../CHANGELOG.md#v0116--2026-11-10). First creation/import and persisted reload pass in isolated empty
browser libraries, including the standalone HTML. The full interrupted-save/browser regression and required
delivery checks pass. Only a workspace with neither project ID nor cores bypasses the pending-save guard;
existing projects retain failed-save protection. Performance evidence is collected after this correction.

- [x] **M2.1 - Large tables.** Profile large table operations and evaluate visible-row rendering behind
      a default-off flag. Selection, editing, navigation and full exports verified.
      [V0.112](../CHANGELOG.md#v0112--2026-11-10).
  - [x] **M2.1.1 - Bound Data table row preparation.** Measure initial opening and one Show more expansion
        at 2,000, 20,000 and 100,000 rows. Prepare the displayed prefix while retaining full counts and CSV data.
        [V0.109](../CHANGELOG.md#v0109--2026-11-10), [benchmark and raw measurements](benchmarks/M2.1.md).
    - At 100,000 rows, median opening changes from 145.3 to 88.9 ms, edit-mode rebuilding from 96.3 to 52.4 ms,
      and Show more from 183.2 to 133.2 ms on the recorded machine. All full CSV fingerprints match.
    - Browser regression verifies bounded row reads, numbering across cores, text selection, edit/restore,
      complete export, core/layer filters, and empty/age-only cores. Required delivery checks pass.
  - [x] **M2.1.2 - Interval lookup and cumulative expansion.** Interval lookup delivered in
        [V0.110](../CHANGELOG.md#v0110--2026-11-10); CSV formatter follow-up and acceptance completed in
        [V0.111](../CHANGELOG.md#v0111--2026-11-10), [benchmark and raw measurements](benchmarks/M2.1.2.md#csv-formatter-follow-up-results-v0111).
    - The maintainer authorised the formatter follow-up on 10 November 2026; Codex implemented and verified it.
      A fresh isolated V0.109 comparison uses identical benchmark tools, one warm-up and five measured runs per
      size. The 100,000-row full CSV median falls from 169.6 to 66.3 ms (60.9%), exceeding the 25% target.
      All three complete CSV fingerprints match, including the original reports. The fixture uses integer
      measurements; equivalent speedups for decimal-heavy projects are not established.
    - Binary lookup handles finite disjoint intervals; overlapping/irregular inputs retain original first-match
      semantics. Names are resolved once per model call. Exact generated tests and browser table/CSV checks
      cover endpoints, gaps, overlaps, axis conversion, selection and edit/restore. Formatter regressions cover
      decimal rounding, numeric boundaries and spreadsheet escaping. Required delivery checks pass.
    - Ten Show more actions reach 10,400 rows in the medium/large cases. Cumulative rendering remains costly:
      the large-case ten actions total 4,880.9 ms. Whole-trial RSS remains about 2,275 MiB at that size;
      the medium-case median is higher with overlapping ranges. No rendering or memory improvement is claimed.
  - [x] **M2.1.3 - Viewport rendering experiment.** Visible-row rendering delivered behind a session-only,
        default-off checkbox. [V0.112](../CHANGELOG.md#v0112--2026-11-10).
    - Authorised by the maintainer on 10 November 2026. The [predeclared contract and acceptance criteria](benchmarks/M2.1.3.md)
      require bounded rows outside active selections, exact CSV data, cross-window editing/navigation and at least
      50% lower median total expansion latency against V0.111 using identical benchmark tools.
    - The 100,000-row fixture's ten expansions fall from 5,745.6 to 332.9 ms (94.2%). Final mounted rows
      fall from 10,400 to 36; all full CSV fingerprints match. Whole-trial peak RSS falls on the measured
      workloads, without isolating DOM allocations. [Raw reports, validation and limits](benchmarks/M2.1.3.md#recorded-results-v0112).
    - Browser checks cover cross-window/core editing and navigation, pointer selection during scrolling,
      retained selection/release, manual/calculated columns, filters, empty/age-only cores and rollback.
      A separate correctness check reaches the final row of a fully unlocked 100,000-row table, including
      the standalone HTML. Required delivery checks pass.
    - Roll back by disabling the flag. Make the experiment the default and remove the flag only after its
      acceptance criteria pass and the maintainer accepts the transition.
  - The experiment remains opt-in; large selections can retain extra rows and fixed widths can clip displayed
    text. Default promotion requires the maintainer's acceptance. The next performance scope is M2.2 profiling.
- [x] **M2.2 - Large images.** Profile opening and navigation on large cores. Evaluate tiled loading if justified.
      Verify depth mapping, editing and exported images.
      Completed for the public/synthetic workloads through [V0.119](../CHANGELOG.md#v0119--2026-11-10).
      The promoted preview retains session rollback; its measured memory margin is narrow. Tiled loading is
      deferred until full-resolution/16-bit workloads justify a separately authorised phase.
  - [x] **M2.2.1 - TIFF import and original image storage.** Read TIFF and BigTIFF in blocks, retain
        native 16-bit samples for enhancement and save originals in bounded writes.
        [V0.87](../CHANGELOG.md#v087--2026-11-09)
  - [x] **M2.2.2 - Opening and navigation profile.** [V0.117](../CHANGELOG.md#v0117--2026-11-10).
        Authorised by the maintainer on 10 November
        2026; editor: Codex; verification: reproducible benchmark and required checks. Measure M0.1 public and
        synthetic projects plus a synthetic core exceeding the existing cache budgets. The
        [predeclared contract](benchmarks/M2.2.md) defines timing, memory/CPU accounting, provenance and exact
        edit/depth/image-export checks. Choose the next optimisation from the evidence; do not change loading
        or cache defaults in this profiling phase.
    - The [complete report and source audit](benchmarks/M2.2.md#recorded-results) measure V0.116 application
      commit `0ecb5efb7b4fc51c62b6781511a26444fae4f1fb`, with matching application-source provenance and separate
      tool hashes. One warm-up, five measurements and one diagnostic CPU trial per case pass exact navigation,
      interval/mask/image, delete/undo/redo, persisted reload and full-resolution mask-PNG checks (21 trials).
    - Large-case opening through two frames is 1306.0 ms median; ten selections total 4805.4 ms. The first
      evicted return is 281.4 ms, versus 32.3 ms after reloading into memory. Whole-trial peak RSS is 3385.4 MiB
      median, including export/reload verification. Main-thread navigation samples identify the `drawNav` →
      `sectionCanvas` → `reduceRGBA` preview path as the next target. This delivery claims no speedup.
    - Required delivery checks pass: 188 Python tests (six optional/permission skips), 147 Node tests, types,
      Ruff, version consistency, full Chrome smoke test, standalone build and standalone first-run regression.
      The benchmark/report remain local on `master` until an authorised push. Next work is M2.2.3; this phase
      does not change image loading, caches or working resolution.
  - [x] **M2.2.3 - Navigation preview experiment.** [V0.118](../CHANGELOG.md#v0118--2026-11-10).
        Authorised by the maintainer on 10 November
        2026; editor: Codex; verification: unit/browser regression and matched benchmark. The
        [predeclared contract](benchmarks/M2.2.3.md) requires exact visual equality and bounded cache ownership.
        Prototype a separately cached, opt-in preview sized
        for the visible navigation strip; preserve the column/figure image path. Compare with the M2.2.2
        fixture sequence, environment and timing boundaries. Target at least 20% lower median large-case
        `first_visits_total_ms`, no more than 20 ms added median resident-return latency, and no more than 10%
        added median whole-trial peak RSS. Keep the old path as the default and rollback until accepted.
    - Predeclare the visual-equivalence bound against the legacy displayed strip before implementing the
      preview. Verify depth click/drag positions within 1e-9 working pixels, exact unchanged masks/indices,
      saved/reloaded edits and full-resolution exports. Promotion requires the maintainer's acceptance.
      Tiled loading remains deferred pending evidence on workloads that justify it.
    - Delivered behind a default-off, session-only checkbox in the Sections panel. One-pass photo/mask
      preparation retains the legacy reduction/compositing grid temporarily and caches only the displayed
      strip, with weak section ownership and an 8 MiB LRU limit. Disable it to clear the cache and roll back.
    - The [matched reports and author audit](benchmarks/M2.2.3.md#recorded-results) use identical tools on V0.117
      and the fingerprinted V0.118 working tree. Large-case first visits fall from 4407.0 to 2921.3 ms median
      (33.7%); resident returns stay at 32.2/32.3 ms; median whole-trial peak RSS rises 4.8%, within the 10% limit.
      All 45 benchmark trials pass; separate visual trials check 31 complete gutters with zero differing pixels.
      A separate canonical comparison verifies exact public-core scientific state despite random section IDs.
    - Required checks pass: 188 Python tests (six optional/permission skips), 150 Node tests, types, Ruff,
      version consistency, full Chrome smoke test, standalone build and offline navigation regression.
      Browser checks cover cache invalidation/disposal, pointer depth, unchanged column SVG and saved state.
      Delivery remains local on `master`; GitHub handoff requires an authorised push.
  - [x] **M2.2.4 - Accept or revise navigation-preview promotion.** [V0.119](../CHANGELOG.md#v0119--2026-11-10).
        Authorised by the maintainer's
        request to continue on 10 November 2026; editor: Codex; verification: matched benchmark and browser/
        offline regression, with no independent reviewer assigned. The [contract](benchmarks/M2.2.4.md)
        enables the preview at startup while retaining a session rollback control. Verify current/legacy
        project compatibility, fallback dimensions and invalid regions, export/save regressions and the same
        benchmark limits on public and synthetic workloads. Private-project acceptance has not been reported;
        removing the rollback control is outside this phase. Full-resolution and 16-bit TIFF profiling remains
        a separate candidate if real workloads justify tiled loading.
    - Delivered: preview starts enabled, with an explicit session control to restore the previous renderer.
      Invalid saved regions and unsupported/noninteger preview dimensions use the existing path. Saved
      projects and scientific definitions remain unchanged.
    - [Matched reports and author audit](benchmarks/M2.2.4.md#recorded-results) verify identical application/
      tool fingerprints on both paths. Large first visits fall from 5108.6 to 3403.4 ms median (33.4%);
      resident return adds 0.1 ms. Peak RSS rises 9.99948%, formally within 10% but with less than 0.02 MiB
      headroom. No robust memory margin is established; retain rollback and require further representative
      memory evidence before any future removal. All 45 trials and 31 exact gutter comparisons pass.
    - Verified current, IchAnTool v2 and CorAnTool v3 imports with images/masks, session reset and migrated
      reload, fallback/cache lifecycle, pointer depth, unchanged column SVG and full figure/save regressions.
      Checks pass: 188 Python tests (six optional/permission skips), 150 Node tests, types, Ruff, version
      consistency, full Chrome smoke, standalone build and offline current/legacy navigation regression.
    - Local delivery on `master`; GitHub handoff needs an authorised push. The next roadmap phase is M3.1
      analysis profiling; no further workstream is started here.

- [ ] **M2.3 - Multi-gigabyte image workflows.** Extend the measured M2.2 scope to individual source files
      of several gigabytes and larger decoded rasters, including native grayscale/16-bit images. Raising
      the current input/memory limits alone is not an implementation of this task.
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

- [ ] **M3.1 - Analysis performance.** Profile Python and JavaScript before optimising shared algorithms.
      Preserve configurable interval boundaries and regression results.
  - [x] **M3.1.1 - Vectorise Python index classification.** Compile interval maps and preserve custom
        scheme precedence. [V0.89](../CHANGELOG.md#v089--2026-11-09)
  - [x] **M3.1.2 - Profile shared interval analysis.** Authorised by the maintainer on
        10 November 2026; editor: Codex; verification: reproducible author measurements and automated checks.
        Measurement/report delivered in [V0.120](../CHANGELOG.md#v0120--2026-11-10), following the
        [contract, diagnostic amendment and evidence](benchmarks/M3.1.2.md). No independent reviewer assigned.
    - Both M0.1 input/2 cm result fingerprints match exactly. Fourteen fresh browser/Python trial pairs
      preserve inputs and repeat their own results exactly; cold/cached/direct browser paths agree.
      Separate CPU profiles identify row/class counting as the subsequent performance candidate.
    - The original 1.37 cm public-case parity criterion fails: conversion operation order moves half-row
      boundaries by one row in sections 2 and 4, affecting 216 intervals, two BI values and one ii value.
      Full arrays and failed parity remain explicit in the original report. Scientific acceptance is resolved
      by M3.1.3 in [V0.121](../CHANGELOG.md#v0121--2026-11-11). The original profiling delivery changed no
      analysis implementation or tolerance.
    - Checks pass: 193 Python tests (six optional/permission skips), 152 Node tests, types, Ruff, version
      consistency and standalone build. The browser driver verifies normal save/reload fixture preparation.
      V0.120 is available on `origin/master` at `33e811d`; its correction follows below.
  - [x] **M3.1.3 - Align fractional interval boundaries.** [V0.121](../CHANGELOG.md#v0121--2026-11-11).
        Authorised by the maintainer on
        11 November 2026; editor: Codex; verification: shared regressions and fixture parity, no independent
        reviewer assigned. Define and document one canonical centimetre-to-row conversion order in Python and
        JavaScript before optimising either path. Keep the documented half-up bin-edge rule.
    - Acceptance: exact cross-language row boundaries at half rows and adjacent floating-point values;
      both M0.1 fixtures pass 2/1.37 cm parity at the unchanged 1e-9 tolerance with exact indices/missing
      values; the legacy reference and unaffected integer/default outputs remain equivalent. Add a
      regression for the measured 7,450-row, 1.49 m sections and record the changed fractional results.
    - After correction, define a separately authorised row/class-count performance experiment using the
      matching inputs, bounded memory, current public API and configurable index schemes. No acceleration
      technology or algorithm replacement is selected in the profiling delivery.
    - Delivered: Python divides rows by centimetre span before multiplying by interval thickness, matching
      the application's existing order. The half-up rule and 1e-9 tolerance are unchanged. Shared fixed tests
      cover measured sections, adjacent floats, units, default/integer bins and hand-computed scientific values.
      [Validation and raw evidence](benchmarks/M3.1.3.md): fourteen browser/Python trial pairs pass both
      2/1.37 cm cases, with exact indices/missing values, M0.1 inputs/results and save/reload checks.
      All application result hashes and three unaffected Python case/interval hashes match V0.120 exactly.
    - Required checks pass: 215 Python tests (six optional/permission skips), 153 Node tests, types, Ruff,
      version consistency and standalone build. Local delivery on `master`; GitHub handoff needs an
      authorised push. Recalculate affected fractional Python results from V0.120 or earlier.
  - [x] **M3.1.4 - row/class-count performance experiment.** Authorised on 11 November 2026;
        editor: Codex; author verification, no independent reviewer. [Contract](benchmarks/M3.1.4.md). Compare bounded counting alternatives with the corrected M3.1.3 inputs and the
        existing public APIs. Predeclare latency and memory targets before implementation; preserve exact
        row boundaries, configurable index precedence, overlap/exclusion behaviour and legacy results.
        Do not select an acceleration technology or promote a replacement without measured acceptance.
    - Completed experiment in [V0.122](../CHANGELOG.md#v0122--2026-11-11): bounded NumPy row histograms
      remain opt-in via `SEDCORETOOL_EXPERIMENTAL_COUNTS=1`. [Evidence and failed acceptance](benchmarks/M3.1.4.md).
      All scientific fingerprints match; synthetic API latency worsens 3.9/5.2%, so no promotion.
      Public timing is confounded by background load. Memory remains within the declared limit.
      Checks: 217 Python tests on both paths (six skips), 153 Node tests, types, Ruff, version, standalone.
      Local delivery on master; authorised push needed for GitHub handoff. A multi-row prototype and
      counterbalanced measurements are a separate candidate requiring authorisation.
  - [x] **M3.1.5 - Multi-row Python counting.** [V0.123](../CHANGELOG.md#v0123--2026-11-11). Authorised on 11 November 2026;
        editor: Codex; author verification, no independent reviewer. [Predeclared contract](benchmarks/M3.1.5.md).
        Evaluate bounded multi-row NumPy histograms with counterbalanced default/experimental process pairs.
        Require >=20% lower median and paired median API latency at both interval sizes in both reference
        fixtures, <=10% whole-worker peak RSS growth, exact scientific fingerprints and regression coverage.
        Keep the current default and rollback flag. If NumPy fails, the maintainer authorises a small Rust
        counting kernel next; stop before Rust if NumPy meets the contract.
    - Delivered: bounded multi-row NumPy histograms pass all four latency targets and both memory targets.
      Counterbalanced API median time falls 59.9–61.5% on public and 29.8–30.2% on synthetic inputs;
      median whole-worker peak RSS rises 0.60/0.75%. Exact scientific fingerprints match throughout.
      The experiment remains opt-in; Rust is not needed under the authorised sequence.
    - Checks: 223 Python tests on both paths (six optional/permission skips), 153 Node tests, types, Ruff,
      version consistency and standalone build. Local delivery on master; GitHub handoff requires an
      authorised push. Next candidate: accept default promotion after reviewing the measured scope and
      broader workload needs; flag removal remains a separate decision.
  - [ ] **M3.1.6 - Review promotion of the measured NumPy counting path.** Review M3.1.5's accepted workload
        results and extend coverage to representative overlaps, class counts, strided masks and radiograph-sized
        tiles before proposing a default change. Preserve the current rollback path and scientific contract.
    - Acceptance: matched end-to-end latency/RSS measurements, exact counts/indices and documented numerical
      parity; no universal speed claim from the original two fixtures. Promotion and flag removal remain
      separate maintainer decisions. This planning entry does not resume the earlier conditional Rust sequence.
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
  - [x] **M3.2.1 - U-Net device selection and CPU fallback.** Probe accelerator memory, retry on CPU
        after a recoverable GPU error and expose an explicit CPU option. [V0.90](../CHANGELOG.md#v090--2026-11-09)
  - [x] **M3.2.2 - Confine U-Net dataset output paths.** Generate portable, bounded tile names from
        display labels and the exact core/section identity; verify resolved destinations and create files
        exclusively. [V0.108](../CHANGELOG.md#v0108--2026-11-10).
    - Reproduced outside-file overwrites and label/boundary/case collisions in Windows from ZIP and folder
      exports. Verified absolute, drive-relative, UNC, slash/backslash, traversal, control, Unicode and long
      identifiers, duplicate rejection before overwrite, stable naming and late file collisions.
    - Verified linked-output rejection, including Windows junctions, preservation of outside sentinels,
      exact image/mask pixels in binary and multiclass preparation, and unchanged train/validation/test cores.
      Regression tests run in the existing Python CI matrix, including Windows; required delivery checks pass.
  - [x] **M3.2.3 - Preserve the last working U-Net model.** [V0.130](../CHANGELOG.md#v0130--2026-11-11).
        Authorised by the maintainer
        on 11 November 2026. Editor: Codex; author verification, no independent reviewer assigned.
        Work on `fix/map-svg-style-safety`; integrated into master on 11 November 2026.
    - **Approach.** Prepare/train in `staging/<name>.pending`. Publish immutable ONNX/JSON/evaluation
      generations through one atomically replaced reference; retain old files and legacy readers.
    - **Acceptance.** Inject failures during preparation, training and publication, and test
      cancellation. The previous ONNX and JSON stay byte-identical and load through the normal
      model reader. A successful run exposes the new matching pair. Exercise the resume path.
    - **Publication/resume decision.** A required test-core evaluation must finish successfully before
      publication, without a new score threshold. Resume uses staged tiles/checkpoints, or copies a legacy
      checkpoint and best/pending-best weights while reusing its original prepared dataset. A new fresh
      run discards only that name's staged attempt. Published generations remain untouched.
    - **Verified.** 198 Node tests, including 32 trainer lifecycle/packaging cases; 227 Python tests (six
      optional/permission skips); JavaScript types, Ruff, version consistency, whitespace and standalone build.
      Real Electron E2E passes for app://, trainer IPC, detection and pending save across process restart.
      Fault injection covers preparation, training, evaluation, partial model/reference writes, flush/replacement
      failure and cancellation. Old ONNX/JSON bytes and matching scores survive through normal/reopened readers;
      successful staged/legacy resumes publish a matching pair. No PyTorch training or real ONNX provider is run
      by the new lifecycle fixtures; scientific Python and web algorithms are unchanged.
    - **Handoff.** Integrated into local `master` at `46a6dc6` on the maintainer's request of 11 November 2026;
      GitHub retrieval requires an authorised push of master. Prior and unreferenced generations are retained
      without automatic cleanup; power-loss durability and cross-process training locks are outside this delivery's guarantees.
      Exclusion-layer documentation follows in M5.2.1.
  - [ ] **M3.2.4 - Reproduce the managed trainer environment.** The optional desktop installer
        downloads dependencies whose versions can vary between installations.
        This includes AUD-09; select constraints from tested configurations, not the audit's example caps.
    - Under M8, share tested constraints and update policy with the packaged base engine in M8.2;
      the optional trainer/CPU/CUDA matrix remains separate and must not make training packages mandatory
      for ordinary section analysis.
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

- [x] **M3.3.1 - Define palette hex input forms (AUD-04).** [V0.139](../CHANGELOG.md#v0139--2026-11-12). Decide and document support for short
      `#rgb` alongside full `#rrggbb` in `segmentation.py`, including whitespace and invalid-input handling.
  - Acceptance: named palette entries using equivalent supported hex/RGB forms produce exactly the same
    masks and class ordering. Malformed forms raise clear errors; existing valid palette calls remain valid.
  - Authorised by the maintainer on 12 November 2026. Editor: Codex; author verification, no independent
    reviewer assigned.
  - Delivered: 3/6 hexadecimal digits, optional single `#`, either case and surrounding whitespace;
    short digits expand exactly to their RGB values. Invalid lengths/content are rejected with the palette
    class name, retaining the exception cause. Existing valid full/bare hex and RGB calls remain supported;
    tolerance, first-match precedence, class order and scientific calculation are unchanged.
  - Verified: 46 new cases include all 4,096 short triplets, independent exact masks/scientific tables,
    malformed inputs and byte-identical `analyze`/`batch` CSV results. An invalid palette preserves a
    previous result. Checks pass: 313 Python tests (six optional/permission skips), 218 Node tests,
    types, Ruff, version consistency, whitespace and standalone build. Python CLI paths are tested directly;
    the unchanged browser interface/save code does not require a repeated browser E2E run.
  - Local delivery on master; GitHub retrieval requires an authorised push. Next priority candidate:
    M3.2.5 caller random-state isolation. No further phase is started in this delivery.
- [ ] **M3.3.2 - Describe fractional bin sizes accurately (AUD-05).** Align `CoreSection.bin_px`'s
      annotation with the existing float-valued API and documented fractional boundary rules.
  - Acceptance: inspect public annotations/documentation and retain fractional-bin and legacy numerical
    regressions. This is a type correction, not a new conversion or rounding algorithm.
- [x] **M3.3.3 - Verify manifest escaping and manual editing (AUD-06).** [V0.137](../CHANGELOG.md#v0137--2026-11-12). Reproduce the generated CSV,
      spreadsheet/text-editor edit and `read_manifest` round trip before changing the format.
  - Acceptance: preserve exact paths/names beginning with apostrophes, `-`, `+`, `=`, `@`, whitespace and
    ordinary text, including mixed values in the same marked row and unmarked user manifests. Retain formula
    protection and numeric depths. Document `__sedcoretool_csv_escape__` / `apostrophe-v1` and supported
    editing rules; give existing generated manifests a compatibility path if encoding changes are needed.
    Source review alone does not confirm the audit's double-escape claim; close it with reproduction evidence.
  - Authorised by the maintainer's instruction to continue the next roadmap point on 12 November 2026.
    Editor: Codex; author verification, no independent reviewer assigned.
  - Delivered: generated CSV, marked text edits, unmarked user input and controlled literal-text XLSX
    save/reopen/CSV round trips retain the existing encoding. Reproduced and corrected the reader's loss
    of missing-value-like identifiers (`NA`, `NULL`, etc.); numeric depths, empty-field defaults, exclusions
    and scientific results remain unchanged. No format migration is needed.
  - [Reproduction evidence and limits](diagnostics/manifest-round-trip-2026-11-12.md): 40 new cases include
    110 generated section round trips, mixed rows and exact batch results. Native spreadsheet interfaces
    and locale-dependent CSV conversions remain unverified; the tested XLSX path uses openpyxl.
    Checks pass: 267 Python tests (six optional/permission skips), 218 Node tests, JavaScript types,
    Ruff, version consistency, whitespace and standalone build. The application interface and saving
    implementation are unchanged, so no repeated browser E2E run is required for this delivery.
  - Local commit on master; GitHub retrieval requires an authorised push. Next priority candidate:
    M3.3.1 palette hex input forms; no further phase is started here.
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
        Browser/Wasm distribution is deferred outside the active desktop sequence.
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

- [ ] **M5.1 - Compatibility and reproducibility.** Verify that representative legacy projects open and can be
      recovered, that shared analysis agrees between JavaScript and Python, and that exported tables and figures
      include the information needed to reproduce them.
- [ ] **M5.2 - Scientific validation and documentation.** Complete the release requirements in
      [Validation](#validation) and the relevant user guidance. The maintainer decides when to declare 1.0
      and publish it.
  - [x] **M5.2.1 - Correct exclusion-layer claims (AUD-12).** [V0.131](../CHANGELOG.md#v0131--2026-11-11).
        Reconcile technical-documentation
        limitations (§32) and the paper's numerical description with current Python API/CLI/batch support.
    - Authorised by the maintainer's request to integrate V0.130 and continue the roadmap on 11 November
      2026. Editor: Codex; author verification, no independent reviewer assigned.
    - Acceptance: remove the false application-only limitation, use actual API and CLI names
      (`analyze_mask`, `--exclude`, `--exclude-value`), and retain real differences such as absent Python
      `noDataPad`. Link existing validation evidence without claiming parity outside its tested scope.
    - Delivered: §25.5 and §32 describe existing array/image/label exclusions, batch manifests and the
      application-only drawing/noDataPad capabilities. The paper uses the same definition and links §31.1,
      which identifies existing exclusion tests and limits the equivalence claims to their tested scope.
      README guidance already describes exclusions correctly; no user workflow or scientific code changes.
    - Verified: 227 Python tests (six optional/permission skips), 198 Node tests, JavaScript types, Ruff,
      version consistency, whitespace and the added local documentation links. No new tests or E2E run are
      needed for this documentation/version-only delivery. Local commit on master; GitHub retrieval requires
      an authorised push. Next priority candidate: M5.2.2 technical-document navigation.
  - [x] **M5.2.2 - Repair technical-document navigation (AUD-13).** [V0.132](../CHANGELOG.md#v0132--2026-11-11).
        Put the `i18n.js` row inside the
        repository table and move experimental counting out of the References section.
    - Authorised by the maintainer on 11 November 2026. Editor: Codex; author verification, no independent
      reviewer assigned.
    - Acceptance: the repository table renders as one table; algorithm details belong with the Python
      analysis description and verification evidence is linked from §31. Check headings, contents and links;
      preserve formulas, current defaults and the distinction between opt-in and default counting.
    - Delivered: the source-code map contains one table including `i18n.js`; experimental counting is a
      subsection of §25.2, linked from the contents with its existing anchor preserved. §31.1 links the
      counterbalanced evidence and counting regressions. Contents lists have explicit paragraph separation.
      Algorithm text, formulas, bounds, defaults, rollback and bibliography are preserved; counting stays opt-in.
    - Verified: rendered Markdown has one source table with all 28 module rows; the counting subsection is
      inside the library API, and all local manual links/fragments resolve. Compared relocated algorithm text,
      main section headings and bibliography with the previous delivery. Required checks pass: 227 Python
      tests (six optional/permission skips), 198 Node tests, JavaScript types, Ruff, version consistency and
      whitespace. No new tests or E2E run are needed for this documentation/version-only delivery.
    - Handoff: local commit on master; GitHub retrieval requires an authorised push. Next priority candidate:
      M3.3.3 manifest escaping/editing reproduction, requiring separate authorisation.
- [x] **M5.3 - JavaScript type checking.** Check critical modules strictly and detect new diagnostics across
      the application. [V0.92](../CHANGELOG.md#v092--2026-11-09)
- [ ] **M5.4 - Reduce legacy JavaScript type diagnostics.** Replace the baseline entries with checked contracts
      as the corresponding modules are changed.
  - AUD-14: R1 already adds `unetmodel.js` to strict checking in V0.124. Evaluate `figview.js`, `navpreview.js`,
    `exportio.js`, `tableview.js` and `edit.js` one at a time. Accept only checked contracts with no new
    diagnostics; prune resolved baseline entries without regenerating a baseline that admits new errors.
    R2 adds strict checking of `sectiondepth.js` in V0.126 without adding diagnostics.
  - On the next TypeScript upgrade, migrate the deprecated `moduleResolution: "node"` setting and check
    both typecheck configurations and the diagnostic baseline against the new compiler.
- [ ] **M5.5 - Enforce the standalone module syntax contract (AUD-10).** Make unsupported module syntax
      fail at build time rather than producing an HTML file that fails from disk.
  - Deferred as an independent refactor under M8: fix a blocker if the transitional standalone build needs
    it, otherwise reassess at the last-HTML cutover. Keep existing build checks until that documented cutover.
  - Acceptance: fixtures cover supported multiline imports and comments, residual imports/exports,
    export lists/re-exports and relative dynamic imports. Support or explicitly reject each construct with
    actionable diagnostics and no false positives from ordinary strings/comments. Preserve top-level name
    collision checks and dependency order; verify the result from `file://`. Compare standard-library checks
    with a parser only if needed, documenting dependency/offline costs before adding one.
  - R2 adds the local unaliased export-list support needed for compatibility exports, with explicit errors
    for unsupported lists. The broader import/re-export/dynamic-import and lexical-validation work remains pending.

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

## Distribution and publication
- [x] Desktop installers for Windows, macOS and Linux, and an offline single-file version
- [x] Single version number across the program, the Python package and the installers
- [ ] First public release of the installers
- [ ] Python package on PyPI (`sedcoretool`)
- [ ] Archived release with a DOI (Zenodo)
- [ ] Software paper (`paper/`)
- [ ] Documentation website with example notebooks

## Python package
- [x] Installable package with API and command line; regression against version 2.1
- [x] Per-ichnotaxon percentages, overlapping traces, configurable index schemes, age model, CSV and Excel export
- [x] Interval thickness in centimetres on the command line (`--bin-cm`, already available in the API)
- [x] Exclusion layer, as in the program
- [x] Batch processing of folders and of multi-section cores (splices, gaps)
- [x] LAS export for well-log software

## Segmentation and identification
- [x] Learned segmentation (U-Net): training-data export, training, evaluation on independent cores, inference in the
      program and in Python
- [x] Ichnotaxa classifier on shape and colour descriptors or on pre-trained vision features
- [ ] U-Net models trained and evaluated on annotated real cores
- [ ] Open dataset of annotated core images and masks, with an annotation protocol and inter-annotator agreement
- [ ] Classical segmentation baselines in Python for comparison
- [ ] Click-assisted segmentation with promptable models
- [ ] Texture descriptors for ichnotaxa

## Validation
- [x] Final test on cores reserved from training and model selection
- [ ] Automatic versus manual masks versus experts' visual BI/ii estimates
- [ ] Blind comparison of ichnotaxa identification with ichnologists
- [ ] Multiproxy classification on cores with an independent, published interpretation

## Multiproxy analysis and maps
- [x] **G1 - Extend proxy maps across the visible sea.** [V0.135](../CHANGELOG.md#v0135--2026-11-11).
      Authorised by the maintainer on 11 November 2026, with coverage explicitly defined as the visible marine
      area. Editor: Codex; author verification, no independent reviewer assigned. Add an explicit IDW preset
      without a hull or search-radius cut-off, retain the land mask, preserve existing defaults/saved settings
      and identify extrapolated output. The frame is not a geological basin polygon.
  - Acceptance verified: exact unchanged interior IDW cells at a fixed frame/resolution, constant-field
    preservation, finite extended estimates, land masking, unchanged measurements/analysis state,
    saved coverage, restored hull restriction, both map panels and SVG/PNG export annotations.
  - Delivered: 227 Python tests passed (six optional/permission skips), 212 Node tests, type checks with no new
    diagnostics, Ruff, version consistency, standalone build, full Chrome smoke and the same map regression
    directly from the offline HTML. Visual inspection verifies controls, coast masking and the exported note.
  - Local delivery on `master`; GitHub handoff requires the maintainer's authorised push. Extrapolated values
    remain exploratory; coarse cell edges can cross the shoreline because masking uses each cell centre.
- [ ] Permutation importance of variables (also for the neural network)
- [ ] Kriging variance maps
- [ ] Location map: cores from other projects and an inset location map

## Program
- [x] **F4 - Event shading in proxy figure tracks.** [V0.136](../CHANGELOG.md#v0136--2026-11-12). Authorised by the maintainer on
      11 November 2026; editor: Codex; author verification, no independent reviewer assigned.
      Restore per-figure shading controls for whole-core, core-column and multiproxy-log figures. Select
      interval families and computed classifications, including more than two simultaneous sources;
      choose per-source opacity, per-class colours, whole-panel or under-curve fill, and blended or split layers.
  - Acceptance: preserve original intervals, classes, predictions, measurements and proxy paths; correct depth/
    age mapping for the selected core; independent figure types/tabs; inherited settings, save/reload, reset,
    source-qualified legend and SVG/PNG. No independent analysis or performance work is included.
  - Delivered: 218 Node tests, 227 Python tests (six optional/permission skips), types without new diagnostics,
    Ruff, version consistency, standalone build, full Chrome smoke and the same event regression directly from
    the offline HTML pass. Visual inspection verifies the controls, painted under-curve fill and wrapped legend.
    PNG verification samples an actual shaded pixel, not only the export signature. Malformed saved presentation
    falls back safely; existing class colours and data are preserved.
  - Local delivery on `master`; GitHub handoff requires the maintainer's authorised push. Automatic sources
    require available predictions; the existing retraining workflow remains responsible for model restoration.
- [x] **F2 - Multiproxy figure composition.** [V0.114](../CHANGELOG.md#v0114--2026-11-10). Authorised by the maintainer
      on 10 November 2026. Editor: Codex; verification: automated checks and browser/standalone regression. Add ichnotaxa with the
      shared presentation controls; independently choose, order, hide and scale core, proxy and interval tracks
      per figure tab. Verify selected-core units/age mapping, unchanged measurements and analysis settings,
      saved composition, reset and SVG/PNG.
  - Delivered and verified: 181 Python tests passed (six optional/permission skips), 143 Node tests, types,
    Ruff, version consistency, standalone build, full Chrome smoke test and standalone figure regression.
    Exact measurements and analysis/view settings remain unchanged by figure composition. Mixed units,
    selected-core age coordinates, tab independence, save/reload, reset, SVG/PNG and visual layout pass.
  - Local delivery on `master`; GitHub handoff requires the maintainer's authorised push. Independent axis and
    image controls are delivered in F3.
- [x] **F3 - Extend figure composition across figure types.** [V0.115](../CHANGELOG.md#v0115--2026-11-10). Authorised by the maintainer on
      10 November 2026; editor: Codex; verification: automated checks plus served/standalone browser regression.
      Continue the maintainer's requested freedom of
      composition in a separate phase: independent track/style controls in the remaining core/log figures,
      including image treatment and vertical-axis selection. Preserve their existing defaults and saved projects.
  - Acceptance: independent core/log tracks, records and presentation; per-type distribution/section style and
    depth windows; independent multiproxy axis/image treatment; exact unchanged analysis state and measurements;
    correct nonlinear age image/occurrence mapping and classification endpoints; inherited labels and legacy
    projects; tab isolation, saved profiles, reset and SVG/PNG.
  - Delivered and verified: 181 Python tests passed (six optional/permission skips), 147 Node tests, types,
    Ruff, version consistency, standalone build, full Chrome smoke test and all three figure regressions in
    the offline HTML. New-profile browser checks also verify photo-proportion controls and inherited custom labels.
    Visual inspection passes; presentation leaves the analysis views and measurement arrays exactly unchanged.
  - Local delivery on `master`; GitHub handoff requires the maintainer's authorised push. Section comparison
    panels retain a depth axis; class colours and existing arrow annotation settings remain shared project/figure
    settings. The next performance candidate is M2.2 profiling; no further workstream started in this delivery.
- [x] **F1 - Configurable ichnotaxon figures.** [V0.113](../CHANGELOG.md#v0113--2026-11-10). Authorised by the maintainer on
      10 November 2026, ahead of further performance work. Share abundance/occurrence presentation between the
      whole interpreted core, core column and ichnotaxa distribution, with independent settings for figure tabs.
  - Offer stacked, overlaid or separate abundance tracks; bars, curves, filled areas and symmetric curves;
    opacity; symbols and/or names at observed depths/ages; manual-mark-only source; percentage axes and labels.
  - Preserve existing figure defaults and project readers. Presence-only records must not generate abundance.
    Verify exact unchanged input/CSV values, symmetric geometry and gaps, source/visibility filtering, axis
    conversion, independent tabs, saved settings, SVG/PNG export and the required delivery checks.
  - Delivered and verified: exact unchanged measurements/CSV, shared geometry, independent tabs, depth/age,
    saved settings, SVG/PNG and visual inspection. Required checks pass (181 Python tests with six optional/
    permission skips; 142 Node tests; types, version, Ruff, standalone build and full Chrome smoke test).
    The same figure regression passes against the standalone HTML opened directly from disk.
  - Presentation settings are opt-in; reset restores the inherited/default plot. Dense presence names can
    overlap and may need a taller figure or a narrower window. Further performance work remains at M2.2.
- [ ] Unified data import; age model edited in the core dialog
- [x] Column headers that stay visible while scrolling
- [ ] Dedicated horizontal layout for each figure type
- [ ] Simultaneous editing of a shared project
- [ ] `app.js` split into smaller modules
  - [x] **R1 - Extract U-Net session controller.** [V0.124](../CHANGELOG.md#v0124--2026-11-11).
        Authorised on 11 November 2026;
        editor: Codex; automated author verification, no independent reviewer assigned.
        Extract loading, model ownership, probability/cache keys and ONNX tensor adaptation into a DOM-free
        module with injected runtime, section enumeration, scale, identifiers and progress. Keep UI wiring,
        engine loading (shared with DINOv2), desktop training and scientific tiling in their existing layers.
        Acceptance: no imports back to app.js, strict types without new baseline diagnostics, exact probability
        arrays and cache semantics, unchanged current/legacy project workflows, served/standalone inference
        wiring and required delivery checks. This is a small extraction with no default/format change;
        broader lifecycle changes and further module extraction remain separate phases.
    - Delivered: `unetmodel.js` has no DOM/app.js dependency and strict contracts. Scientific tiling,
      cache keys, model failure/replacement and existing file/desktop entry points retain their behaviour.
      Remaining JavaScript diagnostics fall from 894 to 887 without extending the baseline.
    - Verified: 223 Python tests (six optional/permission skips), 157 Node tests, strict/all-module types,
      Ruff, version consistency, standalone build, full Chrome smoke (356 traces and identical saved reload),
      and served/standalone U-Net integration with deterministic injected runtime. No real ONNX provider or
      desktop training run is added to this extraction's verification. Storage-fallback fault injection
      is isolated from concurrent main-page OPFS image reads; console failures now include error stacks.
    - Local delivery on master; GitHub handoff requires authorised push. Further model-lifecycle or
      DINOv2 extraction requires a separate phase.
  - [x] **R2 - Decouple shared depth selectors (AUD-14).** [V0.126](../CHANGELOG.md#v0126--2026-11-11).
        Authorised on 11 November 2026;
        editor: Codex; author verification, no independent reviewer assigned. Inspect consumers of `pxPerCm`, `depthAtRow`
        and `rowAtDepth` before choosing the next small extraction. Avoid moving calculation into a
        DOM-dependent state module merely to shorten app.js. Treat composition/class selectors as later
        candidates after their state dependencies are understood.
    - Acceptance: explicit inputs and checked contracts, preserved existing callers/re-exports where needed,
      exact ROI/depth/unit behaviour, no new import cycle, standalone name/order checks and served/offline
      regressions. Do not claim that this alone removes all current interface import cycles.
    - Delivered: pure `sectiondepth.js` imports only core.js and owns ROI depth/row/physical-scale mapping.
      Columns and figures consume it directly; app.js re-exports the same bindings for compatibility.
      The generic U-Net section contract preserves custom consumers and explicitly types the application
      section metadata. No runtime arithmetic, scientific default or project format changes.
    - Verified: exact shared fractional fixtures, endpoints/units/extrapolation and 1,000 generated inverse
      mappings (1e-9 absolute row tolerance on the bounded test domain, not a changed scientific tolerance).
      227 Python tests (six optional/permission skips), 161 Node tests, strict/all-module types, Ruff,
      version consistency, standalone build and full Chrome smoke pass (356 traces, identical saved reload).
      App export identity is checked in the browser; standalone U-Net wiring and all three figure regressions
      pass directly from file. Local delivery on master; GitHub handoff requires authorised push.
      Composition/class selectors and remaining interface cycles are separate pending candidates.


## Further ichnological parameters
- [ ] Ichnodiversity, burrow size, tiering and cross-cutting relationships
- [ ] 2-D radiograph support is scoped in M7.1–M7.4 above. Scope 3-D CT volumes separately after those
      input, storage and calibration contracts have been evaluated.
