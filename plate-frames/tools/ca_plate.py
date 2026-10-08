"""Bake the demo licence plate that sits behind every frame in the viewer.

A standard-issue California passenger plate (1993 design, with "dmv.ca.gov"
added along the bottom in 2011): white reflective sheeting, red "California"
script across the top, dark blue stamped serial, red dmv.ca.gov, a raised
border rim and four mounting slots, with month and year registration stickers
in the top corners. 12 x 6 in.

Outputs (2048 x 1024, plate face only):
  <out>/ca-plate.webp         colour + alpha (alpha cuts the mounting slots)
  <out>/ca-plate-normal.webp  tangent-space normal map of the embossing

The serial glyphs are drawn here as vector shapes in the style of the
California dies (narrow, even stroke, squared stems, rounded bowls) because
the faithful digital version, Penitentiary Gothic, is a commercial font.

usage: python3 ca_plate.py [SERIAL] [OUT_DIR] [MONTH] [YEAR]   (site uses BADT4ST . JUN 2019)
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
STICKER = (236, 178, 32)  # this run's registration colour
INK = (24, 24, 28)

# Layout, inches from the top-left corner of the plate, measured off a photo
# of a real plate (7MIA732): the serial runs almost edge to edge, the script
# spans the gap between the top mounting slots.
GLYPH_H = 2.56
GLYPH_W = 1.32
STROKE = 0.36
GAP = 0.17
SERIAL_TOP = 2.36
# "California" is traced from a photo of the real plate's hand-lettered
# script (fonts/ca-script-trace.png), not set in a font. Box in inches.
SCRIPT_BOX = (2.85, 0.52, 9.25, 2.28)
DMV_BOX = (3.45, 5.10, 8.55, 5.60)    # letter-spaced, ascender top to baseline
RIM_INSET = 0.16
RIM_WIDTH = 0.10
SLOTS = [(2.5, 0.53), (9.5, 0.53), (2.5, 5.28), (9.5, 5.28)]  # 7 in x 4.75 in pattern
SLOT_W, SLOT_H = 0.55, 0.30
# Registration stickers at real size: month top-left, year top-right (CA rear
# plate). Frames with a wide top bar partly cover them, as on a real car.
MONTH_BOX = (0.22, 0.30, 2.14, 1.38)
YEAR_BOX = (9.86, 0.30, 11.78, 1.38)
MONTH_BG, MONTH_INK = (246, 247, 244), (48, 96, 186)    # white vinyl, blue month
YEAR_BG, YEAR_INK = (92, 205, 238), (18, 18, 20)        # 2019 run: light blue, black print
FONTS = os.path.join(HERE, "fonts")
DIGITS = os.path.join(FONTS, "BigShoulders-Bold.ttf")
SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


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
    font = ImageFont.truetype(font_path, max(1, int(size_px * SS)))
    l, t, r, b = font.getbbox(text, anchor="ls")
    if max_w and (r - l) > max_w * SS:
        font = ImageFont.truetype(font_path, max(1, int(size_px * SS * max_w * SS / (r - l))))
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


def rounded_box(x0, y0, x1, y1, r):
    return box(x0 + r, y0 + r, x1 - r, y1 - r).buffer(r, resolution=16)


def box_text(text, font, box, ss=4):
    """Mask of text squeezed/stretched to fill a box (inches) exactly: condensed type without a condensed font."""
    x0, y0, x1, y1 = box
    f = ImageFont.truetype(font, 400)
    l, t, r, b = f.getbbox(text)
    im = Image.new("L", (r - l + 8, b - t + 8), 0)
    ImageDraw.Draw(im).text((4 - l, 4 - t), text, font=f, fill=255)
    im = im.crop(im.getbbox())
    w, h = round((x1 - x0) * S), round((y1 - y0) * S)
    out = Image.new("L", (PX, PX // 2), 0)
    out.paste(im.resize((w, h), Image.LANCZOS), (round(x0 * S), round(y0 * S)))
    return np.asarray(out, np.float32) / 255


def spaced_text(text, font, box, squeeze=1.0):
    """Letter-spaced line: glyphs at their natural shape (optionally narrowed), spread to span the box."""
    x0, y0, x1, y1 = box
    f = ImageFont.truetype(font, 400)
    asc = f.getbbox("dh")[1]; base = f.getmetrics()[0]
    scale = (y1 - y0) * S / (base - asc)
    widths = [(f.getbbox(c)[2] - f.getbbox(c)[0]) * scale * squeeze for c in text]
    gap = ((x1 - x0) * S - sum(widths)) / (len(text) - 1)
    out = np.zeros((PX // 2, PX), np.float32); x = x0 * S
    for c, w in zip(text, widths):
        l, t, r, b = f.getbbox(c)
        im = Image.new("L", (r - l + 4, base - asc + 4 + max(0, b - base)), 0)
        ImageDraw.Draw(im).text((2 - l, 2 - asc), c, font=f, fill=255)
        hh = round(im.size[1] * scale); im = im.resize((max(1, round(w)), hh), Image.LANCZOS)
        px, py = round(x), round(y0 * S - 2 * scale)
        a = np.asarray(im, np.float32) / 255
        out[py:py + a.shape[0], px:px + a.shape[1]] = np.maximum(out[py:py + a.shape[0], px:px + a.shape[1]], a[:PX // 2 - py, :PX - px])
        x += w + gap
    return out


def _t(text, font, size_in, cx_in, base_in, max_w_in=None):
    return np.asarray(text_mask(text, font, size_in * S, cx_in * S, base_in * S,
                                max_w=max_w_in * S if max_w_in else None), np.float32) / 255


def month_sticker(rect, month):
    """CA month sticker: white with the month in heavy blue capitals filling most of it."""
    x0, y0, x1, y1 = rect; w, h = x1 - x0, y1 - y0
    ink = box_text(month, SANS, (x0 + w * 0.08, y0 + h * 0.20, x1 - w * 0.08, y1 - h * 0.20))
    return rounded_box(x0, y0, x1, y1, 0.05), ink


def year_sticker(rect, year, control="178-839-2899", code="ACTM"):
    """CA year sticker: light blue, 'CA' stacked at the left, the full year in big condensed black
    digits, a stacked office code at the right, a faint state seal behind the year and a control
    number along the bottom."""
    x0, y0, x1, y1 = rect; w, h = x1 - x0, y1 - y0
    X = lambda f: x0 + w * f
    Y = lambda f: y0 + h * f
    layers = [box_text(str(year), SANS, (X(0.15), Y(0.10), X(0.85), Y(0.63))),
              box_text(control, SANS, (X(0.04), Y(0.72), X(0.96), Y(0.90)))]
    for i, ch in enumerate("CA"):
        layers.append(box_text(ch, SANS, (X(0.035), Y(0.10 + 0.27 * i), X(0.12), Y(0.32 + 0.27 * i))))
    for i, ch in enumerate(code):
        layers.append(box_text(ch, SANS, (X(0.885), Y(0.07 + 0.155 * i), X(0.95), Y(0.19 + 0.155 * i))))
    ink = np.maximum.reduce(layers)
    yy, xx = np.mgrid[0:PX // 2, 0:PX] / S
    r = np.hypot(xx - X(0.5), yy - Y(0.37))
    seal = ((r < h * 0.30) & (r > h * 0.26)) | (r < h * 0.20)
    return rounded_box(x0, y0, x1, y1, 0.05), ink, seal.astype(np.float32)


def sticker(rect, big, small, top_line):
    """A registration sticker: coloured vinyl, rounded corners, a big line of
    black text, a small CA line above it and a tiny control number below."""
    x0, y0, x1, y1 = rect
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) / 2 * S
    shape = rounded_box(x0, y0, x1, y1, 0.07)
    ink = np.maximum.reduce([
        np.asarray(text_mask(top_line, SANS, h * 0.15 * S, cx, (y0 + h * 0.19) * S, max_w=w * 0.8 * S), np.float32),
        np.asarray(text_mask(big, DIGITS, h * 0.62 * S, cx, (y0 + h * 0.80) * S, max_w=w * 0.80 * S), np.float32),
        np.asarray(text_mask(small, SANS, h * 0.10 * S, cx, (y0 + h * 0.93) * S, max_w=w * 0.7 * S), np.float32),
    ]) / 255
    return shape, ink


def main(serial="BADT4ST", out=os.path.join(HERE, "..", "assets", "plate"), month="JAN", year="2019"):
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

    script = Image.new("L", (PX, PX // 2), 0)
    sx0, sy0, sx1, sy1 = (round(v * S) for v in SCRIPT_BOX)
    script.paste(Image.open(os.path.join(FONTS, "ca-script-trace.png")).convert("L")
                 .resize((sx1 - sx0, sy1 - sy0), Image.LANCZOS), (sx0, sy0))
    dmv = (spaced_text("dmv.ca.gov", SANS, DMV_BOX, squeeze=1.0) * 255).astype(np.uint8)

    month_shape, month_ink = month_sticker(MONTH_BOX, month.upper()[:3])
    year_shape, year_ink, year_seal = year_sticker(YEAR_BOX, year)
    stickers = unary_union([month_shape, year_shape])
    month_mask = np.asarray(mask_of(month_shape), np.float32)[..., None] / 255
    year_mask = np.asarray(mask_of(year_shape), np.float32)[..., None] / 255

    # Height: stamped serial and rim (about 1.2 mm), flat screen-printed script,
    # stickers a thin vinyl step on top of the sheeting.
    height = np.maximum(emboss(glyphs, 0.05, 0.045), emboss(rim, 0.035, 0.035))
    height = ndimage.gaussian_filter(height, 1.0)  # rounds the stamped edges
    height = height + emboss(stickers, 0.006, 0.01)

    # Colour.
    rng = np.random.default_rng(7)
    base = np.empty((PX // 2, PX, 3), np.float32)
    base[:] = SHEET
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (PX // 2, PX)), 1.2)
    base += grain[..., None] * 1.6  # faint reflective-sheeting texture
    # Glass-bead sheeting has a slight cool-to-warm cast and a soft falloff
    # toward the edges, where the aluminium was bent over the rim.
    yy, xx = np.mgrid[0:PX // 2, 0:PX].astype(np.float32)
    u, v = xx / PX - 0.5, yy / (PX // 2) - 0.5
    base *= (1 - 0.015 * (u * u + v * v) * 4)[..., None]
    base += (np.asarray([-1.5, -0.5, 1.5], np.float32) * (0.5 - v)[..., None])
    # Ink sits on the top face of the stamped characters; the walls stay white.
    top = np.clip((height / 0.05 - 0.55) / 0.35, 0, 1)[..., None] * (np.asarray(serial_mask)[..., None] > 0)
    def over(col, a):
        nonlocal base
        base = base * (1 - a) + np.asarray(col, np.float32) * a
    over(BLUE, top)
    over(RED, (np.asarray(script, np.float32) / 255)[..., None])
    over(RED, (np.asarray(dmv, np.float32) / 255)[..., None])
    # Stickers: vinyl colour with a faint sheen, then the print (the seal is a lighter tint of the vinyl).
    sheen = (1.03 - 0.06 * (v[..., None] + 0.5))
    base = base * (1 - month_mask) + np.asarray(MONTH_BG, np.float32) * sheen * month_mask
    base = base * (1 - year_mask) + np.asarray(YEAR_BG, np.float32) * sheen * year_mask
    over((150, 222, 245), year_seal[..., None] * year_mask * 0.6)
    over(MONTH_INK, month_ink[..., None] * month_mask)
    over(YEAR_INK, year_ink[..., None] * year_mask)
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
