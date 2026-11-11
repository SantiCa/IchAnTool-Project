"""Standalone support for compatibility exports without duplicate global bindings."""
import importlib
from pathlib import Path

import pytest


@pytest.fixture
def strip_module(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[1] / "tools"))
    return importlib.import_module("build_standalone").strip_module


def test_local_export_lists_preserve_the_original_binding(strip_module):
    source = "import { value } from './depth.js';\nexport {\n value, other_value, $helper,\n};\nexport const result = value;\n"
    stripped = strip_module(source)
    assert stripped.strip() == "const result = value;"
    assert strip_module("export const text = 'export { value };';") == "const text = 'export { value };';"


@pytest.mark.parametrize("source", ["export { value as alias };", "export { value } from './depth.js';",
                                    "export { value }"])
def test_unsupported_lists_fail_explicitly_instead_of_emitting_broken_html(strip_module, source):
    with pytest.raises(ValueError, match="local unaliased names and a semicolon"):
        strip_module(source)
