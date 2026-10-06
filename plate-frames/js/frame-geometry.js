// Generic Bad Taste license plate frame, built from assets/frame-template.json.
// Units are inches; the frame is centred on the origin, facing +Z, Y up.
// Shared by the browser viewer and tools/export-model.mjs so the 3D model and
// the extracted textures always agree on the outline.

export const GROUP_FACE = 0; // printed front
export const GROUP_EDGE = 1; // bevel + side walls (print wraps around)
export const GROUP_BACK = 2; // bare plastic back

function roundedRect(THREE, path, x0, y0, x1, y1, r) {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

/** Outline helpers in frame space (template fractions -> inches, Y up). */
export function frameDims(t) {
  const W = t.widthIn, H = t.heightIn;
  return {
    W, H,
    x: (u) => (u - 0.5) * W,
    y: (v) => (0.5 - v) * H,
  };
}

export function buildFrameShape(THREE, t) {
  const { W, H, x, y } = frameDims(t);
  const shape = roundedRect(THREE, new THREE.Shape(), -W / 2, -H / 2, W / 2, H / 2, t.outerRadius * H);

  // Plate window: rounded rectangle whose top edge steps down between the
  // mounting holes (the 30° "shoulders" that give the top bar room for a logo).
  const w = t.window;
  const r = w.radius * H;
  const L = x(w.left), R = x(w.right), T = y(w.top), N = y(w.notchTop), B = y(w.bottom);
  const s0 = x(w.shoulderStart), s1 = x(w.shoulderEnd);
  const win = new THREE.Path();
  win.moveTo(L + r, T);
  win.lineTo(s0, T);
  win.lineTo(s1, N);
  win.lineTo(-s1, N);
  win.lineTo(-s0, T);
  win.lineTo(R - r, T);
  win.quadraticCurveTo(R, T, R, T - r);
  win.lineTo(R, B + r);
  win.quadraticCurveTo(R, B, R - r, B);
  win.lineTo(L + r, B);
  win.quadraticCurveTo(L, B, L, B + r);
  win.lineTo(L, T - r);
  win.quadraticCurveTo(L, T, L + r, T);
  shape.holes.push(win);

  for (const hx of t.holes.x) {
    const hole = new THREE.Path();
    hole.absarc(x(hx), y(t.holes.y), (t.holes.diameter * W) / 2, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

/**
 * Extruded frame with planar front-projected UVs: every vertex gets
 * u,v from its X,Y position, so a flat artwork texture lands exactly on the
 * face and its edge colours wrap over the bevel like a real printed frame.
 */
export function buildFrameGeometry(THREE, t, { bevel = 0.035, curveSegments = 28 } = {}) {
  const { W, H } = frameDims(t);
  const depth = Math.max(0.01, t.thicknessIn - bevel * 2);
  let geo = new THREE.ExtrudeGeometry(buildFrameShape(THREE, t), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.6,
    bevelOffset: -bevel * 0.6, // keep the printed face at the template's exact size
    bevelSegments: 4,
    curveSegments,
  });
  geo.translate(0, 0, -depth / 2);
  if (geo.index) geo = geo.toNonIndexed();

  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / W + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / H + 0.5;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

  // Sort triangles into face / edge / back groups by their facing direction.
  const nrm = geo.attributes.normal;
  const buckets = [[], [], []];
  for (let tri = 0; tri < pos.count / 3; tri++) {
    let nz = 0;
    for (let k = 0; k < 3; k++) nz += nrm.getZ(tri * 3 + k);
    nz /= 3;
    buckets[nz > 0.98 ? GROUP_FACE : nz < -0.98 ? GROUP_BACK : GROUP_EDGE].push(tri);
  }
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const src = geo.attributes[name];
    const arr = new Float32Array(src.array.length);
    let o = 0;
    for (const bucket of buckets) {
      for (const tri of bucket) {
        const start = tri * 3 * src.itemSize;
        arr.set(src.array.subarray(start, start + 3 * src.itemSize), o);
        o += 3 * src.itemSize;
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize));
  }
  let start = 0;
  buckets.forEach((bucket, i) => {
    out.addGroup(start, bucket.length * 3, i);
    start += bucket.length * 3;
  });
  out.computeBoundingBox();
  out.computeBoundingSphere();
  geo.dispose();
  return out;
}

/** Mounting hole centres in frame space, for placing screws. */
export function holeCenters(t) {
  const { x, y } = frameDims(t);
  return t.holes.x.map((hx) => [x(hx), y(t.holes.y)]);
}
