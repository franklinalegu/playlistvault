#!/usr/bin/env python3
"""
PlaylistVault advertorial — motion graphics renderer.

Composites real captured UI footage into a cinematic 1080p spot with
easing-driven camera moves, glow, parallax, light sweeps and kinetic type.
No voiceover: the audio track is built separately from synthesised SFX.

Output: numbered PNG frames, muxed to H.264 by build.sh.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

W, H = 1920, 1080
FPS = 30

ROOT = Path("/home/user/PlaylistVault/ad")
FRAMES = ROOT / "frames"
FRAMES_DL = ROOT / "frames_dl"
OUT = ROOT / "out"
OUT.mkdir(parents=True, exist_ok=True)

ACCENT = (79, 70, 229)
ACCENT_LT = (129, 140, 248)
CYAN = (14, 165, 233)
BG = (8, 10, 18)

FONT_DIR = "/usr/share/fonts/opentype/inter"


_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def _font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    """Load Inter — the same typeface the app itself uses — at a given weight."""
    key = (weight, size)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    for name in (
        f"{FONT_DIR}/Inter-{weight}.otf",
        f"{FONT_DIR}/InterDisplay-{weight}.otf",
        f"/usr/share/fonts/truetype/inter/Inter-{weight}.ttf",
    ):
        if os.path.exists(name):
            f = ImageFont.truetype(name, size)
            _FONT_CACHE[key] = f
            return f
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)
    _FONT_CACHE[key] = f
    return f


# ---------------------------------------------------------------- easing

def ease_out_expo(t: float) -> float:
    return 1.0 if t >= 1 else 1 - pow(2, -10 * t)


def ease_in_out_cubic(t: float) -> float:
    return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2


def ease_out_back(t: float, s: float = 1.70158) -> float:
    t -= 1
    return t * t * ((s + 1) * t + s) + 1


def ease_out_quint(t: float) -> float:
    return 1 - pow(1 - t, 5)


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def smoothstep(a: float, b: float, x: float) -> float:
    if b - a < 1e-6:
        return 0.0
    return clamp01((x - a) / (b - a))


# ---------------------------------------------------------------- assets

_cache: dict[str, Image.Image] = {}


def load(name: str, folder: Path = FRAMES) -> Image.Image:
    key = str(folder / name)
    if key not in _cache:
        src = folder / f"{name}.png"
        if not src.exists():
            src = folder / f"{name}.jpg"
        img = Image.open(src).convert("RGB")
        if img.size != (W, H):
            img = img.resize((W, H), Image.LANCZOS)
        _cache[key] = img
    return _cache[key]


def dl_frame(i: int) -> Image.Image:
    """Clamped access into the live-download capture sequence."""
    files = sorted(p.stem for p in FRAMES_DL.glob("dl_[0-9]*.png"))
    i = max(0, min(i, len(files) - 1))
    return load(files[i], FRAMES_DL)


DL_COUNT = len(sorted(FRAMES_DL.glob("dl_[0-9]*.png")))


# ---------------------------------------------------------------- effects

def bg_gradient(t: float) -> Image.Image:
    """Slow-drifting radial aurora backdrop."""
    small = 96
    yy, xx = np.mgrid[0:small, 0:small].astype(np.float32)
    xx /= small
    yy /= small

    img = np.zeros((small, small, 3), np.float32)
    img[..., 0] = BG[0]
    img[..., 1] = BG[1]
    img[..., 2] = BG[2]

    for cx, cy, col, rad, amp in (
        (0.18 + 0.05 * math.sin(t * 0.5), 0.10, ACCENT, 0.55, 0.85),
        (0.85, 0.15 + 0.05 * math.cos(t * 0.4), CYAN, 0.50, 0.45),
        (0.55, 1.05, (147, 51, 234), 0.60, 0.40),
    ):
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        g = np.clip(1 - d / rad, 0, 1) ** 2 * amp
        for c in range(3):
            img[..., c] += g * col[c]

    img = np.clip(img, 0, 255).astype(np.uint8)
    return Image.fromarray(img).resize((W, H), Image.BICUBIC)


def vignette(img: Image.Image, strength: float = 0.55) -> Image.Image:
    small = 64
    yy, xx = np.mgrid[0:small, 0:small].astype(np.float32)
    xx = xx / small * 2 - 1
    yy = yy / small * 2 - 1
    d = np.sqrt(xx**2 + yy**2) / 1.42
    mask = np.clip(1 - d**2 * strength, 0, 1)
    m = Image.fromarray((mask * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    black = Image.new("RGB", (W, H), (0, 0, 0))
    return Image.composite(img, black, m)


def bloom(img: Image.Image, amount: float = 0.5, radius: int = 26, thresh: int = 165) -> Image.Image:
    """Cheap threshold bloom for that polished, glowing product look."""
    if amount <= 0:
        return img
    arr = np.asarray(img).astype(np.float32)
    lum = arr.max(axis=2)
    mask = np.clip((lum - thresh) / max(1, 255 - thresh), 0, 1)[..., None]
    bright = Image.fromarray((arr * mask).astype(np.uint8))
    bright = bright.filter(ImageFilter.GaussianBlur(radius))
    return ImageChops.screen(img, bright.point(lambda v: int(v * amount)))


def chroma(img: Image.Image, px: int) -> Image.Image:
    """Subtle RGB split — used only during impacts."""
    if px <= 0:
        return img
    r, g, b = img.split()
    r = ImageChops.offset(r, px, 0)
    b = ImageChops.offset(b, -px, 0)
    return Image.merge("RGB", (r, g, b))


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def shadow_paste(base: Image.Image, card: Image.Image, xy: tuple[int, int],
                 blur: int = 46, alpha: int = 150, spread: int = 22) -> None:
    x, y = xy
    sh = Image.new("RGBA", (card.width + spread * 2, card.height + spread * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [spread, spread + 10, spread + card.width, spread + card.height + 10],
        28, fill=(0, 0, 0, alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    base.paste(sh, (x - spread, y - spread), sh)
    base.paste(card, (x, y), card if card.mode == "RGBA" else None)


def light_sweep(card: Image.Image, p: float) -> Image.Image:
    """Diagonal specular sweep across a card, p in 0..1."""
    if p <= 0 or p >= 1:
        return card
    w, h = card.size
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    x = int(-w * 0.6 + p * (w * 2.0))
    d.polygon([(x, h), (x + int(w * 0.16), h), (x + int(w * 0.16) + int(h * 0.5), 0), (x + int(h * 0.5), 0)], fill=110)
    layer = layer.filter(ImageFilter.GaussianBlur(38))
    glow = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    glow.putalpha(layer)
    out = card.convert("RGBA")
    return Image.alpha_composite(out, glow)


def text(draw: ImageDraw.ImageDraw, xy, s: str, font, fill=(255, 255, 255),
         anchor="la", alpha: int = 255) -> None:
    if alpha >= 255:
        draw.text(xy, s, font=font, fill=fill, anchor=anchor)
    else:
        draw.text(xy, s, font=font, fill=(*fill, alpha), anchor=anchor)


def text_glow(base: Image.Image, xy, s: str, font, fill=(255, 255, 255),
              anchor="mm", alpha: int = 255, glow_col=ACCENT_LT, glow: int = 18) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text(xy, s, font=font, fill=(*glow_col, int(alpha * 0.55)), anchor=anchor)
    layer = layer.filter(ImageFilter.GaussianBlur(glow))
    d2 = ImageDraw.Draw(layer)
    d2.text(xy, s, font=font, fill=(*fill, alpha), anchor=anchor)
    base.alpha_composite(layer) if base.mode == "RGBA" else base.paste(
        Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB"), (0, 0))


def kinetic_words(base: Image.Image, words: list[str], font, cy: int, t: float,
                  stagger: float = 0.07, dur: float = 0.5, color=(255, 255, 255)) -> None:
    """Words fly up into place one after another."""
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    widths = [d.textlength(w + " ", font=font) for w in words]
    total = sum(widths)
    x = (W - total) / 2
    for i, w in enumerate(words):
        lt = clamp01((t - i * stagger) / dur)
        if lt <= 0:
            x += widths[i]
            continue
        e = ease_out_expo(lt)
        dy = (1 - e) * 46
        a = int(255 * min(1.0, lt * 1.8))
        d.text((x, cy + dy), w, font=font, fill=(*color, a))
        x += widths[i]
    base.paste(Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB"), (0, 0))


def ui_card(src: Image.Image, scale: float, crop: tuple[float, float, float, float] | None = None,
            radius: int = 26) -> Image.Image:
    """Crop (fractional box) + scale a UI screenshot into a rounded card."""
    img = src
    if crop:
        l, tp, r, b = crop
        img = src.crop((int(l * W), int(tp * H), int(r * W), int(b * H)))
    nw, nh = max(2, int(img.width * scale)), max(2, int(img.height * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    return rounded(img, radius)


def frame_base(t: float) -> Image.Image:
    return bg_gradient(t)


CAPTION_Y = H - 74          # baseline for the lower-third caption
CARD_TOP = int(H * 0.075)   # cards start here
CARD_MAX_H = H - CARD_TOP - 150   # and must clear the caption band


def caption(img: Image.Image, s: str, p: float, start: float = 0.15,
            dur: float = 0.32, size: int = 46) -> Image.Image:
    """Lower-third caption that fades/rises in, kept clear of the UI card."""
    lp = clamp01((p - start) / dur)
    if lp <= 0:
        return img
    e = ease_out_expo(lp)
    a = int(255 * min(1.0, lp * 1.9))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    y = CAPTION_Y + int((1 - e) * 26)
    # soft plate behind the words for legibility over bright UI
    tw = d.textlength(s, font=_font("SemiBold", size))
    d.rounded_rectangle([W / 2 - tw / 2 - 34, y - size, W / 2 + tw / 2 + 34, y + size * 0.72],
                        999, fill=(6, 8, 16, int(a * 0.42)))
    d.text((W // 2, y - size * 0.14), s, font=_font("SemiBold", size),
           fill=(240, 244, 255, a), anchor="mm")
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def fit_card(src: Image.Image, crop=None, radius: int = 26,
             max_h: int | None = None, max_w_frac: float = 0.92) -> Image.Image:
    """Scale a screenshot as large as possible within the safe area."""
    img = src
    if crop:
        l, tp, r, b = crop
        img = src.crop((int(l * W), int(tp * H), int(r * W), int(b * H)))
    mh = max_h or CARD_MAX_H
    mw = int(W * max_w_frac)
    sc = min(mw / img.width, mh / img.height)
    img = img.resize((max(2, int(img.width * sc)), max(2, int(img.height * sc))), Image.LANCZOS)
    return rounded(img, radius)


# ---------------------------------------------------------------- scenes

@dataclass
class Scene:
    dur: float
    fn: callable


def sc_logo(p: float, t: float) -> Image.Image:
    """Cold open: mark draws in, wordmark resolves, light sweep."""
    img = frame_base(t).convert("RGB")
    d = ImageDraw.Draw(img)

    # Shield mark, scaling in with a slight overshoot.
    e = ease_out_back(clamp01(p / 0.42)) if p < 0.42 else 1.0
    s = 0.5 + 0.5 * e
    size = int(300 * s)
    cx, cy = W // 2, int(H * 0.42)

    mark = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    md = ImageDraw.Draw(mark)
    u = size / 24.0
    pts = [(12 * u, 2.2 * u), (20.6 * u, 6.0 * u), (20.6 * u, 13.2 * u),
           (12 * u, 21.8 * u), (3.4 * u, 13.2 * u), (3.4 * u, 6.0 * u)]
    # gradient fill via vertical bands
    for i in range(size):
        f = i / max(1, size - 1)
        col = tuple(int(ACCENT[k] + (CYAN[k] - ACCENT[k]) * f) for k in range(3))
        md.line([(0, i), (size, i)], fill=(*col, 255))
    shield = Image.new("L", (size, size), 0)
    ImageDraw.Draw(shield).polygon(pts, fill=255)
    mark.putalpha(shield)

    # play triangle knocked out
    tri = Image.new("L", (size, size), 0)
    ImageDraw.Draw(tri).polygon([(9.7 * u, 8.6 * u), (9.7 * u, 15.4 * u), (15.9 * u, 12 * u)], fill=255)
    tri = tri.filter(ImageFilter.GaussianBlur(0.6))
    base_a = mark.getchannel("A")
    mark.putalpha(ImageChops.subtract(base_a, tri))

    glow = mark.filter(ImageFilter.GaussianBlur(34))
    img.paste(Image.alpha_composite(
        Image.new("RGBA", (size, size), (0, 0, 0, 0)), glow),
        (cx - size // 2, cy - size // 2), glow)
    img.paste(mark, (cx - size // 2, cy - size // 2), mark)

    # Wordmark
    if p > 0.30:
        a = int(255 * ease_out_expo(clamp01((p - 0.30) / 0.34)))
        f = _font("Bold", 78)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((cx, int(H * 0.70)), "PlaylistVault", font=f,
                                   fill=(255, 255, 255, a), anchor="mm")
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    if p > 0.46:
        a = int(190 * ease_out_expo(clamp01((p - 0.46) / 0.30)))
        f = _font("Regular", 27)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((cx, int(H * 0.70) + 62), "Your playlists. Offline. Forever.",
                                   font=f, fill=(190, 200, 220, a), anchor="mm")
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    img = bloom(img, 0.62, 30, 150)
    return vignette(img, 0.5)


def sc_hook(p: float, t: float) -> Image.Image:
    """Problem statement, kinetic type."""
    img = frame_base(t).convert("RGB")
    f = _font("Bold", 68)
    if p < 0.5:
        kinetic_words(img, ["Playlists", "disappear."], f, int(H * 0.44), p * 1.9)
    else:
        q = clamp01((p - 0.48) / 0.52)
        # first line drifts up and fades
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        a = int(255 * (1 - ease_in_out_cubic(min(1, q * 1.6))))
        d.text((W // 2, int(H * 0.44) - int(40 * q)), "Playlists disappear.", font=f,
               fill=(255, 255, 255, a), anchor="mm")
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
        kinetic_words(img, ["Yours", "shouldn't."], _font("Bold", 82), int(H * 0.52), q * 1.7,
                      color=(226, 232, 255))
    img = bloom(img, 0.4)
    return vignette(img)


def sc_ui_reveal(p: float, t: float) -> Image.Image:
    """The app rises into frame with a light sweep."""
    img = frame_base(t).convert("RGB")
    e = ease_out_expo(clamp01(p / 0.6))
    card = fit_card(load("home_empty"))
    y = int(CARD_TOP + (1 - e) * H * 0.55)
    x = (W - card.width) // 2
    card = light_sweep(card, clamp01((p - 0.42) / 0.4))
    shadow_paste(img, card, (x, y))
    img = caption(img, "One window. Your whole library.", p, 0.5, 0.35)
    img = bloom(img, 0.34)
    return vignette(img)


def sc_paste(p: float, t: float) -> Image.Image:
    """Push in on the URL bar as a link is typed."""
    img = frame_base(t).convert("RGB")
    seq = ["home_empty", "home_typing_0", "home_typing_1", "home_typed"]
    idx = min(len(seq) - 1, int(p * 4.4))
    src = load(seq[idx])

    # Ken Burns push toward the input field.
    z = 1.0 + 0.16 * ease_in_out_cubic(clamp01(p))
    cw, ch = W / z, H / z
    cx, cy = W * 0.5, H * 0.20 + (H * 0.5 - H * 0.20) * 0.15
    box = (max(0, cx - cw / 2), max(0, cy - ch / 2))
    crop = src.crop((int(box[0]), int(box[1]), int(min(W, box[0] + cw)), int(min(H, box[1] + ch))))
    crop = crop.resize((W, H), Image.LANCZOS)

    card = fit_card(crop)
    shadow_paste(img, card, ((W - card.width) // 2, CARD_TOP))
    img = caption(img, "Paste a link.", p, 0.28, 0.30)
    img = bloom(img, 0.34)
    return vignette(img)


def sc_analyze(p: float, t: float) -> Image.Image:
    """Playlist metadata resolves — real 19-video data."""
    img = frame_base(t).convert("RGB")
    e = ease_out_quint(clamp01(p / 0.45))
    # Frame the playlist panel itself rather than the whole window.
    card = fit_card(load("playlist_loaded"), crop=(0.24, 0.11, 0.99, 0.78))
    y = int(CARD_TOP + 40 - 26 * e)
    shadow_paste(img, card, ((W - card.width) // 2, y))
    img = caption(img, "19 videos read in under a second.", p, 0.22, 0.30)
    img = bloom(img, 0.38)
    return vignette(img)


def sc_stats(p: float, t: float) -> Image.Image:
    """Hero stat tiles counting up, pulled from the real analysis."""
    img = frame_base(t).convert("RGB")
    stats = [("VIDEOS", 19, ""), ("DURATION", 225, "m"), ("EST. SIZE", 8.8, " GB")]
    bw, bh, gap = 420, 260, 48
    total = bw * 3 + gap * 2
    x0 = (W - total) // 2
    y0 = int(H * 0.34)

    for i, (label, target, suffix) in enumerate(stats):
        lp = clamp01((p - i * 0.10) / 0.55)
        if lp <= 0:
            continue
        e = ease_out_expo(lp)
        card = Image.new("RGBA", (bw, bh), (255, 255, 255, 16))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, bw - 1, bh - 1], 28, fill=(255, 255, 255, 14),
                             outline=(255, 255, 255, 40), width=2)
        cd.text((bw // 2, 62), label, font=_font("SemiBold", 24), fill=(148, 163, 200, 255), anchor="mm")

        if isinstance(target, float):
            val = target * e
            s = f"{val:.1f}{suffix}"
        else:
            val = int(target * e)
            s = f"{val}{suffix}" if label != "DURATION" else f"{val // 60}h {val % 60}m"
        cd.text((bw // 2, 150), s, font=_font("Bold", 76), fill=(255, 255, 255, 255), anchor="mm")

        yy = y0 + int((1 - e) * 40)
        img.paste(card, (x0 + i * (bw + gap), yy), card)

    if p > 0.45:
        a = int(255 * ease_out_expo(clamp01((p - 0.45) / 0.35)))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((W // 2, int(H * 0.72)), "Know exactly what you're saving.",
                                   font=_font("SemiBold", 44), fill=(235, 240, 255, a), anchor="mm")
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    img = bloom(img, 0.45)
    return vignette(img)


def sc_download(p: float, t: float) -> Image.Image:
    """The core payoff: real progress bars moving."""
    img = frame_base(t).convert("RGB")
    idx = int(p * (DL_COUNT - 1) * 0.92)
    src = dl_frame(idx)

    # Slow push into the job card where the progress bars live.
    z = 1.0 + 0.07 * ease_in_out_cubic(p)
    l, tp, r, b = 0.23, 0.12, 0.85, 0.56
    cx, cy = (l + r) / 2, (tp + b) / 2
    hw, hh = (r - l) / 2 / z, (b - tp) / 2 / z
    card = fit_card(src, crop=(cx - hw, cy - hh, cx + hw, cy + hh))
    shadow_paste(img, card, ((W - card.width) // 2, CARD_TOP + 30))
    img = caption(img, "Parallel downloads. Live progress.", p, 0.10, 0.28)
    img = bloom(img, 0.40)
    return vignette(img)


def sc_features(p: float, t: float) -> Image.Image:
    """Feature grid snapping in."""
    img = frame_base(t).convert("RGB")
    feats = [
        ("Pause & resume", "Stop anytime. Pick up exactly where you left off."),
        ("Smart naming", "Numbered, sanitised, sorted correctly in Explorer."),
        ("Skip duplicates", "Re-run a playlist, fetch only what's missing."),
        ("4K to audio-only", "MP4, MKV, WebM, MP3, FLAC — your call."),
    ]
    bw, bh, gap = 800, 190, 40
    x0 = (W - (bw * 2 + gap)) // 2
    y0 = int(H * 0.26)

    for i, (title, body) in enumerate(feats):
        lp = clamp01((p - i * 0.09) / 0.5)
        if lp <= 0:
            continue
        e = ease_out_expo(lp)
        col, row = i % 2, i // 2
        card = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, bw - 1, bh - 1], 26, fill=(255, 255, 255, 13),
                             outline=(255, 255, 255, 34), width=2)
        cd.rounded_rectangle([34, 52, 42, bh - 52], 4, fill=(*ACCENT_LT, 255))
        cd.text((72, 62), title, font=_font("Bold", 38), fill=(255, 255, 255, 255))
        cd.text((72, 116), body, font=_font("Regular", 26), fill=(160, 172, 200, 255))

        dx = int((1 - e) * (60 if col == 0 else -60))
        x = x0 + col * (bw + gap) + dx
        y = y0 + row * (bh + gap)
        tmp = card.copy()
        tmp.putalpha(tmp.getchannel("A").point(lambda v: int(v * e)))
        img.paste(tmp, (x, y), tmp)

    img = bloom(img, 0.30)
    return vignette(img)


def sc_theme(p: float, t: float) -> Image.Image:
    """Accent colours cross-dissolving — shows theming."""
    img = frame_base(t).convert("RGB")
    names = ["settings", "accent_sky", "accent_green", "accent_pink", "settings_light"]
    fpos = p * (len(names) - 1)
    i = min(len(names) - 2, int(fpos))
    lp = ease_in_out_cubic(clamp01(fpos - i))
    a = load(names[i])
    b = load(names[i + 1])
    blend = Image.blend(a, b, lp)

    card = fit_card(blend)
    shadow_paste(img, card, ((W - card.width) // 2, CARD_TOP))
    img = caption(img, "Make it yours.", p, 0.10, 0.28)
    img = bloom(img, 0.34)
    return vignette(img)


def sc_privacy(p: float, t: float) -> Image.Image:
    """Trust beat."""
    img = frame_base(t).convert("RGB")
    lines = [("No accounts.", 0.00), ("No telemetry.", 0.12), ("No cloud.", 0.24)]
    f = _font("Bold", 76)
    for i, (s, off) in enumerate(lines):
        lp = clamp01((p - off) / 0.42)
        if lp <= 0:
            continue
        e = ease_out_expo(lp)
        a = int(255 * min(1, lp * 2))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((W // 2, int(H * 0.34) + i * 108 + int((1 - e) * 30)),
                                   s, font=f, fill=(255, 255, 255, a), anchor="mm")
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    if p > 0.55:
        a = int(220 * ease_out_expo(clamp01((p - 0.55) / 0.35)))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((W // 2, int(H * 0.74)), "Everything runs on your machine.",
                                   font=_font("Regular", 36), fill=(170, 182, 210, a), anchor="mm")
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    img = bloom(img, 0.42)
    return vignette(img)


def sc_endcard(p: float, t: float) -> Image.Image:
    """Logo lockup + credit."""
    img = frame_base(t).convert("RGB")
    e = ease_out_expo(clamp01(p / 0.4))

    size = 190
    cx, cy = W // 2, int(H * 0.34)
    mark = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    u = size / 24.0
    for i in range(size):
        f = i / max(1, size - 1)
        col = tuple(int(ACCENT[k] + (CYAN[k] - ACCENT[k]) * f) for k in range(3))
        ImageDraw.Draw(mark).line([(0, i), (size, i)], fill=(*col, 255))
    shield = Image.new("L", (size, size), 0)
    ImageDraw.Draw(shield).polygon(
        [(12 * u, 2.2 * u), (20.6 * u, 6.0 * u), (20.6 * u, 13.2 * u),
         (12 * u, 21.8 * u), (3.4 * u, 13.2 * u), (3.4 * u, 6.0 * u)], fill=255)
    mark.putalpha(shield)
    tri = Image.new("L", (size, size), 0)
    ImageDraw.Draw(tri).polygon([(9.7 * u, 8.6 * u), (9.7 * u, 15.4 * u), (15.9 * u, 12 * u)], fill=255)
    mark.putalpha(ImageChops.subtract(mark.getchannel("A"), tri))

    sc = 0.85 + 0.15 * e
    m = mark.resize((int(size * sc), int(size * sc)), Image.LANCZOS)
    g = m.filter(ImageFilter.GaussianBlur(30))
    img.paste(g, (cx - m.width // 2, cy - m.height // 2), g)
    img.paste(m, (cx - m.width // 2, cy - m.height // 2), m)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    a1 = int(255 * ease_out_expo(clamp01((p - 0.15) / 0.35)))
    d.text((cx, int(H * 0.58)), "PlaylistVault", font=_font("Bold", 92),
           fill=(255, 255, 255, a1), anchor="mm")
    a2 = int(220 * ease_out_expo(clamp01((p - 0.30) / 0.35)))
    d.text((cx, int(H * 0.68)), "Your playlists. Offline. Forever.",
           font=_font("Regular", 34), fill=(185, 195, 220, a2), anchor="mm")
    a3 = int(190 * ease_out_expo(clamp01((p - 0.48) / 0.35)))
    d.text((cx, int(H * 0.80)), "Built by Franklin Alegu (FA)",
           font=_font("SemiBold", 30), fill=(150, 162, 195, a3), anchor="mm")
    a4 = int(140 * ease_out_expo(clamp01((p - 0.60) / 0.35)))
    d.text((cx, H - 78), "Only download content you own or have permission to save.",
           font=_font("Regular", 22), fill=(120, 132, 160, a4), anchor="mm")
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    img = bloom(img, 0.55, 32, 150)
    return vignette(img, 0.45)


SCENES = [
    Scene(3.0, sc_logo),
    Scene(3.4, sc_hook),
    Scene(3.2, sc_ui_reveal),
    Scene(3.0, sc_paste),
    Scene(3.2, sc_analyze),
    Scene(3.4, sc_stats),
    Scene(5.0, sc_download),
    Scene(4.4, sc_features),
    Scene(3.6, sc_theme),
    Scene(3.4, sc_privacy),
    Scene(4.4, sc_endcard),
]

TRANS = 0.42  # cross-dissolve length in seconds


def render() -> float:
    starts, acc = [], 0.0
    for s in SCENES:
        starts.append(acc)
        acc += s.dur - TRANS
    total = acc + TRANS
    n = int(total * FPS)
    print(f"scenes={len(SCENES)} duration={total:.2f}s frames={n}")

    for fi in range(n):
        t = fi / FPS
        active = []
        for si, s in enumerate(SCENES):
            st = starts[si]
            if st - 1e-6 <= t < st + s.dur:
                active.append((si, clamp01((t - st) / s.dur)))
        if not active:
            active = [(len(SCENES) - 1, 1.0)]

        si, p = active[0]
        img = SCENES[si].fn(p, t)

        # Cross-dissolve into the next scene.
        if len(active) > 1:
            sj, q = active[1]
            nxt = SCENES[sj].fn(q, t)
            st_next = starts[sj]
            w = ease_in_out_cubic(clamp01((t - st_next) / TRANS))
            img = Image.blend(img, nxt, w)
            # impact chroma on the cut
            img = chroma(img, int(3 * math.sin(w * math.pi)))

        # Global 24fps-style shutter shimmer + subtle grain
        arr = np.asarray(img).astype(np.int16)
        noise = np.random.default_rng(fi).integers(-4, 5, arr.shape, dtype=np.int16)
        img = Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))

        img.save(OUT / f"f{fi:05d}.png", compress_level=1)
        if fi % 60 == 0:
            print(f"  {fi}/{n}")

    print(f"done: {n} frames, {total:.2f}s")
    return total


if __name__ == "__main__":
    d = render()
    (ROOT / "duration.txt").write_text(str(d))
