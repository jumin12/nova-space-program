/* mapview.js — orbital map, maneuver nodes, encounters. Global: MAPVIEW */
'use strict';
const MAPVIEW = (() => {
  const { el, clamp } = U;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

  const M = {
    scene: null, cam: null, focus: 'vessel', camYaw: 0.8, camPitch: 0.55, camDist: 4e6,
    lines: {}, dots: {}, labels: {}, meshes: {},
    node: null, encCache: { t: -1 },

    ensure(fl) {
      if (this.scene) return;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x03060a);
      this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 100, 1e13);
      this.stars = new PG.Stars(this.scene, 4000);
      this.scene.add(new THREE.AmbientLight(0x96a8c8, 0.38));
      const sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
      this.scene.add(sun);
      this.sunL = sun;
      this.belt = new PG.Belt(this.scene);
      /* bodies: textured globe + halo + dot + label + orbit line */
      for (const b of CEL.list) {
        const grp = new THREE.Group();
        const col = this.bodyColor(b);
        const baked = PG.bakeBodyTexture(b);
        let mat;
        if (b.star) mat = new THREE.MeshBasicMaterial({ map: baked.map });
        else mat = PG.bodyGlobeMaterial(baked, 0.22);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.R, 72, 48), mat);
        grp.add(mesh);
        if (b.ring) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(b.R * b.ring.r0, b.R * b.ring.r1, 96),
            new THREE.MeshBasicMaterial({ color: 0x9db5aa, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
          ring.rotation.x = Math.PI / 2;
          grp.add(ring);
        }
        /* soft atmosphere halo */
        if (b.atmo) {
          const gc = b.atmo.glowCol;
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: PG.glowTex([[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0)'], [0.6, `rgba(${gc[0] * 255 | 0},${gc[1] * 255 | 0},${gc[2] * 255 | 0},0.3)`], [0.68, `rgba(${gc[0] * 255 | 0},${gc[1] * 255 | 0},${gc[2] * 255 | 0},0.08)`], [1, 'rgba(0,0,0,0)']], 128),
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
          }));
          halo.scale.setScalar(b.R * 2.05);
          grp.add(halo);
        }
        if (b.star) {
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: PG.glowTex([[0, 'rgba(255,245,210,1)'], [0.3, 'rgba(255,225,150,0.4)'], [1, 'rgba(255,200,110,0)']], 128),
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
          }));
          glow.scale.setScalar(b.R * 4.5);
          grp.add(glow);
        }
        const dot = new THREE.Sprite(new THREE.SpriteMaterial({
          map: PG.glowTex([[0, this.hex(col)], [0.45, this.hex(col) + 'dd'], [1, this.hex(col) + '00']], 32),
          transparent: true, depthTest: false, depthWrite: false,
        }));
        dot.renderOrder = 20;
        grp.add(dot);
        const label = U.textSprite(b.name, { size: 42, color: '#cfe3ee' });
        label.renderOrder = 21;
        label.material.opacity = 0.85;
        grp.add(label);
        let cloudLayers = [];
        if (b.atmo && !b.gas && !b.star && PG.attachCloudLayers) {
          cloudLayers = PG.attachCloudLayers(b, grp);
          const mapOps = PG.MAP_CLOUD_OPS || [1.18, 0.68, 0.58];
          for (let ci = 0; ci < cloudLayers.length; ci++) cloudLayers[ci].mat.userData.u.opacity.value = mapOps[ci] ?? cloudLayers[ci].baseOp;
        }
        /* radiation belt overlay (map mode) */
        const radBelts = [];
        if (CEL.RAD_CFG[b.id]) {
          for (const belt of CEL.RAD_CFG[b.id].belts) {
            const major = (belt.r0 + belt.r1) / 2 * b.R;
            const tube = Math.max((belt.r1 - belt.r0) / 2 * b.R, b.R * 0.08) * 0.9;
            const hot = U.clamp(belt.str / 13, 0, 1);
            const colR = new THREE.Color().setHSL(0.34 - hot * 0.34, 1.0, 0.55);
            const torus = new THREE.Mesh(new THREE.TorusGeometry(major, tube, 14, 56),
              new THREE.MeshBasicMaterial({ color: colR, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
            torus.rotation.x = Math.PI / 2;
            torus.visible = false;
            grp.add(torus);
            radBelts.push(torus);
          }
        }
        this.scene.add(grp);
        this.meshes[b.id] = { grp, mesh, dot, label, radBelts, cloudLayers };
        if (b.el) {
          const pts = ORB.orbitPoints(b.el, 256);
          const g = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.3 }));
          this.scene.add(line);
          this.lines[b.id] = line;
        }
      }
      /* vessel marker + orbit */
      this.vMark = new THREE.Sprite(new THREE.SpriteMaterial({
        map: PG.glowTex([[0, '#d8ffb0'], [0.35, '#a8e34dcc'], [1, '#a8e34d00']], 32),
        transparent: true, depthTest: false,
      }));
      this.vMark.renderOrder = 25;
      this.scene.add(this.vMark);
      this.vLabel = U.textSprite('—', { size: 38, color: '#c9f24b' });
      this.vLabel.renderOrder = 25;
      this.scene.add(this.vLabel);
      const vGeo = new THREE.BufferGeometry();
      vGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(420 * 3), 3));
      this.vLine = new THREE.LineLoop(vGeo, new THREE.LineBasicMaterial({ color: 0xa8e34d, transparent: true, opacity: 0.95 }));
      this.vLine.frustumCulled = false;
      this.scene.add(this.vLine);
      /* predicted (maneuver) orbit */
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(420 * 3), 3));
      this.pLine = new THREE.Line(pGeo, new THREE.LineBasicMaterial({ color: 0x59d8ff, transparent: true, opacity: 0.95 }));
      this.pLine.frustumCulled = false;
      this.pLine.visible = false;
      this.scene.add(this.pLine);
      /* encounter patch */
      const eGeo = new THREE.BufferGeometry();
      eGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(220 * 3), 3));
      this.eLine = new THREE.Line(eGeo, new THREE.LineBasicMaterial({ color: 0xd670e8, transparent: true, opacity: 0.95 }));
      this.eLine.frustumCulled = false;
      this.eLine.visible = false;
      this.scene.add(this.eLine);
      /* ap/pe markers */
      this.apM = this.markerSprite('Ap', '#59d8ff');
      this.peM = this.markerSprite('Pe', '#a8e34d');
      this.nodeM = this.markerSprite('◆', '#59a6ff');
      this.encM = this.markerSprite('Enc', '#d670e8');
      /* comm-link line pool (mode: comm) */
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 2 * 3), 3));
      cg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(120 * 2 * 3), 3));
      this.commLines = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
      this.commLines.frustumCulled = false;
      this.commLines.visible = false;
      this.scene.add(this.commLines);
      this.commMarks = [];
      this.mode = 'orbit';
    },
    setMode(m) {
      this.mode = m;
      AUDIO.click();
      for (const id in this.meshes) for (const t of this.meshes[id].radBelts || []) t.visible = m === 'rad';
      this.commLines.visible = m === 'comm';
      const debris = m === 'debris';
      for (const fm of this.fleetMarks || []) {
        fm.mark.visible = !debris;
        fm.label.visible = !debris;
      }
      for (const dm of this.debrisMarks || []) {
        dm.mark.visible = debris;
        dm.label.visible = debris;
      }
      for (const l of this.fleetLines || []) if (l) l.visible = !debris && l.visible;
      document.querySelectorAll('.map-mode').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    },
    modeBarHtml() {
      return `<div id="map-modes">
        <div class="map-mode on" data-m="orbit">ORBITS</div>
        <div class="map-mode" data-m="debris">DEBRIS</div>
        <div class="map-mode" data-m="comm">COMM NET</div>
        <div class="map-mode" data-m="rad">RADIATION</div></div>`;
    },
    bindModeBar(rootEl) {
      rootEl.querySelectorAll('.map-mode').forEach(b => b.onclick = () => this.setMode(b.dataset.m));
      this.setMode(this.mode || 'orbit');
    },
    updateCommLines(t, fAbs, fl) {
      if (this.mode !== 'comm') return;
      const net = COMMS.evaluate(t, fl);
      const pos = this.commLines.geometry.attributes.position;
      const col = this.commLines.geometry.attributes.color;
      const n = Math.min(net.links.length, 120);
      for (let i = 0; i < n; i++) {
        const L = net.links[i];
        pos.setXYZ(i * 2, L.a.pos.x - fAbs.x, L.a.pos.y - fAbs.y, L.a.pos.z - fAbs.z);
        pos.setXYZ(i * 2 + 1, L.b.pos.x - fAbs.x, L.b.pos.y - fAbs.y, L.b.pos.z - fAbs.z);
        const c = new THREE.Color().setHSL(0.33 * L.strength, 0.95, 0.5 + L.strength * 0.12);
        col.setXYZ(i * 2, c.r, c.g, c.b);
        col.setXYZ(i * 2 + 1, c.r, c.g, c.b);
      }
      for (let i = n; i < 120; i++) { pos.setXYZ(i * 2, 0, 0, 0); pos.setXYZ(i * 2 + 1, 0, 0, 0); }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      this.commLines.geometry.computeBoundingSphere();
    },
    markerSprite(txt, color) {
      const sp = U.textSprite(txt, { size: 34, color, bg: 'rgba(10,16,22,0.7)' });
      sp.renderOrder = 26;
      sp.visible = false;
      this.scene.add(sp);
      return sp;
    },
    bodyColor(b) {
      const map = { solara: 0xffe9a8, cinder: 0x9a6a4a, vesper: 0x9a5ac8, gaia: 0x4a9ad8, selene: 0x9a9a9a, frost: 0xbef2dc, rust: 0xd86a3a, shard: 0x8a8a88, grit: 0x8a8478, goliath: 0x4ac8a0, aqua: 0x5a9ad8, tundra: 0xa8c8e0, crag: 0xb0a890, pebble: 0xa07a50, plume: 0xd8c878, wanderer: 0xe8e8ea };
      return map[b.id] || 0x888888;
    },
    hex(c) { return '#' + c.toString(16).padStart(6, '0'); },

    /* shared per-frame body positioning (flight map + tracking station) */
    updateBodies(t, fAbs) {
      const sunW = ORB.bodyAbsPos(CEL.SUN, t, _a);
      for (const b of CEL.list) {
        const m = this.meshes[b.id];
        const pos = ORB.bodyAbsPos(b, t, _b).sub(fAbs);
        m.grp.position.copy(pos);
        m.mesh.rotation.y = CEL.spinAngle(b, t);
        if (m.cloudLayers && m.cloudLayers.length) {
          const sunDir = sunW.clone().sub(pos).normalize();
          const viewN = this.cam.position.clone().sub(pos).normalize();
          const spin = CEL.spinAngle(b, t);
          for (let ci = 0; ci < m.cloudLayers.length; ci++) {
            const cl = m.cloudLayers[ci];
            const sign = ci % 2 ? -1 : 1;
            cl.mesh.rotation.y = spin * (1.04 + ci * 0.05) * sign + ci * 0.4;
            cl.mat.userData.u.sun.value.copy(sunDir);
            cl.mat.userData.u.view.value.copy(viewN);
            if (cl.mat.userData.u.center) cl.mat.userData.u.center.value.copy(pos);
            const ops = PG.MAP_CLOUD_OPS || [1.18, 0.68, 0.58];
            cl.mat.userData.u.opacity.value = ops[ci] || cl.baseOp;
          }
        }
        const dist = Math.max(pos.distanceTo(this.cam.position), 1);
        const ang = b.R / dist;
        m.dot.scale.setScalar(dist * 0.009);
        m.dot.material.opacity = clamp((0.003 - ang) * 500, 0, 0.75);
        m.mesh.visible = ang > 0.0018;
        m.label.scale.set(dist * 0.035 * m.label.userData.aspect, dist * 0.035, 1);
        m.label.position.set(0, Math.max(b.R * 1.4, dist * 0.02), 0);
        m.label.material.opacity = this.focus === b.id ? 1 : clamp(1.2 - ang * 200, 0.25, 0.85);
        if (b.el) {
          const par = ORB.bodyAbsPos(b.parentB, t, _b).sub(fAbs);
          this.lines[b.id].position.copy(par);
        }
      }
      const solPos = ORB.bodyAbsPos(CEL.SUN, t, _a).sub(fAbs);
      this.belt.update(solPos, t);
      this.sunL.position.copy(solPos).normalize().multiplyScalar(10);
      if (this.sunL.position.lengthSq() < 1) this.sunL.position.set(1, 1, 1);
    },

    /* free orbital camera (independent of the flight camera) */
    bindCam() {
      const cv = GAME.renderer.domElement;
      this._mDown = e => { if (e.button === 0 || e.button === 2) { this.camDragging = true; this.camMoved = false; this._mx = e.clientX; this._my = e.clientY; } };
      this._mMove = e => {
        if (!this.camDragging) return;
        const dx = e.clientX - this._mx, dy = e.clientY - this._my;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.camMoved = true;
        this.camYaw -= dx * 0.006;
        this.camPitch = clamp(this.camPitch + dy * 0.005, -1.45, 1.45);
        this._mx = e.clientX; this._my = e.clientY;
      };
      this._mUp = () => { this.camDragging = false; };
      cv.addEventListener('mousedown', this._mDown);
      addEventListener('mousemove', this._mMove);
      addEventListener('mouseup', this._mUp);
    },
    unbindCam() {
      const cv = GAME.renderer.domElement;
      cv.removeEventListener('mousedown', this._mDown);
      removeEventListener('mousemove', this._mMove);
      removeEventListener('mouseup', this._mUp);
    },

    /* ============ standalone mode (tracking station) ============ */
    openStandalone() {
      this.ensure(null);
      this.focus = 'gaia';
      this.camDist = CEL.GAIA.R * 2.6;
      const t = GAME.ut;
      const pad = CEL.bfToInertial(CEL.GAIA, CEL.sitePadBf(CEL.KSC.lat, CEL.KSC.lon, _a), t, _b).normalize();
      this.camYaw = Math.atan2(pad.x, pad.z);
      this.camPitch = U.clamp(Math.asin(pad.y) * 0.55 + 0.2, 0.12, 1.1);
      this.standalone = true;
      this.bindCam();
      this._sClick = e => { if (!this.camMoved) this.onClickStandalone(e); };
      GAME.renderer.domElement.addEventListener('click', this._sClick);
      this._sWheel = e => { this.camDist = clamp(this.camDist * (e.deltaY > 0 ? 1.18 : 0.85), 4e5, 5e11); };
      addEventListener('wheel', this._sWheel, { passive: true });
      /* markers for saved flights */
      this.fleetMarks = [];
      for (const f of GAME.save.flights) {
        const mark = new THREE.Sprite(new THREE.SpriteMaterial({
          map: PG.glowTex([[0, '#d8ffb0'], [0.35, '#7adfffcc'], [1, '#7adfff00']], 32),
          transparent: true, depthTest: false,
        }));
        mark.renderOrder = 25;
        const label = U.textSprite(f.name, { size: 34, color: '#9adfff' });
        label.renderOrder = 25;
        this.scene.add(mark, label);
        this.fleetMarks.push({ f, mark, label });
      }
      /* markers for recovered debris */
      this.debrisMarks = [];
      for (const d of (GAME.save.debris || [])) {
        const mark = new THREE.Sprite(new THREE.SpriteMaterial({
          map: PG.glowTex([[0, '#ffb878'], [0.35, '#ff9a4acc'], [1, '#ff9a4a00']], 32),
          transparent: true, depthTest: false,
        }));
        mark.renderOrder = 25;
        mark.visible = false;
        const label = U.textSprite(d.name, { size: 32, color: '#ffb878' });
        label.renderOrder = 25;
        label.visible = false;
        this.scene.add(mark, label);
        this.debrisMarks.push({ d, mark, label });
      }
      /* orbit line pool for fleet */
      this.fleetLines = [];
      this.facilityMark = new THREE.Sprite(new THREE.SpriteMaterial({
        map: PG.glowTex([[0, '#9ae8ff'], [0.2, '#59c8ff'], [0.45, '#59a6ffaa'], [1, '#59a6ff00']], 64),
        transparent: true, depthTest: false, blending: THREE.AdditiveBlending,
      }));
      this.facilityMark.renderOrder = 24;
      this.facilityRing = new THREE.Sprite(new THREE.SpriteMaterial({
        map: PG.glowTex([[0, 'rgba(89,200,255,0)'], [0.55, 'rgba(89,200,255,0.35)'], [0.72, 'rgba(122,232,255,0.12)'], [1, 'rgba(89,200,255,0)']], 96),
        transparent: true, depthTest: false, blending: THREE.AdditiveBlending,
      }));
      this.facilityRing.renderOrder = 23;
      this.facilityLabel = U.textSprite(
        ((GAME.save.agency && GAME.save.agency.name) || 'NOVA SPACE CENTER') + ' · LC',
        { size: 38, color: '#b8ecff', bg: 'rgba(6,14,22,0.72)' });
      this.facilityLabel.renderOrder = 24;
      this.focusRing = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1.02, 72),
        new THREE.MeshBasicMaterial({ color: 0x59d8ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.focusRing.visible = false;
      this.focusRing.renderOrder = 8;
      this.scene.add(this.facilityMark, this.facilityRing, this.facilityLabel, this.focusRing);
      if (!this.facilityGrp && GAME.buildKSC && this.meshes.gaia) {
        this.facilityGrp = GAME.buildKSC();
        const bf = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon, _a);
        this.facilityGrp.position.copy(bf);
        this.facilityGrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bf.clone().normalize());
        this.facilityGrp.visible = false;
        this.meshes.gaia.grp.add(this.facilityGrp);
      } else if (this.facilityGrp) this.facilityGrp.visible = false;
    },
    closeStandalone() {
      this.standalone = false;
      this.unbindCam();
      GAME.renderer.domElement.removeEventListener('click', this._sClick);
      removeEventListener('wheel', this._sWheel);
      for (const fm of this.fleetMarks || []) { this.scene.remove(fm.mark); this.scene.remove(fm.label); }
      for (const dm of this.debrisMarks || []) { this.scene.remove(dm.mark); this.scene.remove(dm.label); }
      for (const l of this.fleetLines || []) this.scene.remove(l);
      if (this.facilityMark) {
        this.scene.remove(this.facilityMark); this.scene.remove(this.facilityRing);
        this.scene.remove(this.facilityLabel); this.scene.remove(this.focusRing);
      }
      if (this.remoteSiteMarks) {
        for (const rm of this.remoteSiteMarks) {
          this.scene.remove(rm.mark, rm.ring, rm.label);
          if (rm.grp && rm.grp.parent) rm.grp.parent.remove(rm.grp);
        }
      }
      if (this.facilityGrp) this.facilityGrp.visible = false;
      this.fleetMarks = []; this.fleetLines = [];
      this.debrisMarks = [];
      this.remoteSiteMarks = null;
    },
    onClickStandalone(e) {
      const t = GAME.ut;
      const fAbs = ORB.bodyAbsPos(CEL.B[this.focus] ? CEL.B[this.focus] : CEL.GAIA, t, _a);
      for (const b of CEL.list) {
        const sp = ORB.bodyAbsPos(b, t, _b).sub(fAbs).project(this.cam);
        if (sp.z > 1) continue;
        const sx = (sp.x + 1) / 2 * innerWidth, sy = (-sp.y + 1) / 2 * innerHeight;
        if (Math.hypot(sx - e.clientX, sy - e.clientY) < 22) {
          this.focus = b.id;
          this.camDist = Math.max(b.R * 6, Math.min(this.camDist, b.soi || b.R * 100));
          AUDIO.click();
          return;
        }
      }
    },
    flightWorldPos(f, t, out) {
      const body = CEL.B[f.bodyId];
      if (f.landed && f.landedPos) {
        const bf = new THREE.Vector3().fromArray(f.landedPos);
        CEL.bfToInertial(body, bf, t, out);
      } else {
        const els = this.flightElems(f, t);
        if (!els) { out.set(0, 0, 0); return out.add(ORB.bodyAbsPos(body, t, _c)); }
        out.copy(ORB.stateAtTime(els, t, this._st || (this._st = { r: new THREE.Vector3(), v: new THREE.Vector3() })).r);
      }
      return out.add(ORB.bodyAbsPos(body, t, _c));
    },
    debrisWorldPos(d, t, out) {
      const body = CEL.B[d.bodyId];
      const bf = new THREE.Vector3().fromArray(d.landedPos);
      CEL.bfToInertial(body, bf, t, out);
      return out.add(ORB.bodyAbsPos(body, t, _c));
    },
    updateStandalone(dt) {
      const t = GAME.ut;
      const focusB = CEL.B[this.focus] || CEL.GAIA;
      const fAbs = ORB.bodyAbsPos(focusB, t, new THREE.Vector3());
      const cp = this.camPitch, cy = this.camYaw;
      this.cam.position.set(
        Math.cos(cp) * Math.sin(cy) * this.camDist,
        Math.sin(cp) * this.camDist,
        Math.cos(cp) * Math.cos(cy) * this.camDist);
      this.cam.up.set(0, 1, 0);
      this.cam.lookAt(0, 0, 0);
      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
      this.cam.near = Math.max(this.camDist * 1e-4, 10);
      this.updateBodies(t, fAbs);
      this.updateCommLines(t, fAbs, null);
      const tmp = new THREE.Vector3();
      if (!this.fleetLines) this.fleetLines = [];
      let lineI = 0;
      for (const fm of this.fleetMarks) {
        this.flightWorldPos(fm.f, t, tmp).sub(fAbs);
        fm.mark.position.copy(tmp);
        const d = Math.max(tmp.distanceTo(this.cam.position), 1);
        fm.mark.scale.setScalar(d * 0.012);
        fm.label.position.copy(tmp).add(_b.set(0, d * 0.022, 0));
        fm.label.scale.set(d * 0.024 * fm.label.userData.aspect, d * 0.024, 1);
        const els = this.flightElems(fm.f, t);
        const body = CEL.B[fm.f.bodyId];
        if (els && body) {
          const bodyOff = ORB.bodyAbsPos(body, t, _c).sub(fAbs);
          const pts = ORB.orbitPoints(els, 256, body.soi * 1.05);
          let line = this.fleetLines[lineI];
          if (!line) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(260 * 3), 3));
            line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0x7ae8ff, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending }));
            line.frustumCulled = false;
            this.scene.add(line);
            this.fleetLines[lineI] = line;
          }
          this.fillLine(line, pts, bodyOff);
          line.visible = pts.length > 3 && this.mode !== 'debris';
          lineI++;
        }
      }
      for (let i = lineI; i < this.fleetLines.length; i++) this.fleetLines[i].visible = false;
      const showDebris = this.mode === 'debris';
      for (const dm of this.debrisMarks || []) {
        this.debrisWorldPos(dm.d, t, tmp).sub(fAbs);
        dm.mark.position.copy(tmp);
        const dd = Math.max(tmp.distanceTo(this.cam.position), 1);
        dm.mark.scale.setScalar(dd * 0.011);
        dm.label.position.copy(tmp).add(_b.set(0, dd * 0.02, 0));
        dm.label.scale.set(dd * 0.022 * dm.label.userData.aspect, dd * 0.022, 1);
        dm.mark.visible = showDebris;
        dm.label.visible = showDebris;
      }
      if (this.facilityMark && CEL.KSC.body === CEL.GAIA) {
        const bf = CEL.sitePadBf(CEL.KSC.lat, CEL.KSC.lon, _b);
        ORB.bodyAbsPos(CEL.GAIA, t, tmp).sub(fAbs);
        CEL.bfToInertial(CEL.GAIA, bf, t, _c);
        tmp.add(_c);
        const surfN = _c.clone().normalize();
        this.facilityMark.position.copy(tmp);
        const fd = Math.max(tmp.distanceTo(this.cam.position), 1);
        const gaiaNear = this.focus === 'gaia' && this.camDist < CEL.GAIA.R * 5;
        const markScale = gaiaNear ? fd * 0.034 : fd * 0.02;
        this.facilityMark.scale.setScalar(markScale);
        this.facilityRing.position.copy(tmp);
        this.facilityRing.scale.setScalar(markScale * 2.8);
        const lift = gaiaNear ? fd * 0.014 : fd * 0.032;
        this.facilityLabel.position.copy(tmp).addScaledVector(surfN, lift);
        const lbl = gaiaNear ? fd * 0.038 : fd * 0.03;
        this.facilityLabel.scale.set(lbl * this.facilityLabel.userData.aspect, lbl, 1);
        const show3d = this.focus === 'gaia' && this.camDist < CEL.GAIA.R * 0.018;
        if (this.facilityGrp) this.facilityGrp.visible = show3d;
        const showFac = !show3d && (this.focus === 'gaia' || fd < CEL.GAIA.R * 16);
        this.facilityMark.visible = showFac;
        this.facilityRing.visible = showFac;
        this.facilityLabel.visible = showFac;
      }
      if (window.NET) NET.syncMapSiteMarks(this, t, fAbs);
      const focusMesh = this.meshes[focusB.id];
      if (this.focusRing && focusMesh) {
        const showRing = this.camDist < focusB.R * 6;
        this.focusRing.visible = showRing;
        if (showRing) {
          this.focusRing.position.copy(focusMesh.grp.position);
          this.focusRing.scale.setScalar(focusB.R * 1.04);
          this.focusRing.lookAt(this.cam.position);
        }
      }
      const sunDir = ORB.bodyAbsPos(CEL.SUN, t, _a).sub(fAbs).normalize();
      this.sunL.position.copy(sunDir).multiplyScalar(120);
      this.sunL.intensity = 1.35;
      this.stars.update(this.cam.position, 0.22);
      GAME.renderer.render(this.scene, this.cam);
    },

    open(fl) {
      this.ensure(fl);
      this.focus = 'vessel';
      this.camDist = Math.max(fl.r.length() * 3.2, fl.body.R * 4);
      this.camYaw = fl.camYaw; this.camPitch = clamp(fl.camPitch, -1.4, 1.4);
      /* node panel container */
      const hud = document.getElementById('hud-root');
      this.panel = el('div', 'panel', hud);
      this.panel.id = 'mnv-panel';
      this.refreshPanel(fl);
      this.hint = el('div', '', hud, this.modeBarHtml() + '<div style="margin-top:5px">click orbit: add maneuver node · click body: focus · drag: rotate · scroll: zoom</div>');
      this.hint.style.cssText = 'position:absolute;top:46px;left:50%;transform:translateX(-50%);color:var(--dim);font-size:12.5px;letter-spacing:.1em;text-align:center;pointer-events:all;';
      this.bindModeBar(this.hint);
      const cv = GAME.renderer.domElement;
      this.bindCam();
      this._click = e => { if (!this.camMoved) this.onClick(fl, e); };
      cv.addEventListener('click', this._click);
      this._wheel = e => { this.camDist = clamp(this.camDist * (e.deltaY > 0 ? 1.18 : 0.85), fl.body.R * 1.4, 5e11); };
      addEventListener('wheel', this._wheel, { passive: true });
    },
    close(fl) {
      if (this.panel) { this.panel.remove(); this.panel = null; }
      if (this.hint) { this.hint.remove(); this.hint = null; }
      const cv = GAME.renderer.domElement;
      this.unbindCam();
      cv.removeEventListener('click', this._click);
      removeEventListener('wheel', this._wheel);
    },

    /* ---------- focus helpers ---------- */
    focusAbs(fl, t, out) {
      if (this.focus === 'vessel') return ORB.bodyAbsPos(fl.body, t, out).add(fl.r);
      return ORB.bodyAbsPos(CEL.B[this.focus], t, out);
    },

    /* propagate a saved/archived flight to t, return osculating elements at that instant */
    flightElems(f, t) {
      const body = CEL.B[f.bodyId];
      if (!body || f.landed) return null;
      const r = _a.fromArray(f.r), v = _b.fromArray(f.v);
      const epoch = f.savedUt != null ? f.savedUt : (f.launchUt != null ? f.launchUt : t);
      const el0 = ORB.elementsFromState(body.mu, r, v, epoch);
      const st = ORB.stateAtTime(el0, t);
      return ORB.elementsFromState(body.mu, st.r, st.v, t);
    },
    activeElems(fl, t) {
      if (!fl || fl.landed) return null;
      return ORB.elementsFromState(fl.body.mu, fl.r, fl.v, t);
    },

    /* ---------- node panel ---------- */
    refreshPanel(fl) {
      if (!this.panel) return;
      const nd = fl.nodes[0];
      if (!nd) {
        this.panel.innerHTML = `<div class="ptitle">MANEUVER</div>
          <div style="padding:10px 12px;color:var(--dim);font-size:13px">Click a point on your orbit to plan a burn.</div>`;
        return;
      }
      this.panel.innerHTML = `<div class="ptitle">MANEUVER NODE<span id="mnv-del" style="cursor:pointer;color:var(--bad)">✕</span></div>
        <div id="mnv-rows"></div>
        <div class="mnv-row"><label>Δv total</label><div class="val" id="mnv-tot">0 m/s</div></div>
        <div class="mnv-row"><label>Burn est.</label><div class="val" id="mnv-burn">—</div></div>
        <div class="mnv-row"><label>Node in</label><div class="val" id="mnv-eta">—</div></div>
        <div class="mnv-row" style="justify-content:flex-end;gap:8px;padding:6px 10px">
          <button class="btn tiny" id="mnv-warp">WARP TO −45s</button></div>`;
      const rows = this.panel.querySelector('#mnv-rows');
      const axes = [['prograde', 'PROGRADE', '#c9f24b'], ['normal', 'NORMAL', '#d670e8'], ['radial', 'RADIAL', '#62d8e8'], ['ut', 'TIME', '#cfe3ee']];
      for (const [key, label, color] of axes) {
        const r = el('div', 'mnv-row', rows);
        r.innerHTML = `<label style="color:${color}">${label}</label>
          <button class="mnv-btn" data-k="${key}" data-d="-1">−</button>
          <button class="mnv-btn" data-k="${key}" data-d="1">+</button>
          <div class="val" id="mnv-${key}">0.0</div>`;
      }
      rows.querySelectorAll('.mnv-btn').forEach(b => {
        let timer = null, accel = 1;
        const apply = () => {
          const k = b.dataset.k, d = +b.dataset.d;
          const nd2 = fl.nodes[0];
          if (!nd2) return;
          if (k === 'ut') nd2.ut += d * 5 * accel;
          else nd2[k] += d * 1.2 * accel;
          accel = Math.min(accel * 1.13, 30);
          this.nodeDirty = true;
          this.updatePanelVals(fl);
        };
        b.onmousedown = () => { apply(); timer = setInterval(apply, 70); };
        const stop = () => { clearInterval(timer); accel = 1; };
        b.onmouseup = stop; b.onmouseleave = stop;
      });
      this.panel.querySelector('#mnv-del').onclick = () => { fl.nodes = []; this.refreshPanel(fl); this.pLine.visible = false; this.eLine.visible = false; this.nodeM.visible = false; this.encM.visible = false; };
      this.panel.querySelector('#mnv-warp').onclick = () => {
        const nd2 = fl.nodes[0];
        if (!nd2) return;
        fl.warpTo = nd2.ut - 45;
        AUDIO.click();
      };
      this.updatePanelVals(fl);
    },
    updatePanelVals(fl) {
      const nd = fl.nodes[0];
      if (!nd || !this.panel) return;
      const set = (id, v) => { const e2 = this.panel.querySelector('#mnv-' + id); if (e2) e2.textContent = v; };
      set('prograde', nd.prograde.toFixed(1));
      set('normal', nd.normal.toFixed(1));
      set('radial', nd.radial.toFixed(1));
      set('ut', 'T−' + U.fmtDelta(Math.max(nd.ut - GAME.ut, 0)));
      const dv = Math.hypot(nd.prograde, nd.normal, nd.radial);
      set('tot', dv.toFixed(1) + ' m/s');
      const thrust = (() => { let s = 0; for (const p of fl.vessel.parts.values()) if (p.def.engine && !p.def.engine.srb) s += p.def.engine.thrust; return s; })();
      set('burn', thrust > 0 ? (dv * fl.massProps().m / thrust).toFixed(0) + ' s' : 'no engine');
      set('eta', U.fmtDelta(nd.ut - GAME.ut));
    },

    /* ---------- node math ---------- */
    nodeFrame(fl, nd) {
      const elems = fl.currentElements();
      if (!elems) return null;
      const st = ORB.stateAtTime(elems, nd.ut);
      const p = st.v.clone().normalize();
      const n = new THREE.Vector3().crossVectors(st.r, st.v).normalize();
      const rad = new THREE.Vector3().crossVectors(p, n);
      return { st, p, n, rad };
    },
    nodeWorldDir(fl, nd) {
      const f = this.nodeFrame(fl, nd);
      if (!f) return null;
      const dir = f.p.multiplyScalar(nd.prograde).addScaledVector(f.n, nd.normal).addScaledVector(f.rad, nd.radial);
      return dir.lengthSq() > 1e-6 ? dir.normalize() : null;
    },
    nodeDv(nd) { return Math.hypot(nd.prograde, nd.normal, nd.radial); },
    updateNodeHud(fl) {
      if (this.panel) this.updatePanelVals(fl);
      /* auto-warp to node */
      if (fl.warpTo !== undefined) {
        const left = fl.warpTo - GAME.ut;
        if (left <= 0) { fl.warpTo = undefined; fl.setWarp(0); }
        else {
          const ideal = left > 3e5 ? 7 : left > 4e4 ? 6 : left > 6000 ? 5 : left > 900 ? 4 : left > 200 ? 3 : left > 40 ? 2 : 1;
          if (fl.warpI !== ideal && !fl.physWarp) fl.setWarp(ideal);
        }
      }
    },

    /* ---------- click handling ---------- */
    onClick(fl, e) {
      if (fl.dragMoved) return;
      const mx = e.clientX, my = e.clientY;
      /* body focus? */
      const t = GAME.ut;
      const fAbs = this.focusAbs(fl, t, _a);
      for (const b of CEL.list) {
        const sp = ORB.bodyAbsPos(b, t, _b).sub(fAbs).project(this.cam);
        if (sp.z > 1) continue;
        const sx = (sp.x + 1) / 2 * innerWidth, sy = (-sp.y + 1) / 2 * innerHeight;
        if (Math.hypot(sx - mx, sy - my) < 22) {
          this.focus = b.id;
          AUDIO.click();
          this.camDist = Math.max(b.R * 6, this.camDist * 0.001 > b.R ? b.R * 6 : this.camDist);
          return;
        }
      }
      /* vessel focus */
      {
        const sp = ORB.bodyAbsPos(fl.body, t, _b).add(fl.r).sub(fAbs).project(this.cam);
        const sx = (sp.x + 1) / 2 * innerWidth, sy = (-sp.y + 1) / 2 * innerHeight;
        if (sp.z < 1 && Math.hypot(sx - mx, sy - my) < 20) { this.focus = 'vessel'; AUDIO.click(); return; }
      }
      /* click on own orbit → place node */
      const elems = this.activeElems(fl, t);
      if (!elems) return;
      const bodyAbs = ORB.bodyAbsPos(fl.body, t, _b);
      let bestD = 16, bestNu = null;
      for (let i = 0; i <= 240; i++) {
        const nu = -Math.PI + i / 240 * U.TAU;
        if (elems.e >= 1 && Math.abs(nu) > Math.acos(clamp(-1 / elems.e, -1, 1)) - 0.05) continue;
        const pos = ORB.posAtNu(elems, nu, _c).add(bodyAbs).sub(fAbs);
        const sp = pos.project(this.cam);
        if (sp.z > 1) continue;
        const sx = (sp.x + 1) / 2 * innerWidth, sy = (-sp.y + 1) / 2 * innerHeight;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bestD) { bestD = d; bestNu = nu; }
      }
      if (bestNu !== null) {
        const ut = ORB.timeAtNu(elems, bestNu, t + 2);
        fl.nodes = [{ ut, prograde: 0, normal: 0, radial: 0 }];
        this.nodeDirty = true;
        this.refreshPanel(fl);
        AUDIO.blip(980, 0.08, 0.1);
      }
    },

    /* ---------- per-frame ---------- */
    update(fl, dt) {
      this.ensure(fl);
      const t = GAME.ut;
      const fAbs = this.focusAbs(fl, t, new THREE.Vector3());
      const cp = this.camPitch, cy = this.camYaw;
      this.cam.position.set(
        Math.cos(cp) * Math.sin(cy) * this.camDist,
        Math.sin(cp) * this.camDist,
        Math.cos(cp) * Math.cos(cy) * this.camDist);
      this.cam.up.set(0, 1, 0);
      this.cam.lookAt(0, 0, 0);
      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
      this.cam.near = Math.max(this.camDist * 1e-4, 10);
      this.cam.far = 1e13;
      this.sunL.position.copy(ORB.bodyAbsPos(CEL.SUN, t, _a).sub(fAbs)).normalize().multiplyScalar(10);
      if (this.sunL.position.lengthSq() < 1) this.sunL.position.set(1, 1, 1);
      /* bodies */
      this.updateBodies(t, fAbs);
      this.stars.update(this.cam.position, 0);
      this.updateCommLines(t, fAbs, fl);
      /* vessel */
      const vAbs = ORB.bodyAbsPos(fl.body, t, _a).add(fl.r).sub(fAbs);
      this.vMark.position.copy(vAbs);
      const vd = Math.max(vAbs.distanceTo(this.cam.position), 1);
      this.vMark.scale.setScalar(vd * 0.013);
      this.vLabel.position.copy(vAbs).add(_b.set(0, vd * 0.025, 0));
      this.vLabel.scale.set(vd * 0.028 * this.vLabel.userData.aspect, vd * 0.028, 1);
      if (this.vLabel.userData.txt !== fl.flightName) {
        this.scene.remove(this.vLabel);
        this.vLabel = U.textSprite(fl.flightName, { size: 38, color: '#c9f24b' });
        this.vLabel.userData.txt = fl.flightName;
        this.vLabel.renderOrder = 25;
        this.scene.add(this.vLabel);
      }
      /* vessel orbit line */
      const elems = this.activeElems(fl, t);
      const bodyAbs = ORB.bodyAbsPos(fl.body, t, _b).sub(fAbs);
      if (elems) {
        const pts = ORB.orbitPoints(elems, 256, fl.body.soi * 1.05);
        this.fillLine(this.vLine, pts, bodyAbs);
        this.vLine.visible = true;
        /* ap/pe markers */
        const showAp = elems.e < 1 && elems.rAp < fl.body.soi;
        this.apM.visible = showAp;
        if (showAp) {
          this.apM.position.copy(ORB.posAtNu(elems, Math.PI, _c)).add(bodyAbs);
          this.setMarkerText(this.apM, 'apM', 'Ap ' + U.fmtSI(elems.rAp - fl.body.R), '#59d8ff');
          this.scaleMarker(this.apM);
        }
        this.peM.visible = elems.rPe > 0;
        this.peM.position.copy(ORB.posAtNu(elems, 0, _c)).add(bodyAbs);
        this.setMarkerText(this.peM, 'peM', 'Pe ' + U.fmtSI(elems.rPe - fl.body.R), '#a8e34d');
        this.scaleMarker(this.peM);
      } else {
        this.vLine.visible = false;
        this.apM.visible = this.peM.visible = false;
      }
      /* node + prediction */
      const nd = fl.nodes[0];
      if (nd && elems) {
        const f = this.nodeFrame(fl, nd);
        if (f) {
          this.nodeM.visible = true;
          this.nodeM.position.copy(f.st.r).add(bodyAbs);
          this.scaleMarker(this.nodeM);
          const newV = f.st.v.clone()
            .addScaledVector(f.p, nd.prograde)
            .addScaledVector(f.n, nd.normal)
            .addScaledVector(f.rad, nd.radial);
          const pel = ORB.elementsFromState(fl.body.mu, f.st.r, newV, nd.ut);
          const ppts = ORB.orbitPoints(pel, 200, fl.body.soi * 1.02);
          this.fillLine(this.pLine, ppts, bodyAbs);
          this.pLine.visible = true;
          /* encounter scan on predicted orbit */
          this.scanEncounter(fl, pel, nd.ut, fAbs, t);
        }
      } else if (elems) {
        this.pLine.visible = false;
        this.nodeM.visible = false;
        this.scanEncounter(fl, elems, t, fAbs, t);
      } else {
        this.pLine.visible = false;
        this.nodeM.visible = false;
        this.eLine.visible = false;
        this.encM.visible = false;
      }
      if (window.NET) NET.syncMapSiteMarks(this, t, fAbs);
      GAME.renderer.render(this.scene, this.cam);
    },
    setMarkerText(sp, key, txt, color) {
      if (sp.userData.txt === txt) return;
      sp.userData.txt = txt;
      const fresh = U.textSprite(txt, { size: 30, color, bg: 'rgba(10,16,22,0.72)' });
      sp.material.map.dispose();
      sp.material.map = fresh.material.map;
      sp.userData.aspect = fresh.userData.aspect;
    },
    scaleMarker(sp) {
      const d = Math.max(sp.position.distanceTo(this.cam.position), 1);
      sp.scale.set(d * 0.026 * (sp.userData.aspect || 2), d * 0.026, 1);
    },
    fillLine(line, pts, offset) {
      const attr = line.geometry.attributes.position;
      const n = Math.min(pts.length, attr.count);
      for (let i = 0; i < n; i++) {
        attr.setXYZ(i, pts[i].x + offset.x, pts[i].y + offset.y, pts[i].z + offset.z);
      }
      for (let i = n; i < attr.count; i++) {
        const last = pts[n - 1] || { x: 0, y: 0, z: 0 };
        attr.setXYZ(i, last.x + offset.x, last.y + offset.y, last.z + offset.z);
      }
      attr.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    },

    scanEncounter(fl, elems, t0, fAbs, tNow) {
      /* sample forward for SOI entry of children of current body */
      const body = fl.body;
      if (!body.children.length || elems.e >= 1 && elems.rPe > body.soi) { this.eLine.visible = false; this.encM.visible = false; return; }
      const horizon = elems.e < 1 ? Math.min(elems.period * 1.5, 3e7) : 3e6;
      const key = (elems.a | 0) + '|' + (elems.e * 1000 | 0) + '|' + (t0 | 0);
      if (this.encCache.key !== key) {
        this.encCache = { key, enc: null };
        const N = 360;
        outer:
        for (let i = 1; i < N; i++) {
          const tt = t0 + horizon * i / N;
          const st = ORB.stateAtTime(elems, tt, this._st || (this._st = { r: new THREE.Vector3(), v: new THREE.Vector3() }));
          if (st.r.length() > body.soi) break;
          for (const moon of body.children) {
            const mp = ORB.bodyRelPos(moon, body, tt, _c);
            if (st.r.distanceTo(mp) < moon.soi) {
              /* bisect entry */
              let lo = t0 + horizon * (i - 1) / N, hi = tt;
              for (let k = 0; k < 22; k++) {
                const mid = (lo + hi) / 2;
                const sm = ORB.stateAtTime(elems, mid, this._st);
                const mp2 = ORB.bodyRelPos(moon, body, mid, _c);
                if (sm.r.distanceTo(mp2) < moon.soi) hi = mid; else lo = mid;
              }
              this.encCache.enc = { moon, tEnter: hi };
              break outer;
            }
          }
        }
      }
      const enc = this.encCache.enc;
      if (!enc) { this.eLine.visible = false; this.encM.visible = false; return; }
      /* hyperbolic patch in moon frame at encounter */
      const st = ORB.stateAtTime(elems, enc.tEnter, this._st);
      const mp = ORB.bodyRelPos(enc.moon, fl.body, enc.tEnter, _c);
      const mv = ORB.bodyRelVel(enc.moon, fl.body, enc.tEnter, new THREE.Vector3());
      const rRel = st.r.clone().sub(mp);
      const vRel = st.v.clone().sub(mv);
      const mel = ORB.elementsFromState(enc.moon.mu, rRel, vRel, enc.tEnter);
      const pts = ORB.orbitPoints(mel, 160, enc.moon.soi);
      const moonAbsAtEnc = ORB.bodyAbsPos(fl.body, tNow, new THREE.Vector3()).add(mp).sub(fAbs);
      this.fillLine(this.eLine, pts, moonAbsAtEnc);
      this.eLine.visible = true;
      this.encM.visible = true;
      this.encM.position.copy(moonAbsAtEnc).add(_a.set(0, enc.moon.soi * 0.4, 0));
      this.setMarkerText(this.encM, 'encM', enc.moon.name + ' encounter — ' + U.fmtDelta(enc.tEnter - tNow), '#d670e8');
      this.scaleMarker(this.encM);
    },
  };
  return M;
})();
