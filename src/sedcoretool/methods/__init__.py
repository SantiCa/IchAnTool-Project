"""Versioned scientific methods run by the engine and callable directly.

A method module defines ``NAME`` (``"section.intervals/1"``), ``parse(inputs) -> snapshot`` which validates every
input before any calculation, and ``run(snapshot, report, cancelled) -> result``. Methods use ``sedcoretool.kernels``
and NumPy only; they know nothing about frames, handles or sessions (docs/ARCHITECTURE.md §3.1).
"""
