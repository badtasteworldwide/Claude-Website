"""Pack the viewer's assets for Shopify Files.

Shopify Files is a flat list, so instead of ~290 separate textures the
textures are packed into sheets of 8 (4 x 2 cells of 2048 x 1051); the
section's script cuts out the one it needs. Output goes to shopify/files/:

  pfg-sheet-NN.webp   texture sheets
  pfg-thumbs.webp     thumbnail sprite (same as assets/thumbs.webp)
  pfg-frame.glb       the frame model
  pfg-plate.webp      the stamped California demo plate (+ pfg-plate-normal.webp)
  pfg-catalog.json    designs, collections, product handles, sheet/cell

Usage: python3 -I plate-frames/tools/shopify_pack.py
"""
import json
import os
import shutil

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "shopify", "files")
COLS, ROWS = 4, 2
PER = COLS * ROWS


def main():
    src = open(os.path.join(ROOT, "js", "catalog.js")).read()
    head = src.split("export const GROUPS = ", 1)[0]
    groups = json.loads(src.split("export const GROUPS = ", 1)[1].split(";\n\nexport", 1)[0])
    thumb_rows = int(head.split("THUMB_ROWS = ", 1)[1].split(";", 1)[0])
    thumb_cols = int(head.split("THUMB_COLS = ", 1)[1].split(";", 1)[0])
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))

    designs = [d for g in groups for d in g["designs"]]
    tw, th = Image.open(os.path.join(ROOT, "assets", "textures", designs[0]["id"] + ".webp")).size
    for n in range(0, len(designs), PER):
        sheet = Image.new("RGB", (tw * COLS, th * ROWS), (255, 255, 255))
        for k, d in enumerate(designs[n:n + PER]):
            im = Image.open(os.path.join(ROOT, "assets", "textures", d["id"] + ".webp")).convert("RGB")
            sheet.paste(im, ((k % COLS) * tw, (k // COLS) * th))
            d["sheet"], d["cell"] = n // PER, k
        sheet.save(os.path.join(OUT, f"pfg-sheet-{n // PER:02d}.webp"), quality=86, method=6)

    shutil.copy(os.path.join(ROOT, "assets", "thumbs.webp"), os.path.join(OUT, "pfg-thumbs.webp"))
    shutil.copy(os.path.join(ROOT, "assets", "models", "plate-frame.glb"), os.path.join(OUT, "pfg-frame.glb"))
    shutil.copy(os.path.join(ROOT, "assets", "plate", "ca-plate.webp"), os.path.join(OUT, "pfg-plate.webp"))
    shutil.copy(os.path.join(ROOT, "assets", "plate", "ca-plate-normal.webp"), os.path.join(OUT, "pfg-plate-normal.webp"))
    catalog = {
        "texture": {"width": tw, "height": th, "cols": COLS, "rows": ROWS},
        "thumbs": {"cols": thumb_cols, "rows": thumb_rows},
        "groups": groups,
    }
    json.dump(catalog, open(os.path.join(OUT, "pfg-catalog.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    print(len(designs), "designs ->", -(-len(designs) // PER), "sheets")


if __name__ == "__main__":
    main()
