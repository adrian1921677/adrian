"""Per-game profiles: everything found for one game, saved as JSON.

Profiles live in `profile/<exe name>.json` next to the program and are loaded
automatically the next time the same game is opened.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .address import AddressRef
from .entities import EntityConfig
from .projection import ROW

PROFILE_DIR = Path(__file__).resolve().parent.parent / "profile"


@dataclass
class WatchEntry:
    label: str
    ref: AddressRef
    vtype: str = "int32"

    def to_json(self) -> dict:
        return {"label": self.label, "ref": self.ref.to_json(), "vtype": self.vtype}

    @classmethod
    def from_json(cls, d: dict) -> "WatchEntry":
        return cls(str(d.get("label", "")), AddressRef.from_json(d.get("ref")), str(d.get("vtype", "int32")))


@dataclass
class CameraConfig:
    ref: AddressRef = field(default_factory=lambda: AddressRef(""))
    layout: str = ROW

    def to_json(self) -> dict:
        return {"ref": self.ref.to_json(), "layout": self.layout}

    @classmethod
    def from_json(cls, d: dict | None) -> "CameraConfig":
        d = d or {}
        return cls(AddressRef.from_json(d.get("ref")), str(d.get("layout", ROW)))


@dataclass
class OverlayStyle:
    style: str = "glow"  # glow | box | corners
    enemy_color: str = "#ff4d6d"
    other_color: str = "#22d3ee"
    thickness: float = 2.0
    width_ratio: float = 0.5
    show_others: bool = False
    show_names: bool = True
    show_distance: bool = True
    show_health: bool = True
    show_lines: bool = False
    max_distance: float = 0.0  # 0 = no limit
    only_foreground: bool = True
    show_status: bool = True

    @classmethod
    def from_json(cls, d: dict | None) -> "OverlayStyle":
        d = d or {}
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Profile:
    process: str
    watch: list[WatchEntry] = field(default_factory=list)
    entities: EntityConfig = field(default_factory=EntityConfig)
    camera: CameraConfig = field(default_factory=CameraConfig)
    overlay: OverlayStyle = field(default_factory=OverlayStyle)

    @property
    def path(self) -> Path:
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", self.process or "unbekannt")
        return PROFILE_DIR / f"{safe}.json"

    def to_json(self) -> dict:
        return {
            "version": 1,
            "process": self.process,
            "watch": [w.to_json() for w in self.watch],
            "entities": self.entities.to_json(),
            "camera": self.camera.to_json(),
            "overlay": asdict(self.overlay),
        }

    def save(self) -> None:
        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.to_json(), indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.path)

    @classmethod
    def from_json(cls, d: dict) -> "Profile":
        return cls(
            process=str(d.get("process", "")),
            watch=[WatchEntry.from_json(w) for w in d.get("watch", [])],
            entities=EntityConfig.from_json(d.get("entities")),
            camera=CameraConfig.from_json(d.get("camera")),
            overlay=OverlayStyle.from_json(d.get("overlay")),
        )

    @classmethod
    def load(cls, process: str) -> tuple["Profile", bool]:
        """Profile for this process name, and whether it existed already."""
        p = cls(process)
        if p.path.exists():
            try:
                return cls.from_json(json.loads(p.path.read_text(encoding="utf-8"))), True
            except (OSError, ValueError, TypeError, KeyError):
                pass
        return p, False


def export_csv(path: str, header: list[str], rows: list[list[str]]) -> None:
    # utf-8-sig so Excel shows umlauts correctly; ';' is what German Excel expects.
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(header)
        w.writerows(rows)
