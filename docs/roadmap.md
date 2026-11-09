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

### M0 - Baseline and project safety

- [ ] **M0.1 - Reproducible performance baseline.** **In review.** Codex delivered the benchmark and both
      measured cases in [V0.94](../CHANGELOG.md#v094--2026-11-09). Claude independently reruns both cases in
      read-only mode and reviews the boundaries, memory accounting and result parity using the
      [benchmark instructions and recorded run](benchmarks/M0.1.md). Codex addresses any findings before closure.
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
- Claude reruns both cases independently and checks the measurement boundaries, memory accounting and result parity.
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
      [V0.105](../CHANGELOG.md#v0105--2026-11-10). Delivered on `codex/m1-2-interrupted-saves` for owner review.
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

- [ ] **M2.1 - Large tables.** Profile large table operations and evaluate rendering only visible rows where
      measurements show a benefit. Verify selection and exports.
- [ ] **M2.2 - Large images.** Profile opening and navigation on large cores. Evaluate tiled loading if justified.
      Verify depth mapping, editing and exported images.
  - [x] **M2.2.1 - TIFF import and original image storage.** Read TIFF and BigTIFF in blocks, retain
        native 16-bit samples for enhancement and save originals in bounded writes.
        [V0.87](../CHANGELOG.md#v087--2026-11-09)

### M3 - Analysis and learned segmentation

- [ ] **M3.1 - Analysis performance.** Profile Python and JavaScript before optimising shared algorithms.
      Preserve configurable interval boundaries and regression results.
  - [x] **M3.1.1 - Vectorise Python index classification.** Compile interval maps and preserve custom
        scheme precedence. [V0.89](../CHANGELOG.md#v089--2026-11-09)
- [ ] **M3.2 - U-Net reliability.** Exercise representative CPU and GPU workloads. Test device fallback and
      memory failures, and record model identity and checksums for reproducible inference.
  - [x] **M3.2.1 - U-Net device selection and CPU fallback.** Probe accelerator memory, retry on CPU
        after a recoverable GPU error and expose an explicit CPU option. [V0.90](../CHANGELOG.md#v090--2026-11-09)
  - [ ] **M3.2.2 - Confine U-Net dataset output paths.** Prioritise this audit follow-up. Manifest
        identifiers can affect the destination path when training tiles are written on Windows.
    - **Approach.** Derive safe, deterministic filenames from core and section identifiers and
      verify that each resolved image and mask destination stays within its intended output directory.
    - **Acceptance.** Exercise absolute paths, Windows separators and parent traversal in ZIP and
      folder exports. Reject invalid identifiers or write confined filenames. Verify that nothing is
      created or overwritten outside the output directory, and that colliding identifiers cannot
      overwrite tiles. Run the regression on Windows CI and preserve paired tiles and core splits.
    - **Likely touchpoints.** `src/sedcoretool/unet/dataset.py`, `tests/test_unet.py` and the
      existing Python CI matrix.
  - [ ] **M3.2.3 - Preserve the last working U-Net model.** Starting a fresh desktop training run
        with an existing name removes the published artifacts before preparation succeeds.
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
    - **Approach.** Document training-related network access in `SECURITY.md` and define tested
      dependency constraints for the supported Python, CPU and CUDA configurations.
    - **Acceptance.** Document the downloads and when they occur. Verify that two clean installs
      of a supported configuration resolve to the same dependency versions and can run a trainer
      smoke check. Keep coverage for CPU and each supported CUDA configuration.
    - **Likely touchpoints.** `desktop/trainer.js`, the Python U-Net dependency configuration,
      `SECURITY.md` and the trainer installation checks.
    - **Decision before implementation.** Define the supported environment matrix and how its
      constraints are updated and tested.

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
- [x] **M5.3 - JavaScript type checking.** Check critical modules strictly and detect new diagnostics across
      the application. [V0.92](../CHANGELOG.md#v092--2026-11-09)
- [ ] **M5.4 - Reduce legacy JavaScript type diagnostics.** Replace the baseline entries with checked contracts
      as the corresponding modules are changed.
  - On the next TypeScript upgrade, migrate the deprecated `moduleResolution: "node"` setting and check
    both typecheck configurations and the diagnostic baseline against the new compiler.

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
- [ ] Unified data import; age model edited in the core dialog
- [x] Column headers that stay visible while scrolling
- [ ] Dedicated horizontal layout for each figure type
- [ ] Simultaneous editing of a shared project
- [ ] `app.js` split into smaller modules

## Further ichnological parameters
- [ ] Ichnodiversity, burrow size, tiering and cross-cutting relationships
- [ ] CT and X-ray image support
