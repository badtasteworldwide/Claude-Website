# Plate Frame Garage

A 3D viewer for the Bad Taste license plate frame catalog. Open
`plate-frames/index.html` through any static server (for example
`python3 -m http.server` from the repo root, then visit `/plate-frames/`).
Deep-link to a design with its id, e.g. `/plate-frames/#mclaren-f1-2026`.

The rail has two views:

- **Current** — designs from the DomSem A3 production sheets (the latest files).
- **Archive** — older designs that only exist in the Legacy / New Mold / No Logo
  folders and have no DomSem version.

## How it works

Every design is a flat print projected onto one blank frame model.

| Path | What it is |
| --- | --- |
| `assets/models/plate-frame.stl` | The blank frame (312.76 × 160.57 × 8 mm). |
| `assets/models/plate-frame.glb` | The same frame with UVs and three materials (`frame_face`, `frame_edge`, `frame_back`), in metres. Rebuild with `npm install && npm run build:frame-model`. |
| `assets/textures/<id>.webp` | 2048 px print textures, UV-ready for the GLB (also usable in Blender/Keyshot). |
| `assets/thumbs.webp` | All thumbnails, cut to the frame outline, in one 12-column sprite (cell index = `thumb` in `catalog.js`). |
| `js/catalog.js` | Designs, collections, and the Drive file each came from. |
| `tools/vector_textures.py` | Turns a rendered print (EPS/AI/PDF page or DomSem sheet PNG) into a texture. |
| `tools/stl_mask.py` | Front silhouette of the STL, used for thumbnails and the window fill. |
| `tools/export-model.mjs` | STL → GLB conversion. |

### Print → model mapping

The print files are laid out for the production mold, whose top bar is a bit
deeper than the blank model's. `vector_textures.py` maps print → mold outline →
model outline piecewise along each axis, so the artwork fills the model's bars
without logos running into the window. It also handles the three source layouts:
single-frame artboards (EPS/AI exports), multi-frame boards, and three-up DomSem
A3 sheets (top slot is used).

## Adding a design

1. Export the print (PDF/AI pages render with PyMuPDF; EPS with Ghostscript), or use the DomSem sheet PNG.
2. `pip install opencv-python-headless pillow pymupdf numpy`, then
   `python3 -I plate-frames/tools/vector_textures.py <render.png> plate-frames/assets/textures <id>`.
3. Rebuild the thumbnail sprite (cut to the frame outline, see `stl_mask.py`) and add the design to a
   collection in `js/catalog.js`.

Sources: Illumaesthetic Drive → **License Plates** (DomSem A3, License Plates (NEW MOLD),
(LEGACY MOLD), (no logo), Alina's Designs). Customer one-offs and any design showing the
Illumaesthetic wordmark are excluded.
