"""Palette colour forms preserve exact masks, class order and command-line results."""

import itertools
import json

import numpy as np
import pandas as pd
import pytest
from PIL import Image

from sedcoretool import analyze_mask, mask_from_palette
from sedcoretool.cli import main


@pytest.mark.parametrize("colour", ["#abc", "#ABC", "abc", "ABC", "#aabbcc", "#AABBCC", "aabbcc", "AABBCC",
                                    " \t#AbC\n", "  AaBbCc  ", (170, 187, 204), [170, 187, 204],
                                    np.array([170, 187, 204], dtype=np.uint8), (170, 187, 204, 128)])
def test_equivalent_palette_forms_match_the_same_rgb_value(colour):
    image = np.array([[[170, 187, 204], [170, 187, 205]]], dtype=np.uint8)
    mask, names = mask_from_palette(image, {"First": colour, "Second": "#aabbcd"}, tolerance=0)
    np.testing.assert_array_equal(mask, [[1, 2]])
    assert names == ["First", "Second"]
    assert mask.dtype == np.int32


@pytest.mark.parametrize(("tolerance", "expected"), [
    (0, [[1, 0, 0, 0], [2, 0, 0, 0]]),
    (10, [[1, 1, 2, 0], [2, 0, 0, 2]]),
])
def test_short_full_and_rgb_palettes_preserve_exact_masks_and_scientific_results(tolerance, expected):
    image = np.array([[[170, 187, 204], [171, 197, 194], [16, 32, 48], [255, 255, 255]],
                      [[17, 34, 51], [0, 0, 0], [170, 187, 215], [18, 34, 51]]], dtype=np.uint8)
    original = image.copy()
    palettes = [{"Alpha": "#abc", "Beta": "#123", "Duplicate": "#ABC"},
                {"Alpha": "#aabbcc", "Beta": "#112233", "Duplicate": "#AABBCC"},
                {"Alpha": (170, 187, 204), "Beta": (17, 34, 51), "Duplicate": (170, 187, 204)}]
    names = ["Alpha", "Beta", "Duplicate"]
    reference = analyze_mask(np.array(expected), 0, 2, class_names=names).data
    for palette in palettes:
        before = dict(palette)
        mask, classes = mask_from_palette(image, palette, tolerance=tolerance)
        np.testing.assert_array_equal(mask, expected)
        assert classes == names
        assert palette == before
        pd.testing.assert_frame_equal(analyze_mask(mask, 0, 2, class_names=classes).data, reference, check_exact=True)
    np.testing.assert_array_equal(image, original)


def test_every_short_hex_triplet_matches_its_independent_rgb_reference():
    for red, green, blue in itertools.product(range(16), repeat=3):
        image = np.array([[[17 * red, 17 * green, 17 * blue]]], dtype=np.uint8)
        mask, names = mask_from_palette(image, {"Class": f"#{red:x}{green:x}{blue:x}"}, tolerance=0)
        np.testing.assert_array_equal(mask, [[1]])
        assert names == ["Class"]


@pytest.mark.parametrize("colour", ["", " ", "#", "##abc", "##aabbcc", "#a", "#ab", "#abcd", "#abcde",
                                    "#abcdef0", "#aabbccdd", "abcdefjunk", "#ggg", "#aabbcg", "#ab c",
                                    "aabb cc", "rgb(170,187,204)", "red", "0xaabbcc", "#ａｂｃ"])
def test_malformed_hex_reports_the_palette_class_and_supported_forms(colour):
    with pytest.raises(ValueError, match="palette class 'Bad'") as error:
        mask_from_palette(np.zeros((1, 1, 3), dtype=np.uint8), {"Good": "#000000", "Bad": colour})
    assert "3 or 6 hexadecimal digits" in str(error.value)


@pytest.mark.parametrize("command", ["analyze", "batch"])
@pytest.mark.parametrize("colour", ["#abc", "abc", " \t#ABC\n", [170, 187, 204]])
def test_palette_json_forms_produce_identical_cli_output(tmp_path, command, colour):
    image = tmp_path / "section.png"
    Image.fromarray(np.array([[[170, 187, 204], [255, 255, 255]], [[17, 34, 51], [170, 187, 204]]], dtype=np.uint8)).save(image)
    if command == "batch":
        source = tmp_path / "sections.csv"
        source.write_text("image,core,name,top,bottom\nsection.png,Core,Section,0,2\n", encoding="utf-8")
        args = [command, str(source)]
    else:
        args = [command, str(image), "--top", "0", "--bottom", "2"]
    palette = tmp_path / "palette.json"
    outputs = []
    for index, first in enumerate(["#aabbcc", colour]):
        palette.write_text(json.dumps({"First": first, "Second": "#112233"}), encoding="utf-8")
        output = tmp_path / f"result-{index}.csv"
        assert main([*args, "--palette", str(palette), "--tolerance", "0", "-o", str(output)]) == 0
        outputs.append(output.read_bytes())
    assert outputs[0] == outputs[1]


def test_invalid_palette_does_not_replace_a_previous_cli_result(tmp_path):
    image, palette, output = tmp_path / "section.png", tmp_path / "palette.json", tmp_path / "analysis.csv"
    Image.new("RGB", (2, 2)).save(image)
    palette.write_text(json.dumps({"Bad": "#abcde"}), encoding="utf-8")
    output.write_bytes(b"Previous complete result")
    with pytest.raises(ValueError, match="palette class 'Bad'"):
        main(["analyze", str(image), "--top", "0", "--bottom", "2", "--palette", str(palette), "-o", str(output)])
    assert output.read_bytes() == b"Previous complete result"
