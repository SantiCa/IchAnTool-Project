"""Isolated diagnostic worker with bounded output and cooperative cancellation."""

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


class DigestJob:
    def __init__(self, source, *, script=None):
        self.cancel_path = source.with_suffix('.cancel')
        self.result = None
        self.drained = threading.Event()
        self.process = subprocess.Popen(
            [sys.executable, '-I', '-B', '-u', str(script or Path(__file__).resolve()), str(source), str(self.cancel_path)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
        )
        self.reader = threading.Thread(target=self.read_result, daemon=True)
        self.reader.start()

    def read_result(self):
        try:
            frame = read_frame(self.process.stdout)
            if frame is not None and frame[0] == JSON_FRAME:
                result = strict_json(frame[1])
                if (isinstance(result, dict) and set(result) == {'sha256', 'byte_length'}
                        and isinstance(result['sha256'], str) and len(result['sha256']) == 64
                        and type(result['byte_length']) is int and result['byte_length'] >= 0):
                    if read_frame(self.process.stdout) is None:
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
