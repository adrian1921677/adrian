"""Page "Adress-Tabelle": saved addresses, read live, plus pointer search."""

from __future__ import annotations

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QDialog,
    QFileDialog,
    QHeaderView,
    QLineEdit,
    QProgressBar,
    QTableWidget,
    QVBoxLayout,
    QWidget,
)

from .. import values as V
from ..address import AddressRef, fmt_addr, parse_hex, parse_offsets, static_expr
from ..pointers import find_pointers
from ..profile import WatchEntry, export_csv
from ..session import Session
from . import theme as T
from .widgets import Worker, button, field, header, item, label, page, row


class AddressDialog(QDialog):
    def __init__(self, session: Session, entry: WatchEntry | None, parent=None) -> None:
        super().__init__(parent)
        self.s = session
        self.setWindowTitle("Adresse bearbeiten" if entry else "Adresse hinzufügen")
        self.setMinimumWidth(520)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(24, 22, 24, 22)
        lay.setSpacing(12)
        lay.addWidget(label(self.windowTitle(), "h2"))
        self.name = QLineEdit(entry.label if entry else "")
        self.name.setPlaceholderText("z. B. Leben")
        self.base = QLineEdit(entry.ref.base if entry else "")
        self.base.setProperty("mono", True)
        self.base.setPlaceholderText("z. B. 1A2B3C40  oder  spiel.exe+1F00")
        self.offsets = QLineEdit(", ".join(entry.ref.offsets) if entry else "")
        self.offsets.setProperty("mono", True)
        self.offsets.setPlaceholderText("leer lassen, oder z. B. 10, 8")
        self.vtype = QComboBox()
        for k, t in V.TYPES.items():
            self.vtype.addItem(t.label, k)
        if entry:
            self.vtype.setCurrentIndex(max(0, self.vtype.findData(entry.vtype)))
        lay.addLayout(field("Name", self.name))
        lay.addLayout(field("Adresse", self.base, "Hex-Zahl oder Modul+Versatz. Modul-Adressen bleiben nach einem Neustart gleich."))
        lay.addLayout(field("Zeiger-Versätze (optional)", self.offsets,
                            "Für Zeigerketten: Adresse lesen → +Versatz → lesen → +Versatz …"))
        lay.addLayout(field("Datentyp", self.vtype))
        self.preview = label("", "mono")
        lay.addWidget(self.preview)
        ok = button("Speichern", "primary", "check")
        ok.clicked.connect(self._accept)
        cancel = button("Abbrechen", "ghost")
        cancel.clicked.connect(self.reject)
        lay.addLayout(row(None, cancel, ok))
        for wdg in (self.base, self.offsets):
            wdg.textChanged.connect(self._preview)
        self.vtype.currentIndexChanged.connect(self._preview)
        self._preview()

    def ref(self) -> AddressRef | None:
        try:
            return AddressRef(self.base.text().strip(), parse_offsets(self.offsets.text()))
        except ValueError:
            return None

    def _preview(self) -> None:
        ref = self.ref()
        addr = ref.resolve(self.s.proc) if ref else None
        if addr is None:
            self.preview.setText("→ Adresse ungültig oder nicht lesbar")
            self.preview.setStyleSheet(f"color: {T.BAD};")
            return
        vt = V.get(self.vtype.currentData())
        val = V.format_value(vt, V.decode(vt, self.s.proc.read(addr, vt.size)))
        self.preview.setText(f"→ {fmt_addr(addr, self.s.pointer_size)}  =  {val}")
        self.preview.setStyleSheet(f"color: {T.OK};")

    def _accept(self) -> None:
        if self.ref() is None or not self.base.text().strip():
            self.preview.setText("Bitte eine gültige Adresse eingeben.")
            return
        self.accept()

    def entry(self) -> WatchEntry:
        return WatchEntry(self.name.text().strip() or "Wert", self.ref(), self.vtype.currentData())


class PointerDialog(QDialog):
    """Search for pointers to an address and offer them as new entries."""

    def __init__(self, session: Session, target: int, vtype: str, label_text: str, parent=None) -> None:
        super().__init__(parent)
        self.s = session
        self.target = target
        self.vtype = vtype
        self.label_text = label_text
        self.result_entry: WatchEntry | None = None
        self.setWindowTitle("Zeiger suchen")
        self.setMinimumSize(640, 520)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(24, 22, 24, 22)
        lay.setSpacing(12)
        lay.addWidget(label("Wer zeigt auf diese Adresse?", "h2"))
        lay.addWidget(label(
            f"Ziel: {fmt_addr(target, session.pointer_size)}. Heap-Adressen ändern sich bei jedem Spielstart. "
            "Ein Zeiger aus dem Spiel-Modul (grün markiert) bleibt dagegen gleich – damit findet MemScope den Wert "
            "auch nach einem Neustart wieder.", "muted", wrap=True))
        self.max_off = QLineEdit("800")
        self.max_off.setProperty("mono", True)
        self.go = button("Suchen", "primary", "search")
        self.go.clicked.connect(self.run)
        lay.addLayout(row(field("Größter Versatz (hex)", self.max_off), None, self.go))
        self.progress = QProgressBar()
        self.progress.setRange(0, 1000)
        self.progress.hide()
        lay.addWidget(self.progress)
        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Zeiger liegt bei", "Versatz", "Art"])
        self.table.verticalHeader().hide()
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.doubleClicked.connect(lambda _i: self.take())
        lay.addWidget(self.table, 1)
        self.take_btn = button("Als neuen Eintrag übernehmen", "primary", "plus")
        self.take_btn.clicked.connect(self.take)
        close = button("Schließen", "ghost")
        close.clicked.connect(self.reject)
        lay.addLayout(row(None, close, self.take_btn))
        self.hits = []
        self.worker: Worker | None = None

    def run(self) -> None:
        try:
            max_off = parse_hex(self.max_off.text())
        except ValueError:
            return
        proc, target = self.s.proc, self.target
        self.worker = Worker(lambda prog, cancel: find_pointers(proc, target, max_off, prog, cancel), self)
        self.worker.progressed.connect(lambda f: self.progress.setValue(int(f * 1000)))
        self.worker.done.connect(self._done)
        self.worker.failed.connect(lambda m: self._done([]))
        self.progress.show()
        self.go.setEnabled(False)
        self.worker.start()

    def _done(self, hits) -> None:
        if self.worker:
            self.worker.wait()
            self.worker = None
        self.progress.hide()
        self.go.setEnabled(True)
        self.hits = hits
        ps = self.s.pointer_size
        self.table.setRowCount(len(hits))
        for r, h in enumerate(hits):
            where = h.static or fmt_addr(h.address, ps)
            self.table.setItem(r, 0, item(where, mono=True, color=T.OK if h.static else T.TEXT))
            self.table.setItem(r, 1, item(f"+{h.offset:X}", mono=True))
            self.table.setItem(r, 2, item("statisch – bleibt gleich" if h.static else "Heap – ändert sich", color=T.OK if h.static else T.MUTED))

    def take(self) -> None:
        r = self.table.currentRow()
        if r < 0 or r >= len(self.hits):
            return
        h = self.hits[r]
        base = h.static or f"{h.address:X}"
        self.result_entry = WatchEntry(f"{self.label_text} (Zeiger)", AddressRef(base, [f"{h.offset:X}"]), self.vtype)
        self.accept()

    def reject(self) -> None:
        if self.worker:
            self.worker.cancel()
            self.worker.wait()
        super().reject()


class WatchPage(QWidget):
    open_struct = Signal(object)  # address

    def __init__(self, session: Session) -> None:
        super().__init__()
        self.s = session
        w, lay = page()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(w)
        lay.addLayout(header(
            "Adress-Tabelle",
            "Alle gefundenen Adressen. Die Werte werden dauerhaft live ausgelesen und im Profil des Spiels gespeichert.",
        ))
        add = button("Hinzufügen", None, "plus")
        add.clicked.connect(self.add_manual)
        self.edit_btn = button("Bearbeiten", None, "edit")
        self.edit_btn.clicked.connect(self.edit_selected)
        self.del_btn = button("Entfernen", "danger", "trash")
        self.del_btn.clicked.connect(self.remove_selected)
        self.struct_btn = button("Umgebung ansehen", None, "struct")
        self.struct_btn.clicked.connect(self._struct)
        self.ptr_btn = button("Zeiger suchen", None, "link", "Findet eine Adresse, die auch nach einem Neustart stimmt.")
        self.ptr_btn.clicked.connect(self._pointers)
        csv_btn = button("Als CSV speichern", "ghost", "save")
        csv_btn.clicked.connect(self._csv)
        lay.addLayout(row(add, self.edit_btn, self.del_btn, None, self.struct_btn, self.ptr_btn, csv_btn))

        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(["Name", "Adresse", "Datentyp", "Wert (live)", "Nach Neustart"])
        self.table.verticalHeader().hide()
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.DoubleClicked | QAbstractItemView.EditKeyPressed)
        self.table.setAlternatingRowColors(True)
        self.table.setShowGrid(False)
        hh = self.table.horizontalHeader()
        hh.setSectionResizeMode(QHeaderView.Stretch)
        hh.setDefaultAlignment(Qt.AlignLeft)
        self.table.itemChanged.connect(self._renamed)
        lay.addWidget(self.table, 1)
        self.empty = label("Noch leer. Finde Werte unter „Wert suchen“ und übernimm sie per Doppelklick.", "muted")
        self.empty.setAlignment(Qt.AlignCenter)
        lay.addWidget(self.empty)

        self.live = QTimer(self)
        self.live.setInterval(200)
        self.live.timeout.connect(self._refresh)
        self.live.start()
        self._filling = False

    # --- data -------------------------------------------------------------------
    @property
    def entries(self) -> list[WatchEntry]:
        return self.s.profile.watch if self.s.profile else []

    def on_attached(self) -> None:
        self.fill()

    def fill(self) -> None:
        self._filling = True
        self.table.setRowCount(len(self.entries))
        for r, e in enumerate(self.entries):
            self.table.setItem(r, 0, item(e.label, editable=True))
            self.table.setItem(r, 1, item(e.ref.describe(), mono=True, color=T.ACCENT2))
            self.table.setItem(r, 2, item(V.get(e.vtype).label, color=T.MUTED))
            self.table.setItem(r, 3, item("…", mono=True))
            static = e.ref.is_static
            self.table.setItem(r, 4, item("bleibt gleich" if static else "ändert sich", color=T.OK if static else T.WARN))
        self._filling = False
        self.empty.setVisible(not self.entries)
        self._refresh()

    def _refresh(self) -> None:
        if self.s.proc is None or not self.isVisible():
            return
        ps = self.s.pointer_size
        for r, e in enumerate(self.entries):
            if r >= self.table.rowCount():
                break
            vt = V.get(e.vtype)
            addr = e.ref.resolve(self.s.proc)
            val = V.decode(vt, self.s.proc.read(addr, vt.size)) if addr else None
            it = self.table.item(r, 3)
            text = V.format_value(vt, val)
            if it.text() != text:
                it.setText(text)
                it.setForeground(QColor(T.TEXT if val is not None else T.BAD))
            self.table.item(r, 1).setToolTip(f"= {fmt_addr(addr, ps)}")

    def _renamed(self, it) -> None:
        if self._filling or it.column() != 0 or it.row() >= len(self.entries):
            return
        self.entries[it.row()].label = it.text().strip() or "Wert"
        self.s.watch_edited()

    def add_address(self, address: int, vtype: str) -> None:
        if self.s.proc is None:
            return
        n = len(self.entries) + 1
        self.entries.append(WatchEntry(f"Wert {n}", AddressRef(static_expr(self.s.proc, address)), vtype))
        self.s.watch_edited()
        self.fill()

    def add_entry(self, entry: WatchEntry) -> None:
        self.entries.append(entry)
        self.s.watch_edited()
        self.fill()

    def _selected(self) -> list[int]:
        return sorted({i.row() for i in self.table.selectedIndexes()})

    def add_manual(self) -> None:
        dlg = AddressDialog(self.s, None, self)
        if dlg.exec():
            self.add_entry(dlg.entry())

    def edit_selected(self) -> None:
        rows = self._selected()
        if not rows:
            return
        dlg = AddressDialog(self.s, self.entries[rows[0]], self)
        if dlg.exec():
            self.entries[rows[0]] = dlg.entry()
            self.s.watch_edited()
            self.fill()

    def remove_selected(self) -> None:
        for r in reversed(self._selected()):
            del self.entries[r]
        self.s.watch_edited()
        self.fill()

    def _resolved_selected(self) -> tuple[WatchEntry, int] | None:
        rows = self._selected()
        if not rows or self.s.proc is None:
            return None
        e = self.entries[rows[0]]
        addr = e.ref.resolve(self.s.proc)
        return (e, addr) if addr else None

    def _struct(self) -> None:
        sel = self._resolved_selected()
        if sel:
            self.open_struct.emit(sel[1])

    def _pointers(self) -> None:
        sel = self._resolved_selected()
        if not sel:
            return
        e, addr = sel
        dlg = PointerDialog(self.s, addr, e.vtype, e.label, self)
        if dlg.exec() and dlg.result_entry:
            self.add_entry(dlg.result_entry)

    def _csv(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Tabelle speichern", "adressen.csv", "CSV (*.csv)")
        if not path:
            return
        rows = []
        for r, e in enumerate(self.entries):
            addr = e.ref.resolve(self.s.proc) if self.s.proc else None
            rows.append([e.label, e.ref.describe(), fmt_addr(addr, self.s.pointer_size), V.get(e.vtype).label,
                         self.table.item(r, 3).text() if self.table.item(r, 3) else ""])
        export_csv(path, ["Name", "Adresse", "Aufgelöst", "Datentyp", "Wert"], rows)

