"""Generated CSV, literal-text workbook edits and unmarked manifest compatibility."""

import csv

import numpy as np
import pytest
from openpyxl import Workbook, load_workbook
from PIL import Image

from sedcoretool.batch import read_manifest, run_manifest, write_manifest_template

MARKER = "__sedcoretool_csv_escape__"
VERSION = "apostrophe-v1"
IMAGE_NAMES = ["'quoted.png", "''double.png", "-dash.png", "+plus.png", "=equals.png", "@at.png",
               " space.png", "Plain.png", "NA.png", "NULL.png", "á,sed.png"]


def read_csv_rows(path):
    with path.open(newline="", encoding="utf-8-sig") as stream:
        return list(csv.DictReader(stream))


def write_csv_rows(path, rows):
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def edit_depths_in_workbook(manifest):
    """Import text literally, save/reopen XLSX, then serialise its edited cells back to CSV."""
    rows = read_csv_rows(manifest)
    headers = list(rows[0])
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows:
        sheet.append([row[column] for column in headers])
    for index, row in enumerate(sheet.iter_rows(min_row=2)):
        for column, cell in zip(headers, row):
            if column == "top":
                cell.value = -(index + 1) * 0.5
            elif column == "bottom":
                cell.value = -(index + 1) * 0.5 + 0.25
            else:
                cell.data_type = "s"
    workbook_path = manifest.with_suffix(".xlsx")
    workbook.save(workbook_path)
    workbook.close()
    reopened = load_workbook(workbook_path)
    try:
        for row in reopened.active.iter_rows(min_row=2):
            assert all(cell.data_type == ("n" if column in ("top", "bottom") else "s") or cell.value is None
                       for column, cell in zip(headers, row))
        edited = [dict(zip(headers, values)) for values in reopened.active.iter_rows(min_row=2, values_only=True)]
        write_csv_rows(manifest, edited)
    finally:
        reopened.close()


@pytest.mark.parametrize("core_name", ["Plain", "'Core", "=Core", "NA", " Core"])
@pytest.mark.parametrize("editor", ["csv", "xlsx"])
def test_generated_manifest_preserves_mixed_text_after_depth_edits(tmp_path, core_name, editor):
    folder = tmp_path / core_name
    folder.mkdir()
    for name in IMAGE_NAMES:
        Image.new("L", (2, 2), 1).save(folder / name)
        Image.fromarray(np.array([[0, 255], [0, 255]], dtype=np.uint8)).save(folder / (name[:-4] + "_excl.png"))
    manifest = write_manifest_template(folder)
    generated = read_csv_rows(manifest)
    by_image = {row["image"]: row for row in generated}
    # A formula-like neighbour marks a row; an original apostrophe is doubled only in that row.
    literal = by_image["''quoted.png" if core_name == "=Core" else "'quoted.png"]
    assert literal["name"] == ("''quoted" if core_name == "=Core" else "'quoted")
    assert (literal.get(MARKER) == VERSION) == (core_name == "=Core")
    assert by_image["'-dash.png"][MARKER] == VERSION
    assert by_image["'-dash.png"]["core"] == ("''Core" if core_name == "'Core" else "'=Core" if core_name == "=Core" else core_name)

    if editor == "xlsx":
        edit_depths_in_workbook(manifest)
    else:
        rows = read_csv_rows(manifest)
        for index, row in enumerate(rows):
            row.update(top=str(-(index + 1) * 0.5), bottom=str(-(index + 1) * 0.5 + 0.25))
        write_csv_rows(manifest, rows)

    frame = read_manifest(manifest)
    expected_names = sorted(IMAGE_NAMES)
    assert frame["image"].tolist() == [str((folder / name).resolve()) for name in expected_names]
    assert frame["name"].tolist() == [name[:-4] for name in expected_names]
    assert frame["core"].tolist() == [core_name] * len(expected_names)
    assert frame["exclude"].tolist() == [str((folder / (name[:-4] + "_excl.png")).resolve()) for name in expected_names]
    assert frame["top"].dtype == frame["bottom"].dtype == np.float64
    sections = run_manifest(manifest, bin_px=1)[core_name]
    assert {section.name for section in sections} == {name[:-4] for name in expected_names}
    for section in sections:
        np.testing.assert_array_equal(section.data["bioturbation_pct"], [100, 100])
        np.testing.assert_array_equal(section.data["valid_pct"], [50, 50])
        np.testing.assert_array_equal(section.data["BI"], [6, 6])
        np.testing.assert_array_equal(section.data["ii"], [6, 6])


@pytest.mark.parametrize("value", ["NA", "N/A", "NULL", "null", "NaN", "#N/A", "None", "<NA>", "001",
                                  "'literal", "''double", "-name", "+name", "=SUM(1,2)", "@name", " name", "\t+name",
                                  'quoted "name", value', "line\nbreak"])
def test_unmarked_user_manifest_keeps_text_literal(tmp_path, value):
    manifest = tmp_path / "manual.csv"
    write_csv_rows(manifest, [{"image": "section.png", "top": -1.5, "bottom": 1.5, "core": value, "name": value, "units": "cm"}])
    row = read_manifest(manifest).iloc[0]
    assert row["core"] == row["name"] == value
    assert row["top"] == -1.5 and row["bottom"] == 1.5


@pytest.mark.parametrize(("encoded", "expected"), [
    ("''literal", "'literal"), ("'''double", "''double"), ("'-name", "-name"), ("'+name", "+name"),
    ("'=SUM(1,2)", "=SUM(1,2)"), ("'@name", "@name"), ("' \t+name", " \t+name"),
    (" ordinary", " ordinary"), ("NA", "NA"),
])
def test_marked_row_text_edits_follow_existing_apostrophe_v1_contract(tmp_path, encoded, expected):
    manifest = tmp_path / "edited.csv"
    write_csv_rows(manifest, [{"image": "''literal.png", "core": "'=Core", "name": encoded,
                              "exclude": "'-exclude.png", "units": "cm", "top": -1.5, "bottom": 1.5, MARKER: VERSION}])
    row = read_manifest(manifest).iloc[0]
    assert row["name"] == expected and row["core"] == "=Core"
    assert row["image"] == str((tmp_path / "'literal.png").resolve())
    assert row["exclude"] == str((tmp_path / "-exclude.png").resolve())


def test_escape_marker_is_per_row_and_optional_blanks_keep_defaults(tmp_path):
    manifest = tmp_path / "mixed.csv"
    rows = [{"image": "''literal.png", "core": "'=Core", "name": "''literal", "exclude": "", "units": "cm", "top": 0, "bottom": 1, MARKER: VERSION},
            {"image": "'literal.png", "core": "'Core", "name": "'literal", "exclude": "", "units": "cm", "top": 1, "bottom": 2, MARKER: ""},
            {"image": "section.png", "core": "", "name": "", "exclude": "", "units": "", "top": 2, "bottom": 3, MARKER: ""}]
    write_csv_rows(manifest, rows)
    frame = read_manifest(manifest)
    assert frame["image"].tolist()[:2] == [str((tmp_path / "'literal.png").resolve())] * 2
    assert frame["core"].tolist() == ["=Core", "'Core", "mixed"]
    assert frame["name"].tolist() == ["'literal", "'literal", "section"]
    assert frame["units"].tolist() == ["cm"] * 3
    assert frame["exclude"].tolist() == [None] * 3


def test_literal_na_path_is_not_reported_as_an_empty_image(tmp_path):
    manifest = tmp_path / "literal.csv"
    write_csv_rows(manifest, [{"image": "NA", "exclude": "NULL", "top": 0, "bottom": 1}])
    row = read_manifest(manifest).iloc[0]
    assert row["image"] == str((tmp_path / "NA").resolve())
    assert row["exclude"] == str((tmp_path / "NULL").resolve())
