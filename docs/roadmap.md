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

- [ ] **M0.1 - Reproducible performance baseline.** **Ready.** First task. Codex edits and delivers.
      Claude reviews in read-only mode and independently reruns both benchmark cases.
- [x] **M0.2 - Import and export safety.** Bound ZIP expansion and escape formula-like spreadsheet text
      while preserving numeric measurements. [V0.91](../CHANGELOG.md#v091--2026-11-09)
- [ ] **M0.3 - Project validation.** Identify the supported formats and migration paths. Start with diagnostic
      warnings and cover current and legacy projects before considering rejection rules.

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

- [ ] **M1.1 - Editing history.** Measure long editing sessions and use overlap, undo and reload tests to guide
      any change to editing history or stack compaction.
  - [x] **M1.1.1 - Reclaim unused overlap stacks during editing.** Share stack entries with undo and rebuild
        active pixel codes independently. [V0.88](../CHANGELOG.md#v088--2026-11-09)
  - [ ] **M1.1.2 - Measure object history costs.** If shallow snapshots dominate, record changed objects only
        and share immutable descriptors. Keep typed image and mask buffers outside immutable state.
- [ ] **M1.2 - Interrupted saves.** Exercise recovery through IndexedDB and file backup paths. Preserve the
      last successful save and verify that failures are visible to the user.

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
