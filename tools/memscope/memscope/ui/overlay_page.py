"""Page "Overlay": camera matrix, look of the outlines, start/stop."""

from __future__ import annotations

import numpy as np
from PySide6.QtCore import QRectF, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QLinearGradient, QPainter
from PySide6.QtWidgets import (
    QAbstractItemView,
    QButtonGroup,
    QCheckBox,
    QColorDialog,
    QComboBox,
    QDoubleSpinBox,
    QGridLayout,
    QHeaderView,
    QLineEdit,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QTableWidget,
    QVBoxLayout,
    QWidget,
)

from .. import projection as P
from ..address import AddressRef, fmt_addr, parse_offsets, static_expr
from ..session import Session
from . import theme as T
from .overlay_window import DrawItem, OverlayWindow, entity_points, paint_items
from .widgets import Badge, Card, Worker, button, field, header, item, label, page, restyle, row

STYLES = [("glow", "Leuchtend"), ("box", "Rahmen"), ("corners", "Ecken")]


class Preview(QWidget):
    """Shows what the outlines will look like."""

    def __init__(self, session: Session) -> None:
        super().__init__()
        self.s = session
        self.setMinimumSize(300, 230)

    def paintEvent(self, _ev) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        r = QRectF(self.rect()).adjusted(1, 1, -1, -1)
        g = QLinearGradient(0, 0, 0, r.height())
        g.setColorAt(0, QColor("#141a33"))
        g.setColorAt(0.55, QColor("#2a2150"))
        g.setColorAt(0.56, QColor("#1b2130"))
        g.setColorAt(1, QColor("#0f141f"))
        p.setPen(QColor(T.BORDER))
        p.setBrush(g)
        p.drawRoundedRect(r, 12, 12)
        style = self.s.profile.overlay if self.s.profile else None
        if style is None:
            return
        figs = [(0.32, 0.30, 0.52, "Hexe", 12, 0.8, True), (0.70, 0.43, 0.30, "Zombie", 27, 0.35, True),
                (0.88, 0.48, 0.2, "Schaf", 40, 1.0, False)]
        items = []
        for fx, top, hfrac, name, dist, hp, enemy in figs:
            h = r.height() * hfrac
            w = h * style.width_ratio
            cx = r.left() + r.width() * fx
            y = r.top() + r.height() * top
            # simple silhouette
            p.setPen(Qt.NoPen)
            p.setBrush(QColor("#8b5cf6") if name == "Hexe" else (QColor("#4d7c0f") if name == "Zombie" else QColor("#e5e7eb")))
            p.drawRoundedRect(QRectF(cx - w * 0.32, y + h * 0.26, w * 0.64, h * 0.74), w * 0.15, w * 0.15)
            p.drawEllipse(QRectF(cx - h * 0.12, y + h * 0.02, h * 0.24, h * 0.24))
            if enemy or style.show_others:
                items.append(DrawItem(QRectF(cx - w / 2, y, w, h), name, float(dist), hp, enemy))
        paint_items(p, items, style, r)
        p.end()


class OverlayPage(QWidget):
    status = Signal(str)

    def __init__(self, session: Session) -> None:
        super().__init__()
        self.s = session
        self.overlay = OverlayWindow(session)
        self.overlay.stats.connect(lambda t: self.live_stats.setText(t))
        self.worker: Worker | None = None
        self.cands: list[P.Candidate] = []
        self._loading = False
        self._pending = None
        self._countdown = 0

        w, lay = page()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(w)
        outer.addWidget(scroll)
        lay.addLayout(header(
            "Overlay",
            "Markiert Gegner mit Umrissen direkt im Sichtfeld – dauerhaft, solange das Overlay läuft. "
            "Dafür braucht MemScope die Kamera-Matrix des Spiels (16 Zahlen, die sagen, wohin du schaust).",
        ))

        # --- step 1: camera -------------------------------------------------------
        c1 = Card("Kamera-Matrix", step="Schritt 1")
        self.cam_badge = Badge()
        self.cam_info = label("", "muted")
        c1.body.addLayout(row(self.cam_badge, self.cam_info, None))
        self.cam_addr = QLineEdit()
        self.cam_addr.setProperty("mono", True)
        self.cam_addr.setPlaceholderText("Adresse der Matrix")
        self.cam_off = QLineEdit()
        self.cam_off.setProperty("mono", True)
        self.cam_off.setPlaceholderText("optional")
        self.cam_layout = QComboBox()
        for k, text in P.LAYOUT_LABELS.items():
            self.cam_layout.addItem(text, k)
        for wdg in (self.cam_addr, self.cam_off):
            wdg.editingFinished.connect(self._camera_edited)
        self.cam_layout.currentIndexChanged.connect(self._camera_edited)
        c1.body.addLayout(row(field("Adresse", self.cam_addr), field("Zeiger-Versätze", self.cam_off),
                              field("Anordnung", self.cam_layout), spacing=12))

        finder = QWidget()
        fl = QVBoxLayout(finder)
        fl.setContentsMargins(0, 6, 0, 0)
        fl.setSpacing(10)
        fl.addWidget(label("Automatisch finden", "h3"))
        how = label(
            "<b>1.</b> Wähle ein Bezugsobjekt und schau im Spiel <b>genau darauf</b> (Fadenkreuz in die Mitte des Objekts) → <b>Suchen</b>.<br>"
            "<b>2.</b> Dreh dich weg, sodass das Objekt nicht mehr in der Mitte ist → <b>Weggeschaut</b>.<br>"
            "<b>3.</b> Schau wieder genau drauf → <b>Wieder hingeschaut</b>. Wiederholen, bis 1–3 Kandidaten übrig sind.",
            "muted", wrap=True)
        how.setTextFormat(Qt.RichText)
        fl.addWidget(how)
        self.ref_obj = QComboBox()
        self.ref_obj.setMinimumWidth(260)
        ref_refresh = button("", "ghost", "refresh", "Liste aktualisieren")
        ref_refresh.clicked.connect(self._fill_refs)
        self.countdown = QCheckBox("5 Sekunden Zeit zum Zielen")
        self.countdown.setChecked(True)
        self.countdown.setToolTip("Nach dem Klick hast du 5 Sekunden, um ins Spiel zu wechseln und zu zielen.")
        fl.addLayout(row(field("Bezugsobjekt", self.ref_obj), ref_refresh, None, self.countdown, spacing=8))
        self.b_find = button("Suchen", "primary", "search")
        self.b_find.clicked.connect(lambda: self._step("find"))
        self.b_away = button("Weggeschaut", None)
        self.b_away.clicked.connect(lambda: self._step("away"))
        self.b_back = button("Wieder hingeschaut", None)
        self.b_back.clicked.connect(lambda: self._step("back"))
        self.cand_count = label("", "h3")
        fl.addLayout(row(self.b_find, self.b_away, self.b_back, None, self.cand_count))
        self.progress = QProgressBar()
        self.progress.setRange(0, 1000)
        self.progress.hide()
        fl.addWidget(self.progress)
        self.cand_table = QTableWidget(0, 3)
        self.cand_table.setHorizontalHeaderLabels(["Adresse", "Anordnung", "Bezugsobjekt auf dem Bildschirm"])
        self.cand_table.verticalHeader().hide()
        self.cand_table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.cand_table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.cand_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.cand_table.setMaximumHeight(170)
        self.cand_table.doubleClicked.connect(lambda _i: self._take())
        fl.addWidget(self.cand_table)
        take = button("Kandidat übernehmen", "primary", "check")
        take.clicked.connect(self._take)
        self.take_row = QWidget()
        self.take_row.setLayout(row(label("Doppelklick = übernehmen", "faint"), None, take))
        fl.addWidget(self.take_row)
        c1.body.addWidget(finder)
        lay.addWidget(c1)

        # --- step 2: look ---------------------------------------------------------
        c2 = Card("Aussehen", step="Schritt 2")
        look = QGridLayout()
        look.setHorizontalSpacing(18)
        opts = QVBoxLayout()
        opts.setSpacing(10)
        self.style_group = QButtonGroup(self)
        style_row = []
        for key, text in STYLES:
            b = QPushButton(text)
            b.setCheckable(True)
            b.setProperty("nav", True)
            b.setProperty("key", key)
            b.setCursor(Qt.PointingHandCursor)
            self.style_group.addButton(b)
            style_row.append(b)
        self.style_group.buttonClicked.connect(lambda _b: self._style_edited())
        opts.addLayout(field("Umriss", _wrap(row(*style_row, None, spacing=4))))
        self.c_enemy = QPushButton()
        self.c_enemy.clicked.connect(lambda: self._pick_color("enemy_color"))
        self.c_other = QPushButton()
        self.c_other.clicked.connect(lambda: self._pick_color("other_color"))
        self.thick = QDoubleSpinBox()
        self.thick.setRange(0.5, 8)
        self.thick.setSingleStep(0.5)
        self.thick.valueChanged.connect(self._style_edited)
        self.ratio = QDoubleSpinBox()
        self.ratio.setRange(0.1, 3)
        self.ratio.setSingleStep(0.05)
        self.ratio.valueChanged.connect(self._style_edited)
        self.maxdist = QDoubleSpinBox()
        self.maxdist.setRange(0, 1e6)
        self.maxdist.setDecimals(0)
        self.maxdist.setSpecialValueText("unbegrenzt")
        self.maxdist.valueChanged.connect(self._style_edited)
        opts.addLayout(row(field("Farbe Gegner", self.c_enemy), field("Farbe andere", self.c_other),
                           field("Linienstärke", self.thick), field("Breite / Höhe", self.ratio),
                           field("Max. Entfernung", self.maxdist), spacing=10))
        self.checks: dict[str, QCheckBox] = {}
        grid = QGridLayout()
        grid.setVerticalSpacing(8)
        for i, (key, text) in enumerate([
            ("show_names", "Namen anzeigen"), ("show_distance", "Entfernung anzeigen"),
            ("show_health", "Lebensbalken"), ("show_lines", "Linien zum Ziel"),
            ("show_others", "Auch Nicht-Gegner zeigen"), ("show_status", "Status oben links"),
            ("only_foreground", "Nur wenn das Spiel aktiv ist"),
        ]):
            cb = QCheckBox(text)
            cb.toggled.connect(self._style_edited)
            self.checks[key] = cb
            grid.addWidget(cb, i // 2, i % 2)
        opts.addLayout(grid)
        opts.addStretch(1)
        look.addLayout(opts, 0, 0)
        self.preview = Preview(session)
        look.addWidget(self.preview, 0, 1)
        look.setColumnStretch(0, 3)
        look.setColumnStretch(1, 2)
        c2.body.addLayout(look)
        lay.addWidget(c2)

        # --- step 3: start ----------------------------------------------------------
        c3 = Card("Overlay starten", step="Schritt 3")
        self.toggle = button("Overlay starten", "go", "play")
        self.toggle.setMinimumWidth(220)
        self.toggle.clicked.connect(self.toggle_overlay)
        self.live_stats = label("", "muted")
        tip = label("F8 blendet das Overlay im Spiel ein/aus (Windows). Stelle das Spiel auf „Fenster“ oder "
                    "„Randloses Vollbild“ – im exklusiven Vollbild kann kein Programm darüber zeichnen.", "faint", wrap=True)
        right = QVBoxLayout()
        right.addWidget(self.live_stats)
        right.addWidget(tip)
        c3.body.addLayout(row(self.toggle, right, spacing=18))
        lay.addWidget(c3)
        lay.addStretch(1)

        self.cam_timer = QTimer(self)
        self.cam_timer.setInterval(300)
        self.cam_timer.timeout.connect(self._camera_status)
        self.cam_timer.start()
        self.count_timer = QTimer(self)
        self.count_timer.setInterval(1000)
        self.count_timer.timeout.connect(self._tick_countdown)
        self._refresh_buttons()
        self._fill_cands()

    # --- load / save ----------------------------------------------------------------
    def on_attached(self) -> None:
        self.stop_overlay()
        self.cands = []
        self._fill_cands()
        self.load()
        self._fill_refs()

    def on_detached(self) -> None:
        self.stop_overlay()

    def load(self) -> None:
        prof = self.s.profile
        if prof is None:
            return
        self._loading = True
        cam = prof.camera
        self.cam_addr.setText(cam.ref.base)
        self.cam_off.setText(", ".join(cam.ref.offsets))
        self.cam_layout.setCurrentIndex(max(0, self.cam_layout.findData(cam.layout)))
        st = prof.overlay
        for b in self.style_group.buttons():
            b.setChecked(b.property("key") == st.style)
        self.thick.setValue(st.thickness)
        self.ratio.setValue(st.width_ratio)
        self.maxdist.setValue(st.max_distance)
        for key, cb in self.checks.items():
            cb.setChecked(bool(getattr(st, key)))
        self._color_buttons()
        self._loading = False
        self.preview.update()

    def _camera_edited(self) -> None:
        if self._loading or self.s.profile is None:
            return
        try:
            offsets = parse_offsets(self.cam_off.text())
        except ValueError:
            offsets = []
        self.s.profile.camera.ref = AddressRef(self.cam_addr.text().strip(), offsets)
        self.s.profile.camera.layout = self.cam_layout.currentData()
        self.s.camera_edited()

    def _style_edited(self) -> None:
        if self._loading or self.s.profile is None:
            return
        st = self.s.profile.overlay
        b = self.style_group.checkedButton()
        if b is not None:
            st.style = b.property("key")
        st.thickness = self.thick.value()
        st.width_ratio = self.ratio.value()
        st.max_distance = self.maxdist.value()
        for key, cb in self.checks.items():
            setattr(st, key, cb.isChecked())
        self.s.changed()
        self.preview.update()

    def _color_buttons(self) -> None:
        st = self.s.profile.overlay
        for btn, col in ((self.c_enemy, st.enemy_color), (self.c_other, st.other_color)):
            btn.setText(col.upper())
            btn.setStyleSheet(f"QPushButton {{ background: {col}; color: #0b0d12; border: none; font-weight: 700; }}")

    def _pick_color(self, key: str) -> None:
        st = self.s.profile.overlay
        c = QColorDialog.getColor(QColor(getattr(st, key)), self, "Farbe wählen")
        if c.isValid():
            setattr(st, key, c.name())
            self._color_buttons()
            self.s.changed()
            self.preview.update()

    # --- camera status ------------------------------------------------------------------
    def _camera_status(self) -> None:
        if self.s.proc is None or not self.isVisible():
            return
        m = self.s.matrix()
        if m is None:
            self.cam_badge.set("Matrix fehlt", T.WARN)
            self.cam_info.setText("Noch keine gültige Kamera-Matrix. Nutze „Automatisch finden“ unten.")
            return
        cam = P.camera_position(m, self.s.profile.camera.layout)
        self.cam_badge.set("Matrix gefunden ✓", T.OK)
        self.cam_info.setText("Kamera bei " + (" / ".join(f"{v:.1f}" for v in cam) if cam is not None else "?"))
        self._update_cand_screen()

    # --- finder -------------------------------------------------------------------------
    def _fill_refs(self) -> None:
        cur = self.ref_obj.currentData()
        self.ref_obj.clear()
        ents = [e for e in self.s.read_entities(with_distance=False) if e.valid] if self.s.proc else []
        for e in ents[:200]:
            self.ref_obj.addItem(f"{e.title}  ·  {e.pos[0]:.1f} / {e.pos[1]:.1f} / {e.pos[2]:.1f}", e.key)
        if not ents:
            self.ref_obj.addItem("Erst unter „Objekte & Gegner“ Objekte einrichten", None)
        idx = self.ref_obj.findData(cur)
        self.ref_obj.setCurrentIndex(max(0, idx))
        self._refresh_buttons()

    def _target(self):
        key = self.ref_obj.currentData()
        if key is None or self.s.profile is None:
            return None
        lay = self.s.profile.entities.layout
        for e in self.s.read_entities(with_distance=False):
            if e.key == tuple(key) and e.valid:
                feet, head = entity_points(e, lay)
                return (np.array(feet) + np.array(head)) / 2  # aim at the middle of the body
        return None

    def _refresh_buttons(self) -> None:
        busy = self.worker is not None or self._countdown > 0
        has_ref = self.ref_obj.currentData() is not None
        self.b_find.setEnabled(not busy and has_ref)
        self.b_away.setEnabled(not busy and bool(self.cands))
        self.b_back.setEnabled(not busy and bool(self.cands))

    def _step(self, what: str) -> None:
        if self.countdown.isChecked():
            self._pending = what
            self._countdown = 5
            self._tick_countdown(first=True)
            self.count_timer.start()
        else:
            self._run_step(what)

    def _tick_countdown(self, first: bool = False) -> None:
        if not first:
            self._countdown -= 1
        btn = {"find": self.b_find, "away": self.b_away, "back": self.b_back}[self._pending]
        if self._countdown <= 0:
            self.count_timer.stop()
            for b, t in ((self.b_find, "Suchen"), (self.b_away, "Weggeschaut"), (self.b_back, "Wieder hingeschaut")):
                b.setText(t)
            self._run_step(self._pending)
            return
        btn.setText(f"in {self._countdown} …")
        self._refresh_buttons()

    def _run_step(self, what: str) -> None:
        target = self._target()
        if target is None:
            self.cand_count.setText("Bezugsobjekt nicht lesbar")
            self._refresh_buttons()
            return
        proc = self.s.proc
        if what == "find":
            self.worker = Worker(lambda prog, cancel: P.find_matrix(proc, target, prog, cancel), self)
            self.worker.progressed.connect(lambda f: self.progress.setValue(int(f * 1000)))
            self.worker.done.connect(self._found)
            self.worker.failed.connect(lambda m: self._found([]))
            self.progress.show()
            self.cand_count.setText("Suche läuft …")
            self.worker.start()
        else:
            self.cands = P.refine(proc, self.cands, target, want_center=(what == "back"))
            self._fill_cands()
        self._refresh_buttons()

    def _found(self, cands) -> None:
        if self.worker:
            self.worker.wait()
            self.worker = None
        self.progress.hide()
        self.cands = cands
        self._fill_cands()
        self._refresh_buttons()

    def _fill_cands(self) -> None:
        n = len(self.cands)
        self.cand_table.setVisible(n > 0)
        self.take_row.setVisible(n > 0)
        self.cand_count.setText("" if not n else f"{n} Kandidat{'en' if n != 1 else ''}")
        shown = self.cands[:200]
        self.cand_table.setRowCount(len(shown))
        ps = self.s.pointer_size
        for r, c in enumerate(shown):
            self.cand_table.setItem(r, 0, item(fmt_addr(c.address, ps), mono=True, color=T.ACCENT2))
            self.cand_table.setItem(r, 1, item("zeilenweise" if c.layout == P.ROW else "spaltenweise", color=T.MUTED))
            self.cand_table.setItem(r, 2, item("…", mono=True))
        if 0 < n <= 3:
            self.cand_count.setText(self.cand_count.text() + " – übernimm den ersten")
        self._update_cand_screen()

    def _update_cand_screen(self) -> None:
        if not self.cands or self.s.proc is None:
            return
        target = self._target()
        for r, c in enumerate(self.cands[: self.cand_table.rowCount()]):
            it = self.cand_table.item(r, 2)
            m = P.read_matrix(self.s.proc, c.address)
            if it is None or m is None or target is None:
                continue
            res = P.world_to_screen(m, c.layout, target, 1.0, 1.0)
            if res is None:
                it.setText("hinter der Kamera")
            else:
                x, y, _w = res
                it.setText(f"{x * 100:.0f} % von links, {y * 100:.0f} % von oben")

    def _take(self) -> None:
        r = self.cand_table.currentRow()
        if r < 0 and self.cands:
            r = 0
        if r < 0 or r >= len(self.cands) or self.s.profile is None:
            return
        c = self.cands[r]
        self.s.profile.camera.ref = AddressRef(static_expr(self.s.proc, c.address))
        self.s.profile.camera.layout = c.layout
        self.s.camera_edited()
        self.load()
        self.status.emit("Kamera-Matrix übernommen. Jetzt das Overlay starten!")

    # --- overlay ---------------------------------------------------------------------------
    def toggle_overlay(self) -> None:
        if self.overlay.isVisible():
            self.stop_overlay()
        else:
            self.overlay.start()
            self.toggle.setText("Overlay stoppen")
            self.toggle.setProperty("kind", "stop")
            self.toggle.setIcon(T.icon("stop", "white"))
            restyle(self.toggle)

    def stop_overlay(self) -> None:
        self.overlay.stop()
        self.toggle.setText("Overlay starten")
        self.toggle.setProperty("kind", "go")
        self.toggle.setIcon(T.icon("play", "#04130d"))
        restyle(self.toggle)
        self.live_stats.setText("")


def _wrap(layout) -> QWidget:
    w = QWidget()
    layout.setContentsMargins(0, 0, 0, 0)
    w.setLayout(layout)
    return w
