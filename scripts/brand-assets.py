"""Derive every Dawghwa mascot asset from the single supplied artwork.

Source: brand/mascot-source.png (1254x1254 RGBA, supplied by the project owner).
The character is never redrawn or altered; variants are crops, scales and
backgrounds only. Run: python3 scripts/brand-assets.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = Image.open(ROOT / "brand/mascot-source.png").convert("RGBA")
S = SRC.width / 1080  # crop boxes below were measured on a 1080px preview

INK = (21, 21, 25, 255)  # --bg dark #151519
VERMILION = (255, 89, 72, 255)
LAVENDER = (184, 165, 247, 255)

def box(x0, y0, x1, y1):
    return tuple(int(v * S) for v in (x0, y0, x1, y1))

HEAD = SRC.crop(box(215, 95, 815, 695))  # head + paw + top of the crowned book
WIDE = SRC.crop(box(165, 60, 865, 760))  # maskable: face stays inside the 80% safe circle
FACE = SRC.crop(box(300, 170, 760, 630))  # tight face for tiny sizes

mascot = ROOT / "src/assets/mascot"
mascot.mkdir(parents=True, exist_ok=True)

def save_webp(img, path, size):
    img.resize((size, size), Image.LANCZOS).save(path, "WEBP", quality=84, method=6)

# full figure (onboarding, empty states, achievements)
save_webp(SRC, mascot / "default.webp", 640)
save_webp(SRC, mascot / "default-320.webp", 320)
save_webp(HEAD, mascot / "head.webp", 256)
save_webp(FACE, mascot / "face.webp", 128)

def halftone(size, color, step, rmax, fade=True):
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(0, size + step, step):
        for x in range(0, size + step, step):
            off = step / 2 if (y // step) % 2 else 0
            cx, cy = x + off, y
            t = (cx + (size - cy)) / (2 * size) if fade else 1  # stronger toward top-right
            r = rmax * max(0.0, t - 0.35) / 0.65
            if r > 0.4:
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    return layer

def icon(size, pad_ratio, rounded, bg=INK, art=HEAD):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base = Image.new("RGBA", (size, size), bg)
    base.alpha_composite(halftone(size, (255, 89, 72, 70), max(6, size // 26), max(1.5, size / 70)))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * rounded), fill=255)
    canvas.paste(base, (0, 0), mask)
    inner = int(size * (1 - pad_ratio * 2))
    a = art.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer.paste(a, (off, off), a)
    clipped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    clipped.paste(layer, (0, 0), Image.composite(layer.getchannel("A"), Image.new("L", (size, size), 0), mask))
    canvas.alpha_composite(clipped)
    return canvas

icons = ROOT / "public/icons"
icon(512, 0.0, 0.22).save(icons / "icon-512.png")
icon(192, 0.0, 0.22).save(icons / "icon-192.png")
icon(180, 0.0, 0.0).save(icons / "apple-touch-icon.png")
# maskable: full-bleed background, art inside the 80% safe zone
icon(512, 0.0, 0.0, art=WIDE).save(icons / "maskable-512.png")
icon(192, 0.0, 0.0, art=WIDE).save(icons / "maskable-192.png")
icon(64, 0.0, 0.25, art=FACE).save(icons / "favicon-64.png")
# Android adaptive foreground: transparent, art within the 66% safe circle
# Android adaptive foreground: opaque full-bleed art (the launcher mask crops to ~66%)
icon(432, 0.0, 0.0, art=WIDE).save(icons / "android-foreground-432.png")

# Open Graph card 1200x630: ink, halftone, mascot right, wordmark drawn by the app font is not
# available to PIL, so the card carries the artwork and the HTML title carries the name.
og = Image.new("RGBA", (1200, 630), INK)
og.alpha_composite(halftone(1200, (255, 89, 72, 40), 22, 6).crop((0, 0, 1200, 630)))
ImageDraw.Draw(og).rectangle((0, 600, 1200, 630), fill=VERMILION)
m = SRC.resize((600, 600), Image.LANCZOS)
og.alpha_composite(m, (620, 10))
og.convert("RGB").save(ROOT / "public/og-art.png")
print("brand assets written")
