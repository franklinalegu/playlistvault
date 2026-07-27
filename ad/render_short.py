#!/usr/bin/env python3
"""
15-second 16:9 social cut.

Composed as its own edit rather than trimmed out of the master: cutting the
long version would slice sub-drops and reverb tails mid-decay. Reuses the same
scene functions from render.py with a tighter scene list and faster pacing.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, "/home/user/PlaylistVault/ad")
import render as R  # noqa: E402

FPS = R.FPS
ROOT = Path("/home/user/PlaylistVault/ad")
OUT = ROOT / "out_s"
OUT.mkdir(parents=True, exist_ok=True)

# Only the highest-impact beats, tightened.
SCENES = [
    (2.6, R.sc_logo),
    (2.4, R.sc_hook),
    (2.6, R.sc_analyze),
    (3.4, R.sc_download),
    (2.4, R.sc_privacy),
    (3.2, R.sc_endcard),
]
TRANS = 0.38


def render() -> float:
    starts, acc = [], 0.0
    for d, _ in SCENES:
        starts.append(acc)
        acc += d - TRANS
    total = acc + TRANS
    n = int(total * FPS)
    print(f"short: {len(SCENES)} scenes, {total:.2f}s, {n} frames")

    for fi in range(n):
        t = fi / FPS
        active = []
        for si, (d, fn) in enumerate(SCENES):
            st = starts[si]
            if st - 1e-6 <= t < st + d:
                active.append((si, R.clamp01((t - st) / d)))
        if not active:
            active = [(len(SCENES) - 1, 1.0)]

        si, p = active[0]
        img = SCENES[si][1](p, t)

        if len(active) > 1:
            sj, q = active[1]
            nxt = SCENES[sj][1](q, t)
            w = R.ease_in_out_cubic(R.clamp01((t - starts[sj]) / TRANS))
            img = Image.blend(img, nxt, w)
            img = R.chroma(img, int(3 * math.sin(w * math.pi)))

        arr = np.asarray(img).astype(np.int16)
        noise = np.random.default_rng(fi).integers(-4, 5, arr.shape, dtype=np.int16)
        img = Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))
        img.save(OUT / f"s{fi:05d}.png", compress_level=1)
        if fi % 60 == 0:
            print(f"  {fi}/{n}")

    print(f"done {n} frames {total:.2f}s")
    return total


if __name__ == "__main__":
    d = render()
    (ROOT / "duration_s.txt").write_text(str(d))
