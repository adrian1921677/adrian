"""Übungsarena: a tiny 3D game to practise with MemScope.

Everything lives in plain C structs (ctypes), like in a real game: the player
state, a camera matrix and an array of 32 creatures. Witches, zombies and
skeletons are enemies; sheep and villagers are not. Nothing is hidden, so the
whole workflow (find values -> find objects -> find camera -> overlay) can be
practised without touching a real game.

Run:  python -m memscope.demo
"""

from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
import random
import sys
import threading
import time
from ctypes import c_char, c_float, c_int32, c_uint32, c_uint64

import numpy as np
from PySide6.QtCore import QObject, QPointF, QRectF, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QLinearGradient, QPainter, QPen, QPolygonF
from PySide6.QtWidgets import QApplication, QWidget


class Klass(ctypes.Structure):
    """Stand-in for a C++ class / vtable. Every entity points to its class."""

    _fields_ = [("magic", c_uint32), ("type_id", c_int32), ("name", c_char * 16)]


class Entity(ctypes.Structure):
    _fields_ = [
        ("klass", c_uint64),  # +00 pointer to the class (like a vtable pointer)
        ("name", c_char * 16),  # +08
        ("type_id", c_int32),  # +18
        ("active", c_int32),  # +1C
        ("x", c_float),  # +20
        ("y", c_float),  # +24
        ("z", c_float),  # +28
        ("yaw", c_float),  # +2C
        ("health", c_float),  # +30
        ("max_health", c_float),  # +34
        ("speed", c_float),  # +38
        ("timer", c_float),  # +3C
    ]


class GameState(ctypes.Structure):
    _fields_ = [
        ("magic", c_char * 8),
        ("player_health", c_int32),
        ("ammo", c_int32),
        ("player_x", c_float),
        ("player_y", c_float),
        ("player_z", c_float),
        ("yaw", c_float),
        ("pitch", c_float),
        ("view_proj", c_float * 16),  # row by row: clip = M * (x, y, z, 1)
        ("entity_count", c_int32),
        ("entities", c_uint64),  # pointer to Entity[32]
        ("entity_ptrs", c_uint64),  # pointer to Entity*[32]
    ]


MAX_ENTITIES = 32
EYE = 1.7
FOV = math.radians(70)
NEAR, FAR = 0.1, 400.0
ARENA = 40.0

# name, type id, enemy, height, width, body colour, head colour, health
KINDS = [
    ("Hexe", 45, True, 1.95, 0.6, "#8b5cf6", "#d8b4fe", 26),
    ("Zombie", 54, True, 1.9, 0.6, "#4d7c0f", "#86efac", 20),
    ("Skelett", 51, True, 1.99, 0.5, "#d1d5db", "#f9fafb", 20),
    ("Schaf", 91, False, 1.3, 0.9, "#f1f5f9", "#9ca3af", 8),
    ("Dorfbewohner", 120, False, 1.95, 0.6, "#a16207", "#fcd34d", 20),
]


def view_projection(eye: np.ndarray, yaw: float, pitch: float, aspect: float) -> np.ndarray:
    f = np.array([math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch)])
    s = np.cross(f, [0.0, 1.0, 0.0])
    s /= np.linalg.norm(s)
    u = np.cross(s, f)
    view = np.array([
        [s[0], s[1], s[2], -s @ eye],
        [u[0], u[1], u[2], -u @ eye],
        [-f[0], -f[1], -f[2], f @ eye],
        [0, 0, 0, 1],
    ])
    t = 1.0 / math.tan(FOV / 2)
    proj = np.array([
        [t / aspect, 0, 0, 0],
        [0, t, 0, 0],
        [0, 0, (FAR + NEAR) / (NEAR - FAR), 2 * FAR * NEAR / (NEAR - FAR)],
        [0, 0, -1, 0],
    ])
    return proj @ view


class Game:
    def __init__(self, seed: int | None = None, freeze: bool = False) -> None:
        self.rng = random.Random(seed)
        self.freeze = freeze
        self.state = GameState()
        self.state.magic = b"ARENA01"
        self.state.player_health = 100
        self.state.ammo = 30
        self.state.player_x, self.state.player_y, self.state.player_z = 0.0, 0.0, 12.0
        self.klasses = []
        for name, tid, *_ in KINDS:
            k = Klass(0xC1A55, tid, name.encode())
            self.klasses.append(k)
        self.entities = (Entity * MAX_ENTITIES)()
        self.ptrs = (c_uint64 * MAX_ENTITIES)()
        self.state.entities = ctypes.addressof(self.entities)
        self.state.entity_ptrs = ctypes.addressof(self.ptrs)
        for i in range(MAX_ENTITIES):
            if i < 22:
                self.spawn(i)
        self.state.entity_count = sum(1 for e in self.entities if e.active)

    def kind(self, e: Entity):
        for k in KINDS:
            if k[1] == e.type_id:
                return k
        return KINDS[0]

    def spawn(self, i: int, kind: int | None = None) -> None:
        e = self.entities[i]
        k = self.rng.randrange(len(KINDS)) if kind is None else kind
        name, tid, _enemy, _h, _w, _c, _hc, hp = KINDS[k]
        e.klass = ctypes.addressof(self.klasses[k])
        e.name = name.encode()
        e.type_id = tid
        e.active = 1
        e.x = self.rng.uniform(-ARENA * 0.8, ARENA * 0.8)
        e.z = self.rng.uniform(-ARENA * 0.8, ARENA * 0.2)
        e.y = 0.0
        e.yaw = self.rng.uniform(0, math.tau)
        e.health = e.max_health = float(hp)
        e.speed = self.rng.uniform(0.6, 1.8)
        e.timer = self.rng.uniform(1, 4)
        self.ptrs[i] = ctypes.addressof(e)

    def kill(self, i: int) -> None:
        e = self.entities[i]
        e.health = 0.0
        e.active = 0
        e.timer = 3.0
        self.ptrs[i] = 0

    def tick(self, dt: float) -> None:
        for i, e in enumerate(self.entities):
            if not e.active:
                if e.type_id:
                    e.timer -= dt
                    if e.timer <= 0:
                        self.spawn(i)
                continue
            if self.freeze:
                continue
            e.timer -= dt
            if e.timer <= 0:
                e.yaw += self.rng.uniform(-1.6, 1.6)
                e.timer = self.rng.uniform(1.5, 4.5)
            e.x += math.sin(e.yaw) * e.speed * dt
            e.z -= math.cos(e.yaw) * e.speed * dt
            if abs(e.x) > ARENA or abs(e.z) > ARENA:
                e.yaw += math.pi
                e.x = max(-ARENA, min(ARENA, e.x))
                e.z = max(-ARENA, min(ARENA, e.z))
        self.state.entity_count = sum(1 for e in self.entities if e.active)

    def eye(self) -> np.ndarray:
        s = self.state
        return np.array([s.player_x, s.player_y + EYE, s.player_z])

    def update_matrix(self, aspect: float) -> np.ndarray:
        m = view_projection(self.eye(), self.state.yaw, self.state.pitch, aspect)
        flat = m.astype(np.float32).ravel()
        ctypes.memmove(self.state.view_proj, flat.ctypes.data, 64)
        return m

    def look_at(self, i: int) -> None:
        e = self.entities[i]
        _n, _t, _en, h, *_ = self.kind(e)
        d = np.array([e.x, e.y + h * 0.5, e.z]) - self.eye()
        self.state.yaw = math.atan2(d[0], -d[2])
        self.state.pitch = math.atan2(d[1], math.hypot(d[0], d[2]))

    def info(self) -> dict:
        return {
            "pid": os.getpid(),
            "state": ctypes.addressof(self.state),
            "player_health": ctypes.addressof(self.state) + GameState.player_health.offset,
            "matrix": ctypes.addressof(self.state) + GameState.view_proj.offset,
            "entities": ctypes.addressof(self.entities),
            "entity_ptrs": ctypes.addressof(self.ptrs),
            "entities_field": ctypes.addressof(self.state) + GameState.entities.offset,
            "entity_size": ctypes.sizeof(Entity),
            "klass": {KINDS[i][0]: ctypes.addressof(k) for i, k in enumerate(self.klasses)},
        }


class _Control(QObject):
    command = Signal(str)


class ArenaWidget(QWidget):
    def __init__(self, game: Game) -> None:
        super().__init__()
        self.game = game
        self.setWindowTitle("MemScope Übungsarena")
        self.resize(1280, 720)
        self.setMinimumSize(640, 400)
        self.setFocusPolicy(Qt.StrongFocus)
        self.setMouseTracking(False)
        self.keys: set[int] = set()
        self.drag = None
        self.matrix = np.eye(4)
        self.flash = 0.0
        self.message = ""
        self.message_t = 0.0
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.step)
        self.timer.start(16)
        self._last = None
        self.target_index: int | None = None

    # --- input ------------------------------------------------------------
    def keyPressEvent(self, ev) -> None:
        k = ev.key()
        self.keys.add(k)
        s = self.game.state
        if k == Qt.Key_H:
            s.player_health = max(0, s.player_health - self.game.rng.randint(3, 12))
            self.flash = 1.0
            self.say(f"Autsch! Leben jetzt {s.player_health}")
        elif k == Qt.Key_R:
            s.player_health = 100
            s.ammo = 30
            self.say("Geheilt und nachgeladen")
        elif k == Qt.Key_Space:
            self.shoot()
        elif k == Qt.Key_P:
            self.game.freeze = not self.game.freeze
            self.say("Pause: Tiere stehen still" if self.game.freeze else "Weiter geht's")
        super().keyPressEvent(ev)

    def keyReleaseEvent(self, ev) -> None:
        self.keys.discard(ev.key())

    def mousePressEvent(self, ev) -> None:
        if ev.button() == Qt.LeftButton:
            self.drag = ev.position()

    def mouseMoveEvent(self, ev) -> None:
        if self.drag is not None:
            d = ev.position() - self.drag
            self.drag = ev.position()
            self.turn(d.x() * 0.005, -d.y() * 0.005)

    def mouseReleaseEvent(self, ev) -> None:
        self.drag = None

    def turn(self, dyaw: float, dpitch: float) -> None:
        s = self.game.state
        s.yaw = (s.yaw + dyaw) % math.tau
        s.pitch = max(-1.4, min(1.4, s.pitch + dpitch))

    def say(self, text: str) -> None:
        self.message, self.message_t = text, 2.5

    def shoot(self) -> None:
        s = self.game.state
        if s.ammo <= 0:
            self.say("Keine Munition mehr – R lädt nach")
            return
        s.ammo -= 1
        i = self.target_index
        if i is None:
            self.say(f"Daneben · Munition {s.ammo}")
            return
        e = self.game.entities[i]
        e.health = max(0.0, e.health - 5.0)
        name = e.name.decode()
        if e.health <= 0:
            self.game.kill(i)
            self.say(f"{name} besiegt! Kommt in 3 s wieder")
        else:
            self.say(f"Treffer: {name} hat noch {e.health:g} Leben")

    def command(self, cmd: str) -> None:
        """Used by the tests through stdin."""
        parts = cmd.split()
        if not parts:
            return
        s = self.game.state
        if parts[0] == "damage":
            s.player_health -= int(parts[1])
        elif parts[0] == "look":
            self.game.look_at(int(parts[1]))
        elif parts[0] == "turn":
            self.turn(float(parts[1]), 0.0)
        elif parts[0] == "hit":
            e = self.game.entities[int(parts[1])]
            e.health = max(0.0, e.health - float(parts[2]))
        elif parts[0] == "quit":
            QApplication.quit()
        print("ok", flush=True)

    # --- simulation ---------------------------------------------------------
    def step(self) -> None:
        now = time.monotonic()
        dt = 0.016 if self._last is None else min(0.1, now - self._last)
        self._last = now
        s = self.game.state
        speed = 6.0 * dt
        fwd = np.array([math.sin(s.yaw), 0, -math.cos(s.yaw)])
        right = np.array([math.cos(s.yaw), 0, math.sin(s.yaw)])
        move = np.zeros(3)
        if Qt.Key_W in self.keys:
            move += fwd
        if Qt.Key_S in self.keys:
            move -= fwd
        if Qt.Key_D in self.keys:
            move += right
        if Qt.Key_A in self.keys:
            move -= right
        if np.linalg.norm(move) > 0:
            move = move / np.linalg.norm(move) * speed
            s.player_x = float(max(-ARENA, min(ARENA, s.player_x + move[0])))
            s.player_z = float(max(-ARENA, min(ARENA, s.player_z + move[2])))
        if Qt.Key_Left in self.keys:
            self.turn(-1.8 * dt, 0)
        if Qt.Key_Right in self.keys:
            self.turn(1.8 * dt, 0)
        if Qt.Key_Up in self.keys:
            self.turn(0, 1.2 * dt)
        if Qt.Key_Down in self.keys:
            self.turn(0, -1.2 * dt)
        self.game.tick(dt)
        self.flash = max(0.0, self.flash - dt * 2)
        self.message_t = max(0.0, self.message_t - dt)
        self.matrix = self.game.update_matrix(self.width() / max(1, self.height()))
        self.update()

    # --- drawing ------------------------------------------------------------
    def project(self, p) -> tuple[float, float, float] | None:
        c = self.matrix @ np.array([p[0], p[1], p[2], 1.0])
        if c[3] < NEAR:
            return None
        return (c[0] / c[3] + 1) * 0.5 * self.width(), (1 - c[1] / c[3]) * 0.5 * self.height(), c[3]

    def line(self, painter: QPainter, a, b) -> None:
        ca = self.matrix @ np.array([*a, 1.0])
        cb = self.matrix @ np.array([*b, 1.0])
        if ca[3] < NEAR and cb[3] < NEAR:
            return
        if ca[3] < NEAR:
            ca = ca + (cb - ca) * (NEAR - ca[3]) / (cb[3] - ca[3])
        elif cb[3] < NEAR:
            cb = cb + (ca - cb) * (NEAR - cb[3]) / (ca[3] - cb[3])
        w, h = self.width(), self.height()
        pa = QPointF((ca[0] / ca[3] + 1) * 0.5 * w, (1 - ca[1] / ca[3]) * 0.5 * h)
        pb = QPointF((cb[0] / cb[3] + 1) * 0.5 * w, (1 - cb[1] / cb[3]) * 0.5 * h)
        painter.drawLine(pa, pb)

    def paintEvent(self, _ev) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        w, h = self.width(), self.height()
        horizon = self.project(self.game.eye() + np.array([math.sin(self.game.state.yaw), 0, -math.cos(self.game.state.yaw)]) * 1000)
        hy = horizon[1] if horizon else h * 0.5
        sky = QLinearGradient(0, 0, 0, max(1.0, hy))
        sky.setColorAt(0, QColor("#0b1026"))
        sky.setColorAt(1, QColor("#3b2a6b"))
        p.fillRect(QRectF(0, 0, w, max(0.0, hy)), sky)
        ground = QLinearGradient(0, hy, 0, h)
        ground.setColorAt(0, QColor("#1f2937"))
        ground.setColorAt(1, QColor("#0f172a"))
        p.fillRect(QRectF(0, hy, w, h - hy), ground)

        p.setPen(QPen(QColor(124, 92, 255, 70), 1))
        for v in range(-int(ARENA), int(ARENA) + 1, 4):
            self.line(p, (v, 0, -ARENA), (v, 0, ARENA))
            self.line(p, (-ARENA, 0, v), (ARENA, 0, v))
        p.setPen(QPen(QColor(34, 211, 238, 120), 2))
        for a, b in [((-ARENA, 0, -ARENA), (ARENA, 0, -ARENA)), ((ARENA, 0, -ARENA), (ARENA, 0, ARENA)),
                     ((ARENA, 0, ARENA), (-ARENA, 0, ARENA)), ((-ARENA, 0, ARENA), (-ARENA, 0, -ARENA))]:
            self.line(p, a, b)

        drawn = []
        for i, e in enumerate(self.game.entities):
            if not e.active:
                continue
            kind = self.game.kind(e)
            feet = self.project((e.x, e.y, e.z))
            head = self.project((e.x, e.y + kind[3], e.z))
            if feet and head:
                drawn.append((feet[2], i, e, kind, feet, head))
        drawn.sort(key=lambda d: -d[0])
        cx, cy = w / 2, h / 2
        best, best_d = None, 1e9
        for depth, i, e, kind, feet, head in drawn:
            self.figure(p, e, kind, feet, head, depth)
            bh = feet[1] - head[1]
            bw = bh * kind[4] / kind[3]
            if feet[0] - bw <= cx <= feet[0] + bw and head[1] <= cy <= feet[1] and depth < best_d:
                best, best_d = i, depth
        self.target_index = best

        p.setPen(QPen(QColor(255, 255, 255, 220), 2))
        p.drawLine(QPointF(cx - 9, cy), QPointF(cx - 3, cy))
        p.drawLine(QPointF(cx + 3, cy), QPointF(cx + 9, cy))
        p.drawLine(QPointF(cx, cy - 9), QPointF(cx, cy - 3))
        p.drawLine(QPointF(cx, cy + 3), QPointF(cx, cy + 9))

        if self.flash > 0:
            p.fillRect(self.rect(), QColor(248, 113, 113, int(90 * self.flash)))
        self.hud(p)
        p.end()

    def figure(self, p: QPainter, e: Entity, kind, feet, head, depth: float) -> None:
        name, _tid, _enemy, height, width, body, headc, _hp = kind
        bh = feet[1] - head[1]
        if bh < 2:
            return
        bw = bh * width / height
        fog = max(0.25, min(1.0, 1.25 - depth / 70))
        x0 = feet[0]
        p.setPen(Qt.NoPen)
        p.setBrush(QColor(0, 0, 0, int(90 * fog)))
        p.drawEllipse(QPointF(x0, feet[1]), bw * 0.6, bw * 0.15)
        col = QColor(body)
        col.setAlphaF(fog)
        hcol = QColor(headc)
        hcol.setAlphaF(fog)
        if name == "Schaf":
            p.setBrush(col)
            p.drawRoundedRect(QRectF(x0 - bw / 2, feet[1] - bh * 0.75, bw, bh * 0.55), bw * 0.2, bw * 0.2)
            p.setBrush(hcol)
            p.drawRoundedRect(QRectF(x0 + bw * 0.3, feet[1] - bh, bw * 0.3, bh * 0.38), 4, 4)
            p.setBrush(QColor(60, 60, 60, int(255 * fog)))
            for lx in (-0.35, -0.1, 0.15, 0.35):
                p.drawRect(QRectF(x0 + bw * lx - bw * 0.04, feet[1] - bh * 0.22, bw * 0.08, bh * 0.22))
            return
        head_r = bh * 0.13
        p.setBrush(col)
        p.drawRoundedRect(QRectF(x0 - bw / 2, head[1] + head_r * 2, bw, bh - head_r * 2.2), bw * 0.25, bw * 0.25)
        p.setBrush(hcol)
        p.drawEllipse(QPointF(x0, head[1] + head_r), head_r, head_r)
        if name == "Hexe":
            hat = QPolygonF([QPointF(x0 - head_r * 1.6, head[1] + head_r * 0.6), QPointF(x0 + head_r * 1.6, head[1] + head_r * 0.6),
                             QPointF(x0 + head_r * 0.3, head[1] - head_r * 1.8)])
            p.setBrush(QColor(59, 7, 100, int(255 * fog)))
            p.drawPolygon(hat)

    def hud(self, p: QPainter) -> None:
        s = self.game.state
        p.setPen(Qt.NoPen)
        p.setBrush(QColor(15, 17, 23, 200))
        p.drawRoundedRect(QRectF(16, 16, 330, 150), 12, 12)
        p.setPen(QColor("#e6e9f0"))
        p.setFont(QFont("Segoe UI", 13, QFont.Bold))
        p.drawText(QPointF(32, 44), "Übungsarena")
        p.setFont(QFont("Segoe UI", 10))
        p.setPen(QColor("#f87171") if s.player_health < 40 else QColor("#e6e9f0"))
        p.drawText(QPointF(32, 70), f"Leben: {s.player_health}")
        p.setPen(QColor("#e6e9f0"))
        p.drawText(QPointF(160, 70), f"Munition: {s.ammo}")
        p.setPen(QColor("#8a93a6"))
        p.drawText(QPointF(32, 94), f"Position: {s.player_x:.2f} / {s.player_y:.2f} / {s.player_z:.2f}")
        p.drawText(QPointF(32, 116), f"Lebewesen: {s.entity_count}" + ("   · Pause" if self.game.freeze else ""))
        if self.target_index is not None:
            e = self.game.entities[self.target_index]
            p.setPen(QColor("#22d3ee"))
            p.drawText(QPointF(32, 140), f"Im Visier: {e.name.decode()} · Leben {e.health:g}/{e.max_health:g}")
            p.setPen(QColor("#8a93a6"))
            p.drawText(QPointF(32, 158), f"bei {e.x:.1f} / {e.y:.1f} / {e.z:.1f}")
        else:
            p.drawText(QPointF(32, 140), "Im Visier: –")
        help_text = "WASD laufen · Maus ziehen oder Pfeiltasten: umsehen · Leertaste schießen · H Schaden · R heilen · P Pause"
        p.setFont(QFont("Segoe UI", 9))
        fm = p.fontMetrics()
        tw = fm.horizontalAdvance(help_text) + 28
        r = QRectF((self.width() - tw) / 2, self.height() - 44, tw, 28)
        p.setPen(Qt.NoPen)
        p.setBrush(QColor(15, 17, 23, 190))
        p.drawRoundedRect(r, 14, 14)
        p.setPen(QColor("#c7cbd6"))
        p.drawText(r, Qt.AlignCenter, help_text)
        if self.message_t > 0:
            p.setFont(QFont("Segoe UI", 12, QFont.Bold))
            fm = p.fontMetrics()
            tw = fm.horizontalAdvance(self.message) + 36
            r = QRectF((self.width() - tw) / 2, 24, tw, 36)
            p.setPen(Qt.NoPen)
            c = QColor(124, 92, 255, int(220 * min(1.0, self.message_t)))
            p.setBrush(c)
            p.drawRoundedRect(r, 18, 18)
            p.setPen(QColor(255, 255, 255, int(255 * min(1.0, self.message_t))))
            p.drawText(r, Qt.AlignCenter, self.message)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="MemScope Übungsarena")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--freeze", action="store_true", help="Lebewesen bewegen sich nicht")
    ap.add_argument("--info", action="store_true", help="Adressen als JSON ausgeben (für Tests)")
    ap.add_argument("--control", action="store_true", help="Befehle von stdin lesen (für Tests)")
    args = ap.parse_args(argv)

    app = QApplication.instance() or QApplication(sys.argv[:1])
    game = Game(seed=args.seed, freeze=args.freeze)
    win = ArenaWidget(game)
    win.show()
    if args.info:
        print(json.dumps(game.info()), flush=True)
    if args.control:
        ctl = _Control()
        ctl.command.connect(win.command)

        def reader() -> None:
            for line in sys.stdin:
                ctl.command.emit(line.strip())
            ctl.command.emit("quit")

        threading.Thread(target=reader, daemon=True).start()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
