// Writes the generic plate frame as GLB and OBJ/MTL into plate-frames/assets/models.
// Run with: npm run build:frame-model
//
// The mesh is UV-mapped with a planar front projection (0,0 = bottom-left of
// the outer frame, 1,1 = top-right), so any texture from assets/textures can
// be dropped onto the "frame_face" material in Blender, Keyshot, etc.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildFrameGeometry, GROUP_FACE, GROUP_EDGE, GROUP_BACK } from "../js/frame-geometry.js";

// GLTFExporter reads blobs through FileReader, which Node does not ship.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`;
      this.onloadend?.();
    });
  }
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = JSON.parse(readFileSync(join(root, "assets/frame-template.json"), "utf8"));
const outDir = join(root, "assets/models");
mkdirSync(outDir, { recursive: true });

// Export in metres (glTF convention); the template is in inches.
const INCH = 0.0254;
const geo = buildFrameGeometry(THREE, template);
geo.scale(INCH, INCH, INCH);

const materials = [];
materials[GROUP_FACE] = new THREE.MeshStandardMaterial({ name: "frame_face", color: 0xffffff, roughness: 0.35 });
materials[GROUP_EDGE] = new THREE.MeshStandardMaterial({ name: "frame_edge", color: 0xffffff, roughness: 0.35 });
materials[GROUP_BACK] = new THREE.MeshStandardMaterial({ name: "frame_back", color: 0x111111, roughness: 0.8 });
const mesh = new THREE.Mesh(geo, materials);
mesh.name = "license_plate_frame";

const glb = await new GLTFExporter().parseAsync(mesh, { binary: true });
writeFileSync(join(outDir, "plate-frame.glb"), Buffer.from(glb));

// OBJ + MTL
const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
const f = (n) => n.toFixed(6);
const lines = [
  "# Bad Taste generic license plate frame (12.25 x 6.2 in), units: metres",
  "# UVs: planar front projection; apply artwork to material frame_face",
  "mtllib plate-frame.mtl",
  "o license_plate_frame",
];
for (let i = 0; i < pos.count; i++) lines.push(`v ${f(pos.getX(i))} ${f(pos.getY(i))} ${f(pos.getZ(i))}`);
for (let i = 0; i < uv.count; i++) lines.push(`vt ${f(uv.getX(i))} ${f(uv.getY(i))}`);
for (let i = 0; i < nrm.count; i++) lines.push(`vn ${f(nrm.getX(i))} ${f(nrm.getY(i))} ${f(nrm.getZ(i))}`);
for (const g of geo.groups) {
  lines.push(`usemtl ${materials[g.materialIndex].name}`);
  for (let i = g.start; i < g.start + g.count; i += 3) {
    const a = i + 1, b = i + 2, c = i + 3;
    lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
  }
}
writeFileSync(join(outDir, "plate-frame.obj"), lines.join("\n") + "\n");
writeFileSync(
  join(outDir, "plate-frame.mtl"),
  [
    "newmtl frame_face", "Kd 1 1 1", "Ns 200", "# map_Kd ../textures/mclaren.webp", "",
    "newmtl frame_edge", "Kd 1 1 1", "Ns 200", "",
    "newmtl frame_back", "Kd 0.07 0.07 0.07", "Ns 20", "",
  ].join("\n"),
);

const tris = pos.count / 3;
console.log(`plate-frame.glb / .obj written: ${tris} triangles, groups ${geo.groups.map((g) => g.count / 3).join("/")}`);
