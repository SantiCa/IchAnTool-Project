"""Reader for the section-interval reference fixtures (tests/fixtures/section-intervals, see its README)."""

import json
from pathlib import Path

import numpy as np

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "section-intervals"
DTYPES = {"u8": "u1", "i32le": "<i4", "u32le": "<u4", "u64le": "<u8", "f64le": "<f8"}


def names():
    return sorted(path.stem for path in FIXTURE_DIR.glob("*.json"))


def load(name):
    return json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))


def array(buffer):
    """NumPy array of a fixture buffer ({dtype, shape, data} or {dtype, shape, runs})."""
    if "runs" in buffer:
        data = np.repeat([value for value, _ in buffer["runs"]], [count for _, count in buffer["runs"]])
    else:
        data = np.asarray(buffer["data"])
    return data.astype(DTYPES[buffer["dtype"]]).reshape(buffer["shape"])


def column(columns, name):
    """(values, valid) of a result column; valid is None for a column that is never missing."""
    c = columns[name]
    values = array(c)
    return values, (np.asarray(c["valid"], dtype=bool).reshape(c["shape"]) if "valid" in c else None)


def class_of_object(inputs):
    """Counted class index of every object id (-1 = does not count). Only for testing the kernels; the engine method
    implements this rule itself (contract §4): assigned class, else the prediction at or above the threshold when
    predictions are included, else 'undet' when candidates count, else none."""
    settings = inputs["settings"]
    index = {c["id"]: k for k, c in enumerate(inputs["classes"]) if c["counts"]}
    table = np.full(max((o["id"] for o in inputs["objects"]), default=0) + 1, -1, dtype=np.intp)
    for o in inputs["objects"]:
        if o["class_id"]:
            effective = o["class_id"]
        elif settings["include_predictions"] and o["predicted_class_id"] and o["confidence"] >= settings["prediction_threshold"]:
            effective = o["predicted_class_id"]
        else:
            effective = "undet" if settings["count_candidates"] else None
        table[o["id"]] = index.get(effective, -1)
    return table


EXACT_COLUMNS = {"row_start", "row_end", "valid_count", "bio_count", "class_count", "no_data", "manual_BI", "manual_ii", "indices"}
FLOAT_COLUMNS = {"depth_top", "depth_bottom", "depth", "valid_pct", "bioturbation_pct", "class_pct", "age", "age_min", "age_max"}
RESULT_DTYPES = {"row_start": "<u4", "row_end": "<u4", "valid_count": "<u8", "bio_count": "<u8", "class_count": "<u8", "no_data": "u1",
                 "manual_BI": "<i4", "manual_ii": "<i4", "indices": "<i4", "depth_top": "<f8", "depth_bottom": "<f8", "depth": "<f8",
                 "valid_pct": "<f8", "bioturbation_pct": "<f8", "class_pct": "<f8", "age": "<f8", "age_min": "<f8", "age_max": "<f8"}


def assert_columns_match(name, expected, got):
    """Compare result columns with a fixture's `expected["columns"]`. `got` maps column names (and `<name>_valid`) to arrays.

    Exact for counts, row bounds, indices, no-data flags, manual indices and every validity array; absolute error <= 1e-9
    for floating-point columns. Invalid slots must hold exactly 0, and dtypes and shapes must be the contract's."""
    expected_keys = set(expected) | {f"{c}_valid" for c, spec in expected.items() if "valid" in spec}
    assert set(got) == expected_keys, f"{name}: columns differ"
    for key in expected:
        values, valid = column(expected, key)
        array = got[key]
        assert array.dtype == np.dtype(RESULT_DTYPES[key]) and array.shape == values.shape, f"{name}: {key}"
        if valid is not None:
            np.testing.assert_array_equal(got[f"{key}_valid"], valid.astype("u1"), err_msg=f"{name}: {key}_valid")
            assert np.all(array[~valid] == 0), f"{name}: invalid slots of {key} hold 0"
        if key in EXACT_COLUMNS:
            np.testing.assert_array_equal(array, values, err_msg=f"{name}: {key}")
        else:
            assert key in FLOAT_COLUMNS
            np.testing.assert_allclose(array, values, rtol=0, atol=1e-9, err_msg=f"{name}: {key}")
