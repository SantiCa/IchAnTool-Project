# Changelog

Delivery numbers (V1–V5) and full details: [docs/HISTORIAL_VERSIONES.md](docs/HISTORIAL_VERSIONES.md).

## V13 — Web app 0.7.1 — 2026-10-31
- Selection tool: dragging draws a selection box (Shift/Ctrl adds); Shift/Ctrl+click toggles.
- Exclude/Include tools: rectangle shape (or Shift+drag).

## V12 — Web app 0.7 — 2026-10-31
- Multi-selection of traces (Ctrl+click, Shift+drag box, "select suggested as…", "select all unreviewed")
  and joint assignment/acceptance/deletion in one undo step.
- Assigning no longer jumps or zooms; "jump to next" is off by default and keeps the zoom.
- "Pick the setting that best separates traces and matrix" (Otsu separability η).
- Multiproxy: missing-value option (fill with the mean); how-to panel; the author's own thesis data
  (private, git-ignored, built by tools/make_thesis_dataset.py) used when present.

## V11 — Web app 0.6 — 2026-10-31
- Light/dark mode toggle.
- "Test automatic classification on this core" (trained on other cores, or out-of-block within the
  core), with Test/Match bands and optional class colouring behind the record curves.
- Interval ends outside a core's depth–age data are clamped instead of dropping the interval.
- Real thesis cores preloaded in Multiproxy (first version only): ODP 977A and 976 records from
  PANGAEA, and intervals from the thesis (ORL types, ichnological units, ORL 1 phases, sapropels).
- Development moves to the `master` branch.

## V10 — Web app 0.5 — 2026-10-31
- "Geochemistry" mode renamed "Multiproxy": any numeric record (geochemistry, foraminifera, TOC, sedimentology…).
- Interval layers (lithology, turbidites, metal migration zones, events…) with categories and
  parent/child hierarchy; import (wide or long tables), drawing, editing, CSV export; child intervals
  clipped to parent; warnings for intervals outside their parent.
- Interval layers enter the automatic interval classifier as 0/1 variables; any layer can be the target.
- Accept predictions as automatic intervals; confirm them to use them for training.
- V9 projects are converted (label list → "Events" layer). Demo gains synthetic lithology/turbidite intervals.

## V9 — Web app 0.4 — 2026-10-31
- New "Geochemistry" mode in the same projects: import many cores (long table, one file per core,
  catalogue), resampling to a common age/depth grid, ratios, log10, per-core or global z-scores.
- User-defined event labels; labelling by dragged intervals and by proxy-association rules.
- Configurable machine learning with in-app guidance: Random Forest, k-NN, Gaussian naive Bayes,
  k-means; seeded; leave-one-core-out validation, confusion matrix, balanced accuracy, MDI importance.
- Trained model classifies cores added later (scaling frozen at training).
- Maps by age window (dominant class or proxy value/anomaly, exploratory IDW), SVG/CSV export.
- The image core (bioturbation, BI, ii, ichnotaxa, external records) can join the analysis, and its
  geochemical classes are overlaid on the composite core log.
- Synthetic demo dataset (15 cores) and Natural Earth coastline.

## V8 — Web app 0.3 — 2026-10-31
- Enhancement presets from the literature: Dorador et al. (2014) Levels→Brightness/Contrast→
  Vibrance/Saturation (auto levels, auto gamma within the published range) and CLAHE
  (Miguez-Salas et al., 2019). Vibrance, CLAHE, auto levels/gamma controls.
- Detection: two-class k-means threshold and hole filling.
- User presets (enhancement + detection), shared across projects.
- Backups: persistent storage, automatic folder mirror (Chrome/Edge) with daily history,
  full backup download, multi-file restore.
- Fix: the generic "levels" preset is no longer attributed to Dorador & Rodríguez-Tovar (2014).

## V7 — Web app 0.2 — 2026-10-31
- Project library in the browser (IndexedDB) with autosave; import/export project files (format v2).
- Core log view: all sections on a depth or age axis, interval window, image resampled to the axis,
  total and per-ichnotaxon bioturbation, BI/ii, manual indices, external records (CSV/TXT/Excel);
  SVG and CSV export.
- Working resolution on import (box-average downsampling).
- Test core: IODP 397-U1385I-1H images (50 px/cm), colour reflectance and magnetic susceptibility.

## V6 — Standalone app file — 2026-10-30
- `tools/build_standalone.py` builds `dist/IchAnTool.html`: the whole web app plus example in one
  file that opens by double-click, offline, without a server. Analysis unchanged.

## V5 — Documentation — 2026-10-30
- Technical reference of all algorithms (`docs/DOCUMENTACION_TECNICA.md`), version history
  (`docs/HISTORIAL_VERSIONES.md`), methods and reviewer-defence notes per paper
  (`publications/METODOS_Y_DEFENSA.md`), documentation rules (`CLAUDE.md`, `CONTRIBUTING.md`).

## V4 — Web app 0.1 — 2026-10-30
- New browser application in `app/`: sections with depths and age model, analysis area, image
  enhancement, automatic detection, wand/brush/lasso/eraser/exclusion tools, ichnotaxon labelling
  with incremental learning, synced depth profile, BI/ii automatic and manual, CSV/PNG/JSON export,
  project save/load, Spanish/English interface.
- Reproduces published v2.1 indices on the example image.

## V3 — Python package 3.0.0.dev0 — 2026-10-30
- Rewritten as an installable Python package (`src/ichantool`) with CLI and API.
- Vectorised analysis; PNG/TIFF/JPEG; grayscale and RGB input.
- Multi-class (per-ichnotaxon) percentages from colour-coded images.
- Configurable index schemes; depth -> age conversion; CSV/Excel export.
- Fixes from v2.1: the last data block is no longer dropped; grayscale images no longer crash.
- Results reproduce v2.1 exactly (regression test).
- Original code moved to `legacy/`.

## V1–V2 — 2019 (GUI, then console 2.1) — 2019-10-25
- Console script used in Casanova-Arenillas et al. (2020) and tkinter GUI with auxiliary tools.
