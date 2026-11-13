"""Worker that runs one scientific method: ``python -I -B -u method_worker.py <job.json>``.

The coordinator writes ``job.json`` ({method, cancel_path, output_dir, inputs: {name: {path, dtype, shape}}}) and lets
this process do the NumPy work, so the coordinator itself never imports NumPy. Numeric inputs are mapped read-only;
metadata tables are decoded with the same strict JSON rules the transport uses. Results are written to
``<output_dir>/<column>.bin`` (little-endian, C order) and described by one JSON frame on stdout:
``{"ok": true, "dimensions": {...}, "columns": {name: {dtype, shape, byte_length, sha256}}}``, or
``{"error": {"code", "field"}}`` for a rejected input, or ``{"cancelled": true}``. Anything else (a crash, a killed
process) is reported by the coordinator as an internal error.
"""

import hashlib
import json
import sys
import threading
import types
from pathlib import Path

ENGINE = Path(__file__).resolve().parent
PACKAGE = ENGINE.parent                                    # .../sedcoretool

if __package__:
    from .protocol import strict_json, write_json
    from .specs import CONTRACT_DTYPES, NUMPY_DTYPES
    from .worker import watch_coordinator
else:
    # Isolated Python excludes PYTHONPATH and the script directory; add only the engine folder (bare module names).
    sys.path.insert(0, str(ENGINE))
    from protocol import strict_json, write_json
    from specs import CONTRACT_DTYPES, NUMPY_DTYPES
    from worker import watch_coordinator


def load_registry():
    """The method registry, without running ``sedcoretool/__init__.py``.

    That module imports pandas and Pillow (about 0.4 s) for the public API; a method worker needs only NumPy and
    the ``kernels`` and ``methods`` packages, so register the package as an empty parent when it is not loaded yet."""
    if 'sedcoretool' not in sys.modules:
        parent = types.ModuleType('sedcoretool')
        parent.__path__ = [str(PACKAGE)]
        sys.modules['sedcoretool'] = parent
    from sedcoretool.methods import registry
    return registry


def run(job_file):
    import numpy as np

    registry = load_registry()                                  # must come first: it makes ``sedcoretool.methods`` importable
    from sedcoretool.methods.errors import Cancelled, MethodError

    job = json.loads(Path(job_file).read_text(encoding='utf-8'))
    cancel_path, output = Path(job['cancel_path']), Path(job['output_dir'])
    method = registry.get(job['method'])
    inputs = {name: None for name in method.INPUT_NAMES}        # an optional input that was not supplied stays None
    for name, spec in job['inputs'].items():
        path = Path(spec['path'])
        if spec['dtype'] == 'utf8json':
            inputs[name] = strict_json(path.read_bytes(), metadata=True)
        else:
            inputs[name] = np.memmap(path, dtype=NUMPY_DTYPES[spec['dtype']], mode='r', shape=tuple(spec['shape']))
    try:
        result = method.run(method.parse(inputs), cancelled=cancel_path.exists)
    except Cancelled:
        write_json(sys.stdout.buffer, {'cancelled': True})
        return
    except MethodError as error:
        write_json(sys.stdout.buffer, {'error': {'code': error.code, 'field': error.field}})
        return
    columns = {}
    output.mkdir(parents=True, exist_ok=True)
    for name, array in result.columns.items():
        array = np.ascontiguousarray(array)
        array.tofile(output / f'{name}.bin')
        columns[name] = {'dtype': CONTRACT_DTYPES[array.dtype.str], 'shape': list(array.shape), 'byte_length': int(array.nbytes),
                         'sha256': hashlib.sha256(array.data).hexdigest()}
    write_json(sys.stdout.buffer, {'ok': True, 'dimensions': result.dimensions, 'columns': columns})


if __name__ == '__main__':
    threading.Thread(target=watch_coordinator, daemon=True).start()
    run(sys.argv[1])
