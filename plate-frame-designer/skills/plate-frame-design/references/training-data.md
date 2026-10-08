# Training and evaluating a frame-designer program

This is how to turn the existing catalogue into data, and how to grade what a generator produces. It
covers the mechanics. Which model to use is up to you.

## What's available

| Source | What it gives | Where |
| --- | --- | --- |
| `assets/designs.jsonl` | 288 designs: name, collection, source file, flipped, listed, crop override, edge-band flag | this skill |
| DomSem A3 sheets | production prints (top copy = one frame), transparent stock | Drive: License Plates / Domsem A3 |
| `.ai` prints (2025+) | layered vector source: Template / Brand Logo / Background Design | uploads, later Drive |
| 300ppi exports | single-frame PNGs, 2401 × 2305 | Drive: License Plates / 300ppi |
| Viewer textures | 2048 × 1051 normalised to the 3D model, edge-cleaned | Shopify Files `pfg-sheet-NN.webp` (4 × 2 cells per sheet; cell = `sheet`/`cell` in `pfg-catalog-N.json`) |
| Product photos | the real printed frame on a plate | Shopify product media |

## Normalise every print to one canvas

Train on one canonical frame canvas, not the mixed source layouts:

1. Locate the frame:
   - DomSem: `vector_textures.sheet_slot`.
   - Artboard: `artboard_slot`.
   - `.ai`: the outline from `ai_render.py`'s JSON.
2. Crop to the outline and resample to a fixed size. Use 2048 × 1037 for the die-cut aspect of 1.974, or
   reuse the 3D texture size of 2048 × 1051 if you train on viewer textures.
3. Flatten transparency onto white, since unprinted stock is white.
4. Turn flipped prints 180° so every sample is upright, and keep `flipped` as a condition.
5. Keep a mask channel for the window (die-cut fractions in `geometry.md`). The model should learn that
   the window is empty.

Useful conditioning labels per sample: collection, subject name, flipped, dominant colours (k-means on
the bars), and has-lettering-top / has-lettering-bottom (OCR or manual).

## Labels the catalogue already gives you

- `crop_override` is not null (37 designs): the lettering sat too close to the window. `top` was raised
  or `bottom` lowered by 0.5–5 % of the height. These are negative examples for window clearance, or
  targets for a "fix my layout" model.
- `edge_bands_are_art`: a deliberate stripe or border at the edge. Don't train the model to delete
  these.
- `listed`: the design passed the "universal recognition" rule and is sold.
- `current: false`: superseded artwork (legacy mold or no-logo). Down-weight it or exclude it.

## Grading generated designs

Run each candidate through, in order:

1. **Hard gate:** `check_print.py --json` has no warnings, i.e. bleed is present and there's no rim.
2. **Clearance:** the `notes` distances are ≥ 2 mm from the window and ≥ 2.5 mm from the outline for
   anything that's text or a logo. Use OCR or a logo detector on the bars to decide which detail
   matters.
3. **Layer convention** (for `.ai` output): `clips.py` shows no frame-sized clip on Background Design,
   and assets are clipped to the frame shape. Template is hidden.
4. **3D check:** run the print through `vector_textures.py` and `edge_cleanup.clean`. If clean-up had to
   change more than a few edge rows, the print needs work. Optionally render it in the viewer harness.
5. **Human review:** subject recognisable at a glance, real brand colours and type, nothing important
   under the plate's covered zones, no signature.

Keep the grades with the samples. A set of (design, failure reason, fixed design) triples is the most
valuable data for teaching a generator what this product actually needs.
