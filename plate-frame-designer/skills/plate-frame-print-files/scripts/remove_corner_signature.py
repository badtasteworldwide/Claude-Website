"""Remove the white 'illumaesthetic' signature from the coloured peel corner (bottom right) of a Chum Churum print."""
import sys
import numpy as np, cv2
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGBA")).copy()
H, W = a.shape[:2]; x0, y0, y1 = int(0.85 * W), int(0.64 * H), int(0.77 * H)
reg = a[y0:y1, x0:]; o = reg[..., :3].astype(int)
whitish = (o.min(2) > 150) & (o.max(2) - o.min(2) < 40) & (reg[..., 3] > 0)
colour = (o.max(2) - o.min(2) > 60) & (reg[..., 3] > 200)
near = cv2.dilate(colour.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
n, lab, st, _ = cv2.connectedComponentsWithStats(whitish.astype(np.uint8))
text = np.zeros(whitish.shape, bool)
for k in range(1, n):
    m = lab == k
    if st[k, 4] < 60000 and near[m].mean() > 0.95: text |= m
mask = cv2.dilate(text.astype(np.uint8), np.ones((5, 5), np.uint8))
rgb = np.ascontiguousarray(reg[..., :3])
fixed = cv2.inpaint(rgb, mask, 7, cv2.INPAINT_TELEA)
rgb[mask > 0] = fixed[mask > 0]
halo = cv2.dilate(text.astype(np.uint8), np.ones((11, 11), np.uint8)) > 0
med = cv2.medianBlur(rgb, 31); rgb[halo] = med[halo]
reg[..., :3] = rgb
Image.fromarray(a, "RGBA").save(dst, optimize=True)
print("signature px", int(text.sum()))
bg = Image.new("RGBA", (W, H), (120, 120, 120, 255)); bg.alpha_composite(Image.fromarray(a, "RGBA"))
bg.convert("RGB").crop((int(0.84 * W), int(0.63 * H), W, int(0.78 * H))).save(dst.replace(".png", "_corner.png"))
