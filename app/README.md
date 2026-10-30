# IchAnTool web app

Browser application for ichnological analysis of core images. Everything runs locally in the
browser: images are never uploaded.

## Workflow
1. **Core and image** — one image per core section; top/bottom depth of the analysis area; optional
   age model (`depth, age` per line). Draw the analysis area to leave out scale bars and core edges.
2. **Enhancement** — levels, gamma, brightness/contrast, saturation, histogram equalisation, local
   contrast, channel selection, invert. Presets include the levels/contrast treatment of
   Dorador & Rodríguez-Tovar (2014).
3. **Automatic detection** — adaptive (local) or global threshold, dark/light traces, morphological
   smoothing, minimum size. Re-detection keeps objects already identified.
4. **Editing** — wand (colour region growing), brush, lasso, eraser, and an exclusion brush for cracks,
   voids and sampled areas (excluded pixels leave the denominator).
5. **Identification and learning** — assign ichnotaxa with keys 1–9 (0 = artefact). A distance-weighted
   k-nearest-neighbour model on shape, size and colour descriptors suggests classes for the remaining
   objects, refuses objects unlike any example, and reports leave-one-out accuracy. Models can be
   exported and imported to reuse them across cores.
6. **Results** — per-interval bioturbation %, % per ichnotaxon, BI and ii (automatic and manual), drawn
   next to the image at the same depth scale. Exports: results CSV, objects CSV, colour mask PNG and
   palette JSON (compatible with `ichantool analyze --palette`), and the whole project (JSON).

The analysis reproduces the published v2.1 results (BI/ii identical on the example image).

## Run locally
Any static server from the repository root, e.g.:

```bash
python -m http.server 8000
# open http://localhost:8000/app/
```

Single offline file (no server needed): `python tools/build_standalone.py` -> `dist/IchAnTool.html`.

## Code
- `js/core.js` — binning, indices, age model, CSV, run-length encoding (mirrors the Python package)
- `js/imageproc.js` — enhancement, detection, connected components, wand, lasso, shape descriptors
- `js/learn.js` — incremental k-NN classifier with novelty detection
- `js/app.js` — interface, tools, rendering, files
- `js/i18n.js` — Spanish / English strings

Tests: `npm test` (Node 22).
