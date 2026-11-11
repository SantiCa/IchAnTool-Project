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

### Audit triage and proposed priority

The maintainer requested incorporation of the supplied V0.123 technical audit on 11 November 2026;
the planning update is delivered in [V0.125](../CHANGELOG.md#v0125--2026-11-11).
The findings below were checked against V0.124 source and existing tasks. This is source triage, not
an independent security review or a completed reproduction of every reported defect. The audit's
implementation checklist, suggested dependency versions and agent assignments are not execution authority.
Tasks without a subsequent authorisation recorded below remain pending; incorporation alone assigns no
editor or reviewer and does not authorise implementation.

Proposed order: address desktop path containment, untrusted presentation values and preservation of trained
models first (M0.4, M0.5, M3.2.3); correct scientific documentation next (M5.2.1–M5.2.2); then validate manifest,
palette and training reproducibility contracts, build safety and trainer dependencies. Type-only corrections,
further modularisation and LAS metadata policy follow as separate small deliveries. This priority supplements
the milestone grouping below; it does not start any implementation or authorise a release.

| Audit ID | Disposition after source review | Roadmap task |
|---|---|---|
| AUD-01 | Previous model artifacts are removed before preparation; already tracked | M3.2.3 |
| AUD-02 | Prefix-only containment check exists; reproduce reachable URL/path cases before claiming exploitability | M0.4 |
| AUD-03 | Unescaped no-data colours and inconsistent validation paths exist; audit the actual defaults and consumers | M0.5 |
| AUD-04 | Palette parser assumes six hexadecimal digits | M3.3.1 |
| AUD-05 | Fractional bin size still has an integer annotation | M3.3.2 |
| AUD-06 | Double escaping is not established: leading apostrophes are unchanged by spreadsheet_text; validate marked-row editing/round trips | M3.3.3 |
| AUD-07 | LAS uses ASCII replacement; choose an explicit metadata policy before changing output | M3.3.4 |
| AUD-08 | Training seeds process-global random generators | M3.2.5 |
| AUD-09 | Managed trainer constraints are already pending; do not adopt untested example version caps | M3.2.4 |
| AUD-10 | Standalone import/export stripping has a restricted syntax contract | M5.5 |
| AUD-11 | Missing-tag allegation not confirmed; currently referenced major tags exist | Verification note below; M5.1 release checks |
| AUD-12 | Python exclusion support contradicts the limitations list and paper text | M5.2.1 |
| AUD-13 | Language-table row and experimental-count section are misplaced | M5.2.2 |
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

- [ ] **M0.4 - Bound desktop protocol paths (AUD-02).** Replace prefix-only containment with a
      directory-boundary-aware check in `desktop/main.js`, after reproducing URL parsing and decoding.
  - Acceptance: requests resolving outside the web root cannot reach files, including sibling-prefix
    directories, encoded separators/traversal, Windows drive/UNC forms and malformed escapes. Legitimate
    assets and the existing `app://corantool` origin keep working. Cover platform path semantics and
    Electron protocol behaviour; distinguish a rejected request from one already normalised by URL parsing.
- [ ] **M0.5 - Validate untrusted presentation colours (AUD-03).** Review no-data colour merging and
      all affected DOM/SVG consumers in `log.js`, `columns.js` and shared figure controls.
  - Acceptance: validate both `ndColor` and `ndLine` against supported hex forms, escape interpolated
    attributes, and test malformed strings/types from saved projects. No injected attribute or element
    appears in controls or exported SVG; invalid values fall back to the actual `ND_STYLE` defaults.
    Preserve valid short/full hex colours, legacy projects, figure settings and scientific arrays.
    The audit's listed default and description of the current colour loop differ from this source;
    derive the patch and tests from actual merge/render paths rather than copying the proposed fix.

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
  - [ ] **M3.2.3 - Preserve the last working U-Net model.** Starting a fresh desktop training run
        with an existing name removes the published artifacts before preparation succeeds.
        AUD-01 confirms the already tracked risk; prioritise this alongside M0.4/M0.5.
    - **Approach.** Prepare and train in a staging location. Publish a complete model and metadata
      together so readers see a consistent version, and retain the previous version on failure.
    - **Acceptance.** Inject failures during preparation, training and publication, and test
      cancellation. The previous ONNX and JSON stay byte-identical and load through the normal
      model reader. A successful run exposes the new matching pair. Exercise the resume path.
    - **Likely touchpoints.** `desktop/trainer.js` and `tests/app/trainer.test.mjs`.
    - **Decision before implementation.** Choose the publication and resume strategy for supported
      platforms and decide whether evaluation must succeed before a replacement becomes visible.
  - [ ] **M3.2.4 - Reproduce the managed trainer environment.** The optional desktop installer
        downloads dependencies whose versions can vary between installations.
        This includes AUD-09; select constraints from tested configurations, not the audit's example caps.
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

- [ ] **M3.3.1 - Define palette hex input forms (AUD-04).** Decide and document support for short
      `#rgb` alongside full `#rrggbb` in `segmentation.py`, including whitespace and invalid-input handling.
  - Acceptance: named palette entries using equivalent supported hex/RGB forms produce exactly the same
    masks and class ordering. Malformed forms raise clear errors; existing valid palette calls remain valid.
- [ ] **M3.3.2 - Describe fractional bin sizes accurately (AUD-05).** Align `CoreSection.bin_px`'s
      annotation with the existing float-valued API and documented fractional boundary rules.
  - Acceptance: inspect public annotations/documentation and retain fractional-bin and legacy numerical
    regressions. This is a type correction, not a new conversion or rounding algorithm.
- [ ] **M3.3.3 - Verify manifest escaping and manual editing (AUD-06).** Reproduce the generated CSV,
      spreadsheet/text-editor edit and `read_manifest` round trip before changing the format.
  - Acceptance: preserve exact paths/names beginning with apostrophes, `-`, `+`, `=`, `@`, whitespace and
    ordinary text, including mixed values in the same marked row and unmarked user manifests. Retain formula
    protection and numeric depths. Document `__sedcoretool_csv_escape__` / `apostrophe-v1` and supported
    editing rules; give existing generated manifests a compatibility path if encoding changes are needed.
    Source review alone does not confirm the audit's double-escape claim; close it with reproduction evidence.
- [ ] **M3.3.4 - Choose LAS ASCII metadata policy (AUD-07).** Decide how non-ASCII names, headers and
      units are represented before replacing the current ASCII substitution in `export.py`.
  - Acceptance: document predictable transliteration/rejection/warning behaviour, test accented and
    non-transliterable text and possible naming collisions, preserve numeric curves and valid LAS 2.0 syntax.
    Avoid silently treating all Unicode symbols as equivalent to accent removal.

### M4 - Optional acceleration

- [ ] **M4.1 - Targeted experiments.** Evaluate WebAssembly, GPU rendering or alternative tabular storage when
      a measured bottleneck justifies it. Compare performance, compatibility and maintenance costs.

### M5 - Release readiness

- [ ] **M5.1 - Compatibility and reproducibility.** Verify that representative legacy projects open and can be
      recovered, that shared analysis agrees between JavaScript and Python, and that exported tables and figures
      include the information needed to reproduce them.
- [ ] **M5.2 - Scientific validation and documentation.** Complete the release requirements in
      [Validation](#validation) and the relevant user guidance. The maintainer decides when to declare 1.0
      and publish it.
  - [ ] **M5.2.1 - Correct exclusion-layer claims (AUD-12).** Reconcile technical-documentation
        limitations (§32) and the paper's numerical description with current Python API/CLI/batch support.
    - Acceptance: remove the false application-only limitation, use actual API and CLI names
      (`analyze_mask`, `--exclude`, `--exclude-value`), and retain real differences such as absent Python
      `noDataPad`. Link existing validation evidence without claiming parity outside its tested scope.
  - [ ] **M5.2.2 - Repair technical-document navigation (AUD-13).** Put the `i18n.js` row inside the
        repository table and move experimental counting out of the References section.
    - Acceptance: the repository table renders as one table; algorithm details belong with the Python
      analysis description and verification evidence is linked from §31. Check headings, contents and links;
      preserve formulas, current defaults and the distinction between opt-in and default counting.
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
  - Acceptance: fixtures cover supported multiline imports and comments, residual imports/exports,
    export lists/re-exports and relative dynamic imports. Support or explicitly reject each construct with
    actionable diagnostics and no false positives from ordinary strings/comments. Preserve top-level name
    collision checks and dependency order; verify the result from `file://`. Compare standard-library checks
    with a parser only if needed, documenting dependency/offline costs before adding one.
  - R2 adds the local unaliased export-list support needed for compatibility exports, with explicit errors
    for unsupported lists. The broader import/re-export/dynamic-import and lexical-validation work remains pending.

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
- [ ] Permutation importance of variables (also for the neural network)
- [ ] Kriging variance maps
- [ ] Location map: cores from other projects and an inset location map

## Program
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
- [ ] CT and X-ray image support
