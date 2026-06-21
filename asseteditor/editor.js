'use strict';
/* NOVA Asset Editor — edit game part meshes, queue overrides, export to js/generated-part-builds.js */

const LS_DRAFT = 'nsp_asset_draft_';
const LS_QUEUE = 'nsp_part_export_queue';
const SNAP = 0.05;

const PRIMS = [
  { label: 'Box', type: 'box', params: { w: 1.25, h: 0.4, d: 1.25 } },
  { label: 'Cylinder', type: 'cylinder', params: { radiusTop: 0.625, radiusBottom: 0.625, height: 1.2, segments: 28 } },
  { label: 'Cone', type: 'cone', params: { radius: 0.625, height: 0.8, segments: 24 } },
  { label: 'Sphere', type: 'sphere', params: { radius: 0.5, segments: 20 } },
  { label: 'Torus', type: 'torus', params: { radius: 0.55, tube: 0.04, segments: 32 } },
  { label: 'Bell', type: 'bell', params: { rThroat: 0.2, rExit: 0.55, length: 0.7 } },
  { label: 'Fin', type: 'fin', params: { span: 0.9, chord: 0.5 } },
  { label: 'Panel', type: 'panel', params: { w: 1.4, h: 0.04, d: 0.9 } },
];

let uidN = 1;
const uid = (p) => p + (uidN++);

const state = {
  partId: null,
  asset: null,
  selected: null,
  tool: 'select',
  snap: true,
  catFilter: 'all',
  search: '',
};

/* ---------- storage ---------- */
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE)) || {}; } catch (e) { return {}; }
}
function saveQueue(q) { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); }
function loadDraft(id) {
  try { const s = localStorage.getItem(LS_DRAFT + id); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function saveDraft() {
  if (!state.partId || !state.asset) return;
  localStorage.setItem(LS_DRAFT + state.partId, JSON.stringify(state.asset));
}

const ASSET_VERSION = 2;

function isLegacyExploded(asset) {
  if (!asset?.exploded || !asset.pieces?.length) return false;
  return asset.pieces.every(p => p.type !== 'bufferMesh');
}

function sanitizeAsset(asset) {
  if (!asset || asset.assetVersion !== ASSET_VERSION) return null;
  if (asset.exploded && isLegacyExploded(asset)) {
    asset.exploded = false;
    asset.pieces = [];
  }
  return asset;
}

function sanitizeQueue() {
  const q = loadQueue();
  let changed = false;
  for (const [id, snap] of Object.entries(q)) {
    if (snap.assetVersion !== ASSET_VERSION || isLegacyExploded(snap)) {
      delete q[id];
      changed = true;
    }
  }
  if (changed) saveQueue(q);
}

/* ---------- material match (use game PARTS.M) ---------- */
function resolvePartMaterial(mat) {
  if (!mat) return 'gray';
  if (window.PARTS && PARTS.M) {
    for (const [name, m] of Object.entries(PARTS.M)) {
      if (mat === m) return name;
      if (mat.color && m.color && mat.color.getHex() === m.color.getHex()
        && Math.abs((mat.roughness ?? 0.5) - (m.roughness ?? 0.5)) < 0.08
        && Math.abs((mat.metalness ?? 0) - (m.metalness ?? 0)) < 0.15) return name;
    }
  }
  if (mat.emissive && mat.emissiveIntensity > 0.3) return 'greenlight';
  const h = mat.color ? mat.color.getHex() : 0xaaaaaa;
  let best = 'gray', bd = 1e9;
  for (const [name, mh] of Object.entries(NSP_PART_BUILDER.MAT_HEX)) {
    const d = Math.abs(mh - h);
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

/* ---------- faithful mesh capture (preserves shape + materials) ---------- */
function decomposeToBufferPieces(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const pieces = [];
  root.traverse(obj => {
    if (!obj.isMesh || !obj.geometry) return;
    const wm = new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld);
    const geo = obj.geometry.clone();
    geo.applyMatrix4(wm);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    pieces.push({
      id: uid('p'),
      type: 'bufferMesh',
      name: obj.name || 'mesh',
      material: resolvePartMaterial(mat),
      pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1],
      geo: {
        pos: Array.from(geo.attributes.position.array),
        nrm: Array.from(geo.attributes.normal.array),
        idx: geo.index ? Array.from(geo.index.array) : undefined,
      },
    });
  });
  return pieces;
}

function buildLiveMesh(id) {
  const buildFn = PARTS.buildOriginal || PARTS.build;
  const g = buildFn(id);
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) m.map.encoding = THREE.sRGBEncoding;
      if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
    }
  });
  return g;
}

function centerPartOnPad(root) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse(obj => {
    if (!obj.isMesh || !obj.geometry) return;
    let p = obj;
    while (p && p !== root) {
      if (p === nodeGroup || p === fxGroup) return;
      p = p.parent;
    }
    box.expandByObject(obj);
  });
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y - 0.02;
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3();
  root.traverse(obj => {
    if (!obj.isMesh || !obj.geometry) return;
    let p = obj;
    while (p && p !== root) {
      if (p === nodeGroup || p === fxGroup) return;
      p = p.parent;
    }
    box2.expandByObject(obj);
  });
  camTarget.set(0, (box2.min.y + box2.max.y) * 0.5, 0);
}

function partToAsset(id) {
  const def = PARTS.CATALOG[id];
  if (!def) return null;
  const draft = sanitizeAsset(loadDraft(id));
  if (draft) return draft;
  const group = buildLiveMesh(id);
  const nodes = (def.nodes || []).map((n, i) => ({
    id: 'n' + (i + 1), dir: n.dir, x: n.x, y: n.y, z: n.z,
  }));
  return {
    assetVersion: ASSET_VERSION,
    version: 1, format: 'nova-part-asset', partId: id,
    exploded: false,
    meta: { id, name: def.name, category: def.cat, size: def.size, height: def.h },
    nodes,
    pieces: [],
    effects: [],
    userData: {
      plume: group.userData.plume ? Object.assign({}, group.userData.plume) : null,
      legLen: group.userData.legLen,
    },
  };
}

function explodeCurrent() {
  if (!state.partId) return;
  const g = buildLiveMesh(state.partId);
  state.asset.pieces = decomposeToBufferPieces(g);
  state.asset.exploded = true;
  uidN = 2000;
  select(null);
  rebuildScene();
  saveDraft();
  toast('Exploded into editable meshes — materials preserved');
}

function formatStats(def) {
  if (!def) return '';
  const lines = [
    def.name + '  (' + def.id + ')',
    'Category: ' + def.cat + '  ·  Size ' + def.size + ' (' + PARTS.SIZES[def.size] + ' m)  ·  H ' + def.h + ' m',
    'Mass: ' + def.massDry + ' kg  ·  Cost: ' + (def.cost ?? 0) + '  ·  Tech: ' + (def.tech || '—'),
  ];
  if (def.desc) lines.push('', def.desc);
  if (def.engine) lines.push('', 'Engine: ' + (def.engine.thrust / 1000) + ' kN  Isp ' + def.engine.ispV + '/' + def.engine.ispA);
  if (def.tank) lines.push('Tank: ' + JSON.stringify(def.tank));
  if (def.pod) lines.push('Pod: crew ' + def.pod.crew + '  EC ' + def.pod.charge);
  if (def.probe) lines.push('Probe: torque ' + def.probe.torque);
  return lines.join('\n');
}

/* ---------- scene ---------- */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10161d);
scene.fog = new THREE.Fog(0x10161d, 80, 260);

const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.04, 500);
const camTarget = new THREE.Vector3(0, 0.6, 0);
let camYaw = 0.65, camPitch = 0.22, camDist = 8, camPan = new THREE.Vector3();

const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
sun.position.set(18, 30, 22);
sun.castShadow = true;
const fill = new THREE.DirectionalLight(0x9ec2e8, 0.65);
fill.position.set(-20, 14, -16);
scene.add(sun, fill, new THREE.AmbientLight(0x445566, 0.75), new THREE.HemisphereLight(0x32414f, 0x1c2326, 0.55));

const floor = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 0.3, 48),
  new THREE.MeshStandardMaterial({ color: 0x222a31, roughness: 0.92 }));
floor.position.y = -0.15; floor.receiveShadow = true;
scene.add(floor);

const partRoot = new THREE.Group();
scene.add(partRoot);
const nodeGroup = new THREE.Group();
partRoot.add(nodeGroup);
const fxGroup = new THREE.Group();
partRoot.add(fxGroup);

const liveMeshHolder = new THREE.Group();
partRoot.add(liveMeshHolder);

const selectBox = new THREE.BoxHelper(new THREE.Mesh(), 0x5ecfff);
selectBox.visible = false;
scene.add(selectBox);

const refGhost = new THREE.Group();
refGhost.visible = false;
scene.add(refGhost);

const meshes = new Map();
const fxObjs = new Map();
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9, -9);

function snapV(v) { return state.snap ? Math.round(v / SNAP) * SNAP : v; }

function clearPartRoot() {
  while (liveMeshHolder.children.length) liveMeshHolder.remove(liveMeshHolder.children[0]);
  meshes.forEach(m => m.removeFromParent());
  meshes.clear();
  fxObjs.forEach(o => { if (o.grp) o.grp.removeFromParent(); });
  fxObjs.clear();
  while (nodeGroup.children.length) nodeGroup.remove(nodeGroup.children[0]);
}

function rebuildScene() {
  clearPartRoot();
  partRoot.position.set(0, 0, 0);
  if (!state.asset || !state.partId) return;

  const showLive = !state.asset.exploded || !state.asset.pieces.length;

  if (showLive) {
    const g = buildLiveMesh(state.partId);
    liveMeshHolder.add(g);
  } else {
    for (const p of state.asset.pieces) {
      const grp = new THREE.Group();
      const m = NSP_PART_BUILDER.pieceMesh(p);
      grp.add(m);
      grp.position.fromArray(p.pos || [0, 0, 0]);
      grp.rotation.set(p.rot?.[0] || 0, p.rot?.[1] || 0, p.rot?.[2] || 0);
      grp.scale.fromArray(p.scale || [1, 1, 1]);
      m.userData.pieceId = p.id;
      liveMeshHolder.add(grp);
      meshes.set(p.id, grp);
    }
  }

  for (const fx of state.asset.effects || []) {
    if (fx.type === 'pointLight' || fx.type === 'emissive') {
      let grp;
      if (fx.type === 'pointLight') {
        const L = new THREE.PointLight(fx.color || '#ffe8c8', fx.intensity ?? 1.2, fx.distance ?? 10);
        L.position.fromArray(fx.pos || [0, 1, 0]);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8),
          new THREE.MeshBasicMaterial({ color: fx.color || '#ffe8c8' }));
        bulb.position.copy(L.position);
        grp = new THREE.Group();
        grp.add(L, bulb);
      } else {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(fx.radius ?? 0.07, 12, 10),
          NSP_PART_BUILDER.makeMat('dark', { color: fx.color || '#37e04a', intensity: fx.intensity ?? 1.2 }));
        bulb.position.fromArray(fx.pos || [0, 0.5, 0]);
        bulb.userData.nspBlink = fx.blink;
        grp = bulb;
      }
      fxGroup.add(grp);
      fxObjs.set(fx.id, { grp, blink: fx.blink, light: grp.isLight ? grp : grp.children?.[0] });
    }
  }
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0x7ad24a, transparent: true, opacity: 0.85, depthTest: false });
  for (const n of state.asset.nodes || []) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), nodeMat.clone());
    s.position.set(n.x, n.y, n.z);
    nodeGroup.add(s);
  }
  centerPartOnPad(partRoot);
  framePartCamera();
  updateSelectionBox();
  renderOutliner();
  updateModeLabel();
}

function updateModeLabel() {
  const t = document.getElementById('part-title');
  if (!t || !state.asset) return;
  const base = PARTS.CATALOG[state.partId]?.name || state.partId;
  t.textContent = base + (state.asset.exploded ? ' · EDITING' : ' · PREVIEW');
}

function framePartCamera() {
  const box = new THREE.Box3().setFromObject(partRoot);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  camTarget.copy(c);
  camDist = Math.max(3.5, Math.max(s.x, s.y, s.z) * 2.6);
}

function updateSelectionBox() {
  selectBox.visible = false;
  if (!state.selected) return;
  if (state.selected.kind === 'piece') {
    const m = meshes.get(state.selected.id);
    if (m) { selectBox.setFromObject(m); selectBox.visible = true; }
  }
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}

function select(sel) {
  state.selected = sel;
  updateSelectionBox();
  renderProps();
  renderOutliner();
  document.querySelectorAll('.ol-item').forEach(el => el.classList.toggle('on', false));
}

function getPiece() {
  return state.selected?.kind === 'piece' ? state.asset.pieces.find(p => p.id === state.selected.id) : null;
}

function syncPiece(p) {
  const m = meshes.get(p.id);
  if (m) {
    m.position.fromArray(p.pos);
    m.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    m.scale.fromArray(p.scale);
  }
  updateSelectionBox();
  saveDraft();
}

/* ---------- UI: catalog ---------- */
function renderCatalog() {
  const el = document.getElementById('catalog');
  el.innerHTML = '';
  const q = loadQueue();
  const ids = Object.keys(PARTS.CATALOG).filter(id => {
    const d = PARTS.CATALOG[id];
    if (d.cat === 'hidden') return false;
    if (state.catFilter !== 'all' && d.cat !== state.catFilter) return false;
    if (state.search) {
      const s = state.search.toLowerCase();
      if (!d.name.toLowerCase().includes(s) && !id.toLowerCase().includes(s)) return false;
    }
    return true;
  }).sort((a, b) => PARTS.CATALOG[a].name.localeCompare(PARTS.CATALOG[b].name));

  for (const id of ids) {
    const d = PARTS.CATALOG[id];
    const row = document.createElement('div');
    row.className = 'cat-item' + (state.partId === id ? ' on' : '');
    const thumb = PARTS.thumbnail(id, 64);
    row.innerHTML = `<img src="${thumb}" alt=""><div><div class="nm">${d.name}</div><div class="sub">${id} · ${d.cat}</div>${q[id] ? '<div class="queued">◆ queued</div>' : ''}</div>`;
    row.onclick = () => loadPart(id);
    el.appendChild(row);
  }
}

function renderCatTabs() {
  const tabs = document.getElementById('cat-tabs');
  tabs.innerHTML = '';
  const mk = (id, label) => {
    const b = document.createElement('div');
    b.className = 'cat-tab' + (state.catFilter === id ? ' on' : '');
    b.textContent = label;
    b.onclick = () => { state.catFilter = id; renderCatTabs(); renderCatalog(); };
    tabs.appendChild(b);
  };
  mk('all', 'All');
  for (const c of PARTS.CATEGORIES) mk(c.id, c.icon);
}

function renderExportList() {
  const q = loadQueue();
  const el = document.getElementById('export-list');
  el.innerHTML = '';
  const ids = Object.keys(q);
  document.getElementById('export-count').textContent = String(ids.length);
  for (const id of ids) {
    const row = document.createElement('div');
    row.className = 'exp-item';
    row.innerHTML = `<span>${PARTS.CATALOG[id]?.name || id}</span><button class="btn tiny" data-rm="${id}">✕</button>`;
    row.querySelector('button').onclick = () => {
      delete q[id]; saveQueue(q); renderExportList(); renderCatalog();
    };
    el.appendChild(row);
  }
}

function loadPart(id) {
  state.partId = id;
  state.asset = partToAsset(id);
  uidN = 1000;
  select(null);
  document.getElementById('part-title').textContent = PARTS.CATALOG[id].name;
  document.getElementById('stats').textContent = formatStats(PARTS.CATALOG[id]);
  refGhost.clear();
  refGhost.visible = false;
  rebuildScene();
  renderCatalog();
  toast('Loaded ' + id);
}

function resetMesh() {
  if (!state.partId) return;
  localStorage.removeItem(LS_DRAFT + state.partId);
  loadPart(state.partId);
  toast('Reset to game default mesh');
}

function queueCurrent() {
  if (!state.partId || !state.asset) { toast('No part loaded'); return; }
  const q = loadQueue();
  const snap = JSON.parse(JSON.stringify(state.asset));
  if (!snap.exploded || !snap.pieces.length) {
    const g = buildLiveMesh(state.partId);
    snap.pieces = decomposeToBufferPieces(g);
    snap.exploded = true;
    snap.assetVersion = ASSET_VERSION;
  }
  q[state.partId] = snap;
  saveQueue(q);
  renderExportList();
  renderCatalog();
  toast('Queued ' + state.partId);
}

function clearQueue() {
  if (!Object.keys(loadQueue()).length) return;
  if (!confirm('Clear entire export queue?')) return;
  saveQueue({});
  renderExportList();
  renderCatalog();
}

function generateOverridesJS() {
  const q = loadQueue();
  const header = `/* AUTO-GENERATED by NOVA Asset Editor — ${new Date().toISOString()}\n   Replaces part meshes at runtime via part-overrides.js */\n'use strict';\nwindow.NSP_PART_OVERRIDES = `;
  return header + JSON.stringify(q, null, 2) + ';\n';
}

async function exportToGame() {
  const q = loadQueue();
  if (!Object.keys(q).length) {
    if (state.partId && state.asset) queueCurrent();
    else { toast('Queue at least one part first'); return; }
  }
  const content = generateOverridesJS();
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: 'generated-part-builds.js',
        startIn: 'downloads',
        types: [{ description: 'JavaScript', accept: { 'application/javascript': ['.js'] } }],
      });
      const w = await h.createWritable();
      await w.write(content);
      await w.close();
      toast('Saved! Copy to js/generated-part-builds.js and reload the game.');
      return;
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  const blob = new Blob([content], { type: 'application/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'generated-part-builds.js';
  a.click();
  toast('Downloaded — place file in js/generated-part-builds.js');
}

/* ---------- props / outliner ---------- */
function numField(label, value, onChange, step = 0.05) {
  const w = document.createElement('div');
  w.className = 'field';
  w.innerHTML = `<label>${label}</label>`;
  const inp = document.createElement('input');
  inp.type = 'number'; inp.step = String(step); inp.value = value;
  inp.oninput = () => onChange(+inp.value);
  w.appendChild(inp);
  return w;
}

function renderProps() {
  const el = document.getElementById('props');
  el.innerHTML = '';
  if (!state.asset?.exploded) {
    el.innerHTML = '<div class="dim">Previewing the real in-game mesh with textures. Click <b>EXPLODE TO EDIT</b> to modify geometry, or add effects from the left.</div>';
    return;
  }
  const p = getPiece();
  if (!p) { el.innerHTML = '<div class="dim">Select a mesh piece.</div>'; return; }
  ['X', 'Y', 'Z'].forEach((ax, i) => {
    el.appendChild(numField('Pos ' + ax, p.pos[i], v => { p.pos[i] = snapV(v); syncPiece(p); }));
  });
  el.appendChild(numField('Rot Y°', (p.rot[1] * 180 / Math.PI).toFixed(1), v => { p.rot[1] = v * Math.PI / 180; syncPiece(p); }, 1));
  const mf = document.createElement('div'); mf.className = 'field';
  mf.innerHTML = '<label>Material</label>';
  const ms = document.createElement('select');
  for (const k of Object.keys(NSP_PART_BUILDER.MAT_HEX)) {
    const o = document.createElement('option'); o.value = k; o.textContent = k;
    if (p.material === k) o.selected = true;
    ms.appendChild(o);
  }
  ms.onchange = () => { p.material = ms.value; rebuildScene(); select({ kind: 'piece', id: p.id }); };
  mf.appendChild(ms); el.appendChild(mf);
  const del = document.createElement('button');
  del.className = 'btn danger tiny'; del.textContent = 'DELETE PIECE';
  del.onclick = () => {
    state.asset.pieces = state.asset.pieces.filter(x => x.id !== p.id);
    select(null); rebuildScene(); saveDraft();
  };
  el.appendChild(del);
}

function renderOutliner() {
  const ol = document.getElementById('outliner');
  ol.innerHTML = '';
  if (!state.asset) return;
  if (!state.asset.exploded) {
    const d = document.createElement('div');
    d.className = 'ol-item dim';
    d.textContent = 'Live game mesh — EXPLODE TO EDIT to change geometry';
    ol.appendChild(d);
    return;
  }
  for (const p of state.asset.pieces) {
    const d = document.createElement('div');
    d.className = 'ol-item' + (state.selected?.id === p.id ? ' on' : '');
    d.textContent = (p.name || p.type) + ' · ' + p.type;
    d.onclick = () => select({ kind: 'piece', id: p.id });
    ol.appendChild(d);
  }
}

function addPrimitive(def) {
  if (!state.asset) { toast('Load a part first'); return; }
  if (!state.asset.exploded) explodeCurrent();
  const p = {
    id: uid('p'), name: def.label, type: def.type,
    material: def.type === 'panel' ? 'solar' : 'white',
    params: JSON.parse(JSON.stringify(def.params)),
    pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1],
  };
  state.asset.pieces.push(p);
  rebuildScene();
  select({ kind: 'piece', id: p.id });
  saveDraft();
}

function addEffect(type) {
  if (!state.asset) return;
  const fx = { id: uid('fx'), type, pos: [0.2, 0.5, 0.2], color: '#37e04a', intensity: 1.2, blink: { period: 1, duty: 0.45 } };
  if (type === 'pointLight') fx.color = '#ffe8c8';
  state.asset.effects = state.asset.effects || [];
  state.asset.effects.push(fx);
  rebuildScene();
  saveDraft();
}

/* ---------- input ---------- */
let dragMode = null, dragStart = { x: 0, y: 0 }, dragCam = {}, dragPan = new THREE.Vector3(), transformStart = null;

function updateCam() {
  const cp = camPitch, cy = camYaw;
  cam.position.set(
    camTarget.x + Math.cos(cp) * Math.sin(cy) * camDist,
    camTarget.y + Math.sin(cp) * camDist,
    camTarget.z + Math.cos(cp) * Math.cos(cy) * camDist,
  ).add(camPan);
  cam.lookAt(camTarget.clone().add(camPan));
}

function pick(cx, cy) {
  if (!state.asset?.exploded) { select(null); return; }
  mouse.x = (cx / innerWidth) * 2 - 1;
  mouse.y = -(cy / innerHeight) * 2 + 1;
  ray.setFromCamera(mouse, cam);
  const hits = ray.intersectObjects(liveMeshHolder.children, true);
  for (const h of hits) {
    let o = h.object;
    while (o) {
      if (o.userData.pieceId) return select({ kind: 'piece', id: o.userData.pieceId });
      o = o.parent;
    }
  }
  select(null);
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (e.button === 2) { dragMode = 'orbit'; dragStart = { x: e.clientX, y: e.clientY }; dragCam = { yaw: camYaw, pitch: camPitch }; return; }
  if (e.button === 1) { dragMode = 'pan'; dragStart = { x: e.clientX, y: e.clientY }; dragPan.copy(camPan); return; }
  if (e.button !== 0) return;
  const p = getPiece();
  if (state.tool === 'move' && p) {
    dragMode = 'move'; dragStart = { x: e.clientX, y: e.clientY }; transformStart = { pos: p.pos.slice() }; return;
  }
  if (state.tool === 'rotate' && p) {
    dragMode = 'rotate'; dragStart = { x: e.clientX, y: e.clientY }; transformStart = { rot: p.rot.slice() }; return;
  }
  pick(e.clientX, e.clientY);
});
addEventListener('mousemove', e => {
  if (!dragMode) return;
  const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
  if (dragMode === 'orbit') {
    camYaw = dragCam.yaw - dx * 0.006;
    camPitch = Math.max(-1.2, Math.min(1.2, dragCam.pitch - dy * 0.005));
  } else if (dragMode === 'pan') {
    const r = new THREE.Vector3();
    cam.getWorldDirection(r);
    const right = new THREE.Vector3().crossVectors(r, cam.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, r).normalize();
    camPan.copy(dragPan).addScaledVector(right, -dx * 0.01 * camDist * 0.08).addScaledVector(up, dy * 0.01 * camDist * 0.08);
  } else if (dragMode === 'move' && transformStart) {
    const p = getPiece();
    if (!p) return;
    p.pos[0] = snapV(transformStart.pos[0] + dx * 0.003 * camDist * 0.1);
    p.pos[2] = snapV(transformStart.pos[2] - dy * 0.003 * camDist * 0.1);
    syncPiece(p); renderProps();
  } else if (dragMode === 'rotate' && transformStart) {
    const p = getPiece();
    if (!p) return;
    p.rot[1] = transformStart.rot[1] - dx * 0.01;
    syncPiece(p); renderProps();
  }
});
addEventListener('mouseup', () => { dragMode = null; transformStart = null; });
canvas.addEventListener('wheel', e => { camDist = Math.max(1.5, Math.min(60, camDist * (1 + e.deltaY * 0.001))); }, { passive: true });

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const p = getPiece();
  const step = e.shiftKey ? SNAP * 4 : SNAP;
  if (e.key === 'q' && p) { p.rot[1] -= 0.12; syncPiece(p); renderProps(); }
  if (e.key === 'e' && p) { p.rot[1] += 0.12; syncPiece(p); renderProps(); }
  if (e.key === 'f' && p && !e.shiftKey) { p.pos[1] = snapV(p.pos[1] - step); syncPiece(p); renderProps(); }
  if (e.key === 'f' && p && e.shiftKey) { p.pos[1] = snapV(p.pos[1] + step); syncPiece(p); renderProps(); }
  if (e.key === 'Delete' && state.selected?.kind === 'piece') {
    state.asset.pieces = state.asset.pieces.filter(x => x.id !== state.selected.id);
    select(null); rebuildScene(); saveDraft();
  }
  if (e.ctrlKey && e.key === 'd' && p) {
    const c = JSON.parse(JSON.stringify(p)); c.id = uid('p'); c.pos[0] += 0.15;
    state.asset.pieces.push(c); rebuildScene(); select({ kind: 'piece', id: c.id }); saveDraft();
  }
});

function setTool(t) {
  state.tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
}

/* ---------- init UI ---------- */
document.getElementById('palette').innerHTML = '';
for (const pr of PRIMS) {
  const b = document.createElement('button');
  b.className = 'btn tiny'; b.textContent = pr.label;
  b.onclick = () => addPrimitive(pr);
  document.getElementById('palette').appendChild(b);
}
document.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => addEffect(b.dataset.fx));
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.getElementById('snap-btn').onclick = function () {
  state.snap = !state.snap; this.classList.toggle('on', state.snap);
};
document.getElementById('cat-search').oninput = e => { state.search = e.target.value.trim(); renderCatalog(); };
document.getElementById('btn-queue').onclick = queueCurrent;
document.getElementById('btn-clear-queue').onclick = clearQueue;
document.getElementById('btn-export-game').onclick = exportToGame;
document.getElementById('btn-reset-mesh').onclick = resetMesh;
document.getElementById('btn-explode').onclick = explodeCurrent;
document.getElementById('btn-import-json').onclick = () => document.getElementById('file-import').click();
document.getElementById('file-import').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (obj.partId && PARTS.CATALOG[obj.partId]) {
        state.partId = obj.partId;
        state.asset = obj;
        rebuildScene();
        renderCatalog();
        document.getElementById('stats').textContent = formatStats(PARTS.CATALOG[obj.partId]);
        toast('Imported asset for ' + obj.partId);
      } else toast('JSON must include valid partId');
    } catch (err) { toast('Invalid JSON'); }
  };
  r.readAsText(f);
  e.target.value = '';
};

function purgeOldDrafts() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(LS_DRAFT)) continue;
    try {
      const d = JSON.parse(localStorage.getItem(k));
      if (!d || d.assetVersion !== ASSET_VERSION) localStorage.removeItem(k);
    } catch (e) { localStorage.removeItem(k); }
  }
}

purgeOldDrafts();
sanitizeQueue();
renderCatTabs();
renderCatalog();
renderExportList();

/* first part */
const firstId = Object.keys(PARTS.CATALOG).find(id => PARTS.CATALOG[id].cat !== 'hidden');
if (firstId) loadPart(firstId);

let t0 = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const t = now * 0.001;
  for (const [, o] of fxObjs) {
    if (!o.blink?.period) continue;
    const on = (t % o.blink.period) / o.blink.period < (o.blink.duty ?? 0.5);
    if (o.light?.isLight) o.light.intensity = on ? (o.light.userData.baseI ?? 1.2) : 0.02;
    else if (o.grp?.material) o.grp.material.emissiveIntensity = on ? 1.1 : 0.04;
  }
  for (const [, o] of fxObjs) {
    if (o.light?.isLight && o.light.userData.baseI == null) o.light.userData.baseI = o.light.intensity;
  }
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  updateCam();
  renderer.render(scene, cam);
}
requestAnimationFrame(frame);
addEventListener('resize', () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
