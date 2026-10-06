import { GROUPS, DESIGNS } from "./catalog.js";
import { FrameViewer } from "./viewer.js";

const $ = (id) => document.getElementById(id);
const base = new URL("../assets/", import.meta.url);
const asset = (p) => new URL(p, base).href;

const state = { index: 0, art: false };

function readHash() {
  const id = location.hash.slice(1);
  const i = DESIGNS.findIndex((d) => d.id === id);
  return i >= 0 ? i : 0;
}

// ---------- catalog rail ----------
function renderList(query = "") {
  const q = query.trim().toLowerCase();
  const list = $("list");
  list.replaceChildren();
  let shown = 0;
  for (const g of GROUPS) {
    const items = g.designs.filter((d) => !q || `${d.name} ${d.detail} ${g.name}`.toLowerCase().includes(q));
    if (!items.length) continue;
    shown += items.length;
    const sec = document.createElement("section");
    sec.className = "group";
    sec.innerHTML = `<h2>${g.name}<span>${String(items.length).padStart(2, "0")}</span></h2><p>${g.blurb}</p>`;
    const cards = document.createElement("div");
    cards.className = "cards";
    for (const d of items) {
      const b = document.createElement("button");
      b.className = "card";
      b.dataset.id = d.id;
      b.innerHTML = `<img src="${asset(`thumbs/${d.id}.webp`)}" alt="" loading="lazy" width="320" height="162"><b>${d.name}</b>`;
      b.addEventListener("click", () => select(DESIGNS.findIndex((x) => x.id === d.id)));
      cards.append(b);
    }
    sec.append(cards);
    list.append(sec);
  }
  if (!shown) list.innerHTML = `<p class="empty">No designs match “${query}”. Try a team, sponsor or colour.</p>`;
  markCurrent();
}

function markCurrent() {
  const id = DESIGNS[state.index].id;
  for (const c of document.querySelectorAll(".card")) c.setAttribute("aria-current", String(c.dataset.id === id));
}

// ---------- viewer ----------
let viewer;

function textureUrl(d) {
  return asset(`textures/${d.id}${state.art && d.art ? "--art" : ""}.webp`);
}

function select(i, { push = true } = {}) {
  state.index = (i + DESIGNS.length) % DESIGNS.length;
  const d = DESIGNS[state.index];
  if (!d.art) state.art = false;
  $("eyebrow").textContent = d.group.name;
  $("name").textContent = d.name;
  $("detail").textContent = d.detail;
  $("pos").textContent = `${String(state.index + 1).padStart(2, "0")} / ${String(DESIGNS.length).padStart(2, "0")}`;
  $("v-art").disabled = !d.art;
  $("v-art").title = d.art ? "Original flat artwork file" : "No separate artwork file for this design";
  $("v-product").setAttribute("aria-pressed", String(!state.art));
  $("v-art").setAttribute("aria-pressed", String(state.art));
  document.title = `${d.name} · Plate Frame Garage`;
  if (push && location.hash.slice(1) !== d.id) history.replaceState(null, "", `#${d.id}`);
  markCurrent();
  viewer?.show(textureUrl(d));
  // Warm the neighbours so arrow-key browsing is instant.
  for (const n of [state.index + 1, state.index - 1]) viewer?.loadTexture(textureUrl(DESIGNS[(n + DESIGNS.length) % DESIGNS.length]));
}

function toggle(btn, fn) {
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(on));
    fn(on);
  });
}

async function boot() {
  renderList();
  select(readHash(), { push: false });

  const template = await fetch(asset("frame-template.json")).then((r) => r.json());
  viewer = new FrameViewer($("stage"), template);
  await viewer.show(textureUrl(DESIGNS[state.index]));
  $("loading").hidden = true;

  $("prev").addEventListener("click", () => select(state.index - 1));
  $("next").addEventListener("click", () => select(state.index + 1));
  $("v-product").addEventListener("click", () => { state.art = false; select(state.index); });
  $("v-art").addEventListener("click", () => { state.art = true; select(state.index); });
  toggle($("plate"), (on) => viewer.setPlate(on));
  let gloss = true;
  $("gloss").addEventListener("click", () => {
    gloss = !gloss;
    viewer.setFinish(gloss);
    $("gloss").textContent = gloss ? "Gloss" : "Satin";
    $("gloss").title = `Finish: ${gloss ? "gloss" : "satin"}. Click to switch.`;
  });
  toggle($("spin"), (on) => viewer.setTurntable(on));
  $("reset").addEventListener("click", () => viewer.resetView());
  $("q").addEventListener("input", (e) => renderList(e.target.value));
  addEventListener("hashchange", () => select(readHash(), { push: false }));
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input")) return;
    if (e.key === "ArrowRight") select(state.index + 1);
    if (e.key === "ArrowLeft") select(state.index - 1);
  });
}

boot().catch((err) => {
  console.error(err);
  $("loading").textContent = "The 3D preview couldn't start. Check that WebGL is enabled, then reload.";
});
