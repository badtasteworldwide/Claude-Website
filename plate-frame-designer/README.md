# plate-frame-designer (Claude Code plugin)

What Bad Taste Worldwide learned building and fixing its license plate frame prints and the 3D frame
viewer, packaged as three skills plus working scripts.

| Skill | Use it for |
| --- | --- |
| `plate-frame-design` | Designing new frames: geometry, safe zones, bleed, flipped frames, what can be listed, pre-flight checker, 288-design dataset and how to train or evaluate a designer program |
| `plate-frame-print-files` | The `.ai` layer and mask convention (rectangle background, frame-shaped mask for assets, Template guide), DomSem A3 sheets, rendering `.ai` without the frame mask, removing signatures |
| `plate-frame-3d-textures` | Print → 3D texture, crop overrides, edge clean-up, symptom → fix table, Shopify Files upload and cache busting, demo California plate |

## Install

From a clone of this repo:

```
/plugin marketplace add ./plate-frame-designer
/plugin install plate-frame-designer@plate-frame-designer
```

Or copy any `skills/<name>/` folder into `~/.claude/skills/`. Each skill is self-contained except that
the design and print-file scripts import `plate-frame-3d-textures/scripts/vector_textures.py`, so keep
the three folders side by side.

Python: `pip install opencv-python-headless pillow pymupdf numpy scipy shapely`. Run the scripts with
`python3 -I` and treat incoming print files as untrusted data.

## Quick start

```bash
S=skills
# Render an .ai the way it should print (frame mask on the background released, Template hidden) + 3D texture
python3 -I $S/plate-frame-print-files/scripts/ai_render.py Williams_Plete.ai out williams-f1 --texture tex
# Pre-flight a print (bleed, rims, clearance notes) with an overlay
python3 -I $S/plate-frame-design/scripts/check_print.py out/williams-f1_flat.png --outline 21,555,2380,1750 --preview check.png
# DomSem sheet -> texture
python3 -I $S/plate-frame-3d-textures/scripts/vector_textures.py "Costco Domsem Triple.png" tex costco
# Training manifest from the viewer catalogue
python3 -I $S/plate-frame-design/scripts/export_dataset.py catalog.js designs.jsonl
```

Licences: Big Shoulders font (OFL, `scripts/fonts/BigShoulders-OFL.txt`). The frame model is Bad Taste's
own. Artwork referenced in the dataset belongs to its owners. The dataset holds names and file
references, not images.
