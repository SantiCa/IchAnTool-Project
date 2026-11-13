"""Import rules of the Python layers (docs/ARCHITECTURE.md §3.1), read from the source with ``ast``.

kernels  -> numpy and the standard library only; no IO-like modules.
methods  -> kernels, numpy and the standard library; no pandas, Pillow, engine or IO-like modules.
engine   -> the coordinator and transport files use the standard library only; worker.py may also use methods and numpy.
public   -> pipeline, indices, depth, io, ... never start or import the engine process.
"""

import ast
import sys
from pathlib import Path

import pytest

PACKAGE = Path(__file__).resolve().parents[1] / "src" / "sedcoretool"
STDLIB = set(sys.stdlib_module_names)
IO_LIKE = {"os", "sys", "pathlib", "subprocess", "socket", "shutil", "tempfile", "urllib", "http", "ssl", "glob", "io",
           "ctypes", "multiprocessing", "threading", "importlib"}
ENGINE_SIBLINGS = {"buffers", "lifetime", "protocol", "server", "worker"}   # imported by bare name when run with python -I
PUBLIC = {"pipeline", "indices", "depth", "io", "segmentation", "export", "batch", "cli", "plotting"}


def imported_modules(relative_path: str, source: str) -> set[str]:
    """Fully qualified names of every module imported anywhere in ``source`` (nested imports included)."""
    parts = Path(relative_path).with_suffix("").parts
    base = ["sedcoretool", *parts[:-1]]
    found = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                anchor = base[: len(base) - (node.level - 1)]
                found.add(".".join([*anchor, *([node.module] if node.module else [])]))
            else:
                found.add(node.module or "")
    return found


def violations(relative_path: str, source: str) -> list[str]:
    """Rules of the layer that ``relative_path`` (below src/sedcoretool) belongs to."""
    parts = Path(relative_path).parts
    layer = parts[0] if len(parts) > 1 else Path(relative_path).stem
    problems = []
    for name in sorted(imported_modules(relative_path, source)):
        top, second = name.split(".")[0], (name.split(".") + [""])[1]
        internal = top == "sedcoretool"
        stdlib = top in STDLIB
        bare_engine_sibling = layer == "engine" and name in ENGINE_SIBLINGS
        if layer in ("kernels", "methods"):
            allowed = (stdlib and top not in IO_LIKE) or top == "numpy" or (internal and second in (layer, "kernels"))
            if layer == "kernels" and internal and second != "kernels":
                allowed = False
            if not allowed:
                problems.append(f"{relative_path}: {layer} may not import {name}")
        elif layer == "engine":
            worker = parts[-1] == "worker.py"
            allowed = (stdlib or bare_engine_sibling or (internal and second == "engine")
                       or (worker and (top == "numpy" or (internal and second in ("methods", "kernels")))))
            if not allowed:
                problems.append(f"{relative_path}: {'the worker' if worker else 'the coordinator and transport'} may not import {name}")
        elif layer in PUBLIC and internal and second == "engine":
            problems.append(f"{relative_path}: the public API may not import the engine ({name})")
    return problems


SOURCES = sorted(path.relative_to(PACKAGE).as_posix() for path in PACKAGE.rglob("*.py")
                 if path.relative_to(PACKAGE).parts[0] in {"kernels", "methods", "engine"} or path.parent == PACKAGE)


def test_every_layer_has_files_to_check():
    layers = {Path(name).parts[0] for name in SOURCES}
    assert {"kernels", "engine", "pipeline.py"} <= layers


@pytest.mark.parametrize("relative_path", SOURCES)
def test_modules_respect_the_import_rules_of_their_layer(relative_path):
    source = (PACKAGE / relative_path).read_text(encoding="utf-8")
    assert violations(relative_path, source) == []


def test_the_checker_catches_each_kind_of_violation():
    assert violations("kernels/x.py", "import numpy as np\nfrom math import floor\nfrom .binning import bin_edge\n") == []
    assert violations("kernels/x.py", "import pandas as pd")
    assert violations("kernels/x.py", "from PIL import Image")
    assert violations("kernels/x.py", "import os")
    assert violations("kernels/x.py", "from ..indices import IndexScheme")
    assert violations("kernels/x.py", "def f():\n    import subprocess\n")                       # nested imports count
    assert violations("kernels/x.py", "from ..engine import server")
    assert violations("methods/x.py", "from ..kernels.binning import bin_edges\nimport numpy\n") == []
    assert violations("methods/x.py", "import pandas")
    assert violations("methods/x.py", "from ..engine import protocol")
    assert violations("engine/server.py", "import queue\nfrom .protocol import ProtocolError\nfrom buffers import BufferStore\n") == []
    assert violations("engine/server.py", "import numpy")
    assert violations("engine/server.py", "from ..methods import registry")
    assert violations("engine/buffers.py", "import json\nfrom .protocol import strict_json\n") == []
    assert violations("engine/worker.py", "import numpy\nfrom ..methods.registry import METHODS\nfrom .protocol import read_frame\n") == []
    assert violations("engine/worker.py", "import pandas")
    assert violations("engine/worker.py", "from ..unet import train")
    assert violations("pipeline.py", "from .kernels.binning import bin_edges\nimport pandas\n") == []
    assert violations("pipeline.py", "from .engine import server")
    assert violations("cli.py", "import sedcoretool.engine.server")
