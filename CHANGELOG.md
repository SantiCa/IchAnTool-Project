# Changelog

## 3.0.0.dev0 — 2026-10-30
- Rewritten as an installable Python package (`src/ichantool`) with CLI and API.
- Vectorised analysis; PNG/TIFF/JPEG; grayscale and RGB input.
- Multi-class (per-ichnotaxon) percentages from colour-coded images.
- Configurable index schemes; depth -> age conversion; CSV/Excel export.
- Fixes from v2.1: the last data block is no longer dropped; grayscale images no longer crash.
- Results reproduce v2.1 exactly (regression test).
- Original code moved to `legacy/`.

## 2.1 — 2019-10-25
- Console script used in Casanova-Arenillas et al. (2020) and tkinter GUI with auxiliary tools.
