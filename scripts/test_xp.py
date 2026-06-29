#!/usr/bin/env python3
"""Verify XP calculations and economy."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def test_level_math() -> None:
    assert server.xp_level_from_total(0) == 1
    assert server.xp_level_from_total(999) == 1
    assert server.xp_level_from_total(1000) == 2
    assert server.xp_level_from_total(2500) == 3
    assert server.xp_threshold_for_level(1) == 0
    assert server.xp_threshold_for_level(2) == 1000
    assert server.xp_threshold_for_level(7) == 6000

    s = server.xp_state(1500)
    assert s["level"] == 2
    assert s["xpIntoLevel"] == 500
    assert s["xpToNext"] == 500
    assert s["progressPercent"] == 50


def test_economy() -> None:
    assert server.XP_TASK_VALUES["assessment"] == 250
    assert server.XP_TASK_VALUES["improvement"] == 100
    assert server.XP_TASK_VALUES["dailyLogin"] == 25
    assert sum(server.XP_TASK_VALUES.values()) > 0


if __name__ == "__main__":
    test_level_math()
    test_economy()
    print("OK: XP system tests passed")
