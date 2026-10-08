# Viewer assets on Shopify

## Files (Shopify admin → Content → Files)

| File | What |
| --- | --- |
| `pfg-catalog-N.json` | `texture` {width, height, cols 4, rows 2}, `thumbs` {cols, rows}, `groups` → designs {id, name, current, flipped, thumb, sheet, cell, product, productTitle, …} |
| `pfg-sheet-NN.webp` | 8 textures per sheet, 4 × 2 cells of 2048 × 1051. The viewer cuts a cell out with canvas `drawImage` |
| `pfg-thumbs-N.webp` | thumbnail sprite, 12 columns of 320 × 164, cut to the frame outline (`stl_mask.py`) |
| `pfg-frame.glb` | blank frame model |
| `pfg-plate-N.webp`, `pfg-plate-normal-N.webp` | demo plate colour and normal map |
| `pfg-car.glb` | car-mode model (CC BY 4.0 Khronos "Car Concept", logos removed, credit shown) |

`scripts/shopify_pack.py` regenerates sheets, sprite and catalogue from `catalog.js` and the textures. It expects the `plate-frames/` repo layout (`js/catalog.js`, `assets/textures/`, `assets/models/`, `assets/plate/`), so copy it into `plate-frames/tools/` to run it.

## Cache busting (important)

Shopify's CDN caches each file URL, including `?v=`. Replacing a file in place is not enough for
returning visitors.

- When a JSON, thumbs or plate file changes, upload it under a **new numbered name** (`pfg-catalog-8.json`)
  and update every reference in the theme: `sections/plate-frame-garage.liquid`,
  `sections/main-product.liquid`, `snippets/hero-garage.liquid`, and the plate file names in
  `assets/plate-frame-garage.js` `loadPlate`.
- Sheets keep their names (replaced with `fileUpdate`). Bump `SHEETS_REV` in `plate-frame-garage.js`.
  The sheet URL is `?v=<catalog version>&r=SHEETS_REV`.
- If someone still sees an old artifact, first confirm the CDN copy is clean. Then it's their cache.

## Upload flow (Admin GraphQL)

1. `stagedUploadsCreate` (resource FILE or IMAGE, the file's mimeType and size) returns a URL plus
   form parameters.
2. Multipart POST the file to that URL with the parameters, file last.
3. Run `fileCreate` with the staged `resourceUrl` for a new file, or `fileUpdate` (id + `originalSource`)
   to replace a file in place and keep its ID.
4. Poll `fileStatus` until READY.

## Theme

- The live theme is GitHub-synced from the `shopify-live-theme` branch. Changes go there through PRs.
  Admin API writes to the MAIN theme are blocked, so change the live theme through Git.
- Back up before big changes: `themeDuplicate` on the MAIN theme creates an unpublished copy.
- Product page: on any product whose handle contains `plate-frame`, the script looks the handle up in
  the catalogue and puts the 3D slide first in the gallery. Products with several designs (White Claw
  flavours; Taco Bell and Taco Bell Flipped) get a design button row, standard design first.
- Every design shown must have a listing (`product`). Superseded versions are hidden when a current one
  exists.

## Viewer settings that matter for how prints look

- `PRINT_LIFT = 0.015`: prints are stretched up 1.5 % from the bottom so the thin unprinted strip along
  many artworks' top edge falls off the frame.
- Face material: `MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3 })`.
  A stronger clearcoat washes dark prints out to silver at low angles.
- `scene.environmentIntensity = 0.7`.
- `controls.maxPolarAngle = Math.PI * 0.64`, so nobody looks at the bare underside.
- Back material: white plastic. Reset its `color` and `emissive` when switching designs.
- Flipped designs: the frame turns over (notches at the bottom). The plate always stays upright.
