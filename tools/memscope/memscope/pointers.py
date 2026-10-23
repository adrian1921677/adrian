"""One-level pointer search: "who points to this address?"

Heap addresses change every time the game starts. If some static address
(inside the exe/dll) holds a pointer to the object, that pointer chain stays
valid. This search finds those pointers; repeating it on a result builds a
longer chain.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from .address import static_expr
from .backend import ProcessHandle


@dataclass
class PointerHit:
    address: int  # where the pointer is stored
    offset: int  # target - pointer value
    static: str  # module+offset if the pointer lives inside a module, else ""


def find_pointers(
    proc: ProcessHandle,
    target: int,
    max_offset: int,
    progress: Callable[[float], None],
    cancel: Callable[[], bool],
    limit: int = 2000,
) -> list[PointerHit]:
    ps = proc.pointer_size
    dt = np.dtype("<u8" if ps == 8 else "<u4")
    lo_val = dt.type(max(0, target - max_offset))
    hi_val = dt.type(target)
    regions = proc.regions(writable_only=False)
    total = sum(r.size for r in regions) or 1
    done = 0
    hits: list[PointerHit] = []
    block = 16 * 1024 * 1024
    for reg in regions:
        if cancel() or len(hits) >= limit:
            break
        for off in range(0, reg.size, block):
            n = min(block, reg.size - off)
            raw, ok = proc.read_blocks(reg.start + off, n)
            done += n
            progress(done / total)
            arr = raw[: n - n % ps].view(dt)
            idx = np.flatnonzero((arr >= lo_val) & (arr <= hi_val))
            if not ok.all() and len(idx):
                idx = idx[ok[(idx * ps) // 0x10000]]
            for i in idx.tolist():
                addr = reg.start + off + i * ps
                mod = proc.module_at(addr)
                hits.append(PointerHit(addr, target - int(arr[i]), static_expr(proc, addr) if mod else ""))
                if len(hits) >= limit:
                    break
    # Static pointers first, then small offsets.
    hits.sort(key=lambda h: (h.static == "", h.offset))
    return hits
