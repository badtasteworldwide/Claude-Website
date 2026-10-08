# Frame geometry and print layout

All numbers were measured from production files: the die-cut "Template" layer of the October 2025 `.ai`
prints, the DomSem A3 sheets, and the blank 3D model. Fractions are always of the **frame outline** (the
die-cut), top-left origin, unless a line says otherwise.

## The plate the frame holds (US standard)

| | |
| --- | --- |
| Plate | 12 × 6 in (304.8 × 152.4 mm) |
| Mounting holes | 4 slots, 7 in apart horizontally, 4.75 in (120.65 mm) apart vertically |
| Registration stickers | top corners of a rear California plate: month top-left, year top-right, each about 1.9 × 1.1 in |

The frame bars sit over the plate's edges. A wide top bar covers part of the state name and the stickers,
and a wide bottom bar covers the bottom slogan (e.g. `dmv.ca.gov`). That's normal and customers expect it.

## Production die-cut (what the mold cuts)

| | fraction of outline | mm |
| --- | --- | --- |
| Outline | 1.0 × 1.0 | 311.97 × 158.03 (aspect 1.974) |
| Window top edge | 0.1816 | top bar ≈ 28.7 mm |
| Window bottom edge | 0.8209 | bottom bar ≈ 28.3 mm |
| Window left edge | 0.0394 | side bar ≈ 12.3 mm |
| Window right edge | 0.9593 | side bar ≈ 12.7 mm |

The window has **tag notches**: cut-outs at its two upper corners so the registration stickers stay visible.
Measure the window along the centre lines. A bounding box picks up the notches and overstates the window.

**Flipped frames** are the same mold turned upside down, so the notches sit at the bottom corners. Their
prints are drawn upside down relative to a standard print, and the deeper bar is at the bottom. Keep a flag
(`flip=1` / `"flipped": true`) on every flipped design. Both the print-to-texture mapping and the viewer
have to know about it. When a design exists both ways, list the standard one first and name the other
"<Name> Flipped".

## Print artboards (what gets printed)

The print is a **plain rectangle**, slightly larger than the die-cut outline (1–2 % bleed all round), with
the artwork running to its edges. The mold, not the artwork, makes the frame shape.

| Layout | Size / aspect | Where the frame is |
| --- | --- | --- |
| `.ai` single print (2025+) | page 900 pt wide; rendered at 2401 px wide | outline (8, 208)–(892, 655) pt, i.e. px (21, 555)–(2380, 1750) at 2401 px |
| 300ppi PNG export / older artboards | 2401 × 2305 px (aspect 1.0417) | frame block from y = 0.2323 × H, height W / 1.942 |
| DomSem A3 sheet ("… Domsem Triple.png") | aspect 3549 : 6000 (e.g. 3752 × 6343 px) | three copies stacked; use the top one, starting near y = 0.0228 × H (some sheets sit up to ~1 % lower), height W / 1.942 |

On DomSem sheets, unprinted stock is **transparent** and only ink is opaque. Flatten onto white
(`rgb·a + 255·(1−a)`) before judging colour.

## Blank 3D model (viewer)

| | |
| --- | --- |
| Size | 312.76 × 160.57 × 8 mm; face plate z 5–8 mm, rear pocket z 0–5 mm |
| Materials | `frame_face` (printed face), `frame_edge` (wrapped edge), `frame_back` (white plastic) |
| Window | x 0.0454–0.9559, y 0.1596–0.8105 |
| Texture | 2048 × 1051 px, UV-ready for the GLB |

The model's top bar is thinner than the mold's (window at 16.0 % vs 18.2 %). The texture tool therefore
maps print → mold → model piecewise along each axis. The default mold window it uses for DomSem prints is
x 0.050–0.950, y 0.192–0.834, about 1 % inside the measured window, so thin keylines around a print's
window fall into the window. For flipped prints it uses y 0.186–0.800.

## Safe zones for a new design

- **Bleed:** run the background at least 1.5 % (≈ 3 mm) past the outline on every side. No white margin.
- **Window margin:** keep text and logos at least 2 mm clear of the window edge. The plate's raised rim
  sits right there, and on the 3D model the bars are thinner, so anything closer gets hidden.
- **Outer margin:** keep text and logos at least 2.5 mm in from the outline. The mold radius and edge
  wrap eat into it.
- **Corners:** the outline corners are rounded, and the window has tag notches at the top (bottom when
  flipped). Keep logos out of all of them.
- **Bars:** the top and bottom bars (~28 mm) carry the main lettering. Side bars (~12 mm) only fit small
  repeating pattern or thin text.
- **The window itself** is cut out. Anything drawn there is lost. Artwork may bleed a few mm into it,
  which is fine and protects against mold tolerance.

These margins come from the corrections in `assets/designs.jsonl`. Every `crop_override` there is a print
whose lettering sat too close to the window for the default mapping (`top` raised or `bottom` lowered,
typically by 0.5–5 % of the height).
