"""Main window: sidebar navigation, connection bar and all pages."""

from __future__ import annotations

import sys
import traceback
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QApplication,
    QButtonGroup,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from . import __version__
from .backend import AttachError
from .processes import ProcInfo, running_anticheat
from .session import Session
from .ui import theme as T
from .ui.entity_page import EntityPage
from .ui.overlay_page import OverlayPage
from .ui.process_page import ProcessPage
from .ui.scan_page import ScanPage
from .ui.struct_page import StructPage
from .ui.watch_page import WatchPage
from .ui.widgets import Dot, button, label

NAV = [
    ("process", "Spiel wählen"),
    ("search", "Wert suchen"),
    ("table", "Adress-Tabelle"),
    ("struct", "Umgebung ansehen"),
    ("target", "Objekte & Gegner"),
    ("eye", "Overlay"),
]


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("MemScope")
        self.setWindowIcon(T.app_icon())
        self.resize(1440, 900)
        self.setMinimumSize(1100, 700)
        self.s = Session()

        self.p_process = ProcessPage()
        self.p_scan = ScanPage(self.s)
        self.p_watch = WatchPage(self.s)
        self.p_struct = StructPage(self.s)
        self.p_entity = EntityPage(self.s)
        self.p_overlay = OverlayPage(self.s)
        self.pages = [self.p_process, self.p_scan, self.p_watch, self.p_struct, self.p_entity, self.p_overlay]

        root = QWidget()
        h = QHBoxLayout(root)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(0)
        h.addWidget(self._sidebar())
        main = QVBoxLayout()
        main.setContentsMargins(0, 0, 0, 0)
        main.setSpacing(0)
        main.addWidget(self._topbar())
        self.stack = QStackedWidget()
        for p in self.pages:
            self.stack.addWidget(p)
        main.addWidget(self.stack, 1)
        h.addLayout(main, 1)
        self.setCentralWidget(root)
        self.statusBar().showMessage("Bereit. Wähle ein Spiel aus.")

        self.p_process.chosen.connect(self.attach)
        self.p_scan.add_to_watch.connect(self._add_watch)
        self.p_scan.open_struct.connect(self.open_struct)
        self.p_watch.open_struct.connect(self.open_struct)
        self.p_struct.use_field.connect(self._use_field)
        self.p_struct.use_base.connect(self._use_base)
        self.p_struct.add_watch.connect(self._add_watch)
        for sig in (self.p_entity.status, self.p_overlay.status, self.s.status):
            sig.connect(lambda t: self.statusBar().showMessage(t, 8000))
        self.s.detached.connect(self._detached)
        self._set_connected(False)
        self.go(0)

    # --- chrome ------------------------------------------------------------------
    def _sidebar(self) -> QWidget:
        side = QWidget()
        side.setObjectName("sidebar")
        side.setAttribute(Qt.WA_StyledBackground, True)
        side.setFixedWidth(232)
        v = QVBoxLayout(side)
        v.setContentsMargins(14, 18, 14, 16)
        v.setSpacing(4)
        logo = QLabel()
        logo.setPixmap(T.logo_pixmap(34))
        brand = QVBoxLayout()
        brand.setSpacing(0)
        brand.addWidget(label("MemScope", "logo"))
        brand.addWidget(label("Spieldaten auslesen", "faint"))
        top = QHBoxLayout()
        top.setSpacing(10)
        top.addWidget(logo)
        top.addLayout(brand, 1)
        v.addLayout(top)
        v.addSpacing(22)
        self.nav = QButtonGroup(self)
        self.nav.setExclusive(True)
        self.nav_buttons = []
        for i, (icon_name, text) in enumerate(NAV):
            b = button(f"  {text}".replace("&", "&&"))  # a single & would become a keyboard shortcut
            b.setProperty("nav", True)
            b.setCheckable(True)
            b.setIcon(T.icon(icon_name, T.MUTED))
            b.setIconSize(T.ICON_SIZE)
            b.clicked.connect(lambda _c=False, n=i: self.go(n))
            self.nav.addButton(b, i)
            self.nav_buttons.append(b)
            v.addWidget(b)
            if i == 0:
                v.addSpacing(8)
                v.addWidget(label("  AUSLESEN", "faint"))
            if i == 3:
                v.addSpacing(8)
                v.addWidget(label("  GEGNER MARKIEREN", "faint"))
        v.addStretch(1)
        v.addWidget(label("Alles wird automatisch im Profil\ndes Spiels gespeichert.", "faint"))
        v.addSpacing(4)
        v.addWidget(label(f"Version {__version__}", "faint"))
        return side

    def _topbar(self) -> QWidget:
        bar = QWidget()
        bar.setObjectName("topbar")
        bar.setAttribute(Qt.WA_StyledBackground, True)
        bar.setFixedHeight(56)
        h = QHBoxLayout(bar)
        h.setContentsMargins(28, 0, 20, 0)
        h.setSpacing(10)
        self.dot = Dot()
        self.conn = label("Nicht verbunden", "h3")
        self.conn_sub = label("", "faint")
        h.addWidget(self.dot)
        h.addWidget(self.conn)
        h.addWidget(self.conn_sub)
        h.addStretch(1)
        self.detach_btn = button("Trennen", "ghost", "unplug")
        self.detach_btn.clicked.connect(lambda: self.s.detach("Getrennt."))
        h.addWidget(self.detach_btn)
        return bar

    def go(self, index: int) -> None:
        self.stack.setCurrentIndex(index)
        self.nav_buttons[index].setChecked(True)
        for i, b in enumerate(self.nav_buttons):
            b.setIcon(T.icon(NAV[i][0], T.TEXT if i == index else T.MUTED))

    def _set_connected(self, on: bool) -> None:
        for b in self.nav_buttons[1:]:
            b.setEnabled(on)
        self.detach_btn.setVisible(on)
        if on and self.s.proc:
            self.dot.set(T.OK)
            self.conn.setText(f"Verbunden mit {self.s.proc.name}")
            bits = "64-Bit" if self.s.proc.pointer_size == 8 else "32-Bit"
            self.conn_sub.setText(f"PID {self.s.proc.pid}  ·  {bits}  ·  liest live")
        else:
            self.dot.set(T.FAINT)
            self.conn.setText("Nicht verbunden")
            self.conn_sub.setText("")

    # --- attach -------------------------------------------------------------------
    def attach(self, info: ProcInfo) -> None:
        if not info.is_demo:
            ac = running_anticheat()
            if ac:
                answer = QMessageBox.warning(
                    self, "Anti-Cheat erkannt",
                    f"Gerade läuft: {', '.join(ac)}.\n\n"
                    "Anti-Cheat-Programme erkennen das Auslesen von Spielspeicher. In Online-Spielen führt "
                    "das sehr wahrscheinlich zu einem Bann deines Kontos.\n\n"
                    "Nur fortfahren, wenn du dieses Spiel offline bzw. im Einzelspieler-Modus nutzt.",
                    QMessageBox.Yes | QMessageBox.Cancel, QMessageBox.Cancel)
                if answer != QMessageBox.Yes:
                    return
        try:
            self.s.attach(info.pid, info.name, info.profile_name)
        except AttachError as exc:
            QMessageBox.critical(self, "Verbinden nicht möglich", str(exc))
            return
        self._set_connected(True)
        for p in (self.p_scan, self.p_watch, self.p_entity, self.p_overlay):
            p.on_attached()
        prof = self.s.profile
        if self.s.profile_existed:
            self.statusBar().showMessage(f"Profil für {info.name} geladen.", 8000)
        else:
            self.statusBar().showMessage(f"Neues Profil für {info.name} angelegt.", 8000)
        ready = prof.entities.sources and prof.camera.ref.base
        self.go(5 if ready else (4 if prof.entities.sources else 1))

    def _detached(self, reason: str) -> None:
        self.p_overlay.on_detached()
        self._set_connected(False)
        self.go(0)
        if reason:
            self.statusBar().showMessage(reason, 10000)

    # --- cross-page actions ------------------------------------------------------------
    def _add_watch(self, address: int, vtype: str) -> None:
        self.p_watch.add_address(address, vtype)
        self.statusBar().showMessage("In die Adress-Tabelle übernommen.", 5000)

    def open_struct(self, address: int) -> None:
        self.p_struct.show_address(address)
        self.go(3)

    def _use_field(self, key: str, base: int, off: int) -> None:
        self.p_entity.use_field(key, base, off)

    def _use_base(self, base: int) -> None:
        self.p_entity.use_base(base)

    def closeEvent(self, ev) -> None:
        self.p_overlay.stop_overlay()
        self.s.detach(quiet=True)
        self.p_process.stop_demo()
        super().closeEvent(ev)


def _install_error_hook() -> None:
    """Show unexpected errors instead of silently dying (pythonw has no console)."""
    log = Path(__file__).resolve().parent.parent / "memscope-fehler.log"

    def hook(exc_type, exc, tb) -> None:
        text = "".join(traceback.format_exception(exc_type, exc, tb))
        sys.__stderr__ and sys.__stderr__.write(text)
        try:
            with open(log, "a", encoding="utf-8") as f:
                f.write(text + "\n")
        except OSError:
            pass
        if QApplication.instance() is not None:
            QMessageBox.warning(None, "Unerwarteter Fehler",
                                f"{exc_type.__name__}: {exc}\n\nDetails stehen in {log.name}. MemScope läuft weiter.")

    sys.excepthook = hook


def main() -> int:
    _install_error_hook()
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("memscope.app")
        except (AttributeError, OSError):
            pass
    app = QApplication.instance() or QApplication(sys.argv)
    app.setApplicationName("MemScope")
    app.setStyle("Fusion")
    app.setFont(QFont(T.ui_font(), 10))
    app.setStyleSheet(T.stylesheet())
    app.setWindowIcon(T.app_icon())
    win = MainWindow()
    win.show()
    return app.exec()
