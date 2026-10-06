"""Extract flat, front-on frame textures from the design files in Google Drive.

Each source is either a flat artwork mockup (PNG) or a top-down product photo
(HEIC/JPG on a white sweep). We find the frame's four (virtual, sharp) outer
corners, refine them so the template outline lands on the strongest image
edges, then warp the frame into a canonical texture whose edges are exactly
the frame's outer edges. Pixels outside the frame (rounded corners, window,
mount holes) are made transparent.

Usage:
    python3 -I tools/extract_textures.py <source-dir> <out-dir>
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = json.load(open(os.path.join(HERE, "..", "assets", "frame-template.json")))

TEX_W = 2048
TEX_H = round(TEX_W * TEMPLATE["heightIn"] / TEMPLATE["widthIn"])

# id -> (source file, mode, optional rough outer corners TL,TR,BR,BL in px)
SOURCES = {
    # Product photos on white
    "mclaren": ("IMG_2707.jpg", "photo", None),
    "ferrari": ("IMG_2708.jpg", "photo", None),
    "red-bull": ("IMG_2709.jpg", "photo", None),
    "mercedes": ("IMG_2710.jpg", "photo", None),
    # White top blends into the sweep, so seed the corners by hand.
    "motul": ("IMG_2711.jpg", "photo", [(688, 872), (3352, 864), (3360, 2220), (688, 2220)]),
    "gulf": ("IMG_2712.jpg", "photo", None),
    "honda-jaccs": ("IMG_2713.jpg", "photo", None),
    "nissan-xanavi": ("IMG_2714.jpg", "photo", None),
    "hks": ("IMG_2716.jpg", "photo", None),
    "mazda-renown": ("Renown.jpg", "photo", None),
    "raising-canes": ("IMG_2727.jpg", "photo", None),
    # Original flat artwork (concept renders)
    "mclaren@art": ("F1 Plates-01.png", "art", [(98, 267), (1701, 267), (1701, 1078), (98, 1078)]),
    "red-bull@art": ("F1 Plates-02.png", "art", [(120, 280), (1679, 280), (1679, 1068), (120, 1068)]),
    "mercedes@art": ("F1 Plates-03.png", "art", [(133, 287), (1668, 287), (1668, 1063), (133, 1063)]),
    "ferrari@art": ("F1 Plates-04.png", "art", [(145, 293), (1655, 293), (1655, 1055), (145, 1055)]),
    "raising-canes@art": ("Raising Cane's-01.png", "art", [(157, 505), (1718, 505), (1718, 1295), (157, 1295)]),
}


def rounded_rect(x0, y0, x1, y1, r, n=10):
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(n + 1):
            a = np.radians(a0 + 90 * i / n)
            pts.append((cx + r * np.cos(a), cy + r * np.sin(a)))
    return pts


def template_outlines(W, H):
    """Outer outline, window outline and hole circles in pixel space for a W x H texture."""
    t = TEMPLATE
    w = t["window"]
    outer = rounded_rect(0, 0, W, H, t["outerRadius"] * H)
    r = w["radius"] * H
    L, R, T, N, B = w["left"] * W, w["right"] * W, w["top"] * H, w["notchTop"] * H, w["bottom"] * H
    s0, s1 = w["shoulderStart"] * W, w["shoulderEnd"] * W
    window = []
    # top-left corner arc, then shoulder, notch, mirrored shoulder, top-right arc
    for i in range(9):
        a = np.radians(180 + 90 * i / 8)
        window.append((L + r + r * np.cos(a), T + r + r * np.sin(a)))
    window += [(s0, T), (s1, N), (W - s1, N), (W - s0, T)]
    for i in range(9):
        a = np.radians(270 + 90 * i / 8)
        window.append((R - r + r * np.cos(a), T + r + r * np.sin(a)))
    for i in range(9):
        a = np.radians(0 + 90 * i / 8)
        window.append((R - r + r * np.cos(a), B - r + r * np.sin(a)))
    for i in range(9):
        a = np.radians(90 + 90 * i / 8)
        window.append((L + r + r * np.cos(a), B - r + r * np.sin(a)))
    holes = [(hx * W, t["holes"]["y"] * H, t["holes"]["diameter"] * W / 2) for hx in t["holes"]["x"]]
    return outer, window, holes


def frame_mask(W, H, ss=2):
    outer, window, holes = template_outlines(W * ss, H * ss)
    m = np.zeros((H * ss, W * ss), np.uint8)
    cv2.fillPoly(m, [np.int32(np.round(outer))], 255)
    cv2.fillPoly(m, [np.int32(np.round(window))], 0)
    for x, y, r in holes:
        cv2.circle(m, (int(x), int(y)), int(r), 0, -1)
    return cv2.resize(m, (W, H), interpolation=cv2.INTER_AREA)


def initial_quad_photo(img):
    """Rough outer corners for a frame on a light background."""
    small_scale = 1200 / img.shape[1]
    small = cv2.resize(img, None, fx=small_scale, fy=small_scale, interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_RGB2HSV)
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    bg = np.median(gray[:40, :])
    fg = ((hsv[..., 1] > 40) | (gray < bg - 35)).astype(np.uint8) * 255
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    biggest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    ys, xs = np.where(lab == biggest)
    pts = np.stack([xs, ys], 1).astype(np.float32)
    # Extreme points along the diagonals give the (rounded) corners; the
    # refinement step below pulls them onto the virtual sharp corners.
    s, d = pts.sum(1), pts[:, 0] - pts[:, 1]
    quad = np.array([pts[s.argmin()], pts[d.argmax()], pts[s.argmax()], pts[d.argmin()]])
    # Push outward a little: extreme diagonal points sit inside the rounded corner.
    c = quad.mean(0)
    quad = c + (quad - c) * 1.01
    return quad / small_scale


def edge_score(grad, quad, W, H, samples):
    Hm = cv2.getPerspectiveTransform(np.float32([(0, 0), (W, 0), (W, H), (0, H)]), np.float32(quad))
    p = cv2.perspectiveTransform(samples[None], Hm)[0]
    x = np.clip(p[:, 0], 0, grad.shape[1] - 1).astype(int)
    y = np.clip(p[:, 1], 0, grad.shape[0] - 1).astype(int)
    return grad[y, x].mean()


def contour_samples(W, H, step=4):
    outer, window, _ = template_outlines(W, H)
    out = []
    for poly in (outer, window):
        poly = np.array(poly + [poly[0]])
        for a, b in zip(poly[:-1], poly[1:]):
            n = max(1, int(np.hypot(*(b - a)) / step))
            for i in range(n):
                out.append(a + (b - a) * i / n)
    return np.float32(out)


def refine_quad(img, quad, iters=4):
    """Coordinate-descent each corner so the template outlines sit on strong edges."""
    scale = 1600 / max(img.shape[:2])
    small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(small, cv2.COLOR_RGB2LAB).astype(np.float32)
    gx = sum(np.abs(cv2.Sobel(g[..., i], cv2.CV_32F, 1, 0, ksize=3)) for i in range(3))
    gy = sum(np.abs(cv2.Sobel(g[..., i], cv2.CV_32F, 0, 1, ksize=3)) for i in range(3))
    grad = cv2.GaussianBlur(gx + gy, (5, 5), 1.2)
    W, H = 1000, round(1000 * TEX_H / TEX_W)
    samples = contour_samples(W, H)
    q = np.float32(quad) * scale
    best = edge_score(grad, q, W, H, samples)
    for step in (8, 4, 2, 1, 0.5):
        for _ in range(iters):
            improved = False
            for k in range(4):
                for dx, dy in ((step, 0), (-step, 0), (0, step), (0, -step)):
                    cand = q.copy()
                    cand[k] += (dx, dy)
                    sc = edge_score(grad, cand, W, H, samples)
                    if sc > best:
                        best, q, improved = sc, cand, True
            if not improved:
                break
    return q / scale, best


def extract(src_dir, out_dir, only=None):
    os.makedirs(out_dir, exist_ok=True)
    alpha = frame_mask(TEX_W, TEX_H)
    report = {}
    for key, (fname, mode, rough) in SOURCES.items():
        if only and key not in only:
            continue
        img = np.asarray(Image.open(os.path.join(src_dir, fname)).convert("RGB"))
        quad = np.float32(rough) if rough else initial_quad_photo(img)
        quad, score = refine_quad(img, quad)
        Hm = cv2.getPerspectiveTransform(np.float32(quad), np.float32([(0, 0), (TEX_W, 0), (TEX_W, TEX_H), (0, TEX_H)]))
        flat = cv2.warpPerspective(img, Hm, (TEX_W, TEX_H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        # Bleed frame colours a few px into the transparent areas so mipmaps
        # and edge sampling never pick up the photo background.
        solid = (alpha > 200).astype(np.uint8)
        band = cv2.dilate(solid, np.ones((25, 25), np.uint8)) - solid
        bled = cv2.inpaint(flat, band, 4, cv2.INPAINT_TELEA)
        rgba = np.dstack([bled, alpha])
        name = key.replace("@", "--")
        Image.fromarray(rgba).save(os.path.join(out_dir, name + ".webp"), quality=90, method=6)
        report[key] = {"score": round(float(score), 1), "quad": np.round(quad).astype(int).tolist()}
        print(key, report[key])
    return report


if __name__ == "__main__":
    extract(sys.argv[1], sys.argv[2], set(sys.argv[3:]) or None)
