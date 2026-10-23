"""Windows backend: OpenProcess / ReadProcessMemory / VirtualQueryEx via ctypes."""

from __future__ import annotations

import ctypes
import os
import threading
import time
from ctypes import wintypes as wt

import numpy as np

from .base import AttachError, Module, ProcessHandle, Region

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32 = ctypes.WinDLL("user32", use_last_error=True)

PROCESS_VM_READ = 0x0010
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
STILL_ACTIVE = 259
ERROR_ACCESS_DENIED = 5

MEM_COMMIT = 0x1000
MEM_IMAGE = 0x1000000
MEM_MAPPED = 0x40000
PAGE_GUARD = 0x100
PAGE_NOACCESS = 0x01
READABLE = 0x02 | 0x04 | 0x08 | 0x20 | 0x40 | 0x80
WRITABLE = 0x04 | 0x08 | 0x40 | 0x80

TH32CS_SNAPMODULE = 0x08
TH32CS_SNAPMODULE32 = 0x10
INVALID_HANDLE_VALUE = wt.HANDLE(-1).value

_64BIT_PYTHON = ctypes.sizeof(ctypes.c_void_p) == 8


class MEMORY_BASIC_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BaseAddress", ctypes.c_void_p),
        ("AllocationBase", ctypes.c_void_p),
        ("AllocationProtect", wt.DWORD),
    ] + ([("PartitionId", wt.WORD)] if _64BIT_PYTHON else []) + [
        ("RegionSize", ctypes.c_size_t),
        ("State", wt.DWORD),
        ("Protect", wt.DWORD),
        ("Type", wt.DWORD),
    ]


class MODULEENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", wt.DWORD),
        ("th32ModuleID", wt.DWORD),
        ("th32ProcessID", wt.DWORD),
        ("GlblcntUsage", wt.DWORD),
        ("ProccntUsage", wt.DWORD),
        ("modBaseAddr", ctypes.c_void_p),
        ("modBaseSize", wt.DWORD),
        ("hModule", wt.HMODULE),
        ("szModule", ctypes.c_wchar * 256),
        ("szExePath", ctypes.c_wchar * 260),
    ]


def _fn(dll, name, argtypes, restype):
    f = getattr(dll, name)
    f.argtypes = argtypes
    f.restype = restype
    return f


OpenProcess = _fn(kernel32, "OpenProcess", [wt.DWORD, wt.BOOL, wt.DWORD], wt.HANDLE)
CloseHandle = _fn(kernel32, "CloseHandle", [wt.HANDLE], wt.BOOL)
ReadProcessMemory = _fn(
    kernel32, "ReadProcessMemory",
    [wt.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)],
    wt.BOOL,
)
VirtualQueryEx = _fn(
    kernel32, "VirtualQueryEx",
    [wt.HANDLE, ctypes.c_void_p, ctypes.POINTER(MEMORY_BASIC_INFORMATION), ctypes.c_size_t],
    ctypes.c_size_t,
)
GetExitCodeProcess = _fn(kernel32, "GetExitCodeProcess", [wt.HANDLE, ctypes.POINTER(wt.DWORD)], wt.BOOL)
IsWow64Process = _fn(kernel32, "IsWow64Process", [wt.HANDLE, ctypes.POINTER(wt.BOOL)], wt.BOOL)
CreateToolhelp32Snapshot = _fn(kernel32, "CreateToolhelp32Snapshot", [wt.DWORD, wt.DWORD], wt.HANDLE)
Module32FirstW = _fn(kernel32, "Module32FirstW", [wt.HANDLE, ctypes.POINTER(MODULEENTRY32W)], wt.BOOL)
Module32NextW = _fn(kernel32, "Module32NextW", [wt.HANDLE, ctypes.POINTER(MODULEENTRY32W)], wt.BOOL)

WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
EnumWindows = _fn(user32, "EnumWindows", [WNDENUMPROC, wt.LPARAM], wt.BOOL)
GetWindowThreadProcessId = _fn(user32, "GetWindowThreadProcessId", [wt.HWND, ctypes.POINTER(wt.DWORD)], wt.DWORD)
IsWindowVisible = _fn(user32, "IsWindowVisible", [wt.HWND], wt.BOOL)
IsIconic = _fn(user32, "IsIconic", [wt.HWND], wt.BOOL)
GetWindowTextLengthW = _fn(user32, "GetWindowTextLengthW", [wt.HWND], ctypes.c_int)
GetWindowTextW = _fn(user32, "GetWindowTextW", [wt.HWND, wt.LPWSTR, ctypes.c_int], ctypes.c_int)
GetClientRect = _fn(user32, "GetClientRect", [wt.HWND, ctypes.POINTER(wt.RECT)], wt.BOOL)
ClientToScreen = _fn(user32, "ClientToScreen", [wt.HWND, ctypes.POINTER(wt.POINT)], wt.BOOL)
GetForegroundWindow = _fn(user32, "GetForegroundWindow", [], wt.HWND)
GetAsyncKeyState = _fn(user32, "GetAsyncKeyState", [ctypes.c_int], ctypes.c_short)


def _window_title(hwnd) -> str:
    n = GetWindowTextLengthW(hwnd)
    if n <= 0:
        return ""
    buf = ctypes.create_unicode_buffer(n + 1)
    GetWindowTextW(hwnd, buf, n + 1)
    return buf.value


def _client_rect(hwnd) -> tuple[int, int, int, int] | None:
    rect = wt.RECT()
    if not GetClientRect(hwnd, ctypes.byref(rect)):
        return None
    pt = wt.POINT(0, 0)
    if not ClientToScreen(hwnd, ctypes.byref(pt)):
        return None
    w, h = rect.right - rect.left, rect.bottom - rect.top
    if w <= 0 or h <= 0:
        return None
    return pt.x, pt.y, w, h


def visible_windows() -> list[tuple[int, int, str]]:
    """(hwnd, pid, title) of all visible top-level windows that have a title."""
    found: list[tuple[int, int, str]] = []

    @WNDENUMPROC
    def callback(hwnd, _lparam):
        if IsWindowVisible(hwnd):
            title = _window_title(hwnd)
            if title:
                pid = wt.DWORD()
                GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                found.append((hwnd, pid.value, title))
        return True

    EnumWindows(callback, 0)
    return found


def window_titles() -> dict[int, str]:
    titles: dict[int, str] = {}
    for _hwnd, pid, title in visible_windows():
        titles.setdefault(pid, title)
    return titles


def foreground_pid() -> int:
    hwnd = GetForegroundWindow()
    if not hwnd:
        return 0
    pid = wt.DWORD()
    GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid.value


def key_down(vk: int) -> bool:
    return bool(GetAsyncKeyState(vk) & 0x8000)


class WindowsProcess(ProcessHandle):
    def __init__(self, pid: int, name: str) -> None:
        super().__init__()
        self.pid = pid
        self.name = name
        h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, False, pid)
        if not h:
            h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not h:
            err = ctypes.get_last_error()
            if err == ERROR_ACCESS_DENIED:
                raise AttachError(
                    "Zugriff verweigert. Starte MemScope als Administrator. "
                    "Manche Spiele (mit Anti-Cheat) blockieren das Auslesen komplett."
                )
            raise AttachError(f"Prozess {pid} lässt sich nicht öffnen (Fehler {err}).")
        self._h = h
        self.pointer_size = self._detect_pointer_size()
        self._hwnd = None
        self._hwnd_at = 0.0
        self._tls = threading.local()  # read buffers per thread (scans run in the background)

    def _detect_pointer_size(self) -> int:
        if not _64BIT_PYTHON:
            return 4
        wow = wt.BOOL()
        if IsWow64Process(self._h, ctypes.byref(wow)) and wow.value:
            return 4
        return 8

    # --- memory ---------------------------------------------------------
    def read(self, address: int, size: int) -> bytes | None:
        if size <= 0 or address <= 0:
            return None
        cache = getattr(self._tls, "bufs", None)
        if cache is None:
            cache = self._tls.bufs = {}
        buf = cache.get(size)
        if buf is None:
            buf = ctypes.create_string_buffer(size)
            if size <= 4096:
                cache[size] = buf
        n = ctypes.c_size_t(0)
        if not ReadProcessMemory(self._h, address, buf, size, ctypes.byref(n)) or n.value != size:
            return None
        return buf.raw[:size]

    def read_into(self, address: int, out: np.ndarray) -> bool:
        if out.nbytes == 0 or address <= 0:
            return False
        n = ctypes.c_size_t(0)
        ok = ReadProcessMemory(self._h, address, out.ctypes.data, out.nbytes, ctypes.byref(n))
        return bool(ok) and n.value == out.nbytes

    def regions(self, writable_only: bool = True) -> list[Region]:
        out: list[Region] = []
        mbi = MEMORY_BASIC_INFORMATION()
        address = 0x10000
        limit = 0x7FFFFFFF0000 if self.pointer_size == 8 else 0xFFFF0000
        size = ctypes.sizeof(mbi)
        while address < limit:
            if VirtualQueryEx(self._h, address, ctypes.byref(mbi), size) == 0:
                break
            base = mbi.BaseAddress or 0
            region_size = mbi.RegionSize
            if region_size == 0:
                break
            protect = mbi.Protect
            if (
                mbi.State == MEM_COMMIT
                and protect & READABLE
                and not protect & (PAGE_GUARD | PAGE_NOACCESS)
                and mbi.Type != MEM_MAPPED
            ):
                writable = bool(protect & WRITABLE)
                if writable or not writable_only:
                    out.append(Region(base, region_size, writable, image=mbi.Type == MEM_IMAGE))
            address = base + region_size
        return out

    def _load_modules(self) -> list[Module]:
        snap = INVALID_HANDLE_VALUE
        for _ in range(5):
            snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, self.pid)
            if snap != INVALID_HANDLE_VALUE:
                break
            time.sleep(0.02)  # ERROR_BAD_LENGTH happens while the target loads dlls
        if snap == INVALID_HANDLE_VALUE:
            return self._modules
        mods: list[Module] = []
        try:
            entry = MODULEENTRY32W()
            entry.dwSize = ctypes.sizeof(entry)
            ok = Module32FirstW(snap, ctypes.byref(entry))
            while ok:
                mods.append(Module(entry.szModule, entry.modBaseAddr or 0, entry.modBaseSize))
                ok = Module32NextW(snap, ctypes.byref(entry))
        finally:
            CloseHandle(snap)
        return mods

    def is_alive(self) -> bool:
        code = wt.DWORD()
        if not GetExitCodeProcess(self._h, ctypes.byref(code)):
            return False
        return code.value == STILL_ACTIVE

    # --- window -----------------------------------------------------------
    def _main_window(self):
        now = time.monotonic()
        if self._hwnd and now - self._hwnd_at < 2.0:
            return self._hwnd
        best, best_area = None, 0
        for hwnd, pid, _title in visible_windows():
            if pid != self.pid or IsIconic(hwnd):
                continue
            r = _client_rect(hwnd)
            if r and r[2] * r[3] > best_area:
                best, best_area = hwnd, r[2] * r[3]
        self._hwnd, self._hwnd_at = best, now
        return best

    def window_rect(self) -> tuple[int, int, int, int] | None:
        hwnd = self._main_window()
        if not hwnd:
            return None
        return _client_rect(hwnd)

    def close(self) -> None:
        if self._h:
            CloseHandle(self._h)
            self._h = None


def own_pid() -> int:
    return os.getpid()
