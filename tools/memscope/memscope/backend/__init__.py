"""Picks the memory backend for the current operating system."""

from __future__ import annotations

import sys

from .base import AttachError, Module, ProcessHandle, Region

IS_WINDOWS = sys.platform == "win32"

if IS_WINDOWS:
    from . import windows as _native
else:
    _native = None


def open_process(pid: int, name: str) -> ProcessHandle:
    if IS_WINDOWS:
        return _native.WindowsProcess(pid, name)
    if sys.platform.startswith("linux"):
        from .linux import LinuxProcess

        return LinuxProcess(pid, name)
    raise AttachError("Dieses Betriebssystem wird nicht unterstützt (nur Windows und Linux).")


def window_titles() -> dict[int, str]:
    return _native.window_titles() if IS_WINDOWS else {}


def foreground_pid() -> int:
    return _native.foreground_pid() if IS_WINDOWS else 0


def key_down(vk: int) -> bool:
    return _native.key_down(vk) if IS_WINDOWS else False


__all__ = [
    "AttachError",
    "IS_WINDOWS",
    "Module",
    "ProcessHandle",
    "Region",
    "foreground_pid",
    "key_down",
    "open_process",
    "window_titles",
]
