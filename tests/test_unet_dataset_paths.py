"""Training exports keep untrusted identifiers out of filesystem paths."""

import io
import json
import os
import re
import subprocess
from zipfile import ZipFile

import numpy as np
import pytest
from PIL import Image

import sedcoretool.unet.dataset as dataset
from sedcoretool.unet import IGNORE, prepare_dataset


def _training_export(tmp_path, identifiers, source_kind):
    members = {}
    items = []
    arrays = []
    for index, (core, section) in enumerate(identifiers):
        image = np.full((8, 8, 3), 24 + 30 * index, dtype=np.uint8)
        mask = np.zeros((8, 8), dtype=np.uint8)
        mask[1:5, 2:6] = 1 + index % 2
        mask[-1] = IGNORE
        arrays.append((image, mask))
        image_name, mask_name = f"images/{index}.png", f"masks/{index}.png"
        for name, array in ((image_name, image), (mask_name, mask)):
            encoded = io.BytesIO()
            Image.fromarray(array).save(encoded, format="PNG")
            members[name] = encoded.getvalue()
        items.append({"core": core, "section": section, "image": image_name, "mask": mask_name, "pxPerCm": 10})
    members["manifest.json"] = json.dumps({
        "kind": "segmentation-dataset", "items": items,
        "classes": [{"index": 1, "name": "Zoophycos"}, {"index": 2, "name": "Chondrites"}],
    }).encode()
    source = tmp_path / f"export-{source_kind}"
    if source_kind == "zip":
        source = source.with_suffix(".zip")
        with ZipFile(source, "w") as archive:
            for name, content in members.items():
                archive.writestr(name, content)
    else:
        for name, content in members.items():
            destination = source / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
    return source, arrays


def _prepare(source, output, **options):
    return prepare_dataset(source, output, tile=8, overlap=2, px_per_cm=10, min_valid=0, **options)


@pytest.mark.parametrize("source_kind", ["zip", "folder"])
def test_absolute_identifier_cannot_overwrite_an_outside_file(tmp_path, source_kind):
    outside = tmp_path / "escape__1__y0_x0.png"
    outside.write_bytes(b"last good outside file")
    source, arrays = _training_export(tmp_path, [(str(tmp_path / "escape"), "1")], source_kind)
    output = tmp_path / "dataset"

    summary = _prepare(source, output, binary=False)

    assert outside.read_bytes() == b"last good outside file"
    assert summary["split"]["train"]["tiles"] == 1
    image_path, = (output / "train/images").glob("*.png")
    mask_path = output / "train/masks" / image_path.name
    np.testing.assert_array_equal(np.asarray(Image.open(image_path)), arrays[0][0])
    np.testing.assert_array_equal(np.asarray(Image.open(mask_path)), arrays[0][1])


@pytest.mark.parametrize("source_kind", ["zip", "folder"])
@pytest.mark.parametrize("identifier", [
    "../escape", r"..\..\..\escape", r"\escape", r"C:\escape", r"C:escape",
    r"\\server\share\escape", "/absolute/escape", "a/b", r"a\b", ".", "..",
    "CON.txt", "name:stream", "bad\x00name", "trail. ", "long" * 100, "Núcleo α",
])
@pytest.mark.parametrize("field", ["core", "section"])
def test_identifiers_produce_portable_confined_filenames(tmp_path, source_kind, identifier, field):
    core, section = (identifier, "1") if field == "core" else ("Core", identifier)
    source, _ = _training_export(tmp_path, [(core, section)], source_kind)
    output = tmp_path / "dataset"

    summary = _prepare(source, output)

    image_path, = (output / "train/images").glob("*.png")
    assert re.fullmatch(r"[A-Za-z0-9_-]+\.png", image_path.name)
    assert len(image_path.name.encode("utf-8")) <= 255
    assert image_path.resolve().parent == (output / "train/images").resolve()
    assert (output / "train/masks" / image_path.name).is_file()
    assert summary["split"]["train"]["cores"] == [core]


@pytest.mark.parametrize("source_kind", ["zip", "folder"])
@pytest.mark.parametrize("identifiers", [
    [("A/B", "1"), ("A_B", "1")],
    [("A__B", "C"), ("A", "B__C")],
    [("Core", "1"), ("core", "1")],
])
@pytest.mark.parametrize("binary", [True, False])
def test_colliding_labels_keep_distinct_pairs_pixels_and_core_splits(tmp_path, source_kind, identifiers, binary):
    identifiers = [*identifiers, ("Validation", "1"), ("Test", "1")]
    source, arrays = _training_export(tmp_path, identifiers, source_kind)
    output = tmp_path / "dataset"

    summary = _prepare(source, output, binary=binary, val_cores=["Validation"], test_cores=["Test"])

    assert summary["split"]["train"]["cores"] == sorted({core for core, _ in identifiers[:2]})
    expected_parts = {"train": [0, 1], "val": [2], "test": [3]}
    for part, indices in expected_parts.items():
        images = list((output / part / "images").glob("*.png"))
        masks = list((output / part / "masks").glob("*.png"))
        assert len(images) == len(masks) == summary["split"][part]["tiles"] == len(indices)
        assert len({path.name.casefold() for path in images}) == len(indices)
        assert {path.name for path in images} == {path.name for path in masks}
        for path in images:
            actual_image = np.asarray(Image.open(path))
            index, = [i for i in indices if np.array_equal(actual_image, arrays[i][0])]
            expected_mask = arrays[index][1].copy()
            if binary:
                expected_mask[(expected_mask != 0) & (expected_mask != IGNORE)] = 1
            np.testing.assert_array_equal(np.asarray(Image.open(output / part / "masks" / path.name)), expected_mask)


@pytest.mark.parametrize("source_kind", ["zip", "folder"])
def test_duplicate_identifiers_are_rejected_before_replacing_a_dataset(tmp_path, source_kind):
    source, _ = _training_export(tmp_path, [("Core", "1")], source_kind)
    output = tmp_path / "dataset"
    _prepare(source, output)
    previous = {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()}
    duplicate, _ = _training_export(tmp_path, [("Core", "1"), ("Core", "1")], source_kind)

    with pytest.raises(ValueError, match="duplicate.*core.*section"):
        _prepare(duplicate, output, overwrite=True)

    assert {path.relative_to(output): path.read_bytes() for path in output.rglob("*") if path.is_file()} == previous


@pytest.mark.parametrize("source_kind", ["zip", "folder"])
def test_item_order_does_not_change_generated_filenames(tmp_path, source_kind):
    identifiers = [("Core", "upper"), ("Core", "lower")]
    source, _ = _training_export(tmp_path, identifiers, source_kind)
    first = tmp_path / "first"
    _prepare(source, first)
    reversed_source, _ = _training_export(tmp_path, identifiers[::-1], source_kind)
    second = tmp_path / "second"
    _prepare(reversed_source, second)

    assert {path.relative_to(first) for path in first.rglob("*.png")} == {path.relative_to(second) for path in second.rglob("*.png")}


@pytest.mark.parametrize("kind", ["images", "masks"])
def test_a_file_appearing_during_tiling_is_not_overwritten(tmp_path, monkeypatch, kind):
    source, _ = _training_export(tmp_path, [("Core", "1")], "zip")
    reference = tmp_path / "reference"
    _prepare(source, reference)
    reference_image, = (reference / "train/images").glob("*.png")
    output = tmp_path / "dataset"
    collision = output / "train" / kind / reference_image.name
    original_tiles = dataset.tiles_of

    def tiles_with_existing_file(*args, **kwargs):
        for tile in original_tiles(*args, **kwargs):
            collision.write_bytes(b"late file sentinel")
            yield tile

    monkeypatch.setattr(dataset, "tiles_of", tiles_with_existing_file)
    with pytest.raises(FileExistsError):
        _prepare(source, output)

    assert collision.read_bytes() == b"late file sentinel"


@pytest.mark.parametrize("field", ["core", "section"])
@pytest.mark.parametrize("identifier", [None, 7, [], ""])
def test_invalid_identifier_types_are_rejected_before_output_creation(tmp_path, field, identifier):
    identifiers = [(identifier, "1")] if field == "core" else [("Core", identifier)]
    source, _ = _training_export(tmp_path, identifiers, "zip")
    output = tmp_path / "dataset"

    with pytest.raises(ValueError, match=f"invalid {field} identifier"):
        _prepare(source, output)

    assert not output.exists()


@pytest.mark.parametrize("linked_part", ["train", "train/images", "train/masks", "dataset.json"])
def test_linked_output_paths_are_refused_before_overwrite(tmp_path, linked_part):
    source, _ = _training_export(tmp_path, [("Core", "1")], "zip")
    output = tmp_path / "dataset"
    outside = tmp_path / "outside"
    outside.mkdir()
    protected = outside / "dataset.json"
    protected.write_bytes(b"outside sentinel")
    target = output / linked_part
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        target.symlink_to(protected if linked_part == "dataset.json" else outside, target_is_directory=linked_part != "dataset.json")
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")
    if linked_part != "dataset.json":
        (output / "dataset.json").write_text("{}")

    with pytest.raises(ValueError, match="output.*path"):
        _prepare(source, output, overwrite=True)

    assert protected.read_bytes() == b"outside sentinel"
    assert not list(outside.glob("*.png"))
    assert target.is_symlink()


@pytest.mark.skipif(os.name != "nt", reason="Windows directory junction regression")
@pytest.mark.parametrize("linked_part", ["train", "train/images", "train/masks"])
def test_windows_junctions_cannot_redirect_dataset_writes(tmp_path, linked_part):
    source, _ = _training_export(tmp_path, [("Core", "1")], "zip")
    output, outside = tmp_path / "dataset", tmp_path / "outside"
    outside.mkdir()
    sentinel = outside / "Core__1__y0_x0.png"
    sentinel.write_bytes(b"outside sentinel")
    link = output / linked_part
    link.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(outside)], check=True, capture_output=True)
    (output / "dataset.json").write_text("{}")

    with pytest.raises(ValueError, match="output.*path"):
        _prepare(source, output, overwrite=True)

    assert sentinel.read_bytes() == b"outside sentinel"
    assert link.resolve() == outside.resolve()
