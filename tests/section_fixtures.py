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
