---
name: plate-frame-3d-textures
description: Turn license plate frame prints into textures for the 3D frame viewer (three.js, Shopify theme), fix fit and edge artifacts, and ship them to Shopify Files. Covers print-to-model mapping, per-design crop overrides, flipped prints, the edge clean-up pass for white lines, rims and washed-out strips, the demo California plate generator, viewer material settings and CDN cache-busting. Use whenever a frame looks clipped, cut off, white-edged, washed out, misaligned or flipped wrong in the 3D viewer, when adding a design to the viewer, when regenerating the demo plate, or when uploading viewer assets, even if the user only sends a screenshot and says "this frame looks off".
---

# Plate frame 3D textures

The viewer shows every design on one blank frame model (`assets/models/plate-frame.glb`, 312.76 ×
160.57 × 8 mm, materials `frame_face` / `frame_edge` / `frame_back`) in front of a stamped California
demo plate. Each design is a 2048 × 1051 texture mapped onto the face UVs. Only the face is printed: the
side walls and back stay bare white plastic, as on the real frames.

Set up a Python env first: `pip install opencv-python-headless pillow pymupdf numpy scipy shapely`.

## Print → texture

```bash
python3 -I scripts/vector_textures.py <render.png> <out_dir> <id> [top=.. bottom=.. left=.. right=..] [flip=1]
```

- Finds the frame: DomSem sheet (top copy, `sheet_top` / `sheet_height` detection), frame-shaped
  block, or 2401-px artboard.
- Maps print → mold → model piecewise per axis. The model's bars are thinner than the mold's (top
  window edge at 16.0 % vs about 18.2 %), so a straight crop would push logos into the window.
- Default mold window: x 0.050–0.950, y 0.192–0.834. Flipped prints use y 0.186–0.800 and are sampled
  rotated 180° (`flip=1`).
- Inpaints bare stock in a narrow band around the window.

For `.ai` sources, use `../plate-frame-print-files/scripts/ai_render.py --texture`. It removes the
background's frame mask and passes the window measured from the Template layer.

**Crop overrides** live in `scripts/print_fit.json` (fractions of the print artboard). Raise `top` or
lower `bottom` when lettering runs into the window. Set all four from the print's own window when a
print's layout differs (Chum Churum). Set `flip=1` for flipped prints. Check visually after each change.
A 0.002 step is about 0.3 mm.

## Edge clean-up (white lines and artifacts)

```python
from edge_cleanup import clean
tex, (n_light, faded) = clean(tex, design_id)
```

1. `clamp`: stretches the art 8 rows / 12 cols in from each edge over the margin, which removes
   keylines and cut-guide rims.
2. `delight`: removes thin light lines (≤ 12 px) along an edge, but only when they run along at least
   30 % of it.
3. `defade`: fills washed-out edge strips (≤ 40 px) that are paler, darker or less saturated than the
   art inside.

`KEEP` lists designs whose edge bands are artwork (Asahi, Black Boss, 7-Eleven Punjabi, Lawson,
Burberry, Costco Hot Dog ×2, Wockhardt, Hennessy). Add to it rather than letting clean-up eat a
deliberate stripe. Always compare before and after on a few busy designs. Early versions left fragments
and streaks on patterned art.

## Diagnosing a complaint

| Symptom | Usual cause | Fix |
| --- | --- | --- |
| White border on all edges | `.ai` background clipped to frame shape, or print without bleed | `ai_render.py` (removes the mask), or ask for a print with bleed |
| One bar cut off / lettering under the plate | print layout differs from default mold window | `print_fit.json` override |
| Everything about 3 % off, logo in window | flipped print without `flip=1` | add `flip=1` |
| Thin white or grey line at one edge | keyline or rim in the print | edge clean-up |
| Strip at top of texture | sheet laid out lower than nominal | `sheet_top` detection (already automatic) |
| Black bar | sampled into the next copy or the background on a DomSem sheet | set the window from the print's own beige/ink run |
| Silver / washed-out face from low angles | clearcoat too strong | `MeshPhysicalMaterial({roughness: .3, clearcoat: .3, clearcoatRoughness: .3})`, `environmentIntensity .7`, `maxPolarAngle π·0.64` |
| White line visible only to the user | browser/CDN cache of the old texture | verify the CDN file is clean, then bump the cache key (below) |

## Shipping to Shopify

Read `references/viewer-and-shopify.md` before uploading anything. It covers sheet packing, file names,
catalogue fields, the upload flow and cache busting.

## Demo plate

`scripts/ca_plate.py SERIAL OUT_DIR MONTH YEAR` (the site uses `BADT4ST <out> JUN 2019`) bakes
`ca-plate.webp` (colour; the alpha cuts the mounting slots) and `ca-plate-normal.webp` (embossing). It
models a real California plate:

- **Script:** "California" traced from a photo (`fonts/ca-script-trace.png`), not a font.
- **Serial:** vector glyphs in the style of the California dies (Penitentiary Gothic is a paid font).
- **dmv.ca.gov:** letter-spaced.
- **Stickers:** real-size month (white with a blue month) and year (light blue with the full year, as on
  the real sticker).

The frame bars hiding the stickers and slogan is intentional. Fonts are in `scripts/fonts/` (OFL /
Apache).
