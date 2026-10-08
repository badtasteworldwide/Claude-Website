"""Render an Illustrator (.ai, PDF-compatible) plate frame print the way the print should be: background as a
full rectangle (with its bleed), assets kept inside the frame, die-cut guide hidden. Measures the mold outline
and window from the guide and optionally writes the 3D viewer texture.

House convention for the .ai layers:
  Background Design  a rectangle larger than the outline (bleed), clipped only by a rectangle mask
  Brand Logo / other the assets, clipped by the plate-frame-shaped mask so nothing falls outside the frame
  Template           the die-cut guide (outline, window, tag notches); never printed
Files that clip the background to the frame shape (the October 2025 prints did) lose their bleed, and every edge
of the frame shows a 12-17 px strip of white stock. This script drops frame-shaped clips on background layers
only and leaves asset clips alone.

usage: python3 -I ai_render.py <file.ai> <out_dir> <design-id> [--all-clips] [--texture <textures_dir>]
  --all-clips   on background layers, also drop clips that aren't the whole frame (a background split into
                pieces that each clip to part of the outline, as in XG). Check the result.
  --texture     run vector_textures.to_texture with the measured window and write <id>.webp there
Writes <out>/<id>_tpl.png (guide on), <id>_clip.png (as drawn), <id>_unclip.png, <id>_flat.png (composite
on white, window emptied), and <id>.json (outline px, window fractions, clips removed, layers hidden).
"""
import json
import os
import sys

import cv2
import numpy as np
import pymupdf
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clips import clip_layers

RENDER_W = 2401  # px across the artboard; the 300ppi exports and DomSem artboards use this width


def is_background(layer):
    """Background layers by name; a file without layers counts as all background."""
    return layer is None or any(k in layer.lower() for k in ("background", "bg", "base"))


def measure(tpl_alpha):
    """Frame outline (bbox, px) and window (fractions of the outline), from a render with the guide on.
    The window is measured along the centre lines; the bounding box would catch the tag notches."""
    ys, xs = np.nonzero(tpl_alpha > 128)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    empty = (tpl_alpha < 128).astype(np.uint8)
    outside = cv2.floodFill(empty.copy(), None, (0, 0), 2)[1] == 2
    hole = (tpl_alpha < 128) & ~outside
    n, lab, st, _ = cv2.connectedComponentsWithStats(hole.astype(np.uint8))
    if n < 2:
        raise SystemExit("no window found in the guide render")
    win_m = lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    w, h = x1 - x0, y1 - y0
    col = np.nonzero(win_m[:, (x0 + x1) // 2])[0]
    row = np.nonzero(win_m[(col[0] + col[-1]) // 2])[0]
    win = dict(top=(col[0] - y0) / h, bottom=(col[-1] + 1 - y0) / h,
               left=(row[0] - x0) / w, right=(row[-1] + 1 - x0) / w)
    return (x0, y0, x1, y1), win, win_m


def main(path, out, id_, *opts):
    all_clips = "--all-clips" in opts
    tex_dir = opts[opts.index("--texture") + 1] if "--texture" in opts else None
    os.makedirs(out, exist_ok=True)
    doc = pymupdf.open(path)
    page = doc[0]
    sc = RENDER_W / page.rect.width
    m = pymupdf.Matrix(sc, sc)
    page.get_pixmap(matrix=m, alpha=True).save(f"{out}/{id_}_tpl.png")
    # Hide the die-cut guide. set_layer(on/off) didn't take effect on these files; the UI config call does.
    off = [c["number"] for c in doc.layer_ui_configs() if c["text"].strip().lower().startswith("template")]
    for n in off:
        doc.set_layer_ui_config(n, 2)  # 2 = off
    page = doc[0]
    page.get_pixmap(matrix=m, alpha=True).save(f"{out}/{id_}_clip.png")

    tpl = np.asarray(Image.open(f"{out}/{id_}_tpl.png"))[..., 3]
    (x0, y0, x1, y1), win, win_m = measure(tpl)
    # The outline in page points, to recognise the frame clip in the content stream. Content-stream
    # coordinates can be offset by a cm transform, so compare sizes, not positions.
    fw, fh = (x1 - x0) / sc, (y1 - y0) / sc
    xrefs = page.get_contents()
    raw = b"".join(doc.xref_stream(x) for x in xrefs)
    edits = []
    for a, b, bb, layer in clip_layers(doc, page, raw):
        if bb is None:
            continue
        bw, bh = bb[2] - bb[0], bb[3] - bb[1]
        if bw >= page.rect.width * 0.99 and bh >= page.rect.height * 0.99:
            continue  # the page/artboard clip
        if not is_background(layer):
            continue  # asset clips keep logos inside the frame: leave them
        is_frame = abs(bw - fw) < 0.02 * fw and abs(bh - fh) < 0.03 * fh
        if is_frame or all_clips:
            edits.append((a, b))
    new = bytearray(raw)
    for a, b in sorted(edits, reverse=True):
        new[a:b] = b"n"  # "W n" -> "n": keep the path's end-paint, drop the clip
    doc.update_stream(xrefs[0], bytes(new))
    for x in xrefs[1:]:
        doc.update_stream(x, b"")
    page = doc[0]
    page.get_pixmap(matrix=m, alpha=True).save(f"{out}/{id_}_unclip.png")

    clip = Image.open(f"{out}/{id_}_clip.png").convert("RGBA")
    un = Image.open(f"{out}/{id_}_unclip.png").convert("RGBA")
    comp = Image.new("RGBA", un.size, (255, 255, 255, 255))
    comp.alpha_composite(un)    # the bleed, from the unclipped art
    comp.alpha_composite(clip)  # the art exactly as drawn on top, in case a removed clip mattered inside
    rgba = np.asarray(comp).copy()
    rgba[win_m, 3] = 0  # empty window: the texture tool fills the window walls from the bars around it
    Image.fromarray(rgba).save(f"{out}/{id_}_flat.png")
    info = dict(source=os.path.basename(path), outline=[x0, y0, x1, y1], aspect=round((x1 - x0) / (y1 - y0), 4),
                window={k: round(v, 4) for k, v in win.items()}, clips_removed=len(edits), layers_hidden=len(off))
    json.dump(info, open(f"{out}/{id_}.json", "w"), indent=1)
    print(id_, json.dumps(info))
    if tex_dir:
        tex_tools = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "plate-frame-3d-textures", "scripts")
        sys.path.insert(0, tex_tools)
        import vector_textures as vt
        tex, cov = vt.to_texture(rgba, (x0, y0, x1 - x0, y1 - y0), (win["left"], win["right"]), (win["top"], win["bottom"]))
        os.makedirs(tex_dir, exist_ok=True)
        Image.fromarray(tex).save(f"{tex_dir}/{id_}.webp", quality=90, method=4)
        print("texture", f"{tex_dir}/{id_}.webp", f"coverage {cov:.3f}")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
