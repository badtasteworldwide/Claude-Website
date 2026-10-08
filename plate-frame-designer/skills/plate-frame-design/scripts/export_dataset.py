"""Export the frame catalogue as a training manifest: one JSON object per design.

Joins the viewer catalogue (catalog.js: name, collection, source print, product), the per-design crop
overrides (print_fit.json) and the edge clean-up exemptions (edge_cleanup.KEEP). Each record says where the
print came from and what had to be corrected for it to land on the frame, which is the label a designer
model should learn to get right the first time.

usage: python3 -I export_dataset.py <catalog.js> <out.jsonl> [print_fit.json]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "..", "..", "plate-frame-3d-textures", "scripts")
sys.path.insert(0, TEX)
from edge_cleanup import KEEP  # noqa: E402


def main(catalog, out, fit_path=os.path.join(TEX, "print_fit.json")):
    src = open(catalog).read()
    groups = json.loads(src.split("export const GROUPS = ", 1)[1].split(";\n\nexport", 1)[0])
    fit = {k: v for k, v in json.load(open(fit_path)).items() if not k.startswith("_")}
    n = 0
    with open(out, "w") as f:
        for g in groups:
            for d in g["designs"]:
                o = fit.get(d["id"], {})
                rec = dict(
                    id=d["id"], name=d["name"], collection=g["name"],
                    source_file=d.get("file"), source_folder=d.get("folder"), modified=d.get("modified"),
                    current=d.get("current", False), flipped=bool(d.get("flipped")) or o.get("flip") == "1",
                    listed=bool(d.get("product")), product_handle=d.get("product"), product_title=d.get("productTitle"),
                    crop_override={k: float(v) for k, v in o.items() if k != "flip"} or None,
                    edge_bands_are_art=d["id"] in KEEP,
                )
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                n += 1
    print(n, "designs ->", out)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
