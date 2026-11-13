"""The engine process runs registered methods: real coordinator, real worker subprocess, results downloaded in ranges."""

import hashlib
import io
import json
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import numpy as np
import pytest

import section_fixtures as fixtures
from sedcoretool.engine import specs
from sedcoretool.engine.protocol import BINARY_FRAME, JSON_FRAME, MAX_CHUNK, read_frame, strict_json
from sedcoretool.engine.server import Coordinator
from sedcoretool.methods import section_intervals

ENGINE = Path(__file__).resolve().parents[1] / "src" / "sedcoretool" / "engine"
METHOD = "section.intervals/1"
NAMES = ("basic-four-intervals", "overlap-same-and-different-class", "no-data-padding-2-cm", "ages-with-range", "manual-ranges",
         "predictions-and-candidates-counted", "large-mixed")


def request(session, operation, payload):
    return {"v": 1, "kind": "request", "session": session, "id": str(uuid4()), "op": operation, "payload": payload}


def new_coordinator(**options):
    coordinator = Coordinator(io.BytesIO(), version="test", runtime_id="0" * 64, **options)
    session = str(uuid4())
    coordinator.receive(request(session, "hello", {"protocol": 1}))
    return coordinator, session


def frames(coordinator):
    """(responses by request id, binary payloads by request id) from the output stream, in order."""
    stream = io.BytesIO(coordinator.output.getvalue())
    responses, binaries, last = {}, {}, None
    while frame := read_frame(stream):
        if frame[0] == JSON_FRAME:
            value = strict_json(frame[1])
            assert value["id"] not in responses, "a request received more than one terminal response"
            responses[value["id"]], last = value, value
        else:
            assert frame[0] == BINARY_FRAME and last is not None and last["op"] == "buffer.read" and last["status"] == "ok"
            assert last["id"] not in binaries, "a response was followed by two binary frames"
            binaries[last["id"]] = bytes(frame[1])
    return responses, binaries


def run_until_idle(coordinator, timeout=60):
    deadline = time.monotonic() + timeout
    while (coordinator.active or coordinator.jobs) and time.monotonic() < deadline:
        coordinator.poll()
        time.sleep(0.005)
    assert not coordinator.active and not coordinator.jobs, "the job did not finish"


def put(coordinator, data, dtype, shape):
    store = coordinator.store
    handle = store.begin({"dtype": dtype, "shape": shape, "byte_length": len(data), "sha256": hashlib.sha256(data).hexdigest()})["handle"]
    for offset in range(0, len(data), MAX_CHUNK):
        store.append({"handle": handle, "offset": offset, "byte_length": min(MAX_CHUNK, len(data) - offset)}, data[offset:offset + MAX_CHUNK])
    store.commit({"handle": handle})
    return handle


def upload(coordinator, fixture, change=None):
    """Upload the inputs of a fixture. Returns (handles by input name, settings_hash). `change(inputs)` may alter the decoded inputs."""
    raw = fixture["inputs"]
    inputs = {name: raw[name] for name in ("objects", "classes", "settings", "age_model", "manual_indices")}
    inputs = json.loads(json.dumps(inputs))
    if change:
        change(inputs)
    handles = {}
    for name in ("labels", "exclude", "stack_offsets"):
        array = fixtures.array(raw[name])
        handles[name] = put(coordinator, array.tobytes(), {"labels": "i32le", "exclude": "u8", "stack_offsets": "u32le"}[name], list(array.shape))
    if raw["stack_members"]:
        members = fixtures.array(raw["stack_members"])
        handles["stack_members"] = put(coordinator, members.tobytes(), "u32le", list(members.shape))
    for name, value in inputs.items():
        data = json.dumps(value, separators=(",", ":")).encode()
        handles[name] = put(coordinator, data, "utf8json", [len(data)])
    return handles, coordinator.store.buffers[handles["settings"]].expected_hash


def analysis(session, handles, settings_hash, override=None):
    payload = {"method": METHOD, "project": str(uuid4()), "section": str(uuid4()), "revision": 7, "settings_hash": settings_hash, "inputs": handles}
    return request(session, "section.analyze", {**payload, **(override or {})})


def download(coordinator, session, outputs, chunk=100_000):
    """The result columns, read back with buffer.read in ranges of `chunk` bytes."""
    columns = {}
    for name, item in outputs.items():
        data = bytearray()
        while len(data) < item["byte_length"]:
            asked = request(session, "buffer.read", {"handle": item["handle"], "offset": len(data), "byte_length": min(chunk, item["byte_length"] - len(data))})
            coordinator.receive(asked)
            responses, binaries = frames(coordinator)
            assert responses[asked["id"]]["status"] == "ok"
            data += binaries[asked["id"]]
        assert hashlib.sha256(data).hexdigest() == item["sha256"]
        dtype = np.dtype(fixtures.DTYPES[item["dtype"]])
        columns[name] = np.frombuffer(bytes(data), dtype=dtype).reshape(item["shape"])
    return columns


@pytest.mark.parametrize("name", NAMES)
def test_real_worker_reproduces_a_reference_fixture_and_results_download_in_ranges(name):
    fixture = fixtures.load(name)
    coordinator, session = new_coordinator()
    try:
        handles, settings_hash = upload(coordinator, fixture)
        baseline = coordinator.store.reserved
        job = analysis(session, handles, settings_hash)
        coordinator.receive(job)
        run_until_idle(coordinator)
        response = frames(coordinator)[0][job["id"]]
        assert response["status"] == "ok", response
        result = response["result"]
        assert {key: result[key] for key in ("project", "section", "revision", "settings_hash", "method")} == {
            **{key: job["payload"][key] for key in ("project", "section", "revision", "settings_hash")}, "method": METHOD}
        assert result["dimensions"] == fixture["expected"]["dimensions"]
        assert result["provenance"]["input_sha256"] == {key: coordinator.store.buffers[h].expected_hash for key, h in handles.items()}
        assert (result["provenance"]["engine_version"], result["provenance"]["method"], result["provenance"]["revision"]) == ("test", METHOD, 7)
        assert all(coordinator.store.buffers[h].pins == 0 for h in handles.values()), "inputs are unpinned after the job"
        columns = download(coordinator, session, result["outputs"])
        fixtures.assert_columns_match(name, fixture["expected"]["columns"], columns)
        # Results are charged to the session budget and give it back when released.
        assert coordinator.store.reserved == baseline + sum(item["byte_length"] for item in result["outputs"].values())
        coordinator.receive(request(session, "buffer.release", {"handles": [item["handle"] for item in result["outputs"].values()]}))
        assert coordinator.store.reserved == baseline
        assert not [p for p in Path(coordinator.store.directory.name).iterdir() if p.name.startswith("job-")], "the job directory is removed"
    finally:
        coordinator.close()


def test_buffer_read_answers_with_one_binary_frame_and_rejects_bad_ranges():
    coordinator, session = new_coordinator()
    try:
        data = bytes(range(256)) * 8
        handle = put(coordinator, data, "u8", [len(data)])
        good = request(session, "buffer.read", {"handle": handle, "offset": 10, "byte_length": 100})
        coordinator.receive(good)
        responses, binaries = frames(coordinator)
        assert responses[good["id"]]["result"] == {"offset": 10, "byte_length": 100} and binaries[good["id"]] == data[10:110]
        # The JSON response is immediately followed by its binary frame (checked on the raw frame order).
        stream = io.BytesIO(coordinator.output.getvalue())
        kinds = []
        while frame := read_frame(stream):
            kinds.append(frame[0])
        assert kinds[-2:] == [JSON_FRAME, BINARY_FRAME]
        bad = [({"handle": handle, "offset": len(data), "byte_length": 1}, "INVALID_REQUEST"),
               ({"handle": handle, "offset": 0, "byte_length": len(data) + 1}, "INVALID_REQUEST"),
               ({"handle": handle, "offset": 0, "byte_length": 0}, "INVALID_REQUEST"),
               ({"handle": handle, "offset": 0, "byte_length": MAX_CHUNK + 1}, "INVALID_REQUEST"),
               ({"handle": handle, "offset": -1, "byte_length": 1}, "INVALID_REQUEST"),
               ({"handle": str(uuid4()), "offset": 0, "byte_length": 1}, "INVALID_BUFFER"),
               ({"handle": handle, "offset": 0}, "INVALID_REQUEST")]
        before = len(coordinator.output.getvalue())
        sent = [request(session, "buffer.read", payload) for payload, _ in bad]
        for item in sent:
            coordinator.receive(item)
        responses, binaries = frames(coordinator)
        for item, (_, code) in zip(sent, bad):
            assert responses[item["id"]]["status"] == "error" and responses[item["id"]]["error"]["code"] == code
            assert item["id"] not in binaries
        assert len(coordinator.output.getvalue()) > before
        coordinator.receive(request(session, "buffer.release", {"handles": [handle]}))
        released = request(session, "buffer.read", {"handle": handle, "offset": 0, "byte_length": 1})
        coordinator.receive(released)
        assert frames(coordinator)[0][released["id"]]["error"]["code"] == "INVALID_BUFFER"
    finally:
        coordinator.close()


def test_hello_advertises_both_methods():
    coordinator, session = new_coordinator()
    try:
        hello = next(iter(frames(coordinator)[0].values()))
        assert hello["result"]["methods"] == ["buffer.digest/1", METHOD]
    finally:
        coordinator.close()


def test_a_rejected_snapshot_is_a_field_error_and_the_session_keeps_working():
    fixture = fixtures.load("basic-four-intervals")
    coordinator, session = new_coordinator()
    try:
        handles, settings_hash = upload(coordinator, fixture, change=lambda inputs: inputs["objects"].pop())    # labels now name object 3, which is not listed
        broken = analysis(session, handles, settings_hash)
        coordinator.receive(broken)
        run_until_idle(coordinator)
        error = frames(coordinator)[0][broken["id"]]["error"]
        assert (error["code"], error["details"]) == ("INVALID_BUFFER", {"field": "labels"})
        assert all(coordinator.store.buffers[h].pins == 0 for h in handles.values())
        good_handles, good_hash = upload(coordinator, fixture)
        again = analysis(session, good_handles, good_hash)
        coordinator.receive(again)
        run_until_idle(coordinator)
        assert frames(coordinator)[0][again["id"]]["status"] == "ok"
    finally:
        coordinator.close()


def test_requests_are_validated_before_admission_and_pin_nothing():
    fixture = fixtures.load("overlap-same-and-different-class")
    coordinator, session = new_coordinator()
    try:
        handles, settings_hash = upload(coordinator, fixture)
        missing = {key: value for key, value in handles.items() if key != "classes"}
        swapped = {**handles, "labels": handles["exclude"]}
        shaped = {**handles, "exclude": put(coordinator, bytes(8), "u8", [2, 4])}
        cases = [
            ({"method": "section.intervals/2"}, "UNSUPPORTED_METHOD", "method"),
            ({"project": "not-a-uuid"}, "INVALID_REQUEST", "project"),
            ({"section": 5}, "INVALID_REQUEST", "section"),
            ({"revision": -1}, "INVALID_REQUEST", "revision"),
            ({"revision": "7"}, "INVALID_REQUEST", "revision"),
            ({"settings_hash": "0" * 64}, "INVALID_REQUEST", "settings_hash"),
            ({"settings_hash": "A" * 64}, "INVALID_REQUEST", "settings_hash"),
            ({"inputs": missing}, "INVALID_REQUEST", "inputs"),
            ({"inputs": {**handles, "extra": handles["labels"]}}, "INVALID_REQUEST", "inputs"),
            ({"inputs": "labels"}, "INVALID_REQUEST", "inputs"),
            ({"inputs": swapped}, "INVALID_BUFFER", "labels"),
            ({"inputs": {**handles, "labels": str(uuid4())}}, "INVALID_BUFFER", "labels"),
            ({"inputs": shaped}, "INVALID_BUFFER", "exclude"),
        ]
        sent = [analysis(session, handles, settings_hash, override) for override, _, _ in cases]
        for item in sent:
            coordinator.receive(item)
        responses = frames(coordinator)[0]
        for item, (_, code, field) in zip(sent, cases):
            error = responses[item["id"]]["error"]
            assert (error["code"], error["details"].get("field")) == (code, field), item["payload"]
        assert not coordinator.active and not coordinator.jobs
        assert all(coordinator.store.buffers[h].pins == 0 for h in handles.values())
        unknown_field = request(session, "section.analyze", {**analysis(session, handles, settings_hash)["payload"], "extra": 1})
        coordinator.receive(unknown_field)
        assert frames(coordinator)[0][unknown_field["id"]]["error"]["code"] == "INVALID_REQUEST"
    finally:
        coordinator.close()


def test_cancelling_a_queued_and_a_running_analysis_leaves_no_trace():
    fixture = fixtures.load("large-mixed")
    coordinator, session = new_coordinator()
    try:
        handles, settings_hash = upload(coordinator, fixture)
        baseline = coordinator.store.reserved
        running, queued = analysis(session, handles, settings_hash), analysis(session, handles, settings_hash)
        coordinator.receive(running)
        coordinator.receive(queued)
        assert coordinator.active is not None and len(coordinator.jobs) == 1
        coordinator.receive(request(session, "job.cancel", {"request_id": queued["id"]}))
        coordinator.receive(request(session, "job.cancel", {"request_id": running["id"]}))
        run_until_idle(coordinator)
        responses = frames(coordinator)[0]
        assert responses[queued["id"]]["status"] == "cancelled" and responses[running["id"]]["status"] == "cancelled"
        assert all(coordinator.store.buffers[h].pins == 0 for h in handles.values())
        assert coordinator.store.reserved == baseline
        assert not [p for p in Path(coordinator.store.directory.name).iterdir() if p.name.startswith("job-")]
        after = analysis(session, handles, settings_hash)
        coordinator.receive(after)
        run_until_idle(coordinator)
        assert frames(coordinator)[0][after["id"]]["status"] == "ok"
    finally:
        coordinator.close()


def fake_worker(tmp_path, body):
    script = tmp_path / "fake_method_worker.py"
    script.write_text(body, encoding="utf-8")
    return script


COLUMN_FRAME = (
    "import json, sys\nfrom pathlib import Path\nsys.path.insert(0, {engine!r})\nfrom protocol import write_json\n"
    "job = json.loads(Path(sys.argv[1]).read_text())\nout = Path(job['output_dir'])\n")


@pytest.mark.parametrize("label,body,code", [
    ("exits with an error", "raise SystemExit(1)\n", "INTERNAL"),
    ("writes nothing", "pass\n", "INTERNAL"),
    ("writes garbage", "sys = __import__('sys'); sys.stdout.buffer.write(b'not a frame')\n", "INTERNAL"),
    ("reports an unknown error code", "write_json(sys.stdout.buffer, {'error': {'code': 'TEAPOT', 'field': None}})\n", "INTERNAL"),
    ("reports a field that is not a name", "write_json(sys.stdout.buffer, {'error': {'code': 'INVALID_BUFFER', 'field': '../etc'}})\n", "INTERNAL"),
    ("claims a file that does not exist", "write_json(sys.stdout.buffer, {'ok': True, 'dimensions': {'bins': 1, 'classes': 1, 'schemes': 1},"
                                         " 'columns': {'row_start': {'dtype': 'u32le', 'shape': [1], 'byte_length': 4, 'sha256': '0' * 64}}})\n", "INTERNAL"),
    ("declares a wrong hash", "(out / 'row_start.bin').write_bytes(bytes(4))\nwrite_json(sys.stdout.buffer, {'ok': True,"
                              " 'dimensions': {'bins': 1, 'classes': 1, 'schemes': 1}, 'columns': {'row_start': {'dtype': 'u32le', 'shape': [1],"
                              " 'byte_length': 4, 'sha256': '0' * 64}}})\n", "INTERNAL"),
    ("declares a wrong size", "(out / 'row_start.bin').write_bytes(bytes(8))\nwrite_json(sys.stdout.buffer, {'ok': True,"
                              " 'dimensions': {'bins': 1, 'classes': 1, 'schemes': 1}, 'columns': {'row_start': {'dtype': 'u32le', 'shape': [1],"
                              " 'byte_length': 4, 'sha256': '" + hashlib.sha256(bytes(4)).hexdigest() + "'}}})\n", "INTERNAL"),
    ("names a path as a column", "write_json(sys.stdout.buffer, {'ok': True, 'dimensions': {'bins': 1, 'classes': 1, 'schemes': 1},"
                                 " 'columns': {'../x': {'dtype': 'u32le', 'shape': [1], 'byte_length': 4, 'sha256': '0' * 64}}})\n", "INTERNAL"),
    ("exits with an error after a valid result",
     "import hashlib\ndata = bytes(4)\n(out / 'row_start.bin').write_bytes(data)\n"
     "write_json(sys.stdout.buffer, {'ok': True, 'dimensions': {'bins': 1, 'classes': 1, 'schemes': 1}, 'columns': {'row_start':"
     " {'dtype': 'u32le', 'shape': [1], 'byte_length': 4, 'sha256': hashlib.sha256(data).hexdigest()}}})\nraise SystemExit(3)\n", "INTERNAL"),
    ("declares less than the file holds, with the hash of the file",
     "import hashlib\ndata = bytes(8)\n(out / 'row_start.bin').write_bytes(data)\n"
     "write_json(sys.stdout.buffer, {'ok': True, 'dimensions': {'bins': 1, 'classes': 1, 'schemes': 1}, 'columns': {'row_start':"
     " {'dtype': 'u32le', 'shape': [1], 'byte_length': 4, 'sha256': hashlib.sha256(data).hexdigest()}}})\n", "INTERNAL"),
    ("names a column so that its file lies outside the output folder",
     "import hashlib\ndata = bytes(4)\n(out.parent / 'x.bin').write_bytes(data)\n"
     "write_json(sys.stdout.buffer, {'ok': True, 'dimensions': {'bins': 1, 'classes': 1, 'schemes': 1}, 'columns': {'../x':"
     " {'dtype': 'u32le', 'shape': [1], 'byte_length': 4, 'sha256': hashlib.sha256(data).hexdigest()}}})\n", "INTERNAL"),
    ("returns non-finite float data", "import struct\n(out / 'depth.bin').write_bytes(struct.pack('<d', float('nan')))\n"
                                      "import hashlib\nwrite_json(sys.stdout.buffer, {'ok': True, 'dimensions': {'bins': 1, 'classes': 1, 'schemes': 1},"
                                      " 'columns': {'depth': {'dtype': 'f64le', 'shape': [1], 'byte_length': 8, 'sha256':"
                                      " hashlib.sha256(struct.pack('<d', float('nan'))).hexdigest()}}})\n", "INTERNAL"),
])
def test_a_misbehaving_worker_is_an_internal_error_and_adopts_nothing(tmp_path, label, body, code):
    coordinator, session = new_coordinator(method_script=fake_worker(tmp_path, COLUMN_FRAME.format(engine=str(ENGINE)) + body))
    try:
        handles, settings_hash = upload(coordinator, fixtures.load("basic-four-intervals"))
        baseline, count = coordinator.store.reserved, len(coordinator.store.buffers)
        job = analysis(session, handles, settings_hash)
        coordinator.receive(job)
        run_until_idle(coordinator)
        error = frames(coordinator)[0][job["id"]]["error"]
        assert error["code"] == code, label
        assert coordinator.store.reserved == baseline and len(coordinator.store.buffers) == count, f"{label}: nothing is adopted"
        assert all(coordinator.store.buffers[h].pins == 0 for h in handles.values())
        assert not [p for p in Path(coordinator.store.directory.name).iterdir() if p.name.startswith("job-")]
    finally:
        coordinator.close()


def test_results_that_do_not_fit_the_session_budget_are_refused_and_released():
    fixture = fixtures.load("basic-four-intervals")
    coordinator, session = new_coordinator()
    try:
        handles, settings_hash = upload(coordinator, fixture)
        coordinator.store.budget = coordinator.store.reserved + 100       # room for a few bytes only
        baseline, count = coordinator.store.reserved, len(coordinator.store.buffers)
        job = analysis(session, handles, settings_hash)
        coordinator.receive(job)
        run_until_idle(coordinator)
        error = frames(coordinator)[0][job["id"]]["error"]
        assert error["code"] == "LIMIT_EXCEEDED"
        assert coordinator.store.reserved == baseline and len(coordinator.store.buffers) == count
    finally:
        coordinator.close()


def test_queue_limits_apply_to_analyses_too():
    coordinator, session = new_coordinator(method_script=None)
    try:
        handles, settings_hash = upload(coordinator, fixtures.load("large-mixed"))
        sent = [analysis(session, handles, settings_hash) for _ in range(6)]
        for item in sent:
            coordinator.receive(item)
        responses = frames(coordinator)[0]
        assert responses[sent[5]["id"]]["error"]["code"] == "BUSY"          # one active, four queued, the sixth is refused
        assert coordinator.store.buffers[handles["labels"]].pins == 5
        coordinator.cancel_all()
        assert coordinator.store.buffers[handles["labels"]].pins == 0
    finally:
        coordinator.close()


def test_the_digest_diagnostic_still_works_next_to_the_methods():
    coordinator, session = new_coordinator()
    try:
        data = b"public synthetic bytes"
        handle = put(coordinator, data, "u8", [len(data)])
        job = request(session, "buffer.digest", {"handle": handle})
        coordinator.receive(job)
        run_until_idle(coordinator)
        assert frames(coordinator)[0][job["id"]]["result"] == {"sha256": hashlib.sha256(data).hexdigest(), "byte_length": len(data)}
    finally:
        coordinator.close()


def test_input_tables_of_the_coordinator_agree_with_the_method_module():
    method = specs.METHOD_INPUTS[METHOD]
    assert set(method) == set(section_intervals.INPUT_NAMES)
    assert {name for name, (_, _, needed) in method.items() if not needed} == {"stack_members"}
    expected = {"labels": ("<i4", 2), "exclude": ("u1", 2), "stack_offsets": ("<u4", 1), "stack_members": ("<u4", 1)}
    for name, (dtype, rank) in expected.items():
        assert (specs.NUMPY_DTYPES[method[name][0]], method[name][1]) == (dtype, rank)
    assert all(method[name][0] == "utf8json" for name in ("objects", "classes", "settings", "age_model", "manual_indices"))


def test_a_method_worker_does_not_load_pandas_or_the_public_package():
    code = (f"import sys; sys.path.insert(0, {str(ENGINE)!r}); import method_worker; method_worker.load_registry();"
            " print('pandas' in sys.modules, 'PIL' in sys.modules, 'numpy' in sys.modules)")
    started = time.monotonic()
    out = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True, check=True, timeout=60).stdout.split()
    assert out == ["False", "False", "True"], "start-up stays light: numpy yes, pandas and Pillow no"
    assert time.monotonic() - started < 10


def test_the_liveness_watcher_starts_only_after_numpy_and_the_methods_are_imported():
    # On Windows a thread blocked reading the stdin pipe made `import numpy` hang in a clean environment (GitHub runner,
    # 13 November 2026), while Anaconda's NumPy was unaffected. Guard the start order in the worker's entry point.
    import ast

    tree = ast.parse((ENGINE / "method_worker.py").read_text(encoding="utf-8"))
    main = next(node for node in tree.body if isinstance(node, ast.If) and "__main__" in ast.dump(node.test))
    calls = [ast.unparse(statement) for statement in main.body]
    imports = next(i for i, call in enumerate(calls) if "load_modules()" in call)
    watcher = next(i for i, call in enumerate(calls) if "watch_coordinator" in call)
    assert imports < watcher, calls

