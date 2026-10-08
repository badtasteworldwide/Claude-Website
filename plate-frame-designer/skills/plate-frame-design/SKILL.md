---
name: plate-frame-design
description: Design new license plate frame artwork, or judge and spec existing designs, for Bad Taste Worldwide's printed plate frames. Covers mold geometry and safe zones, bleed, flipped frames, what subjects can be listed as products, house style, an automated pre-flight checker, and a 288-design dataset for training or evaluating a frame-designer model. Use whenever someone wants a new frame design or concept, asks whether a design will print or fit, wants to know frame dimensions, picks which designs could become products, or is building or training a program that generates license plate frames, even if they don't say "skill" or "design".
---

# Plate frame design

The product is a printed license plate frame. A flat rectangular print is UV-printed and the mold cuts
the frame shape around a US plate. A design is good when it reads at a glance from the car behind, uses
the subject's real colours and type, and survives the cut. The cut is where nearly every production and
3D-viewer problem came from.

Read these as needed:
- `references/geometry.md`: plate, die-cut, window, notches, flipped frames, artboard layouts, safe zones (numbers).
- `references/catalog-rules.md`: what can be listed, signatures, naming, collections, house style.
- `references/training-data.md`: building a dataset and an evaluation loop for a frame-designer program.
- `../plate-frame-print-files/SKILL.md`: how the `.ai` must be layered and masked, and how to render it.
- `../plate-frame-3d-textures/SKILL.md`: turning a print into the 3D viewer texture and shipping it.

## Designing a frame

1. **Start from the die-cut, not a blank page.** Use the 900 × 864 pt `.ai` page with the Template
   layer (outline at (8, 208)–(892, 655) pt). The frame is 311.97 × 158.03 mm. The window starts at
   18.2 % and ends at 82.1 % of the height, and at 3.9 % / 95.9 % of the width. Top and bottom bars are
   about 28 mm and side bars about 12 mm.
2. **Background = rectangle with bleed.** Draw the background as a rectangle that runs at least 3 mm
   past the outline on every side, on the Background Design layer, with no frame-shaped clip. White
   stock showing at the edge is the most common defect.
3. **Assets inside a frame-shaped mask.** Put logos and lettering on Brand Logo, clipped to the frame
   shape (outline minus window), so nothing hangs outside the frame or into the window.
4. **Respect the safe zones.**
   - Keep text and logos 2 mm from the window and 2.5 mm from the outline.
   - Keep them out of the rounded corners and the tag notches (top corners of the window, bottom on a
     flipped frame).
   - Main lettering goes on the top or bottom bar. Side bars take only small repeats or thin text.
5. **Plan for the plate behind it.** A wide top bar covers the state name and the registration
   stickers, and a wide bottom bar covers the slogan. That's expected and fine. Don't design around them.
6. **Decide the orientation.** A flipped frame puts the deep bar and notches at the bottom. If a design
   works both ways, make the standard version first and name the other "<Name> Flipped".
7. **Clean art only.** No supplier or artist signatures, no guides or keylines on the outer edge, and
   no thin white or dark rim around the outline. A deliberate edge stripe is fine; it goes on the
   clean-up skip list.
8. **Pre-flight.** Render it and run the checker:

   ```bash
   python3 -I scripts/check_print.py <render.png> [--outline x0,y0,x1,y1] [--flip] [--preview out.png] [--json]
   ```

   It finds the frame in any known layout: DomSem sheet, 2401-px artboard, or frame-shaped block. Its
   checks:
   - **Warnings:** missing bleed (ink stops short of the outer edge) and thin light or dark rims along
     the edge.
   - **Notes:** the distance from artwork detail to the window and to the outline. They're only notes
     because an all-over pattern legitimately runs to the edges, while a logo there is a defect. The
     `--preview` overlay draws detected detail in magenta, the die-cut window in blue and the safe
     margins in orange. Look at it.

   Exit status is 1 on warnings, so a generator can use it as a gate.

## Choosing subjects

Propose subjects with universal recognition: global brands and liveries, famous snacks, drinks and
stores, K-pop groups, classic cartoons, well-known memes and phrases. Don't propose someone's personal
product, a customer one-off, or a small creator's merch unless it's an approved collab. The house style
is affectionate parody: the real brand's palette and type, applied to a car frame. Collections: Formula
1, Motorsport Liveries, Fast Food, Snacks, Drinks, Alcohol, Grocery & Konbini, K-Pop, Cartoons & Anime,
Designer, Memes & Text, Squid Game, Collabs.

## Data for a designer program

`assets/designs.jsonl` lists all 288 designs. Each record has the name, collection, source print file,
flipped flag, listing status, the crop override that had to be applied, and whether the edge bands are
part of the art. Regenerate it with `scripts/export_dataset.py <catalog.js> <out.jsonl>`. See
`references/training-data.md` for how to turn prints into training pairs and how to grade generated
designs.
