"""World-to-screen projection and a finder for the camera matrix.

Most 3D games keep a 4x4 view-projection matrix (16 floats) in memory. With it,
a world position becomes a screen position:

    clip = M * (x, y, z, 1)      ndc = clip.xy / clip.w      screen = viewport(ndc)

Engines store the matrix either row by row ("row") or column by column
("col"); the finder tries both.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from .backend import ProcessHandle

ROW = "row"
COL = "col"
LAYOUT_LABELS = {ROW: "Zeilenweise (DirectX / Source / Unreal)", COL: "Spaltenweise (OpenGL / Unity)"}


def rows_of(m: np.ndarray, layout: str) -> np.ndarray:
    """4x4 matrix whose rows produce clip x, y, z, w."""
    m = np.asarray(m, dtype=np.float64).reshape(4, 4)
    return m if layout == ROW else m.T


def world_to_screen(m: np.ndarray, layout: str, pos, width: float, height: float):
    """Screen pixel (x, y) and clip w, or None when the point is behind the camera."""
    r = rows_of(m, layout)
    v = np.array([pos[0], pos[1], pos[2], 1.0])
    cx, cy, _cz, cw = r @ v
    if not np.isfinite(cw) or cw < 0.01:
        return None
    nx, ny = cx / cw, cy / cw
    return (nx + 1.0) * 0.5 * width, (1.0 - ny) * 0.5 * height, cw


def project_many(m: np.ndarray, layout: str, positions: np.ndarray, width: float, height: float):
    """Vectorised world_to_screen for an (n, 3) array. Returns sx, sy, w, visible-mask."""
    r = rows_of(m, layout)
    p = np.c_[positions, np.ones(len(positions))]
    clip = p @ r.T
    w = clip[:, 3]
    with np.errstate(divide="ignore", invalid="ignore"):
        nx = clip[:, 0] / w
        ny = clip[:, 1] / w
    vis = np.isfinite(nx) & np.isfinite(ny) & (w > 0.01)
    return (nx + 1.0) * 0.5 * width, (1.0 - ny) * 0.5 * height, w, vis


def camera_position(m: np.ndarray, layout: str) -> np.ndarray | None:
    """Camera position in world space.

    The camera centre is the one point that maps to clip x = y = w = 0, so it
    is the solution of a 3x3 linear system made from those rows.
    """
    r = rows_of(m, layout)
    a = r[[0, 1, 3], :3]
    b = -r[[0, 1, 3], 3]
    try:
        if abs(np.linalg.det(a)) < 1e-12:
            return None
        c = np.linalg.solve(a, b)
    except np.linalg.LinAlgError:
        return None
    return c if np.all(np.isfinite(c)) else None


def matrix_ok(m: np.ndarray) -> bool:
    return bool(np.all(np.isfinite(m)) and np.max(np.abs(m)) < 1e5 and np.any(m != 0))


def read_matrix(proc: ProcessHandle, address: int | None) -> np.ndarray | None:
    if address is None:
        return None
    data = proc.read(address, 64)
    if data is None:
        return None
    m = np.frombuffer(data, dtype="<f4").astype(np.float64)
    return m if matrix_ok(m) else None


# --- matrix finder -----------------------------------------------------------

CENTER = 0.12  # |ndc| below this counts as "in the middle of the screen"
AWAY = 0.35


@dataclass
class Candidate:
    address: int
    layout: str


def _test(m16: np.ndarray, layout: str, target: np.ndarray, want_center: bool) -> bool:
    if not matrix_ok(m16):
        return False
    r = rows_of(m16, layout)
    cx, cy, _cz, cw = r @ np.r_[target, 1.0]
    if want_center:
        if cw < 0.01:
            return False
        ok = abs(cx / cw) < CENTER and abs(cy / cw) < CENTER
    else:
        ok = cw < 0.01 or abs(cx / cw) > AWAY or abs(cy / cw) > AWAY
    if not ok:
        return False
    cam = camera_position(m16, layout)
    return cam is not None and np.max(np.abs(cam)) < 1e7 and np.linalg.norm(cam - target) > 0.05


def find_matrix(
    proc: ProcessHandle,
    target,
    progress: Callable[[float], None],
    cancel: Callable[[], bool],
    max_hits: int = 5000,
) -> list[Candidate]:
    """Scan writable memory for 16-float blocks that put `target` in the screen centre.

    The player has to look straight at the target while this runs.
    """
    target = np.asarray(target, dtype=np.float64)
    x, y, z = (np.float32(v) for v in target)
    regions = proc.regions(writable_only=True)
    total = sum(r.size for r in regions) or 1
    done = 0
    hits: list[Candidate] = []
    block = 8 * 1024 * 1024
    w_buf = t_buf = None
    for reg in regions:
        if cancel() or len(hits) >= max_hits:
            break
        for off in range(0, reg.size, block):
            span = min(block + 64, reg.size - off)
            raw, ok = proc.read_blocks(reg.start + off, span)
            done += min(block, reg.size - off)
            progress(done / total)
            if not ok.all() or span < 64:
                continue
            f = raw[: span - span % 4].view("<f4")
            n = len(f) - 15
            if n <= 0:
                continue
            limit = min(n, block // 4)
            s = [f[i : i + limit] for i in range(16)]
            if w_buf is None or len(w_buf) < limit:
                w_buf = np.empty(limit, dtype=np.float32)
                t_buf = np.empty(limit, dtype=np.float32)
            w, tmp = w_buf[:limit], t_buf[:limit]
            with np.errstate(all="ignore"):
                for layout in (ROW, COL):
                    if layout == ROW:
                        wx, wy, ww = (0, 1, 2, 3), (4, 5, 6, 7), (12, 13, 14, 15)
                    else:
                        wx, wy, ww = (0, 4, 8, 12), (1, 5, 9, 13), (3, 7, 11, 15)
                    # w = m[a]*x + m[b]*y + m[c]*z + m[d], computed in place (big arrays)
                    np.multiply(s[ww[0]], x, out=w)
                    np.multiply(s[ww[1]], y, out=tmp)
                    w += tmp
                    np.multiply(s[ww[2]], z, out=tmp)
                    w += tmp
                    w += s[ww[3]]
                    cand = np.flatnonzero(w > 0.01)
                    if not len(cand):
                        continue
                    wc = w[cand]
                    cx = (s[wx[0]][cand] * x + s[wx[1]][cand] * y + s[wx[2]][cand] * z + s[wx[3]][cand]) / wc
                    keep = np.abs(cx) < CENTER
                    cand, wc = cand[keep], wc[keep]
                    if not len(cand):
                        continue
                    cy = (s[wy[0]][cand] * x + s[wy[1]][cand] * y + s[wy[2]][cand] * z + s[wy[3]][cand]) / wc
                    cand = cand[np.abs(cy) < CENTER]
                    for i in cand.tolist():
                        m16 = f[i : i + 16].astype(np.float64)
                        if _test(m16, layout, target, True):
                            hits.append(Candidate(reg.start + off + i * 4, layout))
                            if len(hits) >= max_hits:
                                break
    return hits


def refine(proc: ProcessHandle, cands: list[Candidate], target, want_center: bool) -> list[Candidate]:
    """Keep candidates that agree with the current view (looking at it / away)."""
    target = np.asarray(target, dtype=np.float64)
    out = []
    for c in cands:
        data = proc.read(c.address, 64)
        if data is None:
            continue
        m16 = np.frombuffer(data, dtype="<f4").astype(np.float64)
        if _test(m16, c.layout, target, want_center):
            out.append(c)
    return out
