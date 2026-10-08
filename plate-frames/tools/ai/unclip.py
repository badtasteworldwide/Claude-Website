import sys, glob, os, json, re
import numpy as np, pymupdf
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clips import clip_paths
U, OUT = sys.argv[1], sys.argv[2]
ids = {'Alpine': 'alpine-f1-14', 'Racing_Bulls': 'racing-bulls-f1', 'Seicomart': 'seicomart', 'XG': 'xg', 'Williams': 'williams-f1'}
SC = 2401 / 900
info = {}
for f in sorted(glob.glob(U + '/*.ai')):
    key = os.path.basename(f)[9:].replace('_Plete.ai', ''); id_ = ids[key]
    doc = pymupdf.open(f)
    # Render with the die-cut guide visible once, only to measure the outline and window.
    doc[0].get_pixmap(matrix=pymupdf.Matrix(SC, SC), alpha=True).save(f"{OUT}/{id_}_tpl.png")
    # Hide the die-cut guide ("Template" layer): it marks the outline and isn't printed.
    off = [c["number"] for c in doc.layer_ui_configs() if c["text"].lower().startswith("template")]
    for n in off: doc.set_layer_ui_config(n, 2)  # 2 = turn off
    pg = doc[0]
    xrefs = pg.get_contents(); raw = b"".join(doc.xref_stream(x) for x in xrefs)
    clipped = pg.get_pixmap(matrix=pymupdf.Matrix(SC, SC), alpha=True); clipped.save(f"{OUT}/{id_}_clip.png")
    # Frame-outline clips: bbox of the clip path ~ the frame (8,208)-(892,655) pt; for XG the frame is split into pieces
    # whose clips each touch the outline, so drop every clip that isn't the page rect.
    edits = []
    for a, b, bb in clip_paths(raw):
        if bb is None: continue
        page_rect = bb[1] < -800
        if page_rect: continue
        is_frame = abs(bb[0] - 8) < 4 and abs(bb[2] - 892) < 4 and abs(bb[1] - 208) < 4 and abs(bb[3] - 655) < 4
        if is_frame or key == 'XG': edits.append((a, b))
    new = bytearray(raw)
    for a, b in sorted(edits, reverse=True): new[a:b] = b"n"
    doc.update_stream(xrefs[0], bytes(new))
    for x in xrefs[1:]: doc.update_stream(x, b"")
    pg = doc[0]
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(SC, SC), alpha=True); pix.save(f"{OUT}/{id_}_unclip.png")
    a = np.asarray(Image.open(f"{OUT}/{id_}_tpl.png"))[..., 3]
    ys, xs = np.nonzero(a > 128)
    info[id_] = dict(hidden_layers=len(off), clips_removed=len(edits), outline=[int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1])
    print(id_, info[id_])
json.dump(info, open(f"{OUT}/info.json", "w"))
