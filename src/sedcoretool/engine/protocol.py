"""Bounded, versioned framing for the private desktop pipes (no scientific imports)."""

import json
import math
import struct
from uuid import UUID

HEADER = struct.Struct('<4sBBHI')
JSON_FRAME = 1
BINARY_FRAME = 2
MAX_JSON = 65_536
MAX_CHUNK = 1_048_576
MAX_METADATA = 4 * MAX_CHUNK
MAX_SAFE_INTEGER = 2**53 - 1


class ProtocolError(ValueError):
    """The pipe cannot safely continue after this error."""


class RequestError(ValueError):
    def __init__(self, code, field=None):
        super().__init__(code)
        self.code = code
        self.field = field


def is_uuid(value):
    if not isinstance(value, str):
        return False
    try:
        return str(UUID(value)) == value
    except ValueError:
        return False


def require_fields(value, fields):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise RequestError('INVALID_REQUEST')


def require_integer(value, field, minimum=0, maximum=MAX_SAFE_INTEGER):
    if type(value) is not int or not minimum <= value <= maximum:
        raise RequestError('INVALID_REQUEST', field)
    return value


def strict_json(data, *, metadata=False):
    """Preflight depth/strings before allocating a parsed object graph."""
    try:
        text = data.decode('utf-8', errors='strict')
        depth, quoted, escaped, string_start = 0, False, False, 0
        for position, char in enumerate(text):
            if quoted:
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == '"':
                    quoted = False
                    if metadata and len(text[string_start:position].encode('utf-8')) > 6 * 4096:
                        raise ProtocolError('string limit')
            elif char == '"':
                quoted, string_start = True, position + 1
            elif char in '[{':
                depth += 1
                if depth > 16:
                    raise ProtocolError('nesting limit')
            elif char in ']}':
                depth -= 1

        def pairs(items):
            result = {}
            for key, value in items:
                if key in result:
                    raise ProtocolError('duplicate key')
                result[key] = value
            return result

        def integer(token):
            value = int(token)
            if abs(value) > MAX_SAFE_INTEGER:
                raise ProtocolError('unsafe integer')
            return value

        def number(token):
            value = float(token)
            if not math.isfinite(value) or (value.is_integer() and abs(value) > MAX_SAFE_INTEGER):
                raise ProtocolError('nonfinite or unsafe number')
            return value

        def invalid_constant(_token):
            raise ProtocolError('nonfinite number')

        result = json.loads(text, object_pairs_hook=pairs, parse_int=integer, parse_float=number, parse_constant=invalid_constant)
        if metadata:
            pending = [result]
            while pending:
                value = pending.pop()
                if isinstance(value, list):
                    if len(value) > 65_536:
                        raise ProtocolError('record limit')
                    pending.extend(value)
                elif isinstance(value, dict):
                    if len(value) > 65_536:
                        raise ProtocolError('record limit')
                    pending.extend(value.keys())
                    pending.extend(value.values())
                elif isinstance(value, str) and len(value.encode('utf-8')) > 4096:
                    raise ProtocolError('string limit')
        return result
    except (UnicodeError, ValueError, RecursionError) as error:
        raise ProtocolError('invalid JSON') from error


def read_exact(stream, length, *, allow_eof=False):
    result = bytearray(length)
    offset = 0
    while offset < length:
        chunk = stream.read(length - offset)
        if not chunk:
            if offset == 0 and allow_eof:
                return None
            raise ProtocolError('truncated frame')
        result[offset:offset + len(chunk)] = chunk
        offset += len(chunk)
    return result


def read_frame(stream):
    header = read_exact(stream, HEADER.size, allow_eof=True)
    if header is None:
        return None
    magic, kind, flags, reserved, length = HEADER.unpack(header)
    limit = MAX_JSON if kind == JSON_FRAME else MAX_CHUNK
    if magic != b'SCE1' or kind not in (JSON_FRAME, BINARY_FRAME) or flags or reserved or not 0 < length <= limit:
        raise ProtocolError('invalid frame header')
    return kind, read_exact(stream, length)


def write_json(stream, value):
    payload = json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(',', ':')).encode('utf-8')
    if len(payload) > MAX_JSON:
        raise ProtocolError('outgoing frame limit')
    stream.write(HEADER.pack(b'SCE1', JSON_FRAME, 0, 0, len(payload)))
    stream.write(payload)
    stream.flush()
