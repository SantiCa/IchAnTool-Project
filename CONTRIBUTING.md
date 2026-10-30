# Contributing

Contributions from ichnologists, sedimentologists and developers are welcome.

1. Open an issue describing the bug or feature (sample images help a lot).
2. Fork, create a branch, and install in development mode: `pip install -e ".[dev]"`.
3. Add tests in `tests/` and run `pytest`.
4. Open a pull request.

New segmentation methods must return `(mask, class_names)` where `mask` is a 2-D integer array
(0 = matrix), so they plug into `analyze_mask` unchanged.
