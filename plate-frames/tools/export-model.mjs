// Converts the blank frame STL (assets/models/plate-frame.stl, millimetres,
// front face at +Z) into plate-frame.glb for the viewer and for Blender etc.
// Run with: npm run build:frame-model
//
// Adds what the STL lacks:
//  - UVs: planar front projection, (0,0) = bottom-left of the outer frame,
//    (1,1) = top-right, so any texture in assets/textures drops straight on.
//  - Three materials: frame_face (printed front), frame_edge (sides, the
//    print's edge colours wrap onto them), frame_back (bare plastic).
// Output is in metres, centred on the origin, front facing +Z.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

// GLTFExporter reads blobs through FileReader, which Node does not ship.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); });
  }
};

const FACE = 0, EDGE = 1, BACK = 2;
const dir = join(dirname(fileURLToPath(import.meta.url)), "../assets/models");
const stl = readFileSync(join(dir, "plate-frame.stl"));
const src = new STLLoader().parse(stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength));

src.computeBoundingBox();
const { min, max } = src.boundingBox;
const W = max.x - min.x, H = max.y - min.y;
const pos = src.attributes.position;

// Sort triangles into face / edge / back by facing direction.
const buckets = [[], [], []];
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
for (let t = 0; t < pos.count / 3; t++) {
  a.fromBufferAttribute(pos, t * 3);
  b.fromBufferAttribute(pos, t * 3 + 1);
  c.fromBufferAttribute(pos, t * 3 + 2);
  const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  const front = n.z > 0.98 && Math.min(a.z, b.z, c.z) > max.z - 0.01;
  buckets[front ? FACE : n.z < -0.5 ? BACK : EDGE].push(t);
}

const P = [], UV = [];
for (const bucket of buckets) {
  for (const t of bucket) {
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      UV.push((x - min.x) / W, (y - min.y) / H);
      // centred on the origin, metres
      P.push((x - (min.x + W / 2)) / 1000, (y - (min.y + H / 2)) / 1000, (z - (min.z + max.z) / 2) / 1000);
    }
  }
}
let geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
let start = 0;
buckets.forEach((bk, i) => { geo.addGroup(start, bk.length * 3, i); start += bk.length * 3; });
// Flat faces need flat normals; computing on the unindexed mesh keeps creases sharp.
geo.computeVertexNormals();

const materials = [];
materials[FACE] = new THREE.MeshStandardMaterial({ name: "frame_face", color: 0xffffff, roughness: 0.35 });
materials[EDGE] = new THREE.MeshStandardMaterial({ name: "frame_edge", color: 0xffffff, roughness: 0.45 });
materials[BACK] = new THREE.MeshStandardMaterial({ name: "frame_back", color: 0x151517, roughness: 0.8 });
const mesh = new THREE.Mesh(geo, materials);
mesh.name = "license_plate_frame";

const glb = await new GLTFExporter().parseAsync(mesh, { binary: true });
writeFileSync(join(dir, "plate-frame.glb"), Buffer.from(glb));
console.log(`plate-frame.glb: ${(W).toFixed(2)} x ${H.toFixed(2)} x ${(max.z - min.z).toFixed(2)} mm, ` +
  `${pos.count / 3} triangles (face ${buckets[FACE].length} / edge ${buckets[EDGE].length} / back ${buckets[BACK].length})`);
