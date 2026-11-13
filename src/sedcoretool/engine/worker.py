"""Coordinator-side wrappers of isolated worker processes, and the diagnostic digest worker script.

Everything here is standard library only: the coordinator imports this module and must stay light and responsive.
The worker that runs scientific methods is the separate script ``method_worker.py``.
"""

import hashlib
import os
import subprocess
import sys
import threading
from pathlib import Path

if __package__:
    from .protocol import JSON_FRAME, MAX_CHUNK, ProtocolError, read_frame, strict_json, write_json
else:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from protocol import JSON_FRAME, MAX_CHUNK, ProtocolError, read_frame, strict_json, write_json


class WorkerJob:
    """One worker subprocess with a private liveness pipe, a cancellation marker file and one result frame.

    The worker script receives the command arguments; it may write exactly one JSON frame on stdout, which
    ``accepts`` must approve. ``deadline`` is the longest the coordinator lets it run, in seconds."""

    deadline = 30

    def __init__(self, command, cancel_path):
        self.cancel_path = cancel_path
        self.result = None
        self.drained = threading.Event()
        self.process = subprocess.Popen(
            command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
        )
        self.reader = threading.Thread(target=self.read_result, daemon=True)
        self.reader.start()

    def accepts(self, result):
        raise NotImplementedError

    def read_result(self):
        try:
            frame = read_frame(self.process.stdout)
            if frame is not None and frame[0] == JSON_FRAME:
                result = strict_json(frame[1])
                if self.accepts(result) and read_frame(self.process.stdout) is None:
                    self.result = result
        except (ProtocolError, OSError):
            self.kill()
        finally:
            self.drained.set()

    def cancel(self):
        self.cancel_path.touch(exist_ok=True)

    def kill(self):
        if self.process.poll() is None:
            self.process.kill()

    def finished(self):
        return self.process.poll() is not None and self.drained.is_set()

    def close(self):
        self.kill()
        self.process.wait(timeout=1)
        self.reader.join(timeout=1)
        self.process.stdin.close()
        self.process.stdout.close()
        self.cancel_path.unlink(missing_ok=True)


class DigestJob(WorkerJob):
    """Diagnostic: SHA-256 of a committed buffer, computed in an isolated process."""

    def __init__(self, source, *, script=None):
        cancel_path = source.with_suffix('.cancel')
        super().__init__([sys.executable, '-I', '-B', '-u', str(script or Path(__file__).resolve()), str(source), str(cancel_path)], cancel_path)

    def accepts(self, result):
        return (isinstance(result, dict) and set(result) == {'sha256', 'byte_length'}
                and isinstance(result['sha256'], str) and len(result['sha256']) == 64
                and type(result['byte_length']) is int and result['byte_length'] >= 0)


class MethodJob(WorkerJob):
    """Runs one registered scientific method in ``method_worker.py`` from a job description file the coordinator wrote."""

    deadline = 120

    def __init__(self, job_file, cancel_path, *, script=None):
        super().__init__([sys.executable, '-I', '-B', '-u', str(script or Path(__file__).resolve().with_name('method_worker.py')), str(job_file)], cancel_path)

    def accepts(self, result):
        if not isinstance(result, dict):
            return False
        if set(result) == {'cancelled'}:
            return result['cancelled'] is True
        if set(result) == {'error'}:
            error = result['error']
            return isinstance(error, dict) and set(error) == {'code', 'field'} and isinstance(error['code'], str)
        return set(result) == {'ok', 'dimensions', 'columns'} and result['ok'] is True and isinstance(result['columns'], dict)


def digest_file(source, cancel_path, output):
    digest, completed = hashlib.sha256(), 0
    with source.open('rb') as stream:
        while not cancel_path.exists():
            chunk = stream.read(MAX_CHUNK)
            if not chunk:
                write_json(output, {'sha256': digest.hexdigest(), 'byte_length': completed})
                return
            digest.update(chunk)
            completed += len(chunk)


def watch_coordinator():
    # The write end belongs only to the coordinator. EOF also detects abrupt coordinator death.
    sys.stdin.buffer.raw.read(1)
    os._exit(1)


if __name__ == '__main__':
    threading.Thread(target=watch_coordinator, daemon=True).start()
    try:
        digest_file(Path(sys.argv[1]), Path(sys.argv[2]), sys.stdout.buffer)
    except (OSError, ProtocolError):
        raise SystemExit(1) from None
