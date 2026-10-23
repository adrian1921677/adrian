"""Game objects ("entities"): where they are in memory and what they look like.

An entity is a block of memory with fixed fields at fixed offsets, e.g.
X/Y/Z position at +0x30, health at +0x40, a name at +0x08. Where to find the
blocks is described by one or more *sources*:

  single     one object at a fixed address (or pointer chain)
  array      objects one after another: base, base+stride, base+2*stride, ...
  pointers   a list of pointers, each pointing to one object
  signature  every object whose first bytes equal a value, usually the class
             (vtable) pointer. Finds all objects of one class automatically.
"""

from __future__ import annotations

import math
import struct
import threading
import time
from dataclasses import asdict, dataclass, field

import numpy as np

from . import values as V
from .address import AddressRef, eval_expr, parse_hex, static_expr
from .backend import ProcessHandle

SINGLE, ARRAY, POINTERS, SIGNATURE = "single", "array", "pointers", "signature"
KIND_LABELS = {
    SIGNATURE: "Automatisch (gleiche Klasse)",
    ARRAY: "Liste im Speicher (Array)",
    POINTERS: "Liste von Zeigern",
    SINGLE: "Einzelnes Objekt",
}
ENEMY_ALL, ENEMY_RULES, ENEMY_NONE = "all", "rules", "none"
ENEMY_LABELS = {
    ENEMY_ALL: "Alle sind Gegner",
    ENEMY_RULES: "Nur wenn Name/Typ passt",
    ENEMY_NONE: "Keine Gegner",
}
NAME_KINDS = {
    "utf8": "Text direkt (UTF-8)",
    "utf16": "Text direkt (UTF-16)",
    "ptr_utf8": "Zeiger auf Text (UTF-8)",
    "ptr_utf16": "Zeiger auf Text (UTF-16)",
}
MAX_SIGNATURE_HITS = 4096


@dataclass
class Layout:
    pos_x: str = "0"
    pos_y: str = "4"
    pos_z: str = "8"
    pos_type: str = "float"  # float | double
    up_axis: str = "y"  # y | z
    anchor: str = "feet"  # feet | center
    height: float = 2.0
    health: str = ""
    max_health: str = ""
    health_type: str = "float"  # float | int32 | double
    name: str = ""
    name_kind: str = "utf8"
    type_id: str = ""
    max_coord: float = 1_000_000.0


@dataclass
class Source:
    kind: str = SINGLE
    label: str = "Objekte"
    ref: AddressRef = field(default_factory=lambda: AddressRef(""))
    stride: str = "100"
    count: int = 64
    sig_offset: str = "0"
    sig_size: int = 8
    sig_value: str = ""
    enemy: str = ENEMY_ALL

    def to_json(self) -> dict:
        d = asdict(self)
        d["ref"] = self.ref.to_json()
        return d

    @classmethod
    def from_json(cls, d: dict) -> "Source":
        d = dict(d)
        ref = AddressRef.from_json(d.pop("ref", None))
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(ref=ref, **known)


@dataclass
class EntityConfig:
    layout: Layout = field(default_factory=Layout)
    sources: list[Source] = field(default_factory=list)
    enemy_words: list[str] = field(default_factory=list)
    enemy_ids: list[int] = field(default_factory=list)

    def to_json(self) -> dict:
        return {
            "layout": asdict(self.layout),
            "sources": [s.to_json() for s in self.sources],
            "enemy_words": list(self.enemy_words),
            "enemy_ids": list(self.enemy_ids),
        }

    @classmethod
    def from_json(cls, d: dict | None) -> "EntityConfig":
        d = d or {}
        lay = d.get("layout", {})
        layout = Layout(**{k: v for k, v in lay.items() if k in Layout.__dataclass_fields__})
        return cls(
            layout=layout,
            sources=[Source.from_json(s) for s in d.get("sources", [])],
            enemy_words=[str(w) for w in d.get("enemy_words", [])],
            enemy_ids=[int(i) for i in d.get("enemy_ids", [])],
        )


@dataclass
class Entity:
    source: int
    slot: int
    address: int
    label: str
    pos: tuple[float, float, float] | None = None
    health: float | None = None
    max_health: float | None = None
    name: str = ""
    type_id: int | None = None
    valid: bool = False
    problem: str = ""
    enemy: bool = False
    distance: float | None = None

    @property
    def key(self) -> tuple[int, int]:
        return (self.address, self.source)

    @property
    def title(self) -> str:
        return self.name or self.label


# --- compiled layout -----------------------------------------------------------


def _off(text: str) -> int | None:
    text = (text or "").strip()
    if not text:
        return None
    try:
        return parse_hex(text)
    except ValueError:
        return None


class _Fields:
    """Layout turned into numbers, so reading an entity is cheap."""

    def __init__(self, lay: Layout, pointer_size: int) -> None:
        self.ptr = pointer_size
        self.pos_fmt = "<d" if lay.pos_type == "double" else "<f"
        self.pos_size = 8 if lay.pos_type == "double" else 4
        self.pos = [_off(lay.pos_x), _off(lay.pos_y), _off(lay.pos_z)]
        hp_t = V.get(lay.health_type if lay.health_type in ("float", "int32", "double") else "float")
        self.hp_fmt, self.hp_size = hp_t.fmt, hp_t.size
        self.health = _off(lay.health)
        self.max_health = _off(lay.max_health)
        self.name = _off(lay.name)
        self.name_kind = lay.name_kind
        self.type_id = _off(lay.type_id)
        self.max_coord = float(lay.max_coord or 1e6)
        ends = [0]
        for o in self.pos:
            if o is not None:
                ends.append(o + self.pos_size)
        for o in (self.health, self.max_health):
            if o is not None:
                ends.append(o + self.hp_size)
        if self.type_id is not None:
            ends.append(self.type_id + 4)
        if self.name is not None:
            inline = self.name_kind in ("utf8", "utf16")
            ends.append(self.name + (V.TEXT_LEN * (2 if self.name_kind == "utf16" else 1) if inline else self.ptr))
        self.span = max(ends)

    @property
    def ok(self) -> bool:
        return all(o is not None for o in self.pos)


def _get(buf: bytes, off: int | None, fmt: str, size: int):
    if off is None or off < 0 or off + size > len(buf):
        return None
    return struct.unpack_from(fmt, buf, off)[0]


class EntityReader:
    """Reads all entities of a config. Shared by the live table and the overlay."""

    def __init__(self, proc: ProcessHandle, cfg: EntityConfig) -> None:
        self.proc = proc
        self.cfg = cfg
        self.fields = _Fields(cfg.layout, proc.pointer_size)
        self._base_cache: dict[int, tuple[float, int | None]] = {}
        self._sig_scans: dict[int, SignatureScan] = {}
        self._words = [w.lower() for w in cfg.enemy_words if w.strip()]
        self._ids = set(cfg.enemy_ids)
        for i, s in enumerate(cfg.sources):
            if s.kind == SIGNATURE:
                self._sig_scans[i] = SignatureScan(proc, s)

    def stop(self) -> None:
        for scan in self._sig_scans.values():
            scan.stop()

    def adopt(self, old: "EntityReader") -> None:
        """Keep the objects an older reader already found, so edits don't make the overlay blink."""
        for scan in self._sig_scans.values():
            for prev in old._sig_scans.values():
                if prev.key == scan.key and prev.addresses and not scan.addresses:
                    scan.addresses = prev.addresses
                    scan.status = prev.status
                    break

    def signature_status(self, index: int) -> str:
        scan = self._sig_scans.get(index)
        return scan.status if scan else ""

    def _base(self, i: int, s: Source) -> int | None:
        now = time.monotonic()
        cached = self._base_cache.get(i)
        if cached and now - cached[0] < 1.0:
            return cached[1]
        addr = s.ref.resolve(self.proc)
        self._base_cache[i] = (now, addr)
        return addr

    def read(self) -> list[Entity]:
        out: list[Entity] = []
        if not self.fields.ok:
            return out
        for i, s in enumerate(self.cfg.sources):
            try:
                out.extend(self._read_source(i, s))
            except (ValueError, OverflowError, struct.error):
                continue
        return out

    def _read_source(self, i: int, s: Source) -> list[Entity]:
        f = self.fields
        span = f.span
        out: list[Entity] = []
        if s.kind == SIGNATURE:
            scan = self._sig_scans.get(i)
            return self.read_at(scan.addresses if scan else [], s, i)
        base = self._base(i, s)
        if base is None:
            return out
        if s.kind == SINGLE:
            out.append(self._parse(i, 0, base, s, self.proc.read(base, span)))
        elif s.kind == ARRAY:
            stride = max(1, _off(s.stride) or 1)
            count = max(0, min(int(s.count), 16384))
            size = stride * (count - 1) + span if count else 0
            if size <= 0:
                return out
            raw, ok = self.proc.read_blocks(base, size)
            blob = raw.tobytes()
            for slot in range(count):
                lo = slot * stride
                blk_lo, blk_hi = lo // 0x10000, (lo + span - 1) // 0x10000
                data = blob[lo : lo + span] if ok[blk_lo] and ok[blk_hi] else None
                out.append(self._parse(i, slot, base + lo, s, data))
        elif s.kind == POINTERS:
            count = max(0, min(int(s.count), 16384))
            ps = self.proc.pointer_size
            raw = self.proc.read(base, count * ps)
            if raw is None:
                return out
            ptrs = np.frombuffer(raw, dtype="<u8" if ps == 8 else "<u4")
            for slot, p in enumerate(ptrs.tolist()):
                if p == 0:
                    continue
                out.append(self._parse(i, slot, p, s, self.proc.read(p, span)))
        return out

    def read_at(self, addresses: list[int], s: Source, index: int = 0) -> list[Entity]:
        """Read objects at known addresses (e.g. found by a signature scan)."""
        span = self.fields.span
        return [self._parse(index, slot, a, s, self.proc.read(a, span)) for slot, a in enumerate(addresses)]

    def _parse(self, i: int, slot: int, addr: int, s: Source, data: bytes | None) -> Entity:
        f = self.fields
        e = Entity(i, slot, addr, s.label)
        if data is None:
            e.problem = "Speicher nicht lesbar"
            return e
        xyz = [_get(data, o, f.pos_fmt, f.pos_size) for o in f.pos]
        if any(c is None for c in xyz):
            e.problem = "Position nicht lesbar"
            return e
        e.pos = (float(xyz[0]), float(xyz[1]), float(xyz[2]))
        if f.health is not None:
            hp = _get(data, f.health, f.hp_fmt, f.hp_size)
            e.health = None if hp is None else float(hp)
        if f.max_health is not None:
            mhp = _get(data, f.max_health, f.hp_fmt, f.hp_size)
            e.max_health = None if mhp is None else float(mhp)
        if f.type_id is not None:
            e.type_id = _get(data, f.type_id, "<i", 4)
        if f.name is not None:
            e.name = self._name(data, f)
        e.problem = self._check(e)
        e.valid = not e.problem
        if e.valid:
            e.enemy = self._is_enemy(e, s)
        return e

    def _name(self, data: bytes, f: _Fields) -> str:
        kind = f.name_kind
        enc = "utf-16-le" if kind.endswith("utf16") else "utf-8"
        n = V.TEXT_LEN * (2 if enc == "utf-16-le" else 1)
        if kind.startswith("ptr_"):
            p = _get(data, f.name, "<Q" if f.ptr == 8 else "<I", f.ptr)
            raw = self.proc.read(p, n) if p else None
            if raw is None:
                return ""
        else:
            raw = data[f.name : f.name + n]
        text = V.decode_text(raw, enc).strip()
        return text if V.looks_like_text(text) else ""

    def _check(self, e: Entity) -> str:
        f = self.fields
        x, y, z = e.pos
        if not all(math.isfinite(c) for c in (x, y, z)):
            return "Position ist keine Zahl"
        if max(abs(x), abs(y), abs(z)) > f.max_coord:
            return "Position viel zu groß"
        if x == 0 and y == 0 and z == 0:
            return "Position ist 0 / 0 / 0 (leerer Platz?)"
        if f.health is not None:
            hp = e.health
            if hp is None or not math.isfinite(hp):
                return "Leben nicht lesbar"
            if hp <= 0:
                return "Leben ist 0 (tot oder leer)"
            if hp > 1e7:
                return "Leben unrealistisch groß"
        if f.name is not None and not e.name:
            return "Name nicht lesbar"
        return ""

    def _is_enemy(self, e: Entity, s: Source) -> bool:
        if s.enemy == ENEMY_ALL:
            return True
        if s.enemy == ENEMY_NONE:
            return False
        name = e.name.lower()
        if name and any(w in name for w in self._words):
            return True
        return e.type_id is not None and e.type_id in self._ids


# --- signature scan -------------------------------------------------------------


class SignatureScan:
    """Background thread that keeps a list of objects with a given signature."""

    def __init__(self, proc: ProcessHandle, src: Source, interval: float = 3.0) -> None:
        self.proc = proc
        self.src = src
        self.interval = interval
        self.addresses: list[int] = []
        self.status = "sucht …"
        self.key = (src.sig_value, src.sig_offset, int(src.sig_size))
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="signature-scan", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            t0 = time.monotonic()
            try:
                found = scan_signature(self.proc, self.src, self._stop.is_set)
                if not self._stop.is_set():
                    self.addresses = found
                    took = time.monotonic() - t0
                    self.status = f"{len(found)} gefunden · Suche dauert {took:.1f} s"
            except ValueError as exc:
                self.status = f"Fehler: {exc}"
            self._stop.wait(self.interval)


def signature_value(proc: ProcessHandle, src: Source) -> int:
    value = eval_expr(proc, src.sig_value)
    if value is None:
        raise ValueError("Signatur-Wert ungültig")
    return value


def scan_signature(proc: ProcessHandle, src: Source, cancel=lambda: False) -> list[int]:
    value = signature_value(proc, src)
    size = 8 if int(src.sig_size) == 8 else 4
    off = _off(src.sig_offset) or 0
    dt = np.dtype("<u8" if size == 8 else "<u4")
    value &= (1 << (size * 8)) - 1
    target = dt.type(value)
    hits: list[int] = []
    block = 16 * 1024 * 1024
    for reg in proc.regions(writable_only=True):
        if cancel():
            break
        for lo in range(0, reg.size, block):
            n = min(block, reg.size - lo)
            raw, ok = proc.read_blocks(reg.start + lo, n)
            usable = n - n % size
            arr = raw[:usable].view(dt)
            idx = np.flatnonzero(arr == target)
            if not ok.all() and len(idx):
                good = ok[(idx * size) // 0x10000]
                idx = idx[good]
            for k in idx.tolist():
                hits.append(reg.start + lo + k * size - off)
                if len(hits) >= MAX_SIGNATURE_HITS:
                    return hits
    return hits


def signature_from_object(proc: ProcessHandle, base: int, sig_offset: int = 0, size: int = 8) -> str | None:
    """Value at base+sig_offset as an expression (module+offset if it points into a module)."""
    raw = proc.read(base + sig_offset, size)
    if raw is None:
        return None
    value = int.from_bytes(raw, "little")
    if value == 0:
        return None
    return static_expr(proc, value)


# --- testing --------------------------------------------------------------------


@dataclass
class TestReport:
    samples: int
    total: int
    valid: int
    enemies: int
    moving: int
    by_name: dict[str, int]
    problems: dict[str, int]

    @property
    def passed(self) -> bool:
        return self.valid > 0


def build_report(samples: list[list[Entity]]) -> TestReport:
    """Summarise several reads taken a moment apart."""
    if not samples:
        return TestReport(0, 0, 0, 0, 0, {}, {})
    last = {e.key: e for e in samples[-1]}
    first = {e.key: e for e in samples[0]}
    always_valid = set.intersection(*({e.key for e in s if e.valid} for s in samples))
    valid_all = [k for k in last if k in always_valid]
    moving = 0
    for k in valid_all:
        a, b = first.get(k), last.get(k)
        if a and b and a.pos and b.pos and any(abs(p - q) > 1e-3 for p, q in zip(a.pos, b.pos)):
            moving += 1
    by_name: dict[str, int] = {}
    for k in valid_all:
        e = last[k]
        if e.enemy:
            by_name[e.title] = by_name.get(e.title, 0) + 1
    problems: dict[str, int] = {}
    for e in samples[-1]:
        if not e.valid:
            problems[e.problem] = problems.get(e.problem, 0) + 1
    return TestReport(
        samples=len(samples),
        total=len(samples[-1]),
        valid=len(valid_all),
        enemies=sum(1 for k in valid_all if last[k].enemy),
        moving=moving,
        by_name=by_name,
        problems=problems,
    )
