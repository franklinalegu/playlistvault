#!/usr/bin/env python3
"""
PlaylistVault advertorial — 9:16 vertical cut for Reels / Shorts / TikTok.

Reuses the scene logic and effects from render.py but re-composes everything
for a 1080x1920 frame: bigger type, stacked layout, tighter pacing (~20s),
and UI screenshots cropped to the region that actually matters on a phone.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, "/home/user/PlaylistVault/ad")
import render as R  # noqa: E402  (shared easing, effects, font loader)

W, H = 1080, 1920
FPS = 30

ROOT = Path("/home/user/PlaylistVault/ad")
OUT = ROOT / "out_v"
OUT.mkdir(parents=True, exist_ok=True)

ACCENT = R.ACCENT
CYAN = R.CYAN
BG = R.BG

clamp01 = R.clamp01
ease_out_expo = R.ease_out_expo
ease_in_out_cubic = R.ease_in_out_cubic
ease_out_back = R.ease_out_back
ease_out_quint = R.ease_out_quint
_font = R._font


# ---------------------------------------------------------------- helpers

def bg_gradient(t: float) -> Image.Image:
    """Vertical aurora backdrop."""
    small = 96
    yy, xx = np.mgrid[0:small, 0:small].astype(np.float32)
    xx /= small
    yy /= small
    img = np.zeros((small, small, 3), np.float32)
    img[...] = BG

    for cx, cy, col, rad, amp in (
        (0.30 + 0.06 * math.sin(t * 0.5), 0.12, ACCENT, 0.62, 0.95),
        (0.80, 0.42 + 0.05 * math.cos(t * 0.4), CYAN, 0.55, 0.50),
        (0.40, 0.92, (147, 51, 234), 0.60, 0.45),
    ):
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        g = np.clip(1 - d / rad, 0, 1) ** 2 * amp
        for c in range(3):
            img[..., c] += g * col[c]

    img = np.clip(img, 0, 255).astype(np.uint8)
    return Image.fromarray(img).resize((W, H), Image.BICUBIC)


def vignette(img: Image.Image, strength: float = 0.5) -> Image.Image:
    small = 64
    yy, xx = np.mgrid[0:small, 0:small].astype(np.float32)
    xx = xx / small * 2 - 1
    yy = yy / small * 2 - 1
    d = np.sqrt(xx**2 + yy**2) / 1.42
    mask = np.clip(1 - d**2 * strength, 0, 1)
    m = Image.fromarray((mask * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return Image.composite(img, Image.new("RGB", (W, H), (0, 0, 0)), m)


def shadow_paste(base: Image.Image, card: Image.Image, xy, blur=40, alpha=155, spread=20):
    x, y = xy
    sh = Image.new("RGBA", (card.width + spread * 2, card.height + spread * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [spread, spread + 8, spread + card.width, spread + card.height + 8], 26, fill=(0, 0, 0, alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    base.paste(sh, (x - spread, y - spread), sh)
    base.paste(card, (x, y), card if card.mode == "RGBA" else None)


CARD_TOP = int(H * 0.28)
CARD_MAX_H = int(H * 0.44)


def fit_card(src: Image.Image, crop=None, radius=22, max_h=None, max_w_frac=0.92):
    """Scale a 16:9 screenshot into the vertical safe area."""
    img = src
    if crop:
        l, tp, r, b = crop
        img = src.crop((int(l * src.width), int(tp * src.height),
                        int(r * src.width), int(b * src.height)))
    mh = max_h or CARD_MAX_H
    mw = int(W * max_w_frac)
    sc = min(mw / img.width, mh / img.height)
    img = img.resize((max(2, int(img.width * sc)), max(2, int(img.height * sc))), Image.LANCZOS)
    return R.rounded(img, radius)


def headline(img: Image.Image, lines: list[str], p: float, start=0.05, dur=0.34,
             size=88, y=None, color=(255, 255, 255)) -> Image.Image:
    """Big stacked headline near the top — thumb-stopping type."""
    lp = clamp01((p - start) / dur)
    if lp <= 0:
        return img
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = _font("Bold", size)
    y0 = y if y is not None else int(H * 0.12)
    for i, s in enumerate(lines):
        li = clamp01((lp - i * 0.14) / 0.6)
        if li <= 0:
            continue
        e = ease_out_expo(li)
        a = int(255 * min(1.0, li * 1.9))
        d.text((W // 2, y0 + i * int(size * 1.16) + int((1 - e) * 40)), s,
               font=f, fill=(*color, a), anchor="mm")
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def subcap(img: Image.Image, s: str, p: float, start=0.3, dur=0.3, size=44,
           y_frac=0.80) -> Image.Image:
    lp = clamp01((p - start) / dur)
    if lp <= 0:
        return img
    e = ease_out_expo(lp)
    a = int(255 * min(1.0, lp * 1.9))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = _font("SemiBold", size)
    y = int(H * y_frac) + int((1 - e) * 24)
    tw = d.textlength(s, font=f)
    d.rounded_rectangle([W / 2 - tw / 2 - 30, y - size * 0.86, W / 2 + tw / 2 + 30, y + size * 0.72],
                        999, fill=(6, 8, 16, int(a * 0.45)))
    d.text((W // 2, y - size * 0.08), s, font=f, fill=(240, 244, 255, a), anchor="mm")
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def shield(size: int) -> Image.Image:
    mark = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    u = size / 24.0
    for i in range(size):
        f = i / max(1, size - 1)
        col = tuple(int(ACCENT[k] + (CYAN[k] - ACCENT[k]) * f) for k in range(3))
        ImageDraw.Draw(mark).line([(0, i), (size, i)], fill=(*col, 255))
    sh = Image.new("L", (size, size), 0)
    ImageDraw.Draw(sh).polygon(
        [(12 * u, 2.2 * u), (20.6 * u, 6.0 * u), (20.6 * u, 13.2 * u),
         (12 * u, 21.8 * u), (3.4 * u, 13.2 * u), (3.4 * u, 6.0 * u)], fill=255)
    mark.putalpha(sh)
    tri = Image.new("L", (size, size), 0)
    ImageDraw.Draw(tri).polygon([(9.7 * u, 8.6 * u), (9.7 * u, 15.4 * u), (15.9 * u, 12 * u)], fill=255)
    mark.putalpha(ImageChops.subtract(mark.getchannel("A"), tri))
    return mark


DL = sorted((ROOT / "frames_dl").glob("dl_[0-9]*.png"))


def dl_img(i: int) -> Image.Image:
    i = max(0, min(i, len(DL) - 1))
    return Image.open(DL[i]).convert("RGB")


# ---------------------------------------------------------------- scenes

def v_hook(p: float, t: float) -> Image.Image:
    """Open hard on the promise — no slow logo build for social."""
    img = bg_gradient(t).convert("RGB")
    e = ease_out_back(clamp01(p / 0.40))
    size = int(300 * (0.55 + 0.45 * e))
    m = shield(size)
    g = m.filter(ImageFilter.GaussianBlur(30))
    cx, cy = W // 2, int(H * 0.30)
    img.paste(g, (cx - size // 2, cy - size // 2), g)
    img.paste(m, (cx - size // 2, cy - size // 2), m)

    img = headline(img, ["Playlists", "disappear."], p, 0.22, 0.36, 104, int(H * 0.52))
    if p > 0.58:
        img = headline(img, ["Yours shouldn't."], p, 0.58, 0.32, 92, int(H * 0.70),
                       color=(200, 210, 255))
    img = R.bloom(img, 0.5)
    return vignette(img)


def v_paste(p: float, t: float) -> Image.Image:
    img = bg_gradient(t).convert("RGB")
    seq = ["home_empty", "home_typing_0", "home_typing_1", "home_typed"]
    idx = min(len(seq) - 1, int(p * 4.4))
    src = Image.open(ROOT / "frames" / f"{seq[idx]}.jpg").convert("RGB")
    # Crop tight on the URL bar region so it reads on a phone.
    # Tight crop on just the input row so the URL is legible on a phone.
    card = fit_card(src, crop=(0.29, 0.135, 0.83, 0.205), max_h=int(H * 0.16), max_w_frac=0.94)
    e = ease_out_expo(clamp01(p / 0.4))
    shadow_paste(img, card, ((W - card.width) // 2, int(H * 0.44) + int((1 - e) * 50)))
    img = headline(img, ["Paste a link."], p, 0.06, 0.3, 92, int(H * 0.20))
    img = subcap(img, "Playlist, video, or Shorts", p, 0.34, 0.3, 40, 0.60)
    img = R.bloom(img, 0.36)
    return vignette(img)


def v_analyze(p: float, t: float) -> Image.Image:
    img = bg_gradient(t).convert("RGB")
    src = Image.open(ROOT / "frames" / "playlist_loaded.jpg").convert("RGB")
    e = ease_out_quint(clamp01(p / 0.42))
    card = fit_card(src, crop=(0.31, 0.21, 0.82, 0.74), max_h=int(H * 0.46), max_w_frac=0.96)
    shadow_paste(img, card, ((W - card.width) // 2, int(H * 0.30) - int((1 - e) * 30)))
    img = headline(img, ["19 videos.", "One second."], p, 0.10, 0.34, 92, int(H * 0.14))
    img = R.bloom(img, 0.38)
    return vignette(img)


def v_stats(p: float, t: float) -> Image.Image:
    """Stacked stat tiles — vertical-native layout."""
    img = bg_gradient(t).convert("RGB")
    stats = [("VIDEOS", 19, ""), ("DURATION", 225, "m"), ("EST. SIZE", 8.8, " GB")]
    bw, bh, gap = int(W * 0.80), 210, 34
    x0 = (W - bw) // 2
    y0 = int(H * 0.30)

    for i, (label, target, suffix) in enumerate(stats):
        lp = clamp01((p - i * 0.11) / 0.55)
        if lp <= 0:
            continue
        e = ease_out_expo(lp)
        card = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, bw - 1, bh - 1], 26, fill=(255, 255, 255, 15),
                             outline=(255, 255, 255, 42), width=2)
        cd.text((bw // 2, 52), label, font=_font("SemiBold", 26),
                fill=(150, 165, 205, 255), anchor="mm")
        if isinstance(target, float):
            s = f"{target * e:.1f}{suffix}"
        else:
            v = int(target * e)
            s = f"{v}{suffix}" if label != "DURATION" else f"{v // 60}h {v % 60}m"
        cd.text((bw // 2, 132), s, font=_font("Bold", 78), fill=(255, 255, 255, 255), anchor="mm")
        tmp = card.copy()
        tmp.putalpha(tmp.getchannel("A").point(lambda v: int(v * e)))
        img.paste(tmp, (x0, y0 + i * (bh + gap) + int((1 - e) * 36)), tmp)

    img = headline(img, ["Know what", "you're saving."], p, 0.02, 0.3, 84, int(H * 0.14))
    img = R.bloom(img, 0.45)
    return vignette(img)


def v_download(p: float, t: float) -> Image.Image:
    img = bg_gradient(t).convert("RGB")
    idx = int(p * (len(DL) - 1) * 0.94)
    src = dl_img(idx)
    z = 1.0 + 0.06 * ease_in_out_cubic(p)
    l, tp, r, b = 0.30, 0.185, 0.82, 0.52
    cx, cy = (l + r) / 2, (tp + b) / 2
    hw, hh = (r - l) / 2 / z, (b - tp) / 2 / z
    card = fit_card(src, crop=(cx - hw, cy - hh, cx + hw, cy + hh),
                    max_h=int(H * 0.34), max_w_frac=0.96)
    shadow_paste(img, card, ((W - card.width) // 2, int(H * 0.36)))
    img = headline(img, ["Parallel", "downloads."], p, 0.04, 0.3, 92, int(H * 0.15))
    img = subcap(img, "Pause · Resume · Retry", p, 0.42, 0.3, 44, 0.84)
    img = R.bloom(img, 0.42)
    return vignette(img)


def v_features(p: float, t: float) -> Image.Image:
    img = bg_gradient(t).convert("RGB")
    feats = ["4K to audio-only", "Smart file naming", "Skips duplicates", "Pause & resume"]
    bw, bh, gap = int(W * 0.84), 130, 26
    x0 = (W - bw) // 2
    y0 = int(H * 0.31)
    for i, s in enumerate(feats):
        lp = clamp01((p - i * 0.10) / 0.5)
        if lp <= 0:
            continue
        e = ease_out_expo(lp)
        card = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, bw - 1, bh - 1], 24, fill=(255, 255, 255, 14),
                             outline=(255, 255, 255, 36), width=2)
        cd.rounded_rectangle([30, 40, 38, bh - 40], 4, fill=(*R.ACCENT_LT, 255))
        cd.text((64, bh // 2), s, font=_font("Bold", 44), fill=(255, 255, 255, 255), anchor="lm")
        tmp = card.copy()
        tmp.putalpha(tmp.getchannel("A").point(lambda v: int(v * e)))
        img.paste(tmp, (x0 + int((1 - e) * 50), y0 + i * (bh + gap)), tmp)
    img = headline(img, ["Built for", "real libraries."], p, 0.02, 0.3, 84, int(H * 0.15))
    img = R.bloom(img, 0.32)
    return vignette(img)


def v_privacy(p: float, t: float) -> Image.Image:
    img = bg_gradient(t).convert("RGB")
    img = headline(img, ["No accounts.", "No telemetry.", "No cloud."], p, 0.02, 0.42,
                   96, int(H * 0.36))
    if p > 0.52:
        img = subcap(img, "Everything runs on your machine.", p, 0.52, 0.32, 42, 0.66)
    img = R.bloom(img, 0.45)
    return vignette(img)


def v_end(p: float, t: float) -> Image.Image:
    img = bg_gradient(t).convert("RGB")
    e = ease_out_expo(clamp01(p / 0.4))
    size = int(230 * (0.86 + 0.14 * e))
    m = shield(size)
    g = m.filter(ImageFilter.GaussianBlur(28))
    cx, cy = W // 2, int(H * 0.34)
    img.paste(g, (cx - size // 2, cy - size // 2), g)
    img.paste(m, (cx - size // 2, cy - size // 2), m)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    a1 = int(255 * ease_out_expo(clamp01((p - 0.12) / 0.34)))
    d.text((cx, int(H * 0.50)), "PlaylistVault", font=_font("Bold", 92),
           fill=(255, 255, 255, a1), anchor="mm")
    a2 = int(225 * ease_out_expo(clamp01((p - 0.26) / 0.34)))
    d.text((cx, int(H * 0.565)), "Your playlists. Offline. Forever.",
           font=_font("Regular", 40), fill=(190, 200, 225, a2), anchor="mm")
    a3 = int(200 * ease_out_expo(clamp01((p - 0.44) / 0.34)))
    d.text((cx, int(H * 0.65)), "Built by Franklin Alegu (FA)",
           font=_font("SemiBold", 34), fill=(155, 168, 200, a3), anchor="mm")
    a4 = int(150 * ease_out_expo(clamp01((p - 0.58) / 0.34)))
    d.text((cx, H - 120), "Only download content you own",
           font=_font("Regular", 26), fill=(120, 132, 160, a4), anchor="mm")
    d.text((cx, H - 86), "or have permission to save.",
           font=_font("Regular", 26), fill=(120, 132, 160, a4), anchor="mm")
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    img = R.bloom(img, 0.55, 30, 150)
    return vignette(img, 0.42)


SCENES = [
    (3.0, v_hook),
    (2.6, v_paste),
    (2.8, v_analyze),
    (3.0, v_stats),
    (3.6, v_download),
    (3.0, v_features),
    (2.6, v_privacy),
    (3.4, v_end),
]
TRANS = 0.38


def render() -> float:
    starts, acc = [], 0.0
    for d, _ in SCENES:
        starts.append(acc)
        acc += d - TRANS
    total = acc + TRANS
    n = int(total * FPS)
    print(f"vertical: {len(SCENES)} scenes, {total:.2f}s, {n} frames")

    for fi in range(n):
        t = fi / FPS
        active = []
        for si, (d, fn) in enumerate(SCENES):
            st = starts[si]
            if st - 1e-6 <= t < st + d:
                active.append((si, clamp01((t - st) / d)))
        if not active:
            active = [(len(SCENES) - 1, 1.0)]

        si, p = active[0]
        img = SCENES[si][1](p, t)

        if len(active) > 1:
            sj, q = active[1]
            nxt = SCENES[sj][1](q, t)
            w = ease_in_out_cubic(clamp01((t - starts[sj]) / TRANS))
            img = Image.blend(img, nxt, w)
            img = R.chroma(img, int(3 * math.sin(w * math.pi)))

        arr = np.asarray(img).astype(np.int16)
        noise = np.random.default_rng(fi).integers(-4, 5, arr.shape, dtype=np.int16)
        img = Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))
        img.save(OUT / f"v{fi:05d}.png", compress_level=1)
        if fi % 60 == 0:
            print(f"  {fi}/{n}")

    print(f"done {n} frames {total:.2f}s")
    return total


if __name__ == "__main__":
    d = render()
    (ROOT / "duration_v.txt").write_text(str(d))
