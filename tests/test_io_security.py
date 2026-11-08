import csv
import json
import struct
from zipfile import ZIP_DEFLATED, ZipFile

import numpy as np
import pytest
from openpyxl import load_workbook
from PIL import Image

from sedcoretool import analyze_mask
from sedcoretool.batch import read_manifest, write_manifest_template
from sedcoretool.cli import _write
from sedcoretool.export import to_csv, to_excel
from sedcoretool.unet.dataset import load_export


@pytest.mark.parametrize("joined", [False, True])
def test_spreadsheet_exports_escape_user_text_but_preserve_numeric_depth(tmp_path, joined):
    section = analyze_mask(np.ones((2, 1), dtype=int), -4, -2, class_names=["=1+1"], name="+bad/name")
    section.data["=1+1_pct"] = [100.0, 100.0]
    section.data["comment"] = [" \t@SUM(1,2)", "line\r=1+1"]
    section.data["fullwidth"] = ["＝1+1", "-1+1"]
    section.data["core"] = ["@core", "@core"]
    csv_path, xlsx_path = tmp_path / "out.csv", tmp_path / "out.xlsx"
    if joined:
        _write([section], csv_path, "upper")
        _write([section], xlsx_path, "upper")
    else:
        to_csv([section], csv_path)
        to_excel([section], xlsx_path)
    with csv_path.open(newline="", encoding="utf-8") as stream:
        data = list(csv.DictReader(stream))
    assert [row["depth"] for row in data] == ["-3.5", "-2.5"]
    assert [row["section"] for row in data] == ["'+bad/name", "'+bad/name"]
    assert [row["comment"] for row in data] == ["' \t@SUM(1,2)", "line\r=1+1"]
    assert [row["fullwidth"] for row in data] == ["'＝1+1", "'-1+1"]
    assert data[0]["core"] == "'@core" and "'=1+1_pct" in data[0]
    workbook = load_workbook(xlsx_path)
    try:
        for sheet in workbook.worksheets:
            assert all(cell.data_type != "f" for row in sheet for cell in row)
            depth = next(cell.column for cell in sheet[1] if cell.value == "depth")
            assert sheet.cell(2, depth).value == -3.5 and sheet.cell(2, depth).data_type == "n"
        if not joined:
            assert workbook.sheetnames == ["all", "+bad_name"]
    finally:
        workbook.close()
    assert section.data["section"].iloc[0] == "+bad/name"


def test_manifest_dtypes_and_safe_template_round_trip(tmp_path):
    folder = tmp_path / "=core"
    folder.mkdir()
    image = folder / "-section.png"
    Image.new("L", (2, 2)).save(image)
    manifest = write_manifest_template(folder)
    with manifest.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    assert rows[0]["image"] == "'-section.png" and rows[0]["core"] == "'=core"
    rows[0].update(top="-1.5", bottom="1.5", unused="123", IMAGE=rows[0].pop("image"))
    with manifest.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    frame = read_manifest(manifest)
    assert frame.iloc[0]["image"] == str(image.resolve())
    assert frame.iloc[0]["core"] == "=core" and frame.iloc[0]["name"] == "-section"
    assert frame["top"].dtype == np.float64 and frame.iloc[0]["top"] == -1.5
    assert "unused" not in frame


def _training_zip(path):
    with ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps({"kind": "segmentation-dataset", "items": [], "classes": []}))
    return bytearray(path.read_bytes())


def test_training_zip_rejects_oversized_directory_and_members_before_reading(tmp_path):
    path = tmp_path / "data.zip"
    original = _training_zip(path)
    assert load_export(path) == ([], [])
    central = original.index(b"PK\x01\x02")
    eocd = original.rindex(b"PK\x05\x06")
    oversized = original.copy()
    struct.pack_into("<I", oversized, central + 24, 17 * 1024**2)
    path.write_bytes(oversized)
    with pytest.raises(ValueError, match="uncompressed size"):
        load_export(path)
    oversized = original.copy()
    struct.pack_into("<I", oversized, eocd + 12, 17 * 1024**2)
    path.write_bytes(oversized)
    with pytest.raises(ValueError, match="directory"):
        load_export(path)


def test_training_folder_rejects_members_outside_export(tmp_path):
    folder = tmp_path / "export"
    folder.mkdir()
    Image.new("RGB", (2, 2)).save(tmp_path / "outside.png")
    (folder / "manifest.json").write_text(json.dumps({
        "kind": "segmentation-dataset", "classes": [],
        "items": [{"image": "../outside.png", "mask": "../outside.png"}],
    }), encoding="utf-8")
    with pytest.raises(ValueError, match="member path"):
        load_export(folder)
