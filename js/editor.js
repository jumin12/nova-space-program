/* editor.js — Vehicle Assembly Building. Screen: 'editor' */
'use strict';
(() => {
  const { el, V3, clamp } = U;
  const SYMS = [1, 2, 3, 4, 6, 8];

  const ed = {
    scene: null, cam: null, vessel: null, craftGroup: null, meshes: null,
    holding: null,            // {defId} or {fragment: serializedSubtree, defId(root)}
    ghosts: [], nodeMarkers: [],
    symI: 0, camYaw: 0.6, camPitch: 0.12, camDist: 14, camPanY: 3,
    ray: new THREE.Raycaster(), mouse: new THREE.Vector2(-2, -2),
    hoverUid: null, attachPlan: null, dirty: false,

    /* ================= scene ================= */
    ensureScene() {
      if (this.scene) return;
      const s = this.scene = new THREE.Scene();
      s.background = new THREE.Color(0x10161d);
      s.fog = new THREE.Fog(0x10161d, 60, 220);
      this.cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 500);
      const key = new THREE.DirectionalLight(0xfff4e0, 2.0); key.position.set(18, 30, 22);
      key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -25, right: 25, top: 35, bottom: -5, near: 1, far: 100 });
      const fill = new THREE.DirectionalLight(0x9ec2e8, 0.7); fill.position.set(-20, 14, -16);
      s.add(key, fill, new THREE.AmbientLight(0x445566, 0.8), new THREE.HemisphereLight(0x32414f, 0x1c2326, 0.7));
      /* floor */
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 0.3, 64),
        new THREE.MeshStandardMaterial({ color: 0x222a31, roughness: 0.9 }));
      floor.position.y = -0.15; floor.receiveShadow = true;
      s.add(floor);
      const gridTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const x = c.getContext('2d');
        x.fillStyle = '#222a31'; x.fillRect(0, 0, 256, 256);
        x.strokeStyle = 'rgba(120,160,180,0.16)'; x.lineWidth = 2;
        x.strokeRect(0, 0, 256, 256);
        x.strokeStyle = 'rgba(120,160,180,0.06)';
        for (let i = 64; i < 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24);
        return t;
      })();
      const grid = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.85 }));
      grid.rotation.x = -Math.PI / 2; grid.position.y = 0.01;
      s.add(grid);
      /* pad ring marker */
      const ringM = new THREE.Mesh(new THREE.RingGeometry(7.4, 7.8, 64), new THREE.MeshBasicMaterial({ color: 0x3a5a2a }));
      ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.02;
      s.add(ringM);
      /* back wall hint: big gradient panels */
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(14, 70, 0.6),
          new THREE.MeshStandardMaterial({ color: i % 2 ? 0x1a2129 : 0x1d252e, roughness: 0.95 }));
        const a = i / 8 * Math.PI * 2 + 0.4;
        p.position.set(Math.cos(a) * 58, 33, Math.sin(a) * 58);
        p.lookAt(0, 33, 0);
        s.add(p);
      }
      this.ghostMat = new THREE.MeshStandardMaterial({ color: 0x7ad24a, transparent: true, opacity: 0.5, depthWrite: false, emissive: 0x2a5414 });
      this.nodeGeo = new THREE.SphereGeometry(0.12, 12, 10);
      this.nodeMatOpen = new THREE.MeshBasicMaterial({ color: 0x7ad24a, transparent: true, opacity: 0.8, depthTest: false });
      this.nodeMatHot = new THREE.MeshBasicMaterial({ color: 0xffe06a, transparent: true, opacity: 1, depthTest: false });
    },

    /* ================= enter / HUD ================= */
    enter(args) {
      this.ensureScene();
      this.hangar = !!(args && args.hangar);
      this.scene.background = new THREE.Color(this.hangar ? 0x121a16 : 0x10161d);
      if (this.angleSnap === undefined) this.angleSnap = true;
      this.vessel = args.craft ? Vessel.deserialize(args.craft) : new Vessel(this.hangar ? 'Untitled Plane' : 'Untitled Craft');
      this.holding = null; this.attachPlan = null; this.symI = 0;
      this.buildHud();
      this.rebuild();
      this.frameCamera();
      this.bindInput();
      UI.topbar(true);
    },

    buildHud() {
      const hud = document.getElementById('hud-root');
      /* left: parts catalog */
      const partsEl = el('div', '', hud); partsEl.id = 'ed-parts';
      const search = el('input', '', partsEl); search.id = 'ed-search';
      search.placeholder = '🔍 search parts…'; search.spellcheck = false;
      search.onkeydown = e => e.stopPropagation();
      search.oninput = () => this.fillCatalog(this.curCat, search.value.trim().toLowerCase());
      const cats = el('div', '', partsEl); cats.id = 'ed-cats';
      const list = el('div', '', partsEl); list.id = 'ed-partlist';
      const defCat = this.hangar ? 'aviation' : 'pods';
      for (const c of PARTS.CATEGORIES) {
        const b = el('div', 'ed-cat', cats, c.icon);
        b.title = c.name;
        b.onclick = () => { AUDIO.click(); search.value = ''; cats.querySelectorAll('.ed-cat').forEach(x => x.classList.remove('on')); b.classList.add('on'); this.fillCatalog(c.id); };
        if (c.id === defCat) b.classList.add('on');
      }
      this.catalogEl = list;
      this.fillCatalog(defCat);
      /* top: name + actions */
      const top = el('div', '', hud); top.id = 'ed-top';
      top.innerHTML = `<input id="ed-craftname" maxlength="30" spellcheck="false">
        <button class="btn" id="ed-new">NEW</button>
        <button class="btn" id="ed-load">LOAD</button>
        <button class="btn" id="ed-save">SAVE</button>
        <button class="btn acc" id="ed-launch">LAUNCH ▶</button>
        <button class="btn" id="ed-exit">NOVA SPACE CENTER</button>`;
      const nameInput = top.querySelector('#ed-craftname');
      nameInput.value = this.vessel.name;
      nameInput.onchange = () => { this.vessel.name = nameInput.value.trim() || 'Untitled Craft'; };
      nameInput.onkeydown = e => e.stopPropagation();
      top.querySelector('#ed-new').onclick = () => UI.confirm('NEW CRAFT', 'Clear the current build?', () => { this.vessel = new Vessel('Untitled Craft'); nameInput.value = this.vessel.name; this.rebuild(); });
      top.querySelector('#ed-load').onclick = () => this.loadDialog();
      top.querySelector('#ed-save').onclick = () => this.saveCraft(true);
      top.querySelector('#ed-launch').onclick = () => this.launch();
      top.querySelector('#ed-exit').onclick = () => { AUDIO.click(); this.saveCraft(false); GAME.go('sc'); };
      /* symmetry + info */
      const sym = el('div', '', hud); sym.id = 'ed-sym';
      sym.innerHTML = `<div class="sym-badge" id="ed-symbtn">SYMMETRY <span id="ed-symval">1×</span></div>
        <div class="sym-badge" id="ed-snapbtn">SNAP <span id="ed-snapval">${this.angleSnap ? '15°' : 'OFF'}</span></div>
        <div class="sym-badge" style="cursor:default;font-size:12px;color:var(--dim)">X symmetry · S snap · click part to grab · Del to discard</div>`;
      sym.querySelector('#ed-symbtn').onclick = () => this.cycleSym();
      sym.querySelector('#ed-snapbtn').onclick = () => this.toggleSnap();
      /* right: staging */
      const st = el('div', '', hud); st.id = 'ed-stages';
      st.innerHTML = `<div class="ptitle">STAGING<span style="color:var(--dim);font-weight:400;font-size:11px">▲▼ to move</span></div><div id="ed-stagelist"></div>`;
      /* stats */
      const stats = el('div', 'panel', hud); stats.id = 'ed-stats';
      stats.innerHTML = `<div class="ptitle">ENGINEER REPORT</div><div id="ed-statbody"></div>`;
    },

    fillCatalog(catId, query = '') {
      this.curCat = catId;
      this.catalogEl.innerHTML = '';
      for (const id in PARTS.CATALOG) {
        const p = PARTS.CATALOG[id];
        if (p.cat === 'hidden') continue;
        if (query ? !p.name.toLowerCase().includes(query) : p.cat !== catId) continue;
        const unlocked = CAREER.partUnlocked(id);
        const card = el('div', 'ed-part' + (unlocked ? '' : ' locked'), this.catalogEl);
        const img = el('img', '', card);
        img.src = PARTS.thumbnail(id);
        el('div', 'pname', card, p.name);
        UI.bindTip(card, () => this.partTip(p, unlocked));
        if (unlocked) {
          card.onclick = () => { AUDIO.click(); this.startHolding({ defId: id }); };
        }
      }
    },
    partTip(p, unlocked) {
      const rows = [];
      const row = (a, b) => rows.push(`<div class="tt-row"><span>${a}</span><b>${b}</b></div>`);
      row('Mass', U.fmtMass(p.massDry + (p.tank ? Object.values(p.tank).reduce((s, x) => s + x, 0) : 0)));
      row('Cost', U.fmtFunds(p.cost));
      if (p.engine) {
        row('Thrust (vac)', (p.engine.thrust / 1000).toFixed(0) + ' kN');
        row('Isp (vac/asl)', p.engine.ispV + ' / ' + p.engine.ispA + ' s');
        if (p.engine.gimbal) row('Gimbal', p.engine.gimbal + '°');
      }
      if (p.tank && p.tank.lf) row('Propellant', U.fmtMass(p.tank.lf));
      if (p.tank && p.tank.solid) row('Solid fuel', U.fmtMass(p.tank.solid));
      if (p.pod) row('Crew', p.pod.crew);
      if (p.wheel) row('Torque', p.wheel.torque + ' kN·m');
      if (p.chute) row('Chute area', p.chute.areaFull + ' m²');
      if (p.science) row('Experiment', CAREER.EXPS[p.science] ? CAREER.EXPS[p.science].name : p.science);
      if (p.battery) row('Charge', p.battery.charge);
      if (p.solar) row('Charge rate', p.solar.rate + '/s');
      return `<div class="tt-name">${p.name}</div>${rows.join('')}<div class="tt-desc">${p.desc}</div>${unlocked ? '' : '<div style="color:var(--warn)">🔒 Research required</div>'}`;
    },

    /* ================= holding / ghosts ================= */
    startHolding(h) {
      this.clearGhosts();
      this.holding = h;
      this.holdRot = 0; this.holdY = 0;
      const src = h.fragment ? Vessel.deserialize(h.fragment) : null;
      this.holdingGroup = src ? src.buildGroup().group : PARTS.build(h.defId);
      this.applyGhostLook(this.holdingGroup);
      this.craftGroup.add(this.holdingGroup);          // craft-local space
      this.holdingGroup.visible = false;
      this.updateNodeMarkers();
    },
    applyGhostLook(g) {
      g.traverse(o => { if (o.isMesh) { o.material = this.ghostMat; o.castShadow = false; } });
    },
    clearGhosts() {
      if (this.holdingGroup) { this.holdingGroup.removeFromParent(); this.holdingGroup = null; }
      for (const g of this.ghosts) g.removeFromParent();
      this.ghosts = [];
      this.holding = null;
      this.attachPlan = null;
      this.updateNodeMarkers();
    },
    cycleSym() {
      this.symI = (this.symI + 1) % SYMS.length;
      document.getElementById('ed-symval').textContent = SYMS[this.symI] + '×';
      AUDIO.blip(700 + this.symI * 90, 0.05, 0.08);
    },
    toggleSnap() {
      this.angleSnap = !this.angleSnap;
      const v = document.getElementById('ed-snapval');
      if (v) v.textContent = this.angleSnap ? '15°' : 'OFF';
      AUDIO.blip(this.angleSnap ? 920 : 480, 0.05, 0.08);
    },

    /* open stack nodes of the craft */
    openNodes() {
      const out = [];
      if (!this.vessel.root) return out;
      for (const p of this.vessel.parts.values()) {
        p.def.nodes.forEach((n, idx) => {
          if (n.dir === 'radial') {
            const used = p.children.some(c => { const cp = this.vessel.parts.get(c); return cp.attach.type === 'radialNode'; });
            if (!used) out.push({ part: p, idx, n, radial: true });
            return;
          }
          /* occupied? */
          const used = p.children.some(c => {
            const cp = this.vessel.parts.get(c);
            return cp.attach.type === 'node' && cp.attach.pIdx === idx;
          }) || (p.attach.type === 'node' && p.attach.mIdx === idx);
          if (!used) out.push({ part: p, idx, n });
        });
      }
      return out;
    },
    updateNodeMarkers() {
      for (const m of this.nodeMarkers) m.removeFromParent();
      this.nodeMarkers = [];
      if (!this.holding || !this.craftGroup) return;
      const def = PARTS.CATALOG[this.holding.defId];
      const wantsNode = def.nodes.some(n => n.dir === 'up' || n.dir === 'down');
      if (!wantsNode) return;
      for (const o of this.openNodes()) {
        const m = new THREE.Mesh(this.nodeGeo, this.nodeMatOpen);
        const wp = new THREE.Vector3(o.n.x, o.n.y, o.n.z).applyQuaternion(o.part.quat).add(o.part.pos);
        m.position.copy(wp);
        m.renderOrder = 30;
        m.userData.open = o;
        this.craftGroup.add(m);
        this.nodeMarkers.push(m);
      }
    },

    /* compute attach plan from cursor */
    planAttach() {
      this.attachPlan = null;
      if (!this.holding) return;
      const def = PARTS.CATALOG[this.holding.defId];
      const frag = this.holding.fragment || null;
      /* empty craft: place as root at origin */
      if (!this.vessel.root) {
        this.attachPlan = { type: 'root' };
        this.holdingGroup.visible = true;
        const b = fragOrDefBounds(def, frag);
        this.holdingGroup.position.set(0, -b.minY + 0.0, 0);
        this.holdingGroup.quaternion.identity();
        return;
      }
      /* 1) stack node snap (screen-space) */
      let best = null, bestD = 44;
      for (const m of this.nodeMarkers) {
        const sp = m.position.clone().add(this.craftGroup.position).project(this.cam);
        const sx = (sp.x + 1) / 2 * innerWidth, sy = (-sp.y + 1) / 2 * innerHeight;
        const d = Math.hypot(sx - this.mouseX, sy - this.mouseY);
        if (d < bestD) { bestD = d; best = m.userData.open; }
        m.material = this.nodeMatOpen;
      }
      if (best) {
        const o = best;
        if (o.radial) {
          /* radial node (radial decoupler): child hangs parallel */
          this.attachPlan = { type: 'radialNode', parent: o.part.uid, pIdx: o.idx, dy: 0 };
          const pn = o.part.def.nodes[o.idx];
          const out = new THREE.Vector3(0, 0, 1).applyQuaternion(o.part.quat);
          const cr = PARTS.SIZES[def.size] / 2;
          this.holdingGroup.position.copy(new THREE.Vector3(pn.x, pn.y, pn.z).applyQuaternion(o.part.quat).add(o.part.pos)).addScaledVector(out, cr + 0.05);
          this.holdingGroup.quaternion.identity();
          this.holdingGroup.visible = true;
          return;
        }
        const mIdxWanted = o.n.dir === 'down' ? 'up' : 'down';
        const mIdx = def.nodes.findIndex(n => n.dir === mIdxWanted);
        if (mIdx >= 0) {
          this.attachPlan = { type: 'node', parent: o.part.uid, pIdx: o.idx, mIdx };
          /* preview transform */
          const mn = def.nodes[mIdx];
          const pos = new THREE.Vector3(o.n.x, o.n.y, o.n.z).applyQuaternion(o.part.quat).add(o.part.pos)
            .sub(new THREE.Vector3(mn.x, mn.y, mn.z).applyQuaternion(o.part.quat));
          this.holdingGroup.position.copy(pos);
          this.holdingGroup.quaternion.copy(o.part.quat);
          this.holdingGroup.visible = true;
          /* hot highlight */
          for (const m of this.nodeMarkers) if (m.userData.open === o) m.material = this.nodeMatHot;
          return;
        }
      }
      /* 2) surface attach */
      if (def.surface) {
        this.ray.setFromCamera(new THREE.Vector2((this.mouseX / innerWidth) * 2 - 1, -(this.mouseY / innerHeight) * 2 + 1), this.cam);
        const hits = this.ray.intersectObjects(this.craftGroup.children, true);
        for (const h of hits) {
          const uid = h.object.userData.uid;
          if (!uid) continue;
          const parent = this.vessel.parts.get(uid);
          if (!parent || !parent.def.allowSurfaceChildren) break;
          /* local position in parent frame (account for craft group lift) */
          const inv = parent.quat.clone().invert();
          const lp = h.point.clone().sub(this.craftGroup.position).sub(parent.pos).applyQuaternion(inv);
          let angle = Math.atan2(lp.x, lp.z);
          let y = clamp(lp.y, -parent.def.h / 2 + 0.05, parent.def.h / 2 - 0.05);
          if (this.angleSnap) {
            /* 15° angular snap + height quantization for tidy builds */
            const step = Math.PI / 12;
            angle = Math.round(angle / step) * step;
            y = Math.round(y / 0.1) * 0.1;
          }
          /* fine nudge from Q/E (rotate) + R/F (height) while holding */
          angle += this.holdRot || 0;
          y = clamp(y + (this.holdY || 0), -parent.def.h / 2 + 0.05, parent.def.h / 2 - 0.05);
          this.attachPlan = { type: 'surface', parent: uid, angle, y };
          /* preview ghosts with symmetry */
          const n = SYMS[this.symI];
          this.holdingGroup.visible = true;
          this.positionSurfaceGhost(this.holdingGroup, parent, angle, y);
          while (this.ghosts.length < n - 1) {
            const g = this.holdingGroup.clone();
            this.applyGhostLook(g);
            this.craftGroup.add(g);
            this.ghosts.push(g);
          }
          while (this.ghosts.length > n - 1) this.ghosts.pop().removeFromParent();
          for (let i = 0; i < n - 1; i++) {
            this.positionSurfaceGhost(this.ghosts[i], parent, angle + (i + 1) * Math.PI * 2 / n, y);
            this.ghosts[i].visible = true;
          }
          return;
        }
      }
      /* nothing: ghost floats at cursor depth */
      this.ray.setFromCamera(new THREE.Vector2((this.mouseX / innerWidth) * 2 - 1, -(this.mouseY / innerHeight) * 2 + 1), this.cam);
      const pt = this.ray.ray.at(this.camDist * 0.85, new THREE.Vector3());
      this.holdingGroup.position.copy(pt.sub(this.craftGroup.position));
      this.holdingGroup.quaternion.identity();
      this.holdingGroup.visible = true;
      for (const g of this.ghosts) g.visible = false;
    },
    positionSurfaceGhost(g, parent, angle, y) {
      const out = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).applyQuaternion(parent.quat);
      const r = PARTS.SIZES[parent.def.size] / 2;
      g.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle).premultiply(parent.quat);
      g.position.copy(parent.pos).addScaledVector(out, r).add(new THREE.Vector3(0, y, 0).applyQuaternion(parent.quat));
    },

    /* place currently held item */
    place() {
      if (!this.holding || !this.attachPlan) return;
      const plan = this.attachPlan;
      const frag = this.holding.fragment;
      if (frag) {
        this.attachFragment(frag, plan);
      } else {
        const defId = this.holding.defId;
        if (plan.type === 'surface') {
          const n = SYMS[this.symI];
          const symId = n > 1 ? Date.now() % 1e9 : 0;
          for (let i = 0; i < n; i++) {
            this.vessel.addPart(defId, { type: 'surface', parent: plan.parent, angle: plan.angle + i * Math.PI * 2 / n, y: plan.y, symId });
          }
        } else {
          this.vessel.addPart(defId, plan);
        }
      }
      AUDIO.thunk(0.25);
      this.vessel.autoStage();
      this.clearGhosts();
      this.rebuild();
      /* keep building same part if plain part & shift held? simple: stop holding */
    },
    attachFragment(frag, plan) {
      /* re-id and graft the fragment onto the vessel */
      const idMap = new Map();
      const parts = frag.parts;
      for (const p of parts) {
        const newUid = this.vessel.nextUid++;
        idMap.set(p.uid, newUid);
      }
      for (const p of parts) {
        const attach = Object.assign({}, p.attach);
        if (p.uid === frag.root) Object.assign(attach, plan);
        else attach.parent = idMap.get(attach.parent);
        const np = {
          uid: idMap.get(p.uid), id: p.id, def: PARTS.CATALOG[p.id],
          attach, children: [], res: Object.assign({}, p.res), sym: 0,
          pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
        };
        this.vessel.parts.set(np.uid, np);
      }
      for (const p of parts) {
        const np = this.vessel.parts.get(idMap.get(p.uid));
        if (p.uid === frag.root) {
          if (plan.type === 'root') this.vessel.root = np.uid;
          else this.vessel.parts.get(plan.parent).children.push(np.uid);
        } else {
          this.vessel.parts.get(np.attach.parent).children.push(np.uid);
        }
      }
    },

    /* pick up subtree under cursor */
    pickUp(uid, duplicate) {
      const part = this.vessel.parts.get(uid);
      if (!part) return;
      /* grabbing the root = move the whole ship (KSP-style), not a re-attach */
      if (uid === this.vessel.root && !duplicate) {
        this.movingShip = true;
        UI.toast('Moving ship', 'Click to set it down.', '', 1800);
        AUDIO.click();
        return;
      }
      /* grab whole symmetry group? just the one subtree (with its children) */
      const sub = this.vessel.subtreeUids(uid);
      const frag = {
        root: uid,
        parts: sub.map(u => {
          const p = this.vessel.parts.get(u);
          return { uid: u, id: p.id, attach: Object.assign({}, p.attach), res: Object.assign({}, p.res) };
        }),
        name: 'fragment', stages: [], nextUid: 1,
      };
      if (!duplicate) {
        /* remove symmetry siblings too if part of sym group */
        this.vessel.removeSubtree(uid);
        if (part.sym) {
          for (const p of [...this.vessel.parts.values()]) {
            if (p.sym === part.sym) this.vessel.removeSubtree(p.uid);
          }
        }
        this.vessel.autoStage();
        this.rebuild();
      }
      /* holding fragment: deserialize needs a vessel-like shape */
      const fragSer = { name: 'frag', parts: frag.parts, stages: [], root: uid, nextUid: Math.max(...sub) + 1 };
      /* normalize root attach so deserialize works */
      const rp = fragSer.parts.find(p => p.uid === uid);
      rp.attach = { type: 'root' };
      this.startHolding({ defId: part.id, fragment: fragSer });
      AUDIO.click();
    },

    /* ================= rebuild visuals + panels ================= */
    rebuild() {
      if (this.craftGroup) this.scene.remove(this.craftGroup);
      const { group, meshes } = this.vessel.buildGroup();
      this.craftGroup = group; this.meshes = meshes;
      this.scene.add(group);
      /* the ship keeps its position once placed (KSP-style): only the FIRST build
         rests it on the floor — removing parts must not snap it back down */
      if (this.vessel.root) {
        if (!this.craftOffset) {
          const bb = new THREE.Box3().setFromObject(group);
          this.craftOffset = new THREE.Vector3(0, isFinite(bb.min.y) ? -bb.min.y + 0.35 : 0.35, 0);
        }
        group.position.copy(this.craftOffset);
      } else {
        this.craftOffset = null;
      }
      this.updateNodeMarkers();
      this.refreshStages();
      this.refreshStats();
      this.dirty = true;
    },
    refreshStages() {
      const wrap = document.getElementById('ed-stagelist');
      if (!wrap) return;
      wrap.innerHTML = '';
      this.vessel.stages.forEach((stage, si) => {
        const sEl = el('div', 'ed-stage', wrap);
        el('div', 'st-head', sEl, `STAGE ${this.vessel.stages.length - si}`);
        for (const uid of stage) {
          const p = this.vessel.parts.get(uid);
          if (!p) continue;
          const item = el('div', 'ed-sitem', sEl);
          item.innerHTML = `<img src="${PARTS.thumbnail(p.id, 64)}" style="width:22px;height:22px"><span style="flex:1">${p.def.name}</span>
            <span class="mv" data-d="-1">▲</span><span class="mv" data-d="1">▼</span>`;
          item.querySelectorAll('.mv').forEach(mv => {
            mv.onclick = () => { this.vessel.moveStageItem(uid, +mv.dataset.d); this.refreshStages(); this.refreshStats(); };
          });
        }
      });
    },
    refreshStats() {
      const elB = document.getElementById('ed-statbody');
      if (!elB) return;
      const mp = this.vessel.massProps();
      const cost = this.vessel.cost();
      const dv = this.vessel.deltaVReport(CEL.GAIA.g0, 1);
      let html = `
        <div class="row"><span>Parts</span><b>${this.vessel.parts.size}</b></div>
        <div class="row"><span>Mass</span><b>${U.fmtMass(mp.m)}</b></div>
        <div class="row"><span>Cost</span><b>${U.fmtFunds(cost)}</b></div>
        <div class="row"><span>Crew</span><b>${this.vessel.crewCapacity()}</b></div>
        <div class="row" style="border-top:1px solid #1d2a35;margin-top:3px;padding-top:5px"><span>Δv total (vac)</span><b>${dv.reduce((s, x) => s + x.dvV, 0).toFixed(0)} m/s</b></div>`;
      for (const st of dv) {
        if (st.dvV < 1 && st.twr < 0.01) continue;
        html += `<div class="row"><span>S${st.stage} Δv / TWR</span><b>${st.dvV.toFixed(0)} m/s · ${st.twr.toFixed(2)}</b></div>`;
      }
      const warns = [];
      if (!this.vessel.hasControl()) warns.push('No command pod or probe core');
      if (![...this.vessel.parts.values()].some(p => p.def.engine)) warns.push('No engine');
      if (![...this.vessel.parts.values()].some(p => p.def.chute)) warns.push('No parachute');
      if (dv.length && dv[0].twr > 0 && dv[0].twr < 1.02) warns.push('First stage TWR below 1');
      for (const w of warns) html += `<div class="row"><span style="color:var(--warn)">⚠ ${w}</span></div>`;
      elB.innerHTML = html;
    },

    /* ================= save / load / launch ================= */
    saveCraft(toastIt) {
      if (!this.vessel.root) return;
      this.vessel.name = document.getElementById('ed-craftname').value.trim() || 'Untitled Craft';
      GAME.save.crafts[this.vessel.name] = this.vessel.serialize();
      GAME.saveNow();
      if (toastIt) UI.toast('Craft saved', this.vessel.name);
    },
    loadDialog() {
      const body = document.createElement('div');
      const names = Object.keys(GAME.save.crafts);
      if (!names.length) body.innerHTML = '<i style="color:var(--dim)">No saved crafts.</i>';
      for (const n of names) {
        const data = GAME.save.crafts[n];
        const row = el('div', 'track-row', body);
        row.innerHTML = `<div><div class="tr-name">${n}</div><div class="tr-sub">${data.parts.length} parts</div></div>`;
        const btns = el('div', '', row);
        btns.style.cssText = 'display:flex;gap:8px';
        const lb = el('button', 'btn acc', btns, 'LOAD');
        lb.onclick = () => {
          dlg.close();
          this.vessel = Vessel.deserialize(data);
          document.getElementById('ed-craftname').value = this.vessel.name;
          this.clearGhosts();
          this.rebuild();
          this.frameCamera();
        };
        const db = el('button', 'btn danger', btns, '✕');
        db.onclick = () => UI.confirm('DELETE CRAFT', 'Delete "' + n + '"?', () => { delete GAME.save.crafts[n]; GAME.saveNow(); row.remove(); });
      }
      const dlg = UI.dialog({ title: 'LOAD CRAFT', body, buttons: [{ label: 'CANCEL' }] });
    },
    launch() {
      if (!this.vessel.root) { UI.toast('Nothing to launch', 'The pad demands a rocket.', 'warn'); return; }
      if (!this.vessel.hasControl()) { UI.toast('No control', 'Add a command pod or probe core.', 'warn'); return; }
      const locked = [...this.vessel.parts.values()].filter(p => !CAREER.partUnlocked(p.id));
      if (locked.length) { UI.toast('Locked parts', 'Research required: ' + locked[0].def.name, 'warn'); return; }
      const cost = this.vessel.cost();
      if (!GAME.canAfford(cost)) { UI.toast('Insufficient funds', `Launch costs ${U.fmtFunds(cost)}`, 'bad'); return; }
      this.saveCraft(false);
      GAME.spend(cost);
      AUDIO.click();
      GAME.go('flight', { launch: this.vessel.serialize() });
    },

    /* ================= input ================= */
    bindInput() {
      const cv = GAME.renderer.domElement;
      this.mouseX = innerWidth / 2; this.mouseY = innerHeight / 2;
      this._move = e => {
        this.mouseX = e.clientX; this.mouseY = e.clientY;
        if (this.maybeRotate && !this.rotating) {
          if (Math.abs(e.clientX - this.lx) + Math.abs(e.clientY - this.ly) > 5) this.rotating = true;
        }
        if (this.rotating) {
          this.camYaw -= (e.clientX - this.lx) * 0.006;
          this.camPitch = clamp(this.camPitch + (e.clientY - this.ly) * 0.005, -0.5, 1.3);
          this.lx = e.clientX; this.ly = e.clientY;
          this.dragRotated = true;
        }
        if (this.panning) {
          this.camPanY = clamp(this.camPanY + (e.clientY - this.ly) * 0.02 * (this.camDist / 14), -2, 80);
          this.lx = e.clientX; this.ly = e.clientY;
        }
      };
      this._down = e => {
        if (e.target !== cv) return;
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) { this.panning = true; this.lx = e.clientX; this.ly = e.clientY; e.preventDefault(); }
        else if (e.button === 2) { this.rotating = true; this.lx = e.clientX; this.ly = e.clientY; }
        else if (e.button === 0 && !this.holding) {
          /* left-drag on empty space orbits the craft (KSP-style); a clean click still picks */
          this.maybeRotate = true; this.dragRotated = false; this.lx = e.clientX; this.ly = e.clientY;
        }
      };
      this._up = e => { this.rotating = false; this.panning = false; this.maybeRotate = false; };
      this._click = e => {
        if (e.target !== cv) return;
        if (this.dragRotated) { this.dragRotated = false; return; }
        if (this.movingShip) { this.movingShip = false; AUDIO.thunk(0.3); return; }
        if (this.holding) { if (this.attachPlan) this.place(); return; }
        /* pick part */
        this.ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.cam);
        const hits = this.ray.intersectObjects(this.craftGroup ? this.craftGroup.children : [], true);
        for (const h of hits) {
          const uid = h.object.userData.uid;
          if (uid) { this.pickUp(uid, e.altKey); return; }
        }
      };
      this._ctx = e => {
        e.preventDefault();
        if (this.holding && !this.rotDragged) this.clearGhosts();
        this.rotDragged = false;
      };
      this._wheel = e => { if (e.target === cv) this.camDist = clamp(this.camDist * (e.deltaY > 0 ? 1.1 : 0.9), 3, 170); };
      this._key = e => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (e.key === 'x' || e.key === 'X') this.cycleSym();
        if (e.key === 's' || e.key === 'S') this.toggleSnap();
        /* held-part fine controls: Q/E rotate around the hull, R/F slide up/down */
        if (this.holding) {
          const k = e.key.toLowerCase();
          if (k === 'q') { this.holdRot = (this.holdRot || 0) - Math.PI / 24; AUDIO.hover(); }
          if (k === 'e') { this.holdRot = (this.holdRot || 0) + Math.PI / 24; AUDIO.hover(); }
          if (k === 'r') { this.holdY = (this.holdY || 0) + 0.06; AUDIO.hover(); }
          if (k === 'f') { this.holdY = (this.holdY || 0) - 0.06; AUDIO.hover(); }
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.holding) this.clearGhosts();
        if (e.key === 'Escape') {
          if (UI.closeTopDialog()) return;
          if (this.movingShip) { this.movingShip = false; return; }
          if (this.holding) { this.clearGhosts(); return; }
          this.saveCraft(false);
          GAME.go('sc');
        }
      };
      cv.addEventListener('mousedown', this._down);
      addEventListener('mousemove', this._move);
      addEventListener('mouseup', this._up);
      cv.addEventListener('click', this._click);
      cv.addEventListener('contextmenu', this._ctx);
      addEventListener('wheel', this._wheel, { passive: true });
      addEventListener('keydown', this._key);
    },
    frameCamera() {
      const b = this.vessel.root ? this.vessel.bounds() : { minY: 0, maxY: 8, maxR: 2 };
      const h = b.maxY - b.minY;
      this.camDist = clamp(Math.max(h * 1.6, b.maxR * 4, 7), 5, 80);
      this.camPanY = h / 2 + 0.5;
    },

    update(dt) {
      /* camera */
      const cp = this.camPitch, cy = this.camYaw;
      this.cam.position.set(
        Math.cos(cp) * Math.sin(cy) * this.camDist,
        this.camPanY + Math.sin(cp) * this.camDist,
        Math.cos(cp) * Math.cos(cy) * this.camDist);
      this.cam.lookAt(0, this.camPanY, 0);
      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
      /* whole-ship drag */
      if (this.movingShip && this.craftGroup && this.craftOffset) {
        this.ray.setFromCamera(new THREE.Vector2((this.mouseX / innerWidth) * 2 - 1, -(this.mouseY / innerHeight) * 2 + 1), this.cam);
        const dist = this.cam.position.distanceTo(this.craftOffset);
        const pt = this.ray.ray.at(dist, new THREE.Vector3());
        this.craftOffset.set(clamp(pt.x, -45, 45), clamp(pt.y, 0.3, 75), clamp(pt.z, -45, 45));
        this.craftGroup.position.copy(this.craftOffset);
      }
      if (this.holding) this.planAttach();
      /* hover tooltip for parts */
      GAME.renderer.render(this.scene, this.cam);
    },

    toText() {
      const stages = this.vessel.stages.map((s, i) => `S${this.vessel.stages.length - i}:[${s.map(u => { const p = this.vessel.parts.get(u); return p ? p.id : '?'; }).join(',')}]`);
      return {
        craft: this.vessel.name, parts: [...this.vessel.parts.values()].map(p => p.id),
        partCount: this.vessel.parts.size, stages, holding: this.holding ? this.holding.defId : null,
        mass: Math.round(this.vessel.massProps().m), cost: this.vessel.cost(),
        dv: this.vessel.deltaVReport(CEL.GAIA.g0, 1).map(s => Math.round(s.dvV)),
      };
    },

    exit() {
      const cv = GAME.renderer.domElement;
      cv.removeEventListener('mousedown', this._down);
      removeEventListener('mousemove', this._move);
      removeEventListener('mouseup', this._up);
      cv.removeEventListener('click', this._click);
      cv.removeEventListener('contextmenu', this._ctx);
      removeEventListener('wheel', this._wheel);
      removeEventListener('keydown', this._key);
      this.clearGhosts();
    },
  };

  function fragOrDefBounds(def, frag) {
    return { minY: -(def.h || 1) / 2, maxY: (def.h || 1) / 2 };
  }

  GAME.screens.editor = ed;
})();
