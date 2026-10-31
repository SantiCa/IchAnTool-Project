# CorAnTool (formerly IchAnTool) — project rules

Owner: Santiago Casanova-Arenillas. Communicate in Spanish.

## Documentation is part of every change
Every delivery that changes code, algorithms, defaults or files must, in the same commit:
1. Get the next delivery number **V<n>** (see `docs/HISTORIAL_VERSIONES.md`; last: V19) and mention it in the reply.
2. Add a `V<n>` section to `docs/HISTORIAL_VERSIONES.md` (Qué se hizo / Cambios / Por qué / Comprobación / Pendiente) and a row in its summary table.
3. Update `docs/DOCUMENTACION_TECNICA.md` if any algorithm, formula, default value, file format or validation result changes. Formulas there must match the code exactly.
4. Update `publications/METODOS_Y_DEFENSA.md` if the change affects what a paper can claim.
5. Add a short English entry to `CHANGELOG.md`.

## Git
- Work on `master` (the main branch); commit each delivery there.

## Code
- Python package: `src/ichantool/` — tests `pytest`.
- Web app: `app/` (no build step, ES modules) — pure modules `core.js`, `imageproc.js`, `learn.js`, `log.js`, `geo.js`, `sheet.js` must stay DOM-free; tests `npm test`. New modules must be added to `tools/build_standalone.py` (ORDER) and top-level names must not clash across modules.
- Analysis definitions (binning, indices, depth mapping) must stay identical in Python and JS; keep the regression test against `legacy/v2.1_console/example_output.csv` passing.
- Never modify `legacy/`.
- Name: the app is **CorAnTool** since V16; keep the Python import name `ichantool`, the IndexedDB/localStorage keys `ichantool*` and accept project files with `app: 'IchAnTool'`.
- `examples/tesis_casanova/privado/` holds the owner's unpublished data: never commit it (git-ignored).
