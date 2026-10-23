"""Listing running programs for the start screen."""

from __future__ import annotations

import os
from dataclasses import dataclass

import psutil

from .backend import IS_WINDOWS, window_titles

DEMO_NAME = "Übungsarena"
DEMO_PROFILE = "uebungsarena"

# Anti-cheat services. If one of these runs, reading memory is detected and
# usually leads to a ban, so MemScope warns before attaching.
ANTI_CHEAT = {
    "easyanticheat.exe": "Easy Anti-Cheat",
    "easyanticheat_eos.exe": "Easy Anti-Cheat",
    "beservice.exe": "BattlEye",
    "beservice_x64.exe": "BattlEye",
    "vgc.exe": "Riot Vanguard",
    "vgtray.exe": "Riot Vanguard",
    "faceit.exe": "FACEIT",
    "faceitservice.exe": "FACEIT",
    "eaanticheat.gameservice.exe": "EA Anti-Cheat",
    "gameguard.des": "nProtect GameGuard",
    "xigncode.exe": "XIGNCODE",
    "mhyprot.sys": "miHoYo Protect",
}

# Not games: hidden from the list unless searched for.
_SYSTEM = {
    "system", "system idle process", "registry", "smss.exe", "csrss.exe", "wininit.exe", "services.exe",
    "lsass.exe", "svchost.exe", "fontdrvhost.exe", "dwm.exe", "winlogon.exe", "sihost.exe", "conhost.exe",
    "runtimebroker.exe", "searchhost.exe", "startmenuexperiencehost.exe", "textinputhost.exe", "ctfmon.exe",
    "taskhostw.exe", "dllhost.exe", "explorer.exe", "systemsettings.exe", "applicationframehost.exe",
    "shellexperiencehost.exe", "lockapp.exe", "securityhealthsystray.exe", "memcompression",
}


@dataclass
class ProcInfo:
    pid: int
    name: str  # what is shown
    profile_name: str  # what the profile is saved as
    title: str
    memory_mb: float
    is_demo: bool = False
    parent: int = 0

    @property
    def has_window(self) -> bool:
        return bool(self.title)


def _is_demo(proc: psutil.Process, name: str) -> bool:
    if "python" not in name.lower():
        return False
    try:
        return "memscope.demo" in " ".join(proc.cmdline())
    except (psutil.Error, OSError):
        return False


def _ppid(proc: psutil.Process) -> int:
    try:
        return proc.ppid()
    except (psutil.Error, OSError):
        return 0


def list_processes() -> list[ProcInfo]:
    titles = window_titles()
    me = os.getpid()
    out: list[ProcInfo] = []
    for p in psutil.process_iter(["pid", "name", "memory_info"]):
        info = p.info
        pid = info["pid"]
        name = info.get("name") or ""
        if pid in (0, 4, me) or not name:
            continue
        mem = info.get("memory_info")
        mb = (mem.rss / 1024 / 1024) if mem else 0.0
        if _is_demo(p, name):
            # On Windows a venv's python.exe is only a launcher that starts the
            # real interpreter as a child; only the one with the window counts.
            title = titles.get(pid, "") if IS_WINDOWS else "MemScope Übungsarena"
            if title:
                out.append(ProcInfo(pid, DEMO_NAME, DEMO_PROFILE, title, mb, is_demo=True, parent=_ppid(p)))
            continue
        out.append(ProcInfo(pid, name, name, titles.get(pid, ""), mb))
    out.sort(key=lambda i: (not i.is_demo, not i.has_window, -i.memory_mb))
    return out


def is_system(info: ProcInfo) -> bool:
    return info.name.lower() in _SYSTEM


def running_anticheat() -> list[str]:
    found = set()
    for p in psutil.process_iter(["name"]):
        n = (p.info.get("name") or "").lower()
        if n in ANTI_CHEAT:
            found.add(ANTI_CHEAT[n])
    return sorted(found)
