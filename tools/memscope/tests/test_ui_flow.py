"""Clicks through the whole workflow in the real UI (offscreen), with the arena in this process."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

from memscope.app import MainWindow  # noqa: E402
from memscope.demo.arena import ArenaWidget, Game  # noqa: E402
from memscope.entities import SIGNATURE  # noqa: E402
from memscope.processes import ProcInfo  # noqa: E402
from memscope.profile import Profile  # noqa: E402
from memscope.ui import theme as T  # noqa: E402

PROFILE = "pytest_ui_flow"


def pump(app, seconds=0.1):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        app.processEvents()
        time.sleep(0.01)


def wait_for(app, cond, timeout=20.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        app.processEvents()
        if cond():
            return True
        time.sleep(0.02)
    return False


@pytest.fixture()
def setup():
    app = QApplication.instance() or QApplication([])
    app.setStyleSheet(T.stylesheet())
    Profile(PROFILE).path.unlink(missing_ok=True)
    game = Game(seed=11, freeze=True)
    arena = ArenaWidget(game)
    arena.show()
    win = MainWindow()
    win.show()
    pump(app)
    yield app, game, arena, win
    win.close()
    arena.close()
    Profile(PROFILE).path.unlink(missing_ok=True)


def test_full_workflow(setup):
    app, game, arena, win = setup
    info = game.info()
    win.attach(ProcInfo(os.getpid(), "Übungsarena", PROFILE, "x", 0, is_demo=True))
    assert win.s.proc is not None
    assert win.stack.currentIndex() == 1  # new profile -> start with the value search

    # Find the player's health with two scans.
    win.p_scan.value.setText("100")
    win.p_scan.scan()
    assert wait_for(app, lambda: win.p_scan.worker is None)
    game.state.player_health = 61
    win.p_scan.value.setText("61")
    win.p_scan.scan()
    assert wait_for(app, lambda: win.p_scan.worker is None)
    assert info["player_health"] in [a for a, _ in win.p_scan.shown]
    win.p_scan.add_to_watch.emit(info["player_health"], "int32")
    assert win.s.profile.watch[-1].ref.resolve(win.s.proc) == info["player_health"]

    # Describe one creature from the struct view (what the right-click menu does).
    e0 = info["entities"]
    win.open_struct(e0 + 0x30)
    assert win.stack.currentIndex() == 3
    win.p_struct.use_base.emit(e0)
    for key, off in (("pos_x", 0x20), ("health", 0x30), ("max_health", 0x34), ("name", 0x08)):
        win.p_struct.use_field.emit(key, e0, off)
    lay = win.s.profile.entities.layout
    assert (lay.pos_x, lay.pos_y, lay.pos_z, lay.health, lay.name) == ("20", "24", "28", "30", "8")
    ents = win.s.read_entities()
    assert len(ents) == 1 and ents[0].valid and ents[0].name == game.entities[0].name.decode()

    # "Alle dieser Art finden": signature search for the same class.
    win.go(4)
    win.p_entity.sources.setCurrentRow(0)
    win.p_entity.find_similar()
    sources = win.s.profile.entities.sources
    assert sources[-1].kind == SIGNATURE
    same = sum(1 for e in game.entities if e.active and e.type_id == game.entities[0].type_id)
    assert wait_for(app, lambda: sum(1 for e in win.s.read_entities() if e.valid and e.source == 1) == same)

    # The test button reports success.
    win.p_entity.run_test()
    assert wait_for(app, lambda: win.p_entity.test_btn.isEnabled(), timeout=10)
    assert "bestanden" in win.p_entity.result_text.text()

    # Camera matrix via the finder (no countdown in tests).
    win.go(5)
    ov = win.p_overlay
    ov._fill_refs()
    target_idx = 0
    ov.ref_obj.setCurrentIndex(target_idx)
    key = ov.ref_obj.currentData()
    slot = next(e for e in win.s.read_entities() if e.key == tuple(key))
    index = next(i for i in range(32) if game.entities[i].active and abs(game.entities[i].x - slot.pos[0]) < 1e-4)
    game.look_at(index)
    pump(app, 0.15)
    ov.countdown.setChecked(False)
    ov._step("find")
    assert wait_for(app, lambda: ov.worker is None, timeout=60)
    assert info["matrix"] in [c.address for c in ov.cands]
    game.state.yaw += 1.3
    pump(app, 0.15)
    ov._step("away")
    game.look_at(index)
    pump(app, 0.15)
    ov._step("back")
    assert info["matrix"] in [c.address for c in ov.cands]
    ov.cand_table.selectRow([c.address for c in ov.cands].index(info["matrix"]))
    ov._take()
    assert win.s.matrix() is not None

    # Start the overlay and check that it marks enemies.
    win.s.profile.overlay.only_foreground = False
    ov.toggle_overlay()
    assert ov.overlay.isVisible()
    ov.overlay.tick()
    assert any(i.enemy for i in ov.overlay.items) or not any(e.enemy for e in win.s.read_entities())
    ov.toggle_overlay()
    assert not ov.overlay.isVisible()

    # Everything ends up in the saved profile.
    win.s.save_now()
    saved, existed = Profile.load(PROFILE)
    assert existed and saved.camera.ref.base and len(saved.entities.sources) == 2 and saved.watch
