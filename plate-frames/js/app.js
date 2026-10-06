import { GROUPS, DESIGNS, THUMB_COLS, THUMB_ROWS } from "./catalog.js";
import { FrameViewer } from "./viewer.js";

const $ = (id) => document.getElementById(id);
const base = new URL("../assets/", import.meta.url);
const asset = (p) => new URL(p, base).href;

const state = { index: 0, filter: "current", query: "", closed: new Set() };
try {
  state.filter = localStorage.getItem("pfg-filter") || "current";
} catch {}

const visible = (d) =>
  (state.filter === "all" || (state.filter === "current") === d.current) &&
  (!state.query || `${d.name} ${d.group.name} ${d.file}`.toLowerCase().includes(state.query));

function readHash() {
  const i = DESIGNS.findIndex((d) => d.id === location.hash.slice(1));
  return i >= 0 ? i : DESIGNS.findIndex((d) => d.current);
}

// ---------- catalog rail ----------
function renderList() {
  const list = $("list");
  list.replaceChildren();
  let shown = 0;
  for (const g of GROUPS) {
    const items = g.designs.map((d) => DESIGNS.find((x) => x.id === d.id)).filter(visible);
    if (!items.length) continue;
    shown += items.length;
    const sec = document.createElement("details");
    sec.className = "group";
    sec.open = !!state.query || !state.closed.has(g.id);
    sec.addEventListener("toggle", () => (sec.open ? state.closed.delete(g.id) : state.closed.add(g.id)));
    sec.innerHTML = `<summary><h2>${g.name}<span>${String(items.length).padStart(2, "0")}</span></h2></summary><p>${g.blurb}</p>`;
    const cards = document.createElement("div");
    cards.className = "cards";
    for (const d of items) {
      const b = document.createElement("button");
      b.className = "card";
      b.dataset.id = d.id;
      const x = (d.thumb % THUMB_COLS) / (THUMB_COLS - 1), y = Math.floor(d.thumb / THUMB_COLS) / (THUMB_ROWS - 1);
      b.innerHTML = `<span class="thumb" style="background-position:${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%"></span><b></b>${
        state.filter === "all" && !d.current ? '<span class="tag">Archive</span>' : ""
      }`;
      b.querySelector("b").textContent = d.name;
      b.addEventListener("click", () => select(DESIGNS.indexOf(d)));
      cards.append(b);
    }
    sec.append(cards);
    list.append(sec);
  }
  if (!shown) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = state.query
      ? `No designs match “${state.query}”. Try a brand, group or colour, or switch to All.`
      : "Nothing here yet.";
    list.append(p);
  }
  markCurrent();
}

function markCurrent() {
  const id = DESIGNS[state.index].id;
  for (const c of document.querySelectorAll(".card")) c.setAttribute("aria-current", String(c.dataset.id === id));
}

function setFilter(f) {
  state.filter = f;
  try { localStorage.setItem("pfg-filter", f); } catch {}
  for (const k of ["current", "archive", "all"]) $(`f-${k}`).setAttribute("aria-pressed", String(k === f));
  renderList();
}

// ---------- viewer ----------
let viewer;
const textureUrl = (d) => asset(`textures/${d.id}.webp`);

function select(i, { push = true } = {}) {
  state.index = (i + DESIGNS.length) % DESIGNS.length;
  const d = DESIGNS[state.index];
  $("eyebrow").textContent = `${d.group.name}${d.current ? "" : " · Archive"}`;
  $("name").textContent = d.name;
  $("detail").textContent = `${d.file} · ${d.current ? "DomSem production file" : d.folder.split(" / ").slice(0, 2).join(" / ")} · ${d.modified}`;
  $("pos").textContent = `${String(state.index + 1).padStart(3, "0")} / ${DESIGNS.length}`;
  document.title = `${d.name} · Plate Frame Garage`;
  if (push && location.hash.slice(1) !== d.id) history.replaceState(null, "", `#${d.id}`);
  markCurrent();
  viewer?.show(textureUrl(d));
  for (const n of [state.index + 1, state.index - 1]) viewer?.loadTexture(textureUrl(DESIGNS[(n + DESIGNS.length) % DESIGNS.length]));
}

// Arrow keys / prev-next walk the designs currently listed.
function step(dir) {
  const ids = [...document.querySelectorAll(".card")].map((c) => c.dataset.id);
  if (!ids.length) return select(state.index + dir);
  const at = ids.indexOf(DESIGNS[state.index].id);
  const next = ids[(at + dir + ids.length) % ids.length] ?? ids[0];
  select(DESIGNS.findIndex((d) => d.id === next));
  document.querySelector(`.card[data-id="${next}"]`)?.scrollIntoView({ block: "nearest" });
}

async function boot() {
  document.documentElement.style.setProperty("--thumbs", `url("${asset("thumbs.webp")}")`);
  document.documentElement.style.setProperty("--thumb-size", `${THUMB_COLS * 100}% ${THUMB_ROWS * 100}%`);
  $("n-current").textContent = DESIGNS.filter((d) => d.current).length;
  $("n-archive").textContent = DESIGNS.filter((d) => !d.current).length;
  const first = readHash();
  if (!DESIGNS[first].current && state.filter === "current") state.filter = "all";
  setFilter(state.filter);
  select(first, { push: false });

  viewer = new FrameViewer($("stage"));
  await Promise.all([viewer.loadModel(asset("models/plate-frame.glb")), viewer.show(textureUrl(DESIGNS[state.index]))]);
  $("loading").hidden = true;

  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));
  for (const k of ["current", "archive", "all"]) $(`f-${k}`).addEventListener("click", () => setFilter(k));
  $("plate").addEventListener("click", () => {
    const on = $("plate").getAttribute("aria-pressed") !== "true";
    $("plate").setAttribute("aria-pressed", String(on));
    viewer.setPlate(on);
  });
  $("spin").addEventListener("click", () => {
    const on = $("spin").getAttribute("aria-pressed") !== "true";
    $("spin").setAttribute("aria-pressed", String(on));
    viewer.setTurntable(on);
  });
  let gloss = true;
  $("gloss").addEventListener("click", () => {
    gloss = !gloss;
    viewer.setFinish(gloss);
    $("gloss").textContent = gloss ? "Gloss" : "Satin";
    $("gloss").title = `Finish: ${gloss ? "gloss" : "satin"}. Click to switch.`;
  });
  $("reset").addEventListener("click", () => viewer.resetView());
  $("q").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderList();
  });
  addEventListener("hashchange", () => select(readHash(), { push: false }));
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input")) return;
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });
}

boot().catch((err) => {
  console.error(err);
  $("loading").textContent = "The 3D preview couldn't start. Check that WebGL is enabled, then reload.";
});
