"""Linux backend: reads /proc/<pid>/mem and /proc/<pid>/maps.

Mainly here so the tool and its tests also run on Linux (e.g. with the
practice arena). Needs the same user as the target and ptrace permission.
"""

from __future__ import annotations

import os

import numpy as np

from .base import AttachError, Module, ProcessHandle, Region

_SKIP = ("[vvar]", "[vsyscall]", "[vvar_vclock]")


class LinuxProcess(ProcessHandle):
    def __init__(self, pid: int, name: str) -> None:
        super().__init__()
        self.pid = pid
        self.name = name
        try:
            self._fd = os.open(f"/proc/{pid}/mem", os.O_RDONLY)
        except OSError as exc:
            raise AttachError(
                f"Kein Zugriff auf den Speicher von PID {pid} ({exc.strerror}). "
                "Gleicher Benutzer nötig, evtl. mit sudo starten."
            ) from exc
        self.pointer_size = self._detect_pointer_size()

    def _detect_pointer_size(self) -> int:
        try:
            with open(f"/proc/{self.pid}/exe", "rb") as f:
                header = f.read(5)
            return 4 if header[4:5] == b"\x01" else 8
        except OSError:
            return 8

    def read(self, address: int, size: int) -> bytes | None:
        if size <= 0 or address < 0:
            return None
        try:
            # pread is atomic, so background scans and the UI can read at once.
            data = os.pread(self._fd, size, address)
        except (OSError, OverflowError, ValueError):
            return None
        if len(data) != size:
            return None
        return data

    def read_into(self, address: int, out: np.ndarray) -> bool:
        if out.nbytes == 0 or address < 0:
            return False
        try:
            n = os.preadv(self._fd, [memoryview(out).cast("B")], address)
        except (OSError, OverflowError, ValueError):
            return False
        return n == out.nbytes

    def _maps(self) -> list[tuple[int, int, str, str]]:
        rows = []
        with open(f"/proc/{self.pid}/maps") as f:
            for line in f:
                parts = line.split(maxsplit=5)
                lo, hi = (int(x, 16) for x in parts[0].split("-"))
                path = parts[5].strip() if len(parts) > 5 else ""
                rows.append((lo, hi, parts[1], path))
        return rows

    def regions(self, writable_only: bool = True) -> list[Region]:
        out = []
        try:
            maps = self._maps()
        except OSError:
            return out
        for lo, hi, perms, path in maps:
            if perms[0] != "r" or path in _SKIP:
                continue
            writable = perms[1] == "w"
            if writable_only and not writable:
                continue
            out.append(Region(lo, hi - lo, writable, image=path.startswith("/")))
        return out

    def _load_modules(self) -> list[Module]:
        spans: dict[str, list[int]] = {}
        for lo, hi, _perms, path in self._maps():
            if not path.startswith("/"):
                continue
            span = spans.setdefault(path, [lo, hi])
            span[0] = min(span[0], lo)
            span[1] = max(span[1], hi)
        return [Module(os.path.basename(p), lo, hi - lo) for p, (lo, hi) in spans.items()]

    def is_alive(self) -> bool:
        try:
            with open(f"/proc/{self.pid}/stat") as f:
                state = f.read().rsplit(")", 1)[1].split()[0]
            return state not in ("Z", "X")
        except OSError:
            return False

    def close(self) -> None:
        try:
            os.close(self._fd)
        except OSError:
            pass
