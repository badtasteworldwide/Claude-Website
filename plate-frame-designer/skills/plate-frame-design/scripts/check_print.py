"""Pre-flight check for a plate frame print: the problems that actually showed up on the store's frames.

Input: a rendered print (PNG with transparency, or flattened on white) in one of the known layouts: DomSem A3
three-up sheet, single 2401-px artboard, or any image where the frame is the main frame-shaped block. Or pass
--outline x0,y0,x1,y1 (px) to say where the die-cut outline is.

Checks, per side:
  bleed       Ink must run to (and past) the outer edge. A print clipped to the outline leaves white stock that
              shows as a white rim on the frame and in the 3D viewer.
  rim         Thin light or dark lines hugging the outer edge (keylines, cut guides, export halos).
  window      (note) Distance from the window edge to the nearest artwork detail (text, logo edges). The 3D model's and
              some molds' bars are thinner than the print's, and the plate sits in the window: detail closer
              than SAFE_WINDOW_MM can be hidden or touch the plate.
  outer       (note) Distance from the outer edge to the nearest detail. The mold rounds and wraps the edge.

Only bleed and rim are warnings. The distance checks can't tell a logo from an all-over pattern, so they are
notes with a --preview overlay (magenta = detected detail, blue = die-cut window, orange = safe margins).

usage: python3 -I check_print.py <print.png> [--outline x0,y0,x1,y1] [--flip] [--preview out.png] [--json]
Exit status 0 = no warnings, 1 = warnings.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "plate-frame-3d-textures", "scripts"))
import vector_textures as vt  # noqa: E402

# Production die-cut, measured from the "Template" layer of the October 2025 .ai prints (fractions of the outline).
OUTLINE_MM = (311.97, 158.03)
WINDOW = dict(top=0.1816, bottom=0.8209, left=0.0394, right=0.9593)
FLIP_WINDOW = dict(top=1 - 0.8209, bottom=1 - 0.1816, left=0.0394, right=0.9593)
SAFE_WINDOW_MM = 2.0
SAFE_OUTER_MM = 2.5


def locate(rgba):
    a = rgba[..., 3]
    slot = vt.sheet_slot(rgba.shape, a)
    if slot:
        return slot, "domsem-sheet"
    blocks = vt.frame_blocks(a)
    if blocks:
        return blocks[0], "frame-block"
    slot = vt.artboard_slot(rgba.shape)
    if slot:
        return slot, "artboard"
    raise SystemExit("couldn't find the frame; pass --outline x0,y0,x1,y1")


def flatten(rgba):
    rgb, al = rgba[..., :3].astype(np.float32), rgba[..., 3:4].astype(np.float32) / 255
    return (rgb * al + 255 * (1 - al)).astype(np.uint8)


def side_views(img):
    return {"top": img, "bottom": img[::-1], "left": img.transpose(1, 0, *range(2, img.ndim)),
            "right": img.transpose(1, 0, *range(2, img.ndim))[::-1]}


def main(path, *opts):
    rgba = np.asarray(Image.open(path).convert("RGBA"))
    if "--outline" in opts:
        x0, y0, x1, y1 = map(int, opts[opts.index("--outline") + 1].split(","))
        box, layout = (x0, y0, x1 - x0, y1 - y0), "given"
    else:
        box, layout = locate(rgba)
    x, y, w, h = map(int, box)
    crop = rgba[y:y + h, x:x + w]
    rgb = flatten(crop)
    inked = (crop[..., 3] > 24) & (rgb.min(-1) < 235)
    mm_x, mm_y = OUTLINE_MM[0] / w, OUTLINE_MM[1] / h
    win = FLIP_WINDOW if "--flip" in opts else WINDOW
    wy0, wy1, wx0, wx1 = (int(win["top"] * h), int(win["bottom"] * h), int(win["left"] * w), int(win["right"] * w))
    report = dict(file=os.path.basename(path), layout=layout, box=[x, y, w, h],
                  aspect=round(w / h, 3), expected_aspect=round(OUTLINE_MM[0] / OUTLINE_MM[1], 3), sides={})
    warnings, notes = [], []
    if abs(w / h / (OUTLINE_MM[0] / OUTLINE_MM[1]) - 1) > 0.03:
        warnings.append(f"aspect {w / h:.3f} is off the die-cut's {OUTLINE_MM[0] / OUTLINE_MM[1]:.3f}: wrong outline or art stretched")

    # Artwork detail: edges in the bars. Long straight lines (window outline, keylines, bar stripes) and the
    # bands right at the window and outer edge are the frame's own shape, not detail, so they're dropped.
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    edges = (cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 60, 160) > 0).astype(np.uint8)
    lines = cv2.morphologyEx(edges, cv2.MORPH_OPEN, np.ones((1, w // 12), np.uint8)) | \
        cv2.morphologyEx(edges, cv2.MORPH_OPEN, np.ones((h // 12, 1), np.uint8))
    edges = (edges & ~cv2.dilate(lines, np.ones((5, 5), np.uint8))) > 0
    pad = max(3, int(0.008 * h))
    bars = np.ones((h, w), bool)
    bars[wy0 - pad:wy1 + pad, wx0 - pad:wx1 + pad] = False
    bars[:pad] = bars[-pad:] = False
    bars[:, :pad] = bars[:, -pad:] = False
    edges &= bars

    ink_v, rgb_v = side_views(inked), side_views(rgb)
    for side in ("top", "bottom", "left", "right"):
        mm = mm_y if side in ("top", "bottom") else mm_x
        iv, cv = ink_v[side], rgb_v[side].astype(int)
        outer = iv[:max(2, int(0.004 * iv.shape[0]))].mean()
        inner = iv[int(0.02 * iv.shape[0]):int(0.04 * iv.shape[0])].mean()
        s = dict(edge_ink=round(float(outer), 2), ink_3pct_in=round(float(inner), 2))
        if inner > 0.3 and outer < 0.6 * inner:
            warnings.append(f"{side}: no bleed, ink stops before the outer edge ({outer:.0%} vs {inner:.0%} just inside): white rim on the frame")
        # Rim lines: a thin band (<=12 px) along the edge unlike the art just inside it.
        light = (cv.min(-1) > 190) & ((cv.max(-1) - cv.min(-1)) < 45)
        dark = cv.max(-1) < 60
        for name, m in (("light", light), ("dark", dark)):
            band = m[:12].any(0) & ~m[14:18].any(0)
            if band.mean() > 0.3:
                warnings.append(f"{side}: thin {name} line along the outer edge on {band.mean():.0%} of it (keyline / cut guide?)")
                s[f"{name}_rim"] = round(float(band.mean()), 2)
        # Nearest detail to the window and to the outer edge.
        ev = side_views(edges)[side]
        # Middle of the side only (corners are the mold radius and tag notches); a row counts as detail
        # once it holds a few edge pixels, so specks and texture noise don't.
        span = ev.shape[1]
        rows = np.nonzero(ev[:, int(0.12 * span):int(0.88 * span)].sum(1) >= 6)[0]
        if side in ("top", "bottom"):
            wedge = wy0 if side == "top" else h - wy1
        else:
            wedge = wx0 if side == "left" else w - wx1
        in_bar = rows[rows < wedge]
        if len(in_bar):
            to_win, to_out = (wedge - in_bar.max()) * mm, in_bar.min() * mm
            s.update(detail_to_window_mm=round(float(to_win), 1), detail_to_outer_mm=round(float(to_out), 1))
            if to_win < SAFE_WINDOW_MM:
                notes.append(f"{side}: artwork detail {to_win:.1f} mm from the window (keep >= {SAFE_WINDOW_MM} mm)")
            if to_out < SAFE_OUTER_MM:
                notes.append(f"{side}: artwork detail {to_out:.1f} mm from the outer edge (keep >= {SAFE_OUTER_MM} mm)")
        report["sides"][side] = s
    report["warnings"], report["notes"] = warnings, notes

    if "--preview" in opts:
        out = opts[opts.index("--preview") + 1]
        pv = rgb.copy()
        pv[edges] = (255, 0, 255)
        cv2.rectangle(pv, (wx0, wy0), (wx1, wy1), (0, 160, 255), max(2, w // 600))
        sw, so = int(SAFE_WINDOW_MM / mm_x), int(SAFE_OUTER_MM / mm_x)
        cv2.rectangle(pv, (wx0 - sw, wy0 - sw), (wx1 + sw, wy1 + sw), (255, 160, 0), max(1, w // 1200))
        cv2.rectangle(pv, (so, so), (w - so, h - so), (255, 160, 0), max(1, w // 1200))
        Image.fromarray(pv).save(out)
        report["preview"] = out

    if "--json" in opts:
        print(json.dumps(report, indent=1))
    else:
        print(f"{report['file']}: {layout}, outline {w}x{h}px, aspect {report['aspect']}")
        for side, s in report["sides"].items():
            print(f"  {side:6s} {s}")
        print("PASS" if not warnings else "WARN\n  - " + "\n  - ".join(warnings))
        if notes:
            print("NOTES (judge by eye: fine for all-over patterns, a problem for text and logos)\n  - " + "\n  - ".join(notes))
    return 1 if warnings else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    sys.exit(main(*sys.argv[1:]))
