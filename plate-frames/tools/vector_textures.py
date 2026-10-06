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
from extract_textures import TEX_H, TEX_W, frame_mask  # noqa: E402

# Physical frame edges inside the print, as fractions of the print's
# artwork bounds. Measured by registering the 2025 McLaren print against the
# artwork mockup that matches the physical frame.
BLEED = dict(x0=0.0108, x1=0.9919, y0=0.0180, y1=0.9823)
PRINT_ASPECT = 1.942


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


def to_texture(rgba, box):
    x, y, w, h = box
    # Re-fit to the print aspect in case stray marks widened the box.
    cx, cy = x + w / 2, y + h / 2
    if w / h > PRINT_ASPECT:
        w = h * PRINT_ASPECT
    else:
        h = w / PRINT_ASPECT
    x, y = cx - w / 2, cy - h / 2
    src = np.float32([
        (x + BLEED["x0"] * w, y + BLEED["y0"] * h),
        (x + BLEED["x1"] * w, y + BLEED["y0"] * h),
        (x + BLEED["x1"] * w, y + BLEED["y1"] * h),
        (x + BLEED["x0"] * w, y + BLEED["y1"] * h),
    ])
    dst = np.float32([(0, 0), (TEX_W, 0), (TEX_W, TEX_H), (0, TEX_H)])
    M = cv2.getPerspectiveTransform(src, dst)
    flat = cv2.warpPerspective(rgba, M, (TEX_W, TEX_H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    rgb, a = flat[..., :3].astype(np.float32), flat[..., 3:4].astype(np.float32) / 255
    # Unprinted areas of the sheet are bare white stock.
    rgb = (rgb * a + 255 * (1 - a)).astype(np.uint8)
    mask = frame_mask(TEX_W, TEX_H)
    coverage = float((flat[..., 3][mask > 200] > 24).mean())
    solid = (mask > 200).astype(np.uint8)
    band = cv2.dilate(solid, np.ones((25, 25), np.uint8)) - solid
    rgb = cv2.inpaint(rgb, band, 4, cv2.INPAINT_TELEA)
    return np.dstack([rgb, mask]), coverage


# DomSem A3 print sheets: three copies of one frame stacked vertically at
# fixed positions. Unprinted (white-stock) areas are transparent, so shape
# detection is unreliable there; use the top slot of the fixed layout.
SHEET_ASPECT = 3549 / 6000
SHEET_TOP = 0.0228


def sheet_slot(shape):
    H, W = shape[:2]
    if abs(W / H - SHEET_ASPECT) > 0.01:
        return None
    return (0, int(round(SHEET_TOP * H)), W, int(round(W / PRINT_ASPECT)))


def main(render_path, out_dir, name):
    im = Image.open(render_path).convert("RGBA")
    rgba = np.asarray(im)
    slot = sheet_slot(rgba.shape)
    blocks = [slot] if slot else frame_blocks(rgba[..., 3])
    os.makedirs(out_dir, exist_ok=True)
    for i, box in enumerate(blocks):
        tex, cov = to_texture(rgba, box)
        out = os.path.join(out_dir, f"{name}{'' if len(blocks) == 1 else f'__{i + 1}'}.webp")
        Image.fromarray(tex).save(out, quality=90, method=4)
        print(out, *box, f"{cov:.3f}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
