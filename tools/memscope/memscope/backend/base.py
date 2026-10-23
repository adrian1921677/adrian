"""Common interface for reading another process's memory.

Every operating system gets its own implementation (windows.py, linux.py).
The rest of the program only talks to `ProcessHandle`.
"""

from __future__ import annotations

import struct
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np


class AttachError(RuntimeError):
    """Raised when a process cannot be opened (missing rights, gone, ...)."""


@dataclass(frozen=True)
class Region:
    start: int
    size: int
    writable: bool
    image: bool  # belongs to a loaded exe/dll file

    @property
    def end(self) -> int:
        return self.start + self.size


@dataclass(frozen=True)
class Module:
    name: str
    base: int
    size: int

    @property
    def end(self) -> int:
        return self.base + self.size


class ProcessHandle(ABC):
    pid: int
    name: str
    pointer_size: int  # 8 for 64-bit targets, 4 for 32-bit ones

    def __init__(self) -> None:
        self._modules: list[Module] = []
        self._modules_at = 0.0

    # --- raw access -----------------------------------------------------
    @abstractmethod
    def read(self, address: int, size: int) -> bytes | None:
        """Read `size` bytes. Returns None if any part is unreadable."""

    def read_into(self, address: int, out: np.ndarray) -> bool:
        """Read into a contiguous uint8 array. Backends may override for speed."""
        data = self.read(address, out.nbytes)
        if data is None:
            return False
        out[:] = np.frombuffer(data, dtype=np.uint8)
        return True

    @abstractmethod
    def regions(self, writable_only: bool = True) -> list[Region]:
        """Committed, readable memory regions."""

    @abstractmethod
    def _load_modules(self) -> list[Module]:
        ...

    @abstractmethod
    def is_alive(self) -> bool:
        ...

    def window_rect(self) -> tuple[int, int, int, int] | None:
        """Client area of the main window in physical screen pixels (x, y, w, h)."""
        return None

    def close(self) -> None:
        pass

    # --- helpers --------------------------------------------------------
    def modules(self, max_age: float = 5.0) -> list[Module]:
        now = time.monotonic()
        if not self._modules or now - self._modules_at > max_age:
            try:
                self._modules = self._load_modules()
            except OSError:
                pass
            self._modules_at = now
        return self._modules

    def module_by_name(self, name: str) -> Module | None:
        wanted = name.lower()
        for _ in range(2):
            for m in self.modules():
                if m.name.lower() == wanted:
                    return m
            # Maybe it was loaded just now: force a refresh once.
            self._modules_at = 0.0
        return None

    def module_at(self, address: int) -> Module | None:
        for m in self.modules():
            if m.base <= address < m.end:
                return m
        return None

    def read_pointer(self, address: int) -> int | None:
        data = self.read(address, self.pointer_size)
        if data is None:
            return None
        return int.from_bytes(data, "little")

    def read_struct(self, address: int, fmt: str):
        data = self.read(address, struct.calcsize(fmt))
        if data is None:
            return None
        return struct.unpack(fmt, data)

    def read_blocks(self, address: int, size: int, block: int = 0x10000) -> tuple[np.ndarray, np.ndarray]:
        """Read a span page-block by page-block.

        Returns the bytes (unreadable parts zero-filled) and a bool array saying
        which blocks could be read. Used when one big read fails because a
        part of the span was freed in the meantime.
        """
        out = np.zeros(size, dtype=np.uint8)
        if self.read_into(address, out):
            return out, np.ones((size + block - 1) // block, dtype=bool)
        n = (size + block - 1) // block
        ok = np.zeros(n, dtype=bool)
        for i in range(n):
            lo = i * block
            hi = min(size, lo + block)
            ok[i] = self.read_into(address + lo, out[lo:hi])
        return out, ok
