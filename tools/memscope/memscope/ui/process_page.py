"""Start screen: pick the program (game) to read."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PySide6.QtCore import QSize, Qt, QTimer, Signal
from PySide6.QtWidgets import QCheckBox, QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem, QVBoxLayout, QWidget

from ..processes import ProcInfo, is_system, list_processes
from ..profile import Profile
from . import theme as T
from .widgets import Badge, button, label, page, row

APP_ROOT = Path(__file__).resolve().parents[2]


class ProcessRow(QWidget):
    def __init__(self, info: ProcInfo) -> None:
        super().__init__()
        lay = QHBoxLayout(self)
        lay.setContentsMargins(12, 9, 14, 9)
        lay.setSpacing(12)
        ic = QLabel()
        ic.setPixmap(T.icon("game" if info.has_window else "process", T.ACCENT_HI if info.has_window else T.FAINT, 22).pixmap(22, 22))
        lay.addWidget(ic)
        text = QVBoxLayout()
        text.setSpacing(1)
        text.addWidget(label(info.name, "h3"), 0, Qt.AlignLeft)
        title = info.title or "kein Fenster"
        if len(title) > 90:
            title = title[:87] + "…"
        text.addWidget(label(title, "muted" if info.title else "faint"), 0, Qt.AlignLeft)
        lay.addLayout(text, 1)
        if info.is_demo:
            lay.addWidget(Badge("Zum Üben", T.OK))
        if Profile(info.profile_name).path.exists():
            lay.addWidget(Badge("Profil gespeichert", T.ACCENT_HI))
        meta = label(f"PID {info.pid}   ·   {info.memory_mb:,.0f} MB".replace(",", "."), "faint")
        meta.setMinimumWidth(150)
        meta.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        lay.addWidget(meta)


class ProcessPage(QWidget):
    chosen = Signal(object)  # ProcInfo

    def __init__(self) -> None:
        super().__init__()
        w, lay = page()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(w)

        hero = QWidget()
        hero.setObjectName("hero")
        hero.setAttribute(Qt.WA_StyledBackground, True)
        hero_l = QHBoxLayout(hero)
        hero_l.setContentsMargins(26, 22, 26, 22)
        hero_l.setSpacing(18)
        logo = QLabel()
        logo.setPixmap(T.logo_pixmap(56))
        hero_l.addWidget(logo, 0, Qt.AlignTop)
        txt = QVBoxLayout()
        txt.setSpacing(6)
        txt.addWidget(label("Welches Spiel soll ausgelesen werden?", "h1"))
        txt.addWidget(label(
            "Starte zuerst das Spiel und wähle es dann hier aus. MemScope liest nur den Speicher "
            "(es verändert nichts) und merkt sich alles, was du findest, in einem Profil pro Spiel.",
            "muted", wrap=True))
        hero_l.addLayout(txt, 1)
        self.demo_btn = button("Übungsarena starten", "primary", "play", "Kleines Übungsspiel, um alles gefahrlos auszuprobieren")
        self.demo_btn.clicked.connect(self.start_demo)
        hero_l.addWidget(self.demo_btn, 0, Qt.AlignVCenter)
        lay.addWidget(hero)

        self.search = QLineEdit()
        self.search.setPlaceholderText("Suchen … z. B. minecraft, javaw, game")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self.fill)
        self.only_windows = QCheckBox("Nur Programme mit Fenster")
        self.only_windows.setChecked(T.IS_WINDOWS)
        self.only_windows.setVisible(T.IS_WINDOWS)
        self.only_windows.toggled.connect(self.fill)
        refresh = button("Aktualisieren", None, "refresh")
        refresh.clicked.connect(self.refresh)
        lay.addLayout(row(self.search, self.only_windows, refresh))

        self.list = QListWidget()
        self.list.setSpacing(1)
        self.list.setUniformItemSizes(True)
        self.list.itemDoubleClicked.connect(lambda _it: self.connect_selected())
        self.list.currentRowChanged.connect(lambda r: self.connect_btn.setEnabled(r >= 0))
        lay.addWidget(self.list, 1)

        warn = QLabel()
        warn.setPixmap(T.icon("shield", T.WARN, 18).pixmap(18, 18))
        note = label(
            "Nur für Einzelspieler, Offline-Modus oder eigene Server. Online-Spiele mit Anti-Cheat "
            "(z. B. Easy Anti-Cheat, BattlEye, Vanguard) erkennen solche Programme – das führt zu einem Bann.",
            "faint", wrap=True)
        self.count = label("", "faint")
        self.connect_btn = button("Verbinden", "primary", "link")
        self.connect_btn.setEnabled(False)
        self.connect_btn.clicked.connect(self.connect_selected)
        foot = row(warn, note, self.count, self.connect_btn, spacing=12)
        foot.setStretch(1, 1)
        lay.addLayout(foot)

        self._all: list[ProcInfo] = []
        self._demo: subprocess.Popen | None = None
        self._wait_demo = QTimer(self)
        self._wait_demo.setInterval(400)
        self._wait_demo.timeout.connect(self._demo_ready)
        self._wait_tries = 0

    def showEvent(self, ev) -> None:
        super().showEvent(ev)
        self.refresh()

    def refresh(self) -> None:
        try:
            self._all = list_processes()
        except Exception:  # psutil can hiccup while processes exit
            self._all = []
        self.fill()

    def fill(self) -> None:
        q = self.search.text().strip().lower()
        only_win = self.only_windows.isChecked() and self.only_windows.isVisible()
        self.list.clear()
        shown = 0
        for info in self._all:
            hay = f"{info.name} {info.title}".lower()
            if q and q not in hay:
                continue
            if not q and (is_system(info) or (only_win and not info.has_window and not info.is_demo)):
                continue
            it = QListWidgetItem()
            it.setData(Qt.UserRole, info)
            it.setSizeHint(QSize(100, 58))
            self.list.addItem(it)
            self.list.setItemWidget(it, ProcessRow(info))
            shown += 1
        self.count.setText(f"{shown} Programme")
        self.connect_btn.setEnabled(False)

    def connect_selected(self) -> None:
        it = self.list.currentItem()
        if it is not None:
            self.chosen.emit(it.data(Qt.UserRole))

    # --- practice arena ------------------------------------------------------
    def start_demo(self) -> None:
        if self._demo is None or self._demo.poll() is not None:
            flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            self._demo = subprocess.Popen([sys.executable, "-m", "memscope.demo"], cwd=APP_ROOT, creationflags=flags)
        self._wait_tries = 0
        self._wait_demo.start()

    def _demo_ready(self) -> None:
        self._wait_tries += 1
        self.refresh()
        for info in self._all:
            if info.is_demo and self._demo is not None and self._demo.pid in (info.pid, info.parent):
                self._wait_demo.stop()
                self.chosen.emit(info)
                return
        if self._wait_tries > 25:
            self._wait_demo.stop()

    def stop_demo(self) -> None:
        if self._demo is not None and self._demo.poll() is None:
            self._demo.terminate()
