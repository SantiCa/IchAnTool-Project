# Changelog

Delivery numbers (V1–V5) and full details: [docs/HISTORIAL_VERSIONES.md](docs/HISTORIAL_VERSIONES.md).

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
