"""Shared state of the running program: the opened game and its profile."""

from __future__ import annotations

from PySide6.QtCore import QObject, QTimer, Signal

from . import projection as P
from .backend import ProcessHandle, open_process
from .entities import Entity, EntityReader
from .profile import Profile


class Session(QObject):
    attached = Signal()
    detached = Signal(str)  # reason
    entities_changed = Signal()  # entity config edited -> reader rebuilt
    camera_changed = Signal()
    watch_changed = Signal()
    status = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self.proc: ProcessHandle | None = None
        self.profile: Profile | None = None
        self.profile_existed = False
        self.reader: EntityReader | None = None
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(800)
        self._save_timer.timeout.connect(self.save_now)
        self._alive = QTimer(self)
        self._alive.setInterval(1000)
        self._alive.timeout.connect(self._check_alive)

    # --- process -------------------------------------------------------------
    def attach(self, pid: int, name: str, profile_name: str | None = None) -> None:
        self.detach(quiet=True)
        self.proc = open_process(pid, name)  # raises AttachError
        self.profile, self.profile_existed = Profile.load(profile_name or name)
        self._rebuild_reader()
        self._alive.start()
        self.attached.emit()

    def detach(self, reason: str = "", quiet: bool = False) -> None:
        if self.proc is None:
            return
        self.save_now()
        self._alive.stop()
        if self.reader:
            self.reader.stop()
            self.reader = None
        self.proc.close()
        self.proc = None
        self.profile = None
        if not quiet:
            self.detached.emit(reason)

    def _check_alive(self) -> None:
        if self.proc is not None and not self.proc.is_alive():
            self.detach("Das Spiel wurde beendet.")

    @property
    def pointer_size(self) -> int:
        return self.proc.pointer_size if self.proc else 8

    # --- profile ------------------------------------------------------------
    def changed(self) -> None:
        """Something in the profile changed; save soon."""
        self._save_timer.start()

    def save_now(self) -> None:
        if self.profile is not None:
            try:
                self.profile.save()
            except OSError as exc:
                self.status.emit(f"Profil konnte nicht gespeichert werden: {exc}")

    def entities_edited(self) -> None:
        self._rebuild_reader()
        self.changed()
        self.entities_changed.emit()

    def camera_edited(self) -> None:
        self.changed()
        self.camera_changed.emit()

    def watch_edited(self) -> None:
        self.changed()
        self.watch_changed.emit()

    def _rebuild_reader(self) -> None:
        old = self.reader
        self.reader = EntityReader(self.proc, self.profile.entities) if self.proc and self.profile else None
        if old:
            old.stop()
            if self.reader:
                self.reader.adopt(old)

    # --- live data ------------------------------------------------------------
    def matrix(self):
        if not self.proc or not self.profile:
            return None
        addr = self.profile.camera.ref.resolve(self.proc)
        return P.read_matrix(self.proc, addr)

    def read_entities(self, with_distance: bool = True) -> list[Entity]:
        if not self.reader:
            return []
        ents = self.reader.read()
        if with_distance:
            m = self.matrix()
            cam = P.camera_position(m, self.profile.camera.layout) if m is not None else None
            if cam is not None:
                for e in ents:
                    if e.pos is not None:
                        d = ((e.pos[0] - cam[0]) ** 2 + (e.pos[1] - cam[1]) ** 2 + (e.pos[2] - cam[2]) ** 2) ** 0.5
                        e.distance = d
        return ents
