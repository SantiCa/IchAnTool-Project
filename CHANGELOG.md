# Changelog

Delivery numbers (V1–V5) and full details: [docs/HISTORIAL_VERSIONES.md](docs/HISTORIAL_VERSIONES.md).

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
