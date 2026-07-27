#!/usr/bin/env python3
"""Sound design for the 15s 16:9 cut — timed to render_short.SCENES."""
from __future__ import annotations
import sys, wave
from pathlib import Path
import numpy as np
sys.path.insert(0, "/home/user/PlaylistVault/ad")
import audio as A

SR = A.SR
ROOT = Path("/home/user/PlaylistVault/ad")
DURS = [2.6, 2.4, 2.6, 3.4, 2.4, 3.2]
TRANS = 0.38


def build(duration: float) -> np.ndarray:
    n = int(duration * SR)
    mix = np.zeros(n, np.float64)
    mix += A.pad(duration, gain=0.13)[:n]
    starts, acc = [], 0.0
    for d in DURS:
        starts.append(acc); acc += d - TRANS
    place, rev = A.place, A.reverb

    # logo
    place(mix, rev(A.sub_drop(1.8, 145, 30, 0.90)), starts[0] + 0.10)
    place(mix, rev(A.chime(1.8, 659.25, 0.15)), starts[0] + 0.38)
    place(mix, A.whoosh(0.7, 0.22), starts[0] + 1.75)
    # hook
    place(mix, rev(A.sub_drop(1.2, 112, 35, 0.60)), starts[1] + 0.08)
    place(mix, rev(A.sub_drop(1.3, 130, 33, 0.70)), starts[1] + 1.15)
    # analyze
    place(mix, A.whoosh(0.5, 0.20), starts[2])
    place(mix, rev(A.chime(1.3, 587.33, 0.21)), starts[2] + 0.28)
    for i in range(5):
        place(mix, A.tick(0.06, 2400 + i * 130, 0.06), starts[2] + 0.5 + i * 0.07)
    # download
    place(mix, A.riser(0.8, 300, 1600, 0.22), starts[3] - 0.45)
    place(mix, rev(A.sub_drop(1.5, 128, 32, 0.75)), starts[3] + 0.04)
    pb = A.pulse_bed(3.3, 80, 0.9)
    place(mix, pb[:int(3.3 * SR)], starts[3] + 0.15)
    for i, at in enumerate((1.0, 1.8, 2.5)):
        place(mix, A.chime(0.8, 784 + i * 45, 0.11), starts[3] + at)
    # privacy
    for i in range(3):
        place(mix, rev(A.sub_drop(0.95, 118 - i * 8, 34, 0.52)), starts[4] + 0.10 + i * 0.34)
    # end
    place(mix, A.riser(1.1, 170, 1200, 0.22), starts[5] - 0.75)
    place(mix, rev(A.sub_drop(2.3, 150, 28, 0.95)), starts[5] + 0.05)
    place(mix, rev(A.chime(2.6, 523.25, 0.26)), starts[5] + 0.30)
    place(mix, rev(A.chime(2.2, 783.99, 0.14)), starts[5] + 0.68)

    thr, ratio = 0.55, 3.2
    over = np.abs(mix) > thr
    mix[over] = np.sign(mix[over]) * (thr + (np.abs(mix[over]) - thr) / ratio)
    mix = np.tanh(mix * 1.05)
    mix = mix / (np.max(np.abs(mix)) or 1.0) * 0.89
    fo = int(SR * 0.8)
    mix[-fo:] *= np.linspace(1, 0, fo)
    return mix


def main() -> None:
    dur = float((ROOT / "duration_s.txt").read_text().strip())
    st = A.to_stereo(build(dur))
    pcm = (np.clip(st, -1, 1) * 32767).astype(np.int16)
    out = ROOT / "audio_s.wav"
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", out, dur)


if __name__ == "__main__":
    main()
