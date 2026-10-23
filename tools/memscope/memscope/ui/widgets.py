"""Small building blocks shared by all pages."""

from __future__ import annotations

import traceback

from PySide6.QtCore import QThread, Qt, Signal
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSizePolicy,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from . import theme as T


def label(text: str = "", name: str | None = None, wrap: bool = False) -> QLabel:
    lab = QLabel(text)
    if name:
        lab.setObjectName(name)
    if wrap:
        lab.setWordWrap(True)
    lab.setTextInteractionFlags(Qt.TextSelectableByMouse if name == "mono" else Qt.NoTextInteraction)
    return lab


def button(text: str, kind: str | None = None, icon_name: str | None = None, tip: str | None = None) -> QPushButton:
    b = QPushButton(text)
    if kind:
        b.setProperty("kind", kind)
    if icon_name:
        color = "white" if kind in ("primary", "stop") else ("#04130d" if kind == "go" else (T.BAD if kind == "danger" else T.TEXT))
        b.setIcon(T.icon(icon_name, color))
        b.setIconSize(T.ICON_SIZE)
    if tip:
        b.setToolTip(tip)
    b.setCursor(Qt.PointingHandCursor)
    return b


def restyle(w: QWidget) -> None:
    """Re-apply the style sheet after changing a dynamic property."""
    w.style().unpolish(w)
    w.style().polish(w)


class Card(QFrame):
    def __init__(self, title: str | None = None, subtitle: str | None = None, step: str | None = None) -> None:
        super().__init__()
        self.setObjectName("card")
        outer = QVBoxLayout(self)
        outer.setContentsMargins(20, 18, 20, 18)
        outer.setSpacing(12)
        if step or title:
            head = QVBoxLayout()
            head.setSpacing(3)
            if step:
                head.addWidget(label(step.upper(), "step"))
            if title:
                head.addWidget(label(title, "h2"))
            if subtitle:
                head.addWidget(label(subtitle, "muted", wrap=True))
            outer.addLayout(head)
        self.body = QVBoxLayout()
        self.body.setSpacing(10)
        outer.addLayout(self.body)


class Badge(QLabel):
    def __init__(self, text: str = "", color: str = T.MUTED) -> None:
        super().__init__()
        self.set(text, color)

    def set(self, text: str, color: str = T.MUTED) -> None:
        c = QColor(color)
        self.setText(text)
        self.setVisible(bool(text))
        self.setStyleSheet(
            f"background: rgba({c.red()},{c.green()},{c.blue()},0.14); color: {color};"
            f"border: 1px solid rgba({c.red()},{c.green()},{c.blue()},0.35); border-radius: 10px;"
            "padding: 2px 9px; font-weight: 600; font-size: 9pt;"
        )


class Dot(QLabel):
    """Coloured status dot."""

    def __init__(self, color: str = T.FAINT) -> None:
        super().__init__()
        self.setFixedSize(10, 10)
        self.set(color)

    def set(self, color: str) -> None:
        self.setStyleSheet(f"background: {color}; border-radius: 5px;")


def row(*items, spacing: int = 8, stretch_last: bool = False) -> QHBoxLayout:
    lay = QHBoxLayout()
    lay.setSpacing(spacing)
    lay.setContentsMargins(0, 0, 0, 0)
    for it in items:
        if it is None:
            lay.addStretch(1)
        elif isinstance(it, QWidget):
            lay.addWidget(it)
        else:
            lay.addLayout(it)
    if stretch_last:
        lay.addStretch(1)
    return lay


def field(caption: str, widget: QWidget, hint: str | None = None) -> QVBoxLayout:
    lay = QVBoxLayout()
    lay.setSpacing(4)
    lay.addWidget(label(caption, "faint"))
    lay.addWidget(widget)
    if hint:
        lay.addWidget(label(hint, "faint", wrap=True))
    return lay


def expanding(w: QWidget) -> QWidget:
    w.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
    return w


def item(text: str, mono: bool = False, color: str | None = None, editable: bool = False, align_right: bool = False) -> QTableWidgetItem:
    it = QTableWidgetItem(text)
    flags = Qt.ItemIsSelectable | Qt.ItemIsEnabled
    if editable:
        flags |= Qt.ItemIsEditable
    it.setFlags(flags)
    if mono:
        it.setFont(QFont(T.mono_font()))
    if color:
        it.setForeground(QColor(color))
    if align_right:
        it.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
    return it


def page() -> tuple[QWidget, QVBoxLayout]:
    w = QWidget()
    w.setObjectName("page")
    lay = QVBoxLayout(w)
    lay.setContentsMargins(28, 24, 28, 24)
    lay.setSpacing(16)
    return w, lay


def header(title: str, subtitle: str) -> QVBoxLayout:
    lay = QVBoxLayout()
    lay.setSpacing(4)
    lay.addWidget(label(title, "h1"))
    lay.addWidget(label(subtitle, "muted", wrap=True))
    return lay


class Worker(QThread):
    """Runs fn(progress, cancel) in the background."""

    progressed = Signal(float)
    done = Signal(object)
    failed = Signal(str)

    def __init__(self, fn, parent=None) -> None:
        super().__init__(parent)
        self.fn = fn
        self._cancel = False
        self._last = -1.0

    def cancel(self) -> None:
        self._cancel = True

    @property
    def cancelled(self) -> bool:
        return self._cancel

    def _progress(self, f: float) -> None:
        if f - self._last >= 0.01 or f >= 1.0:
            self._last = f
            self.progressed.emit(f)

    def run(self) -> None:
        try:
            result = self.fn(self._progress, lambda: self._cancel)
        except Exception as exc:  # shown to the user, never crash the UI
            traceback.print_exc()
            self.failed.emit(str(exc) or exc.__class__.__name__)
            return
        self.done.emit(result)
