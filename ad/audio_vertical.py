#!/usr/bin/env python3
"""
Sound design for the 9:16 vertical cut.

Same synthesis toolkit as audio.py, re-timed to the shorter, punchier social
edit. Social feeds autoplay muted, so this mix leans on strong transient hits
that still read when a viewer unmutes mid-scroll.
"""
from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, "/home/user/PlaylistVault/ad")
import audio as A  # noqa: E402  (reuse the synth primitives)

SR = A.SR
ROOT = Path("/home/user/PlaylistVault/ad")

# Mirrors SCENES in render_vertical.py
DURS = [3.0, 2.6, 2.8, 3.0, 3.6, 3.0, 2.6, 3.4]
TRANS = 0.38


def build(duration: float) -> np.ndarray:
    n = int(duration * SR)
    mix = np.zeros(n, np.float64)
    mix += A.pad(duration, gain=0.13)[:n]

    starts, acc = [], 0.0
    for d in DURS:
        starts.append(acc)
        acc += d - TRANS

    place, rev = A.place, A.reverb

    # 0 hook — hard open
    place(mix, rev(A.sub_drop(2.0, 145, 30, 0.92)), starts[0] + 0.06)
    place(mix, rev(A.chime(1.8, 659.25, 0.14)), starts[0] + 0.30)
    place(mix, rev(A.sub_drop(1.2, 115, 34, 0.55)), starts[0] + 1.55)
    place(mix, A.whoosh(0.7, 0.22), starts[0] + 2.25)

    # 1 paste — keystrokes
    place(mix, rev(A.sub_drop(1.0, 110, 36, 0.44)), starts[1] + 0.05)
    for i in range(12):
        place(mix, A.key_click(gain=0.12), starts[1] + 0.35 + i * 0.055)
    place(mix, A.tick(0.10, 1950, 0.22), starts[1] + 1.25)

    # 2 analyze
    place(mix, A.whoosh(0.5, 0.20), starts[2])
    place(mix, rev(A.chime(1.3, 587.33, 0.20)), starts[2] + 0.28)
    for i in range(5):
        place(mix, A.tick(0.06, 2400 + i * 130, 0.06), starts[2] + 0.5 + i * 0.07)

    # 3 stats — three counters
    for i in range(3):
        place(mix, A.tick(0.12, 1500 + i * 270, 0.18), starts[3] + 0.30 + i * 0.30)
    place(mix, rev(A.sub_drop(1.0, 100, 40, 0.45)), starts[3] + 1.25)

    # 4 download — momentum
    place(mix, A.riser(0.8, 300, 1600, 0.22), starts[4] - 0.45)
    place(mix, rev(A.sub_drop(1.5, 128, 32, 0.75)), starts[4] + 0.04)
    pb = A.pulse_bed(3.5, 80, 0.9)
    place(mix, pb[:int(3.5 * SR)], starts[4] + 0.15)
    for i, at in enumerate((1.1, 1.9, 2.7)):
        place(mix, A.chime(0.8, 784 + i * 45, 0.11), starts[4] + at)

    # 5 features — four snaps
    place(mix, A.whoosh(0.55, 0.17), starts[5] + 0.05)
    for i in range(4):
        place(mix, A.tick(0.09, 1700 + i * 190, 0.15), starts[5] + 0.22 + i * 0.26)

    # 6 privacy — three hits
    for i in range(3):
        place(mix, rev(A.sub_drop(1.0, 118 - i * 8, 34, 0.52)), starts[6] + 0.12 + i * 0.38)

    # 7 endcard — swell
    place(mix, A.riser(1.2, 170, 1200, 0.22), starts[7] - 0.8)
    place(mix, rev(A.sub_drop(2.4, 150, 28, 0.95)), starts[7] + 0.05)
    place(mix, rev(A.chime(2.8, 523.25, 0.26)), starts[7] + 0.32)
    place(mix, rev(A.chime(2.4, 783.99, 0.14)), starts[7] + 0.70)

    # master
    thr, ratio = 0.55, 3.2
    over = np.abs(mix) > thr
    mix[over] = np.sign(mix[over]) * (thr + (np.abs(mix[over]) - thr) / ratio)
    mix = np.tanh(mix * 1.05)
    mix = mix / (np.max(np.abs(mix)) or 1.0) * 0.89
    fo = int(SR * 0.8)
    mix[-fo:] *= np.linspace(1, 0, fo)
    return mix


def main() -> None:
    dur = float((ROOT / "duration_v.txt").read_text().strip())
    print(f"vertical audio for {dur:.2f}s")
    st = A.to_stereo(build(dur))
    pcm = (np.clip(st, -1, 1) * 32767).astype(np.int16)
    out = ROOT / "audio_v.wav"
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", out, pcm.shape)


if __name__ == "__main__":
    main()
