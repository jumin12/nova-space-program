/* parts.js — procedural part catalog + mesh builders + thumbnails. Global: PARTS */
'use strict';
const PARTS = (() => {
  const { V3 } = U;
  const SIZES = [0.625, 1.25, 2.5, 3.75];          // stack diameters by size index

  /* ---------- procedural panel-line / rivet detail ---------- */
  function panelTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
    const rng = U.mulberry32(606);
    x.strokeStyle = '#6a6a6a'; x.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const y = 12 + rng() * 232; x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
    for (let i = 0; i < 4; i++) { const px = 20 + rng() * 216; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 256); x.stroke(); }
    x.fillStyle = '#777';
    for (let i = 0; i < 110; i++) x.fillRect(rng() * 254, rng() * 254, 2, 2);
    x.fillStyle = '#8a8a8a';
    for (let i = 0; i < 8; i++) x.fillRect(rng() * 220, rng() * 220, 14 + rng() * 30, 8 + rng() * 22);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const PANEL = panelTex();

  /* ---------- shared materials ---------- */
  const M = {
    white: new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.42, metalness: 0.12, bumpMap: PANEL, bumpScale: 0.012 }),
    offwhite: new THREE.MeshStandardMaterial({ color: 0xcfd2cf, roughness: 0.5, metalness: 0.15, bumpMap: PANEL, bumpScale: 0.012 }),
    gray: new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.55, metalness: 0.45 }),
    darkgray: new THREE.MeshStandardMaterial({ color: 0x4a5057, roughness: 0.5, metalness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.38, metalness: 0.82 }),
    nozzle: new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.3, metalness: 0.9 }),
    nozzleHot: new THREE.MeshStandardMaterial({ color: 0x33271f, roughness: 0.4, metalness: 0.7, emissive: 0x000000 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xd57f2e, roughness: 0.6, metalness: 0.08, bumpMap: PANEL, bumpScale: 0.014 }),
    rust: new THREE.MeshStandardMaterial({ color: 0xa45b22, roughness: 0.65, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2838, roughness: 0.42, metalness: 0.08 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc8a23a, roughness: 0.35, metalness: 0.85 }),
    solar: new THREE.MeshStandardMaterial({ color: 0x18306a, roughness: 0.3, metalness: 0.7 }),
    greenlight: new THREE.MeshStandardMaterial({ color: 0x222822, emissive: 0x37e04a, emissiveIntensity: 0.9 }),
    redpaint: new THREE.MeshStandardMaterial({ color: 0xb33a2e, roughness: 0.55 }),
    ablator: new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.9 }),
    chute: new THREE.MeshStandardMaterial({ color: 0xe06a28, roughness: 0.85, side: THREE.DoubleSide }),
    drogue: new THREE.MeshStandardMaterial({ color: 0xe0c028, roughness: 0.85, side: THREE.DoubleSide }),
  };

  /* ---------- geometry helpers ---------- */
  function mesh(geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const cyl = (rT, rB, h, mat, seg = 24, y = 0) => mesh(new THREE.CylinderGeometry(rT, rB, h, seg), mat, 0, y, 0);
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const sph = (r, mat, y = 0, seg = 18) => mesh(new THREE.SphereGeometry(r, seg, seg), mat, 0, y, 0);
  function lathe(profile, mat, seg = 28, y = 0) {
    const pts = profile.map(p => new THREE.Vector2(p[0], p[1]));
    return mesh(new THREE.LatheGeometry(pts, seg), mat, 0, y, 0);
  }
  function ring(r, tube, mat, y = 0) {
    const m = mesh(new THREE.TorusGeometry(r, tube, 10, 32), mat, 0, y, 0);
    m.rotation.x = Math.PI / 2;
    return m;
  }
  /* engine bell */
  function bell(rThroat, rExit, len, mat) {
    const prof = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const r = rThroat + (rExit - rThroat) * Math.pow(t, 1.6);
      prof.push([r, -t * len]);
    }
    const inner = lathe(prof.map(p => [p[0] * 0.94, p[1]]), M.nozzleHot, 28);
    inner.material = M.nozzleHot.clone();
    inner.material.side = THREE.DoubleSide;
    inner.userData.nozzleHot = true;
    const outer = lathe(prof, mat, 28);
    outer.material = mat.clone();
    outer.material.side = THREE.DoubleSide;
    /* opaque throat cap — blocks seeing the plume through the nozzle interior */
    const throat = mesh(new THREE.CircleGeometry(rThroat * 0.92, 20), M.dark);
    throat.rotation.x = Math.PI / 2;
    throat.position.y = 0.002;
    throat.renderOrder = 2;
    const g = new THREE.Group();
    g.add(outer, inner, throat);
    g.userData.hotMat = inner.material;
    return g;
  }
  function greeblePipes(r, h, n, rng) {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const p = cyl(0.02 + rng() * 0.02, 0.02 + rng() * 0.02, h * (0.5 + rng() * 0.45), M.darkgray, 8);
      p.position.set(Math.cos(a) * r, (rng() - 0.5) * h * 0.3, Math.sin(a) * r);
      g.add(p);
    }
    return g;
  }

  /* ---------- builders per family ---------- */
  function buildTank(d, len, scheme) {
    const g = new THREE.Group(), r = d / 2;
    const main = cyl(r, r, len, scheme === 'orange' ? M.orange : M.white, 28);
    g.add(main);
    g.add(cyl(r * 0.985, r, len * 0.06, M.gray, 28, len / 2 - len * 0.03));
    g.add(cyl(r, r * 0.985, len * 0.06, M.gray, 28, -len / 2 + len * 0.03));
    const bands = scheme === 'orange' ? 2 : Math.max(1, Math.round(len / d));
    for (let i = 0; i < bands; i++) {
      const y = -len / 2 + (i + 0.5) * len / bands;
      g.add(ring(r * 0.998, 0.013 * d + 0.008, scheme === 'orange' ? M.rust : M.darkgray, y));
    }
    const pipe = cyl(0.025 + r * 0.02, 0.025 + r * 0.02, len * 0.86, M.darkgray, 10);
    pipe.position.set(r * 0.99, 0, 0);
    g.add(pipe);
    return g;
  }
  function buildEngine(o) {
    const g = new THREE.Group(), r = o.d / 2;
    const mountH = o.h * 0.3;
    g.add(cyl(r, r * 0.92, mountH, M.gray, 24, o.h / 2 - mountH / 2));
    const rng = U.mulberry32(o.seed || 7);
    const gr = greeblePipes(r * 0.55, mountH * 1.4, 5, rng);
    gr.position.y = o.h / 2 - mountH;
    g.add(gr);
    g.add(sph(r * 0.4, M.darkgray, o.h / 2 - mountH - r * 0.12));
    const b = bell(r * (o.aerospike ? 0.45 : 0.3), r * o.bellR, o.h * 0.62, M.nozzle);
    b.position.y = o.h / 2 - mountH * 1.12;
    g.add(b);
    g.userData.hotMat = b.userData.hotMat;
    if (o.aerospike) {
      const spike = lathe([[r * 0.42, 0], [r * 0.1, -o.h * 0.5], [0.001, -o.h * 0.62]], M.dark, 24);
      spike.position.y = o.h / 2 - mountH;
      g.add(spike);
    }
    g.userData.plume = { y: -o.h / 2, r: r * o.bellR * 0.92 };
    return g;
  }
  function buildSRB(d, len, tip) {
    const g = new THREE.Group(), r = d / 2;
    g.add(cyl(r, r, len, M.offwhite, 24));
    g.add(cyl(r * 1.001, r * 1.001, len * 0.1, M.redpaint, 24, len * 0.28));
    g.add(cyl(r * 1.001, r * 1.001, len * 0.1, M.redpaint, 24, -len * 0.2));
    if (tip) g.add(lathe([[r, 0], [r * 0.7, r * 0.9], [0.01, r * 1.5]], M.offwhite, 20, len / 2));
    const b = bell(r * 0.3, r * 0.62, d * 0.7, M.nozzle);
    b.position.y = -len / 2 + 0.05;
    g.add(b);
    g.userData.hotMat = b.userData.hotMat;
    g.userData.plume = { y: -len / 2 - d * 0.55, r: r * 0.6 };
    return g;
  }
  function buildPod(o) {
    const g = new THREE.Group(), rB = o.d / 2, rT = rB * o.topR;
    const prof = [[rB, -o.h / 2], [rB * 0.99, -o.h / 2 + 0.05], [rT * 1.05, o.h / 2 - 0.12], [rT, o.h / 2]];
    g.add(lathe(prof, M.white, 28));
    g.add(cyl(rT, rT, 0.06, M.gray, 20, o.h / 2 - 0.03));
    g.add(cyl(rB, rB, 0.07, M.darkgray, 28, -o.h / 2 + 0.035));
    /* windows */
    const wn = o.crew >= 3 ? 3 : 1;
    for (let i = 0; i < wn; i++) {
      const a = (i / wn) * Math.PI * 0.9 - Math.PI * 0.22 + Math.PI / 2;
      const w = box(0.22 * o.d, 0.16 * o.d, 0.05, M.glass);
      const rr = (rB + rT) / 2 * 1.01;
      w.position.set(Math.cos(a) * rr * 0.92, o.h * 0.12, Math.sin(a) * rr * 0.92);
      w.lookAt(w.position.clone().multiplyScalar(3).setY(o.h * 0.2));
      g.add(w);
    }
    /* hatch */
    const hatch = box(0.3 * o.d, 0.4 * o.d, 0.06, M.gray, -((rB + rT) / 2) * 0.95, -o.h * 0.05, 0);
    hatch.rotation.y = Math.PI / 2;
    g.add(hatch);
    /* rcs dots */
    for (const a of [0.8, 2.4, 4.0, 5.5]) {
      g.add(box(0.06, 0.06, 0.03, M.dark, Math.cos(a) * rB * 0.93, -o.h * 0.3, Math.sin(a) * rB * 0.93));
    }
    return g;
  }
  function buildCone(d, sharp) {
    const r = d / 2, h = d * (sharp ? 1.5 : 0.9);
    const prof = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      prof.push([r * Math.cos(t * Math.PI / 2) * (sharp ? (1 - t * 0.15) : 1), h * Math.sin(t * Math.PI / 2) - h / 2]);
    }
    prof.push([0.001, h / 2]);
    const g = new THREE.Group();
    g.add(lathe(prof, M.white, 26));
    return g;
  }
  function buildDecoupler(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(cyl(r, r, d * 0.12, M.darkgray, 24));
    g.add(ring(r * 0.99, 0.02 + d * 0.012, M.orange, 0));
    return g;
  }
  function buildFin(o) {
    const s = new THREE.Shape();
    s.moveTo(0, -o.h / 2); s.lineTo(o.w, -o.h / 2 + o.sweep); s.lineTo(o.w, o.h / 2 - o.tip); s.lineTo(0, o.h / 2);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
    const m = mesh(geo, o.ctrl ? M.offwhite : M.white);
    m.rotation.y = -Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    if (o.ctrl) { const stripe = box(0.05, o.h * 0.85, 0.06, M.redpaint, 0, 0, o.w * 0.82); g.add(stripe); }
    return g;
  }
  function buildLeg(len) {
    const g = new THREE.Group();
    g.add(box(0.12, 0.3, 0.14, M.darkgray, 0, 0, 0.02));
    const pivot = new THREE.Group(); pivot.name = 'legPivot'; pivot.position.set(0, 0.1, 0.06);
    const strut = cyl(0.045, 0.045, len, M.gray, 10);
    strut.position.y = -len / 2;
    const piston = cyl(0.028, 0.028, len * 0.5, M.dark, 8);
    piston.position.y = -len * 0.78; piston.name = 'legPiston';
    const foot = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.07, 14), M.darkgray, 0, -len, 0);
    foot.name = 'legFoot';
    pivot.add(strut, piston, foot);
    pivot.rotation.x = -2.1;                       // stowed against body
    g.add(pivot);
    g.userData.legLen = len;
    return g;
  }
  const chuteClothTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#d45e22';
    x.fillRect(0, 0, 256, 256);
    const rng = U.mulberry32(818);
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      const alt = i % 2;
      x.fillStyle = alt ? '#e87830' : '#c84e18';
      x.beginPath();
      x.moveTo(128, 128);
      x.arc(128, 128, 126, a0, a1);
      x.closePath();
      x.fill();
      x.strokeStyle = alt ? '#9a3810' : '#7a2c0c';
      x.lineWidth = 2.2;
      x.beginPath();
      x.moveTo(128, 128);
      x.lineTo(128 + Math.cos((a0 + a1) * 0.5) * 126, 128 + Math.sin((a0 + a1) * 0.5) * 126);
      x.stroke();
    }
    x.strokeStyle = '#f0a060';
    x.lineWidth = 3;
    x.beginPath(); x.arc(128, 128, 118, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 120; i++) {
      const px = 40 + rng() * 176, py = 40 + rng() * 176;
      x.fillRect(px, py, 2 + rng() * 5, 1 + rng() * 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  function chuteLineMesh(mat, upV, baseLen = 1) {
    const line = cyl(0.0042, 0.0032, baseLen, mat, 4);
    line.userData.baseLen = baseLen;
    line.userData.upV = upV.clone();
    return line;
  }
  function setChuteLine(mesh, a, b) {
    if (!mesh || !mesh.isMesh) return;
    const ud = mesh.userData || (mesh.userData = {});
    if (!ud.upV) ud.upV = new THREE.Vector3(0, 1, 0);
    if (!ud.baseLen) ud.baseLen = 1;
    const dir = b.clone().sub(a);
    const len = Math.max(dir.length(), 0.001);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(ud.upV, dir.normalize());
    mesh.scale.set(1, len / ud.baseLen, 1);
  }
  function buildChute(o) {
    const g = new THREE.Group();
    const drogue = !!o.drogue;
    const visR = drogue ? 0.44 : 0.95;
    g.userData.chuteVisR = visR;
    const packY = o.nose ? -0.06 : -0.12;
    if (o.nose) {
      g.add(lathe([[o.d / 2, -o.h / 2], [o.d / 2 * 0.9, o.h * 0.1], [0.05, o.h / 2]], M.white, 20));
      g.add(cyl(0.06, 0.06, 0.05, M.redpaint, 10, o.h / 2));
    } else {
      g.add(box(0.26, 0.36, 0.2, M.white, 0, 0, 0.08));
      g.add(box(0.22, 0.32, 0.05, drogue ? M.drogue : M.chute, 0, 0, 0.2));
      g.add(box(0.14, 0.08, 0.14, M.dark, 0, -0.08, 0.1));
    }
    const attachY = o.nose ? o.h / 2 + 0.04 : 0.24;
    const can = new THREE.Group(); can.name = 'canopy'; can.visible = false;
    const cloth = (drogue ? M.drogue : M.chute).clone();
    cloth.side = THREE.DoubleSide;
    cloth.roughness = 0.94;
    cloth.metalness = 0;
    if (!drogue) { cloth.map = chuteClothTex; cloth.map.repeat.set(2.2, 2.2); }
    /* lathe profile: apex at +Y (up), open hem at -Y toward the craft */
    const prof = [];
    const gores = drogue ? 10 : 16;
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const y = (1 - t) * 0.9;
      const scallop = 1 + Math.sin(t * Math.PI * gores) * (drogue ? 0.02 : 0.045);
      const bell = Math.sin(t * Math.PI * 0.5);
      prof.push(new THREE.Vector2(bell * scallop * (0.98 - t * 0.08), y));
    }
    const dome = new THREE.Mesh(new THREE.LatheGeometry(prof, drogue ? 28 : 40), cloth);
    dome.name = 'chuteDome';
    can.add(dome);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.028, 8, gores * 2), cloth);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.06;
    hem.name = 'chuteHem';
    can.add(hem);
    const vent = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.14, 14), M.dark);
    vent.rotation.x = -Math.PI / 2;
    vent.position.y = 0.86;
    can.add(vent);
    const upV = new THREE.Vector3(0, 1, 0);
    const nLines = drogue ? 12 : 16;
    const canOffsetY = attachY + 0.12;
    const linesGrp = new THREE.Group();
    linesGrp.name = 'chuteLines';
    linesGrp.visible = false;
    linesGrp.userData.shroud = [];
    for (let i = 0; i < nLines; i++) {
      const a = i / nLines * Math.PI * 2;
      const line = chuteLineMesh(M.dark, upV);
      linesGrp.add(line);
      linesGrp.userData.shroud.push({ a, mesh: line });
    }
    g.add(linesGrp);
    const riserGrp = new THREE.Group();
    riserGrp.name = 'chuteRisers';
    riserGrp.visible = false;
    riserGrp.userData.risers = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const line = chuteLineMesh(M.darkgray, upV);
      riserGrp.add(line);
      riserGrp.userData.risers.push({ a, mesh: line });
    }
    g.add(riserGrp);
    can.position.y = canOffsetY;
    can.userData.baseY = canOffsetY;
    can.userData.rimLocalY = 0.06;
    can.userData.rimR = 0.86;
    g.add(can);
    g.userData.chutePackY = o.nose ? attachY - 0.05 : packY;
    g.userData.chuteAttachY = attachY;
    g.userData.chuteRiserY = o.nose ? attachY - 0.03 : attachY + 0.04;
    return g;
  }
  function buildShield(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(lathe([[0.01, -d * 0.1], [r * 0.85, -d * 0.07], [r, 0.0], [r * 0.98, 0.06], [0.01, 0.08]], M.ablator, 28));
    g.children[0].rotation.x = Math.PI;
    g.add(cyl(r * 0.92, r * 0.92, 0.08, M.gray, 24, 0.06));
    return g;
  }
  function buildRCS() {
    const g = new THREE.Group();
    g.add(box(0.18, 0.18, 0.12, M.white, 0, 0, 0.05));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = cyl(0.018, 0.045, 0.07, M.dark, 10);
      n.position.set(dx * 0.1, dy * 0.1, 0.1);
      n.rotation.z = dx ? dx * Math.PI / 2 : (dy > 0 ? 0 : Math.PI);
      if (dy) n.rotation.z = dy > 0 ? 0 : Math.PI;
      else n.rotation.z = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(n);
    }
    return g;
  }
  function buildSolar(deploy) {
    const g = new THREE.Group();
    if (!deploy) {
      g.add(box(0.7, 1.2, 0.04, M.solar, 0, 0, 0.03));
      g.add(box(0.74, 1.24, 0.02, M.gray, 0, 0, 0.012));
      return g;
    }
    g.add(box(0.22, 0.32, 0.12, M.gray, 0, 0, 0.05));
    const arm = new THREE.Group(); arm.name = 'solarArm'; arm.position.set(0, 0, 0.1);
    for (let i = 0; i < 4; i++) {
      const p = box(0.62, 0.02, 0.78, M.solar, 0, 0, 0);
      p.position.z = 0.42 + i * 0.8;
      const frame = box(0.66, 0.015, 0.82, M.darkgray, 0, -0.012, p.position.z);
      arm.add(p, frame);
    }
    arm.scale.z = 0.06;                            // folded
    g.add(arm);
    return g;
  }
  function buildBattery(d, big) {
    const g = new THREE.Group();
    g.add(cyl(d / 2 * 0.9, d / 2 * 0.9, big ? 0.24 : 0.12, M.dark, 20));
    g.add(ring(d / 2 * 0.82, 0.02, M.greenlight, 0));
    return g;
  }
  function buildProbe(d, oct) {
    const g = new THREE.Group();
    g.add(cyl(d / 2, d / 2, d * 0.42, M.darkgray, oct ? 8 : 24));
    g.add(box(d * 0.3, d * 0.05, d * 0.3, M.gold, 0, d * 0.24, 0));
    g.add(cyl(0.01, 0.01, d * 0.7, M.gray, 6, d * 0.5));
    g.add(box(0.06, 0.05, 0.06, M.greenlight, d * 0.32, 0, 0));
    return g;
  }
  function buildReactionWheel(d) {
    const g = new THREE.Group();
    g.add(cyl(d / 2, d / 2, d * 0.18, M.offwhite, 24));
    g.add(ring(d / 2 * 0.85, d * 0.04, M.dark, 0));
    return g;
  }
  function buildScience(kind) {
    const g = new THREE.Group();
    if (kind === 'thermo') {
      g.add(box(0.08, 0.3, 0.06, M.white, 0, 0, 0.04));
      g.add(cyl(0.012, 0.012, 0.34, M.redpaint, 8, 0.06));
      g.children[1].position.z = 0.09;
    } else if (kind === 'baro') {
      g.add(cyl(0.12, 0.12, 0.1, M.gray, 16, 0));
      g.children[0].rotation.x = Math.PI / 2;
      g.add(ring(0.08, 0.02, M.dark, 0.0));
    } else if (kind === 'seismo') {
      g.add(box(0.26, 0.18, 0.2, M.gold, 0, 0, 0.1));
      g.add(box(0.08, 0.06, 0.06, M.greenlight, 0, 0.13, 0.1));
    } else if (kind === 'bio') {
      g.add(cyl(0.16, 0.18, 0.3, M.gray, 14));
      const glass = cyl(0.13, 0.13, 0.16, new THREE.MeshStandardMaterial({ color: 0x71d44a, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x2a5c12, emissiveIntensity: 0.4 }), 14);
      g.add(glass);
    } else if (kind === 'atmos') {
      g.add(box(0.22, 0.26, 0.16, M.white, 0, 0, 0.08));
      g.add(cyl(0.03, 0.03, 0.3, M.dark, 8, 0.18));
    } else if (kind === 'matsci') {
      g.add(cyl(0.62, 0.62, 0.9, M.offwhite, 24));
      g.add(box(0.5, 0.3, 0.06, M.glass, 0, 0, 0.6));
      g.add(ring(0.62, 0.025, M.darkgray, 0.3));
      g.add(ring(0.62, 0.025, M.darkgray, -0.3));
    }
    return g;
  }
  function buildAntenna() {
    const g = new THREE.Group();
    g.add(box(0.08, 0.12, 0.08, M.gray, 0, 0, 0.04));
    g.add(cyl(0.012, 0.018, 0.9, M.dark, 8, 0.5));
    g.add(sph(0.03, M.redpaint, 0.96));
    return g;
  }
  function buildDock(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(cyl(r, r, 0.12, M.gray, 24));
    g.add(ring(r * 0.72, 0.035, M.dark, 0.06));
    g.add(ring(r * 0.5, 0.02, M.gold, 0.08));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const petal = box(0.12 * d, 0.1, 0.05, M.darkgray, Math.cos(a) * r * 0.55, 0.1, Math.sin(a) * r * 0.55);
      petal.rotation.y = -a;
      g.add(petal);
    }
    g.add(box(0.05, 0.04, 0.03, M.greenlight, r * 0.8, 0.05, 0));
    return g;
  }
  function buildRelayDish(big) {
    const g = new THREE.Group();
    g.add(box(0.16, 0.2, 0.12, M.gray, 0, 0, 0.05));
    const arm = cyl(0.025, 0.025, big ? 0.5 : 0.3, M.darkgray, 8);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 0.05, (big ? 0.34 : 0.24));
    g.add(arm);
    /* paraboloid dish */
    const prof = [];
    const R = big ? 0.85 : 0.42;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      prof.push([R * t, -t * t * R * 0.42]);
    }
    const dish = lathe(prof, new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }), 24);
    dish.rotation.x = -Math.PI / 2;
    dish.position.set(0, 0.05, (big ? 0.62 : 0.42));
    g.add(dish);
    const feed = cyl(0.015, 0.04, big ? 0.5 : 0.26, M.dark, 8);
    feed.rotation.x = Math.PI / 2;
    feed.position.set(0, 0.05, (big ? 0.5 : 0.36));
    g.add(feed);
    if (big) {
      for (const a of [0.7, 2.4, 4.2]) {
        const strut = cyl(0.012, 0.012, 0.5, M.darkgray, 6);
        strut.position.set(Math.cos(a) * 0.3, 0.05, 0.45);
        strut.lookAt(0, 0.05, 0.62);
        g.add(strut);
      }
    }
    return g;
  }
  function buildNuclear(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(cyl(r, r * 0.94, 0.5, M.gray, 24, 0.85));
    /* reactor core with radiator fins */
    const core = cyl(r * 0.72, r * 0.72, 1.0, M.dark, 18, 0.1);
    g.add(core);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const fin = box(0.04, 1.0, r * 0.55, new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.4, metalness: 0.7 }));
      fin.position.set(Math.cos(a) * r * 0.85, 0.1, Math.sin(a) * r * 0.85);
      fin.rotation.y = -a + Math.PI / 2;
      g.add(fin);
    }
    const b = bell(r * 0.26, r * 0.6, 0.9, M.nozzle);
    b.position.y = -0.45;
    g.add(b);
    g.userData.hotMat = b.userData.hotMat;
    g.userData.plume = { y: -1.35, r: r * 0.55 };
    return g;
  }
  function buildCupola(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(lathe([[r, -0.45], [r * 0.98, -0.1], [r * 0.8, 0.25], [r * 0.4, 0.42], [0.02, 0.46]], M.white, 24));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x223a4f, roughness: 0.38, metalness: 0.1, transparent: true, opacity: 0.92 });
    const domeG = mesh(new THREE.SphereGeometry(r * 0.66, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), glassMat, 0, 0.16, 0);
    g.add(domeG);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const rib = box(0.035, 0.42, 0.03, M.gray, Math.cos(a) * r * 0.55, 0.3, Math.sin(a) * r * 0.55);
      rib.lookAt(0, 0.75, 0);
      g.add(rib);
    }
    g.add(cyl(r, r, 0.1, M.darkgray, 24, -0.5));
    return g;
  }
  function buildGirder(d, len) {
    const g = new THREE.Group(), r = d / 2 * 0.8;
    const beamMat = M.darkgray;
    for (const a of [0.79, 2.36, 3.93, 5.5]) {
      const rail = cyl(0.035, 0.035, len, beamMat, 8);
      rail.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.add(rail);
      const a2 = a + Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const cross = cyl(0.02, 0.02, r * 1.45, M.gray, 6);
        cross.position.set(Math.cos((a + a2) / 2) * r * 0.7, -len / 2 + (i + 0.5) * len / 3, Math.sin((a + a2) / 2) * r * 0.7);
        cross.rotation.z = Math.PI / 2;
        cross.rotation.y = -(a + a2) / 2;
        g.add(cross);
      }
    }
    return g;
  }
  function buildGravimeter() {
    const g = new THREE.Group();
    g.add(sph(0.13, M.gold, 0.06, 14));
    g.add(cyl(0.05, 0.07, 0.14, M.dark, 10, -0.08));
    g.add(box(0.05, 0.03, 0.02, M.greenlight, 0, 0.18, 0.04));
    return g;
  }
  function buildLight() {
    const g = new THREE.Group();
    g.add(box(0.14, 0.1, 0.1, M.darkgray, 0, 0, 0.04));
    const lens = box(0.1, 0.07, 0.02, new THREE.MeshStandardMaterial({ color: 0xfff8d0, emissive: 0x000000 }), 0, 0, 0.1);
    lens.name = 'lens';
    g.add(lens);
    return g;
  }
  function buildAdapter(d1, d2, h) {
    const g = new THREE.Group();
    g.add(cyl(d2 / 2, d1 / 2, h, M.white, 28));
    g.add(ring(d1 / 2 * 0.99, 0.02, M.darkgray, -h / 2 + 0.04));
    g.add(ring(d2 / 2 * 0.99, 0.02, M.darkgray, h / 2 - 0.04));
    return g;
  }
  function buildFairingBase(d, topD, hShell) {
    const g = new THREE.Group(), r = d / 2;
    g.add(cyl(r, r, 0.14, M.gray, 28));
    /* two half-shells */
    for (let half = 0; half < 2; half++) {
      const shellG = new THREE.Group();
      shellG.name = 'fairingHalf' + half;
      const prof = [[r, 0], [r, hShell * 0.55], [topD / 2 + 0.08, hShell * 0.8], [topD / 4, hShell * 0.98], [0.02, hShell]];
      const pts = prof.map(p => new THREE.Vector2(p[0], p[1]));
      const geo = new THREE.LatheGeometry(pts, 18, half * Math.PI, Math.PI);
      const sm = mesh(geo, M.white);
      sm.material = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.42, metalness: 0.12, side: THREE.DoubleSide });
      shellG.add(sm);
      shellG.position.y = 0.07;
      g.add(shellG);
    }
    return g;
  }
  function buildXenon(d) {
    const g = new THREE.Group();
    g.add(sph(d / 2 * 0.85, M.gold, 0, 20));
    g.add(cyl(d / 2 * 0.4, d / 2 * 0.4, d * 0.9, M.gray, 14));
    return g;
  }
  function buildMono(d) {
    const g = new THREE.Group();
    g.add(sph(d / 2 * 0.92, M.offwhite, 0, 20));
    g.add(ring(d / 2 * 0.7, 0.02, M.darkgray, 0));
    return g;
  }
  function buildIon(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(cyl(r, r, 0.3, M.gold, 20, 0.1));
    const grid = cyl(r * 0.8, r * 0.8, 0.04, new THREE.MeshStandardMaterial({ color: 0x274b66, emissive: 0x113355, roughness: 0.4, metalness: 0.6 }), 20, -0.1);
    grid.userData.nozzleHot = true;
    g.add(grid);
    g.userData.plume = { y: -0.15, r: r * 0.7 };
    g.userData.hotMat = grid.material;
    return g;
  }
  function buildNavCam() {
    const g = new THREE.Group();
    g.add(box(0.16, 0.18, 0.14, M.gray, 0, 0, 0.07));
    const barrel = cyl(0.05, 0.065, 0.12, M.dark, 12);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.2);
    g.add(barrel);
    const lens = cyl(0.045, 0.045, 0.01, new THREE.MeshStandardMaterial({ color: 0x2a4a7a, roughness: 0.05, metalness: 0.9 }), 12);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.02, 0.265);
    g.add(lens);
    g.add(box(0.04, 0.03, 0.02, M.greenlight, 0.05, 0.09, 0.14));
    return g;
  }
  function buildTelescope(d) {
    const g = new THREE.Group(), r = d / 2;
    const tube = cyl(r * 0.62, r * 0.62, d * 1.7, M.offwhite, 24);
    g.add(tube);
    g.add(cyl(r * 0.66, r * 0.66, d * 0.16, M.gold, 24, d * 0.78));
    const aperture = cyl(r * 0.56, r * 0.56, 0.04, new THREE.MeshStandardMaterial({ color: 0x0a1422, roughness: 0.04, metalness: 0.95 }), 24, d * 0.86);
    g.add(aperture);
    g.add(cyl(r * 0.2, r * 0.3, d * 0.35, M.darkgray, 14, -d * 0.95));
    for (const a of [0.6, 2.7, 4.4]) {
      const dish = box(0.2, 0.32, 0.02, M.solar, Math.cos(a) * r * 0.66, -d * 0.3, Math.sin(a) * r * 0.66);
      dish.lookAt(dish.position.clone().multiplyScalar(3));
      g.add(dish);
    }
    g.userData.scopeTip = d * 0.9;
    return g;
  }
  function buildGeiger() {
    const g = new THREE.Group();
    g.add(box(0.14, 0.2, 0.08, M.offwhite, 0, 0, 0.04));
    const tube = cyl(0.03, 0.03, 0.18, M.gold, 10);
    tube.position.set(0, 0.13, 0.06);
    g.add(tube);
    g.add(box(0.08, 0.05, 0.02, M.greenlight, 0, -0.02, 0.09));
    return g;
  }
  function buildFilmCam() {
    const g = new THREE.Group();
    g.add(box(0.22, 0.26, 0.16, M.darkgray, 0, 0, 0.08));
    g.add(cyl(0.07, 0.09, 0.1, M.dark, 12, 0));
    g.children[1].rotation.x = Math.PI / 2;
    g.children[1].position.set(0, 0.04, 0.2);
    g.add(box(0.18, 0.04, 0.12, M.gray, 0, -0.14, 0.08));
    return g;
  }
  function buildSupply(d, big) {
    const g = new THREE.Group(), r = d / 2 * 0.92;
    g.add(cyl(r, r, big ? 0.6 : 0.3, M.offwhite, 20));
    for (let i = 0; i < (big ? 3 : 2); i++) {
      g.add(ring(r * 1.0, 0.018, M.gold, -((big ? 0.6 : 0.3) / 2) + (i + 0.5) * (big ? 0.2 : 0.15)));
    }
    g.add(box(r * 0.6, big ? 0.3 : 0.16, 0.02, M.greenlight, 0, 0, r));
    return g;
  }
  function buildShieldLining(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(cyl(r, r, 0.16, M.dark, 24));
    g.add(ring(r * 0.97, 0.025, M.gold, 0.05));
    g.add(ring(r * 0.97, 0.025, M.gold, -0.05));
    return g;
  }
  /* ---------- aviation ---------- */
  function buildAeroCab(d) {
    const g = new THREE.Group(), r = d / 2;
    const prof = [[r * 0.96, -0.6], [r, -0.2], [r * 0.9, 0.25], [r * 0.45, 0.55], [0.04, 0.62]];
    g.add(lathe(prof, M.white, 24));
    /* canopy */
    const canopy = mesh(new THREE.SphereGeometry(r * 0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), M.glass, 0, 0.18, r * 0.34);
    canopy.scale.set(1, 0.75, 1.25);
    g.add(canopy);
    g.add(cyl(r * 0.97, r * 0.97, 0.08, M.darkgray, 24, -0.58));
    return g;
  }
  function buildWing(span, chord, taper) {
    const s = new THREE.Shape();
    s.moveTo(0, -chord / 2);
    s.lineTo(span, -chord / 2 + chord * (1 - taper) * 0.7);
    s.lineTo(span, chord / 2 - chord * (1 - taper) * 0.3);
    s.lineTo(0, chord / 2);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    const m = mesh(geo, M.white);
    m.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    const g = new THREE.Group();
    g.add(m);
    return g;
  }
  function buildJet(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(cyl(r * 0.92, r, d * 1.1, M.gray, 24));
    const intake = cyl(r * 1.02, r * 0.95, d * 0.2, M.dark, 24, d * 0.55);
    g.add(intake);
    /* fan */
    for (let i = 0; i < 8; i++) {
      const blade = box(0.04, r * 0.74, 0.02, M.darkgray, 0, d * 0.5, 0);
      blade.rotation.y = i / 8 * Math.PI * 2;
      blade.rotation.x = 0.5;
      const piv = new THREE.Group();
      piv.add(blade);
      piv.rotation.y = i / 8 * Math.PI * 2;
      piv.position.y = d * 0.5;
      g.add(piv);
    }
    const noz = lathe([[r * 0.8, 0], [r * 0.55, -d * 0.3]], M.nozzleHot.clone(), 20, -d * 0.55);
    noz.userData.nozzleHot = true;
    g.add(noz);
    g.userData.hotMat = noz.material;
    g.userData.plume = { y: -d * 0.85, r: r * 0.5 };
    return g;
  }
  function buildWheel() {
    const g = new THREE.Group();
    g.add(box(0.1, 0.5, 0.12, M.gray, 0, -0.1, 0.05));
    const tire = mesh(new THREE.TorusGeometry(0.22, 0.09, 10, 18), M.dark, 0, -0.42, 0.08);
    g.add(tire);
    const hub = cyl(0.08, 0.08, 0.1, M.offwhite, 10);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(0, -0.42, 0.08);
    g.add(hub);
    return g;
  }
  function buildIntake(d) {
    const g = new THREE.Group(), r = d / 2;
    g.add(lathe([[r * 0.5, -0.3], [r, -0.05], [r * 0.96, 0.05], [r * 0.45, 0.12]], M.offwhite, 22));
    g.add(cyl(r * 0.42, r * 0.42, 0.06, M.dark, 18, 0.06));
    return g;
  }
  /* ---------- EVA astronaut ---------- */
  function buildAstronaut(suitHex = 0xe8e8e6) {
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: suitHex, roughness: 0.6, metalness: 0.05 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xd96a2a, roughness: 0.6 });
    /* torso + hips */
    const torso = mesh(THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.16, 0.3, 4, 10) : new THREE.SphereGeometry(0.2, 10, 8), suit, 0, 0.32, 0);
    g.add(torso);
    /* helmet + gold visor */
    g.add(sph(0.15, suit, 0.66, 14));
    const visor = mesh(new THREE.SphereGeometry(0.125, 14, 10, -0.9, 1.8, 0.7, 1.1), new THREE.MeshStandardMaterial({ color: 0xc8922a, roughness: 0.08, metalness: 0.95 }), 0, 0.665, 0.035);
    g.add(visor);
    /* backpack */
    g.add(box(0.24, 0.3, 0.14, M.gray, 0, 0.36, -0.18));
    g.add(cyl(0.025, 0.025, 0.2, M.dark, 6, 0.52));
    /* limbs */
    for (const sx of [-1, 1]) {
      const arm = cyl(0.05, 0.045, 0.34, suit, 8);
      arm.position.set(sx * 0.22, 0.34, 0.02);
      arm.rotation.z = sx * 0.25;
      g.add(arm);
      const glove = sph(0.055, accent, 0, 8);
      glove.position.set(sx * 0.26, 0.16, 0.03);
      g.add(glove);
      const leg = cyl(0.06, 0.05, 0.42, suit, 8);
      leg.position.set(sx * 0.09, -0.08, 0);
      g.add(leg);
      const boot = box(0.1, 0.07, 0.16, accent, sx * 0.09, -0.31, 0.03);
      g.add(boot);
    }
    /* chest light + patch */
    g.add(box(0.05, 0.04, 0.02, M.greenlight, 0.06, 0.42, 0.16));
    g.add(box(0.07, 0.07, 0.01, accent, -0.07, 0.44, 0.165));
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.scale.setScalar(0.68);                           // human-scale next to 1.25m parts
    return g;
  }

  /* ============ catalog ============ */
  const CATALOG = {};
  function def(d) {
    d.massDry = d.massDry !== undefined ? d.massDry : 100;
    d.crashTol = d.crashTol || (d.cat === 'pods' ? 14 : d.leg ? 14 : 8);
    d.maxTemp = d.maxTemp || (d.shield ? 3400 : d.cat === 'pods' ? 1700 : 1300);
    CATALOG[d.id] = d;
  }
  const sz = i => SIZES[i];

  /* --- pods & cores (probe-first progression) --- */
  def({ id: 'avionics', name: 'AV-1 “Pathfinder” Avionics', cat: 'pods', size: 0, h: 0.24, massDry: 42, cost: 220, tech: 'start',
    probe: { torque: 0.25, charge: 12, drain: 0.01 },
    desc: 'A nose-mounted thinking machine for sounding rockets. The space program starts here.',
    build: () => buildProbe(sz(0) * 0.8, true) });
  def({ id: 'sprite', name: 'P-0 “Sprite” Probe Core', cat: 'pods', size: 0, h: 0.32, massDry: 70, cost: 480, tech: 'telemetry',
    probe: { torque: 0.6, charge: 25, drain: 0.025 },
    desc: 'A tiny thinking octagon. Does not get lonely. Probably.',
    build: () => buildProbe(sz(0), true) });
  def({ id: 'pixel', name: 'P-1 “Pixel” Probe Ring', cat: 'pods', size: 1, h: 0.4, massDry: 130, cost: 950, tech: 'probesAdv',
    probe: { torque: 1.8, charge: 50, drain: 0.04 },
    desc: 'Flat, smart, and full of opinions about your trajectory.',
    build: () => buildProbe(sz(1), false) });
  def({ id: 'comet', name: 'C-1 “Comet” Pod', cat: 'pods', size: 1, h: 1.05, massDry: 840, cost: 600, tech: 'commandModules',
    pod: { crew: 1, torque: 5, charge: 50, mono: 10, supplies: 12 }, science: 'crew',
    desc: 'One seat, one window, infinite possibility. Snacks included (see Supplies gauge).',
    build: () => buildPod({ d: sz(1), h: 1.05, topR: 0.32, crew: 1 }), topR: 0.32 });
  def({ id: 'meteor', name: 'C-3 “Meteor” Pod', cat: 'pods', size: 2, h: 1.85, massDry: 2720, cost: 3900, tech: 'advCapsules',
    pod: { crew: 3, torque: 16, charge: 150, mono: 30, supplies: 40 }, science: 'crew',
    desc: 'Three seats and a real cup holder. Luxury spaceflight.',
    build: () => buildPod({ d: sz(2), h: 1.85, topR: 0.26, crew: 3 }), topR: 0.26 });
  def({ id: 'tortoise', name: 'L-1 “Tortoise” Lander Can', cat: 'pods', size: 1, h: 1.1, massDry: 680, cost: 1500, tech: 'landing',
    pod: { crew: 1, torque: 7, charge: 80, mono: 25, supplies: 10 }, science: 'crew', crashTol: 10,
    desc: 'Light pressurized can for going down and, ideally, back up.',
    build: () => buildPod({ d: sz(1), h: 1.1, topR: 0.6, crew: 1 }), topR: 0.6 });
  def({ id: 'aerocab', name: 'A-1 “Skylark” Cockpit', cat: 'aviation', size: 1, h: 1.2, massDry: 920, cost: 1450, tech: 'aviation',
    pod: { crew: 1, torque: 6, charge: 60, mono: 4, supplies: 8 }, science: 'crew',
    desc: 'A sleek pressurized cockpit with a panoramic canopy. Yearns for the runway.',
    build: () => buildAeroCab(sz(1)), topR: 0.4 });
  /* hidden EVA "vessel" part */
  def({ id: 'astro', name: 'Astronaut', cat: 'hidden', size: 0, h: 0.95, massDry: 94, cost: 0, tech: 'start',
    eva: true, probe: { torque: 0.2, charge: 30, drain: 0.004 }, rcs: { thrust: 32 }, tank: { mono: 4 },
    crashTol: 22, maxTemp: 1200,
    desc: 'One brave explorer in a very nice suit.',
    build: () => buildAstronaut() });

  /* --- fuel tanks --- */
  function tank(id, name, size, cap, len, tech, scheme) {
    def({ id, name, cat: 'fuel', size, h: len, massDry: Math.round(cap / 8), cost: Math.round(cap / 8 * 1.2 + cap * 0.18),
      tank: { lf: cap }, tech, desc: 'Propellant storage. The bigger it is, the slower your problems.',
      build: () => buildTank(sz(size), len, scheme) });
  }
  tank('s0_220', 'ST-0 Micro Tank', 0, 220, 0.7, 'flightControl');
  tank('s1_550', 'ST-1 Stub Tank', 1, 550, 0.6, 'rocketry1');
  tank('s1_1100', 'ST-2 Short Tank', 1, 1100, 1.15, 'rocketry1');
  tank('s1_2200', 'ST-4 Long Tank', 1, 2200, 2.3, 'rocketry2');
  tank('s2_4500', 'BT-4 Tank', 2, 4500, 1.2, 'advRocketry');
  tank('s2_9000', 'BT-8 Tank', 2, 9000, 2.4, 'heavyProp');
  tank('s2_18000', 'BT-16 Jumbo Tank', 2, 18000, 4.7, 'heavyProp', 'orange');
  tank('s3_36000', 'HV-32 Colossus Tank', 3, 36000, 4.2, 'heavyConstruction', 'orange');
  def({ id: 'rad_300', name: 'Sidekick Drop Tank', cat: 'fuel', size: 0, h: 0.9, massDry: 40, cost: 130, tech: 'rocketry2',
    tank: { lf: 300 }, radial: true, desc: 'Strap-on fuel. Stick it anywhere, no judgment.',
    build: () => { const g = buildTank(0.5, 0.9, ''); g.rotation.set(0, 0, 0); return g; } });
  def({ id: 'mono_200', name: 'MP-200 Mono Sphere', cat: 'fuel', size: 1, h: 0.62, massDry: 35, cost: 240, tech: 'flightControl',
    tank: { mono: 200 }, desc: 'Pressurized maneuvering juice for RCS thrusters.',
    build: () => buildMono(0.7) });
  def({ id: 'xen_90', name: 'XE-90 Xenon Sphere', cat: 'fuel', size: 0, h: 0.5, massDry: 35, cost: 1500, tech: 'ion',
    tank: { xenon: 90 }, desc: 'Heavy noble gas in a shiny ball. Very fancy.',
    build: () => buildXenon(0.55) });
  def({ id: 'supplyS', name: 'LS-60 Supply Canister', cat: 'utility', size: 0, h: 0.3, massDry: 24, cost: 260, tech: 'lifeSupport',
    tank: { supplies: 60 }, desc: 'Food, water and air for the crew. Rated “probably enough”.',
    build: () => buildSupply(sz(1) * 0.8, false) });
  def({ id: 'supplyM', name: 'LS-240 Supply Drum', cat: 'utility', size: 1, h: 0.6, massDry: 80, cost: 820, tech: 'lifeSupport',
    tank: { supplies: 240 }, desc: 'Long-mission rations. The freeze-dried lasagna is legendary.',
    build: () => buildSupply(sz(1), true) });

  /* --- liquid engines --- */
  function engine(id, name, size, o, tech, cost, mass, desc) {
    def({ id, name, cat: 'engines', size, h: o.h, massDry: mass, cost, tech, desc,
      engine: { thrust: o.t * 1000, ispV: o.iv, ispA: o.ia, gimbal: o.g, prop: o.prop || 'lf' },
      build: () => o.ion ? buildIon(sz(size)) : buildEngine({ d: sz(size), h: o.h, bellR: o.bellR || 0.72, seed: o.t | 0, aerospike: o.spike }) });
  }
  engine('pixie', 'E-05 “Pixie”', 0, { t: 24, iv: 305, ia: 268, g: 5, h: 0.55 }, 'rocketry1', 390, 140,
    'A plucky little engine for plucky little rockets.');
  engine('wren', 'E-20 “Wren”', 1, { t: 215, iv: 300, ia: 262, g: 2, h: 1.3 }, 'rocketry1', 1050, 1250,
    'The honest workhorse. Points mostly where you tell it.');
  engine('albatross', 'E-21 “Albatross”', 1, { t: 230, iv: 318, ia: 258, g: 3.5, h: 1.4 }, 'rocketry2', 1350, 1480,
    'A balanced sustainer with a proper gimbal. Reaches far.');
  engine('kestrel', 'E-30 “Kestrel”', 1, { t: 62, iv: 350, ia: 90, g: 4.5, h: 0.9, bellR: 0.85 }, 'propulsion2', 760, 510,
    'Feather-light vacuum engine. Useless at sea level, divine in orbit.');
  engine('condor', 'E-40 “Condor”', 2, { t: 700, iv: 322, ia: 278, g: 2.5, h: 2.1 }, 'heavyProp', 5400, 3300,
    'Big lift for serious ambitions.');
  engine('phoenix', 'E-45 “Phoenix”', 2, { t: 250, iv: 353, ia: 105, g: 4.5, h: 1.4, bellR: 0.88 }, 'precision', 1900, 1750,
    'Graceful vacuum engine for graceful orbital ballet.');
  engine('roc', 'E-60 “Roc”', 2, { t: 1500, iv: 312, ia: 282, g: 2, h: 2.6 }, 'heavyProp', 13500, 6400,
    'A mythically large amount of thrust. Hold on to something.');
  engine('drake', 'E-70 “Drake”', 3, { t: 1950, iv: 341, ia: 200, g: 1.5, h: 2.8 }, 'heavyConstruction', 19000, 9200,
    'Upper-stage muscle for monster rockets.');
  engine('hydra', 'E-90 “Hydra”', 3, { t: 3900, iv: 316, ia: 290, g: 2, h: 3.1 }, 'heavyConstruction', 41000, 15500,
    'Many chambers. Many flames. Many decibels.');
  engine('basilisk', 'E-50 “Basilisk”', 1, { t: 190, iv: 332, ia: 318, g: 0, h: 1.1, spike: true }, 'precision', 3200, 1050,
    'Aerospike wizardry: great everywhere, gimbal nowhere.');
  engine('whisper', 'I-2 “Whisper” Ion Drive', 0, { t: 2.1, iv: 4100, ia: 100, g: 0, h: 0.4, ion: true, prop: 'xenon' }, 'ion', 7200, 240,
    'Patience, electrified. Pack a good book.');
  def({ id: 'nerv', name: 'N-1 “Salamander” Atomic Rocket', cat: 'engines', size: 1, h: 2.3, massDry: 3100, cost: 12500, tech: 'nuclearProp',
    engine: { thrust: 65 * 1000, ispV: 820, ispA: 190, gimbal: 0.5, prop: 'lf' },
    desc: 'A glowing reactor core with a nozzle. Twice the mileage, zero apologies.',
    build: () => buildNuclear(sz(1)) });

  /* --- solid boosters --- */
  function srb(id, name, size, o, tech, cost, desc) {
    def({ id, name, cat: 'engines', size, h: o.len, massDry: o.dry, cost, tech, desc,
      engine: { thrust: o.t * 1000, ispV: o.iv, ispA: o.ia, gimbal: 0, prop: 'solid', srb: true },
      tank: { solid: o.fuel }, crashTol: 7,
      build: () => buildSRB(sz(size) * (o.slim || 1), o.len, o.tip) });
  }
  srb('cricket', 'S-0 “Cricket” Booster', 0, { t: 38, iv: 205, ia: 185, fuel: 320, dry: 90, len: 1.0, slim: 0.9, tip: false }, 'start', 120,
    'A firework with delusions of grandeur. Perfect for sounding rockets.');
  srb('stub', 'S-1 “Stub” Booster', 1, { t: 210, iv: 215, ia: 192, fuel: 2650, dry: 580, len: 1.8, slim: 0.82, tip: false }, 'start', 360,
    'Lights once. Stops when it feels like it. The people\u2019s booster.');
  srb('bison', 'S-2 “Bison” Booster', 1, { t: 640, iv: 222, ia: 198, fuel: 9200, dry: 1700, len: 4.4, tip: true }, 'stability', 850,
    'A long, stubborn shove skyward.');
  srb('anvil', 'S-3 “Anvil” Booster', 2, { t: 1350, iv: 230, ia: 205, fuel: 20500, dry: 3600, len: 5.6, slim: 0.85, tip: true }, 'advRocketry', 2300,
    'Heavy-lift solid. The ground will remember this one.');
  /* --- air-breathing --- */
  def({ id: 'jet', name: 'J-20 “Gale” Turbofan', cat: 'aviation', size: 1, h: 1.4, massDry: 980, cost: 1900, tech: 'aviation',
    engine: { thrust: 95 * 1000, ispV: 1, ispA: 5200, gimbal: 1, prop: 'lf', airBreather: true },
    desc: 'Drinks the sky and turns it into speed. Useless above the clouds.',
    build: () => buildJet(sz(1)) });

  /* --- control --- */
  def({ id: 'rwheel_s', name: 'GyroRing S', cat: 'control', size: 1, h: 0.22, massDry: 60, cost: 450, tech: 'flightControl',
    wheel: { torque: 6 }, desc: 'Spinny discs inside make the whole ship agree with you.',
    build: () => buildReactionWheel(sz(1)) });
  def({ id: 'rwheel_m', name: 'GyroRing M', cat: 'control', size: 2, h: 0.3, massDry: 180, cost: 1300, tech: 'commandModules',
    wheel: { torque: 24 }, desc: 'Industrial-grade attitude adjustment.',
    build: () => buildReactionWheel(sz(2)) });
  def({ id: 'rcs4', name: 'RCS Quad Block', cat: 'control', size: 0, h: 0.2, massDry: 45, cost: 280, tech: 'flightControl',
    rcs: { thrust: 1000 }, radial: true, desc: 'Four polite hisses pointing in useful directions.',
    build: buildRCS });

  /* --- structural --- */
  def({ id: 'dec0', name: 'DC-0 Decoupler', cat: 'structural', size: 0, h: 0.1, massDry: 20, cost: 120, tech: 'start',
    decouple: { v: 2.2 }, desc: 'A tiny controlled goodbye.', build: () => buildDecoupler(sz(0)) });
  def({ id: 'dec1', name: 'DC-1 Decoupler', cat: 'structural', size: 1, h: 0.14, massDry: 50, cost: 220, tech: 'rocketry1',
    decouple: { v: 2.6 }, desc: 'Separates things that used to be friends.', build: () => buildDecoupler(sz(1)) });
  def({ id: 'dec2', name: 'DC-2 Decoupler', cat: 'structural', size: 2, h: 0.18, massDry: 160, cost: 480, tech: 'advRocketry',
    decouple: { v: 3.0 }, desc: 'Big rockets deserve big goodbyes.', build: () => buildDecoupler(sz(2)) });
  def({ id: 'radDec', name: 'RD-Clamp Radial Decoupler', cat: 'structural', size: 0, h: 0.5, massDry: 55, cost: 320, tech: 'stability',
    decouple: { v: 3.4, radial: true }, radial: true, radialNode: true,
    desc: 'Holds a booster. Then, dramatically, does not.',
    build: () => { const g = new THREE.Group(); g.add(box(0.18, 0.5, 0.12, M.darkgray, 0, 0, 0.05)); g.add(box(0.1, 0.34, 0.1, M.orange, 0, 0, 0.13)); return g; } });
  def({ id: 'nose0', name: 'Cone S', cat: 'structural', size: 0, h: 0.56, massDry: 25, cost: 80, tech: 'stability', nose: true,
    desc: 'Pointy end goes up.', build: () => buildCone(sz(0), true) });
  def({ id: 'nose1', name: 'Cone M', cat: 'structural', size: 1, h: 1.1, massDry: 65, cost: 160, tech: 'rocketry1', nose: true,
    desc: 'Aerodynamics appreciates your consideration.', build: () => buildCone(sz(1), true) });
  def({ id: 'nose2', name: 'Cone L', cat: 'structural', size: 2, h: 2.2, massDry: 180, cost: 380, tech: 'structures', nose: true,
    desc: 'A very large pointy hat.', build: () => buildCone(sz(2), false) });
  def({ id: 'adapt21', name: 'Adapter 2.5→1.25', cat: 'structural', size: 2, h: 0.8, massDry: 240, cost: 400, tech: 'structures',
    adapterTop: 1, desc: 'Goes from wide to narrow with quiet dignity.', build: () => buildAdapter(sz(2), sz(1), 0.8) });
  def({ id: 'adapt32', name: 'Adapter 3.75→2.5', cat: 'structural', size: 3, h: 1.0, massDry: 480, cost: 800, tech: 'heavyConstruction',
    adapterTop: 2, desc: 'For when enormous must meet merely huge.', build: () => buildAdapter(sz(3), sz(2), 1.0) });
  def({ id: 'fair1', name: 'Shroud-1 Fairing', cat: 'structural', size: 1, h: 0.14, massDry: 130, cost: 350, tech: 'heavyProp',
    fairing: { r: 0.85, hShell: 3.4 }, desc: 'Hides your payload from the wind and from critics.',
    build: () => buildFairingBase(sz(1), sz(1) * 0.8, 3.4) });
  def({ id: 'fair2', name: 'Shroud-2 Fairing', cat: 'structural', size: 2, h: 0.16, massDry: 320, cost: 800, tech: 'heavyProp',
    fairing: { r: 1.7, hShell: 5.6 }, desc: 'A large opaque dome of plausible deniability.',
    build: () => buildFairingBase(sz(2), sz(2) * 0.8, 5.6) });
  def({ id: 'dockS', name: 'Clamp-Port Junior', cat: 'structural', size: 0, h: 0.18, massDry: 35, cost: 380, tech: 'docking',
    dock: { size: 0 }, desc: 'A petite magnetic handshake for petite spacecraft.',
    build: () => buildDock(sz(0)) });
  def({ id: 'dock1', name: 'Clamp-Port', cat: 'structural', size: 1, h: 0.24, massDry: 80, cost: 600, tech: 'docking',
    dock: { size: 1 }, desc: 'Magnetic handshake hardware. Align, approach slowly, and click.',
    build: () => buildDock(sz(1)) });
  def({ id: 'dock2', name: 'Clamp-Port Senior', cat: 'structural', size: 2, h: 0.3, massDry: 210, cost: 1400, tech: 'docking',
    dock: { size: 2 }, desc: 'Station-grade docking ring for serious orbital construction.',
    build: () => buildDock(sz(2)) });
  def({ id: 'girder', name: 'TR-9 Truss Segment', cat: 'structural', size: 1, h: 1.2, massDry: 90, cost: 280, tech: 'docking',
    desc: 'An open lattice beam. Holds things apart, together.', allowSurfaceChildren: true,
    build: () => buildGirder(sz(1), 1.2) });

  /* --- aero --- */
  def({ id: 'finStatic', name: 'Swept Fin', cat: 'aero', size: 0, h: 0.9, massDry: 35, cost: 90, tech: 'start',
    fin: { area: 0.45, ctrl: 0 }, radial: true, desc: 'Keeps the pointy end forward, free of charge.',
    build: () => buildFin({ w: 0.55, h: 0.9, sweep: 0.35, tip: 0.3 }) });
  def({ id: 'finCtrl', name: 'Vector Fin', cat: 'aero', size: 0, h: 1.0, massDry: 55, cost: 280, tech: 'rocketry2',
    fin: { area: 0.55, ctrl: 1 }, radial: true, desc: 'A fin that listens. Steers you through the soup.',
    build: () => buildFin({ w: 0.6, h: 1.0, sweep: 0.3, tip: 0.25, ctrl: true }) });
  def({ id: 'finBig', name: 'Delta Fin', cat: 'aero', size: 0, h: 1.5, massDry: 110, cost: 380, tech: 'stability',
    fin: { area: 1.3, ctrl: 0 }, radial: true, desc: 'Maximum feathers for heavyweight arrows.',
    build: () => buildFin({ w: 1.0, h: 1.5, sweep: 0.8, tip: 0.5 }) });
  def({ id: 'wingMain', name: 'Albatross Main Wing', cat: 'aviation', size: 0, h: 2.6, massDry: 240, cost: 620, tech: 'aviation',
    fin: { area: 3.2, ctrl: 0, wing: true }, radial: true, desc: 'A proper lifting surface. The sky\u2019s handshake.',
    build: () => buildWing(2.6, 1.5, 0.45) });
  def({ id: 'wingSm', name: 'Kestrel Winglet', cat: 'aviation', size: 0, h: 1.2, massDry: 80, cost: 260, tech: 'aviation',
    fin: { area: 1.0, ctrl: 0, wing: true }, radial: true, desc: 'A smaller helping of lift.',
    build: () => buildWing(1.2, 0.85, 0.55) });
  def({ id: 'elevon', name: 'Elevon Control Surface', cat: 'aviation', size: 0, h: 0.9, massDry: 45, cost: 340, tech: 'aviation',
    fin: { area: 0.6, ctrl: 1.4, wing: true }, radial: true, desc: 'Wiggles with intent. Planes love it.',
    build: () => buildWing(0.9, 0.6, 0.7) });
  def({ id: 'wheel', name: 'RG-1 Rolling Gear', cat: 'aviation', size: 0, h: 0.7, massDry: 60, cost: 420, tech: 'aviation',
    gearWheel: { len: 0.62 }, radial: true, crashTol: 24, desc: 'Round, rubbery, remarkably reusable.',
    build: buildWheel });
  def({ id: 'intake', name: 'Pelican Air Intake', cat: 'aviation', size: 1, h: 0.42, massDry: 50, cost: 280, tech: 'aviation',
    intake: true, desc: 'Feeds the engines a steady diet of atmosphere.', build: () => buildIntake(sz(1)) });

  /* --- utility --- */
  def({ id: 'chuteNose', name: 'Canopy-N Parachute', cat: 'utility', size: 0, h: 0.5, massDry: 100, cost: 320, tech: 'start',
    chute: { areaSemi: 9, areaFull: 300, semiAlt: 3000, fullAlt: 900, maxQ: 18000 }, nose: true,
    desc: 'The single most beloved part in the catalog.',
    build: () => buildChute({ nose: true, d: 0.62, h: 0.5 }) });
  def({ id: 'chuteRad', name: 'Canopy-R Radial Chute', cat: 'utility', size: 0, h: 0.36, massDry: 80, cost: 380, tech: 'recovery',
    chute: { areaSemi: 7, areaFull: 220, semiAlt: 3000, fullAlt: 800, maxQ: 16000 }, radial: true,
    desc: 'Extra flutter for heavier returns.', build: () => buildChute({ nose: false }) });
  def({ id: 'drogue', name: 'Drogue-R Chute', cat: 'utility', size: 0, h: 0.36, massDry: 60, cost: 280, tech: 'recovery',
    chute: { areaSemi: 4, areaFull: 38, semiAlt: 8000, fullAlt: 4000, maxQ: 60000, drogue: true }, radial: true,
    desc: 'Slows you from terrifying to merely alarming.', build: () => buildChute({ nose: false, drogue: true }) });
  def({ id: 'legS', name: 'LT-S Landing Leg', cat: 'utility', size: 0, h: 1.0, massDry: 50, cost: 380, tech: 'landing',
    leg: { len: 1.15 }, radial: true, crashTol: 16, desc: 'A spring, a strut, and a dream of soft touchdowns.',
    build: () => buildLeg(1.15) });
  def({ id: 'legM', name: 'LT-M Landing Leg', cat: 'utility', size: 0, h: 1.6, massDry: 120, cost: 750, tech: 'heavyConstruction',
    leg: { len: 1.8 }, radial: true, crashTol: 18, desc: 'For landers with gravitas.',
    build: () => buildLeg(1.8) });
  def({ id: 'battS', name: 'Cell-100 Battery', cat: 'utility', size: 0, h: 0.12, massDry: 30, cost: 240, tech: 'spaceExploration',
    battery: { charge: 100 }, desc: 'Electrons, neatly stacked.', build: () => buildBattery(sz(0), false) });
  def({ id: 'battM', name: 'Cell-400 Battery', cat: 'utility', size: 1, h: 0.24, massDry: 90, cost: 700, tech: 'electrics',
    battery: { charge: 400 }, desc: 'A bigger bucket of lightning.', build: () => buildBattery(sz(1), true) });
  def({ id: 'solarFix', name: 'PV-Flat Panel', cat: 'utility', size: 0, h: 1.2, massDry: 25, cost: 320, tech: 'spaceExploration',
    solar: { rate: 0.7 }, radial: true, desc: 'Sunlight goes in, ambition comes out.',
    build: () => buildSolar(false) });
  def({ id: 'solarDeploy', name: 'PV-Wing Array', cat: 'utility', size: 0, h: 0.4, massDry: 45, cost: 850, tech: 'electrics',
    solar: { rate: 2.6, deploy: true }, radial: true, desc: 'Unfolds into a magnificent sun-drinking wing.',
    build: () => buildSolar(true) });
  def({ id: 'rtg', name: '“Ember” RTG', cat: 'utility', size: 0, h: 0.5, massDry: 110, cost: 8800, tech: 'ion',
    solar: { rate: 0.8, rtg: true }, desc: 'A warm brick that never sleeps. Do not lick.',
    build: () => { const g = new THREE.Group(); g.add(cyl(0.18, 0.18, 0.5, M.gray, 12)); for (let i = 0; i < 6; i++) { const fin = box(0.04, 0.44, 0.1, M.dark); const a = i / 6 * Math.PI * 2; fin.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); fin.rotation.y = -a; g.add(fin); } return g; } });
  def({ id: 'spotlight', name: 'Beam Spotlight', cat: 'utility', size: 0, h: 0.12, massDry: 15, cost: 90, tech: 'survivability',
    light: true, radial: true, desc: 'For dramatic night landings.', build: buildLight });
  def({ id: 'heat1', name: 'AeroShield 1.25m', cat: 'utility', size: 1, h: 0.3, massDry: 160, cost: 360, tech: 'survivability',
    shield: { ablator: 120 }, tank: { ablator: 120 }, maxTemp: 3400,
    desc: 'Burns so you don\u2019t have to.', build: () => buildShield(sz(1)) });
  def({ id: 'heat2', name: 'AeroShield 2.5m', cat: 'utility', size: 2, h: 0.36, massDry: 440, cost: 900, tech: 'advRocketry',
    shield: { ablator: 300 }, tank: { ablator: 300 }, maxTemp: 3400,
    desc: 'A large slice of not-dying.', build: () => buildShield(sz(2)) });
  def({ id: 'antenna', name: 'Comlink-16 Antenna', cat: 'utility', size: 0, h: 1.0, massDry: 25, cost: 350, tech: 'telemetry',
    antenna: { rate: 1, range: 3e6 }, radial: true, desc: 'Direct line home from local space. Tells Mission Control about your discoveries (and mistakes).',
    build: buildAntenna });
  def({ id: 'dishRelay', name: 'RA-15 “Spiderweb” Relay Dish', cat: 'utility', size: 0, h: 0.7, massDry: 65, cost: 1100, tech: 'relayNet',
    antenna: { rate: 2, range: 6e7, relay: true }, radial: true,
    desc: 'A relay dish that forwards signals for the whole network. Three of these make a constellation.',
    build: () => buildRelayDish(false) });
  def({ id: 'dishDeep', name: 'RA-100 “Lighthouse” Deep Space Dish', cat: 'utility', size: 0, h: 1.2, massDry: 240, cost: 4800, tech: 'deepComms',
    antenna: { rate: 3, range: 5e10, relay: true }, radial: true,
    desc: 'Interplanetary-grade relay. Whispers across the system and the system whispers back.',
    build: () => buildRelayDish(true) });
  def({ id: 'shieldLining', name: '“Storm Cellar” Rad Lining', cat: 'utility', size: 1, h: 0.18, massDry: 220, cost: 950, tech: 'radiationTech',
    radShield: 0.55, desc: 'Dense layered shielding. Cuts radiation dose for everything aboard.',
    build: () => buildShieldLining(sz(1)) });
  def({ id: 'navcam', name: 'AX-0 “Eyeball” Nav Camera', cat: 'utility', size: 0, h: 0.22, massDry: 18, cost: 380, tech: 'telemetry',
    cameraPart: true, radial: true, desc: 'See what your probe sees. Mission Control strongly approves.',
    build: buildNavCam });

  /* --- science --- */
  def({ id: 'thermo', name: 'TH-9 Thermometer', cat: 'science', size: 0, h: 0.32, massDry: 8, cost: 120, tech: 'start',
    science: 'thermo', radial: true, desc: 'Measures how toasty space is. Spoiler: varies.',
    build: () => buildScience('thermo') });
  def({ id: 'filmCam', name: 'FC-1 Film Camera', cat: 'science', size: 0, h: 0.3, massDry: 35, cost: 180, tech: 'start',
    science: 'photo', radial: true, desc: 'Shoots glorious film. Film must come home to be developed.',
    build: buildFilmCam });
  def({ id: 'baro', name: 'BR-2 Barometer', cat: 'science', size: 0, h: 0.16, massDry: 10, cost: 160, tech: 'instruments',
    science: 'baro', radial: true, desc: 'Air pressure enthusiast.', build: () => buildScience('baro') });
  def({ id: 'geiger', name: 'RC-7 RadCounter', cat: 'science', size: 0, h: 0.26, massDry: 14, cost: 320, tech: 'instruments',
    science: 'geiger', radial: true, desc: 'Clicks at invisible danger. Clicks a lot in the belts.',
    build: buildGeiger });
  def({ id: 'bioPod', name: 'BioSample Pod', cat: 'science', size: 0, h: 0.32, massDry: 90, cost: 280, tech: 'rocketry1',
    science: 'bio', radial: true, desc: 'Something green lives inside. It has opinions about g-force.',
    build: () => buildScience('bio') });
  def({ id: 'seismo', name: 'Seismic Sensor', cat: 'science', size: 0, h: 0.2, massDry: 60, cost: 1400, tech: 'surfaceSci',
    science: 'seismo', radial: true, desc: 'Listens to the ground\u2019s gossip.', build: () => buildScience('seismo') });
  def({ id: 'atmos', name: 'Air Analyzer', cat: 'science', size: 0, h: 0.3, massDry: 40, cost: 900, tech: 'surfaceSci',
    science: 'atmos', radial: true, desc: 'Sniffs alien air so you don\u2019t have to.', build: () => buildScience('atmos') });
  def({ id: 'matsci', name: 'MatSci Module', cat: 'science', size: 1, h: 0.95, massDry: 480, cost: 2200, tech: 'instruments',
    science: 'matsci', desc: 'A box of materials having a very bad time, for science.',
    build: () => buildScience('matsci') });
  def({ id: 'telescope', name: 'SG-1 “Stargazer” Telescope', cat: 'science', size: 1, h: 2.2, massDry: 640, cost: 3800, tech: 'opticsLab',
    telescope: true, science: 'scope', desc: 'A flying observatory. Point it at distant worlds and marvel.',
    build: () => buildTelescope(sz(1)) });
  def({ id: 'gravmax', name: 'GX-7 Gravioli Gradiometer', cat: 'science', size: 0, h: 0.3, massDry: 55, cost: 2400, tech: 'advExperiments',
    science: 'grav', radial: true, desc: 'Weighs the invisible. Finds lumps in gravity itself.',
    build: buildGravimeter });
  def({ id: 'cupola', name: 'B-7 “Belvedere” Observation Dome', cat: 'pods', size: 1, h: 1.0, massDry: 1100, cost: 3200, tech: 'advCapsules',
    pod: { crew: 1, torque: 3, charge: 70, mono: 5, supplies: 10 }, science: 'crew', sciBonus: 1.5,
    desc: 'A glass dome with a seat. The best view ever fitted with seatbelts.',
    build: () => buildCupola(sz(1)) });

  /* ---------- stack nodes ---------- */
  for (const id in CATALOG) {
    const p = CATALOG[id];
    if (p.radial && !p.tank && !p.fairing) { p.nodes = p.radialNode ? [{ x: 0, y: 0, z: 0.16, dir: 'radial' }] : []; continue; }
    if (p.id === 'rad_300') { p.nodes = []; continue; }
    const r = SIZES[p.size] / 2;
    const nodes = [];
    if (!p.nose || p.id === 'nose2') nodes.push({ x: 0, y: p.h / 2, z: 0, dir: 'up', size: p.adapterTop !== undefined ? p.adapterTop : p.size });
    if (p.nose) nodes.length = 0;
    if (p.nose) nodes.push({ x: 0, y: -p.h / 2, z: 0, dir: 'down', size: p.size });
    else nodes.push({ x: 0, y: -p.h / 2, z: 0, dir: 'down', size: p.size });
    if (p.cat === 'pods' && p.pod && !nodes.find(n => n.dir === 'up')) nodes.push({ x: 0, y: p.h / 2, z: 0, dir: 'up', size: p.size });
    if (p.radialNode) nodes.push({ x: 0, y: 0, z: 0.18, dir: 'radial' });
    p.nodes = nodes;
  }

  /* surface-attachable flags */
  for (const id in CATALOG) {
    const p = CATALOG[id];
    p.surface = !!p.radial;
    p.allowSurfaceChildren = (p.tank && !p.radial) || p.cat === 'pods' || p.pod !== undefined
      || p.fairing === undefined && p.cat === 'structural' && p.size >= 1 || (p.engine && p.tank)
      || (p.cat === 'aviation' && !p.radial);
    if (p.cat === 'science' && (p.id === 'matsci' || p.id === 'telescope')) p.allowSurfaceChildren = true;
  }

  /* ---------- resources ---------- */
  const RESOURCES = {
    lf: { name: 'Propellant', color: '#a8e34d' },
    solid: { name: 'Solid Fuel', color: '#ffb454' },
    mono: { name: 'Monoprop', color: '#ffd35e' },
    xenon: { name: 'Xenon', color: '#59d8ff' },
    charge: { name: 'Charge', color: '#f8e71c' },
    ablator: { name: 'Ablator', color: '#b9743f' },
    supplies: { name: 'Supplies', color: '#7adfb2' },
  };

  /* ---------- categories ---------- */
  const CATEGORIES = [
    { id: 'pods', icon: '⬡', name: 'Command' },
    { id: 'fuel', icon: '▮', name: 'Fuel Tanks' },
    { id: 'engines', icon: '▲', name: 'Engines' },
    { id: 'control', icon: '◎', name: 'Control' },
    { id: 'structural', icon: '✚', name: 'Structural' },
    { id: 'aero', icon: '◣', name: 'Aerodynamics' },
    { id: 'aviation', icon: '✈', name: 'Aviation' },
    { id: 'utility', icon: '✦', name: 'Utility' },
    { id: 'science', icon: '⚗', name: 'Science' },
  ];

  /* ---------- template cache + builder ---------- */
  const templates = {};
  function build(id) {
    if (!templates[id]) {
      const g = CATALOG[id].build();
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      templates[id] = g;
    }
    const inst = templates[id].clone(true);
    /* clone hot materials so per-instance emissive works */
    inst.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const cloneM = (m) => {
        const c = m.clone();
        c.userData._heatBase = m.emissive ? m.emissive.getHex() : 0;
        c.userData._heatEI = m.emissiveIntensity || 0;
        return c;
      };
      if (Array.isArray(o.material)) o.material = o.material.map(cloneM);
      else o.material = cloneM(o.material);
      if (o.userData.nozzleHot) o.userData.nozzleHotMat = o.material;
    });
    inst.userData.plume = templates[id].userData.plume;
    inst.userData.legLen = templates[id].userData.legLen;
    return inst;
  }

  /* ---------- thumbnails ---------- */
  let thumbRenderer = null, thumbScene = null, thumbCam = null;
  const thumbCache = {};
  function thumbnail(id, size = 128) {
    const key = id + size;
    if (thumbCache[key]) return thumbCache[key];
    if (!thumbRenderer) {
      thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbRenderer.setSize(size, size);
      thumbRenderer.outputEncoding = THREE.sRGBEncoding;
      thumbScene = new THREE.Scene();
      const key1 = new THREE.DirectionalLight(0xffffff, 1.15); key1.position.set(2, 3, 4);
      const key2 = new THREE.DirectionalLight(0x88aaff, 0.4); key2.position.set(-3, -1, -2);
      thumbScene.add(key1, key2, new THREE.AmbientLight(0xffffff, 0.55));
      thumbCam = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    }
    const g = build(id);
    thumbScene.add(g);
    const bb = new THREE.Box3().setFromObject(g);
    const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    const rad = Math.max(s.x, s.y, s.z) * 0.5 || 0.5;
    thumbCam.position.set(c.x + rad * 1.9, c.y + rad * 1.3, c.z + rad * 2.3);
    thumbCam.lookAt(c);
    thumbRenderer.render(thumbScene, thumbCam);
    const url = thumbRenderer.domElement.toDataURL();
    thumbScene.remove(g);
    thumbCache[key] = url;
    return url;
  }

  return { CATALOG, CATEGORIES, RESOURCES, SIZES, build, thumbnail, setChuteLine, M, buildAstronaut, PANEL };
})();
