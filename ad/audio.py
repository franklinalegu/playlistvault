#!/usr/bin/env python3
"""
Sound design for the PlaylistVault advertorial.

No voiceover and no music library — every sound is synthesised from scratch
with numpy: sub-drops, risers, UI ticks, whooshes, and an ambient pad bed.
Mixed to a single 48 kHz stereo WAV timed against the rendered scene list.
"""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 48_000
ROOT = Path("/home/user/PlaylistVault/ad")

rng = np.random.default_rng(7)


def t_arr(dur: float) -> np.ndarray:
    return np.linspace(0, dur, int(SR * dur), endpoint=False)


def env_ad(n: int, attack: float, decay: float, curve: float = 2.5) -> np.ndarray:
    """Attack/decay envelope."""
    a = max(1, int(n * attack))
    d = max(1, n - a)
    return np.concatenate([
        np.linspace(0, 1, a) ** 0.6,
        (np.linspace(1, 0, d) ** curve),
    ])[:n]


def sub_drop(dur=1.5, f0=120.0, f1=32.0, gain=0.9) -> np.ndarray:
    """Cinematic sub hit — the classic trailer impact."""
    t = t_arr(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 4.0)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) * env_ad(len(t), 0.004, 0.996, 3.0)
    # a little saturation for body
    sig = np.tanh(sig * 1.7)
    return sig * gain


def riser(dur=2.0, f0=180.0, f1=2400.0, gain=0.32) -> np.ndarray:
    """Noise + tone riser leading into a cut."""
    t = t_arr(dur)
    k = (t / dur) ** 1.9
    f = f0 + (f1 - f0) * k
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(ph) * 0.5 + np.sin(ph * 1.5) * 0.2
    noise = rng.normal(0, 1, len(t))
    # sweep a one-pole highpass on the noise
    a = np.clip(k, 0.02, 0.99)
    hp = np.zeros_like(noise)
    prev_in = prev_out = 0.0
    for i in range(len(noise)):
        c = a[i]
        prev_out = c * (prev_out + noise[i] - prev_in)
        prev_in = noise[i]
        hp[i] = prev_out
    env = (t / dur) ** 2.2
    return (tone * 0.55 + hp * 0.45) * env * gain


def whoosh(dur=0.75, gain=0.34) -> np.ndarray:
    """Filtered noise sweep for transitions."""
    t = t_arr(dur)
    n = rng.normal(0, 1, len(t))
    k = np.sin(np.pi * t / dur) ** 1.4
    # simple resonant band that sweeps up then down
    out = np.zeros_like(n)
    lp1 = lp2 = 0.0
    fc = 300 + 5200 * k
    for i in range(len(n)):
        c = np.clip(2 * np.pi * fc[i] / SR, 0.001, 0.9)
        lp1 += c * (n[i] - lp1)
        lp2 += c * (lp1 - lp2)
        out[i] = lp1 - lp2
    return out * k * gain


def tick(dur=0.09, freq=2100.0, gain=0.20) -> np.ndarray:
    """Crisp UI click."""
    t = t_arr(dur)
    sig = np.sin(2 * np.pi * freq * t) * np.exp(-t * 90)
    sig += rng.normal(0, 0.35, len(t)) * np.exp(-t * 160)
    return sig * gain


def key_click(dur=0.05, gain=0.10) -> np.ndarray:
    """Soft keystroke."""
    t = t_arr(dur)
    sig = rng.normal(0, 1, len(t)) * np.exp(-t * 220)
    sig += np.sin(2 * np.pi * 1400 * t) * np.exp(-t * 150) * 0.4
    return sig * gain


def chime(dur=1.6, root=523.25, gain=0.24) -> np.ndarray:
    """Bright confirmation chime (major triad, bell-like decay)."""
    t = t_arr(dur)
    sig = np.zeros_like(t)
    for mult, amp, dec in ((1.0, 1.0, 3.2), (1.26, 0.55, 4.0), (1.5, 0.42, 4.6), (2.0, 0.28, 5.5)):
        sig += np.sin(2 * np.pi * root * mult * t) * amp * np.exp(-t * dec)
    return sig / 2.3 * gain


def pad(dur: float, gain=0.14) -> np.ndarray:
    """Evolving ambient bed — slow detuned saw stack in A minor."""
    t = t_arr(dur)
    sig = np.zeros_like(t)
    for f, amp in ((110.0, 1.0), (164.81, 0.62), (220.0, 0.5), (329.63, 0.3)):
        for det in (-0.14, 0.0, 0.15):
            ph = 2 * np.pi * (f + det) * t
            # soft saw via summed harmonics
            s = np.sin(ph) + 0.42 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph)
            sig += s * amp
    sig /= 14.0
    # slow LFO shimmer
    lfo = 0.72 + 0.28 * np.sin(2 * np.pi * 0.07 * t)
    # gentle lowpass
    out = np.zeros_like(sig)
    lp = 0.0
    c = 2 * np.pi * 900 / SR
    for i in range(len(sig)):
        lp += c * (sig[i] - lp)
        out[i] = lp
    fade = np.ones_like(t)
    fi = int(SR * 1.5)
    fade[:fi] = np.linspace(0, 1, fi)
    fade[-fi:] = np.linspace(1, 0, fi)
    return out * lfo * fade * gain


def pulse_bed(dur: float, bpm=76.0, gain=0.10) -> np.ndarray:
    """Soft heartbeat pulse to give the middle section momentum."""
    t = t_arr(dur)
    out = np.zeros_like(t)
    step = 60.0 / bpm
    k = 0
    while k * step < dur:
        i = int(k * step * SR)
        hit = sub_drop(0.42, 90, 44, 0.30)
        seg = min(len(hit), len(out) - i)
        if seg > 0:
            out[i:i + seg] += hit[:seg]
        k += 1
    return out * gain


def reverb(x: np.ndarray, decay=0.34, n_taps=7, spread=0.055) -> np.ndarray:
    """Cheap multi-tap reverb for space."""
    out = x.copy()
    for i in range(1, n_taps + 1):
        d = int(SR * spread * i)
        if d >= len(x):
            break
        out[d:] += x[:-d] * (decay ** i)
    return out


def place(mix: np.ndarray, sig: np.ndarray, at: float, gain=1.0) -> None:
    i = int(at * SR)
    if i < 0 or i >= len(mix):
        return
    n = min(len(sig), len(mix) - i)
    mix[i:i + n] += sig[:n] * gain


def build(duration: float) -> np.ndarray:
    n = int(duration * SR)
    mix = np.zeros(n, np.float64)

    # Ambient bed across the whole spot.
    mix += pad(duration)[:n]

    # Scene boundaries (must mirror render.py SCENES with TRANS overlap).
    durs = [3.0, 3.4, 3.2, 3.0, 3.2, 3.4, 5.0, 4.4, 3.6, 3.4, 4.4]
    TRANS = 0.42
    starts, acc = [], 0.0
    for d in durs:
        starts.append(acc)
        acc += d - TRANS

    # 0 logo
    place(mix, reverb(sub_drop(2.0, 140, 30, 0.85)), starts[0] + 0.25)
    place(mix, reverb(chime(2.2, 659.25, 0.16)), starts[0] + 0.55)
    place(mix, whoosh(0.9, 0.22), starts[0] + 1.9)

    # 1 hook — two text beats
    place(mix, reverb(sub_drop(1.2, 110, 36, 0.55)), starts[1] + 0.10)
    place(mix, whoosh(0.6, 0.24), starts[1] + 1.55)
    place(mix, reverb(sub_drop(1.4, 130, 34, 0.72)), starts[1] + 1.70)

    # 2 UI reveal — riser then impact
    place(mix, riser(1.1, 200, 1800, 0.26), starts[2] - 0.6)
    place(mix, reverb(sub_drop(1.6, 120, 32, 0.78)), starts[2] + 0.06)
    place(mix, whoosh(0.7, 0.20), starts[2] + 0.05)

    # 3 paste — keystrokes then a click
    for i in range(14):
        place(mix, key_click(), starts[3] + 0.30 + i * 0.055)
    place(mix, tick(0.10, 1900, 0.22), starts[3] + 1.25)

    # 4 analyze — data resolves
    place(mix, whoosh(0.55, 0.20), starts[4])
    place(mix, reverb(chime(1.4, 587.33, 0.20)), starts[4] + 0.35)
    for i in range(6):
        place(mix, tick(0.06, 2400 + i * 120, 0.06), starts[4] + 0.55 + i * 0.075)

    # 5 stats — three counters landing
    for i in range(3):
        place(mix, tick(0.12, 1500 + i * 260, 0.17), starts[5] + 0.35 + i * 0.30)
    place(mix, reverb(sub_drop(1.0, 100, 40, 0.42)), starts[5] + 1.30)

    # 6 download — momentum
    place(mix, riser(0.9, 300, 1500, 0.20), starts[6] - 0.5)
    place(mix, reverb(sub_drop(1.5, 125, 33, 0.72)), starts[6] + 0.05)
    seg = int(5.0 * SR)
    pb = pulse_bed(5.0, 78, 0.85)
    place(mix, pb[:seg], starts[6] + 0.2)
    # completion pings as items finish
    for i, at in enumerate((1.5, 2.4, 3.3, 4.1)):
        place(mix, chime(0.9, 784 + i * 40, 0.11), starts[6] + at)

    # 7 features — four cards snapping
    for i in range(4):
        place(mix, tick(0.09, 1700 + i * 180, 0.15), starts[7] + 0.25 + i * 0.28)
    place(mix, whoosh(0.6, 0.16), starts[7] + 0.1)

    # 8 theme — colour swaps
    for i in range(4):
        place(mix, whoosh(0.45, 0.15), starts[8] + 0.3 + i * 0.72)
        place(mix, tick(0.07, 2000 + i * 200, 0.09), starts[8] + 0.32 + i * 0.72)

    # 9 privacy — three declarative hits
    for i in range(3):
        place(mix, reverb(sub_drop(1.1, 118 - i * 8, 34, 0.50)), starts[9] + 0.15 + i * 0.42)

    # 10 endcard — final swell
    place(mix, riser(1.4, 160, 1200, 0.22), starts[10] - 0.9)
    place(mix, reverb(sub_drop(2.6, 150, 28, 0.95)), starts[10] + 0.05)
    place(mix, reverb(chime(3.0, 523.25, 0.26)), starts[10] + 0.35)
    place(mix, reverb(chime(2.6, 783.99, 0.14)), starts[10] + 0.75)

    # ---- master chain ----
    # gentle bus compression
    thr, ratio = 0.55, 3.2
    over = np.abs(mix) > thr
    mix[over] = np.sign(mix[over]) * (thr + (np.abs(mix[over]) - thr) / ratio)
    # soft clip + normalise with headroom
    mix = np.tanh(mix * 1.05)
    peak = np.max(np.abs(mix)) or 1.0
    mix = mix / peak * 0.89

    # tail fade
    fo = int(SR * 0.9)
    mix[-fo:] *= np.linspace(1, 0, fo)

    return mix


def to_stereo(mono: np.ndarray) -> np.ndarray:
    """Very light haas widening so it isn't dead centre."""
    d = int(SR * 0.006)
    left = mono.copy()
    right = np.concatenate([np.zeros(d), mono[:-d]]) * 0.985
    return np.stack([left, right], axis=1)


def main() -> None:
    dur = float((ROOT / "duration.txt").read_text().strip())
    print(f"building audio for {dur:.2f}s")
    st = to_stereo(build(dur))
    pcm = np.clip(st, -1, 1)
    pcm = (pcm * 32767).astype(np.int16)
    out = ROOT / "audio.wav"
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", out, pcm.shape)


if __name__ == "__main__":
    main()
