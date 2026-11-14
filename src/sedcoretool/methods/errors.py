"""Errors of scientific methods. Codes are the engine's stable error codes (docs/roadmap-engine-contract.md §3)."""

CODES = ("INVALID_REQUEST", "UNSUPPORTED_METHOD", "UNSUPPORTED_INPUT", "INVALID_BUFFER", "LIMIT_EXCEEDED", "INTERNAL")


class MethodError(Exception):
    """A rejected input. ``code`` is one of ``CODES``; ``field`` names the input and member at fault (for example
    ``"settings.roi"``) and never contains data values, paths or tracebacks."""

    def __init__(self, code: str, field: str | None = None):
        if code not in CODES:
            raise ValueError(f"unknown error code {code!r}")
        super().__init__(code if field is None else f"{code}: {field}")
        self.code = code
        self.field = field


class Cancelled(Exception):
    """Raised by ``run`` when ``cancelled()`` reports a cancellation request; no partial result exists."""
