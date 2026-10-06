"""Turn rendered print artwork (PNG with transparency, from the Illustrator/EPS
files) into frame textures that line up with assets/frame-template.json.

The print files are flat rectangles with ~1-2% bleed past the frame's outer
edge and a plain rectangular window; the mold cuts the real outline. A sheet
or artboard may hold several frames side by side, so every frame-shaped
block of artwork on the page becomes its own texture.

Usage:
    python3 -I tools/vector_textures.py <render.png> <out-dir> <name>
Prints one line per texture written: <out-path> <bbox> <coverage>
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
PRINT_ASPECT = 1.942
TEX_W = 2048
TEX_H = round(TEX_W * 160.57 / 312.76)  # blank frame model: 312.76 x 160.57 mm

# The prints are laid out for the production mold, whose top bar is deeper
# than the blank model's (window notch at 18.1% vs 16.0% of the height).
# Map print -> mold outline -> model outline, piecewise per axis, so artwork
# fills the model's bars without logos running into the window.
#
# Outer frame edges inside the print (fractions of the print artboard).
# Not trimmed: on the blank model the full artboard is the face, and trimming
# clipped text that sits close to the outer edge on many DomSem sheets.
BLEED = dict(x0=0.0, x1=1.0, y0=0.0, y1=1.0)
# Window edges as fractions of the outer frame: production mold vs model.
# The mold values sit ~1% inside the measured window so the thin white
# keylines many prints draw around their window fall into the window.
MOLD_X, MODEL_X = (0.050, 0.950), (0.0454, 0.9559)
MOLD_Y, MODEL_Y = (0.192, 0.834), (0.1596, 0.8105)


_FACE = None


def model_face():
    """Front-face mask of the blank model at texture resolution (cached)."""
    global _FACE
    if _FACE is None:
        from stl_mask import front_mask
        _FACE = front_mask(TEX_W)
        _FACE = cv2.resize(_FACE, (TEX_W, TEX_H), interpolation=cv2.INTER_AREA) > 127
    return _FACE


def model_to_mold(t, model, mold):
    """Piecewise-linear map of model fractions to mold fractions."""
    xs = np.array([0.0, model[0], model[1], 1.0])
    ys = np.array([0.0, mold[0], mold[1], 1.0])
    return np.interp(t, xs, ys)


def frame_blocks(alpha):
    """Bounding boxes of frame-shaped artwork blocks, largest first."""
    solid = (alpha > 24).astype(np.uint8)
    # Close small gaps so a frame's separate shapes merge into one block.
    k = max(3, int(min(alpha.shape) * 0.004)) | 1
    merged = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(merged)
    blocks = []
    for x, y, w, h, area in stats[1:]:
        if h == 0 or not (1.80 <= w / h <= 2.10):
            continue
        blocks.append((int(x), int(y), int(w), int(h)))
    if not blocks:
        return []
    biggest = max(w for _, _, w, _ in blocks)
    blocks = [b for b in blocks if b[2] >= biggest * 0.6 and b[2] >= 300]
    blocks.sort(key=lambda b: (b[1] // max(1, b[3] // 2), b[0]))  # reading order
    return blocks


def to_texture(rgba, box, mold_x=MOLD_X, mold_y=MOLD_Y):
    x, y, w, h = box
    # Re-fit to the print aspect in case stray marks widened the box.
    cx, cy = x + w / 2, y + h / 2
    if w / h > PRINT_ASPECT:
        w = h * PRINT_ASPECT
    else:
        h = w / PRINT_ASPECT
    x, y = cx - w / 2, cy - h / 2
    u = model_to_mold((np.arange(TEX_W) + 0.5) / TEX_W, MODEL_X, mold_x)
    v = model_to_mold((np.arange(TEX_H) + 0.5) / TEX_H, MODEL_Y, mold_y)
    px = x + (BLEED["x0"] + u * (BLEED["x1"] - BLEED["x0"])) * w
    py = y + (BLEED["y0"] + v * (BLEED["y1"] - BLEED["y0"])) * h
    map_x, map_y = np.meshgrid(px.astype(np.float32), py.astype(np.float32))
    flat = cv2.remap(rgba, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    rgb, a = flat[..., :3].astype(np.float32), flat[..., 3:4].astype(np.float32) / 255
    # Unprinted areas of the sheet are bare white stock.
    rgb = (rgb * a + 255 * (1 - a)).astype(np.uint8)
    coverage = float((flat[..., 3] > 24).mean())
    # The model's window edge doesn't sit exactly where each print's ink
    # stops, which can leave a hairline of bare stock around the window.
    # Fill unprinted pixels in a narrow band around the window (and the
    # window itself) from the surrounding colours; bare-white designs stay white.
    face = model_face()
    near = cv2.dilate((~face).astype(np.uint8), np.ones((41, 41), np.uint8)) > 0
    outside = cv2.floodFill((~face).astype(np.uint8), None, (0, 0), 2)[1] == 2
    hole = ((near & face) | (~face & ~outside)) & (flat[..., 3] < 128)
    rgb = cv2.inpaint(rgb, hole.astype(np.uint8), 6, cv2.INPAINT_TELEA)
    return rgb, coverage


# DomSem A3 print sheets: three copies of one frame stacked vertically at
# fixed positions. Unprinted (white-stock) areas are transparent, so shape
# detection is unreliable there; use the top slot of the fixed layout.
SHEET_ASPECT = 3549 / 6000
SHEET_TOP = 0.0228


# Single-frame artboards (the EPS/AI/300ppi exports) share one page layout too.
ARTBOARD_ASPECT = 2401 / 2305
ARTBOARD_TOP = 0.2323


def sheet_slot(shape):
    H, W = shape[:2]
    if abs(W / H - SHEET_ASPECT) <= 0.01:
        return (0, int(round(SHEET_TOP * H)), W, int(round(W / PRINT_ASPECT)))
    return None


def artboard_slot(shape):
    H, W = shape[:2]
    if abs(W / H - ARTBOARD_ASPECT) <= 0.01:
        return (0, int(round(ARTBOARD_TOP * H)), W, int(round(W / PRINT_ASPECT)))
    return None


def main(render_path, out_dir, name, *fit):
    """fit: optional per-design overrides of the print's window edges, e.g.
    top=0.22 bottom=0.80 left=0.06 right=0.94 (fractions of the artboard).
    Raise top / lower bottom when a print's lettering sits too close to its
    window and would otherwise run into the model's thinner bars."""
    f = dict(kv.split("=") for kv in fit)
    mold_x = (float(f.get("left", MOLD_X[0])), float(f.get("right", MOLD_X[1])))
    mold_y = (float(f.get("top", MOLD_Y[0])), float(f.get("bottom", MOLD_Y[1])))
    im = Image.open(render_path).convert("RGBA")
    rgba = np.asarray(im)
    slot = sheet_slot(rgba.shape)
    blocks = [slot] if slot else frame_blocks(rgba[..., 3])
    if not blocks and artboard_slot(rgba.shape):
        # Sparse art (lettering on bare white stock) has no solid frame shape.
        blocks = [artboard_slot(rgba.shape)]
    os.makedirs(out_dir, exist_ok=True)
    for i, box in enumerate(blocks):
        tex, cov = to_texture(rgba, box, mold_x, mold_y)
        out = os.path.join(out_dir, f"{name}{'' if len(blocks) == 1 else f'__{i + 1}'}.webp")
        Image.fromarray(tex).save(out, quality=90, method=4)
        print(out, *box, f"{cov:.3f}")


if __name__ == "__main__":
    main(*sys.argv[1:])
