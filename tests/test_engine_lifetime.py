"""Engine child processes must not outlive a coordinator that was killed without cleanup."""

import subprocess
import sys
import time
from pathlib import Path

import pytest

from sedcoretool.engine.lifetime import bind_to_process_lifetime

SRC = str(Path(__file__).resolve().parents[1] / 'src')

# The parent binds itself to the job, starts a sleeper that watches nothing, and reports the sleeper's PID.
PARENT = f"""
import subprocess, sys
sys.path.insert(0, {SRC!r})
from sedcoretool.engine.lifetime import bind_to_process_lifetime
print(bind_to_process_lifetime(), flush=True)
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
print(child.pid, flush=True)
sys.stdin.read()
"""


def alive(pid):
    out = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV', '/NH'], capture_output=True, text=True, check=True).stdout
    return f'"{pid}"' in out


def test_binding_is_a_noop_off_windows():
    if sys.platform == 'win32':
        pytest.skip('Windows-specific behaviour is covered by the process-kill test')
    assert bind_to_process_lifetime() is False


@pytest.mark.skipif(sys.platform != 'win32', reason='Job Objects exist only on Windows')
def test_killing_the_coordinator_ends_its_children_without_a_tree_walk():
    parent = subprocess.Popen([sys.executable, '-I', '-c', PARENT], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        assert parent.stdout.readline().strip() == 'True', 'the coordinator could not join a kill-on-close job'
        child_pid = int(parent.stdout.readline())
        assert alive(child_pid)
        parent.kill()  # TerminateProcess: no cleanup code runs in the parent
        parent.wait(timeout=5)
        deadline = time.monotonic() + 2
        while alive(child_pid) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not alive(child_pid), 'child survived the death of its coordinator'
    finally:
        parent.kill()
        parent.wait(timeout=5)
        parent.stdin.close()
        parent.stdout.close()
