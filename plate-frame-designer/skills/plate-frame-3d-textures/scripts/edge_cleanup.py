"""Edge clean-up for viewer textures: clamp() stretches the art just inside each edge over a thin margin
(removes keylines/rims), delight() removes thin light lines along an edge, defade() fills washed-out
edge strips. clean(tex, design_id) runs all three; KEEP lists designs whose edge bands are artwork."""
import numpy as np
NR, NC = 8, 12
def clamp(tex, nr=NR, nc=NC):
    a = tex.copy()
    a[:nr] = a[nr]; a[-nr:] = a[-nr - 1]
    a[:, :nc] = a[:, nc:nc + 1]; a[:, -nc:] = a[:, -nc - 1:-nc]
    return a
def bands(a, maxd=60):
    """Thickness of edge bands that still differ from the art further in, per side (rows/cols)."""
    a = a.astype(int); out = {}
    views = {"top": a, "bottom": a[::-1], "left": a.transpose(1, 0, 2), "right": a.transpose(1, 0, 2)[::-1]}
    for k, v in views.items():
        edge = v[0]; t = 0
        for d in range(1, maxd):
            diff = (np.abs(v[d] - edge).max(-1) > 50).mean()
            if diff > 0.5: t = d; break
        out[k] = t
    return out

def light(p):
    return (p.min(-1) > 190) & ((p.max(-1) - p.min(-1)) < 45)

def _lines(a, depth):
    L = light(a[:depth + 4]); out = a.copy(); n = 0
    hit = [x for x in range(a.shape[1]) if L[:depth, x].any() and not L[depth:depth + 4, x].any()]
    if len(hit) < 0.3 * a.shape[1]:
        return out, 0                       # not a line along this edge: leave it
    for x in range(a.shape[1]):
        js = np.nonzero(L[:depth, x])[0]
        if not len(js): continue
        j = js[-1]
        if L[j + 1:j + 4, x].any(): continue
        out[:j + 1, x] = a[j + 2, x]; n += j + 1
    return out, n

def delight(tex, depth=12):
    """Remove light lines along the edges (up to `depth` px) that sit outside non-light art."""
    a = tex.copy(); n = 0
    f, k = _lines(a, depth); a = f; n += k
    f, k = _lines(a[::-1], depth); a = f[::-1]; n += k
    f, k = _lines(a.transpose(1, 0, 2), depth); a = f.transpose(1, 0, 2); n += k
    f, k = _lines(a.transpose(1, 0, 2)[::-1], depth); a = f[::-1].transpose(1, 0, 2); n += k
    return a, n

def _sat(c): return c.max(-1) - c.min(-1)
def _lum(c): return c.mean(-1)

def _faded(a, maxd=40):
    """Edge at row 0. Returns depth of a washed-out band (0 = none)."""
    a = a.astype(int)
    step = (np.abs(a[1:maxd + 1] - a[:maxd]).max(-1) > 30).mean(1)   # per row: share of columns with an edge
    rows = np.nonzero(step[:maxd] > 0.5)[0]
    if not len(rows): return 0
    r = int(rows[-1])                       # deepest straight edge
    band = a[:r + 1].reshape(-1, 3); ref = a[r + 2:r + 6].reshape(-1, 3)
    bs, rs = _sat(band).mean(), _sat(ref).mean(); bl, rl = _lum(band).mean(), _lum(ref).mean()
    washed = (bs < 0.75 * rs and rs > 40) or (bl > rl + 25 and bs <= rs + 10) or (bl < rl - 25 and bs < rs)
    return r + 1 if washed else 0

KEEP = {"asahi", "black-boss", "711-punjabi", "lawson", "burberry", "costco-hotdog", "costco-hotdog-standard", "wockhardt", "hennessy"}

def defade(tex, design_id=None):
    a = tex.copy(); found = {}
    if design_id in KEEP: return a, found
    for side in ("top", "bottom", "left", "right"):
        v = {"top": a, "bottom": a[::-1], "left": a.transpose(1, 0, 2), "right": a.transpose(1, 0, 2)[::-1]}[side]
        d = _faded(v)
        if d: v[:d] = v[d + 1]
        found[side] = d
    return a, found

def clean(tex, design_id=None):
    a, n = delight(clamp(tex))
    a, f = defade(a, design_id)
    return a, (n, f)
