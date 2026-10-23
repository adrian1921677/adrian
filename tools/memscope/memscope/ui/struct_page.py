"""Page "Umgebung": memory around an address, shown as numbers, live.

This is where a found value turns into an object: the health of a witch sits
next to her position and name. Right-click a row to use it as a field of the
object layout.
"""

from __future__ import annotations

import math
import struct
import time

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QHeaderView,
    QLineEdit,
    QMenu,
    QTableWidget,
    QVBoxLayout,
    QWidget,
)

from .. import values as V
from ..address import eval_expr, fmt_addr
from ..session import Session
from . import theme as T
from .widgets import Badge, button, field, header, item, label, page, row

COLS = ["Versatz", "Adresse", "Bytes", "Ganzzahl", "Kommazahl (float)", "8 Byte / Zeiger", "Text"]


def _printable(b: bytes) -> str:
    return "".join(chr(c) if 32 <= c < 127 else "·" for c in b)


class StructPage(QWidget):
    # Addresses are 64-bit: Signal(int) would overflow, so they travel as object.
    use_field = Signal(str, object, int)  # field name, entity base, offset
    use_base = Signal(object)
    add_watch = Signal(object, str)

    def __init__(self, session: Session) -> None:
        super().__init__()
        self.s = session
        self.base = 0
        self.prev: dict[int, bytes] = {}
        self.changed_at: dict[int, float] = {}
        w, lay = page()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(w)
        lay.addLayout(header(
            "Umgebung ansehen",
            "Zeigt den Speicher rund um eine Adresse. Werte, die sich gerade ändern, leuchten gelb – "
            "so erkennst du Position (ändert sich beim Laufen), Leben und Namen eines Objekts.",
        ))
        self.addr = QLineEdit()
        self.addr.setProperty("mono", True)
        self.addr.setPlaceholderText("Adresse, z. B. 1A2B3C40")
        self.addr.returnPressed.connect(self.go)
        self.size = QComboBox()
        for n in (0x80, 0x100, 0x200, 0x400):
            self.size.addItem(f"{n:#x} Bytes", n)
        self.size.setCurrentIndex(1)
        self.size.currentIndexChanged.connect(self.go)
        go = button("Anzeigen", "primary", "struct")
        go.clicked.connect(self.go)
        back = button("−0x40", "ghost", tip="Etwas weiter vorne anfangen (Objekte beginnen oft vor dem gefundenen Wert)")
        back.clicked.connect(lambda: self.shift(-0x40))
        fwd = button("+0x40", "ghost")
        fwd.clicked.connect(lambda: self.shift(0x40))
        self.base_btn = button("Als Objekt-Anfang nutzen", None, "target",
                               "Diese Adresse ist der Anfang eines Objekts (z. B. einer Hexe)")
        self.base_btn.clicked.connect(lambda: self.use_base.emit(self.base))
        lay.addLayout(row(field("Start-Adresse", self.addr), field("Größe", self.size), back, fwd, go, None, self.base_btn, spacing=10))
        self.info = Badge()
        lay.addLayout(row(self.info, label("Rechtsklick auf eine Zeile: als X / Y / Z, Leben oder Name des Objekts verwenden.", "faint"), None))

        self.table = QTableWidget(0, len(COLS))
        self.table.setHorizontalHeaderLabels(COLS)
        self.table.verticalHeader().hide()
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setShowGrid(False)
        self.table.setAlternatingRowColors(True)
        hh = self.table.horizontalHeader()
        hh.setSectionResizeMode(QHeaderView.ResizeToContents)
        hh.setStretchLastSection(True)
        hh.setDefaultAlignment(Qt.AlignLeft)
        self.table.setContextMenuPolicy(Qt.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self._menu)
        lay.addWidget(self.table, 1)

        self.live = QTimer(self)
        self.live.setInterval(150)
        self.live.timeout.connect(self.refresh)

    def show_address(self, address: int) -> None:
        # Start a little before the value: objects usually begin earlier.
        start = max(0, (address - 0x40) & ~0xF)
        self.addr.setText(f"{start:X}")
        self.go()

    def shift(self, delta: int) -> None:
        if self.base:
            self.addr.setText(f"{max(0, self.base + delta):X}")
            self.go()

    def go(self) -> None:
        if self.s.proc is None:
            return
        addr = eval_expr(self.s.proc, self.addr.text())
        if addr is None:
            self.info.set("Adresse ungültig", T.BAD)
            return
        self.base = addr
        self.prev.clear()
        self.changed_at.clear()
        n = self.size.currentData() // 4
        self.table.setRowCount(n)
        ps = self.s.pointer_size
        for r in range(n):
            self.table.setItem(r, 0, item(f"+{r * 4:03X}", mono=True, color=T.ACCENT_HI))
            self.table.setItem(r, 1, item(fmt_addr(addr + r * 4, ps), mono=True, color=T.FAINT))
            for c in range(2, len(COLS)):
                self.table.setItem(r, c, item("", mono=True))
        mod = self.s.proc.module_at(addr)
        self.info.set(f"im Modul {mod.name}" if mod else "Heap-Speicher", T.OK if mod else T.MUTED)
        self.refresh()
        self.live.start()

    def refresh(self) -> None:
        if self.s.proc is None or not self.isVisible() or not self.base:
            return
        size = self.size.currentData()
        data = self.s.proc.read(self.base, size + 4)
        if data is None:
            data = self.s.proc.read(self.base, size)
        if data is None:
            self.info.set("Nicht lesbar", T.BAD)
            return
        now = time.monotonic()
        ps = self.s.pointer_size
        for r in range(min(self.table.rowCount(), len(data) // 4)):
            off = r * 4
            chunk = data[off : off + 4]
            if self.prev.get(off) not in (None, chunk):
                self.changed_at[off] = now
            self.prev[off] = chunk
            hot = now - self.changed_at.get(off, -10) < 1.2
            i32 = struct.unpack("<i", chunk)[0]
            f32 = struct.unpack("<f", chunk)[0]
            cells = [
                " ".join(f"{b:02X}" for b in chunk),
                str(i32),
                _fmt_float(f32),
                self._qword(data, off, ps) if off % 8 == 0 else "",
                _printable(data[off : off + 4]),
            ]
            for c, text in enumerate(cells, start=2):
                it = self.table.item(r, c)
                if it.text() != text:
                    it.setText(text)
                color = T.WARN if hot else (T.TEXT if c in (3, 4) and _interesting(i32, f32, c) else T.MUTED)
                it.setForeground(QColor(color))

    def _qword(self, data: bytes, off: int, ps: int) -> str:
        raw = data[off : off + 8]
        if len(raw) < 8:
            return ""
        q = int.from_bytes(raw, "little")
        if ps == 4:
            q &= 0xFFFFFFFF
        if q and self.s.proc is not None:
            mod = self.s.proc.module_at(q)
            if mod is not None:
                return f"→ {mod.name}+{q - mod.base:X}"
            if 0x10000 < q < (1 << 47) and self.s.proc.read(q, 1) is not None:
                return f"→ {q:X}"
        return str(struct.unpack("<q", raw)[0]) if ps == 8 else ""

    def _menu(self, pos) -> None:
        r = self.table.rowAt(pos.y())
        if r < 0:
            return
        off = r * 4
        m = QMenu(self)
        for key, text in (("pos_x", "als X-Position"), ("pos_y", "als Y-Position"), ("pos_z", "als Z-Position"),
                          ("health", "als Leben"), ("max_health", "als Max. Leben"), ("name", "als Name (Text)"),
                          ("type_id", "als Typ-Nummer")):
            m.addAction(T.icon("target"), f"+{off:X} {text} des Objekts verwenden",
                        lambda k=key: self.use_field.emit(k, self.base, off))
        m.addSeparator()
        m.addAction(T.icon("target"), "Hier beginnt das Objekt", lambda: self.use_base.emit(self.base + off))
        m.addSeparator()
        for vt in ("float", "int32", "double", "utf8"):
            m.addAction(T.icon("plus"), f"In Adress-Tabelle ({V.get(vt).label})",
                        lambda t=vt: self.add_watch.emit(self.base + off, t))
        m.exec(self.table.viewport().mapToGlobal(pos))


def _fmt_float(f: float) -> str:
    if math.isnan(f) or math.isinf(f):
        return "–"
    if f != 0 and (abs(f) < 1e-5 or abs(f) > 1e9):
        return "–"
    return V.format_value(V.get("float"), f)


def _interesting(i32: int, f32: float, col: int) -> bool:
    """Highlight values that look meaningful (small ints, normal floats)."""
    if col == 3:
        return 0 < abs(i32) < 100000
    return math.isfinite(f32) and 1e-3 < abs(f32) < 1e6

