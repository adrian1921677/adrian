"""Value scanner: first scan, next scan, like Cheat Engine.

Results are kept per memory region ("chunk"). An unknown-initial-value scan
keeps a full snapshot of the region; every later scan shrinks it to the
indices that still match.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from . import values as V
from .backend import ProcessHandle

ProgressFn = Callable[[float], None]
CancelFn = Callable[[], bool]

# Scan modes. Values are the German labels shown in the UI.
EXACT = "exact"
BETWEEN = "between"
BIGGER = "bigger"
SMALLER = "smaller"
UNKNOWN = "unknown"
INCREASED = "increased"
DECREASED = "decreased"
CHANGED = "changed"
UNCHANGED = "unchanged"
INCREASED_BY = "increased_by"
DECREASED_BY = "decreased_by"

MODE_LABELS = {
    EXACT: "Genau dieser Wert",
    BETWEEN: "Zwischen zwei Werten",
    BIGGER: "Größer als",
    SMALLER: "Kleiner als",
    UNKNOWN: "Unbekannter Startwert",
    INCREASED: "Größer geworden",
    DECREASED: "Kleiner geworden",
    CHANGED: "Verändert",
    UNCHANGED: "Gleich geblieben",
    INCREASED_BY: "Größer geworden um …",
    DECREASED_BY: "Kleiner geworden um …",
}
FIRST_MODES = [EXACT, BETWEEN, BIGGER, SMALLER, UNKNOWN]
NEXT_MODES = [EXACT, INCREASED, DECREASED, CHANGED, UNCHANGED, INCREASED_BY, DECREASED_BY, BETWEEN, BIGGER, SMALLER]
NEEDS_VALUE = {EXACT, BETWEEN, BIGGER, SMALLER, INCREASED_BY, DECREASED_BY}

BLOCK = 16 * 1024 * 1024  # regions are read in pieces of this size
MAX_TEXT_HITS = 1_000_000


@dataclass
class ScanSettings:
    vtype: V.ValueType
    mode: str
    value: str = ""
    value2: str = ""
    writable_only: bool = True
    aligned: bool = True


@dataclass
class Chunk:
    base: int  # address of element 0
    values: np.ndarray  # last seen values (all elements if idx is None)
    idx: np.ndarray | None = None  # element indices still matching

    def count(self) -> int:
        return len(self.values) if self.idx is None else len(self.idx)

    def addresses(self, size: int) -> np.ndarray:
        idx = np.arange(len(self.values), dtype=np.uint64) if self.idx is None else self.idx.astype(np.uint64)
        return np.uint64(self.base) + idx * np.uint64(size)


@dataclass
class ScanResults:
    vtype: V.ValueType
    chunks: list[Chunk] = field(default_factory=list)
    text_hits: np.ndarray | None = None  # addresses, only for text scans
    snapshot_bytes: int = 0

    def count(self) -> int:
        if self.vtype.is_text:
            return 0 if self.text_hits is None else len(self.text_hits)
        return sum(c.count() for c in self.chunks)

    def first(self, limit: int) -> list[tuple[int, object]]:
        """First `limit` results as (address, previous value)."""
        out: list[tuple[int, object]] = []
        if self.vtype.is_text:
            for a in (self.text_hits if self.text_hits is not None else [])[:limit]:
                out.append((int(a), None))
            return out
        size = self.vtype.size
        for c in self.chunks:
            if len(out) >= limit:
                break
            take = limit - len(out)
            if c.idx is None:
                idx = np.arange(min(take, len(c.values)))
                vals = c.values[: len(idx)]
            else:
                idx = c.idx[:take]
                vals = c.values[:take]
            for i, v in zip(idx.tolist(), vals.tolist()):
                out.append((c.base + int(i) * size, v))
        return out


class Scanner:
    def __init__(self, proc: ProcessHandle) -> None:
        self.proc = proc

    # --- comparisons ------------------------------------------------------
    @staticmethod
    def _targets(s: ScanSettings):
        vt = s.vtype
        a = b = tol = None
        if s.mode in NEEDS_VALUE:
            a = V.parse_number(vt, s.value)
            tol = V.float_tolerance(s.value) if vt.is_float else 0
            if s.mode == BETWEEN:
                b = V.parse_number(vt, s.value2)
                if b < a:
                    a, b = b, a
        return a, b, tol

    @staticmethod
    def _match(mode: str, cur: np.ndarray, old: np.ndarray | None, a, b, tol, is_float: bool) -> np.ndarray:
        if mode == EXACT:
            return np.abs(cur - a) <= tol if is_float else cur == a
        if mode == BETWEEN:
            return (cur >= a) & (cur <= b)
        if mode == BIGGER:
            return cur > a
        if mode == SMALLER:
            return cur < a
        assert old is not None
        if mode == INCREASED:
            return cur > old
        if mode == DECREASED:
            return cur < old
        if mode == CHANGED:
            return cur != old
        if mode == UNCHANGED:
            return cur == old
        if mode in (INCREASED_BY, DECREASED_BY):
            diff = (cur - old) if mode == INCREASED_BY else (old - cur)
            return np.abs(diff - a) <= tol if is_float else diff == a
        raise ValueError(mode)

    # --- first scan ---------------------------------------------------------
    def first_scan(self, s: ScanSettings, progress: ProgressFn, cancel: CancelFn) -> ScanResults:
        regions = self.proc.regions(writable_only=s.writable_only)
        total = sum(r.size for r in regions) or 1
        done = 0
        res = ScanResults(s.vtype)
        if s.vtype.is_text:
            return self._first_text(s, regions, progress, cancel)
        a, b, tol = self._targets(s)
        dt = V.np_dtype(s.vtype)
        size = s.vtype.size
        step = size if s.aligned else 1
        lanes = range(0, size, step)
        for r in regions:
            if cancel():
                break
            for off in range(0, r.size, BLOCK):
                span = min(BLOCK + size - 1, r.size - off)  # overlap so values across blocks are found
                raw, ok = self.proc.read_blocks(r.start + off, span)
                if not ok.any():
                    continue
                for lane in lanes:
                    n = (span - lane) // size
                    if n <= 0:
                        continue
                    # Only keep elements that start inside this block (not in the overlap).
                    n = min(n, (min(BLOCK, r.size - off) - lane + size - 1) // size)
                    if n <= 0:
                        continue
                    arr = raw[lane : lane + n * size].view(dt)
                    base = r.start + off + lane
                    if s.mode == UNKNOWN:
                        # Keep a plain snapshot: cheaper than storing indices for
                        # almost every element. NaNs drop out in the next scan.
                        values = arr.copy()
                        res.chunks.append(Chunk(base, values))
                        res.snapshot_bytes += values.nbytes
                        continue
                    with np.errstate(invalid="ignore", over="ignore"):
                        mask = self._match(s.mode, arr, None, a, b, tol, s.vtype.is_float)
                    mask &= _valid_elements(ok, lane, n, size)
                    idx = np.flatnonzero(mask).astype(np.int32)
                    if len(idx):
                        res.chunks.append(Chunk(base, arr[idx].copy(), idx))
                done_now = min(BLOCK, r.size - off)
                done += done_now
                progress(done / total)
        return res

    def _first_text(self, s, regions, progress, cancel) -> ScanResults:
        needle = V.encode_text(s.value, s.vtype.encoding)
        if not needle:
            raise ValueError("Bitte einen Text eingeben.")
        total = sum(r.size for r in regions) or 1
        done = 0
        hits: list[int] = []
        for r in regions:
            if cancel():
                break
            for off in range(0, r.size, BLOCK):
                span = min(BLOCK + len(needle) - 1, r.size - off)
                raw, ok = self.proc.read_blocks(r.start + off, span)
                if ok.any():
                    data = raw.tobytes()
                    limit = min(BLOCK, r.size - off)
                    i = data.find(needle)
                    while 0 <= i < limit and len(hits) < MAX_TEXT_HITS:
                        hits.append(r.start + off + i)
                        i = data.find(needle, i + 1)
                done += min(BLOCK, r.size - off)
                progress(done / total)
        return ScanResults(s.vtype, text_hits=np.array(hits, dtype=np.uint64))

    # --- next scan ----------------------------------------------------------
    def next_scan(self, prev: ScanResults, s: ScanSettings, progress: ProgressFn, cancel: CancelFn) -> ScanResults:
        if prev.vtype.is_text:
            return self._next_text(prev, s)
        vt = prev.vtype
        s.vtype = vt
        a, b, tol = self._targets(s)
        dt = V.np_dtype(vt)
        size = vt.size
        res = ScanResults(vt)
        total = sum(c.count() for c in prev.chunks) or 1
        done = 0
        for c in prev.chunks:
            if cancel():
                break
            lo = 0 if c.idx is None else int(c.idx[0])
            hi = len(c.values) - 1 if c.idx is None else int(c.idx[-1])
            span_bytes = (hi - lo + 1) * size
            raw, ok = self.proc.read_blocks(c.base + lo * size, span_bytes)
            all_cur = raw.view(dt)
            rel = np.arange(len(c.values)) if c.idx is None else c.idx - lo
            cur = all_cur[rel]
            valid = _valid_elements_at(ok, rel * size, size)
            with np.errstate(invalid="ignore", over="ignore"):
                mask = self._match(s.mode, cur, c.values, a, b, tol, vt.is_float) & valid
                if vt.is_float:
                    mask &= np.isfinite(cur)
            idx_all = np.arange(len(c.values), dtype=np.int32) if c.idx is None else c.idx
            if mask.all() and c.idx is None:
                res.chunks.append(Chunk(c.base, cur.copy()))
                res.snapshot_bytes += cur.nbytes
            else:
                keep = np.flatnonzero(mask)
                if len(keep):
                    res.chunks.append(Chunk(c.base, cur[keep].copy(), idx_all[keep]))
            done += c.count()
            progress(done / total)
        return res

    def _next_text(self, prev: ScanResults, s: ScanSettings) -> ScanResults:
        needle = V.encode_text(s.value, prev.vtype.encoding)
        hits = [int(a) for a in (prev.text_hits if prev.text_hits is not None else []) if self.proc.read(int(a), len(needle)) == needle]
        return ScanResults(prev.vtype, text_hits=np.array(hits, dtype=np.uint64))


def _valid_elements(ok_blocks: np.ndarray, lane: int, n: int, size: int, block: int = 0x10000) -> np.ndarray:
    if ok_blocks.all():
        return np.ones(n, dtype=bool)
    starts = lane + np.arange(n) * size
    return _valid_elements_at(ok_blocks, starts, size, block)


def _valid_elements_at(ok_blocks: np.ndarray, starts: np.ndarray, size: int, block: int = 0x10000) -> np.ndarray:
    if ok_blocks.all():
        return np.ones(len(starts), dtype=bool)
    return ok_blocks[starts // block] & ok_blocks[(starts + size - 1) // block]


def human_bytes(n: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    f = float(n)
    for u in units:
        if f < 1024 or u == units[-1]:
            return f"{f:.0f} {u}" if u == "B" else f"{f:.1f} {u}"
        f /= 1024
    return f"{n} B"


def is_plausible_float(v: float) -> bool:
    return math.isfinite(v) and (v == 0 or 1e-6 < abs(v) < 1e9)
