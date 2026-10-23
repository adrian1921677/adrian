"""The overlay: a transparent, click-through window on top of the game.

Every frame it reads the camera matrix and all entities, projects them to the
screen and draws an outline around each enemy.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

import numpy as np
from PySide6.QtCore import QPointF, QRect, QRectF, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QGuiApplication, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import QWidget

from .. import projection as P
from ..backend import IS_WINDOWS, foreground_pid, key_down
from ..entities import Entity, Layout
from ..profile import OverlayStyle
from ..session import Session
from . import theme as T

VK_F8 = 0x77


@dataclass
class DrawItem:
    rect: QRectF  # logical pixels, relative to the overlay
    title: str
    distance: float | None
    hp: float | None  # 0..1
    enemy: bool


# --- geometry -------------------------------------------------------------------


def physical_to_logical(x: int, y: int, w: int, h: int) -> tuple[QRect, float]:
    """Window rect from the OS (physical pixels) -> Qt geometry (logical) + scale."""
    cx, cy = x + w / 2, y + h / 2
    for s in QGuiApplication.screens():
        g = s.geometry()
        dpr = s.devicePixelRatio()
        # Qt keeps a screen's top-left at its native position and scales the size.
        if g.x() <= cx < g.x() + g.width() * dpr and g.y() <= cy < g.y() + g.height() * dpr:
            lx = g.x() + (x - g.x()) / dpr
            ly = g.y() + (y - g.y()) / dpr
            return QRect(round(lx), round(ly), round(w / dpr), round(h / dpr)), dpr
    s = QGuiApplication.primaryScreen()
    dpr = s.devicePixelRatio() if s else 1.0
    return QRect(round(x / dpr), round(y / dpr), round(w / dpr), round(h / dpr)), dpr


def entity_points(e: Entity, lay: Layout) -> tuple[tuple, tuple]:
    """Feet and head position in the world."""
    x, y, z = e.pos
    h = float(lay.height)
    up = 2 if lay.up_axis == "z" else 1
    feet = [x, y, z]
    if lay.anchor == "center":
        feet[up] -= h / 2
    head = list(feet)
    head[up] += h
    return tuple(feet), tuple(head)


def compute_items(ents: list[Entity], m: np.ndarray, layout: str, lay: Layout, style: OverlayStyle,
                  vw: float, vh: float, scale: float) -> list[DrawItem]:
    """Project entities. vw/vh is the game viewport in physical pixels, scale = 1/dpr."""
    chosen = [e for e in ents if e.valid and e.pos is not None and (e.enemy or style.show_others)]
    if style.max_distance > 0:
        chosen = [e for e in chosen if e.distance is None or e.distance <= style.max_distance]
    if not chosen:
        return []
    pts = []
    for e in chosen:
        feet, head = entity_points(e, lay)
        pts.append(feet)
        pts.append(head)
    sx, sy, w, vis = P.project_many(m, layout, np.array(pts, dtype=np.float64), vw, vh)
    out = []
    for i, e in enumerate(chosen):
        a, b = 2 * i, 2 * i + 1
        if not (vis[a] and vis[b]):
            continue
        fx, fy, hx, hy = sx[a] * scale, sy[a] * scale, sx[b] * scale, sy[b] * scale
        height = abs(fy - hy)
        if height < 4 or height > vh * scale * 4:
            continue
        width = max(4.0, height * style.width_ratio)
        cx = (fx + hx) / 2
        rect = QRectF(cx - width / 2, min(fy, hy), width, height)
        if rect.right() < -50 or rect.left() > vw * scale + 50 or rect.bottom() < -50 or rect.top() > vh * scale + 50:
            continue
        hp = None
        if e.health is not None:
            top = e.max_health if e.max_health and e.max_health > 0 else None
            hp = max(0.0, min(1.0, e.health / top)) if top else None
        out.append(DrawItem(rect, e.title, e.distance, hp, e.enemy))
    out.sort(key=lambda d: -(d.distance or 0))  # far ones first, near ones on top
    return out


# --- painting -------------------------------------------------------------------


def paint_items(p: QPainter, items: list[DrawItem], style: OverlayStyle, view: QRectF) -> None:
    """Outlines far-to-near, then labels near-to-far so close enemies win when labels overlap."""
    p.setRenderHint(QPainter.Antialiasing)
    for it in items:
        color = QColor(style.enemy_color if it.enemy else style.other_color)
        # A little air around the body so the outline does not hug it.
        r = it.rect.adjusted(-it.rect.width() * 0.08, -it.rect.height() * 0.06, it.rect.width() * 0.08, it.rect.height() * 0.02)
        if style.show_lines:
            p.setPen(QPen(QColor(color.red(), color.green(), color.blue(), 120), 1.2))
            p.drawLine(QPointF(view.center().x(), view.bottom()), QPointF(r.center().x(), r.bottom()))
        draw_outline(p, r, style, color)
        if style.show_health and it.hp is not None and r.height() >= 14:
            bar = QRectF(r.left() - 7, r.top(), 3.5, r.height())
            p.setPen(Qt.NoPen)
            p.setBrush(QColor(0, 0, 0, 150))
            p.drawRoundedRect(bar.adjusted(-1, -1, 1, 1), 2, 2)
            fill = QRectF(bar.left(), bar.bottom() - bar.height() * it.hp, bar.width(), bar.height() * it.hp)
            p.setBrush(QColor.fromHsvF(0.33 * it.hp, 0.85, 0.95))
            p.drawRoundedRect(fill, 1.5, 1.5)
    if not (style.show_names or style.show_distance):
        return
    taken: list[QRectF] = []
    for it in reversed(items):
        parts = []
        if style.show_names:
            parts.append(it.title)
        if style.show_distance and it.distance is not None:
            parts.append(f"{it.distance:.0f} m")
        if not parts:
            continue
        small = it.rect.height() < 40
        font = QFont(T.ui_font(), 8 if small else 9)
        font.setBold(True)
        p.setFont(font)
        text = "  ·  ".join(parts)
        fm = p.fontMetrics()
        tw = fm.horizontalAdvance(text) + 14
        th = fm.height() + 4
        top = it.rect.top() - it.rect.height() * 0.06
        pill = QRectF(it.rect.center().x() - tw / 2, top - th - 5, tw, th)
        if any(pill.intersects(t) for t in taken):
            continue
        taken.append(pill)
        p.setPen(Qt.NoPen)
        p.setBrush(QColor(10, 12, 18, 190))
        p.drawRoundedRect(pill, th / 2, th / 2)
        p.setPen(QColor(255, 255, 255, 235))
        p.drawText(pill, Qt.AlignCenter, text)


def draw_outline(p: QPainter, r: QRectF, style: OverlayStyle, color: QColor) -> None:
    t = float(style.thickness)
    p.setBrush(Qt.NoBrush)
    radius = min(r.width(), r.height()) * 0.12
    if style.style == "corners":
        L = min(r.width(), r.height()) * 0.28
        path = QPainterPath()
        for (x, y, dx, dy) in ((r.left(), r.top(), 1, 1), (r.right(), r.top(), -1, 1),
                               (r.left(), r.bottom(), 1, -1), (r.right(), r.bottom(), -1, -1)):
            path.moveTo(x + dx * L, y)
            path.lineTo(x, y)
            path.lineTo(x, y + dy * L)
        p.setPen(QPen(QColor(0, 0, 0, 160), t + 2.5, Qt.SolidLine, Qt.RoundCap, Qt.RoundJoin))
        p.drawPath(path)
        p.setPen(QPen(color, t, Qt.SolidLine, Qt.RoundCap, Qt.RoundJoin))
        p.drawPath(path)
        return
    if style.style == "glow":
        for width, alpha in ((t + 9, 28), (t + 5, 60), (t + 2, 120)):
            c = QColor(color)
            c.setAlpha(alpha)
            p.setPen(QPen(c, width, Qt.SolidLine, Qt.RoundCap, Qt.RoundJoin))
            p.drawRoundedRect(r, radius, radius)
        p.setPen(QPen(color.lighter(130), t, Qt.SolidLine, Qt.RoundCap, Qt.RoundJoin))
        p.drawRoundedRect(r, radius, radius)
        return
    p.setPen(QPen(QColor(0, 0, 0, 160), t + 2.5))
    p.drawRect(r)
    p.setPen(QPen(color, t))
    p.drawRect(r)


def paint_status(p: QPainter, text: str, ok: bool) -> None:
    font = QFont(T.ui_font(), 9)
    font.setBold(True)
    p.setFont(font)
    fm = p.fontMetrics()
    tw = fm.horizontalAdvance(text) + 34
    r = QRectF(12, 12, tw, 26)
    p.setPen(Qt.NoPen)
    p.setBrush(QColor(10, 12, 18, 170))
    p.drawRoundedRect(r, 13, 13)
    p.setBrush(QColor(T.OK if ok else T.WARN))
    p.drawEllipse(QPointF(r.left() + 14, r.center().y()), 4, 4)
    p.setPen(QColor(255, 255, 255, 220))
    p.drawText(r.adjusted(24, 0, 0, 0), Qt.AlignVCenter | Qt.AlignLeft, text)


# --- window ---------------------------------------------------------------------


class OverlayWindow(QWidget):
    stats = Signal(str)

    def __init__(self, session: Session) -> None:
        super().__init__(None)
        self.s = session
        self.setWindowFlags(
            Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool
            | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_TransparentForMouseEvents)
        self.setAttribute(Qt.WA_ShowWithoutActivating)
        self.setWindowTitle("MemScope Overlay")
        self.items: list[DrawItem] = []
        self.status_text = ""
        self.status_ok = False
        self.hidden_by_key = False
        self._visible_now = True
        self._f8 = False
        self._frames = 0
        self._fps_t = time.monotonic()
        self.fps = 0
        self.timer = QTimer(self)
        self.timer.setInterval(16)
        self.timer.timeout.connect(self.tick)

    def start(self) -> None:
        self.hidden_by_key = False
        self.show()
        self.timer.start()
        self.tick()

    def stop(self) -> None:
        self.timer.stop()
        self.items = []
        self.hide()

    def tick(self) -> None:
        s = self.s
        if s.proc is None or s.profile is None:
            self.stop()
            return
        style = s.profile.overlay
        if IS_WINDOWS:
            down = key_down(VK_F8)
            if down and not self._f8:
                self.hidden_by_key = not self.hidden_by_key
            self._f8 = down

        rect = s.proc.window_rect()
        if rect is None:
            scr = QGuiApplication.primaryScreen()
            g = scr.geometry()
            dpr = scr.devicePixelRatio()
            geo, vw, vh = g, g.width() * dpr, g.height() * dpr
        else:
            geo, dpr = physical_to_logical(*rect)
            vw, vh = rect[2], rect[3]
        if self.geometry() != geo:
            self.setGeometry(geo)

        visible = not self.hidden_by_key
        if visible and style.only_foreground and IS_WINDOWS:
            visible = foreground_pid() in (s.proc.pid, os.getpid())
        self.items = []
        m = s.matrix()
        ents = s.read_entities() if visible else []
        if m is None:
            self.status_text, self.status_ok = "MemScope · Kamera-Matrix fehlt", False
        else:
            self.items = compute_items(ents, m, s.profile.camera.layout, s.profile.entities.layout, style, vw, vh, 1.0 / dpr)
            n = sum(1 for i in self.items if i.enemy)
            self.status_text, self.status_ok = f"MemScope · {n} Gegner im Blick · {self.fps} FPS", True
        if not visible:
            self.items = []
        self._frames += 1
        now = time.monotonic()
        if now - self._fps_t >= 1.0:
            self.fps = round(self._frames / (now - self._fps_t))
            self._frames, self._fps_t = 0, now
            self.stats.emit(self.status_text)
        self._visible_now = visible
        self.update()

    def paintEvent(self, _ev) -> None:
        p = QPainter(self)
        p.setCompositionMode(QPainter.CompositionMode_Source)
        p.fillRect(self.rect(), Qt.transparent)
        p.setCompositionMode(QPainter.CompositionMode_SourceOver)
        if self._visible_now:
            paint_items(p, self.items, self.s.profile.overlay if self.s.profile else OverlayStyle(), QRectF(self.rect()))
            if self.s.profile and self.s.profile.overlay.show_status:
                paint_status(p, self.status_text, self.status_ok)
        p.end()
