"""End-to-end tests against the practice arena running as a real second process."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from memscope import projection as P  # noqa: E402
from memscope import scanner as S  # noqa: E402
from memscope import values as V  # noqa: E402
from memscope.address import AddressRef  # noqa: E402
from memscope.backend import open_process  # noqa: E402
from memscope.entities import (  # noqa: E402
    ARRAY,
    ENEMY_RULES,
    POINTERS,
    SIGNATURE,
    EntityConfig,
    EntityReader,
    Layout,
    Source,
    build_report,
    scan_signature,
    signature_from_object,
)
from memscope.pointers import find_pointers  # noqa: E402


class Arena:
    def __init__(self) -> None:
        env = dict(os.environ, QT_QPA_PLATFORM="offscreen")
        self.p = subprocess.Popen(
            [sys.executable, "-m", "memscope.demo", "--info", "--control", "--seed", "7", "--freeze"],
            cwd=ROOT, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
        )
        self.info = json.loads(self.p.stdout.readline())
        self.proc = open_process(self.info["pid"], "arena")

    def send(self, cmd: str) -> None:
        self.p.stdin.write(cmd + "\n")
        self.p.stdin.flush()
        assert self.p.stdout.readline().strip() == "ok"
        time.sleep(0.1)  # let a frame run so the matrix is updated

    def close(self) -> None:
        self.proc.close()
        self.p.kill()
        self.p.wait()


@pytest.fixture(scope="module")
def arena():
    a = Arena()
    time.sleep(0.3)
    yield a
    a.close()


def nothing(*_a):
    return False


def test_scan_exact_then_next(arena):
    sc = S.Scanner(arena.proc)
    vt = V.get("int32")
    res = sc.first_scan(S.ScanSettings(vt, S.EXACT, "100"), nothing, nothing)
    assert res.count() > 0
    arena.send("damage 13")
    res = sc.next_scan(res, S.ScanSettings(vt, S.EXACT, "87"), nothing, nothing)
    addrs = [a for a, _ in res.first(1000)]
    assert arena.info["player_health"] in addrs
    arena.send("damage 2")
    res = sc.next_scan(res, S.ScanSettings(vt, S.DECREASED_BY, "2"), nothing, nothing)
    assert arena.info["player_health"] in [a for a, _ in res.first(1000)]


def test_scan_unknown_then_decreased(arena):
    sc = S.Scanner(arena.proc)
    vt = V.get("float")
    res = sc.first_scan(S.ScanSettings(vt, S.UNKNOWN), nothing, nothing)
    assert res.count() > 1000
    health0 = arena.info["entities"] + 0x30  # entity 0 health
    arena.send("hit 0 5")
    res = sc.next_scan(res, S.ScanSettings(vt, S.DECREASED), nothing, nothing)
    res = sc.next_scan(res, S.ScanSettings(vt, S.UNCHANGED), nothing, nothing)
    assert health0 in [a for a, _ in res.first(res.count())]


def test_text_scan(arena):
    sc = S.Scanner(arena.proc)
    res = sc.first_scan(S.ScanSettings(V.get("utf8"), S.EXACT, "ARENA01"), nothing, nothing)
    assert arena.info["state"] in [a for a, _ in res.first(100)]


def arena_layout() -> Layout:
    return Layout(pos_x="20", pos_y="24", pos_z="28", health="30", max_health="34", name="8", type_id="18", height=1.95)


def test_entities_array_and_enemy_rules(arena):
    cfg = EntityConfig(
        layout=arena_layout(),
        sources=[Source(kind=ARRAY, label="Alle", ref=AddressRef(f"{arena.info['entities']:X}"), stride="40", count=32, enemy=ENEMY_RULES)],
        enemy_words=["hexe", "zombie", "skelett"],
    )
    reader = EntityReader(arena.proc, cfg)
    ents = reader.read()
    assert len(ents) == 32
    valid = [e for e in ents if e.valid]
    assert len(valid) == 22  # the arena spawns 22, the other slots are empty
    assert all(e.problem for e in ents if not e.valid)
    for e in valid:
        assert e.enemy == (e.name in ("Hexe", "Zombie", "Skelett"))
    report = build_report([reader.read(), reader.read()])
    assert report.valid == 22 and report.enemies == sum(e.enemy for e in valid)


def test_entities_pointer_list(arena):
    cfg = EntityConfig(layout=arena_layout(), sources=[Source(kind=POINTERS, ref=AddressRef(f"{arena.info['entity_ptrs']:X}"), count=32)])
    ents = EntityReader(arena.proc, cfg).read()
    assert len([e for e in ents if e.valid]) == 22


def test_signature_finds_one_class(arena):
    base = arena.info["entities"]
    reader = EntityReader(arena.proc, EntityConfig(layout=arena_layout(), sources=[Source(kind=ARRAY, ref=AddressRef(f"{base:X}"), stride="40", count=32)]))
    first = reader.read()[0]
    sig = signature_from_object(arena.proc, first.address)
    assert sig is not None
    src = Source(kind=SIGNATURE, sig_value=sig, label=first.name)
    hits = scan_signature(arena.proc, src)
    cfg = EntityConfig(layout=arena_layout(), sources=[src])
    reader2 = EntityReader(arena.proc, cfg)
    reader2._sig_scans[0].stop()
    reader2._sig_scans[0].addresses = hits
    found = [e for e in reader2.read() if e.valid]
    assert found and all(e.name == first.name for e in found)
    same = sum(1 for e in reader.read() if e.valid and e.name == first.name)
    assert len(found) == same


def test_matrix_finder(arena):
    reader = EntityReader(arena.proc, EntityConfig(layout=arena_layout(), sources=[Source(kind=ARRAY, ref=AddressRef(f"{arena.info['entities']:X}"), stride="40", count=32)]))
    ents = [e for e in reader.read() if e.valid]
    target = ents[3]
    centre = (target.pos[0], target.pos[1] + 1.95 / 2, target.pos[2])
    arena.send("look 3")
    cands = P.find_matrix(arena.proc, centre, nothing, nothing)
    assert any(c.address == arena.info["matrix"] and c.layout == P.ROW for c in cands)
    arena.send("turn 1.2")
    cands = P.refine(arena.proc, cands, centre, want_center=False)
    arena.send("look 3")
    cands = P.refine(arena.proc, cands, centre, want_center=True)
    assert arena.info["matrix"] in [c.address for c in cands]
    m = P.read_matrix(arena.proc, arena.info["matrix"])
    sx, sy, _w = P.world_to_screen(m, P.ROW, centre, 1280, 720)
    assert abs(sx - 640) < 2 and abs(sy - 360) < 2
    cam = P.camera_position(m, P.ROW)
    assert cam is not None and np.allclose(cam, [0.0, 1.7, 12.0], atol=1e-2)


def test_pointer_search(arena):
    # The GameState holds a pointer to the entity array.
    hits = find_pointers(arena.proc, arena.info["entities"] + 0x40 * 2, 0x100, nothing, nothing)
    assert any(h.address == arena.info["entities_field"] and h.offset == 0x80 for h in hits)
