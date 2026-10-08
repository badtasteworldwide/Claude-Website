"""Find clipping paths (`W n` / `W* n`) in a PDF-compatible .ai page's content stream, with their bounding box
and the Illustrator layer they sit on.

usage: python3 -I clips.py <file.ai> ...   (prints every clip: offset, layer, kind, bbox in content coordinates)
"""
import re
import sys

import pymupdf

OPS = re.compile(rb"\b(q|Q|BT|ET|BDC|EMC|cm|Do|f\*?|S|s|B\*?|b\*?|sh|gs|n)\b")


def clip_paths(raw):
    """[(start, end, bbox)] for each clip operator; the path is everything back to the previous paint/state op."""
    out = []
    for m in re.finditer(rb"\bW\*?\s+n\b", raw):
        start = m.start()
        prev = [o for o in OPS.finditer(raw, max(0, start - 200000), start)]
        s = prev[-1].end() if prev else 0
        nums = [float(x) for x in re.findall(rb"-?\d+\.?\d*", raw[s:start])]
        xs, ys = nums[0::2], nums[1::2]
        bbox = (min(xs), min(ys), max(xs), max(ys)) if xs and ys else None
        out.append((m.start(), m.end(), bbox))
    return out


def layer_names(doc, page):
    """Marked-content property name (/MC0 ...) -> Illustrator layer name."""
    txt = doc.xref_object(page.xref)
    r = re.search(r"/Resources\s*(\d+) 0 R", txt)
    res = doc.xref_object(int(r.group(1))) if r else txt
    pm = re.search(r"/Properties\s*<<(.*?)>>", res, re.S)
    names = {}
    if pm:
        for name, x in re.findall(r"/(\w+)\s+(\d+) 0 R", pm.group(1)):
            n = re.search(r"/Name\s*\((.*?)\)", doc.xref_object(int(x)))
            names[name] = n.group(1) if n else name
    return names


def clip_layers(doc, page, raw):
    """[(start, end, bbox, layer)]: each clip with the innermost Illustrator layer (optional content group) around it."""
    names = layer_names(doc, page)
    ev = [(m.start(), "B", m.group(1).decode()) for m in re.finditer(rb"/OC\s*/(\w+)\s*BDC", raw)]
    ev += [(m.start(), "b", None) for m in re.finditer(rb"/\w+\s*(?:<<[^>]*>>|/\w+)?\s*BDC", raw)
           if not raw[m.start():m.start() + 3] == b"/OC"]
    ev += [(m.start(), "E", None) for m in re.finditer(rb"\bEMC\b", raw)]
    ev.sort()
    out = []
    for a, b, bb in clip_paths(raw):
        stack = []
        for pos, k, n in ev:
            if pos > a:
                break
            if k == "E":
                if stack:
                    stack.pop()
            else:
                stack.append(names.get(n, n) if k == "B" else None)
        layers = [s for s in stack if s]
        out.append((a, b, bb, layers[-1] if layers else None))
    return out


if __name__ == "__main__":
    for p in sys.argv[1:]:
        d = pymupdf.open(p)
        pg = d[0]
        raw = b"".join(d.xref_stream(x) for x in pg.get_contents())
        print("==", p, "layers:", [c["text"] for c in d.layer_ui_configs()])
        for a, b, bb, layer in clip_layers(d, pg, raw):
            kind = "page" if bb and (bb[2] - bb[0]) >= pg.rect.width * 0.99 and (bb[3] - bb[1]) >= pg.rect.height * 0.99 else "clip"
            print(f"  {a:>9} {layer or '-':20s} {kind:5s}", bb and tuple(round(v) for v in bb))
