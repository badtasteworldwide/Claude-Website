import sys, json
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, "/home/user/pfbuild/plate-frames/tools")
import vector_textures as vt
OUT = sys.argv[1]
info = json.load(open(f"{OUT}/info.json"))
for id_, inf in info.items():
    clip = Image.open(f"{OUT}/{id_}_clip.png").convert("RGBA"); un = Image.open(f"{OUT}/{id_}_unclip.png").convert("RGBA")
    a = np.asarray(Image.open(f"{OUT}/{id_}_tpl.png"))[..., 3]
    x0, y0, x1, y1 = inf["outline"]
    outside = cv2.floodFill((a < 128).astype(np.uint8).copy(), None, (0, 0), 2)[1] == 2
    hole = (a < 128) & ~outside
    n, lab, st, _ = cv2.connectedComponentsWithStats(hole.astype(np.uint8))
    k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); win_m = lab == k
    w, h = x1 - x0, y1 - y0
    # Measure along the centre lines: the bounding box would catch the tag notches.
    cx = (x0 + x1) // 2; col = np.nonzero(win_m[:, cx])[0]
    cy = (col[0] + col[-1]) // 2; row = np.nonzero(win_m[cy])[0]
    win = dict(top=(col[0] - y0) / h, bottom=(col[-1] + 1 - y0) / h, left=(row[0] - x0) / w, right=(row[-1] + 1 - x0) / w)
    print(id_, {k: round(v, 4) for k, v in win.items()}, "aspect", round(w / h, 4))
    comp = Image.new("RGBA", un.size, (255, 255, 255, 255)); comp.alpha_composite(un); comp.alpha_composite(clip)
    rgba = np.asarray(comp).copy()
    # Keep the window empty so the tool fills its walls from the surrounding bars.
    rgba[win_m, 3] = 0
    tex, cov = vt.to_texture(rgba, (x0, y0, w, h), (win["left"], win["right"]), (win["top"], win["bottom"]))
    Image.fromarray(tex).save(f"{OUT}/{id_}.webp", quality=90, method=4)
    inf["win"] = win
json.dump(info, open(f"{OUT}/info.json", "w"))
