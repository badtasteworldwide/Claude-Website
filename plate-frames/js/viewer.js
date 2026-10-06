import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Blank frame model (assets/models/plate-frame.glb, built from plate-frame.stl).
// Scene units are inches.
export const FRAME = {
  width: 312.76 / 25.4,
  height: 160.57 / 25.4,
  depth: 8 / 25.4,
  // Mount hole centres as fractions of width/height from the top-left corner.
  holes: [[0.2149, 0.102], [0.7876, 0.102]],
};

const HOME = new THREE.Vector3(0, 0.4, 24);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function plateTexture() {
  // A demo plate so the frame reads at real scale (12 x 6 in).
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 600;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 600);
  bg.addColorStop(0, "#fbfbfd");
  bg.addColorStop(1, "#e4e7ee");
  g.fillStyle = bg;
  g.fillRect(0, 0, 1200, 600);
  g.textAlign = "center";
  g.fillStyle = "#e0437f";
  // Only rows ~110-480 show through the frame window.
  g.font = "italic 700 56px Georgia, serif";
  g.fillText("Bad Taste", 600, 190);
  g.fillStyle = "#1c2a5c";
  g.font = "700 180px 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
  g.fillText("B4D T4ST", 600, 380);
  g.font = "600 30px 'Helvetica Neue', Arial, sans-serif";
  g.fillStyle = "#6b7280";
  g.fillText("W O R L D W I D E", 600, 445);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 32, 4, 128, 32, 128);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.setTransform(1, 0, 0, 0.25, 0, 24);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class FrameViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.textures = new Map();
    this.swing = null;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;

    const scene = (this.scene = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.9;

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-6, 9, 12);
    scene.add(key);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
    this.camera.position.copy(HOME);

    const controls = (this.controls = new OrbitControls(this.camera, canvas));
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 42;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.autoRotateSpeed = 2.2;

    this.rig = new THREE.Group();
    scene.add(this.rig);

    const side = THREE.DoubleSide; // the STL's winding is not guaranteed
    this.face = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.18, side });
    this.edge = new THREE.MeshPhysicalMaterial({ roughness: 0.45, side });
    this.back = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.75, side });

    // Demo plate sits inside the frame's back recess; screws go through both.
    const pw = 12, ph = 6, pr = 0.35;
    const s = new THREE.Shape();
    s.moveTo(-pw / 2 + pr, -ph / 2);
    s.lineTo(pw / 2 - pr, -ph / 2);
    s.quadraticCurveTo(pw / 2, -ph / 2, pw / 2, -ph / 2 + pr);
    s.lineTo(pw / 2, ph / 2 - pr);
    s.quadraticCurveTo(pw / 2, ph / 2, pw / 2 - pr, ph / 2);
    s.lineTo(-pw / 2 + pr, ph / 2);
    s.quadraticCurveTo(-pw / 2, ph / 2, -pw / 2, ph / 2 - pr);
    s.lineTo(-pw / 2, -ph / 2 + pr);
    s.quadraticCurveTo(-pw / 2, -ph / 2, -pw / 2 + pr, -ph / 2);
    const plateGeo = new THREE.ShapeGeometry(s, 12);
    const puv = plateGeo.attributes.uv;
    for (let i = 0; i < puv.count; i++) puv.setXY(i, puv.getX(i) / pw + 0.5, puv.getY(i) / ph + 0.5);
    this.plate = new THREE.Mesh(
      plateGeo,
      new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.4, metalness: 0.15, side: THREE.DoubleSide }),
    );
    this.plate.position.set(0, 0.05, -FRAME.depth / 2 + 0.06);
    this.rig.add(this.plate);

    const screwMat = new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 1, roughness: 0.22 });
    const headGeo = new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    headGeo.scale(1, 1, 0.45);
    headGeo.rotateX(Math.PI / 2);
    const slotGeo = new THREE.BoxGeometry(0.26, 0.04, 0.05);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 });
    this.screws = new THREE.Group();
    for (const [u, v] of FRAME.holes) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(headGeo, screwMat));
      const a = new THREE.Mesh(slotGeo, slotMat);
      const b = a.clone();
      b.rotation.z = Math.PI / 2;
      a.position.z = b.position.z = 0.08;
      g.add(a, b);
      g.position.set((u - 0.5) * FRAME.width, (0.5 - v) * FRAME.height, FRAME.depth / 2 - 0.01);
      this.screws.add(g);
    }
    this.rig.add(this.screws);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 4.5),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -FRAME.height / 2 - 0.9;
    scene.add(floor);

    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    renderer.setAnimationLoop(() => this.tick());
  }

  async loadModel(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const byName = { frame_face: this.face, frame_edge: this.edge, frame_back: this.back };
    gltf.scene.traverse((o) => {
      if (o.isMesh) o.material = byName[o.material.name] ?? this.edge;
    });
    gltf.scene.scale.setScalar(1 / 0.0254); // metres -> inches
    this.rig.add(gltf.scene);
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole frame (plus a margin) in view on narrow screens.
    const fitFov = (2 * Math.atan(7.2 / HOME.z / this.camera.aspect) * 180) / Math.PI;
    this.camera.fov = Math.max(30, fitFov);
    // On portrait screens, nudge the frame down so it clears the title overlay.
    if (this.camera.aspect < 1.3) this.camera.setViewOffset(w, h, 0, -h * 0.09, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  loadTexture(url) {
    if (!this.textures.has(url)) {
      this.textures.set(
        url,
        new THREE.TextureLoader().loadAsync(url).then((t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          return t;
        }),
      );
    }
    return this.textures.get(url);
  }

  async show(url) {
    const tex = await this.loadTexture(url);
    this.face.map = this.edge.map = tex;
    this.face.needsUpdate = this.edge.needsUpdate = true;
    if (!reducedMotion) this.swing = { t: 0, from: this.rig.rotation.y - 0.55 };
  }

  setFinish(gloss) {
    this.face.roughness = gloss ? 0.3 : 0.62;
    this.face.clearcoat = gloss ? 0.6 : 0;
  }

  setPlate(on) {
    this.plate.visible = this.screws.visible = on;
  }

  setTurntable(on) {
    this.controls.autoRotate = on && !reducedMotion;
  }

  resetView() {
    this.controls.reset();
    this.camera.position.copy(HOME);
    this.controls.target.set(0, 0, 0);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.swing) {
      this.swing.t = Math.min(1, this.swing.t + dt / 0.7);
      const e = 1 - Math.pow(1 - this.swing.t, 3);
      this.rig.rotation.y = this.swing.from * (1 - e);
      if (this.swing.t >= 1) this.swing = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
