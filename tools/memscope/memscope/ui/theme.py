"""Colours, fonts, the Qt style sheet and small SVG icons."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from PySide6.QtCore import QByteArray, QRectF, QSize, Qt
from PySide6.QtGui import QColor, QFont, QFontDatabase, QIcon, QLinearGradient, QPainter, QPen, QPixmap
from PySide6.QtSvg import QSvgRenderer

BG = "#0d0f14"
SURFACE = "#12151d"
CARD = "#181c27"
CARD_HI = "#1f2433"
BORDER = "#272d3d"
TEXT = "#e7eaf0"
MUTED = "#8b93a7"
FAINT = "#5b6377"
ACCENT = "#7c5cff"
ACCENT_HI = "#937aff"
ACCENT2 = "#22d3ee"
OK = "#34d399"
WARN = "#fbbf24"
BAD = "#f87171"


def ui_font() -> str:
    families = set(QFontDatabase.families())
    for f in ("Segoe UI Variable Text", "Segoe UI", "Inter", "SF Pro Text", "Helvetica Neue", "Noto Sans", "DejaVu Sans"):
        if f in families:
            return f
    return QFont().defaultFamily()


def mono_font() -> str:
    families = set(QFontDatabase.families())
    for f in ("Cascadia Mono", "JetBrains Mono", "Consolas", "SF Mono", "Menlo", "DejaVu Sans Mono"):
        if f in families:
            return f
    return "monospace"


def _asset(name: str, svg: str) -> str:
    """Style sheets can only load images from files, so small SVGs are written to the temp folder."""
    folder = Path(tempfile.gettempdir()) / "memscope-ui"
    try:
        folder.mkdir(exist_ok=True)
        f = folder / name
        if not f.exists() or f.read_text(encoding="utf-8") != svg:
            f.write_text(svg, encoding="utf-8")
        return f.as_posix()
    except OSError:
        return ""


def stylesheet() -> str:
    ui = ui_font()
    mono = mono_font()
    arrow = _asset("arrow.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6" '
                   f'fill="none" stroke="{MUTED}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    check = _asset("check.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" '
                   'fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    return f"""
* {{ font-family: "{ui}"; font-size: 10pt; color: {TEXT}; }}
QMainWindow, QDialog {{ background: {BG}; }}
QWidget#page {{ background: {BG}; }}
QWidget#sidebar {{ background: {SURFACE}; border-right: 1px solid {BORDER}; }}
QWidget#topbar {{ background: {BG}; border-bottom: 1px solid {BORDER}; }}
QFrame#card {{ background: {CARD}; border: 1px solid {BORDER}; border-radius: 14px; }}
QFrame#hero {{ border: 1px solid {BORDER}; border-radius: 18px;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #1d1840, stop:0.55 #141a2c, stop:1 #0f2230); }}
QLabel {{ background: transparent; }}
QLabel#h1 {{ font-size: 20pt; font-weight: 700; }}
QLabel#h2 {{ font-size: 13pt; font-weight: 600; }}
QLabel#h3 {{ font-size: 10.5pt; font-weight: 600; }}
QLabel#muted {{ color: {MUTED}; }}
QLabel#faint {{ color: {FAINT}; font-size: 9pt; }}
QLabel#mono {{ font-family: "{mono}"; }}
QLabel#step {{ color: {ACCENT_HI}; font-weight: 700; font-size: 9pt; }}
QLabel#logo {{ font-size: 14pt; font-weight: 800; }}

QPushButton {{ background: {CARD_HI}; border: 1px solid {BORDER}; border-radius: 10px; padding: 8px 14px; font-weight: 600; }}
QPushButton:hover {{ background: #283046; border-color: #343c52; }}
QPushButton:pressed {{ background: #1a2030; }}
QPushButton:disabled {{ color: {FAINT}; background: {CARD}; border-color: {BORDER}; }}
QPushButton[kind="primary"] {{ border: none; color: white;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 {ACCENT}, stop:1 #5b8cff); }}
QPushButton[kind="primary"]:hover {{ background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 {ACCENT_HI}, stop:1 #74a0ff); }}
QPushButton[kind="primary"]:disabled {{ background: #2b2f45; color: {FAINT}; }}
QPushButton[kind="danger"] {{ background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.35); color: {BAD}; }}
QPushButton[kind="danger"]:hover {{ background: rgba(248,113,113,0.2); }}
QPushButton[kind="ghost"] {{ background: transparent; border: 1px solid transparent; color: {MUTED}; }}
QPushButton[kind="ghost"]:hover {{ background: {CARD_HI}; color: {TEXT}; }}
QPushButton[kind="go"] {{ border: none; color: #04130d; font-size: 11pt; padding: 12px 20px;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 {OK}, stop:1 {ACCENT2}); }}
QPushButton[kind="go"]:hover {{ background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #5eead4, stop:1 #67e8f9); }}
QPushButton[kind="stop"] {{ border: none; color: white; font-size: 11pt; padding: 12px 20px; background: #e5484d; }}
QPushButton[kind="stop"]:hover {{ background: #f2555a; }}

QPushButton[nav="true"] {{ background: transparent; border: none; border-radius: 10px; padding: 10px 12px;
    text-align: left; color: {MUTED}; font-weight: 600; }}
QPushButton[nav="true"]:hover {{ background: {CARD}; color: {TEXT}; }}
QPushButton[nav="true"]:checked {{ background: rgba(124,92,255,0.16); color: {TEXT}; }}
QPushButton[nav="true"]:disabled {{ color: #3e4558; }}

QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox, QPlainTextEdit {{ background: {SURFACE}; border: 1px solid {BORDER};
    border-radius: 9px; padding: 7px 10px; selection-background-color: {ACCENT}; }}
QLineEdit:focus, QComboBox:focus, QSpinBox:focus, QDoubleSpinBox:focus {{ border: 1px solid {ACCENT}; }}
QLineEdit[mono="true"] {{ font-family: "{mono}"; }}
QLineEdit:disabled, QComboBox:disabled {{ color: {FAINT}; }}
QComboBox::drop-down {{ border: none; width: 24px; }}
QComboBox::down-arrow {{ image: url("{arrow}"); width: 12px; height: 12px; margin-right: 10px; }}
QComboBox QAbstractItemView {{ background: {CARD}; border: 1px solid {BORDER}; selection-background-color: rgba(124,92,255,0.35);
    outline: none; padding: 4px; }}
QSpinBox::up-button, QSpinBox::down-button, QDoubleSpinBox::up-button, QDoubleSpinBox::down-button {{ width: 0; border: none; }}

QCheckBox {{ spacing: 8px; }}
QCheckBox::indicator {{ width: 18px; height: 18px; border-radius: 6px; border: 1px solid #3a4258; background: {SURFACE}; }}
QCheckBox::indicator:checked {{ background: {ACCENT}; border-color: {ACCENT}; image: url("{check}"); }}
QCheckBox::indicator:hover {{ border-color: {ACCENT}; }}
QRadioButton::indicator {{ width: 16px; height: 16px; border-radius: 8px; border: 1px solid #3a4258; background: {SURFACE}; }}
QRadioButton::indicator:checked {{ background: {ACCENT}; border: 4px solid #2a2350; }}

QTableView, QTableWidget, QListWidget, QTreeWidget {{ background: {CARD}; border: 1px solid {BORDER}; border-radius: 12px;
    gridline-color: transparent; selection-background-color: rgba(124,92,255,0.28); selection-color: {TEXT};
    alternate-background-color: #1c2130; outline: none; }}
QTableView::item, QTableWidget::item {{ padding: 4px 8px; border: none; }}
QTableView[mono="true"], QTableWidget[mono="true"] {{ font-family: "{mono}"; }}
QHeaderView {{ background: transparent; }}
QHeaderView::section {{ background: {CARD}; color: {MUTED}; border: none; border-bottom: 1px solid {BORDER};
    padding: 8px 8px; font-weight: 600; font-size: 9pt; }}
QTableCornerButton::section {{ background: {CARD}; border: none; }}
QListWidget::item {{ border-radius: 10px; padding: 2px; margin: 2px 4px; }}
QListWidget::item:hover {{ background: {CARD_HI}; }}
QListWidget::item:selected {{ background: rgba(124,92,255,0.22); }}

QScrollBar:vertical {{ background: transparent; width: 10px; margin: 4px 2px; }}
QScrollBar::handle:vertical {{ background: #2e3548; border-radius: 3px; min-height: 30px; }}
QScrollBar::handle:vertical:hover {{ background: #3b4460; }}
QScrollBar:horizontal {{ background: transparent; height: 10px; margin: 2px 4px; }}
QScrollBar::handle:horizontal {{ background: #2e3548; border-radius: 3px; min-width: 30px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ width: 0; height: 0; }}
QScrollBar::add-page, QScrollBar::sub-page {{ background: transparent; }}
QScrollArea {{ background: transparent; border: none; }}
QScrollArea > QWidget > QWidget {{ background: transparent; }}

QProgressBar {{ background: {SURFACE}; border: none; border-radius: 4px; height: 8px; text-align: center; color: transparent; }}
QProgressBar::chunk {{ border-radius: 4px; background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 {ACCENT}, stop:1 {ACCENT2}); }}

QTabWidget::pane {{ border: none; }}
QTabBar::tab {{ background: transparent; color: {MUTED}; padding: 8px 14px; border-bottom: 2px solid transparent; font-weight: 600; }}
QTabBar::tab:selected {{ color: {TEXT}; border-bottom: 2px solid {ACCENT}; }}
QToolTip {{ background: {CARD_HI}; color: {TEXT}; border: 1px solid {BORDER}; border-radius: 6px; padding: 6px; }}
QMenu {{ background: {CARD}; border: 1px solid {BORDER}; border-radius: 10px; padding: 6px; }}
QMenu::item {{ padding: 7px 16px; border-radius: 6px; }}
QMenu::item:selected {{ background: rgba(124,92,255,0.25); }}
QMenu::separator {{ height: 1px; background: {BORDER}; margin: 4px 8px; }}
QMessageBox {{ background: {BG}; }}
QSplitter::handle {{ background: transparent; }}
QStatusBar {{ background: {SURFACE}; color: {MUTED}; border-top: 1px solid {BORDER}; }}
"""


# --- icons --------------------------------------------------------------------

_ICONS = {
    "process": '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>',
    "search": '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    "table": '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M3 14.5h18M9 9.5V20"/>',
    "struct": '<rect x="4" y="3.5" width="16" height="5" rx="1.5"/><rect x="4" y="10" width="16" height="5" rx="1.5"/><rect x="4" y="16.5" width="10" height="4" rx="1.5"/>',
    "target": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
    "eye": '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "trash": '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    "edit": '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    "play": '<path d="M7 4.5v15l12-7.5-12-7.5z"/>',
    "stop": '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    "check": '<path d="M4.5 12.5l5 5 10-11"/>',
    "refresh": '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20.5V16h-4.5"/>',
    "save": '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    "unplug": '<path d="M7 17l-3 3M17 7l3-3M9 9l-2.5 2.5a3.5 3.5 0 0 0 5 5L14 14M15 15l2.5-2.5a3.5 3.5 0 0 0-5-5L10 10"/>',
    "game": '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r="0.9"/><circle cx="17.5" cy="13.5" r="0.9"/>',
    "wand": '<path d="M4 20L15 9M14 4v2M18 6l-1.5 1.5M20 10h-2M10 6l1.5 1.5"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>',
    "shield": '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 8v5M12 16v.4"/>',
}


def icon(name: str, color: str = TEXT, size: int = 18) -> QIcon:
    body = _ICONS.get(name, "")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{color}" '
        f'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">{body}</svg>'
    )
    renderer = QSvgRenderer(QByteArray(svg.encode()))
    ic = QIcon()
    for scale in (1, 2):
        pm = QPixmap(size * scale, size * scale)
        pm.fill(Qt.transparent)
        p = QPainter(pm)
        renderer.render(p)
        p.end()
        pm.setDevicePixelRatio(scale)
        ic.addPixmap(pm)
    return ic


def logo_pixmap(size: int = 34) -> QPixmap:
    """The MemScope mark: a lens with a target ring."""
    scale = 2
    pm = QPixmap(size * scale, size * scale)
    pm.fill(Qt.transparent)
    p = QPainter(pm)
    p.setRenderHint(QPainter.Antialiasing)
    p.scale(scale, scale)
    g = QLinearGradient(0, 0, size, size)
    g.setColorAt(0, QColor(ACCENT))
    g.setColorAt(1, QColor(ACCENT2))
    p.setPen(Qt.NoPen)
    p.setBrush(g)
    p.drawRoundedRect(QRectF(0, 0, size, size), size * 0.28, size * 0.28)
    p.setPen(QPen(QColor("white"), size * 0.085))
    p.setBrush(Qt.NoBrush)
    c = size * 0.46
    p.drawEllipse(QRectF(c - size * 0.22, c - size * 0.22, size * 0.44, size * 0.44))
    p.drawLine(int(c + size * 0.17), int(c + size * 0.17), int(size * 0.8), int(size * 0.8))
    p.setBrush(QColor("white"))
    p.setPen(Qt.NoPen)
    p.drawEllipse(QRectF(c - size * 0.06, c - size * 0.06, size * 0.12, size * 0.12))
    p.end()
    pm.setDevicePixelRatio(scale)
    return pm


def app_icon() -> QIcon:
    ic = QIcon()
    for s in (16, 32, 48, 64, 128):
        ic.addPixmap(logo_pixmap(s))
    return ic


ICON_SIZE = QSize(18, 18)
IS_WINDOWS = sys.platform == "win32"
