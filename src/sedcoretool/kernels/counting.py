"""Per-row pixel counts: valid, bioturbated and per class.

Three input representations, one counting rule: a pixel that is not excluded is *valid*; it is *bioturbated* once if
any counted class covers it, and counts once for each distinct counted class covering it (so class counts can add up
to more than the bioturbated count where traces overlap).

- ``label_row_counts``: a 2-D class mask (0 = matrix, k = class k), the Python API's native input.
- ``layer_row_counts``: a 3-D stack of boolean class layers, the Python API's overlap input.
- ``object_row_counts``: object labels with an object-to-class table and overlap stacks, the desktop program's
  representation (``app/js/core.js::rowCounts``).

Work is done in blocks of at most 64 rows and 65,536 pixels, so scratch memory is bounded whatever the image size, and
inputs are only read (strided views are fine).
"""

from __future__ import annotations

from typing import NamedTuple

import numpy as np

BLOCK_PIXELS = 65536
BLOCK_ROWS = 64


class RowCounts(NamedTuple):
    """Counts per image row: ``valid[rows]``, ``bio[rows]`` and ``cls[rows, classes]`` (all int64)."""
    valid: np.ndarray
    bio: np.ndarray
    cls: np.ndarray


def _blocks(rows: int, width: int):
    """Yield ``(row, row_end, col, col_end)`` windows of at most 64 rows and 65,536 pixels."""
    block_rows = min(BLOCK_ROWS, max(1, BLOCK_PIXELS // max(1, width)))
    for row in range(0, rows, block_rows):
        for col in range(0, width, BLOCK_PIXELS):
            yield row, min(rows, row + block_rows), col, min(width, col + BLOCK_PIXELS)


def label_row_counts(mask: np.ndarray, valid: np.ndarray, n_classes: int) -> np.ndarray:
    """Valid pixels per row and label of a class mask: an int64 array ``[rows, n_classes + 1]`` whose column 0 is the
    matrix and column k class k. Labels above ``n_classes`` are not allowed."""
    rows, width = mask.shape
    classes = n_classes + 1
    counts = np.zeros((rows, classes), dtype=np.int64)
    for row, end, col, col_end in _blocks(rows, width):
        offsets = np.arange(end - row, dtype=np.intp)[:, None] * classes
        keys = mask[row:end, col:col_end].astype(np.intp) + offsets
        selected = keys[valid[row:end, col:col_end]]
        counts[row:end] += np.bincount(selected, minlength=(end - row) * classes).reshape(end - row, classes)
    return counts


def layer_row_counts(layers: np.ndarray, valid: np.ndarray) -> RowCounts:
    """Counts for a boolean stack ``layers[classes, rows, cols]``: a pixel is bioturbated once if any layer is set and
    counts for every class whose layer is set."""
    n_classes, rows, width = layers.shape
    cls = np.zeros((rows, n_classes), dtype=np.int64)
    bio = np.zeros(rows, dtype=np.int64)
    for row, end, col, col_end in _blocks(rows, width):
        window = valid[row:end, col:col_end]
        block = layers[:, row:end, col:col_end] & window
        cls[row:end] += block.sum(axis=2).T
        bio[row:end] += block.any(axis=0).sum(axis=1)
    return RowCounts(valid.sum(axis=1, dtype=np.int64), bio, cls)


def stack_classes(class_of_object: np.ndarray, stack_offsets: np.ndarray, stack_members: np.ndarray, n_classes: int):
    """Distinct counted classes of every overlap stack as CSR arrays ``(offsets[K + 1], classes)``.

    Row ``k`` of the stack table (stack 0 is unused) lists the class index of each member, without repeats and without
    members that do not count."""
    stacks = len(stack_offsets) - 1
    member_stack = np.repeat(np.arange(stacks, dtype=np.int64), np.diff(stack_offsets.astype(np.int64)))
    member_class = class_of_object[stack_members]
    keep = member_class >= 0
    pairs = np.unique(member_stack[keep] * max(1, n_classes) + member_class[keep])
    pair_stack, pair_class = pairs // max(1, n_classes), pairs % max(1, n_classes)
    return np.searchsorted(pair_stack, np.arange(stacks + 1)), pair_class


def object_row_counts(labels: np.ndarray, valid: np.ndarray, class_of_object: np.ndarray, n_classes: int,
                      stack_offsets: np.ndarray | None = None, stack_members: np.ndarray | None = None) -> RowCounts:
    """Counts from an object label image.

    ``labels[rows, cols]``: 0 = matrix, positive = object id, negative = overlap stack ``-k``. ``valid`` is a boolean
    array of the same shape (False = excluded). ``class_of_object[id]`` is the counted class index of an object, or -1
    when it does not count (entry 0 is ignored). ``stack_offsets`` / ``stack_members`` are the CSR table of overlap
    stacks (``K + 1`` offsets starting at 0; members are object ids); omit both when there are no stacks.

    Callers cut the region of interest out of the image first and validate that every label refers to a listed
    object and stack; a label outside the tables raises ``ValueError`` rather than being skipped.
    """
    rows, width = labels.shape
    given = np.asarray(class_of_object, dtype=np.intp)
    table = np.full(max(1, given.size), -1, dtype=np.intp)   # entry 0 (the matrix) never counts
    table[1:given.size] = given[1:]
    if table.max() >= n_classes:
        raise ValueError("an object refers to a class index outside the class list")
    buckets = table + 1   # histogram column: 0 = valid pixel that does not count, k + 1 = class k
    classes = n_classes + 1
    cls = np.zeros((rows, n_classes), dtype=np.int64)
    bio = np.zeros(rows, dtype=np.int64)
    has_stacks = stack_offsets is not None and len(stack_offsets) > 1
    if has_stacks:
        offsets = np.asarray(stack_offsets, dtype=np.int64)
        members = np.asarray([] if stack_members is None else stack_members, dtype=np.int64)
        if offsets[0] != 0 or offsets[-1] != members.size or np.any(np.diff(offsets) < 0):
            raise ValueError("the overlap stack table is not a valid CSR table")
        if members.size and (members.min() < 1 or members.max() >= table.size):
            raise ValueError("an overlap stack refers to an object that is not in the class table")
        first, stack_class = stack_classes(table, offsets, members, n_classes)
        stacks = len(offsets) - 1
    for row, end, col, col_end in _blocks(rows, width):
        block = labels[row:end, col:col_end]
        window = valid[row:end, col:col_end]
        if block.size and block.max() >= table.size:
            raise ValueError("a label refers to an object that is not in the class table")
        offsets_in_block = np.arange(end - row, dtype=np.intp)[:, None] * classes
        negative = block.size > 0 and block.min() < 0
        if negative:
            keys = buckets[np.maximum(block, 0)] + offsets_in_block
            selected = keys[window & (block >= 0)]
        else:
            selected = (buckets[block] + offsets_in_block)[window]
        histogram = np.bincount(selected, minlength=(end - row) * classes).reshape(end - row, classes)
        cls[row:end] += histogram[:, 1:]
        bio[row:end] += histogram[:, 1:].sum(axis=1)
        if negative:
            if not has_stacks:
                raise ValueError("a label refers to an overlap stack but no stack table was given")
            r, c = np.nonzero(window & (block < 0))
            k = -block[r, c].astype(np.int64)
            if k.max() >= stacks:
                raise ValueError("a label refers to an overlap stack that is not in the stack table")
            pairs, counts = np.unique(r.astype(np.int64) * stacks + k, return_counts=True)
            pair_row, pair_stack = pairs // stacks, pairs % stacks
            each = first[pair_stack + 1] - first[pair_stack]
            np.add.at(bio[row:end], pair_row[each > 0], counts[each > 0])
            total = int(each.sum())
            if total:
                owner = np.repeat(np.arange(pairs.size), each)
                start = np.repeat(first[pair_stack], each)
                inside = np.arange(total) - np.repeat(np.cumsum(each) - each, each)
                np.add.at(cls[row:end], (pair_row[owner], stack_class[start + inside]), counts[owner])
    return RowCounts(valid.sum(axis=1, dtype=np.int64), bio, cls)
