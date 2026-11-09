"""Export results for correlation with other core data: CSV, Excel and LAS 2.0."""

from __future__ import annotations

import re
from collections.abc import Iterable
from csv import QUOTE_NONNUMERIC
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from .pipeline import UNIT_TO_CM, CoreSection

DEPTH_COLS = ("depth_top", "depth_bottom", "depth")
_FORMULA_START = re.compile(r"^[ \u00a0]*[\t\r\n]|^[\s\x00-\x1f\ufeff]*[=+@\-＝＋－＠]")


def combine(sections: Iterable[CoreSection]) -> pd.DataFrame:
    return pd.concat([s.data for s in sections], ignore_index=True)


def join_sections(sections: Iterable[CoreSection], units: str | None = None, overlap: str = "keep") -> pd.DataFrame:
    """Join the sections of one core into a single series sorted by depth (as the program's core column).

    Intervals are not recomputed. Depths are converted to ``units`` (default: those of the uppermost section).
    Gaps between sections are left as they are. Where sections overlap (a splice), ``overlap="keep"`` keeps every
    interval, ``"upper"`` keeps the upper section and drops the intervals of a lower section whose centre falls
    inside a section above, and ``"error"`` raises ValueError.
    """
    if overlap not in ("keep", "upper", "error"):
        raise ValueError("overlap must be 'keep', 'upper' or 'error'")
    secs = sorted(sections, key=lambda s: s.top * UNIT_TO_CM[s.units])
    if not secs:
        raise ValueError("no sections to join")
    units = units or secs[0].units
    parts, covered = [], []   # covered: (top, bottom) of the sections already added, in output units
    for s in secs:
        f = UNIT_TO_CM[s.units] / UNIT_TO_CM[units]
        d = s.data.copy()
        for c in DEPTH_COLS:
            if c in d:
                d[c] = d[c] * f
        top, bottom = s.top * f, s.bottom * f
        inside = np.zeros(len(d), dtype=bool)
        for a, b in covered:
            inside |= (d["depth"].to_numpy() > a) & (d["depth"].to_numpy() < b)
        if inside.any():
            if overlap == "error":
                raise ValueError(f"section {s.name!r} overlaps a section above it; use overlap='upper' or 'keep'")
            if overlap == "upper":
                d = d[~inside]
        covered.append((top, bottom))
        parts.append(d)
    out = pd.concat(parts, ignore_index=True).sort_values("depth", kind="stable", ignore_index=True)
    out.attrs["units"] = units
    return out



def spreadsheet_text(value):
    """Escape a potentially active spreadsheet cell while leaving numeric values numeric."""
    if isinstance(value, str) and _FORMULA_START.match(value):
        return "'" + value
    return value


def _spreadsheet_table(table: pd.DataFrame) -> pd.DataFrame:
    out = table.copy(deep=False)
    out.columns = table.columns.map(spreadsheet_text)
    for i, dtype in enumerate(table.dtypes):
        if pd.api.types.is_string_dtype(dtype) or isinstance(dtype, pd.CategoricalDtype):
            out.isetitem(i, table.iloc[:, i].map(spreadsheet_text))
    return out


def write_csv_table(table: pd.DataFrame, path: str | Path) -> Path:
    path = Path(path)
    _spreadsheet_table(table).to_csv(path, index=False, quoting=QUOTE_NONNUMERIC, lineterminator="\r\n")
    return path


def write_excel_table(table: pd.DataFrame, path: str | Path) -> Path:
    path = Path(path)
    _spreadsheet_table(table).to_excel(path, engine="openpyxl", index=False)
    return path


def to_csv(sections: Iterable[CoreSection], path: str | Path) -> Path:
    return write_csv_table(combine(sections), path)


def _worksheet_name(value: str, used: set[str]) -> str:
    stem = re.sub(r"[\x00-\x1f\[\]:*?/\\]", "_", value)[:31].strip("'") or "section"
    name, i = stem, 2
    while name.casefold() in used:
        suffix = f"_{i}"
        name = stem[:31 - len(suffix)] + suffix
        i += 1
    used.add(name.casefold())
    return name


def to_excel(sections: Iterable[CoreSection], path: str | Path) -> Path:
    """One sheet with all data plus one sheet per section (needs openpyxl)."""
    sections = list(sections)
    path = Path(path)
    used = {"all"}
    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        _spreadsheet_table(combine(sections)).to_excel(xw, sheet_name="all", index=False)
        for s in sections:
            _spreadsheet_table(s.data).to_excel(xw, sheet_name=_worksheet_name(s.name, used), index=False)
    return path


LAS_NULL = -999.25
_LAS_UNITS = {"mm": "MM", "cm": "CM", "m": "M"}


def _mnemonic(name: str, used: set[str]) -> str:
    m = re.sub(r"[^A-Za-z0-9_]", "_", name).strip("_").upper()[:24] or "CURVE"
    base, k = m, 2
    while m in used:
        m = f"{base[:21]}_{k}"
        k += 1
    used.add(m)
    return m


def to_las(sections: Iterable[CoreSection], path: str | Path, well: str = "", units: str | None = None,
           overlap: str = "upper", *, overwrite: bool = True) -> Path:
    """LAS 2.0 file (one core) for well-log software. Depth = interval centre; no data = -999.25.

    The sections are joined with :func:`join_sections` (default ``overlap="upper"``, because depth must increase).
    STEP is the interval spacing when it is regular and 0 otherwise (gaps, mixed interval thickness).
    Set ``overwrite=False`` to create the destination exclusively.
    """
    from . import __version__
    sections = list(sections)
    df = join_sections(sections, units, overlap)
    units = df.attrs["units"]
    if df.empty:
        raise ValueError("no intervals to write")
    dep = df["depth"].to_numpy(dtype=float)
    if np.any(np.diff(dep) <= 0):
        raise ValueError("depths must increase strictly; overlapping sections need overlap='upper'")
    steps = np.diff(dep)
    step = float(np.round(steps[0], 6)) if len(steps) and np.allclose(steps, steps[0], rtol=1e-6, atol=1e-9) else 0.0
    du = _LAS_UNITS[units]
    used = {"DEPT"}
    curves = [("DEPT", du, "Depth of the interval centre", "depth")]
    curves += [(_mnemonic("DTOP", used), du, "Interval top", "depth_top"),
               (_mnemonic("DBOT", used), du, "Interval bottom", "depth_bottom")]
    if "age" in df:
        curves.append((_mnemonic("AGE", used), "", "Age from the age model", "age"))
    curves += [(_mnemonic("VALID", used), "%", "Valid (not excluded) pixels", "valid_pct"),
               (_mnemonic("BIOT", used), "%", "Bioturbation", "bioturbation_pct")]
    names = list(dict.fromkeys(n for s in sections for n in s.class_names))
    for n in names:
        if f"{n}_pct" in df:
            curves.append((_mnemonic(f"{n}_PCT", used), "%", f"{n} (percent of valid pixels)", f"{n}_pct"))
    for c in df.columns[df.columns.get_loc("bioturbation_pct") + 1:]:
        if c not in {col for *_, col in curves} and c not in ("section", "core", "age"):
            curves.append((_mnemonic(c, used), "", f"Index {c}", c))
    cols = [c for c in curves if c[3] in df]
    data = np.column_stack([pd.to_numeric(df[c[3]], errors="coerce").astype(float).to_numpy() for c in cols])
    data = np.where(np.isfinite(data), data, LAS_NULL)

    def line(mnem, unit, value, desc):
        return f"{mnem:<8}.{unit:<6} {value:<28}: {desc}"

    fmt = lambda x: f"{x:.4f}"  # noqa: E731
    out = ["~VERSION INFORMATION",
           line("VERS", "", "2.0", "CWLS LOG ASCII STANDARD - VERSION 2.0"),
           line("WRAP", "", "NO", "ONE LINE PER DEPTH STEP"),
           "~WELL INFORMATION",
           line("STRT", du, fmt(dep[0]), "START DEPTH"),
           line("STOP", du, fmt(dep[-1]), "STOP DEPTH"),
           line("STEP", du, fmt(step), "STEP (0 = IRREGULAR)"),
           line("NULL", "", str(LAS_NULL), "NULL VALUE"),
           line("COMP", "", "", "COMPANY"),
           line("WELL", "", well or sections[0].name, "CORE OR WELL"),
           line("FLD", "", "", "FIELD"),
           line("LOC", "", "", "LOCATION"),
           line("SRVC", "", f"sedcoretool {__version__}", "SERVICE COMPANY"),
           line("DATE", "", date.today().isoformat(), "DATE"),
           "~CURVE INFORMATION"]
    out += [line(m, u, "", d) for m, u, d, _ in cols]
    out += ["~PARAMETER INFORMATION",
            line("NSEC", "", str(len(sections)), "Number of core sections"),
            line("SECT", "", ", ".join(s.name for s in sorted(sections, key=lambda s: s.top * UNIT_TO_CM[s.units])),
                 "Sections, top to bottom")]
    out.append("~A " + " ".join(m for m, *_ in cols))
    out += [" ".join(f"{v:12.4f}" for v in row) for row in data]
    path = Path(path)
    with path.open("w" if overwrite else "x", encoding="ascii", errors="replace") as file:
        file.write("\n".join(out) + "\n")
    return path
