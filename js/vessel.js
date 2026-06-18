/* vessel.js — craft model: part tree, layout, mass, staging, fuel feed, Δv. Global: Vessel */
'use strict';
class Vessel {
  constructor(name = 'Untitled Craft') {
    this.name = name;
    this.parts = new Map();
    this.root = null;
    this.stages = [];           // stages[0] = first fired; arrays of uids
    this.nextUid = 1;
  }

  addPart(defId, attach) {
    const def = PARTS.CATALOG[defId];
    const part = {
      uid: this.nextUid++, id: defId, def, attach, children: [],
      res: {}, sym: attach.symId || 0,
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
    };
    if (def.tank) for (const k in def.tank) part.res[k] = def.tank[k];
    if (def.pod) {
      part.res.charge = def.pod.charge;
      part.res.mono = def.pod.mono;
      if (def.pod.supplies) part.res.supplies = def.pod.supplies;
    }
    if (def.probe) part.res.charge = def.probe.charge;
    if (def.battery) part.res.charge = def.battery.charge;
    this.parts.set(part.uid, part);
    if (attach.type === 'root') this.root = part.uid;
    else this.parts.get(attach.parent).children.push(part.uid);
    return part;
  }

  removeSubtree(uid) {
    const removed = [];
    const rec = (u) => {
      const p = this.parts.get(u);
      if (!p) return;
      for (const c of [...p.children]) rec(c);
      removed.push(u);
      this.parts.delete(u);
    };
    const part = this.parts.get(uid);
    if (part && part.attach.parent !== undefined) {
      const par = this.parts.get(part.attach.parent);
      if (par) par.children = par.children.filter(c => c !== uid);
    }
    rec(uid);
    if (uid === this.root) this.root = null;
    for (const s of this.stages) for (let i = s.length - 1; i >= 0; i--) if (removed.includes(s[i])) s.splice(i, 1);
    this.stages = this.stages.filter(s => s.length);
    return removed;
  }

  subtreeUids(uid) {
    const out = [];
    const rec = u => { const p = this.parts.get(u); if (!p) return; out.push(u); for (const c of p.children) rec(c); };
    rec(uid);
    return out;
  }

  /* ---------- layout: compute pos/quat per part ---------- */
  layout() {
    if (!this.root) return;
    const rootP = this.parts.get(this.root);
    rootP.pos.set(0, 0, 0); rootP.quat.identity();
    const visit = (p) => {
      for (const cu of p.children) {
        const c = this.parts.get(cu), a = c.attach;
        if (a.type === 'node') {
          const pn = p.def.nodes[a.pIdx], mn = c.def.nodes[a.mIdx];
          c.quat.copy(p.quat);
          c.pos.set(pn.x, pn.y, pn.z).applyQuaternion(p.quat).add(p.pos)
            .sub(new THREE.Vector3(mn.x, mn.y, mn.z).applyQuaternion(c.quat));
        } else if (a.type === 'surface') {
          const out = new THREE.Vector3(Math.sin(a.angle), 0, Math.cos(a.angle)).applyQuaternion(p.quat);
          const r = PARTS.SIZES[p.def.size] / 2;
          c.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.angle).premultiply(p.quat);
          c.pos.copy(p.pos).addScaledVector(out, r).add(new THREE.Vector3(0, a.y, 0).applyQuaternion(p.quat));
        } else if (a.type === 'radialNode') {
          const pn = p.def.nodes[a.pIdx];
          const out = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat);
          const cr = PARTS.SIZES[c.def.size] / 2;
          c.quat.identity();
          c.pos.set(pn.x, pn.y, pn.z).applyQuaternion(p.quat).add(p.pos).addScaledVector(out, cr + 0.05);
          if (a.dy) c.pos.y += a.dy;
        }
        visit(c);
      }
    };
    visit(rootP);
  }

  /* ---------- mass properties ---------- */
  partMass(p) {
    let m = p.def.massDry;
    for (const k in p.res) if (k !== 'charge') m += p.res[k];
    return m;
  }
  massProps() {
    let m = 0;
    const com = new THREE.Vector3();
    for (const p of this.parts.values()) {
      const pm = this.partMass(p);
      m += pm;
      com.addScaledVector(p.pos, pm);
    }
    if (m > 0) com.divideScalar(m);
    /* diagonal inertia about CoM (vessel frame) */
    let ix = 0, iy = 0, iz = 0;
    for (const p of this.parts.values()) {
      const pm = this.partMass(p);
      const dx = p.pos.x - com.x, dy = p.pos.y - com.y, dz = p.pos.z - com.z;
      const r = PARTS.SIZES[p.def.size] / 2, h = p.def.h || 1;
      const selfPitch = pm * (h * h / 12 + r * r / 4), selfRoll = pm * r * r / 2;
      ix += pm * (dy * dy + dz * dz) + selfPitch;
      iz += pm * (dy * dy + dx * dx) + selfPitch;
      iy += pm * (dx * dx + dz * dz) + selfRoll;
    }
    return { m, com, moi: new THREE.Vector3(Math.max(ix, 50), Math.max(iy, 30), Math.max(iz, 50)) };
  }

  /* ---------- staging ---------- */
  autoStage() {
    /* depth = # of decouplers between part and root */
    const depth = new Map();
    const rec = (uid, d) => {
      const p = this.parts.get(uid);
      depth.set(uid, d);
      for (const c of p.children) {
        const cp = this.parts.get(c);
        rec(c, d + (cp.def.decouple ? 1 : 0));
      }
    };
    if (!this.root) { this.stages = []; return; }
    rec(this.root, 0);
    const buckets = new Map();   // depth → uids (staged parts only)
    let maxD = 0;
    for (const p of this.parts.values()) {
      const staged = p.def.engine || p.def.decouple || p.def.chute || p.def.fairing;
      if (!staged) continue;
      /* a decoupler fires AFTER the stage hanging below it: don't count itself */
      const d = depth.get(p.uid) - (p.def.decouple ? 1 : 0);
      maxD = Math.max(maxD, d);
      if (!buckets.has(d)) buckets.set(d, []);
      buckets.get(d).push(p.uid);
    }
    const stages = [];
    for (let d = maxD; d >= 0; d--) {
      if (!buckets.has(d)) continue;
      const chutes = buckets.get(d).filter(u => this.parts.get(u).def.chute);
      const rest = buckets.get(d).filter(u => !this.parts.get(u).def.chute);
      if (rest.length) stages.push(rest);
      if (chutes.length) {
        if (!stages._chutes) stages._chutes = [];
        stages._chutes.push(...chutes);
      }
    }
    if (stages._chutes) { stages.push(stages._chutes); delete stages._chutes; }
    this.stages = stages.length ? stages : [[]];
  }

  moveStageItem(uid, dir) {
    const si = this.stages.findIndex(s => s.includes(uid));
    if (si < 0) return;
    const ni = si + dir;
    this.stages[si] = this.stages[si].filter(u => u !== uid);
    if (ni < 0) this.stages.unshift([uid]);
    else if (ni >= this.stages.length) this.stages.push([uid]);
    else this.stages[ni].push(uid);
    this.stages = this.stages.filter(s => s.length);
  }

  /* ---------- fuel feed: connected region not crossing blockers ---------- */
  feedTanks(engineUid, resKey) {
    const eng = this.parts.get(engineUid);
    if (resKey === 'solid') return eng.res.solid !== undefined ? [eng] : [];
    const seen = new Set([engineUid]);
    const queue = [engineUid];
    const tanks = [];
    const blocked = def => def.decouple || def.dock || def.shield;
    while (queue.length) {
      const u = queue.shift();
      const p = this.parts.get(u);
      if (!p) continue;
      if (p.res[resKey] !== undefined && !p.def.engine) tanks.push(p);
      const neighbors = [...p.children];
      if (p.attach && p.attach.parent !== undefined) neighbors.push(p.attach.parent);
      for (const n of neighbors) {
        if (seen.has(n)) continue;
        const np = this.parts.get(n);
        if (!np) continue;
        seen.add(n);
        if (!blocked(np.def)) queue.push(n);
        else if (np.res[resKey] !== undefined) tanks.push(np);
      }
    }
    return tanks;
  }

  resourceTotals() {
    const tot = {};
    for (const p of this.parts.values()) {
      for (const k in p.res) {
        if (!tot[k]) tot[k] = { cur: 0, max: 0 };
        tot[k].cur += p.res[k];
        const cap = (p.def.tank && p.def.tank[k])
          || (p.def.pod && (k === 'charge' ? p.def.pod.charge : k === 'supplies' ? p.def.pod.supplies : p.def.pod.mono))
          || (p.def.probe && p.def.probe.charge) || (p.def.battery && p.def.battery.charge) || p.res[k];
        tot[k].max += cap;
      }
    }
    return tot;
  }

  cost() {
    let c = 0;
    for (const p of this.parts.values()) c += p.def.cost;
    return c;
  }
  crewCapacity() {
    let n = 0;
    for (const p of this.parts.values()) if (p.def.pod) n += p.def.pod.crew;
    return n;
  }
  hasControl() {
    for (const p of this.parts.values()) if (p.def.pod || p.def.probe) return true;
    return false;
  }

  /* ---------- Δv / TWR simulation (per display stage) ---------- */
  deltaVReport(g = 9.81, ambientP = 0) {
    const G0 = 9.81;
    /* working copies */
    const res = new Map();
    for (const p of this.parts.values()) res.set(p.uid, Object.assign({}, p.res));
    const alive = new Set(this.parts.keys());
    const active = new Set();
    const report = [];
    const partMass = (uid) => {
      const p = this.parts.get(uid);
      let m = p.def.massDry;
      const r = res.get(uid);
      for (const k in r) if (k !== 'charge') m += r[k];
      return m;
    };
    const totalMass = () => { let m = 0; for (const u of alive) m += partMass(u); return m; };
    const feedOf = (engUid, key) => this.feedTanks(engUid, key).filter(t => alive.has(t.uid));

    for (let si = 0; si < this.stages.length; si++) {
      const stage = this.stages[si];
      /* fire decouplers: drop subtrees not containing root */
      for (const uid of stage) {
        const p = this.parts.get(uid);
        if (!p || !p.def.decouple || !alive.has(uid)) continue;
        const sub = this.subtreeUids(uid).filter(u => alive.has(u));
        if (!sub.includes(this.root)) for (const u of sub) { alive.delete(u); active.delete(u); }
      }
      /* ignite engines */
      for (const uid of stage) {
        const p = this.parts.get(uid);
        if (p && p.def.engine && alive.has(uid)) active.add(uid);
      }
      const m0 = totalMass();
      let dvV = 0, dvA = 0, burn = 0, thrustA0 = 0;
      for (const u of active) {
        const e = this.parts.get(u).def.engine;
        thrustA0 += U.lerp(e.thrust * (e.ispA / e.ispV), e.thrust, 1 - ambientP);
      }
      /* burn loop: piecewise-constant segments until all starved */
      let guard = 0;
      while (guard++ < 40) {
        let thrustV = 0, thrustAsl = 0, mdotTot = 0;
        const drains = [];   // {tankUid, key, rate}
        for (const u of [...active]) {
          const e = this.parts.get(u).def.engine;
          const key = e.prop;
          const feed = feedOf(u, key);
          const avail = feed.reduce((s, t) => s + (res.get(t.uid)[key] || 0), 0);
          if (avail <= 0.01) { active.delete(u); continue; }
          const mdot = e.thrust / (e.ispV * G0);
          mdotTot += mdot;
          thrustV += e.thrust;
          thrustAsl += e.thrust * (e.ispA / e.ispV);
          const per = mdot / feed.length;
          for (const t of feed) drains.push({ uid: t.uid, key, rate: per });
        }
        if (!active.size || mdotTot <= 0) break;
        /* time until first tank empties */
        const tankRate = new Map();
        for (const d of drains) tankRate.set(d.uid + d.key, (tankRate.get(d.uid + d.key) || 0) + d.rate);
        let dt = Infinity;
        for (const d of drains) {
          const amt = res.get(d.uid)[d.key] || 0;
          const rate = tankRate.get(d.uid + d.key);
          if (rate > 0) dt = Math.min(dt, amt / rate);
        }
        if (!isFinite(dt) || dt <= 0) break;
        dt = Math.min(dt, 3600);
        const mStart = totalMass();
        const dm = mdotTot * dt;
        const mEnd = Math.max(mStart - dm, 1);
        const veV = thrustV / mdotTot, veA = thrustAsl / mdotTot;
        dvV += veV * Math.log(mStart / mEnd);
        dvA += veA * Math.log(mStart / mEnd);
        burn += dt;
        for (const d of drains) {
          const r = res.get(d.uid);
          r[d.key] = Math.max(0, (r[d.key] || 0) - d.rate * dt);
        }
      }
      report.push({ stage: this.stages.length - si, dvV, dvA, burn, m0, twr: thrustA0 / (m0 * g) });
    }
    return report;
  }

  /* ---------- serialization ---------- */
  serialize() {
    const parts = [];
    for (const p of this.parts.values()) {
      parts.push({ uid: p.uid, id: p.id, attach: Object.assign({}, p.attach), res: Object.assign({}, p.res) });
    }
    return { name: this.name, parts, stages: this.stages.map(s => [...s]), root: this.root, nextUid: this.nextUid };
  }
  static deserialize(data) {
    const v = new Vessel(data.name);
    v.nextUid = 1;
    /* insert in dependency order: parents before children */
    const pending = [...data.parts];
    const placed = new Set();
    let guard = 0;
    while (pending.length && guard++ < 10000) {
      const p = pending.shift();
      if (p.attach.type !== 'root' && !placed.has(p.attach.parent)) { pending.push(p); continue; }
      v.nextUid = p.uid;
      const np = v.addPart(p.id, p.attach);
      np.res = Object.assign({}, p.res);
      placed.add(p.uid);
    }
    v.nextUid = data.nextUid || (Math.max(0, ...placed) + 1);
    v.root = data.root;
    v.stages = (data.stages || []).map(s => [...s]);
    v.layout();
    return v;
  }

  /* ---------- 3D group ---------- */
  buildGroup() {
    this.layout();
    const group = new THREE.Group();
    const meshes = new Map();
    for (const p of this.parts.values()) {
      const g = PARTS.build(p.id);
      g.position.copy(p.pos);
      g.quaternion.copy(p.quat);
      g.userData.uid = p.uid;
      g.traverse(o => { o.userData.uid = p.uid; });
      group.add(g);
      meshes.set(p.uid, g);
    }
    return { group, meshes };
  }

  /* bounds in vessel frame */
  bounds() {
    let minY = Infinity, maxY = -Infinity, maxR = 0;
    for (const p of this.parts.values()) {
      const h = p.def.h || 0.5, r = PARTS.SIZES[p.def.size] / 2;
      minY = Math.min(minY, p.pos.y - h / 2 - (p.def.engine && !p.def.tank ? 0.4 : 0));
      maxY = Math.max(maxY, p.pos.y + h / 2);
      maxR = Math.max(maxR, Math.hypot(p.pos.x, p.pos.z) + r);
    }
    if (!isFinite(minY)) { minY = 0; maxY = 0; }
    return { minY, maxY, maxR };
  }
}

/* re-root a vessel's part tree at newRootUid (needed to graft a docked vessel).
   Only node-type attachments along the path can be flipped. Returns true on success. */
Vessel.prototype.reRoot = function (newRootUid) {
  if (this.root === newRootUid) return true;
  /* path from newRoot up to current root */
  const path = [];
  let u = newRootUid;
  let guard = 0;
  while (u !== this.root && guard++ < 1000) {
    const p = this.parts.get(u);
    if (!p || p.attach.parent === undefined) return false;
    path.push(u);
    u = p.attach.parent;
  }
  if (u !== this.root) return false;
  for (const hop of path) {
    const c = this.parts.get(hop);
    if (c.attach.type !== 'node') return false;     // can't flip surface attachments
  }
  /* flip each hop: child becomes parent of its former parent */
  for (const hop of path) {
    const c = this.parts.get(hop);
    const pUid = c.attach.parent;
    const p = this.parts.get(pUid);
    const a = c.attach;
    /* remove c from p.children */
    p.children = p.children.filter(x => x !== hop);
    /* p attaches to c with swapped node roles */
    p.attach = { type: 'node', parent: hop, pIdx: a.mIdx, mIdx: a.pIdx };
    c.children.push(pUid);
  }
  const newRoot = this.parts.get(newRootUid);
  newRoot.attach = { type: 'root' };
  this.root = newRootUid;
  this.layout();
  return true;
};

/* free (unoccupied) stack node index of a part — the docking face */
Vessel.prototype.freeNodeIdx = function (uid) {
  const p = this.parts.get(uid);
  if (!p) return -1;
  const used = new Set();
  if (p.attach && p.attach.type === 'node' && p.attach.mIdx !== undefined) used.add(p.attach.mIdx);
  for (const cu of p.children) {
    const c = this.parts.get(cu);
    if (c && c.attach.type === 'node' && c.attach.pIdx !== undefined) used.add(c.attach.pIdx);
  }
  for (let i = 0; i < p.def.nodes.length; i++) {
    if (p.def.nodes[i].dir !== 'radial' && !used.has(i)) return i;
  }
  return -1;
};

/* graft another (re-rooted) vessel onto myDockUid's free node; returns map of old→new uids */
Vessel.prototype.graft = function (myDockUid, other) {
  const myIdx = this.freeNodeIdx(myDockUid);
  const theirRootIdx = other.freeNodeIdx(other.root);
  if (myIdx < 0 || theirRootIdx < 0) return null;
  const map = new Map();
  /* BFS from their root so parents always exist before children */
  const queue = [other.root];
  while (queue.length) {
    const u = queue.shift();
    const p = other.parts.get(u);
    let attach;
    if (u === other.root) {
      attach = { type: 'node', parent: myDockUid, pIdx: myIdx, mIdx: theirRootIdx };
    } else {
      attach = Object.assign({}, p.attach);
      attach.parent = map.get(p.attach.parent);
    }
    const np = this.addPart(p.id, attach);
    np.res = Object.assign({}, p.res);
    map.set(u, np.uid);
    for (const cu of p.children) queue.push(cu);
  }
  this.layout();
  return map;
};

/* crew name generator */
Vessel.genCrew = (rng, n) => {
  const first = ['Ada', 'Buzz', 'Cleo', 'Dex', 'Ela', 'Fitz', 'Gus', 'Hala', 'Iggy', 'Juno', 'Kip', 'Lyra', 'Moss', 'Nia', 'Otto', 'Pria', 'Quill', 'Rex', 'Sage', 'Tova', 'Ursa', 'Vex', 'Wren', 'Xeno', 'Yuri', 'Zara'];
  const last = ['Stardust', 'Boltwell', 'Comettail', 'Dustfield', 'Emberlight', 'Gravwell', 'Hotstage', 'Ionfeather', 'Jetson', 'Kilonova', 'Lofthrottle', 'Moonford', 'Novari', 'Orbitson', 'Padlock', 'Quasarian', 'Rocketham', 'Skyworth', 'Thrustfield', 'Vectorman', 'Warpwhistle'];
  const crew = [];
  for (let i = 0; i < n; i++) crew.push(first[(rng() * first.length) | 0] + ' ' + last[(rng() * last.length) | 0]);
  return crew;
};
