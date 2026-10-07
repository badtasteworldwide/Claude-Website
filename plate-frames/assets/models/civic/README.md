# Civic hatchback model (FL2)

Web-ready model of an 11th-gen Honda Civic hatchback for the licence-plate-frame 3D viewer.

| File | What it is |
| --- | --- |
| `civic.glb` | The car, glTF binary, 2.4 MB (meshopt geometry, WebP textures ≤ 1024 px) |
| `civic-plate.json` | Rear plate position and size in the GLB's own coordinates |
| `preview-rear-three-quarter.png`, `preview-rear-plate.png` | Cycles renders of this GLB, for checking |

## Source

`Civic-FE2-FL2-Game-Files.blend` (727,368,259 bytes, SHA-256 `666a3187490c5a1c39836b7e1b54b5a5e1ae54697f0eb44984954f0bb4f4680c`),
shared from Google Drive by its owner, Ron (ron@illumaesthetic.com), who approved its use here.

## Variant exported: FL2 hatchback

The `.blend` holds interchangeable parts. This export combines:

- **Base body:** `BaseCar` and `SideSkirt`.
- **Front:** the facelift front (`FL Front` collection), without the small logo plate on the front lip.
- **Rear:** the hatch rear (`Hatch Rear`), including the taillights, hatch glass, rear bumper/diffuser with the centre exhaust tips, and the plate recess.
- **Wheels:** the facelift stock wheels (rims, tyres, brakes and discs). The suspension pieces are left out.

Not included: the pre-facelift front, the sedan rear, the other three wheel sets, the
high-poly "Render Wheels", and the aftermarket rear wing (`Wing.Hatch`), which isn't stock on the FL2.

## Changes from the source

- **Plate:** the original plate mesh had photo artwork and its own carbon-fibre plate frame. It was
  replaced with a clean, flat US-size plate (12 × 6 in, 0.3048 × 0.1524 m) in exactly the same spot and tilt.
  It is a separate mesh called `LicensePlate` with its own material, `PLATE_BLANK` (matte off-white). Its UVs run
  0–1 across the plate, so plate artwork can be mapped onto it at runtime. The plate recess in the hatch is unchanged.
- **Paint:** the source used different paint colours on the base body (off-white) and the hatch
  (blue-grey). Every body panel now uses one blue-grey paint (`METALLIC CARPAINT - candy red*`,
  base colour 0.11/0.12/0.15, roughness 0.1). The name is left over from the source.
- **Materials:** every material is now a plain glTF PBR material (colour, optional base-colour texture,
  metallic, roughness, alpha). Many source materials were preset node groups that glTF can't represent.
  Their colours were set by hand from the material names (glass, chrome, rubber, carbon, etc.). The tyres were
  forced to black rubber because their texture rendered white.
- **Geometry:** smoothing (subdivision) was capped at level 1 and modifiers applied. The main shell was decimated to
  about 200 K triangles and the side skirts to about 60 K. `gltf-transform optimize --simplify-ratio 0.5` then
  halved the result again. The interior is still in `BaseCar` (it's one mesh) and shows through the glass.

## Coordinates (from `civic-plate.json`)

- **Axes and units:** metres, +Y up. The car's front points to +Z and its rear to −Z. The origin is at ground level, roughly mid-car.
- **Plate centre:** (−0.001, 0.719, −2.426).
- **Plate size:** 0.305 m wide × 0.152 m high, measured in the plate's own plane.
- **Plate orientation:** it faces −Z, with normal (0, 0.236, −0.972). The top leans forward about 13.7° with the hatch, and its up axis is (0, 0.972, 0.236).
- **Body above the plate:** within the plate's width and up to 15 cm above its top edge, the outermost body surface is
  at z = −2.463, so the hatch lip overhangs the plate centre by about 3.7 cm. A frame thicker than that will
  stick out past the lip.

## Known issues

- The doors show slightly wavy reflections. That comes from the source's game-quality mesh plus decimation; the rear,
  where the plate is, looks clean.
- The glass is a simple tinted transparent material (alpha 0.35), not a physically based transmissive one.

## How it was built

Built with Blender 5.2 (`bpy`, scripts auto-run off) → glTF export (Y-up) →
`npx @gltf-transform/cli@4 optimize in.glb civic.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify-ratio 0.5 --palette false`.
`--palette false` keeps `PLATE_BLANK` as its own material instead of merging it into a shared palette texture.
Measurements were read from the final `civic.glb` with `@gltf-transform/core` and the meshopt decoder.
