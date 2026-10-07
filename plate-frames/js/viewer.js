import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// Blank frame model (assets/models/plate-frame.glb, built from plate-frame.stl
// / tools/build_frame.py: 3 mm face plate over a 5 mm rear pocket).
// Scene units are inches.
export const FRAME = {
  width: 312.76 / 25.4,
  height: 160.57 / 25.4,
  depth: 8 / 25.4,
  // Mount hole centres as fractions of width/height from the top-left corner.
  holes: [[0.2149, 0.102], [0.7876, 0.102]],
};

const HOME = new THREE.Vector3(0, 0.4, 24);
// Prints are stretched up by this fraction of the frame height, anchored at
// the bottom edge, so the thin unprinted margin some artwork has along its
// top edge falls off the frame instead of showing as a white line (~2.4 mm).
// (A plain shift would drag the texture's last row up into view instead.)
const PRINT_LIFT = 0.015;
// Demo car (assets/models/car.glb, tools/car_model.mjs): where the frame's
// centre sits on the model's rear bumper (metres, model space; the car faces
// +z, so its rear is at -z). The bumper bulges out to z = -1.934 just above
// the plate recess, so the frame sits on that outer surface, not in the recess.
const CAR_PLATE = [0, 0.3, -1.936];
// Orbit limits with the car on: stay behind it, above the ground, outside it.
const CAR_ORBIT = { minAzimuthAngle: -1.2, maxAzimuthAngle: 1.2, maxPolarAngle: 1.64, minDistance: 14, maxDistance: 80 };
// Plate centre height when the frame is flipped: the frame hole (2.516 in
// above centre, now below it) meets the plate slot 5.28 in from its top.
const PLATE_Y_FLIPPED = -2.516 + (5.28 - 3);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    // The frame and its screws turn over together for prints drawn for a
    // flipped frame (tags on the bottom); the plate always stays upright.
    this.frame = new THREE.Group();
    this.rig.add(this.frame);
    scene.add(this.rig);

    const side = THREE.DoubleSide; // the STL's winding is not guaranteed
    this.face = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.18, side });
    this.edge = new THREE.MeshPhysicalMaterial({ roughness: 0.45, side });
    this.back = new THREE.MeshStandardMaterial({ color: 0xf3f3f1, emissive: 0x3a3a3a, roughness: 0.55, side }); // white ABS, unprinted; lifted so it reads white away from the key light

    // Demo plate sits in the rear pocket against the bosses (z = 4 mm of the
    // 8 mm model, i.e. the centre plane); screws go through both.
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
      // Blank sheeting until loadPlate() brings in the stamped plate.
      new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.35, metalness: 0, side: THREE.FrontSide }),
    );
    // Back of the plate: bare aluminium, so turning the frame round never
    // shows the printed face mirrored through it.
    this.plate.add(new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ color: 0xb9bcc1, metalness: 0.7, roughness: 0.42, side: THREE.BackSide })));
    this.plate.position.set(0, 0.05, -FRAME.depth / 2 + 0.012); // flush with the back, as when bolted on
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
    this.frame.add(this.screws);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 4.5),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -FRAME.height / 2 - 0.9;
    scene.add(floor);
    this.floor = floor;
    this.orbit = Object.fromEntries(Object.keys(CAR_ORBIT).map((k) => [k, controls[k]]));

    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    renderer.setAnimationLoop(() => this.tick());
  }

  // Stamped California plate baked by tools/ca_plate.py: colour (alpha cuts
  // the mounting slots) plus a normal map for the embossing.
  async loadPlate(colorUrl, normalUrl) {
    const loader = new THREE.TextureLoader();
    const [map, normalMap] = await Promise.all([loader.loadAsync(colorUrl), loader.loadAsync(normalUrl)]);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = normalMap.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    Object.assign(this.plate.material, { map, normalMap, alphaTest: 0.5 });
    this.plate.material.color.set(0xffffff);
    this.plate.material.needsUpdate = true;
  }

  async loadModel(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const byName = { frame_face: this.face, frame_edge: this.edge, frame_back: this.back };
    gltf.scene.traverse((o) => {
      if (o.isMesh) o.material = byName[o.material.name] ?? this.edge;
    });
    gltf.scene.scale.setScalar(1 / 0.0254); // metres -> inches
    this.frame.add(gltf.scene);
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
          t.repeat.y = 1 - PRINT_LIFT; // anchored at the bottom edge
          return t;
        }),
      );
    }
    return this.textures.get(url);
  }

  async show(url, flipped = false) {
    const tex = await this.loadTexture(url);
    this.setFlipped(flipped);
    this.face.map = this.edge.map = tex;
    this.face.needsUpdate = this.edge.needsUpdate = true;
    if (!reducedMotion && !this.carOn) this.swing = { t: 0, from: this.rig.rotation.y - 0.55 };
  }

  // Turned over, the frame's mount holes line up with the plate's bottom
  // slots (4.75 in below the top ones), which sits the plate 0.29 in lower.
  setFlipped(on) {
    this.frame.rotation.z = on ? Math.PI : 0;
    this.plate.position.y = on ? PLATE_Y_FLIPPED : 0.05;
  }

  // Mount the frame on the back of a car. The model loads on first use.
  async setCar(on, url) {
    this.carOn = on;
    if (on) {
      this.swing = null;
      this.rig.rotation.y = 0;
      this.car ??= this.loadCar(url);
    }
    const car = this.car && (await this.car);
    if (car) car.visible = this.carOn;
    this.floor.visible = !this.carOn;
    Object.assign(this.controls, this.carOn ? CAR_ORBIT : this.orbit);
    this.camera.far = this.carOn ? 1500 : 200;
    this.camera.updateProjectionMatrix();
  }

  async loadCar(url) {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const model = gltf.scene;
    model.traverse((o) => {
      // Transmission glass renders the scene twice; tinted glass looks the
      // same at this distance and keeps phones smooth.
      if (o.isMesh && o.material.transmission > 0) {
        Object.assign(o.material, { transmission: 0, transparent: true, opacity: 0.45, color: new THREE.Color(0x10151c) });
      }
    });
    model.rotation.y = Math.PI; // rear towards the camera
    model.scale.setScalar(1 / 0.0254); // metres -> inches
    // Rotated half a turn, the plate spot (x, y, z) sits at (-x, y, -z); put it
    // just behind the frame's back face.
    model.position.set(0, 0.05 - CAR_PLATE[1] / 0.0254, -FRAME.depth / 2 - 0.02 + CAR_PLATE[2] / 0.0254);
    const car = new THREE.Group();
    car.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry((box.max.x - box.min.x) * 1.5, (box.max.z - box.min.z) * 1.25),
      new THREE.MeshBasicMaterial({ map: this.floor.material.map, transparent: true, depthWrite: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, box.min.y + 0.05, (box.min.z + box.max.z) / 2);
    car.add(ground);
    this.rig.add(car);
    return car;
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
    if (this.carOn && this.controls.autoRotate) {
      // Turntable sways between the orbit limits instead of spinning into the car.
      const a = this.controls.getAzimuthalAngle();
      if (Math.abs(a) > CAR_ORBIT.maxAzimuthAngle - 0.04 && Math.sign(a - (this.lastAz ?? a)) === Math.sign(a)) this.controls.autoRotateSpeed *= -1;
      this.lastAz = a;
    }
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
