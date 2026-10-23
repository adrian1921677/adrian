"""Page "Objekte & Gegner": where entities are, what they look like, which are enemies."""

from __future__ import annotations

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QDialog,
    QDoubleSpinBox,
    QFileDialog,
    QGridLayout,
    QHeaderView,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QScrollArea,
    QSpinBox,
    QSplitter,
    QTableWidget,
    QVBoxLayout,
    QWidget,
)

from ..address import AddressRef, fmt_addr, parse_hex, parse_offsets, static_expr
from ..entities import (
    ARRAY,
    ENEMY_ALL,
    ENEMY_LABELS,
    ENEMY_RULES,
    KIND_LABELS,
    NAME_KINDS,
    POINTERS,
    SIGNATURE,
    SINGLE,
    EntityConfig,
    EntityReader,
    Source,
    build_report,
    scan_signature,
    signature_from_object,
)
from ..profile import export_csv
from ..session import Session
from . import theme as T
from .widgets import Badge, Card, Worker, button, field, header, item, label, page, row

KIND_HELP = {
    SIGNATURE: "Findet automatisch alle Objekte derselben Art. Jedes Objekt beginnt mit einem Zeiger auf seine "
               "„Klasse“ – alle Hexen haben denselben. Tipp: Erst ein einzelnes Objekt einrichten, dann "
               "„Alle dieser Art finden“ drücken.",
    ARRAY: "Die Objekte liegen direkt hintereinander im Speicher: Anfang, Anfang + Abstand, Anfang + 2 × Abstand …",
    POINTERS: "Im Speicher liegt eine Liste von Adressen. Jede zeigt auf ein Objekt.",
    SINGLE: "Genau ein Objekt an einer festen Adresse (oder über eine Zeigerkette).",
}


class SourceDialog(QDialog):
    def __init__(self, session: Session, src: Source | None, parent=None) -> None:
        super().__init__(parent)
        self.s = session
        src = src or Source()
        self.setWindowTitle("Objekt-Quelle")
        self.setMinimumWidth(560)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(24, 22, 24, 22)
        lay.setSpacing(12)
        lay.addWidget(label("Woher kommen die Objekte?", "h2"))
        self.name = QLineEdit(src.label)
        self.name.setPlaceholderText("z. B. Hexen")
        self.kind = QComboBox()
        for k, text in KIND_LABELS.items():
            self.kind.addItem(text, k)
        self.kind.setCurrentIndex(max(0, self.kind.findData(src.kind)))
        self.help = label("", "muted", wrap=True)
        lay.addLayout(row(field("Name", self.name), field("Art", self.kind), spacing=12))
        lay.addWidget(self.help)

        self.base = QLineEdit(src.ref.base)
        self.base.setProperty("mono", True)
        self.base.setPlaceholderText("Adresse, z. B. 1A2B3C40 oder spiel.exe+1F00")
        self.offsets = QLineEdit(", ".join(src.ref.offsets))
        self.offsets.setProperty("mono", True)
        self.offsets.setPlaceholderText("optional, z. B. 10, 8")
        self.stride = QLineEdit(src.stride)
        self.stride.setProperty("mono", True)
        self.count = QSpinBox()
        self.count.setRange(1, 16384)
        self.count.setValue(int(src.count))
        self.sig_value = QLineEdit(src.sig_value)
        self.sig_value.setProperty("mono", True)
        self.sig_value.setPlaceholderText("z. B. spiel.exe+2A4F10")
        self.sig_offset = QLineEdit(src.sig_offset)
        self.sig_offset.setProperty("mono", True)
        self.sig_size = QComboBox()
        self.sig_size.addItem("8 Byte (64-Bit)", 8)
        self.sig_size.addItem("4 Byte (32-Bit / Java)", 4)
        self.sig_size.setCurrentIndex(0 if int(src.sig_size) == 8 else 1)
        self.from_obj = QLineEdit()
        self.from_obj.setProperty("mono", True)
        self.from_obj.setPlaceholderText("Adresse eines bekannten Objekts")
        take = button("Übernehmen", None, "wand")
        take.clicked.connect(self._take_signature)

        self.w_addr = QWidget()
        la = QVBoxLayout(self.w_addr)
        la.setContentsMargins(0, 0, 0, 0)
        la.addLayout(row(field("Adresse", self.base), field("Zeiger-Versätze", self.offsets), spacing=12))
        self.w_list = QWidget()
        ll = QVBoxLayout(self.w_list)
        ll.setContentsMargins(0, 0, 0, 0)
        self.f_stride = QWidget()
        fs = QVBoxLayout(self.f_stride)
        fs.setContentsMargins(0, 0, 0, 0)
        fs.addLayout(field("Abstand zwischen Objekten (hex)", self.stride))
        ll.addLayout(row(self.f_stride, field("Anzahl Plätze", self.count), spacing=12))
        self.w_sig = QWidget()
        ls = QVBoxLayout(self.w_sig)
        ls.setContentsMargins(0, 0, 0, 0)
        ls.addLayout(row(field("Signatur (Klassen-Zeiger)", self.sig_value), field("Liegt bei Versatz", self.sig_offset),
                         field("Größe", self.sig_size), spacing=12))
        ls.addLayout(row(field("…oder von einem Objekt ablesen", self.from_obj), take, spacing=8))
        for wdg in (self.w_addr, self.w_list, self.w_sig):
            lay.addWidget(wdg)

        self.enemy = QComboBox()
        for k, text in ENEMY_LABELS.items():
            self.enemy.addItem(text, k)
        self.enemy.setCurrentIndex(max(0, self.enemy.findData(src.enemy)))
        lay.addLayout(field("Gegner?", self.enemy, "„Nur wenn Name/Typ passt“ nutzt die Regeln unter „Was ist ein Gegner?“."))

        self.preview = label("", "muted", wrap=True)
        test = button("Vorschau", None, "search")
        test.clicked.connect(self._preview)
        lay.addLayout(row(self.preview, None, test))
        ok = button("Speichern", "primary", "check")
        ok.clicked.connect(self.accept)
        cancel = button("Abbrechen", "ghost")
        cancel.clicked.connect(self.reject)
        lay.addLayout(row(None, cancel, ok))
        self.kind.currentIndexChanged.connect(self._kind_changed)
        self._kind_changed()
        self.worker: Worker | None = None

    def _kind_changed(self) -> None:
        k = self.kind.currentData()
        self.help.setText(KIND_HELP[k])
        self.w_addr.setVisible(k != SIGNATURE)
        self.w_list.setVisible(k in (ARRAY, POINTERS))
        self.f_stride.setVisible(k == ARRAY)
        self.w_sig.setVisible(k == SIGNATURE)
        self.adjustSize()

    def _take_signature(self) -> None:
        if self.s.proc is None:
            return
        try:
            base = parse_hex(self.from_obj.text())
            off = parse_hex(self.sig_offset.text() or "0")
        except ValueError:
            self.preview.setText("Objekt-Adresse ungültig.")
            return
        sig = signature_from_object(self.s.proc, base, off, self.sig_size.currentData())
        if sig is None:
            self.preview.setText("Dort steht kein brauchbarer Wert.")
            return
        self.sig_value.setText(sig)
        self.preview.setText(f"Signatur übernommen: {sig}")

    def source(self) -> Source:
        try:
            offsets = parse_offsets(self.offsets.text())
        except ValueError:
            offsets = []
        return Source(
            kind=self.kind.currentData(),
            label=self.name.text().strip() or "Objekte",
            ref=AddressRef(self.base.text().strip(), offsets),
            stride=self.stride.text().strip() or "100",
            count=self.count.value(),
            sig_offset=self.sig_offset.text().strip() or "0",
            sig_size=self.sig_size.currentData(),
            sig_value=self.sig_value.text().strip(),
            enemy=self.enemy.currentData(),
        )

    def _preview(self) -> None:
        if self.s.proc is None or self.s.profile is None or self.worker is not None:
            return
        src = self.source()
        cfg = EntityConfig(self.s.profile.entities.layout, [], self.s.profile.entities.enemy_words, self.s.profile.entities.enemy_ids)
        proc = self.s.proc

        def run(_prog, cancel):
            if src.kind == SIGNATURE:
                hits = scan_signature(proc, src, cancel)
                return EntityReader(proc, EntityConfig(cfg.layout, [], cfg.enemy_words, cfg.enemy_ids)).read_at(hits, src)
            reader = EntityReader(proc, EntityConfig(cfg.layout, [src], cfg.enemy_words, cfg.enemy_ids))
            return reader.read()

        self.preview.setText("Suche …")
        self.worker = Worker(run, self)
        self.worker.done.connect(self._preview_done)
        self.worker.failed.connect(lambda m: self._preview_done(None, m))
        self.worker.start()

    def _preview_done(self, ents, err: str = "") -> None:
        if self.worker:
            self.worker.wait()
            self.worker = None
        if ents is None:
            self.preview.setText(f"Fehler: {err}")
            return
        valid = [e for e in ents if e.valid]
        enemies = sum(1 for e in valid if e.enemy)
        self.preview.setText(f"{len(ents)} Plätze gelesen · {len(valid)} sehen wie echte Objekte aus · {enemies} Gegner")
        self.preview.setStyleSheet(f"color: {T.OK if valid else T.WARN};")

    def done(self, r: int) -> None:
        if self.worker:
            self.worker.cancel()
            self.worker.wait()
            self.worker = None
        super().done(r)


class EntityPage(QWidget):
    status = Signal(str)

    def __init__(self, session: Session) -> None:
        super().__init__()
        self.s = session
        self.object_base: int | None = None
        self._loading = False
        self._samples: list = []
        self.rows_cache: list = []

        w, lay = page()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(w)
        lay.addLayout(header(
            "Objekte & Gegner",
            "Hier sagst du MemScope, wo die Objekte (z. B. Hexen, Zombies) im Speicher liegen und wie sie aufgebaut sind. "
            "Danach werden sie dauerhaft ausgelesen und geprüft.",
        ))
        split = QSplitter(Qt.Horizontal)
        split.setChildrenCollapsible(False)
        lay.addWidget(split, 1)

        # --- left: configuration ----------------------------------------------
        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 10, 0)
        ll.setSpacing(14)

        c1 = Card("Woher kommen die Objekte?", step="Schritt 1")
        self.sources = QListWidget()
        self.sources.setMinimumHeight(84)
        self.sources.setMaximumHeight(130)
        self.sources.itemDoubleClicked.connect(lambda _i: self.edit_source())
        self.sources.currentRowChanged.connect(self._source_selected)
        c1.body.addWidget(self.sources)
        add = button("Hinzufügen", None, "plus")
        add.clicked.connect(self.add_source)
        edit = button("Bearbeiten", "ghost", "edit")
        edit.clicked.connect(self.edit_source)
        rem = button("", "ghost", "trash", "Entfernen")
        rem.clicked.connect(self.remove_source)
        c1.body.addLayout(row(add, edit, rem, None))
        self.find_all = button("Alle dieser Art finden", "primary", "wand",
                               "Sucht automatisch alle Objekte derselben Klasse wie das gewählte Objekt")
        self.find_all.clicked.connect(self.find_similar)
        self.find_all.setEnabled(False)
        c1.body.addWidget(self.find_all)
        ll.addWidget(c1)

        c2 = Card("Aufbau eines Objekts", "Versätze in Hex, gemessen vom Anfang des Objekts. "
                  "Am einfachsten per Rechtsklick in „Umgebung ansehen“.", step="Schritt 2")
        g = QGridLayout()
        g.setHorizontalSpacing(10)
        g.setVerticalSpacing(8)
        self.f: dict[str, QLineEdit] = {}

        def off_edit(key: str, ph: str = "") -> QLineEdit:
            e = QLineEdit()
            e.setProperty("mono", True)
            e.setPlaceholderText(ph)
            e.editingFinished.connect(self._layout_edited)
            self.f[key] = e
            return e

        self.pos_type = QComboBox()
        self.pos_type.addItem("float", "float")
        self.pos_type.addItem("double", "double")
        self.hp_type = QComboBox()
        for k in ("float", "int32", "double"):
            self.hp_type.addItem(k, k)
        self.name_kind = QComboBox()
        for k, text in NAME_KINDS.items():
            self.name_kind.addItem(text, k)
        self.up_axis = QComboBox()
        self.up_axis.addItem("Y zeigt nach oben", "y")
        self.up_axis.addItem("Z zeigt nach oben", "z")
        self.anchor = QComboBox()
        self.anchor.addItem("an den Füßen", "feet")
        self.anchor.addItem("in der Mitte", "center")
        self.height = QDoubleSpinBox()
        self.height.setRange(0.01, 100000)
        self.height.setDecimals(2)
        self.height.setSingleStep(0.1)
        self.height.editingFinished.connect(self._layout_edited)
        for combo in (self.pos_type, self.hp_type, self.name_kind, self.up_axis, self.anchor):
            combo.currentIndexChanged.connect(self._layout_edited)

        g.addLayout(field("X", off_edit("pos_x", "z. B. 20")), 0, 0)
        g.addLayout(field("Y", off_edit("pos_y")), 0, 1)
        g.addLayout(field("Z", off_edit("pos_z")), 0, 2)
        g.addLayout(field("Zahlentyp", self.pos_type), 0, 3)
        g.addLayout(field("Leben", off_edit("health", "optional")), 1, 0)
        g.addLayout(field("Max. Leben", off_edit("max_health", "optional")), 1, 1)
        g.addLayout(field("Typ-Nr.", off_edit("type_id", "optional")), 1, 2)
        g.addLayout(field("Zahlentyp", self.hp_type), 1, 3)
        g.addLayout(field("Name", off_edit("name", "optional")), 2, 0)
        name_f = field("Name ist …", self.name_kind)
        g.addLayout(name_f, 2, 1, 1, 3)
        g.addLayout(field("Oben ist …", self.up_axis), 3, 0, 1, 2)
        g.addLayout(field("Position liegt …", self.anchor), 3, 2)
        g.addLayout(field("Höhe", self.height), 3, 3)
        c2.body.addLayout(g)
        ll.addWidget(c2)

        c3 = Card("Was ist ein Gegner?", "Gilt für Quellen mit „Nur wenn Name/Typ passt“.", step="Schritt 3")
        self.words = QLineEdit()
        self.words.setPlaceholderText("Namen, z. B. hexe, witch, zombie")
        self.words.editingFinished.connect(self._layout_edited)
        self.ids = QLineEdit()
        self.ids.setPlaceholderText("Typ-Nummern, z. B. 45, 54")
        self.ids.editingFinished.connect(self._layout_edited)
        c3.body.addLayout(field("Name enthält eines dieser Wörter", self.words))
        c3.body.addLayout(field("…oder Typ-Nummer ist eine von", self.ids))
        ll.addWidget(c3)
        ll.addStretch(1)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll.setWidget(left)
        scroll.setMinimumWidth(460)
        split.addWidget(scroll)

        # --- right: live table ---------------------------------------------------
        right = QWidget()
        rl = QVBoxLayout(right)
        rl.setContentsMargins(10, 0, 0, 0)
        rl.setSpacing(12)
        self.summary = label("Live-Tabelle", "h2")
        self.b_valid = Badge()
        self.b_enemy = Badge()
        self.test_btn = button("Prüfen", "primary", "check", "Liest 2 Sekunden lang mehrmals und prüft, ob es echte Objekte sind")
        self.test_btn.clicked.connect(self.run_test)
        csv_btn = button("", "ghost", "save", "Als CSV speichern")
        csv_btn.clicked.connect(self._csv)
        rl.addLayout(row(self.summary, self.b_valid, self.b_enemy, None, self.test_btn, csv_btn))
        self.result = Card()
        self.result_text = label("", None, wrap=True)
        self.result_text.setTextFormat(Qt.RichText)
        self.result.body.addWidget(self.result_text)
        self.result.hide()
        rl.addWidget(self.result)
        self.only_valid = QComboBox()
        self.only_valid.addItem("Nur gültige Objekte", "valid")
        self.only_valid.addItem("Nur Gegner", "enemy")
        self.only_valid.addItem("Alle Plätze", "all")
        rl.addLayout(row(label("Anzeigen:", "faint"), self.only_valid, None))
        self.table = QTableWidget(0, 9)
        self.table.setHorizontalHeaderLabels(["Name", "Quelle", "X", "Y", "Z", "Leben", "Entfernung", "Status", "Adresse"])
        self.table.verticalHeader().hide()
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setShowGrid(False)
        self.table.setAlternatingRowColors(True)
        hh = self.table.horizontalHeader()
        hh.setSectionResizeMode(QHeaderView.ResizeToContents)
        hh.setStretchLastSection(True)
        hh.setDefaultAlignment(Qt.AlignLeft)
        rl.addWidget(self.table, 1)
        split.addWidget(right)
        split.setStretchFactor(0, 0)
        split.setStretchFactor(1, 1)
        split.setSizes([460, 900])

        self.live = QTimer(self)
        self.live.setInterval(250)
        self.live.timeout.connect(self.refresh)
        self.live.start()
        self.sampler = QTimer(self)
        self.sampler.setInterval(250)
        self.sampler.timeout.connect(self._sample)

    # --- config <-> widgets -----------------------------------------------------------
    @property
    def cfg(self) -> EntityConfig | None:
        return self.s.profile.entities if self.s.profile else None

    def on_attached(self) -> None:
        self.object_base = None
        self.result.hide()
        self.load()

    def load(self) -> None:
        cfg = self.cfg
        if cfg is None:
            return
        self._loading = True
        lay = cfg.layout
        for key, e in self.f.items():
            e.setText(getattr(lay, key))
        self.pos_type.setCurrentIndex(max(0, self.pos_type.findData(lay.pos_type)))
        self.hp_type.setCurrentIndex(max(0, self.hp_type.findData(lay.health_type)))
        self.name_kind.setCurrentIndex(max(0, self.name_kind.findData(lay.name_kind)))
        self.up_axis.setCurrentIndex(max(0, self.up_axis.findData(lay.up_axis)))
        self.anchor.setCurrentIndex(max(0, self.anchor.findData(lay.anchor)))
        self.height.setValue(float(lay.height))
        self.words.setText(", ".join(cfg.enemy_words))
        self.ids.setText(", ".join(str(i) for i in cfg.enemy_ids))
        self._loading = False
        self._fill_sources()

    def _layout_edited(self) -> None:
        cfg = self.cfg
        if cfg is None or self._loading:
            return
        lay = cfg.layout
        for key, e in self.f.items():
            text = e.text().strip()
            try:
                if text:
                    parse_hex(text)
            except ValueError:
                e.setStyleSheet(f"border-color: {T.BAD};")
                continue
            e.setStyleSheet("")
            setattr(lay, key, text)
        lay.pos_type = self.pos_type.currentData()
        lay.health_type = self.hp_type.currentData()
        lay.name_kind = self.name_kind.currentData()
        lay.up_axis = self.up_axis.currentData()
        lay.anchor = self.anchor.currentData()
        lay.height = self.height.value()
        cfg.enemy_words = [w.strip() for w in self.words.text().split(",") if w.strip()]
        ids = []
        for part in self.ids.text().replace(";", ",").split(","):
            try:
                ids.append(int(part.strip(), 0))
            except ValueError:
                pass
        cfg.enemy_ids = ids
        self.s.entities_edited()

    def _fill_sources(self) -> None:
        cur = self.sources.currentRow()
        self.sources.clear()
        if not self.cfg:
            return
        for i, s in enumerate(self.cfg.sources):
            it = QListWidgetItem(T.icon("target", T.BAD if s.enemy != "none" else T.ACCENT2), self._source_text(i, s))
            self.sources.addItem(it)
        if self.cfg.sources:
            self.sources.setCurrentRow(min(max(cur, 0), len(self.cfg.sources) - 1))

    def _source_text(self, i: int, s: Source) -> str:
        enemy = {ENEMY_ALL: "Gegner", ENEMY_RULES: "Regeln", "none": "keine Gegner"}[s.enemy]
        text = f"  {s.label}   ·   {KIND_LABELS[s.kind]}   ·   {enemy}"
        status = self.s.reader.signature_status(i) if self.s.reader else ""
        return f"{text}   ·   {status}" if status else text

    def _source_selected(self, r: int) -> None:
        ok = self.cfg is not None and 0 <= r < len(self.cfg.sources) and self.cfg.sources[r].kind == SINGLE
        self.find_all.setEnabled(ok)

    def add_source(self) -> None:
        if not self.cfg:
            return
        dlg = SourceDialog(self.s, None, self)
        if dlg.exec():
            self.cfg.sources.append(dlg.source())
            self.s.entities_edited()
            self._fill_sources()
            self.sources.setCurrentRow(len(self.cfg.sources) - 1)

    def edit_source(self) -> None:
        r = self.sources.currentRow()
        if not self.cfg or r < 0:
            return
        dlg = SourceDialog(self.s, self.cfg.sources[r], self)
        if dlg.exec():
            self.cfg.sources[r] = dlg.source()
            self.s.entities_edited()
            self._fill_sources()

    def remove_source(self) -> None:
        r = self.sources.currentRow()
        if not self.cfg or r < 0:
            return
        del self.cfg.sources[r]
        self.s.entities_edited()
        self._fill_sources()

    # --- shortcuts from the struct view ---------------------------------------------
    def _ensure_single(self, base: int) -> None:
        cfg = self.cfg
        expr = static_expr(self.s.proc, base)
        for s in cfg.sources:
            if s.kind == SINGLE and s.label == "Mein Objekt":
                s.ref = AddressRef(expr)
                return
        cfg.sources.insert(0, Source(kind=SINGLE, label="Mein Objekt", ref=AddressRef(expr)))

    def use_base(self, base: int) -> None:
        if not self.cfg or self.s.proc is None:
            return
        self.object_base = base
        self._ensure_single(base)
        self.s.entities_edited()
        self._fill_sources()
        self.status.emit(f"Objekt-Anfang gesetzt: {fmt_addr(base, self.s.pointer_size)}")

    def use_field(self, key: str, view_base: int, off: int) -> None:
        if not self.cfg or self.s.proc is None:
            return
        absolute = view_base + off
        if self.object_base is None or absolute < self.object_base:
            self.object_base = view_base
            self._ensure_single(view_base)
        rel = absolute - self.object_base
        setattr(self.cfg.layout, key, f"{rel:X}")
        if key == "pos_x":
            # Y and Z usually follow X directly; fill them in if still unset.
            step = 8 if self.cfg.layout.pos_type == "double" else 4
            lay = self.cfg.layout
            if lay.pos_y in ("", "4") and lay.pos_z in ("", "8"):
                lay.pos_y, lay.pos_z = f"{rel + step:X}", f"{rel + 2 * step:X}"
        self.load()
        self.s.entities_edited()
        self.status.emit(f"{key} = +{rel:X} (vom Objekt-Anfang {fmt_addr(self.object_base, self.s.pointer_size)})")

    def find_similar(self) -> None:
        r = self.sources.currentRow()
        cfg = self.cfg
        if not cfg or r < 0 or self.s.proc is None:
            return
        src = cfg.sources[r]
        base = src.ref.resolve(self.s.proc)
        if base is None:
            self.status.emit("Das Objekt ist gerade nicht lesbar.")
            return
        sig = signature_from_object(self.s.proc, base)
        if sig is None:
            self.status.emit("Am Anfang des Objekts steht kein Klassen-Zeiger.")
            return
        ents = EntityReader(self.s.proc, EntityConfig(cfg.layout, [src], cfg.enemy_words, cfg.enemy_ids)).read()
        name = ents[0].name if ents and ents[0].name else src.label
        cfg.sources.append(Source(kind=SIGNATURE, label=f"Alle: {name}", sig_value=sig, enemy=src.enemy))
        self.s.entities_edited()
        self._fill_sources()
        self.sources.setCurrentRow(len(cfg.sources) - 1)
        self.status.emit(f"Automatische Suche nach Signatur {sig} angelegt.")

    # --- live ---------------------------------------------------------------------------
    def refresh(self) -> None:
        if self.s.proc is None or not self.isVisible():
            return
        if self.cfg:
            for i, src in enumerate(self.cfg.sources):
                it = self.sources.item(i)
                if it is not None and src.kind == SIGNATURE:
                    it.setText(self._source_text(i, src))
        ents = self.s.read_entities()
        mode = self.only_valid.currentData()
        shown = [e for e in ents if mode == "all" or (e.valid and (mode == "valid" or e.enemy))]
        shown.sort(key=lambda e: (not e.enemy, not e.valid, e.distance if e.distance is not None else 1e18))
        shown = shown[:500]
        valid = [e for e in ents if e.valid]
        enemies = sum(1 for e in valid if e.enemy)
        self.b_valid.set(f"{len(valid)} Objekte", T.OK if valid else T.MUTED)
        self.b_enemy.set(f"{enemies} Gegner", T.BAD if enemies else T.MUTED)
        ps = self.s.pointer_size
        self.table.setUpdatesEnabled(False)
        self.table.setRowCount(len(shown))
        cfg = self.cfg
        for r, e in enumerate(shown):
            src = cfg.sources[e.source] if cfg and e.source < len(cfg.sources) else None
            name_color = T.BAD if e.enemy else (T.TEXT if e.valid else T.FAINT)
            pos = e.pos or (None, None, None)
            hp = "–" if e.health is None else (f"{e.health:g}" + (f" / {e.max_health:g}" if e.max_health else ""))
            dist = "–" if e.distance is None else f"{e.distance:.1f}"
            status = "Gegner ✓" if e.enemy else ("Objekt ✓" if e.valid else e.problem)
            cells = [
                (e.title, False, name_color),
                (src.label if src else "", False, T.MUTED),
                (_c(pos[0]), True, T.TEXT),
                (_c(pos[1]), True, T.TEXT),
                (_c(pos[2]), True, T.TEXT),
                (hp, True, T.TEXT),
                (dist, True, T.ACCENT2),
                (status, False, T.BAD if e.enemy else (T.OK if e.valid else T.WARN)),
                (fmt_addr(e.address, ps), True, T.FAINT),
            ]
            for c, (text, mono, color) in enumerate(cells):
                it = self.table.item(r, c)
                if it is None:
                    self.table.setItem(r, c, item(text, mono=mono, color=color))
                else:
                    if it.text() != text:
                        it.setText(text)
                    it.setForeground(QColor(color))
        self.table.setUpdatesEnabled(True)
        self.rows_cache = shown

    def run_test(self) -> None:
        if self.s.proc is None:
            return
        self._samples = []
        self.test_btn.setEnabled(False)
        self.test_btn.setText("Prüfe …")
        self.sampler.start()

    def _sample(self) -> None:
        self._samples.append(self.s.read_entities(with_distance=False))
        if len(self._samples) < 8:
            return
        self.sampler.stop()
        self.test_btn.setEnabled(True)
        self.test_btn.setText("Prüfen")
        rep = build_report(self._samples)
        if rep.passed:
            names = ", ".join(f"{n} × {c}" for n, c in sorted(rep.by_name.items(), key=lambda x: -x[1])) or "keine"
            text = (f"<span style='color:{T.OK}; font-weight:700'>✓ Test bestanden.</span> "
                    f"{rep.valid} von {rep.total} Plätzen sind echte Objekte, <b>{rep.enemies} davon Gegner</b> ({names}). "
                    f"{rep.moving} haben sich bewegt.")
            if rep.enemies == 0:
                text += f"<br><span style='color:{T.WARN}'>Noch keine Gegner: Stelle bei der Quelle „Gegner?“ ein oder trage Namen unter Schritt 3 ein.</span>"
            else:
                text += " Weiter geht's unter <b>Overlay</b>."
        else:
            top = sorted(rep.problems.items(), key=lambda x: -x[1])[:3]
            why = "; ".join(f"{p} ({n}×)" for p, n in top) or "keine Quelle eingerichtet"
            text = (f"<span style='color:{T.BAD}; font-weight:700'>✗ Keine gültigen Objekte.</span> Häufigste Gründe: {why}.<br>"
                    "Prüfe die Adresse der Quelle und die Versätze für X / Y / Z. Tipp: Rechtsklick in „Umgebung ansehen“.")
        self.result_text.setText(text)
        self.result.show()

    def _csv(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Objekte speichern", "objekte.csv", "CSV (*.csv)")
        if not path:
            return
        ps = self.s.pointer_size
        rows = []
        for e in self.rows_cache:
            pos = e.pos or (None, None, None)
            rows.append([e.title, _c(pos[0]), _c(pos[1]), _c(pos[2]), "" if e.health is None else f"{e.health:g}",
                         "" if e.distance is None else f"{e.distance:.2f}", "ja" if e.enemy else "nein",
                         "ja" if e.valid else e.problem, fmt_addr(e.address, ps)])
        export_csv(path, ["Name", "X", "Y", "Z", "Leben", "Entfernung", "Gegner", "Gültig", "Adresse"], rows)


def _c(v) -> str:
    return "–" if v is None else f"{v:.2f}"
