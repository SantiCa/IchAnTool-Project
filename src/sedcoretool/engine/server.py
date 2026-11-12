"""Private desktop coordinator. Run this fixed script with Python -I -u."""

import argparse
import os
import queue
import re
import sys
import threading
import time
from collections import deque
from pathlib import Path

if __package__:
    from .buffers import MAX_BUFFER, SESSION_BUDGET, BufferStore
    from .protocol import (
        BINARY_FRAME,
        JSON_FRAME,
        MAX_CHUNK,
        MAX_JSON,
        ProtocolError,
        RequestError,
        is_uuid,
        read_frame,
        require_fields,
        write_json,
    )
    from .worker import DigestJob
else:
    # Isolated Python excludes both PYTHONPATH and the script directory. Only our fixed source is added.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from buffers import MAX_BUFFER, SESSION_BUDGET, BufferStore
    from protocol import (
        BINARY_FRAME,
        JSON_FRAME,
        MAX_CHUNK,
        MAX_JSON,
        ProtocolError,
        RequestError,
        is_uuid,
        read_frame,
        require_fields,
        write_json,
    )
    from worker import DigestJob


class Coordinator:
    def __init__(self, output, *, version, runtime_id, worker_script=None, scratch_directory=None):
        self.output = output
        self.version = version
        self.runtime_id = runtime_id
        self.worker_script = worker_script
        self.session = None
        self.seen = set()
        self.store = BufferStore(scratch_directory=scratch_directory)
        self.jobs = deque()
        self.active = None
        self.closing = False

    def response(self, request, status='ok', result=None, error=None):
        value = {key: request[key] for key in ('v', 'session', 'id', 'op')}
        value.update(kind='response', status=status)
        if status == 'ok':
            value['result'] = result
        elif status == 'error':
            value['error'] = {'code': error.code, 'message_key': f'engine.error.{error.code}',
                              'retryable': error.code in ('BUSY', 'INTERNAL'),
                              'details': {'field': error.field} if error.field else {}}
        write_json(self.output, value)

    def receive(self, request, data=None):
        require_fields(request, ('v', 'kind', 'session', 'id', 'op', 'payload'))
        if type(request['v']) is not int or request['v'] != 1 or request['kind'] != 'request':
            raise ProtocolError('invalid envelope')
        if not is_uuid(request['id']) or not is_uuid(request['session']) or not isinstance(request['op'], str):
            raise ProtocolError('invalid identity')
        if self.session is not None and request['session'] != self.session:
            raise ProtocolError('stale session')
        if request['id'] in self.seen:
            self.response(request, 'error', error=RequestError('INVALID_REQUEST'))
            return
        if len(self.seen) >= 65_536:
            raise ProtocolError('session request limit')
        self.seen.add(request['id'])
        try:
            result = self.dispatch(request, data)
            if result is not None:
                self.response(request, result=result)
        except RequestError as error:
            self.response(request, 'error', error=error)
        except OSError:
            self.response(request, 'error', error=RequestError('INTERNAL'))

    def dispatch(self, request, data):
        operation, payload = request['op'], request['payload']
        if operation == 'hello':
            require_fields(payload, ('protocol',))
            if self.session is not None or type(payload['protocol']) is not int or payload['protocol'] != 1:
                raise ProtocolError('unsupported handshake')
            self.session = request['session']
            return {'protocol': 1, 'engine_version': self.version, 'runtime_id': self.runtime_id,
                    'methods': ['buffer.digest/1'], 'limits': {'json_bytes': MAX_JSON, 'chunk_bytes': MAX_CHUNK,
                    'buffer_bytes': MAX_BUFFER, 'session_bytes': SESSION_BUDGET, 'active_jobs': 1, 'queued_jobs': 4}}
        if self.session is None:
            raise ProtocolError('handshake required')
        if operation == 'buffer.begin':
            return self.store.begin(payload)
        if operation == 'buffer.chunk':
            return self.store.append(payload, data)
        if operation == 'buffer.commit':
            return self.store.commit(payload)
        if operation == 'buffer.release':
            require_fields(payload, ('handles',))
            handles = payload['handles']
            if not isinstance(handles, list) or len(handles) > 64 or not all(is_uuid(handle) for handle in handles):
                raise RequestError('INVALID_REQUEST', 'handles')
            for handle in handles:
                self.store.release(handle)
            return {'released': handles}
        if operation == 'buffer.digest':
            require_fields(payload, ('handle',))
            value = self.store.get(payload['handle'], committed=True)
            if self.active is not None and len(self.jobs) >= 4:
                raise RequestError('BUSY')
            value.pins += 1
            self.jobs.append(request)
            self.start_next()
            return None
        if operation == 'job.cancel':
            require_fields(payload, ('request_id',))
            if not is_uuid(payload['request_id']):
                raise RequestError('INVALID_REQUEST', 'request_id')
            for job in list(self.jobs):
                if job['id'] == payload['request_id']:
                    self.jobs.remove(job)
                    self.finish(job, 'cancelled')
                    return {'state': 'requested'}
            if self.active and self.active['request']['id'] == payload['request_id']:
                if self.active['cancel_at'] is None:
                    self.active['cancel_at'] = time.monotonic()
                    self.active['worker'].cancel()
                return {'state': 'requested'}
            return {'state': 'already_terminal'}
        if operation == 'shutdown':
            require_fields(payload, ())
            self.closing = True
            self.cancel_all()
            return {}
        raise RequestError('UNSUPPORTED_METHOD')

    def start_next(self):
        if self.active is not None or not self.jobs or self.closing:
            return
        request = self.jobs.popleft()
        # Queued jobs already pinned an immutable snapshot; release only revokes new access.
        value = self.store.buffers[request['payload']['handle']]
        try:
            worker = DigestJob(value.path, script=self.worker_script)
        except OSError:
            self.finish(request, 'error', error=RequestError('INTERNAL'))
            return
        self.active = {'request': request, 'worker': worker, 'cancel_at': None, 'started_at': time.monotonic()}

    def finish(self, request, status, *, result=None, error=None):
        self.store.unpin(request['payload']['handle'])
        self.response(request, status, result, error)

    def poll(self):
        active = self.active
        if active is None:
            self.start_next()
            return
        worker = active['worker']
        if active['cancel_at'] is not None and time.monotonic() - active['cancel_at'] >= 1.5:
            worker.kill()
        if time.monotonic() - active['started_at'] >= 30:
            worker.kill()
        if not worker.finished():
            return
        self.active = None
        result = worker.result
        worker.close()
        source = self.store.buffers[active['request']['payload']['handle']]
        if result is not None and (result['sha256'] != source.expected_hash or result['byte_length'] != source.length):
            result = None
        if active['cancel_at'] is not None:
            self.finish(active['request'], 'cancelled')
        elif result is not None and worker.process.returncode == 0:
            self.finish(active['request'], 'ok', result=result)
        else:
            self.finish(active['request'], 'error', error=RequestError('INTERNAL'))
        self.start_next()

    def cancel_all(self, *, notify=True):
        while self.jobs:
            request = self.jobs.popleft()
            self.store.unpin(request['payload']['handle'])
            if notify:
                self.response(request, 'cancelled')
        if self.active:
            active = self.active
            active['worker'].close()
            self.active = None
            self.store.unpin(active['request']['payload']['handle'])
            if notify:
                self.response(active['request'], 'cancelled')

    def close(self):
        try:
            self.cancel_all(notify=False)
        finally:
            self.store.close()


def read_requests(stream, inbox):
    try:
        while (frame := read_frame(stream)) is not None:
            kind, data = frame
            if kind != JSON_FRAME:
                raise ProtocolError('unexpected binary')
            if __package__:
                from .protocol import strict_json
            else:
                from protocol import strict_json
            request = strict_json(data)
            binary = None
            if isinstance(request, dict) and request.get('op') == 'buffer.chunk':
                following = read_frame(stream)
                if following is None or following[0] != BINARY_FRAME:
                    raise ProtocolError('missing binary frame')
                binary = following[1]
            inbox.put((request, binary))
    except (ProtocolError, OSError) as error:
        inbox.put(error)
    finally:
        inbox.put(None)


def serve(input_stream, output_stream, *, version, runtime_id, scratch_directory):
    coordinator = Coordinator(output_stream, version=version, runtime_id=runtime_id, scratch_directory=scratch_directory)
    inbox = queue.Queue(maxsize=2)
    threading.Thread(target=read_requests, args=(input_stream, inbox), daemon=True).start()
    try:
        while not coordinator.closing:
            try:
                item = inbox.get(timeout=0.02)
                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item
                coordinator.receive(*item)
            except queue.Empty:
                pass
            coordinator.poll()
    finally:
        coordinator.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--runtime-id', required=True)
    parser.add_argument('--scratch-dir', required=True)
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{64}', args.runtime_id):
        parser.error('runtime-id must be a SHA-256 digest')
    threads = str(max(1, min(4, (os.cpu_count() or 1) - 1)))
    for variable in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS'):
        os.environ[variable] = threads
    try:
        # A daemon reader must not hold BufferedReader's lock during interpreter shutdown.
        serve(sys.stdin.buffer.raw, sys.stdout.buffer, version=args.version, runtime_id=args.runtime_id, scratch_directory=args.scratch_dir)
    except (ProtocolError, RequestError, OSError):
        # No input content, paths or tracebacks on the public transport/diagnostic boundary.
        print('engine transport closed', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
