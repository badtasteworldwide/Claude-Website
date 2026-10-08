// Plate Frame Garage section script (Shopify theme asset).
// Mirrors plate-frames/js/viewer.js + app.js, but reads its catalog, texture
// sheets, thumbnail sprite and frame model from Content > Files (pfg-*).
// Also drives the 3D slide in the product page gallery ([data-pfg-pdp]).
// three.js comes from jsDelivr's ESM build so no import map is needed. It is
// loaded on demand, so product pages without a frame design never fetch it.
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/";
let THREE, OrbitControls, RoomEnvironment, GLTFLoader, MeshoptDecoder;
async function loadThree() {
  if (THREE) return;
  const addon = (p) => import(`${THREE_CDN}examples/jsm/${p}/+esm`);
  [THREE, { OrbitControls }, { RoomEnvironment }, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import(`${THREE_CDN}+esm`),
    addon("controls/OrbitControls.js"),
    addon("environments/RoomEnvironment.js"),
    addon("loaders/GLTFLoader.js"),
    addon("libs/meshopt_decoder.module.js"),
  ]);
}

// Blank frame model: 312.76 x 160.57 x 8 mm (3 mm face plate over a 5 mm rear
// pocket). Scene units are inches.
const FRAME = {
  width: 312.76 / 25.4,
  height: 160.57 / 25.4,
  depth: 8 / 25.4,
  holes: [[0.2149, 0.102], [0.7876, 0.102]], // fractions from top-left
};
const HOME = [0, 0.4, 24];
// Prints are stretched up by this fraction of the frame height, anchored at
// the bottom edge, so the thin unprinted margin some artwork has along its
// top edge falls off the frame instead of showing as a white line (~2.4 mm).
// (A plain shift would drag the texture's last row up into view instead.)
const PRINT_LIFT = 0.015;
// Demo car (Files: pfg-car-civic-v2.glb, plate-frames/assets/models/civic/):
// centre of the model's plate face (metres, model space; the car faces +z, so
// its rear is at -z). The plate leans back with the hatch by CAR_TILT, so with
// the car on, the frame and plate tilt to match and bolt flat onto it. The
// previous car (pfg-car.glb, since removed) used [0, 0.3, -1.936] with no tilt.
const CAR_FILE = "pfg-car-civic-v2.glb";
const CAR_PLATE = [0, 0.719, -2.426];
const CAR_TILT = Math.asin(0.236); // plate normal (0, 0.236, -0.972), ~13.7 deg
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

// Other pfg-* files sit next to the model in Content > Files. Shopify lets
// browsers cache them for a year, so derived URLs carry the catalog's version:
// whenever the catalog is re-uploaded, its sheets are fetched fresh too.
// Bump SHEETS_REV whenever sheets are replaced in Files without re-uploading the
// catalog (Shopify keeps the catalog's ?v= the same then), so browsers that
// cached the old sheets fetch the new ones. 2: flipped-design textures realigned.
// 3: prints laid out low on their DomSem sheet refit (white edge, cut-off text).
// 4: stray keylines and faded strips along the outer edges cleaned up.
const SHEETS_REV = 4;
let BUST = "";
const setBust = (catalogUrl) => {
  const v = new URL(catalogUrl, location.href).searchParams.get("v");
  BUST = v ? `?v=${v}&r=${SHEETS_REV}` : `?r=${SHEETS_REV}`;
};
const sibling = (url, name) => url.replace(/pfg-[\w-]+\.\w+/, name).replace(/[?&]v=\d+/, "") + BUST;
const loadPlate = (viewer, modelUrl) =>
  viewer.loadPlate(sibling(modelUrl, "pfg-plate-4.webp"), sibling(modelUrl, "pfg-plate-normal-4.webp")).catch(console.error);

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.decoding = "async";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`Could not load ${url}`));
    im.src = url;
  });
}

class FrameViewer {
  // opts.gallery: square product-gallery slide, so no room kept for the
  // plaque, no wheel zoom, and vertical swipes still scroll the page.
  constructor(canvas, sheetUrl, layout, opts = {}) {
    this.opts = opts;
    this.canvas = canvas;
    this.sheetUrl = sheetUrl;
    this.layout = layout;
    this.sheets = new Map();
    this.textures = new Map();
    this.swing = null;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;

    const scene = (this.scene = new THREE.Scene());
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-6, 9, 12);
    scene.add(key);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
    this.camera.position.set(...HOME);
    const controls = (this.controls = new OrbitControls(this.camera, canvas));
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = !opts.gallery;
    controls.minDistance = 10;
    controls.maxDistance = 42;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.autoRotateSpeed = 2.2;
    if (opts.gallery) canvas.style.touchAction = "pan-y";

    this.rig = new THREE.Group();
    // Frame and plate tilt together to sit flat on the car's plate (setCar).
    this.mount = new THREE.Group();
    this.rig.add(this.mount);
    // The frame and its screws turn over together for prints drawn for a
    // flipped frame (tags on the bottom); the plate always stays upright.
    this.frame = new THREE.Group();
    this.mount.add(this.frame);
    scene.add(this.rig);
    const side = THREE.DoubleSide;
    this.face = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.18, side });
    this.edge = new THREE.MeshPhysicalMaterial({ roughness: 0.45, side });
    this.back = new THREE.MeshStandardMaterial({ color: 0xf3f3f1, emissive: 0x3a3a3a, roughness: 0.55, side }); // white ABS, unprinted; lifted so it reads white away from the key light

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
    this.plate = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.35, metalness: 0, side: THREE.FrontSide })); // blank until loadPlate()
    // Back of the plate: bare aluminium, so turning the frame round never
    // shows the printed face mirrored through it.
    this.plate.add(new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ color: 0xb9bcc1, metalness: 0.7, roughness: 0.42, side: THREE.BackSide })));
    this.plate.position.set(0, 0.05, -FRAME.depth / 2 + 0.012); // flush with the back, as when bolted on
    this.mount.add(this.plate);

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

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -FRAME.height / 2 - 0.9;
    scene.add(floor);
    this.floor = floor;
    this.orbit = Object.fromEntries(Object.keys(CAR_ORBIT).map((k) => [k, controls[k]]));

    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    // Only render while the section is on screen.
    this.visible = true;
    new IntersectionObserver(([e]) => (this.visible = e.isIntersecting)).observe(canvas);
    renderer.setAnimationLoop(() => this.visible && this.tick());
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
    gltf.scene.scale.setScalar(1 / 0.0254);
    this.frame.add(gltf.scene);
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = Math.max(30, (2 * Math.atan(7.2 / HOME[2] / this.camera.aspect) * 180) / Math.PI);
    if (this.camera.aspect < 1.3 && !this.opts.gallery) this.camera.setViewOffset(w, h, 0, -h * 0.09, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  sheet(n) {
    if (!this.sheets.has(n)) {
      const url = this.sheetUrl.replace("pfg-sheet-00", `pfg-sheet-${String(n).padStart(2, "0")}`).replace(/[?&]v=\d+/, "") + BUST;
      this.sheets.set(n, loadImage(url));
    }
    return this.sheets.get(n);
  }

  // Cut one design's texture out of its sheet.
  texture(d) {
    if (!this.textures.has(d.id)) {
      this.textures.set(d.id, this.sheet(d.sheet).then((img) => {
        const { width: w, height: h, cols } = this.layout;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, (d.cell % cols) * w, Math.floor(d.cell / cols) * h, w, h, 0, 0, w, h);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        t.repeat.y = 1 - PRINT_LIFT; // anchored at the bottom edge
        return t;
      }));
    }
    return this.textures.get(d.id);
  }

  async show(d) {
    const tex = await this.texture(d);
    this.setFlipped(!!d.flipped);
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
    this.mount.rotation.x = this.carOn ? -CAR_TILT : 0;
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
      // The model's own blank plate sits under ours; hide it so it never peeks out.
      if (o.isMesh && o.material.name === "PLATE_BLANK") o.visible = false;
    });
    model.rotation.y = Math.PI; // rear towards the camera
    model.scale.setScalar(1 / 0.0254); // metres -> inches
    // Rotated half a turn, the plate spot (x, y, z) sits at (-x, y, -z); put it
    // just behind the tilted frame's back face, where our plate is.
    const spot = new THREE.Vector3(0, 0.05, -FRAME.depth / 2 - 0.02).applyAxisAngle(new THREE.Vector3(1, 0, 0), -CAR_TILT);
    model.position.set(spot.x + CAR_PLATE[0] / 0.0254, spot.y - CAR_PLATE[1] / 0.0254, spot.z + CAR_PLATE[2] / 0.0254);
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

  setPlate(on) { this.plate.visible = this.screws.visible = on; }
  setTurntable(on) { this.controls.autoRotate = on && !reducedMotion; }
  resetView() { this.controls.reset(); this.camera.position.set(...HOME); this.controls.target.set(0, 0, 0); }

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
      this.rig.rotation.y = this.swing.from * (1 - (1 - Math.pow(1 - this.swing.t, 3)));
      if (this.swing.t >= 1) this.swing = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

async function mount(root) {
  const $ = (r) => root.querySelector(`[data-role="${r}"]`);
  setBust(root.dataset.catalog);
  const cat = await fetch(root.dataset.catalog).then((r) => r.json());
  // Best sellers first: data-popular lists product handles in sales order
  // (snippets/pfg-popular.liquid). Unranked designs keep catalog order.
  const rankOf = new Map((root.dataset.popular || "").split(",").filter(Boolean).map((h, i) => [h, i]));
  const rank = (d) => rankOf.get(d.product) ?? Infinity;
  const designs = cat.groups.flatMap((g) => g.designs.map((d) => ({ ...d, group: g }))).sort((a, b) => rank(a) - rank(b));
  const groups = [...cat.groups].sort((a, b) => Math.min(...a.designs.map(rank)) - Math.min(...b.designs.map(rank)));
  const state = { index: 0, filter: "current", query: "", closed: new Set() };
  // Absolute, so the CSS url() doesn't resolve against the stylesheet.
  root.style.setProperty("--pfg-thumbs", `url("${new URL(root.dataset.thumbs, location.href).href}")`);
  root.style.setProperty("--pfg-thumb-size", `${cat.thumbs.cols * 100}% ${cat.thumbs.rows * 100}%`);
  // In store: designs linked to a product, minus older versions of a product
  // that also has a current design (e.g. the legacy white Jollibee).
  const currentProducts = new Set(designs.filter((d) => d.product && d.current).map((d) => d.product));
  const inStore = (d) => !!d.product && (d.current || !currentProducts.has(d.product));
  root.querySelector('[data-count="current"]').textContent = designs.filter(inStore).length;
  root.querySelector('[data-count="all"]').textContent = designs.length;

  const visible = (d) =>
    (state.filter === "all" || inStore(d)) &&
    (!state.query || `${d.name} ${d.group.name} ${d.productTitle || ""}`.toLowerCase().includes(state.query));

  function renderList() {
    const list = $("list");
    list.replaceChildren();
    let shown = 0;
    for (const g of groups) {
      const items = designs.filter((d) => d.group.id === g.id && visible(d));
      if (!items.length) continue;
      shown += items.length;
      const sec = document.createElement("details");
      sec.className = "pfg-group";
      sec.open = !!state.query || !state.closed.has(g.id);
      sec.addEventListener("toggle", () => (sec.open ? state.closed.delete(g.id) : state.closed.add(g.id)));
      const sum = document.createElement("summary");
      sum.innerHTML = `<h3></h3>`;
      sum.firstChild.textContent = g.name;
      const n = document.createElement("span");
      n.textContent = String(items.length).padStart(2, "0");
      sum.firstChild.append(n);
      sec.append(sum);
      const cards = document.createElement("div");
      cards.className = "pfg-cards";
      for (const d of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pfg-card";
        b.dataset.id = d.id;
        const x = (d.thumb % cat.thumbs.cols) / (cat.thumbs.cols - 1);
        const y = Math.floor(d.thumb / cat.thumbs.cols) / (cat.thumbs.rows - 1);
        b.innerHTML = `<span class="pfg-thumb" style="background-position:${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%"></span><b></b>`;
        b.querySelector("b").textContent = d.name;
        b.addEventListener("click", () => select(designs.indexOf(d)));
        cards.append(b);
      }
      sec.append(cards);
      list.append(sec);
    }
    if (!shown) {
      const p = document.createElement("p");
      p.className = "pfg-empty";
      p.textContent = `No designs match “${state.query}”. Try a brand or team, or switch to All designs.`;
      list.append(p);
    }
    mark();
  }

  function mark() {
    const id = designs[state.index].id;
    for (const c of root.querySelectorAll(".pfg-card")) c.setAttribute("aria-current", String(c.dataset.id === id));
  }

  let viewer;
  function select(i) {
    state.index = (i + designs.length) % designs.length;
    const d = designs[state.index];
    $("eyebrow").textContent = d.group.name;
    $("name").textContent = d.productTitle ? d.productTitle.replace(/\s*License Plate Frame\s*$/i, "") : d.name;
    $("shop").hidden = !d.product;
    if (d.product) $("shop").href = root.dataset.products + d.product;
    mark();
    viewer?.show(d);
    // Warm the rest of this sheet's neighbours.
    for (const k of [state.index + 1, state.index - 1]) viewer?.texture(designs[(k + designs.length) % designs.length]);
  }

  function step(dir) {
    // The homepage hero has no visible list: step through every frame in
    // best-seller order rather than category by category.
    const ids = root.classList.contains("pfg--hero")
      ? designs.filter(visible).map((d) => d.id)
      : [...root.querySelectorAll(".pfg-card")].map((c) => c.dataset.id);
    if (!ids.length) return select(state.index + dir);
    const at = ids.indexOf(designs[state.index].id);
    const next = ids[(at + dir + ids.length) % ids.length] ?? ids[0];
    select(designs.findIndex((d) => d.id === next));
    root.querySelector(`.pfg-card[data-id="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  // Jump to a random design from the current list (never the one showing).
  function shuffle() {
    const pool = designs.filter((d, i) => visible(d) && i !== state.index);
    if (!pool.length) return;
    const d = pool[Math.floor(Math.random() * pool.length)];
    select(designs.indexOf(d));
    root.querySelector(`.pfg-card[data-id="${d.id}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function setFilter(f) {
    state.filter = f;
    for (const b of root.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", String(b.dataset.filter === f));
    renderList();
  }

  // Start on a design from the URL (?frame=<id>) or the top seller in store.
  const want = new URLSearchParams(location.search).get("frame");
  const first = Math.max(0, designs.findIndex((d) => (want ? d.id === want : inStore(d))));
  setFilter(inStore(designs[first]) ? "current" : "all");
  select(first);

  await loadThree();
  viewer = new FrameViewer($("stage"), root.dataset.sheet, cat.texture);
  loadPlate(viewer, root.dataset.model);
  await Promise.all([viewer.loadModel(root.dataset.model), viewer.show(designs[state.index])]);
  $("loading").hidden = true;

  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));
  $("random")?.addEventListener("click", shuffle);
  for (const b of root.querySelectorAll("[data-filter]")) b.addEventListener("click", () => setFilter(b.dataset.filter));
  const car = (on) => {
    root.classList.toggle("pfg--car", on);
    viewer.setCar(on, sibling(root.dataset.model, CAR_FILE)).catch(console.error);
  };
  for (const [role, fn] of [["plate", (on) => viewer.setPlate(on)], ["car", car], ["spin", (on) => viewer.setTurntable(on)]]) {
    $(role).addEventListener("click", () => {
      const on = $(role).getAttribute("aria-pressed") !== "true";
      $(role).setAttribute("aria-pressed", String(on));
      fn(on);
    });
  }
  $("reset").addEventListener("click", () => viewer.resetView());
  $("q").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderList();
  });
}

// Product page: add a 3D slide (first) to the theme's gallery when this
// product has a frame design. The theme's own thumbnail and variant code keep
// working; any photo shown in the main image hides the 3D slide.
async function mountProduct(root) {
  setBust(root.dataset.catalog);
  const cat = await fetch(root.dataset.catalog).then((r) => r.json());
  const mine = cat.groups
    .flatMap((g) => g.designs)
    .filter((d) => d.product === root.dataset.handle)
    .sort((a, b) => b.current - a.current);
  if (!mine.length) return;

  const media = root.closest(".pdp__media") || root.parentElement;
  const main = root.parentElement;
  const photo = main.querySelector(":scope > img");
  let thumbs = media.querySelector(".pdp__thumbs");
  if (!thumbs) {
    thumbs = document.createElement("div");
    thumbs.className = "pdp__thumbs";
    main.after(thumbs);
    if (photo) {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "pdp__thumb";
      t.dataset.src = photo.currentSrc || photo.src;
      t.setAttribute("aria-label", "View photo");
      t.innerHTML = `<img src="${t.dataset.src}" alt="" width="160" height="160">`;
      thumbs.append(t);
    }
  }
  thumbs.style.display = "";

  const sprite = new URL(root.dataset.thumbs, location.href).href;
  const spriteAt = (d) => {
    const x = (d.thumb % cat.thumbs.cols) / (cat.thumbs.cols - 1);
    const y = Math.floor(d.thumb / cat.thumbs.cols) / (cat.thumbs.rows - 1);
    return `background-image:url("${sprite}");background-size:${cat.thumbs.cols * 100}% ${cat.thumbs.rows * 100}%;background-position:${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%`;
  };
  const thumb = document.createElement("button");
  thumb.type = "button";
  thumb.className = "pdp__thumb pfg3d-thumb";
  thumb.setAttribute("aria-label", "View this frame in 3D");
  thumb.innerHTML = `<span class="pfg3d-thumb__art" style='${spriteAt(mine[0])}'></span><span class="pfg3d-thumb__tag">3D</span>`;
  thumbs.prepend(thumb);

  let viewer;
  const show = (on) => {
    root.hidden = !on;
    if (on) for (const t of thumbs.querySelectorAll(".pdp__thumb")) t.dataset.active = String(t === thumb);
    else thumb.dataset.active = "false";
  };
  thumbs.addEventListener("click", (e) => {
    const t = e.target.closest(".pdp__thumb");
    if (t) show(t === thumb);
  });
  // Variant changes swap the main photo; show it.
  if (photo) new MutationObserver(() => show(false)).observe(photo, { attributes: true, attributeFilter: ["src"] });

  if (mine.length > 1) {
    const list = root.querySelector('[data-role="designs"]');
    for (const d of mine) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d.name;
      b.setAttribute("aria-pressed", String(d === mine[0]));
      b.addEventListener("click", () => {
        for (const o of list.children) o.setAttribute("aria-pressed", String(o === b));
        viewer?.show(d);
      });
      list.append(b);
    }
    list.hidden = false;
  }

  show(true);
  await loadThree();
  viewer = new FrameViewer(root.querySelector("canvas"), root.dataset.sheet, cat.texture, { gallery: true });
  loadPlate(viewer, root.dataset.model);
  await Promise.all([viewer.loadModel(root.dataset.model), viewer.show(mine[0])]);
  root.dataset.ready = "";
  const carBtn = root.querySelector('[data-role="car"]');
  if (carBtn) {
    carBtn.hidden = false;
    carBtn.addEventListener("click", () => {
      const on = carBtn.getAttribute("aria-pressed") !== "true";
      carBtn.setAttribute("aria-pressed", String(on));
      root.classList.toggle("pfg3d--car", on);
      viewer.setCar(on, sibling(root.dataset.model, CAR_FILE)).catch(console.error);
    });
  }
  // Slow turntable until the shopper grabs it.
  viewer.setTurntable(true);
  viewer.controls.autoRotateSpeed = 1.2;
  viewer.controls.addEventListener("start", () => viewer.setTurntable(false));
}

for (const root of document.querySelectorAll("[data-pfg-pdp]:not([data-pfg-ready])")) {
  root.dataset.pfgReady = "";
  mountProduct(root).catch((err) => {
    console.error(err);
    root.hidden = true;
    root.closest(".pdp__media")?.querySelector(".pfg3d-thumb")?.remove();
  });
}

for (const root of document.querySelectorAll("[data-pfg]:not([data-pfg-ready])")) {
  root.dataset.pfgReady = "";
  mount(root).catch((err) => {
    console.error(err);
    const l = root.querySelector('[data-role="loading"]');
    if (l) l.textContent = "The 3D preview couldn't load. Please refresh the page.";
  });
}
