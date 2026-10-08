import sys, re, fitz
OPS = re.compile(rb"\b(q|Q|BT|ET|BDC|EMC|cm|Do|f\*?|S|s|B\*?|b\*?|sh|gs|n)\b")
def clip_paths(raw):
    out = []
    for m in re.finditer(rb"\bW\*?\s+n\b", raw):
        # path = back to the previous painting/state operator
        start = m.start()
        prev = [o for o in OPS.finditer(raw, max(0, start - 200000), start)]
        s = prev[-1].end() if prev else 0
        nums = [float(x) for x in re.findall(rb"-?\d+\.?\d*", raw[s:start])]
        xs, ys = nums[0::2], nums[1::2]
        bbox = (min(xs), min(ys), max(xs), max(ys)) if xs and ys else None
        out.append((m.start(), m.end(), bbox))
    return out
if __name__ == "__main__":
    for p in sys.argv[1:]:
        d = fitz.open(p); pg = d[0]
        raw = b"".join(d.xref_stream(x) for x in pg.get_contents())
        print("==", p.split("-", 1)[1])
        for a, b, bb in clip_paths(raw): print("  ", a, bb and tuple(round(v) for v in bb))
