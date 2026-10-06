# Plate Frame Garage

A 3D viewer for every Bad Taste license plate frame. Open `plate-frames/index.html`
through any static server (for example `python3 -m http.server` from the repo root,
then visit `/plate-frames/`). Deep-link to a design with its id, e.g.
`/plate-frames/#red-bull`.

## How it works

All frames share one die-cut shape, so there is one generic 3D model and every
design is a texture projected straight onto its front.

| Path | What it is |
| --- | --- |
| `assets/frame-template.json` | The frame outline (12.25 × 6.2 in, window, 30° shoulders, mount holes), measured from the F1 artwork. Single source of truth for both the mesh and the textures. |
| `js/frame-geometry.js` | Builds the extruded frame mesh from the template, with planar front-projected UVs and three material groups: printed face, edge, bare back. |
| `assets/models/plate-frame.glb` / `.obj` | The generic frame as model files (metres, UV-mapped) for Blender, Keyshot, etc. Rebuild with `npm install && npm run build:frame-model`. |
| `assets/textures/*.webp` | Flattened 2048 px textures. `<id>.webp` is the production frame (from the product photo); `<id>--art.webp` is the original flat artwork where one exists. |
| `assets/thumbs/*.webp` | 640 px thumbnails for the catalog rail. |
| `js/catalog.js` | Designs and groups shown in the UI. |
| `tools/extract_textures.py` | Turns the Drive files into textures: finds the frame, aligns the template outline to the frame's edges, perspective-corrects it and masks the window and holes. |

## Adding a new design

1. Shoot the frame flat on a white sweep (like the `IMG_27xx` product shots), or export
   the flat artwork.
2. Add an entry to `SOURCES` in `tools/extract_textures.py`. Leave the corners as `None`
   for photos on white; for artwork mockups or white frames, give rough outer corners.
3. Run `pip install opencv-python-headless pillow pillow-heif numpy`, then
   `python3 -I plate-frames/tools/extract_textures.py <folder-with-sources> plate-frames/assets/textures`.
   HEIC photos need converting to JPG first (Pillow + pillow-heif does it).
4. Make a thumbnail: `convert assets/textures/<id>.webp -resize 640x assets/thumbs/<id>.webp`.
5. Add the design to a group in `js/catalog.js`.

Source files live in Google Drive under **BTW Main Files → Website Photos**
(`F1 2025`, `Livery Files`, `Fast Food`).
