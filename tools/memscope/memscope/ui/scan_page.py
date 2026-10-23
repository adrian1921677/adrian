"""Page "Wert suchen": the value scanner."""

from __future__ import annotations

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QAbstractItemView,
    QCheckBox,
    QComboBox,
    QHeaderView,
    QLineEdit,
    QMenu,
    QProgressBar,
    QTableWidget,
    QVBoxLayout,
    QWidget,
)

from .. import scanner as S
from .. import values as V
from ..address import fmt_addr
from ..session import Session
from . import theme as T
from .widgets import Badge, Card, Worker, button, field, header, item, label, page, row

SHOW_MAX = 1000


class ScanPage(QWidget):
    # Addresses are 64-bit: Signal(int) would overflow, so they travel as object.
    add_to_watch = Signal(object, str)  # address, value type
    open_struct = Signal(object)  # address

    def __init__(self, session: Session) -> None:
        super().__init__()
        self.s = session
        self.results: S.ScanResults | None = None
        self.worker: Worker | None = None
        self.shown: list[tuple[int, object]] = []

        w, lay = page()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(w)
        lay.addLayout(header(
            "Wert suchen",
            "Finde heraus, wo ein Wert aus dem Spiel im Speicher steht – zum Beispiel Leben, Munition oder eine Position.",
        ))

        card = Card()
        steps = label(
            "<b>1.</b> Wert im Spiel ablesen und <b>Erste Suche</b> drücken &nbsp;→&nbsp; "
            "<b>2.</b> Wert im Spiel ändern (Schaden nehmen, laufen …) &nbsp;→&nbsp; "
            "<b>3.</b> neuen Wert eingeben und <b>Weiter eingrenzen</b>. Wiederholen, bis nur noch wenige Treffer übrig sind.",
            "muted", wrap=True)
        steps.setTextFormat(Qt.RichText)
        card.body.addWidget(steps)

        self.vtype = QComboBox()
        for k, t in V.TYPES.items():
            self.vtype.addItem(t.label, k)
        self.vtype.currentIndexChanged.connect(self._update_modes)
        self.mode = QComboBox()
        self.mode.currentIndexChanged.connect(self._update_inputs)
        self.value = QLineEdit()
        self.value.setPlaceholderText("z. B. 100")
        self.value.returnPressed.connect(self.scan)
        self.value2 = QLineEdit()
        self.value2.setPlaceholderText("bis …")
        self.value2.returnPressed.connect(self.scan)
        self.f_value = QWidget()
        fv = QVBoxLayout(self.f_value)
        fv.setContentsMargins(0, 0, 0, 0)
        fv.addLayout(field("Wert", self.value))
        self.f_value2 = QWidget()
        fv2 = QVBoxLayout(self.f_value2)
        fv2.setContentsMargins(0, 0, 0, 0)
        fv2.addLayout(field("Bis", self.value2))
        controls = row(field("Datentyp", self.vtype), field("Suchart", self.mode), self.f_value, self.f_value2, spacing=12)
        controls.setStretch(0, 2)
        controls.setStretch(1, 2)
        controls.setStretch(2, 2)
        controls.setStretch(3, 1)
        card.body.addLayout(controls)

        self.btn_first = button("Erste Suche", "primary", "search")
        self.btn_first.clicked.connect(self.scan)
        self.btn_reset = button("Neu anfangen", "ghost", "refresh")
        self.btn_reset.clicked.connect(self.reset)
        self.btn_cancel = button("Abbrechen", "danger")
        self.btn_cancel.clicked.connect(self.cancel)
        self.btn_cancel.hide()
        self.writable = QCheckBox("Nur veränderbaren Speicher")
        self.writable.setChecked(True)
        self.writable.setToolTip("Spielwerte liegen fast immer in veränderbarem Speicher. Schneller.")
        self.aligned = QCheckBox("Schnell (ausgerichtet)")
        self.aligned.setChecked(True)
        self.aligned.setToolTip("Sucht nur an „glatten“ Adressen. Fast immer richtig und viel schneller.")
        card.body.addLayout(row(self.btn_first, self.btn_reset, self.btn_cancel, None, self.writable, self.aligned, spacing=10))
        self.progress = QProgressBar()
        self.progress.setRange(0, 1000)
        self.progress.setFixedHeight(8)
        self.progress.hide()
        card.body.addWidget(self.progress)
        lay.addWidget(card)

        self.count = label("Noch keine Suche", "h2")
        self.badge = Badge()
        self.hint = label("", "muted", wrap=True)
        lay.addLayout(row(self.count, self.badge, None))
        lay.addWidget(self.hint)

        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Adresse", "Aktueller Wert", "Vorheriger Wert"])
        self.table.verticalHeader().hide()
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        self.table.setShowGrid(False)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.horizontalHeader().setDefaultAlignment(Qt.AlignLeft)
        self.table.doubleClicked.connect(lambda _i: self.add_selected())
        self.table.setContextMenuPolicy(Qt.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self._menu)
        lay.addWidget(self.table, 1)

        self.btn_add = button("Zur Adress-Tabelle hinzufügen", "primary", "plus")
        self.btn_add.clicked.connect(self.add_selected)
        self.btn_struct = button("Umgebung ansehen", None, "struct", "Zeigt den Speicher rund um diese Adresse – so findest du ganze Objekte.")
        self.btn_struct.clicked.connect(self._struct_selected)
        lay.addLayout(row(label("Doppelklick auf einen Treffer = in die Tabelle übernehmen", "faint"), None, self.btn_struct, self.btn_add))

        self.live = QTimer(self)
        self.live.setInterval(400)
        self.live.timeout.connect(self._refresh_values)
        self._update_modes()

    # --- state ------------------------------------------------------------------
    @property
    def vt(self) -> V.ValueType:
        return V.get(self.vtype.currentData())

    def _update_modes(self) -> None:
        current = self.mode.currentData()
        self.mode.blockSignals(True)
        self.mode.clear()
        modes = S.FIRST_MODES if self.results is None else S.NEXT_MODES
        if self.vt.is_text:
            modes = [S.EXACT]
        for m in modes:
            self.mode.addItem(S.MODE_LABELS[m], m)
        idx = self.mode.findData(current)
        self.mode.setCurrentIndex(max(0, idx))
        self.mode.blockSignals(False)
        self._update_inputs()

    def _update_inputs(self) -> None:
        m = self.mode.currentData()
        self.f_value.setVisible(m in S.NEEDS_VALUE)
        self.f_value2.setVisible(m == S.BETWEEN)
        self.value.setPlaceholderText("von …" if m == S.BETWEEN else ("Text" if self.vt.is_text else "z. B. 100"))

    def on_attached(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.cancel()
        self.results = None
        self.vtype.setEnabled(True)
        self.btn_first.setText("Erste Suche")
        self.count.setText("Noch keine Suche")
        self.badge.set("")
        self.hint.setText("")
        self.table.setRowCount(0)
        self.shown = []
        self.live.stop()
        self._update_modes()

    # --- scanning -------------------------------------------------------------
    def scan(self) -> None:
        if self.worker is not None or self.s.proc is None:
            return
        settings = S.ScanSettings(self.vt, self.mode.currentData(), self.value.text(), self.value2.text(),
                                  self.writable.isChecked(), self.aligned.isChecked())
        try:
            if settings.mode in S.NEEDS_VALUE and not self.vt.is_text:
                V.parse_number(self.vt, settings.value)
                if settings.mode == S.BETWEEN:
                    V.parse_number(self.vt, settings.value2)
            if self.vt.is_text and not settings.value:
                raise ValueError("Bitte einen Text eingeben.")
        except ValueError as exc:
            self._error(f"Ungültiger Wert: {exc}" if "Bitte" not in str(exc) else str(exc))
            return
        sc = S.Scanner(self.s.proc)
        prev = self.results
        if prev is None:
            fn = lambda prog, cancel: sc.first_scan(settings, prog, cancel)  # noqa: E731
        else:
            fn = lambda prog, cancel: sc.next_scan(prev, settings, prog, cancel)  # noqa: E731
        self.worker = Worker(fn, self)
        self.worker.progressed.connect(lambda f: self.progress.setValue(int(f * 1000)))
        self.worker.done.connect(self._done)
        self.worker.failed.connect(self._failed)
        self.progress.setValue(0)
        self.progress.show()
        self.btn_cancel.show()
        self.btn_first.setEnabled(False)
        self.btn_reset.setEnabled(False)
        self.count.setText("Suche läuft …")
        self.badge.set("")
        self.worker.start()

    def cancel(self) -> None:
        if self.worker is not None:
            self.worker.cancel()

    def _finish_worker(self) -> None:
        if self.worker is not None:
            self.worker.wait()
            self.worker = None
        self.progress.hide()
        self.btn_cancel.hide()
        self.btn_first.setEnabled(True)
        self.btn_reset.setEnabled(True)

    def _failed(self, msg: str) -> None:
        self._finish_worker()
        self._error(f"Suche fehlgeschlagen: {msg}")

    def _error(self, msg: str) -> None:
        self.badge.set(msg, T.BAD)

    def _done(self, res: S.ScanResults) -> None:
        cancelled = self.worker is not None and self.worker.cancelled
        self._finish_worker()
        if cancelled:
            self.count.setText("Abgebrochen")
            if self.results is None:
                self.reset()
            return
        self.results = res
        self.vtype.setEnabled(False)
        self.btn_first.setText("Weiter eingrenzen")
        self._update_modes()
        n = res.count()
        self.count.setText(f"{n:,} Treffer".replace(",", "."))
        if n == 0:
            self.badge.set("Nichts gefunden", T.BAD)
            self.hint.setText("Tipp: Prüfe den Datentyp. Leben ist oft eine Kommazahl (float), Munition meist eine Ganzzahl. "
                              "Dann „Neu anfangen“.")
        elif n == 1:
            self.badge.set("Gefunden ✓", T.OK)
            self.hint.setText("Das ist die Adresse. Übernimm sie per Doppelklick in die Adress-Tabelle – "
                              "oder schau dir mit „Umgebung ansehen“ das ganze Objekt drumherum an.")
        elif n <= 10:
            self.badge.set("Fast geschafft", T.OK)
            self.hint.setText("Ändere den Wert im Spiel noch einmal und grenze weiter ein. Bleibt eine Adresse übrig, "
                              "übernimm sie per Doppelklick in die Tabelle.")
        else:
            self.badge.set("Weiter eingrenzen", T.WARN)
            self.hint.setText("Ändere jetzt den Wert im Spiel und suche dann mit dem neuen Wert "
                              "(oder „Größer geworden“ / „Kleiner geworden“).")
        if res.snapshot_bytes:
            self.hint.setText(self.hint.text() + f"  Schnappschuss: {S.human_bytes(res.snapshot_bytes)}.")
        self._fill()

    def _fill(self) -> None:
        self.table.setRowCount(0)
        self.shown = []
        if self.results is None:
            return
        n = self.results.count()
        if n > 100_000 and not self.results.vtype.is_text:
            self.live.stop()
            return  # far too many to show; the user narrows down first
        self.shown = self.results.first(SHOW_MAX)
        ps = self.s.pointer_size
        vt = self.results.vtype
        self.table.setRowCount(len(self.shown))
        for r, (addr, prev) in enumerate(self.shown):
            self.table.setItem(r, 0, item(fmt_addr(addr, ps), mono=True, color=T.ACCENT2))
            self.table.setItem(r, 1, item("…", mono=True))
            self.table.setItem(r, 2, item(V.format_value(vt, prev) if prev is not None else "–", mono=True, color=T.MUTED))
        self._refresh_values()
        self.live.start()

    def _refresh_values(self) -> None:
        if self.s.proc is None or self.results is None or not self.isVisible():
            return
        vt = self.results.vtype
        first = self.table.rowAt(0)
        last = self.table.rowAt(self.table.viewport().height() - 1)
        if first < 0:
            return
        if last < 0:
            last = len(self.shown) - 1
        for r in range(first, min(last + 1, len(self.shown))):
            addr, prev = self.shown[r]
            cur = V.decode(vt, self.s.proc.read(addr, vt.size))
            it = self.table.item(r, 1)
            if it is None:
                continue
            it.setText(V.format_value(vt, cur))
            changed = prev is not None and cur is not None and cur != prev
            it.setForeground(QColor(T.WARN if changed else T.TEXT))

    # --- actions ------------------------------------------------------------------
    def _selected_addresses(self) -> list[int]:
        rows = sorted({i.row() for i in self.table.selectedIndexes()})
        return [self.shown[r][0] for r in rows if r < len(self.shown)]

    def add_selected(self) -> None:
        if self.results is None:
            return
        for a in self._selected_addresses():
            self.add_to_watch.emit(a, self.results.vtype.key)

    def _struct_selected(self) -> None:
        sel = self._selected_addresses()
        if sel:
            self.open_struct.emit(sel[0])

    def _menu(self, pos) -> None:
        if not self._selected_addresses():
            return
        m = QMenu(self)
        m.addAction(T.icon("plus"), "Zur Adress-Tabelle hinzufügen", self.add_selected)
        m.addAction(T.icon("struct"), "Umgebung ansehen", self._struct_selected)
        m.exec(self.table.viewport().mapToGlobal(pos))
