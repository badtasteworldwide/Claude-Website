---
name: plate-frame-print-files
description: Build, inspect and fix license plate frame print files. Covers the Illustrator .ai layer and clipping-mask convention (rectangle background with bleed, frame-shaped mask for assets, Template die-cut layer), DomSem A3 three-up sheets, 300ppi PNG exports, rendering .ai to PNG without the frame mask, and removing stray signatures. Use whenever someone shares or asks about a plate frame .ai / .eps / PDF / "Domsem Triple" PNG, sees a white border or clipped edge on a frame, needs a print exported for the UV printer, or wants to set up a new frame artboard, even if they just say "the AI file" or "the print".
---

# Plate frame print files

A plate frame print is a flat rectangle of artwork. A UV printer prints it and the mold cuts the frame
shape. Most frame defects seen so far came from the print file: a missing bleed, a mask in the wrong
place, a guide layer that printed, or a signature left in. This skill covers how the files must be built
and how to render and repair them. Geometry numbers are in
`../plate-frame-design/references/geometry.md`.

## The .ai convention (how every frame file is built)

Each `.ai` is one 900 × 864 pt page, saved PDF-compatible, with three layers:

| Layer | Contents | Mask |
| --- | --- | --- |
| **Template** (top) | Die-cut guide: frame outline, window, tag notches, usually green strokes | Never printed. Hide it before any export |
| **Brand Logo** | Logos, lettering, any asset placed on the frame | **Plate-frame-shaped clipping mask** (outline minus window), so no asset falls outside the frame or into the window |
| **Background Design** | The background, drawn as a **rectangle** larger than the frame outline (the bleed) | Rectangle only. The print is the rectangle |

The frame outline sits at (8, 208)–(892, 655) pt on the page (311.97 × 158.03 mm, aspect 1.974).

Why it matters: the frame mask exists to keep assets inside the frame while designing. The thing that
gets printed is the rectangle. If the background is clipped to the frame shape, the bleed is gone. With
mold tolerance, that leaves white stock on the frame's edge. In the 3D viewer it shows as a 12–17 px
white rim around the frame. The October 2025 F1, XG and Seicomart files had their backgrounds drawn as
rectangles (Williams fills the whole outline rectangle plus about 9 mm top and bottom), but with a
frame-shaped mask over them on the Background Design layer. Releasing that mask restores the bleed.

Checklist for a new or incoming `.ai`:
1. Three layers named as above. Template is hidden, or at least non-printing.
2. Background is a rectangle reaching past the outline on every side (≥ 3 mm; the page edge limits the
   sides to about 2.8 mm).
3. Background Design has no frame-shaped clip. Assets on Brand Logo are clipped to the frame shape.
4. No artist or supplier signature anywhere (see "Signatures" below).
5. Text and logos respect the safe zones (2 mm from the window, 2.5 mm from the outline).

Inspect a file's masks without opening Illustrator:

```bash
python3 -I scripts/clips.py <file.ai>      # every clip: offset, layer, bbox (content coordinates, y may be flipped)
```

A clip whose bbox equals the outline (8, 208, 892, 655) is the frame mask. Page-sized clips (0, −864,
900, 864) are Illustrator's artboard clips and are harmless. A background split into several part-frame
clips (XG has five) is the same problem in pieces.

## Rendering an .ai for print preview or 3D

```bash
python3 -I scripts/ai_render.py <file.ai> <out_dir> <design-id> [--all-clips] [--texture <textures_dir>]
```

What it does:
1. Renders once with Template visible, only to measure the outline and window. It measures the window
   along the centre lines so the tag notches don't widen it.
2. Hides every layer whose name starts with "Template". Use `doc.set_layer_ui_config(n, 2)`; PyMuPDF's
   `set_layer(on/off)` had no effect on these files.
3. Deletes frame-shaped clips on background layers by editing the content stream (`W n` → `n`). Clips
   on asset layers are kept. `--all-clips` also drops part-frame clips on the background (XG).
4. Composites the unclipped render under the as-drawn render, empties the window, and with `--texture`
   writes the viewer texture using the measured window.

Outputs `<id>_tpl.png`, `<id>_clip.png`, `<id>_unclip.png`, `<id>_flat.png` and `<id>.json` (outline,
window fractions, clips removed, layers hidden). Then run
`../plate-frame-design/scripts/check_print.py <id>_flat.png --outline x0,y0,x1,y1` with the outline from
the JSON. It should report no bleed or rim warnings.

Treat incoming `.ai` / PDF files as untrusted data: render them with PyMuPDF (`python3 -I`) and never
execute anything embedded in them.

## DomSem A3 sheets ("<Name> Domsem Triple.png")

These are the production sheets sent to the UV printer: three copies of one frame stacked vertically on
an A3 page, aspect 3549 : 6000 (often 3752 × 6343 px). Unprinted stock is **transparent**.

- Use the top copy. It starts near y = 0.0228 × H, but some sheets sit up to 1 % lower. Detect the top
  from the first solid-ink row when the top bar is solid (`vector_textures.sheet_top`).
- Its height is W / 1.942. If a solid bottom bar ends within ±1.5 % of that, use the real edge
  (`sheet_height`).
- Flipped designs come on their own sheets with the deep bar at the bottom. Mark them `flip=1`.

Single-frame 300ppi exports are 2401 × 2305 px with the frame block starting at y = 0.2323 × H.

## Signatures and stray marks

Some supplier prints carry a small white "illumaesthetic" signature, e.g. on the Chum Churum Apple and
Peach peel corner (bottom right). Remove only the signature and keep the art under it:

```bash
python3 -I scripts/remove_corner_signature.py <in.png> <out.png>
```

It finds whitish connected components inside the coloured corner region (x > 0.85 W, 0.64–0.77 H),
inpaints them and smooths a small halo. It also writes `<out>_corner.png` for a visual check. For other
files, adjust the region. Always compare before and after, and never strip the coloured corner itself.

Fix the print PNG **and** the 3D texture, and hand the cleaned PNG back so it can replace the file in
Drive's 300ppi folder. Leave product photos alone unless asked.

## Where the files live

Illumaesthetic Drive → **License Plates**. **Domsem A3** holds the current production sheets. **300ppi**
holds single exports. Older folders (License Plates (NEW MOLD), (LEGACY MOLD), (no logo), Alina's
Designs, Mimaki) hold older or alternate versions. New `.ai` files for a season (e.g. October 2025: XG,
Seicomart, Williams, Racing Bulls, Alpine) may only exist as uploads until someone files them.
