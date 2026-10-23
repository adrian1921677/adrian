"""Address expressions like `game.exe+1A2B` and pointer chains.

A pointer chain works like in Cheat Engine: base -> read pointer -> +offset ->
read pointer -> +offset ... The last offset is added without reading again.
Static addresses (module+offset) survive a game restart, raw heap addresses
usually do not.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .backend import ProcessHandle


def parse_hex(text: str) -> int:
    t = text.strip().lower().replace(" ", "")
    neg = t.startswith("-")
    t = t.lstrip("+-")
    if t.startswith("0x"):
        t = t[2:]
    if not t:
        raise ValueError("leer")
    value = int(t, 16)
    return -value if neg else value


def eval_expr(proc: ProcessHandle | None, expr: str) -> int | None:
    """Evaluate `module+hex-hex` or a plain hex address.

    Module names may contain spaces or dashes ("Hollow Knight.exe"), so the
    module is matched as a prefix of the whole expression first.
    """
    expr = expr.strip()
    if not expr:
        return None
    total = 0
    rest = expr
    if proc is not None and not _HEX_ONLY.fullmatch(expr.replace(" ", "")):
        low = expr.lower()
        best = None
        for mod in proc.modules():
            n = mod.name.lower()
            if low.startswith(n) and (len(low) == len(n) or low[len(n)] in "+- "):
                if best is None or len(n) > len(best.name):
                    best = mod
        if best is None:
            proc._modules_at = 0.0  # maybe loaded just now
            return None
        total = best.base
        rest = expr[len(best.name):]
    rest = rest.replace(" ", "")
    if not _TERMS.fullmatch(rest):
        return None
    for m in _TERM.finditer(rest):
        value = int(m.group(2), 16)
        total = total - value if m.group(1) == "-" else total + value
    return total


_HEX_ONLY = re.compile(r"(?:[+-]?(?:0x)?[0-9a-f]+)+", re.I)
_TERMS = re.compile(r"(?:[+-]?(?:0x)?[0-9a-f]+)*", re.I)
_TERM = re.compile(r"([+-]?)(?:0x)?([0-9a-f]+)", re.I)


@dataclass
class AddressRef:
    base: str
    offsets: list[str] = field(default_factory=list)

    def resolve(self, proc: ProcessHandle | None) -> int | None:
        if proc is None:
            return None
        addr = eval_expr(proc, self.base)
        if addr is None:
            return None
        for off in self.offsets:
            try:
                o = parse_hex(off)
            except ValueError:
                return None
            ptr = proc.read_pointer(addr)
            if not ptr:
                return None
            addr = ptr + o
        return addr

    @property
    def is_static(self) -> bool:
        """True when the chain starts at a module, i.e. survives restarts."""
        base = self.base.replace(" ", "")
        return bool(base) and not _HEX_ONLY.fullmatch(base)

    def describe(self) -> str:
        if not self.offsets:
            return self.base
        inner = self.base
        for off in self.offsets:
            inner = f"[{inner}]+{off}"
        return inner

    def to_json(self) -> dict:
        return {"base": self.base, "offsets": list(self.offsets)}

    @classmethod
    def from_json(cls, d: dict | None) -> "AddressRef":
        d = d or {}
        return cls(str(d.get("base", "")), [str(o) for o in d.get("offsets", [])])


def fmt_addr(address: int | None, pointer_size: int = 8) -> str:
    if address is None:
        return "??"
    return f"{address:0{12 if pointer_size == 8 else 8}X}"


def static_expr(proc: ProcessHandle, address: int) -> str:
    """`game.exe+1234` when the address lies inside a module, else plain hex."""
    mod = proc.module_at(address)
    if mod is not None:
        return f"{mod.name}+{address - mod.base:X}"
    return f"{address:X}"


def parse_offsets(text: str) -> list[str]:
    """'10, 8 , -4' -> ['10', '8', '-4'] (validated hex)."""
    out = []
    for part in re.split(r"[,;\s]+", text.strip()):
        if not part:
            continue
        parse_hex(part)
        out.append(part)
    return out
