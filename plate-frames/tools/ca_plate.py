"""Bake the demo licence plate that sits behind every frame in the viewer.

A standard-issue California passenger plate (1993 design, with "dmv.ca.gov"
added along the bottom in 2011): white reflective sheeting, red "California"
script across the top, dark blue stamped serial, red dmv.ca.gov, a raised
border rim and four mounting slots. 12 x 6 in.

Outputs (2048 x 1024, plate face only):
  <out>/ca-plate.webp         colour + alpha (alpha cuts the mounting slots)
  <out>/ca-plate-normal.webp  tangent-space normal map of the embossing

The serial glyphs are drawn here as vector shapes in the style of the
California dies (narrow, even stroke, squared stems, rounded bowls) because
the faithful digital version, Penitentiary Gothic, is a commercial font.

usage: python3 ca_plate.py [SERIAL] [OUT_DIR]
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage
from shapely import affinity
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
W_IN, H_IN = 12.0, 6.0
PX = 2048
S = PX / W_IN  # px per inch
SS = 2  # supersampling for the masks

RED = (196, 30, 46)
BLUE = (27, 40, 98)
SHEET = (244, 245, 247)

# Layout, inches from the top-left corner of the plate.
GLYPH_H = 2.70
GLYPH_W = 1.14
STROKE = 0.33
GAP = 0.14
SERIAL_TOP = 1.62
SCRIPT_BASELINE = 1.28
SCRIPT_WIDTH = 3.7
DMV_BASELINE = 5.66
DMV_HEIGHT = 0.30  # cap/x-height-ish box
RIM_INSET = 0.16
RIM_WIDTH = 0.10
SLOTS = [(2.5, 0.53), (9.5, 0.53), (2.5, 5.28), (9.5, 5.28)]  # 7 in x 4.75 in pattern
SLOT_W, SLOT_H = 0.55, 0.30


# ---------------------------------------------------------------- glyphs
def rounded_path(points, r):
    """Polyline through points with each interior corner replaced by an arc."""
    out = [points[0]]
    for a, b, c in zip(points, points[1:], points[2:]):
        v1 = np.subtract(a, b); v2 = np.subtract(c, b)
        l1, l2 = np.hypot(*v1), np.hypot(*v2)
        rr = min(r, l1 / 2, l2 / 2)
        p1 = np.add(b, v1 / l1 * rr); p2 = np.add(b, v2 / l2 * rr)
        # quarter-ish arc between p1 and p2, bulging toward b
        for t in np.linspace(0, 1, 14):
            q = (1 - t) ** 2 * p1 + 2 * (1 - t) * t * np.asarray(b, float) + t ** 2 * p2
            out.append(tuple(q))
    out.append(points[-1])
    return LineString(out)


def stroke(points, r=0.0):
    line = rounded_path(points, r) if r and len(points) > 2 else LineString(points)
    return line.buffer(STROKE / 2, cap_style=2, join_style=1, resolution=24)


def glyph(ch, w=GLYPH_W, h=GLYPH_H, s=STROKE):
    L, R, T, B, M = s / 2, w - s / 2, s / 2, h - s / 2, h * 0.47
    frame = box(0, 0, w, h)
    if ch == "B":
        g = unary_union([
            box(0, 0, s, h),
            stroke([(L, T), (R - 0.06, T), (R - 0.06, M), (L, M)], r=0.34),
            stroke([(L, M), (R, M), (R, B), (L, B)], r=0.38),
        ])
    elif ch == "D":
        g = unary_union([box(0, 0, s, h), stroke([(L, T), (R, T), (R, B), (L, B)], r=0.48)])
    elif ch == "T":
        g = unary_union([box(0, 0, w, s), box(w / 2 - s / 2, 0, w / 2 + s / 2, h)])
    elif ch == "A":
        a0, a1 = w * 0.355, w * 0.645
        sh = s / math.cos(math.atan(a0 / h))
        cross = h * 0.64
        g = unary_union([
            Polygon([(0, h), (sh, h), (a0 + sh, 0), (a0, 0)]),
            Polygon([(w, h), (w - sh, h), (a1 - sh, 0), (a1, 0)]),
            box(a0, 0, a1, s),
            box(0, cross, w, cross + s * 0.92),
        ]).intersection(Polygon([(0, h), (a0, 0), (a1, 0), (w, h)]))
    elif ch == "4":
        x = w * 0.60
        cross = h * 0.66
        g = unary_union([
            box(x, 0, x + s, h),
            LineString([(x + s * 0.5, s * 0.15), (s * 0.45, cross + s * 0.3)]).buffer(s / 2, cap_style=2),
            box(0, cross, w, cross + s),
        ]).intersection(frame)
    elif ch == "S":
        k = 0.42
        g = stroke([(R, T + k), (R, T), (L, T), (L, M), (R, M), (R, B), (L, B), (L, B - k)], r=0.40)
    else:
        raise ValueError(f"no glyph for {ch!r}")
    # The dies have slightly softened corners.
    return g.buffer(-0.025, join_style=1).buffer(0.025, join_style=1).intersection(frame)


# ---------------------------------------------------------------- rendering
def to_px(geom, scale):
    return affinity.scale(geom, xfact=scale, yfact=scale, origin=(0, 0))


def fill(draw, geom, value):
    geoms = getattr(geom, "geoms", [geom])
    for g in geoms:
        if g.is_empty:
            continue
        draw.polygon(list(g.exterior.coords), fill=value)
        for hole in g.interiors:
            draw.polygon(list(hole.coords), fill=0)


def mask_of(geom, ss=SS, keep=False):
    """Coverage mask of geom; keep=True returns it at ss x resolution."""
    im = Image.new("L", (PX * ss, PX // 2 * ss), 0)
    fill(ImageDraw.Draw(im), to_px(geom, S * ss), 255)
    return im if keep else im.resize((PX, PX // 2), Image.LANCZOS)


def text_mask(text, font_path, size_px, centre_x, baseline_y, max_w=None):
    """Mask of a line of text centred on centre_x with its baseline at baseline_y (px)."""
    font = ImageFont.truetype(font_path, int(size_px * SS))
    l, t, r, b = font.getbbox(text, anchor="ls")
    if max_w and (r - l) > max_w * SS:
        font = ImageFont.truetype(font_path, int(size_px * SS * max_w * SS / (r - l)))
        l, t, r, b = font.getbbox(text, anchor="ls")
    im = Image.new("L", (PX * SS, PX // 2 * SS), 0)
    ImageDraw.Draw(im).text((centre_x * SS - (l + r) / 2, baseline_y * SS), text, font=font, fill=255, anchor="ls")
    return im.resize((PX, PX // 2), Image.LANCZOS)


def emboss(geom, rise_in, edge_in, ss=4):
    """Height field (inches) for a stamped shape: flat top, sloped walls.
    Worked out at ss x resolution and averaged down so diagonals stay smooth."""
    m = np.asarray(mask_of(geom, ss, keep=True)) > 127
    t = np.clip(ndimage.distance_transform_edt(m) / (S * ss) / edge_in, 0, 1)
    t = t * t * (3 - 2 * t) * rise_in
    return t.reshape(PX // 2, ss, PX, ss).mean(axis=(1, 3))


def main(serial="BADT4ST", out=os.path.join(HERE, "..", "assets", "plate")):
    os.makedirs(out, exist_ok=True)
    serial = serial.upper()
    span = len(serial) * GLYPH_W + (len(serial) - 1) * GAP
    x0 = (W_IN - span) / 2
    glyphs = unary_union([
        affinity.translate(glyph(c), x0 + i * (GLYPH_W + GAP), SERIAL_TOP) for i, c in enumerate(serial)
    ])
    serial_mask = mask_of(glyphs)

    rim = box(RIM_INSET, RIM_INSET, W_IN - RIM_INSET, H_IN - RIM_INSET).buffer(0.32, join_style=1).buffer(-0.32, join_style=1)
    rim = rim.difference(rim.buffer(-RIM_WIDTH, join_style=1))

    slots = unary_union([
        LineString([(x - (SLOT_W - SLOT_H) / 2, y), (x + (SLOT_W - SLOT_H) / 2, y)]).buffer(SLOT_H / 2) for x, y in SLOTS
    ])
    slot_mask = mask_of(slots)

    script = text_mask("California", os.path.join(HERE, "fonts", "yellowtail-latin-400-normal.woff"),
                       1.15 * S, PX / 2, SCRIPT_BASELINE * S, max_w=SCRIPT_WIDTH * S)
    dmv = text_mask("dmv.ca.gov", "/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf",
                    DMV_HEIGHT * 1.42 * S, PX / 2, DMV_BASELINE * S)

    # Height: stamped serial and rim (about 1.2 mm), flat screen-printed script.
    height = np.maximum(emboss(glyphs, 0.05, 0.045), emboss(rim, 0.035, 0.035))
    height = ndimage.gaussian_filter(height, 1.0)  # rounds the stamped edges

    # Colour.
    rng = np.random.default_rng(7)
    base = np.empty((PX // 2, PX, 3), np.float32)
    base[:] = SHEET
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (PX // 2, PX)), 1.2)
    base += grain[..., None] * 1.6  # faint reflective-sheeting texture
    # Ink sits on the top face of the stamped characters; the walls stay white.
    top = np.clip((height / 0.05 - 0.55) / 0.35, 0, 1)[..., None] * (np.asarray(serial_mask)[..., None] > 0)
    def over(col, a):
        nonlocal base
        base = base * (1 - a) + np.asarray(col, np.float32) * a
    over(BLUE, top)
    over(RED, (np.asarray(script, np.float32) / 255)[..., None])
    over(RED, (np.asarray(dmv, np.float32) / 255)[..., None])
    alpha = 255 - np.asarray(slot_mask)
    rgba = np.dstack([np.clip(base, 0, 255).astype(np.uint8), alpha.astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").save(os.path.join(out, "ca-plate.webp"), quality=92, method=6)

    # Normal map (OpenGL convention, +Y up; image rows run downward).
    k = S  # height is in inches, gradients per pixel -> per inch
    dy, dx = np.gradient(height * k)
    n = np.dstack([-dx, dy, np.ones_like(dx)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    nrm = ((n * 0.5 + 0.5) * 255).round().astype(np.uint8)
    Image.fromarray(nrm, "RGB").save(os.path.join(out, "ca-plate-normal.webp"), quality=95, method=6)
    print("wrote", out)


if __name__ == "__main__":
    main(*sys.argv[1:])
