/* flight.js — flight scene: 6DOF physics, aero, SAS, staging, HUD, FX. Screen: 'flight' */
'use strict';
(() => {
  const { el, V3, clamp, lerp } = U;
  const WARPS = [1, 5, 25, 100, 1000, 10000, 100000, 1000000];
  const PHYS_WARPS = [1, 2, 3, 4];
  const H_STEP = 1 / 120;
  const EXHAUST_SMOKE_N = 2048;
  const GROUND_SMOKE_N = 3072;
  const SMOKE_POOL_N = EXHAUST_SMOKE_N + GROUND_SMOKE_N;

  /* scratch vectors */
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  /* dedicated physics scratch — never aliased across roles within step() */
  const P_UP = new THREE.Vector3(), P_VATM = new THREE.Vector3(), P_VAIR = new THREE.Vector3(),
    P_NOSE = new THREE.Vector3(), P_DIR = new THREE.Vector3(), P_LEV = new THREE.Vector3(),
    P_W1 = new THREE.Vector3(), P_W2 = new THREE.Vector3(), P_BF = new THREE.Vector3(), P_VHAT = new THREE.Vector3();
  const P_Q = new THREE.Quaternion();
  const SM_UP = new THREE.Vector3(), SM_EAST = new THREE.Vector3(), SM_NORTH = new THREE.Vector3();

  function bodyRadialBasis(posLocal, up, east, north) {
    up.copy(posLocal);
    if (up.lengthSq() < 1e-8) {
      up.set(0, 1, 0);
      east.set(1, 0, 0);
      north.set(0, 0, 1);
      return;
    }
    up.normalize();
    east.set(0, 1, 0).cross(up);
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
    else east.normalize();
    north.crossVectors(up, east);
  }

  function vesselHasWheels(vessel) {
    return [...vessel.parts.values()].some(p => p.def.gearWheel);
  }
  /* belly-down on the runway: vessel +Y = nose, +Z = belly */
  function runwayAttitude(up, noseW) {
    const nose = noseW.clone().normalize();
    const bellyW = up.clone().negate();
    const alignNose = P_Q.setFromUnitVectors(_a.set(0, 1, 0), nose);
    const bellyNow = _b.set(0, 0, 1).applyQuaternion(alignNose);
    const alignBelly = _q.setFromUnitVectors(bellyNow, bellyW);
    return alignBelly.multiply(alignNose);
  }
  /* lowest extent along surface-up once a runway attitude is applied */
  function runwayFootprint(vessel, landedQuat, up) {
    vessel.layout();
    let foot = Infinity;
    for (const p of vessel.parts.values()) {
      const h = p.def.h || 0.5;
      const locals = [new THREE.Vector3(p.pos.x, p.pos.y - h / 2, p.pos.z)];
      if (p.def.gearWheel) locals.push(new THREE.Vector3(p.pos.x, p.pos.y - p.def.gearWheel.len, p.pos.z));
      for (const l of locals) {
        foot = Math.min(foot, _a.copy(l).applyQuaternion(landedQuat).dot(up));
      }
    }
    return isFinite(foot) ? foot : 0;
  }
  function isOverOcean(body, terrainH) {
    return !!(body.ocean && terrainH < 1);
  }
  function surfaceFloor(body, terrainH) {
    return isOverOcean(body, terrainH) ? 0 : terrainH;
  }
  /* how far below sea level the lowest point may sit when floating */
  function waterSubmergeDepth(vessel) {
    const b = vessel?.bounds?.() || { minY: 0, maxY: 2, maxR: 2 };
    const height = Math.max(0.9, b.maxY - b.minY);
    return clamp(height * 0.42, 1.1, 5.5);
  }
  /* equilibrium vessel-center altitude over the reference sphere (negative = in the water) */
  function waterFloatAlt(vessel) {
    const sub = waterSubmergeDepth(vessel);
    return -sub * 0.58;
  }
  function waterContactFloor(vessel) {
    return -waterSubmergeDepth(vessel);
  }
  function plumeMat(tex, color) {
    return new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
  }
  function tunePlumeMesh(mesh) {
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    return mesh;
  }

  const fl = {
    /* ============== lifecycle ============== */
    ensureScene() {
      if (this.scene) return;
      this.scene = new THREE.Scene();
      this.cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.08, 2e12);
      this.stars = new PG.Stars(this.scene);
      this.sunLight = new THREE.DirectionalLight(0xfff2dc, 3.2);
      this.scene.add(this.sunLight);
      this.shadowLight = new THREE.DirectionalLight(0xfff2dc, 0);
      this.shadowLight.castShadow = true;
      this.shadowLight.shadow.mapSize.set(2048, 2048);
      Object.assign(this.shadowLight.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 400 });
      this.scene.add(this.shadowLight, this.shadowLight.target);
      this.hemi = new THREE.HemisphereLight(0x9ec2e8, 0x4a3b28, 0.4);
      this.amb = new THREE.AmbientLight(0x202830, 0.55);
      this.scene.add(this.hemi, this.amb);
      this.scene.fog = new THREE.FogExp2(0x9ab8d8, 0);
      this.sunFx = new PG.SunFX(this.scene);
      this.views = {};
      for (const b of CEL.list) {
        this.views[b.id] = new PG.PlanetView(b, this.scene, { detail: GAME.settings.quality - 2, clouds: GAME.settings.quality >= 1 });
      }
      if (GAME.settings.quality >= 1) {
        this.scatter = new PG.Scatter(this.views.gaia);
        this.scatterBody = 'gaia';
        this.birds = new PG.Birds();
      }
    },

    enter(args) {
      this.ensureScene();
      if (this.vGroup) this.scene.remove(this.vGroup);
      this.vGroup = null;
      this.meshes = null;
      this.ksc = null;
      this.remoteKscs = null;
      this.padSmokePos = null;
      this.padSmokeBody = null;

      /* state */
      this.warpI = 0; this.physWarpI = 0;
      this.ctrl = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0 };
      this.throttle = 0;
      this.sas = true; this.sasMode = 'stab'; this.rcs = false; this.gear = false; this.lights = false;
      this.holdQuat = new THREE.Quaternion();
      this.met = 0; this.launched = false;
      this.flags = {}; this.scienceBank = [];
      this.debris = [];
      this.nodes = [];
      this.camYaw = -2.3; this.camPitch = 0.18; this.camDist = 18; this.camMode = 0;
      this.dead = false; this.outcome = null;
      this.mapOpen = false;
      this.shakeT = 0;
      this.speedMode = 'auto';
      this.paw = null;
      this.alerts = {};

      if (args.launch) this.spawnOnPad(args.launch);
      else if (args.resume) this.resumeFlight(args.resume);
      else if (args.quick) this.restoreSnapshot(args.quick);

      this.buildHud();
      this.bindInput();
      this.rebuildVesselGroup();
      this.updateFeeds();
      this.launchSnapshot = args.launch ? this.snapshot() : null;
      window.__FLIGHT = this;
      UI.topbar(true);
      if (args.launch) {
        const tip = this.isPlane
          ? 'On the runway. Space to start engines, Shift/Ctrl for throttle, WASD to steer.'
          : 'On the pad. Space to stage, Shift for throttle.';
        UI.toast(this.vessel.name, tip, '');
      }
      if (args.view === 'cam') {
        const camPart = [...this.vessel.parts.values()].find(p => p.def.cameraPart);
        if (camPart) this.enterCamView(camPart);
      }
      if (this.body === CEL.GAIA) this.ensureKsc();
      this.updateScene(0);
      this.updateCamera(0);
      GAME.renderer.render(this.scene, this.cam);
    },

    spawnOnPad(craftData) {
      this.vessel = Vessel.deserialize(craftData);
      this.body = CEL.GAIA;
      const n = (GAME.save.launchCount[this.vessel.name] = (GAME.save.launchCount[this.vessel.name] || 0) + 1);
      this.flightName = this.vessel.name + (n > 1 ? ' ' + n : '');
      this.stagesLeft = this.vessel.stages.map(s => [...s]);
      this.lit = new Set();
      this.landed = true;
      this.isPlane = vesselHasWheels(this.vessel);
      const kscBase = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon);
      const up = kscBase.clone().normalize();
      const padQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      if (this.isPlane) {
        /* planes spawn on the runway threshold, belly-down, nose along the centerline (+X) */
        this.gear = true;
        const noseW = new THREE.Vector3(1, 0, 0).applyQuaternion(padQ);
        const landedQuat = runwayAttitude(up, noseW);
        const foot = runwayFootprint(this.vessel, landedQuat, up);
        const horiz = new THREE.Vector3(-170, 0, -120).applyQuaternion(padQ);
        this.landedBf = {
          pos: kscBase.clone().add(horiz).addScaledVector(up, 0.08 - foot),
          quat: landedQuat,
        };
        this.camYaw = -2.55;
        this.camPitch = 0.06;
        this.camDist = 26;
      } else {
        const b = this.vessel.bounds();
        /* pad sits 170m east-ish of the site anchor, top surface 4.2m above terrain plateau */
        const padOff = new THREE.Vector3(170, 4.2 - b.minY, 60).applyQuaternion(padQ);
        this.landedBf = { pos: kscBase.add(padOff), quat: null };
        /* orientation: nose up, local X east */
        const eastBf = new THREE.Vector3(0, 1, 0).cross(up).normalize();
        const zAxis = new THREE.Vector3().crossVectors(eastBf, up);
        const m = new THREE.Matrix4().makeBasis(eastBf, up, zAxis);
        this.landedBf.quat = new THREE.Quaternion().setFromRotationMatrix(m);
      }
      this.r = new THREE.Vector3(); this.v = new THREE.Vector3();
      this.quat = new THREE.Quaternion(); this.angVel = new THREE.Vector3();
      this.syncLanded(GAME.ut);
      this.crew = Vessel.genCrew(U.mulberry32((Date.now() % 1e6) | 0), this.vessel.crewCapacity());
      this.launchUt = GAME.ut;
      this.fid = 'f' + Date.now();
    },

    resumeFlight(f) {
      this.vessel = Vessel.deserialize(f.craft);
      this.body = CEL.B[f.bodyId];
      this.flightName = f.name;
      this.stagesLeft = f.stagesLeft.map(s => [...s]);
      this.lit = new Set(f.lit || []);
      this.met = f.met; this.launched = true;
      this.flags = f.flags || {};
      this.scienceBank = f.scienceBank || [];
      this.crew = f.crew || [];
      this.launchUt = f.launchUt;
      this.fid = f.fid;
      this.gear = !!f.gear;
      this.isPlane = vesselHasWheels(this.vessel);
      this.r = new THREE.Vector3().fromArray(f.r);
      this.v = new THREE.Vector3().fromArray(f.v);
      this.quat = new THREE.Quaternion().fromArray(f.quat);
      this.angVel = new THREE.Vector3();
      this.landed = !!f.landed;
      this.landedSplashed = !!f.landedSplashed;
      if (this.landed) {
        this.landedBf = { pos: new THREE.Vector3().fromArray(f.landedPos), quat: new THREE.Quaternion().fromArray(f.landedQuat) };
        this.syncLanded(GAME.ut);
      } else if (f.savedUt !== undefined && GAME.ut - f.savedUt > 1) {
        /* propagate orbit while we were away */
        const elems = ORB.elementsFromState(this.body.mu, this.r, this.v, f.savedUt);
        const st = ORB.stateAtTime(elems, GAME.ut);
        this.r.copy(st.r); this.v.copy(st.v);
      }
      GAME.save.flights = GAME.save.flights.filter(x => x.fid !== this.fid);
    },

    serializeFlight() {
      return {
        fid: this.fid, name: this.flightName, bodyId: this.body.id,
        craft: this.vessel.serialize(),
        stagesLeft: this.stagesLeft.map(s => [...s]), lit: [...this.lit],
        r: this.r.toArray(), v: this.v.toArray(), quat: this.quat.toArray(),
        landed: this.landed,
        landedPos: this.landed ? this.landedBf.pos.toArray() : null,
        landedQuat: this.landed ? this.landedBf.quat.toArray() : null,
        landedSplashed: !!this.landedSplashed,
        met: this.met, flags: this.flags, scienceBank: this.scienceBank,
        crew: this.crew, launchUt: this.launchUt, savedUt: GAME.ut,
        partCount: this.vessel.parts.size, gear: this.gear,
      };
    },
    snapshot() {
      return { flight: this.serializeFlight(), ut: GAME.ut, funds: GAME.save.funds, sci: GAME.save.sci };
    },
    restoreSnapshot(s) {
      GAME.ut = s.ut;
      GAME.save.funds = s.funds; GAME.save.sci = s.sci;
      this.resumeFlight(s.flight);
    },

    syncLanded(t) {
      CEL.bfToInertial(this.body, this.landedBf.pos, t, this.r);
      const om = CEL.spinOmega(this.body, _a);
      this.v.crossVectors(om, this.r);
      const ang = CEL.spinAngle(this.body, t);
      this.quat.setFromAxisAngle(_b.set(0, 1, 0), ang).multiply(this.landedBf.quat);
      this.angVel.set(0, 0, 0);
      this.holdQuat.copy(this.quat);     // SAS holds the pad attitude at liftoff
      this.correctGroundPosition(t);
      this.landedBf.pos.copy(CEL.inertialToBf(this.body, this.r, t, new THREE.Vector3()));
      const rl = this.r.length();
      this.alt = rl - this.body.R;
      const bfDir = CEL.inertialToBf(this.body, _c.copy(this.r).divideScalar(rl), t, P_BF);
      this.terrainH = this.body.sampler ? CEL.heightAt(this.body, bfDir) : 0;
      this.agl = this.alt - Math.max(this.terrainH, this.body.ocean ? 0 : this.terrainH);
      this.pres = CEL.atmoPressure(this.body, this.alt);
      if (this.landedSplashed) this.splashed = true;
    },

    groundSampleLocals() {
      const pts = [];
      for (const p of this.vessel.parts.values()) {
        if (p.def.gearWheel) {
          const reach = p.def.gearWheel.len;
          pts.push(new THREE.Vector3(p.pos.x, p.pos.y - reach, p.pos.z));
          continue;
        }
        if (p.def.leg && this.gear) {
          const reach = p.def.leg.len * 0.96;
          pts.push(new THREE.Vector3(p.pos.x, p.pos.y - reach * 0.62, p.pos.z + reach * 0.62));
          continue;
        }
        const hh = (p.def.h || 0.4) / 2;
        pts.push(new THREE.Vector3(p.pos.x, p.pos.y - hh, p.pos.z));
      }
      return pts;
    },

    correctGroundPosition(t) {
      if (!this.body.sampler) return 0;
      const up = _b.copy(this.r).normalize();
      const waterFloor = waterContactFloor(this.vessel);
      let maxPen = 0;
      for (const local of this.groundSampleLocals()) {
        const world = _c.copy(local).applyQuaternion(this.quat).add(this.r);
        const wl = world.length();
        if (wl < this.body.R * 0.4) continue;
        const dirBf = CEL.inertialToBf(this.body, _d.copy(world).divideScalar(wl), t, _a);
        const th = CEL.heightAt(this.body, dirBf);
        const floor = isOverOcean(this.body, th) ? waterFloor : th;
        const pen = (this.body.R + floor) - wl;
        if (pen > maxPen) maxPen = pen;
      }
      if (maxPen > 0.002) {
        this.r.addScaledVector(up, maxPen);
        const vn = this.v.dot(up);
        if (vn < 0) this.v.addScaledVector(up, -vn);
      }
      return maxPen;
    },

    ensureKsc() {
      if (this.body !== CEL.GAIA || this.ksc || !GAME.buildKSC) return;
      this.ksc = GAME.buildKSC();
      const bf = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon);
      this.ksc.position.copy(bf);
      this.ksc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bf.clone().normalize());
      this.views.gaia.group.add(this.ksc);
    },

    /* ============== vessel 3D ============== */
    rebuildVesselGroup() {
      for (const uid of [...this.lit]) if (!this.vessel.parts.has(uid)) this.lit.delete(uid);
      if (this.vGroup) this.scene.remove(this.vGroup);
      const { group, meshes } = this.vessel.buildGroup();
      this.vGroup = group; this.meshes = meshes;
      group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(group);
      /* plumes: outer glow cone + white-hot inner core + nozzle flash */
      this.plumes = [];
      if (!this.plumeTex) {
        this.plumeTex = PG.glowTex([
          [0, 'rgba(255,255,240,0.98)'], [0.08, 'rgba(255,240,180,0.92)'],
          [0.22, 'rgba(255,200,90,0.75)'], [0.45, 'rgba(255,140,50,0.45)'],
          [0.7, 'rgba(220,90,35,0.18)'], [1, 'rgba(180,60,20,0)'],
        ], 160);
        this.coreTex = PG.glowTex([
          [0, 'rgba(255,255,255,1)'], [0.15, 'rgba(255,250,220,0.95)'],
          [0.4, 'rgba(255,220,140,0.7)'], [0.75, 'rgba(255,160,60,0.2)'], [1, 'rgba(255,120,40,0)'],
        ], 96);
        this.flashTex = PG.glowTex([[0, 'rgba(255,252,240,1)'], [0.35, 'rgba(255,220,150,0.65)'], [1, 'rgba(255,150,60,0)']], 64);
        this.smokeTex = PG.glowTex([
          [0, 'rgba(200,195,188,0.72)'], [0.1, 'rgba(200,195,188,0.62)'],
          [0.28, 'rgba(175,168,158,0.48)'], [0.5, 'rgba(145,138,128,0.32)'],
          [0.72, 'rgba(115,108,100,0.14)'], [1, 'rgba(90,85,80,0)'],
        ], 192);
        this.smokeDarkTex = PG.glowTex([
          [0, 'rgba(95,88,80,0.78)'], [0.18, 'rgba(120,112,102,0.58)'],
          [0.4, 'rgba(145,136,125,0.36)'], [0.65, 'rgba(155,148,138,0.14)'], [1, 'rgba(160,155,148,0)'],
        ], 160);
        this.exhaustTex = PG.glowTex([
          [0, 'rgba(28,26,24,1)'], [0.06, 'rgba(36,34,30,0.98)'],
          [0.16, 'rgba(48,44,40,0.9)'], [0.32, 'rgba(62,58,52,0.72)'],
          [0.52, 'rgba(78,72,66,0.42)'], [0.78, 'rgba(90,84,76,0.16)'], [1, 'rgba(98,92,84,0)'],
        ], 256);
        this.exhaustBillowTex = PG.glowTex([
          [0, 'rgba(34,32,28,0.98)'], [0.1, 'rgba(46,42,38,0.92)'],
          [0.24, 'rgba(58,54,48,0.78)'], [0.45, 'rgba(72,66,60,0.52)'],
          [0.68, 'rgba(86,80,72,0.24)'], [1, 'rgba(96,90,82,0)'],
        ], 288);
        this.dustTex = PG.glowTex([
          [0, 'rgba(160,130,90,0.7)'], [0.35, 'rgba(130,105,75,0.45)'], [1, 'rgba(100,80,55,0)'],
        ], 64);
        this.heatTex = PG.glowTex([
          [0, 'rgba(255,248,220,0.55)'], [0.15, 'rgba(255,220,160,0.38)'],
          [0.4, 'rgba(255,180,100,0.18)'], [0.7, 'rgba(220,140,70,0.06)'], [1, 'rgba(180,100,50,0)'],
        ], 128);
      }
      for (const p of this.vessel.parts.values()) {
        if (!p.def.engine) continue;
        const mesh = this.meshes.get(p.uid);
        const pl = mesh.userData.plume || { y: -p.def.h / 2, r: 0.3 };
        const cone = tunePlumeMesh(new THREE.Mesh(
          new THREE.CylinderGeometry(pl.r * 0.08, pl.r * 1.5, 1, 24, 1, true),
          plumeMat(this.plumeTex, 0xffc880)));
        cone.rotation.x = Math.PI;
        cone.position.y = pl.y;
        cone.visible = false;
        mesh.add(cone);
        const core = tunePlumeMesh(new THREE.Mesh(
          new THREE.CylinderGeometry(pl.r * 0.03, pl.r * 0.62, 1, 16, 1, true),
          plumeMat(this.coreTex, 0xfff4e0)));
        core.rotation.x = Math.PI;
        core.position.y = pl.y;
        core.visible = false;
        mesh.add(core);
        const sprites = [];
        for (let si = 0; si < 5; si++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: si < 2 ? this.coreTex : this.plumeTex, color: si < 2 ? 0xfff8e8 : 0xffb060,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
          }));
          sp.renderOrder = 12;
          sp.visible = false;
          mesh.add(sp);
          sprites.push(sp);
        }
        const flash = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
        }));
        flash.renderOrder = 13;
        flash.position.y = pl.y + 0.05;
        flash.visible = false;
        mesh.add(flash);
        this.plumes.push({ uid: p.uid, cone, core, flash, sprites, baseY: pl.y, r: pl.r, drop: pl.r * 0.28 });
      }
      /* smoke / dust pool — exhaust and pad billow use separate partitions */
      this.ensureSmokePool();
      this.legPivots = [];
      for (const p of this.vessel.parts.values()) {
        if (!p.def.leg) continue;
        const piv = this.meshes.get(p.uid).getObjectByName('legPivot');
        if (piv) this.legPivots.push({ uid: p.uid, piv });
      }
      this.applyGear();
    },

    /* KSP-style reentry heating: parts glow by temperature, not a blob sprite */
    updateHeatVisuals() {
      const reentry = (this.heatFlux || 0) > 10;
      const vHat = this.v && this.v.lengthSq() > 4 ? _a.copy(this.v).normalize() : null;
      const vLocal = vHat ? _b.copy(vHat).applyQuaternion(_q.copy(this.quat).invert()) : null;
      let minProj = 0, maxProj = 1;
      if (vLocal) {
        minProj = 1e9; maxProj = -1e9;
        for (const p of this.vessel.parts.values()) {
          const proj = p.pos.dot(vLocal);
          if (proj < minProj) minProj = proj;
          if (proj > maxProj) maxProj = proj;
        }
      }
      const span = Math.max(maxProj - minProj, 0.5);
      for (const p of this.vessel.parts.values()) {
        const g = this.meshes.get(p.uid);
        if (!g) continue;
        const t = p.temp || 280;
        const maxT = p.def.maxTemp || 1300;
        const heatF = reentry && t > 480 ? clamp((t - 480) / (maxT - 480), 0, 1) : 0;
        const lead = vLocal ? 0.25 + 0.75 * ((p.pos.dot(vLocal) - minProj) / span) : 1;
        g.traverse(o => {
          if (!o.isMesh || !o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (!m || !m.emissive) continue;
            if (o.userData.nozzleHotMat === m) continue;
            const base = m.userData._heatBase ?? 0;
            const baseI = m.userData._heatEI ?? 0;
            const h = heatF * lead;
            if (h < 0.03) {
              m.emissive.setHex(base);
              m.emissiveIntensity = baseI;
            } else {
              m.emissive.setHSL(0.08 - h * 0.08, 1, 0.22 + h * 0.48);
              m.emissiveIntensity = h * 2.4;
            }
          }
        });
      }
    },
    applyGear() {
      for (const lp of this.legPivots) lp.piv.rotation.x = this.gear ? -0.45 : -2.1;
      for (const p of this.vessel.parts.values()) {
        if (p.def.solar && p.def.solar.deploy) {
          const arm = this.meshes.get(p.uid).getObjectByName('solarArm');
          if (arm) arm.scale.z = p.deployed ? 1 : 0.06;
        }
      }
    },

    /* ============== fuel feeds ============== */
    updateFeeds() {
      this.feeds = new Map();
      for (const p of this.vessel.parts.values()) {
        if (p.def.engine) this.feeds.set(p.uid, this.vessel.feedTanks(p.uid, p.def.engine.prop));
      }
      /* contact candidates: legs + wheels + the 6 lowest parts */
      const all = [...this.vessel.parts.values()];
      const legs = all.filter(p => p.def.leg || p.def.gearWheel);
      const lows = all.filter(p => !p.def.leg && !p.def.gearWheel).sort((a, b2) => (a.pos.y - (a.def.h || 0.4) / 2) - (b2.pos.y - (b2.def.h || 0.4) / 2)).slice(0, 6);
      this.contactParts = [...legs, ...lows];
      this.massDirty = true;
    },
    massProps() {
      if (this.massDirty || !this._mp) { this._mp = this.vessel.massProps(); this.massDirty = false; }
      return this._mp;
    },

    /* ============== staging ============== */
    stage() {
      if (this.dead || !this.stagesLeft.length) return;
      const stage = this.stagesLeft.shift();
      if (!this.launched) this.onLaunch();
      let fired = false;
      for (const uid of stage) {
        const p = this.vessel.parts.get(uid);
        if (!p) continue;
        fired = true;
        if (p.def.engine) {
          this.lit.add(uid);
          /* optional ignition reliability (campaign setting) */
          if (GAME.save.cfg && GAME.save.cfg.failures && !p.def.engine.srb && Math.random() < 0.04) {
            p.failed = true;
            UI.toast('IGNITION FAILURE', p.def.name + ' refused to light — right-click to retry.', 'bad', 5000);
            AUDIO.alarm();
          }
          if (p.def.engine.srb) AUDIO.thunk(0.6);
        }
        if (p.def.chute) { p.chuteArmed = true; }
        if (p.def.decouple) this.fireDecoupler(p);
        if (p.def.fairing) this.jettisonFairing(p);
      }
      AUDIO.thunk(0.45);
      this.refreshStagesHud();
      if (!fired && !this.stagesLeft.length) UI.toast('Staging complete', '', '');
    },
    onLaunch() {
      this.launched = true;
      this.met = 0;
      if (this.isPlane) {
        if (this.throttle < 0.15) this.throttle = 0.35;
      } else if (this.throttle === 0) this.throttle = 1;
      CAREER.event('launch');
      AUDIO.blip(300, 0.4, 0.2, 'sawtooth');
    },
    fireDecoupler(p) {
      /* subtree containing root stays; other side becomes debris */
      const subUids = this.vessel.subtreeUids(p.uid);
      const rootSide = !subUids.includes(this.vessel.root);
      const dropUids = rootSide ? subUids : null;
      if (!rootSide) {
        /* decoupler is above root?? drop the parent side: not supported; drop decoupler's children */
        return;
      }
      this.spawnDebris(dropUids, p.def.decouple.v);
      this.vessel.removeSubtree(p.uid);
      this.massDirty = true;
      this.updateFeeds();
      this.rebuildVesselGroup();
      AUDIO.thunk(0.7);
    },
    jettisonFairing(p) {
      const mesh = this.meshes.get(p.uid);
      if (!mesh) return;
      for (let i = 0; i < 2; i++) {
        const half = mesh.getObjectByName('fairingHalf' + i);
        if (!half) continue;
        const wp = half.getWorldPosition(new THREE.Vector3());
        const wq = half.getWorldQuaternion(new THREE.Quaternion());
        mesh.remove(half);
        half.position.copy(wp.sub(this.vGroup.position));
        half.quaternion.copy(wq);
        this.scene.add(half);
        const dir = _a.set(i ? 1 : -1, 0.2, 0).applyQuaternion(this.quat);
        this.debris.push({
          group: half, rRel: half.position.clone(), vRel: dir.clone().multiplyScalar(6),
          spin: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, 0), life: 25, simple: true,
        });
      }
      p.fairingGone = true;
      this.massDirty = true;
      AUDIO.thunk(0.5);
    },
    spawnDebris(uids, sepV) {
      /* build a debris object from dropped parts */
      const frag = { name: 'debris', parts: [], stages: [], root: uids[0], nextUid: 1 };
      for (const u of uids) {
        const p = this.vessel.parts.get(u);
        if (!p) continue;
        const att = Object.assign({}, p.attach);
        if (u === uids[0]) att.type = 'root';
        frag.parts.push({ uid: u, id: p.id, attach: att, res: Object.assign({}, p.res) });
      }
      let dv;
      try { dv = Vessel.deserialize(frag); } catch (e) { return; }
      const { group } = dv.buildGroup();
      /* position relative to vessel: anchor at the dropped root part's current offset */
      const anchor = this.vessel.parts.get(uids[0]);
      const off = anchor.pos.clone();
      group.quaternion.copy(this.quat);
      group.position.copy(off).applyQuaternion(this.quat).add(this.vGroup.position);
      /* subtract the local offset of the fragment root inside the rebuilt group */
      const fr = dv.parts.get(uids[0]);
      const innerOff = fr.pos.clone().applyQuaternion(this.quat);
      group.position.sub(innerOff);
      this.scene.add(group);
      const sepDir = _a.set(0, -1, 0).applyQuaternion(this.quat);
      this.debris.push({
        group, body: this.body,
        r: this.r.clone().add(_b.copy(group.position).sub(this.vGroup.position)),
        v: this.v.clone().addScaledVector(sepDir, sepV),
        quat: group.quaternion.clone(),
        spin: new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4),
        life: 240, mass: 500,
        craft: dv.serialize(), partCount: dv.parts.size,
        name: (this.flightName || 'Vessel') + ' debris',
      });
      if (this.debris.length > 14) {
        const old = this.debris.shift();
        this.scene.remove(old.group);
      }
    },

    persistDebris(d) {
      if (!GAME.save.debris) GAME.save.debris = [];
      const t = GAME.ut;
      const bf = CEL.inertialToBf(this.body, d.r, t, new THREE.Vector3());
      const ang = CEL.spinAngle(this.body, t);
      const unspin = _q.setFromAxisAngle(_a.set(0, 1, 0), -ang);
      const landedQuat = new THREE.Quaternion().copy(unspin).multiply(d.quat).toArray();
      const dirBf = CEL.inertialToBf(this.body, _b.copy(d.r).normalize(), t, _c);
      const th = CEL.heightAt(this.body, dirBf);
      GAME.save.debris.push({
        did: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: d.name || 'Debris',
        bodyId: this.body.id,
        landedPos: bf.toArray(),
        landedQuat,
        craft: d.craft,
        splashed: isOverOcean(this.body, th),
        partCount: d.partCount || 0,
        landedUt: t,
      });
      GAME.saveNow();
    },

    /* ============== physics ============== */
    step(h) {
      const t = GAME.ut;
      if (this.landed) {
        this.syncLanded(t);
        if (this.isPlane) {
          /* aircraft roll on the runway — leave the pad when throttling up, not at TWR>1 */
          if (this.throttle > 0.04 || this.lit.size > 0) {
            this.landed = false;
            this.holdQuat.copy(this.quat);
          } else {
            this.drainAndCharge(h);
            return;
          }
        } else {
          const { m } = this.massProps();
          const thrust = this.currentThrust();
          const g = this.body.mu / this.r.lengthSq();
          if (thrust / m > g * 0.98) {
            this.landed = false;
            this.angVel.set(0, 0, 0);
          } else {
            this.drainAndCharge(h);
            return;
          }
        }
      }
      const { m, com, moi } = this.massProps();
      const F = new THREE.Vector3();
      const tau = new THREE.Vector3();
      /* gravity */
      const r2 = this.r.lengthSq(), rl = Math.sqrt(r2);
      const up = P_UP.copy(this.r).divideScalar(rl);
      F.addScaledVector(up, -this.body.mu * m / r2);
      const dbg = this.dbg = { grav: this.body.mu * m / r2, thrust: 0, aero: 0, chute: 0, contact: 0 };
      /* altitude / atmosphere */
      const bfDir = CEL.inertialToBf(this.body, up, t, P_BF);
      const terrainH = this.body.sampler ? CEL.heightAt(this.body, bfDir) : 0;
      const alt = rl - this.body.R;
      const agl = alt - Math.max(terrainH, this.body.ocean ? 0 : terrainH);
      this.alt = alt; this.agl = agl; this.terrainH = terrainH;
      const rho = CEL.atmoDensity(this.body, alt);
      const pres = CEL.atmoPressure(this.body, alt);
      this.pres = pres;
      /* airspeed: subtract rotating atmosphere */
      const om = CEL.spinOmega(this.body, P_W1);
      const vAtm = P_VATM.crossVectors(om, this.r);
      const vAir = P_VAIR.copy(this.v).sub(vAtm);
      const vAirMag = vAir.length();
      this.q = 0.5 * rho * vAirMag * vAirMag;
      this.srfSpeed = vAirMag;

      /* --- engines --- */
      const nose = P_NOSE.set(0, 1, 0).applyQuaternion(this.quat);
      let thrustTotal = 0, srbOn = false;
      for (const p of this.vessel.parts.values()) {
        if (!p.def.engine || !this.lit.has(p.uid)) continue;
        const e = p.def.engine;
        let thr = e.srb ? 1 : this.throttle;
        if (e.airBreather) {
          /* turbofans breathe atmosphere: thrust scales with density, dies in vacuum */
          thr *= clamp(pres * 2.4, 0, 1);
          if (pres < 0.02) { if (!p.flameout) { p.flameout = true; UI.toast('Flameout', p.def.name + ' — no air', 'warn', 2000); } continue; }
        }
        if (p.failed) continue;
        if (thr <= 0) continue;
        const feed = this.feeds.get(p.uid) || [];
        const isp = e.airBreather ? e.ispA : lerp(e.ispA, e.ispV, 1 - pres);
        const mdotFull = e.thrust / ((e.airBreather ? e.ispA : e.ispV) * 9.81);
        let avail = 0;
        for (const tk of feed) avail += tk.res[e.prop] || 0;
        if (avail <= 0.001) { if (!p.flameout) { p.flameout = true; if (!e.srb) UI.toast('Flameout', p.def.name + ' starved', 'warn', 2000); } continue; }
        p.flameout = false;
        const mdot = mdotFull * thr;
        const need = Math.min(mdot * h, avail);
        const per = need / feed.length;
        if (!window.DBG || !DBG.infFuel) {
          for (const tk of feed) {
            tk.res[e.prop] = Math.max(0, (tk.res[e.prop] || 0) - per);
          }
        }
        const fmag = need / h * isp * 9.81;
        thrustTotal += fmag;
        if (e.srb) srbOn = true;
        /* thrust along engine axis with gimbal */
        const dir = P_DIR.copy(nose);
        if (e.gimbal && this.cmd) {
          /* deflect thrust so the torque about CoM matches wheel/RCS sign convention */
          const gp = this.cmd.pitch * e.gimbal * U.DEG, gy = -this.cmd.yaw * e.gimbal * U.DEG;
          dir.set(0, 1, 0).applyAxisAngle(P_W1.set(1, 0, 0), gp);
          dir.applyAxisAngle(P_W1.set(0, 0, 1), gy).applyQuaternion(this.quat);
        }
        F.addScaledVector(dir, fmag);
        /* torque from engine offset (gimbal steering + asymmetric mounts) */
        const lever = P_LEV.copy(p.pos).sub(com).applyQuaternion(this.quat);
        tau.add(P_W2.crossVectors(lever, P_W1.copy(dir).multiplyScalar(fmag)));
        this.massDirty = true;
      }
      this.thrustNow = thrustTotal;
      this.srbOn = srbOn;
      dbg.thrust = thrustTotal;

      /* --- aero --- */
      const dbgAero = window.DBG && DBG.aeroVectors;
      if (dbgAero) this.aeroDbg = [];
      if (rho > 1e-7 && vAirMag > 0.5) {
        const vHat = P_VHAT.copy(vAir).divideScalar(vAirMag);
        const upV = P_W1.set(0, 1, 0).applyQuaternion(this.quat);
        const axisDot = Math.abs(upV.dot(vHat));
        const fairings = [...this.vessel.parts.values()].filter(p => p.def.fairing && !p.fairingGone);
        for (const p of this.vessel.parts.values()) {
          const r = PARTS.SIZES[p.def.size] / 2;
          /* fairing shadow: parts above an intact fairing base are protected */
          let shielded = false;
          for (const f of fairings) {
            if (p.pos.y > f.pos.y && p.pos.y < f.pos.y + f.def.fairing.hShell && Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) < f.def.fairing.r) { shielded = true; break; }
          }
          if (shielded || p.uid === undefined) continue;
          const frontal = Math.PI * r * r;
          const lateral = 2 * r * (p.def.h || 0.5);
          let cd = p.def.nose ? 0.18 : 0.55;
          /* stacked parts get reduced frontal drag */
          const hasAbove = p.children.some(c => { const cp = this.vessel.parts.get(c); return cp && cp.attach.type === 'node' && cp.def.nodes[cp.attach.mIdx] && cp.def.nodes[cp.attach.mIdx].dir === 'down'; })
            || (p.attach && p.attach.type === 'node' && this.vessel.parts.get(p.attach.parent) && p.def.nodes[p.attach.mIdx] && p.def.nodes[p.attach.mIdx].dir === 'up');
          if (hasAbove) cd *= 0.35;
          const area = lerp(lateral * 1.1, frontal * cd * 2, axisDot * axisDot);
          const fd = this.q * area * 0.5;
          const lever = P_LEV.copy(p.pos).sub(com).applyQuaternion(this.quat);
          F.addScaledVector(vHat, -fd);
          dbg.aero += fd;
          tau.add(P_W2.crossVectors(lever, _a.copy(vHat).multiplyScalar(-fd)));
          if (dbgAero && fd > 1) this.aeroDbg.push({
            pos: p.pos.clone().applyQuaternion(this.quat),
            vec: vHat.clone().multiplyScalar(-fd), col: 0xff6a5e,
          });
          /* chutes */
          if (p.chuteState && !p.chuteCut) {
            const ch = p.def.chute;
            const A = p.chuteState === 2 ? ch.areaFull : ch.areaSemi;
            const fc = Math.min(this.q * A * 1.2, m * 90);
            F.addScaledVector(vHat, -fc);
            dbg.chute += fc;
            tau.add(P_W2.crossVectors(lever, _a.copy(vHat).multiplyScalar(-fc)));
            if (this.q > ch.maxQ && p.chuteState === 2) {
              p.chuteState = 0; p.chuteArmed = false; p.chuteBroken = true;
              const can = this.meshes.get(p.uid) && this.meshes.get(p.uid).getObjectByName('canopy');
              if (can) can.visible = false;
              UI.toast('Parachute destroyed', 'Dynamic pressure too high!', 'bad');
              AUDIO.alarm();
            }
          }
          /* fins: lift + control. Wings get a real lift curve (sin 2α) applied
             perpendicular to the airflow — planes actually fly now. */
          if (p.def.fin) {
            const S = p.def.fin.area;
            const nrm = _a.set(1, 0, 0).applyQuaternion(P_Q.setFromAxisAngle(_b.set(0, 1, 0), p.attach.angle || 0)).applyQuaternion(this.quat);
            const slip = nrm.dot(vHat);
            let lmag, liftDir;
            if (p.def.fin.wing) {
              /* lift ⟂ airflow (in the airflow/wing-normal plane), sin-curve stall past ~30° */
              liftDir = _b.copy(nrm).addScaledVector(vHat, -slip).normalize();
              const cl = Math.sin(2 * Math.asin(clamp(slip, -1, 1)));
              lmag = this.q * S * 1.35 * clamp(cl, -1.2, 1.2);
              F.addScaledVector(liftDir, -lmag);
              tau.add(P_W2.crossVectors(lever, _a.copy(liftDir).multiplyScalar(-lmag)));
            } else {
              lmag = this.q * S * 2.2 * clamp(slip, -0.4, 0.4);
              liftDir = nrm;
              F.addScaledVector(nrm, -lmag);
              tau.add(P_W2.crossVectors(lever, _a.copy(nrm).multiplyScalar(-lmag)));
            }
            if (dbgAero && Math.abs(lmag) > 1) this.aeroDbg.push({
              pos: p.pos.clone().applyQuaternion(this.quat),
              vec: liftDir.clone().multiplyScalar(-lmag), col: 0x7adfff,
            });
            if (p.def.fin.ctrl && this.cmd) {
              const authority = this.q * S * 1.5;
              tau.addScaledVector(_a.set(1, 0, 0).applyQuaternion(this.quat), -this.cmd.pitch * authority * Math.abs(lever.y) * 0.5);
              tau.addScaledVector(_a.set(0, 0, 1).applyQuaternion(this.quat), this.cmd.yaw * authority * Math.abs(lever.y) * 0.5);
              tau.addScaledVector(_a.set(0, 1, 0).applyQuaternion(this.quat), -this.cmd.roll * authority * 0.6);
            }
          }
        }
      }

      /* --- reaction wheels & RCS torque --- */
      let wheelTorque = 0;
      for (const p of this.vessel.parts.values()) {
        if (p.def.pod) wheelTorque += p.def.pod.torque * 1000;
        if (p.def.probe) wheelTorque += p.def.probe.torque * 1000;
        if (p.def.wheel) wheelTorque += p.def.wheel.torque * 1000;
      }
      if (this.charge <= 0.01) wheelTorque *= 0.1;
      tau.addScaledVector(_a.set(1, 0, 0).applyQuaternion(this.quat), -this.cmd.pitch * wheelTorque);
      tau.addScaledVector(_a.set(0, 0, 1).applyQuaternion(this.quat), this.cmd.yaw * wheelTorque);
      tau.addScaledVector(_a.set(0, 1, 0).applyQuaternion(this.quat), -this.cmd.roll * wheelTorque);
      /* RCS */
      if (this.rcs) {
        let rcsThrust = 0;
        const rcsParts = [...this.vessel.parts.values()].filter(p => p.def.rcs);
        const monoTotal = this.resTotal('mono');
        if (rcsParts.length && monoTotal > 0.01) {
          for (const p of rcsParts) rcsThrust += p.def.rcs.thrust;
          const tv = _a.set(this.ctrl.tx, this.ctrl.ty, this.ctrl.tz);
          if (tv.lengthSq() > 0) {
            tv.normalize().applyQuaternion(this.quat);
            F.addScaledVector(tv, rcsThrust);
            this.drainRes('mono', rcsThrust / (240 * 9.81) * h);
          }
          const rcsTau = rcsThrust * 2.2;
          tau.addScaledVector(_b.set(1, 0, 0).applyQuaternion(this.quat), -this.cmd.pitch * rcsTau);
          tau.addScaledVector(_b.set(0, 0, 1).applyQuaternion(this.quat), this.cmd.yaw * rcsTau);
          tau.addScaledVector(_b.set(0, 1, 0).applyQuaternion(this.quat), -this.cmd.roll * rcsTau);
          if (this.cmd.pitch || this.cmd.yaw || this.cmd.roll) this.drainRes('mono', rcsThrust / (300 * 9.81) * h * 0.4);
        }
      }

      /* --- ground contact --- */
      this.contact = false;
      const onOcean = isOverOcean(this.body, terrainH);
      if (agl < 80 || (onOcean && alt < 25)) this.groundContact(h, m, com, F, tau, t, vAtm, terrainH);

      /* --- buoyancy / splash (KSP-style float at sea level) --- */
      if (onOcean && alt < 35) {
        if (!this.splashed && vAirMag > 10 && alt < 6) { AUDIO.explosion(0.3); this.spawnSplashFx(); }
        this.splashed = true;
        const floatAlt = waterFloatAlt(this.vessel);
        const sub = clamp(floatAlt - alt, 0, 8);
        const buoyK = m * this.body.g0 * 2.8;
        F.addScaledVector(up, buoyK * sub);
        const vRel = P_W1.copy(this.v).sub(vAtm);
        const vVert = vRel.dot(up);
        F.addScaledVector(up, -m * 2.4 * vVert * clamp(0.28 + sub * 0.32, 0.28, 1));
        const vHoriz = P_W2.copy(vRel).addScaledVector(up, -vVert);
        F.addScaledVector(vHoriz, -m * 0.62 * clamp(sub / 1.8, 0.18, 1));
        if (sub > 0.04 && vAirMag < 3) {
          const bob = Math.sin(GAME.ut * 1.65 + this.r.x * 1e-6) * 0.14 + Math.sin(GAME.ut * 2.4) * 0.07;
          tau.addScaledVector(P_DIR.set(1, 0, 0).applyQuaternion(this.quat), bob * m * 3.8);
          tau.addScaledVector(P_DIR.set(0, 0, 1).applyQuaternion(this.quat), Math.cos(GAME.ut * 1.9) * bob * m * 2.4);
        }
      } else if (!this.landed) this.splashed = false;

      /* --- integrate linear --- */
      this.v.addScaledVector(F, h / m);
      this.r.addScaledVector(this.v, h);
      /* --- integrate angular (vessel-local) --- */
      const qi = _q.copy(this.quat).invert();
      const tauL = _a.copy(tau).applyQuaternion(qi);
      this.angVel.x += tauL.x / moi.x * h;
      this.angVel.y += tauL.y / moi.y * h;
      this.angVel.z += tauL.z / moi.z * h;
      this.angVel.multiplyScalar(1 - 0.12 * h);
      const w = this.angVel;
      const dq = new THREE.Quaternion(w.x * h / 2, w.y * h / 2, w.z * h / 2, 1);
      this.quat.multiply(dq).normalize();

      /* --- heating --- */
      this.heating(h, rho, vAirMag, m);
      this.drainAndCharge(h);
      this.checkChutes(agl);
      this.checkSOI(t);
      this.checkLandedState(h, vAtm);
      if (this.agl < 150 || this.contact) {
        if (this.correctGroundPosition(t) > 0.002) {
          const rl2 = this.r.length();
          this.alt = rl2 - this.body.R;
          const bfDir2 = CEL.inertialToBf(this.body, _c.copy(this.r).divideScalar(rl2), t, P_BF);
          this.terrainH = CEL.heightAt(this.body, bfDir2);
          this.agl = this.alt - Math.max(this.terrainH, this.body.ocean ? 0 : this.terrainH);
        }
      }
    },

    groundContact(h, m, com, F, tau, t, vAtm, terrainH) {
      /* sample contact points: legs (if deployed) + lowest parts */
      const pts = [];
      for (const p of (this.contactParts || [])) {
        if (!this.vessel.parts.has(p.uid)) continue;
        if (p.def.gearWheel) {
          /* wheels are always down; rolling = near-zero longitudinal friction */
          const reach = p.def.gearWheel.len;
          pts.push({ p, local: new THREE.Vector3(p.pos.x, p.pos.y - reach * 0.5, p.pos.z + reach * 0.3), leg: true, wheel: true, tol: p.def.crashTol });
          continue;
        }
        if (p.def.leg && this.gear) {
          const reach = p.def.leg.len * 0.96;
          pts.push({ p, local: new THREE.Vector3(p.pos.x, p.pos.y - reach * 0.55, p.pos.z + reach * 0.62), leg: true, tol: p.def.crashTol });
          continue;
        }
        if (p.def.leg) continue;
        pts.push({ p, local: new THREE.Vector3(p.pos.x, p.pos.y - (p.def.h || 0.4) / 2, p.pos.z), leg: false, tol: p.def.crashTol });
      }
      const up = _b.copy(this.r).normalize();
      let anyContact = false;
      for (const pt of pts) {
        const world = _c.copy(pt.local).applyQuaternion(this.quat).add(this.r);
        const wl = world.length();
        const dirBf = CEL.inertialToBf(this.body, _d.copy(world).divideScalar(wl), t, new THREE.Vector3());
        const th = this.body.sampler ? CEL.heightAt(this.body, dirBf) : 0;
        const onWater = isOverOcean(this.body, th);
        const floor = onWater ? waterContactFloor(this.vessel) : th;
        const pen = (this.body.R + floor) - wl;
        if (pen <= 0) continue;
        anyContact = true;
        /* impact speed check */
        const vRel = _d.copy(this.v).sub(vAtm);
        const vImpact = vRel.length();
        const tol = onWater ? pt.tol + 8 : pt.tol;
        if (vImpact > tol + 0.5) { this.destroyPart(pt.p, 'crashed into terrain'); continue; }
        /* spring-damper — softer on water */
        const k = m * this.body.g0 * (onWater ? 4.2 : (pt.leg ? 9 : 18)) / Math.max(pts.length * 0.25, 1);
        const vN = vRel.dot(up);
        let fn = k * pen - vN * k * 0.36;
        fn = Math.max(fn, 0);
        F.addScaledVector(up, fn);
        /* friction (wheels roll: drastically less grip along the ground) */
        const vT = _d.copy(vRel).addScaledVector(up, -vN);
        const mu = pt.wheel ? 0.08 : 1.4;
        F.addScaledVector(vT, -Math.min(fn * mu / Math.max(vT.length(), 0.4), m * 8));
        const lever = new THREE.Vector3().copy(pt.local).sub(com).applyQuaternion(this.quat);
        tau.add(new THREE.Vector3().crossVectors(lever, _d.copy(up).multiplyScalar(fn)));
        /* lateral damping torque */
      }
      this.contact = anyContact;
      if (anyContact) this.angVel.multiplyScalar(1 - 2.4 * h);
    },

    checkLandedState(h, vAtm) {
      if (this.landed) return;
      const vSurf = _a.copy(this.v).sub(vAtm).length();
      const onOcean = isOverOcean(this.body, this.terrainH ?? 0);
      const waterSettled = onOcean && this.splashed && (this.alt ?? 99) < 18 && vSurf < 1.4;
      const groundSettled = this.contact && vSurf < 0.4;
      if ((groundSettled || waterSettled) && this.thrustNow < 1) {
        this.stillTime = (this.stillTime || 0) + h;
        if (this.stillTime > (waterSettled ? 0.45 : 0.7)) {
          this.landed = true;
          this.landedSplashed = !!this.splashed;
          const t = GAME.ut;
          this.correctGroundPosition(t);
          const ang = CEL.spinAngle(this.body, t);
          const unspin = _q.setFromAxisAngle(_a.set(0, 1, 0), -ang);
          this.landedBf = {
            pos: CEL.inertialToBf(this.body, this.r, t, new THREE.Vector3()),
            quat: new THREE.Quaternion().copy(unspin).multiply(this.quat),
          };
          this.cutChutesOnLanding();
          const situ = this.splashed ? 'splashed' : 'landed';
          if (this.launched && this.met > 3) {
            UI.toast(situ === 'splashed' ? 'Splashdown!' : 'Touchdown!', this.body.name + ' — ' + this.biomeName(), '');
            CAREER.event('landed', { body: this.body.id });
            this.flags['landed_' + this.body.id] = true;
            if (this.body.id === 'selene') this.flags.landedSelene = true;
            AUDIO.jingle(true);
          }
        }
      } else this.stillTime = 0;
    },

    cutChutesOnLanding() {
      for (const p of this.vessel.parts.values()) {
        if (!p.def.chute || !p.chuteState || p.chuteCut) continue;
        p.chuteCut = true;
        p.chuteCollapse = 0;
        p.chuteSide = (p.uid % 2 ? 1 : -1) * (p.def.chute.drogue ? 0.7 : 1);
      }
    },

    heating(h, rho, vAir, m) {
      /* negligible below ~550 m/s, deadly on steep unshielded reentry */
      const ve = Math.max(vAir - 550, 0);
      const flux = ve * ve * ve * Math.sqrt(rho) * 8e-6;
      this.heatFlux = flux;
      if (flux < 4) { for (const p of this.vessel.parts.values()) p.temp = Math.max((p.temp || 280) - 60 * h, 280); return; }
      const vHat = _a.copy(this.v).normalize();
      /* find shield: a shield part facing the airflow protects everything behind */
      let shielded = false;
      let shieldPart = null;
      for (const p of this.vessel.parts.values()) {
        if (!p.def.shield || (p.res.ablator || 0) <= 0) continue;
        const up = _b.set(0, 1, 0).applyQuaternion(this.quat);
        const shieldFacing = -up.dot(vHat) * (p.pos.y < 0 ? 1 : -1);
        if (Math.abs(up.dot(vHat)) > 0.55) { shielded = true; shieldPart = p; break; }
      }
      /* leading-edge weighting: parts facing the airflow soak the most flux */
      const vLocal = _b.copy(vHat).applyQuaternion(_q.copy(this.quat).invert());
      let minProj = 1e9, maxProj = -1e9;
      for (const p of this.vessel.parts.values()) {
        const proj = p.pos.dot(vLocal);
        if (proj < minProj) minProj = proj;
        if (proj > maxProj) maxProj = proj;
      }
      const span = Math.max(maxProj - minProj, 0.5);
      for (const p of this.vessel.parts.values()) {
        p.temp = p.temp || 280;
        const lead = 0.35 + 0.65 * ((p.pos.dot(vLocal) - minProj) / span);   // 1 at the leading edge
        const protect = shielded && p !== shieldPart ? 0.06 : 1;
        p.temp += flux * lead * protect * h * (p.def.shield ? 0.25 : 1);
        p.temp -= (p.temp - 280) * 0.35 * h;
        if (p.def.shield && shielded) p.res.ablator = Math.max(0, (p.res.ablator || 0) - flux * h * 0.012);
        if (p.temp > p.def.maxTemp) this.destroyPart(p, 'burned up on reentry');
      }
    },

    drainAndCharge(h) {
      /* electric charge */
      let drain = 0, gen = 0;
      for (const p of this.vessel.parts.values()) {
        if (p.def.probe) drain += p.def.probe.drain;
        if (p.def.solar) {
          if (p.def.solar.rtg) gen += p.def.solar.rate;
          else if (!this.inShadow()) gen += p.def.solar.rate * (p.def.solar.deploy && !p.deployed ? 0 : 1);
        }
        if (p.def.light && p.lightOn) drain += 0.02;
      }
      if (this.sas) drain += 0.012;
      this.adjustCharge((gen - drain) * h);
      this.charge = this.resTotal('charge');
      this.lifeSupport(h);
    },

    /* ============== life support + radiation (hardcore systems) ============== */
    lifeSupport(h) {
      const cfg = GAME.save.cfg || {};
      const crewN = (this.crew || []).length;
      /* radiation dose */
      if (cfg.radiation !== false) {
        const rad = CEL.radiationAt(this.body, this.r, GAME.ut);   // rad/h
        let shield = 1;
        for (const p of this.vessel.parts.values()) if (p.def.radShield) shield *= p.def.radShield;
        if (this.body.atmo && this.alt < 12000) shield *= 0.4;
        this.radNow = rad * shield;
        if (crewN) {
          this.crewDose = (this.crewDose || 0) + this.radNow * h / 3600;
          if (this.crewDose > 18 && !this.radWarn1) { this.radWarn1 = true; UI.toast('Radiation sickness', 'The crew has absorbed a dangerous dose!', 'warn'); AUDIO.alarm(); }
          if (this.crewDose > 40 && !this.dead) { this.killCrew('lethal radiation dose'); }
        }
        /* storm alert */
        const storm = CEL.stormAt(GAME.ut);
        if (storm > 0 && !this.stormWarned) { this.stormWarned = true; UI.toast('SOLAR STORM IN PROGRESS', 'Radiation greatly elevated — shelter behind shielding or an atmosphere!', 'warn', 7000); AUDIO.alarm(); }
        if (storm === 0) this.stormWarned = false;
      } else this.radNow = 0;
      /* supplies (EVA suits carry their own sealed loop) */
      if (cfg.lifeSupport !== false && crewN && !this.isEva) {
        const need = crewN * h / 21600;                            // 1 unit per crew per 6h
        const have = this.resTotal('supplies');
        if (have > 0) {
          this.drainRes('supplies', Math.min(need, have));
          this.starvedT = 0;
        } else {
          this.starvedT = (this.starvedT || 0) + h;
          if (!this.starveWarn) { this.starveWarn = true; UI.toast('Supplies exhausted', 'The crew is running on fumes — get them home!', 'warn', 6000); AUDIO.alarm(); }
          if (this.starvedT > 3600 * 3 && !this.dead) this.killCrew('ran out of supplies');
        }
      }
    },
    killCrew(why) {
      if (!this.crew || !this.crew.length) return;
      UI.toast('CREW LOST', `${this.crew.join(', ')} — ${why}.`, 'bad', 8000);
      this.crew = [];
      this.flags.crewLost = true;
      const el2 = document.getElementById('fl-crew');
      if (el2) el2.innerHTML = '';
      if (GAME.save.cfg && GAME.save.cfg.hardcore) this.vesselLost(why);
    },
    /* probes need power + a relay link home; crews need to be alive */
    hasLiveControl() {
      const crewN = (this.crew || []).length;
      for (const p of this.vessel.parts.values()) {
        if (p.def.pod && crewN) return true;
        if (p.def.probe && this.charge > 0.05) {
          if (this.signal && !this.signal.ok && !this.isEva) return false;
          return true;
        }
      }
      return false;
    },
    updateSignal(dt) {
      this.sigT = (this.sigT || 0) + dt;
      if (this.sigT < 1 && this.signal) return;
      this.sigT = 0;
      const crewN = (this.crew || []).length;
      if (crewN || this.isEva) { this.signal = { ok: true, strength: 1, hops: 0, crewed: true }; return; }
      if (window.DBG && DBG.forceSignal) { this.signal = { ok: true, strength: 1, hops: 0 }; return; }
      const was = this.signal && this.signal.ok;
      this.signal = COMMS.signalFor(this);
      if (was && !this.signal.ok) { UI.toast('SIGNAL LOST', 'No relay path to Mission Control — probe is on its own.', 'warn', 4000); AUDIO.alarm(); }
      if (was === false && this.signal.ok) UI.toast('Signal acquired', 'Relay link to Mission Control restored.', 'sci', 2500);
      if (this.signal.ok && this.signal.hops > 1 && this.launched) CAREER.event('relayed');
    },
    inShadow() {
      const sunDir = ORB.bodyAbsPos(this.body, GAME.ut, _a).negate().normalize();
      const r = this.r;
      const proj = r.dot(sunDir);
      if (proj > 0) return false;
      const perp2 = r.lengthSq() - proj * proj;
      return perp2 < this.body.R * this.body.R;
    },
    resTotal(key) {
      let s = 0;
      for (const p of this.vessel.parts.values()) s += p.res[key] || 0;
      return s;
    },
    drainRes(key, amt) {
      const parts = [...this.vessel.parts.values()].filter(p => (p.res[key] || 0) > 0);
      let left = amt;
      for (const p of parts) {
        const take = Math.min(left, p.res[key]);
        p.res[key] -= take;
        left -= take;
        if (left <= 0) break;
      }
      this.massDirty = true;
    },
    adjustCharge(d) {
      if (d >= 0) {
        for (const p of this.vessel.parts.values()) {
          const cap = (p.def.battery && p.def.battery.charge) || (p.def.pod && p.def.pod.charge) || (p.def.probe && p.def.probe.charge) || 0;
          if (!cap) continue;
          const add = Math.min(d, cap - (p.res.charge || 0));
          p.res.charge = (p.res.charge || 0) + add;
          d -= add;
          if (d <= 0) return;
        }
      } else this.drainRes('charge', -d);
    },

    updateChuteVisuals(dt) {
      const t = this.met || 0;
      const _rim = new THREE.Vector3(), _pack = new THREE.Vector3(), _top = new THREE.Vector3(), _bot = new THREE.Vector3();
      for (const p of this.vessel.parts.values()) {
        const root = this.meshes.get(p.uid);
        if (!root || !p.def.chute) continue;
        const can = root.getObjectByName('canopy');
        const linesGrp = root.getObjectByName('chuteLines');
        const riserGrp = root.getObjectByName('chuteRisers');
        const deployed = !!(p.chuteState && !p.chuteCut);
        const collapsing = !!(p.chuteCut && (p.chuteCollapse ?? 1) < 1);
        if (!deployed && !collapsing) {
          if (can) can.visible = false;
          if (linesGrp) linesGrp.visible = false;
          if (riserGrp) riserGrp.visible = false;
          for (const c of root.children) {
            if (c !== can && c !== linesGrp && c !== riserGrp) c.visible = true;
          }
          continue;
        }
        if (!can) continue;
        can.visible = true;
        if (p.chuteCut) {
          p.chuteCollapse = Math.min(1, (p.chuteCollapse ?? 0) + dt * 1.35);
        }
        const collapse = p.chuteCut ? (p.chuteCollapse ?? 0) : 0;
        const side = p.chuteSide ?? 1;
        if (linesGrp) linesGrp.visible = collapse < 0.2;
        if (riserGrp) riserGrp.visible = collapse < 0.15;
        for (const c of root.children) {
          if (c !== can && c !== linesGrp && c !== riserGrp) c.visible = collapse < 0.85;
        }
        const visR = root.userData.chuteVisR || 0.78;
        if (!p.chuteCut) {
          const rate = p.chuteState === 1 ? 1.35 : 2.1;
          p.chuteInflate = Math.min(1, (p.chuteInflate == null ? 0 : p.chuteInflate) + dt * rate);
        }
        const inflate = (p.chuteInflate ?? 1) * (1 - collapse);
        const flab = 1 - inflate;
        const semiCap = p.chuteState === 1 ? 0.44 : 1;
        const open = semiCap * (0.1 + inflate * 0.9);
        const bagW = (1 + flab * 0.62) * (1 - collapse * 0.55);
        const bagH = (0.1 + inflate * (p.chuteState === 1 ? 0.38 : 0.9)) * (1 - collapse * 0.88);
        can.scale.set(visR * open * bagW, visR * bagH, visR * open * bagW);
        const sway = Math.sin(t * 2.1 + p.uid * 0.17) * 0.04 * inflate * (1 - collapse);
        const billow = 1 + Math.sin(t * 3.3 + p.uid * 0.31) * 0.03 * inflate * (1 - collapse);
        can.scale.x *= billow;
        can.scale.z *= 2 - billow;
        const baseY = can.userData.baseY || can.position.y;
        can.position.y = baseY + flab * 0.06 - collapse * 0.22;
        can.position.x = collapse * 0.38 * side;
        can.position.z = collapse * 0.12 * Math.abs(side);
        can.rotation.x = -flab * 0.14 + sway + collapse * (1.05 + side * 0.15);
        can.rotation.z = Math.cos(t * 1.7 + p.uid) * (0.04 * flab + 0.03 * inflate) + collapse * side * 1.25;
        can.rotation.y = collapse * side * 0.35;
        const dome = can.getObjectByName('chuteDome');
        if (dome) {
          const domeY = (0.3 + inflate * 0.7) * (1 - collapse * 0.7);
          dome.scale.set((0.5 + inflate * 0.5) * (1 - collapse * 0.4), domeY, (0.5 + inflate * 0.5) * (1 - collapse * 0.4));
          dome.rotation.x = collapse * 0.4 * side;
        }
        const hem = can.getObjectByName('chuteHem');
        if (hem) {
          hem.scale.setScalar((0.35 + inflate * 0.65) * (1 - collapse * 0.5));
          hem.position.y = 0.04 + inflate * 0.04 - collapse * 0.08;
        }
        if (collapse >= 0.99) {
          can.visible = false;
          if (linesGrp) linesGrp.visible = false;
          if (riserGrp) riserGrp.visible = false;
          for (const c of root.children) {
            if (c !== can && c !== linesGrp && c !== riserGrp) c.visible = true;
          }
          p.chuteState = 0;
          continue;
        }
        const packY = root.userData.chutePackY ?? -0.12;
        const riserY = root.userData.chuteRiserY ?? (root.userData.chuteAttachY ?? 0.24) + 0.04;
        const rimY = can.position.y + (can.userData.rimLocalY || 0.06) * can.scale.y;
        const rimR = (can.userData.rimR || 0.86) * can.scale.x * (1 - collapse * 0.35);
        if (linesGrp) {
          const shroud = linesGrp.userData.shroud;
          const n = linesGrp.children.length;
          for (let i = 0; i < n; i++) {
            const entry = shroud?.[i];
            const mesh = entry?.mesh ?? linesGrp.children[i];
            if (!mesh?.isMesh) continue;
            const a = entry?.a ?? (i / n) * Math.PI * 2;
            _rim.set(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR);
            _pack.set(Math.cos(a + 0.15) * 0.03, packY, Math.sin(a + 0.15) * 0.03);
            PARTS.setChuteLine(mesh, _rim, _pack);
          }
        }
        if (riserGrp) {
          const risers = riserGrp.userData.risers;
          const n = riserGrp.children.length;
          const hubY = can.position.y + 0.04 * can.scale.y;
          for (let i = 0; i < n; i++) {
            const entry = risers?.[i];
            const mesh = entry?.mesh ?? riserGrp.children[i];
            if (!mesh?.isMesh) continue;
            const a = entry?.a ?? (i / n) * Math.PI * 2 + Math.PI / 4;
            _top.set(Math.cos(a) * 0.1 * can.scale.x, hubY, Math.sin(a) * 0.1 * can.scale.x);
            _bot.set(Math.cos(a) * 0.06, riserY, Math.sin(a) * 0.06);
            PARTS.setChuteLine(mesh, _top, _bot);
          }
        }
      }
    },

    checkChutes(agl) {
      for (const p of this.vessel.parts.values()) {
        if (!p.def.chute || !p.chuteArmed || p.chuteBroken) continue;
        const ch = p.def.chute;
        const want = agl < ch.fullAlt ? 2 : (this.alt < ch.semiAlt + (ch.drogue ? 30000 : 0) && this.pres > 0.02) ? 1 : 0;
        if (want > (p.chuteState || 0)) {
          const prev = p.chuteState || 0;
          p.chuteState = want;
          p.chuteInflate = prev === 0 ? 0.05 : Math.min(p.chuteInflate || 0.2, 0.42);
          const root = this.meshes.get(p.uid);
          const can = root && root.getObjectByName('canopy');
          if (can) can.visible = true;
          AUDIO.chute();
          if (want === 2) UI.toast('Parachute fully deployed', '', '');
        }
      }
    },

    currentThrust() {
      let s = 0;
      for (const p of this.vessel.parts.values()) {
        if (!p.def.engine || !this.lit.has(p.uid)) continue;
        const feed = this.feeds.get(p.uid) || [];
        let avail = 0;
        for (const tk of feed) avail += tk.res[p.def.engine.prop] || 0;
        if (avail <= 0.001) continue;
        s += p.def.engine.thrust * (p.def.engine.srb ? 1 : this.throttle);
      }
      return s;
    },

    destroyPart(p, why) {
      if (window.DBG && DBG.noDamage) return;
      if (!this.vessel.parts.has(p.uid)) return;
      (this.deathLog = this.deathLog || []).push({ met: Math.round(this.met), part: p.id, why, v: Math.round(this.srfSpeed || 0), alt: Math.round(this.alt || 0) });
      this.spawnExplosion(_a.copy(p.pos).applyQuaternion(this.quat).add(this.vGroup.position), PARTS.SIZES[p.def.size]);
      const isRoot = p.uid === this.vessel.root;
      /* orphaned child stacks tumble away as debris instead of vanishing */
      if (!isRoot) {
        for (const cu of [...p.children]) {
          const sub = this.vessel.subtreeUids(cu);
          if (sub.length) this.spawnDebris(sub, 1.5);
          this.vessel.removeSubtree(cu);
        }
      }
      this.vessel.removeSubtree(p.uid);
      AUDIO.explosion(0.8);
      this.shakeT = 0.7;
      UI.toast(p.def.name + ' destroyed', why, 'bad');
      if (isRoot || !this.vessel.parts.size || !this.vessel.hasControl()) {
        this.vesselLost(why);
        return;
      }
      this.massDirty = true;
      this.updateFeeds();
      this.rebuildVesselGroup();
      this.refreshStagesHud();
    },
    vesselLost(why) {
      if (this.dead) return;
      this.dead = true;
      AUDIO.stopLoops();
      const body = document.createElement('div');
      body.innerHTML = `<div style="font-size:17px;margin-bottom:6px">The vessel was lost — ${why}.</div>
        <div style="color:var(--dim)">The crew (if any) safely teleported back to the astronaut lounge, as is tradition.</div>`;
      UI.dialog({
        title: 'MISSION FAILURE', body, closable: false,
        buttons: [
          { label: 'REVERT TO LAUNCH', cb: () => this.revertLaunch() },
          { label: 'NOVA SPACE CENTER', cls: 'acc', cb: () => { this.abandonFlight(); GAME.go('sc'); } },
        ],
      });
    },
    revertLaunch() {
      if (this.launchSnapshot) GAME.go('flight', { quick: JSON.parse(JSON.stringify(this.launchSnapshot)) });
      else { this.abandonFlight(); GAME.go('sc'); }
    },
    abandonFlight() {
      GAME.save.flights = GAME.save.flights.filter(x => x.fid !== this.fid);
      GAME.saveNow();
    },

    spawnExplosion(scenePos, size) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: PG.glowTex([[0, 'rgba(255,240,200,1)'], [0.25, 'rgba(255,170,60,0.9)'], [0.6, 'rgba(220,80,30,0.5)'], [1, 'rgba(120,40,20,0)']], 128),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sp.position.copy(scenePos);
      sp.scale.setScalar(size * 2);
      this.scene.add(sp);
      this.debris.push({ group: sp, life: 0.9, explo: true, grow: size * 16 });
    },
    spawnSplashFx() {
      for (let i = 0; i < 10; i++) this.emitSmoke(this.vGroup.position, _a.set((Math.random() - 0.5) * 8, Math.random() * 7, (Math.random() - 0.5) * 8), 2.2, 0.8);
    },
    ensureSmokePool() {
      if (this.smoke && this.smoke.length === SMOKE_POOL_N) return;
      if (this.smoke) {
        for (const s of this.smoke) this.scene.remove(s.s);
      }
      this.smoke = [];
      for (let i = 0; i < SMOKE_POOL_N; i++) {
        const exhaust = i < EXHAUST_SMOKE_N;
        const dark = !exhaust && i % 3 === 0;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: dark ? this.smokeDarkTex : (i % 5 === 0 && !exhaust ? this.dustTex : this.smokeTex),
          transparent: true, depthWrite: false, opacity: 0, blending: THREE.NormalBlending,
        }));
        sp.visible = false;
        sp.renderOrder = exhaust ? 5 : 4;
        this.scene.add(sp);
        this.smoke.push({
          s: sp, life: 0, vel: new THREE.Vector3(), pos: new THREE.Vector3(),
          buoy: 0.8 + Math.random() * 0.6, pool: exhaust ? 'exhaust' : 'ground',
        });
      }
      this.smokeIExhaust = 0;
      this.smokeIGround = 0;
    },
    emitSmoke(pos, vel, life, size, dark = false, bodyId = null, exhaust = false, groundBillow = false) {
      let s = null;
      const exhaustPool = exhaust && !groundBillow;
      const pStart = exhaustPool ? 0 : EXHAUST_SMOKE_N;
      const pLen = exhaustPool ? EXHAUST_SMOKE_N : GROUND_SMOKE_N;
      let poolI = exhaustPool ? this.smokeIExhaust : this.smokeIGround;
      const probe = Math.min(256, pLen);
      for (let i = 0; i < probe; i++) {
        const idx = pStart + ((poolI + i) % pLen);
        const cand = this.smoke[idx];
        if (cand.life <= 0) { s = cand; poolI = (poolI + i + 1) % pLen; break; }
      }
      if (!s) {
        let best = pStart;
        for (let i = pStart + 1; i < pStart + pLen; i++) {
          if (this.smoke[i].life < this.smoke[best].life) best = i;
        }
        s = this.smoke[best];
        poolI = (best - pStart + 1) % pLen;
      }
      if (exhaustPool) this.smokeIExhaust = poolI;
      else this.smokeIGround = poolI;
      const bid = bodyId || this.body.id;
      const g = this.views[bid]?.group;
      s.life = life; s.maxLife = life;
      s.seed = Math.random() * 100;
      if (g) {
        s.pos.copy(pos);
        g.worldToLocal(s.pos);
        _c.copy(pos).add(vel);
        s.vel.copy(_c);
        g.worldToLocal(s.vel).sub(s.pos);
        s.bodyId = bid;
      } else {
        s.pos.copy(pos);
        s.vel.copy(vel);
        s.bodyId = null;
      }
      if (!exhaust && !groundBillow) {
        s.vel.add(_a.set((Math.random() - 0.5) * 3, Math.random() * 2.2, (Math.random() - 0.5) * 3));
      }
      s.s.visible = true;
      if (exhaust) {
        s.s.material.map = Math.random() < 0.72 ? this.exhaustBillowTex : this.exhaustTex;
        s.s.material.color.setHex(0x6e6860);
        s.s.material.blending = THREE.NormalBlending;
        s.s.material.opacity = 0.94 + Math.random() * 0.06;
        s.buoy = groundBillow ? (0.02 + Math.random() * 0.05) : (0.32 + Math.random() * 0.22);
        s.hot = true;
        s.ground = !!groundBillow;
        if (groundBillow) s.s.material.color.setHex(0x524c46);
      } else {
        s.s.material.map = dark ? this.dustTex : (Math.random() < 0.28 ? this.smokeDarkTex : this.smokeTex);
        s.s.material.color.setHex(0xffffff);
        s.s.material.blending = THREE.NormalBlending;
        s.s.material.opacity = dark ? 0.78 : 0.74;
        s.buoy = dark ? 0.22 : 0.48 + Math.random() * 0.55;
        s.hot = false;
        s.ground = false;
      }
      s.size = size * (exhaust ? (1.35 + Math.random() * 0.85) : (0.85 + Math.random() * 0.45));
    },
    flameExitWorld(pl, down, out) {
      const tipA = _b.set(0, -0.5, 0);
      pl.cone.localToWorld(tipA);
      const tipB = _c.set(0, 0.5, 0);
      pl.cone.localToWorld(tipB);
      out.copy(tipA.dot(down) >= tipB.dot(down) ? tipA : tipB);
      return out;
    },
    nozzleExitWorld(mesh, pl, out) {
      const tail = pl.drop || pl.r * 0.28;
      out.set(0, pl.baseY - tail, 0);
      mesh.localToWorld(out);
      return out;
    },
    nozzleTailWorld(mesh, pl, len, out) {
      const tail = pl.drop || pl.r * 0.28;
      out.set(0, pl.baseY - tail - len, 0);
      mesh.localToWorld(out);
      return out;
    },
    surfacePointBelow(worldPt, up, down, agl, out) {
      out.copy(worldPt).addScaledVector(down, worldPt.dot(up) + agl);
      return out;
    },
    emitExhaustStream(exitWorld, tailWorld, down, east, north, len, plR, thr, dt, launch = false) {
      const fps = clamp(dt * 60, 0.45, 2.2);
      const n = Math.max(launch ? 12 : 3, Math.round((launch ? 20 : 5) * thr * fps));
      for (let i = 0; i < n; i++) {
        const along = launch
          ? Math.random() * Math.random() * 0.65
          : 0.08 + Math.random() * 0.72;
        const pos = _d.copy(exitWorld).lerp(tailWorld, along);
        const radial = plR * (launch ? 0.1 + Math.random() * 0.32 : 0.06 + Math.random() * 0.22);
        pos.addScaledVector(east, (Math.random() - 0.5) * radial)
          .addScaledVector(north, (Math.random() - 0.5) * radial);
        const vel = _c.copy(down).multiplyScalar(16 + Math.random() * 14)
          .addScaledVector(east, (Math.random() - 0.5) * 0.55)
          .addScaledVector(north, (Math.random() - 0.5) * 0.55);
        const size = (launch ? 3.2 : 2.4) + plR * (launch ? 2.4 + Math.random() * 2.2 : 1.6 + Math.random() * 1.6);
        this.emitSmoke(pos, vel, launch ? 5 + Math.random() * 3.5 : 6 + Math.random() * 4.5, size, false, null, true);
      }
      if (launch) {
        const burst = Math.max(4, Math.round(8 * thr * fps));
        for (let i = 0; i < burst; i++) {
          const pos = _d.copy(exitWorld)
            .addScaledVector(down, len * (0.02 + Math.random() * 0.12))
            .addScaledVector(east, (Math.random() - 0.5) * plR * 0.35)
            .addScaledVector(north, (Math.random() - 0.5) * plR * 0.35);
          const vel = _c.copy(down).multiplyScalar(10 + Math.random() * 10)
            .addScaledVector(east, (Math.random() - 0.5) * 1.2)
            .addScaledVector(north, (Math.random() - 0.5) * 1.2);
          this.emitSmoke(pos, vel, 4.5 + Math.random() * 2.5, 3.6 + plR * (2.8 + Math.random() * 2), false, null, true);
        }
      }
    },
    emitPadBillow(pos, east, north, up, down, cloudR, thr, dt) {
      const fps = clamp(dt * 60, 0.45, 2.2);
      const r = Math.max(cloudR, 2.5);
      const sheetN = Math.max(10, Math.round(26 * thr * fps));
      for (let i = 0; i < sheetN; i++) {
        const a = Math.random() * Math.PI * 2;
        const ring = Math.random() * r * 5.5;
        const p = _d.copy(pos)
          .addScaledVector(east, Math.cos(a) * ring)
          .addScaledVector(north, Math.sin(a) * ring);
        const outSpd = 1.5 + Math.random() * 6.5;
        const vel = _c.set(0, 0, 0)
          .addScaledVector(east, Math.cos(a) * outSpd)
          .addScaledVector(north, Math.sin(a) * outSpd)
          .addScaledVector(up, 0.08 + Math.random() * 0.55);
        this.emitSmoke(p, vel, 14 + Math.random() * 8, 5 + r * (2.2 + Math.random() * 2.8), false, null, true, true);
      }
      const coreN = Math.max(8, Math.round(20 * thr * fps));
      for (let i = 0; i < coreN; i++) {
        const a = Math.random() * Math.PI * 2;
        const ring = Math.random() * r * 2.4;
        const p = _d.copy(pos)
          .addScaledVector(east, Math.cos(a) * ring)
          .addScaledVector(north, Math.sin(a) * ring);
        const outSpd = 0.4 + Math.random() * 2.8;
        const vel = _c.set(0, 0, 0)
          .addScaledVector(east, Math.cos(a) * outSpd)
          .addScaledVector(north, Math.sin(a) * outSpd)
          .addScaledVector(up, 0.05 + Math.random() * 0.35);
        this.emitSmoke(p, vel, 16 + Math.random() * 8, 7 + r * (3.2 + Math.random() * 2.8), false, null, true, true);
      }
      const crownN = Math.max(4, Math.round(10 * thr * fps));
      for (let i = 0; i < crownN; i++) {
        const a = Math.random() * Math.PI * 2;
        const ring = r * (1.8 + Math.random() * 4.2);
        const p = _d.copy(pos)
          .addScaledVector(east, Math.cos(a) * ring)
          .addScaledVector(north, Math.sin(a) * ring);
        const outSpd = 2 + Math.random() * 5;
        const vel = _c.set(0, 0, 0)
          .addScaledVector(east, Math.cos(a) * outSpd)
          .addScaledVector(north, Math.sin(a) * outSpd)
          .addScaledVector(up, 0.8 + Math.random() * 3.2);
        this.emitSmoke(p, vel, 12 + Math.random() * 6, 4.5 + r * (1.8 + Math.random() * 2.2), false, null, true, true);
      }
    },
    emitSmokeBillow(pos, vel, life, size, dark = false, count = 11, exhaust = false) {
      const tight = exhaust ? 0.42 : 1;
      for (let i = 0; i < count; i++) {
        const spread = _a.set((Math.random() - 0.5) * size * (exhaust ? 0.55 : 1.2) * tight, (Math.random() - 0.5) * size * (exhaust ? 0.35 : 0.7) * tight, (Math.random() - 0.5) * size * (exhaust ? 0.55 : 1.2) * tight);
        this.emitSmoke(
          _d.copy(pos).add(spread),
          _c.copy(vel).addScaledVector(_a.set((Math.random() - 0.5) * (exhaust ? 7 : 5), Math.random() * (exhaust ? 4.5 : 3.2), (Math.random() - 0.5) * (exhaust ? 7 : 5)), 1),
          life * (0.7 + Math.random() * 0.65),
          size * (exhaust ? (0.42 + Math.random() * 0.72) : (0.28 + Math.random() * 0.48)),
          dark, null, exhaust);
      }
    },

    /* ============== SOI ============== */
    checkSOI(t) {
      /* exit to parent */
      if (this.body.parentB && this.r.length() > this.body.soi) {
        const pb = this.body.parentB;
        const bp = ORB.bodyRelPos(this.body, pb, t, _a);
        const bv = ORB.bodyRelVel(this.body, pb, t, _b);
        this.r.add(bp);
        this.v.add(bv);
        this.switchBody(pb);
        return;
      }
      /* enter child SOI */
      for (const c of this.body.children) {
        const cp = ORB.bodyRelPos(c, this.body, t, _a);
        if (this.r.distanceTo(cp) < c.soi) {
          const cv = ORB.bodyRelVel(c, this.body, t, _b);
          this.r.sub(cp);
          this.v.sub(cv);
          this.switchBody(c);
          return;
        }
      }
    },
    switchBody(b) {
      this.body = b;
      this.birdsBody = null;
      this.padSmokePos = null;
      this.padSmokeBody = null;
      UI.toast('Entering ' + b.name + '\u2019s sphere of influence', '', '');
      AUDIO.warp(true);
      CAREER.event('soi', { body: b.id });
      this.flags['soi_' + b.id] = true;
      this.orbitedToastDone = false;
      if (this.warpI > 3) this.setWarp(3);
    },

    /* ============== warp ============== */
    setWarp(i, phys = false) {
      i = clamp(i, 0, phys ? PHYS_WARPS.length - 1 : WARPS.length - 1);
      if (!phys && i > 0) {
        if (this.warpLocked) { UI.toast('Time warp locked', 'Another player\u2019s vessel is nearby.', 'warn', 2200); return; }
        if (!this.landed && this.alt < (this.body.atmo ? this.body.atmo.h : 0) + 1000) {
          UI.toast('Cannot warp in atmosphere', 'Physics warp only (Alt+.)', 'warn', 2200);
          return;
        }
        if (this.thrustNow > 0 && this.throttle > 0 && !this.landed) { UI.toast('Cannot warp under thrust', '', 'warn', 2000); return; }
      }
      const was = this.physWarp ? this.physWarpI : this.warpI;
      this.physWarp = phys;
      if (phys) this.physWarpI = i; else this.warpI = i;
      if (!phys && i > 0 && !this.landed) {
        this.railsEl = ORB.elementsFromState(this.body.mu, this.r, this.v, GAME.ut);
      }
      AUDIO.warp(i > was);
      this.refreshWarpHud();
    },
    get warp() { return this.physWarp ? PHYS_WARPS[this.physWarpI] : WARPS[this.warpI]; },

    /* ============== input ============== */
    bindInput() {
      this.keys = {};
      this._kd = e => {
        if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        const k = e.key.toLowerCase();
        if (this.keys[k] && k !== ' ') return;
        this.keys[k] = true;
        switch (k) {
          case ' ': e.preventDefault(); if (!UI.hasDialog()) this.stage(); break;
          case 't': this.sas = !this.sas; this.holdQuat.copy(this.quat); this.refreshSasHud(); AUDIO.click(); break;
          case 'r': this.rcs = !this.rcs; this.refreshSasHud(); AUDIO.click(); break;
          case 'g': this.gear = !this.gear; this.applyGear(); AUDIO.thunk(0.3); break;
          case 'u': this.toggleLights(); break;
          case 'z': this.throttle = 1; break;
          case 'x': this.throttle = 0; break;
          case 'm': this.toggleMap(); break;
          case 'v':
            if (this.camView || this.scopeView || this.ivaView) this.exitViewModes();
            else this.camMode = (this.camMode + 1) % 2;
            break;
          case 'c': if (this.ivaView) this.exitViewModes(); else this.enterIva(); break;
          case 'b': if (this.isEva) this.boardVessel(); break;
          case ',': if (this.physWarp) this.setWarp(this.physWarpI - 1, true); else this.setWarp(this.warpI - 1); break;
          case '.':
            if (e.altKey) { this.setWarp((this.physWarp ? this.physWarpI : 0) + 1, true); }
            else if (this.physWarp) { if (this.physWarpI > 0) this.setWarp(this.physWarpI - 1, true); else this.setWarp(1); }
            else this.setWarp(this.warpI + 1);
            break;
          case 'f5': e.preventDefault(); this.quicksave(); break;
          case 'f9': e.preventDefault(); this.quickload(); break;
          case 'escape':
            if (UI.closeTopDialog()) return;
            if (this.mapOpen) { this.toggleMap(); return; }
            this.escMenu();
            break;
        }
      };
      this._ku = e => { this.keys[e.key.toLowerCase()] = false; };
      addEventListener('keydown', this._kd);
      addEventListener('keyup', this._ku);
      const cv = GAME.renderer.domElement;
      this._md = e => { if (e.button === 0 || e.button === 2) { this.dragging = true; this.dragMoved = false; this.lx = e.clientX; this.ly = e.clientY; } };
      this._mm = e => {
        if (!this.dragging) return;
        const dx = e.clientX - this.lx, dy = e.clientY - this.ly;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.dragMoved = true;
        this.camYaw -= dx * 0.006;
        this.camPitch = clamp(this.camPitch + dy * 0.005, -1.45, 1.45);
        this.lx = e.clientX; this.ly = e.clientY;
      };
      this._mu = () => { this.dragging = false; };
      this._wh = e => {
        if (this.mapOpen) return;
        this.camDist = clamp(this.camDist * (e.deltaY > 0 ? 1.15 : 0.87), 4, 3000);
      };
      this._ctx = e => {
        e.preventDefault();
        if (this.dragMoved || this.mapOpen) return;
        this.openPaw(e.clientX, e.clientY);
      };
      cv.addEventListener('mousedown', this._md);
      addEventListener('mousemove', this._mm);
      addEventListener('mouseup', this._mu);
      addEventListener('wheel', this._wh, { passive: true });
      cv.addEventListener('contextmenu', this._ctx);
    },
    toggleLights() {
      this.lights = !this.lights;
      for (const p of this.vessel.parts.values()) {
        if (!p.def.light) continue;
        p.lightOn = this.lights;
        const mesh = this.meshes.get(p.uid);
        const lens = mesh && mesh.getObjectByName('lens');
        if (lens) lens.material.emissive.setHex(this.lights ? 0xfff2c0 : 0);
        if (this.lights && !p.spot) {
          p.spot = new THREE.SpotLight(0xfff2cf, 2.5, 90, 0.5, 0.4);
          mesh.add(p.spot, p.spot.target);
          p.spot.position.set(0, 0, 0.1);
          p.spot.target.position.set(0, 0, 6);
        }
        if (p.spot) p.spot.visible = this.lights;
      }
      AUDIO.click();
    },

    /* ============== onboard camera view (control-room style) ============== */
    enterCamView(part) {
      this.exitViewModes();
      this.camView = { part };
      const hud = document.getElementById('hud-root');
      const ov = el('div', '', hud);
      ov.id = 'camview';
      ov.innerHTML = `
        <canvas class="cam-static" id="cam-static" width="200" height="124"></canvas>
        <div class="cam-vignette"></div>
        <div class="cam-frame"></div><div class="cam-scan"></div>
        <div class="cam-head"><span class="rec">● REC</span><span id="cam-id">AX-0 // ${this.flightName}</span><span id="cam-clock"></span></div>
        <div class="cam-tele mono" id="cam-tele"></div>
        <div class="cam-nosig mono hidden" id="cam-nosig">◇ NO SIGNAL ◇<br><span>RELAY LINK REQUIRED — EXTEND THE NETWORK</span></div>
        <div class="cam-foot"><span>MISSION CONTROL · REMOTE FEED</span>
        <button class="btn tiny" id="cam-exit">EXIT FEED (V)</button></div>`;
      ov.querySelector('#cam-exit').onclick = () => this.exitViewModes();
      AUDIO.blip(620, 0.12, 0.12, 'square');
      this.camOverlay = ov;
    },
    /* ============== telescope view ============== */
    enterScopeView(part) {
      this.exitViewModes();
      this.scopeView = { part, zoom: 6 };
      const hud = document.getElementById('hud-root');
      const ov = el('div', '', hud);
      ov.id = 'scopeview';
      ov.innerHTML = `
        <div class="scope-mask"></div>
        <div class="scope-cross"></div>
        <div class="scope-head mono">SG-1 STARGAZER · <span id="scope-zoom">6×</span></div>
        <div class="scope-target mono" id="scope-target">no target</div>
        <div class="scope-foot">
          <button class="btn tiny acc" id="scope-obs" disabled>OBSERVE</button>
          <span style="color:var(--dim);font-size:11.5px">scroll: zoom · drag ship attitude to aim</span>
          <button class="btn tiny" id="scope-exit">EXIT (V)</button></div>`;
      ov.querySelector('#scope-exit').onclick = () => this.exitViewModes();
      ov.querySelector('#scope-obs').onclick = () => {
        const tgt = this.scopeTarget;
        if (!tgt) return;
        const res = CAREER.evalExperiment('scope', this.body, this.situation(), 0, { target: tgt });
        if (res && !res.blocked) {
          CAREER.event('scopeObs');
          this.showScienceDialog(res);
        } else if (res) UI.toast('Cannot observe', res.blocked, 'warn');
      };
      this._scopeWheel = e => {
        this.scopeView.zoom = clamp(this.scopeView.zoom * (e.deltaY > 0 ? 0.85 : 1.18), 2, 90);
      };
      addEventListener('wheel', this._scopeWheel, { passive: true });
      AUDIO.blip(880, 0.1, 0.1, 'sine');
      this.camOverlay = ov;
    },
    /* ============== IVA (interior view) ============== */
    enterIva() {
      const pod = [...this.vessel.parts.values()].find(p => p.def.pod && (this.crew || []).length);
      if (!pod) { UI.toast('No crewed cabin', '', 'warn'); return; }
      this.exitViewModes();
      this.ivaView = { pod };
      const hud = document.getElementById('hud-root');
      const ov = el('div', '', hud);
      ov.id = 'ivaview';
      ov.innerHTML = `
        <div class="iva-pillar left"></div><div class="iva-pillar right"></div>
        <div class="iva-top"></div>
        <div class="iva-dash">
          <canvas id="iva-canvas" width="900" height="200"></canvas>
          <button class="btn tiny" id="iva-hatch" style="position:absolute;right:110px;top:8px">EVA HATCH</button>
          <button class="btn tiny" id="iva-exit" style="position:absolute;right:10px;top:8px">EXIT IVA (V)</button>
        </div>`;
      ov.querySelector('#iva-exit').onclick = () => this.exitViewModes();
      ov.querySelector('#iva-hatch').onclick = () => {
        const name = (this.crew || [])[0];
        this.exitViewModes();
        if (name) this.goEva(name);
      };
      /* look straight out the window initially */
      this.camYaw = 0; this.camPitch = 0.05;
      this.camOverlay = ov;
      AUDIO.blip(500, 0.08, 0.08, 'sine');
    },
    drawIvaDash() {
      const cv = document.getElementById('iva-canvas');
      if (!cv) return;
      const x = cv.getContext('2d');
      x.clearRect(0, 0, 900, 200);
      x.fillStyle = '#10151c';
      x.fillRect(0, 0, 900, 200);
      /* gauges */
      const gauge = (cx, label, val, unit) => {
        x.strokeStyle = '#324355'; x.lineWidth = 2;
        x.beginPath(); x.arc(cx, 105, 52, 0, 7); x.stroke();
        x.fillStyle = '#0a0e14'; x.beginPath(); x.arc(cx, 105, 48, 0, 7); x.fill();
        x.fillStyle = '#9fd8a8'; x.font = 'bold 17px monospace'; x.textAlign = 'center';
        x.fillText(val, cx, 102);
        x.fillStyle = '#5a7286'; x.font = '10px monospace';
        x.fillText(unit, cx, 118);
        x.fillText(label, cx, 170);
      };
      gauge(120, 'ALTITUDE', U.fmtSI(this.alt || 0), 'ASL');
      gauge(280, 'VELOCITY', Math.round(this.srfSpeed || 0), 'm/s');
      gauge(440, 'THROTTLE', Math.round(this.throttle * 100) + '%', 'PWR');
      gauge(600, 'CHARGE', Math.round(this.charge || 0), 'EC');
      gauge(760, 'RADIATION', (this.radNow || 0).toFixed(2), 'rad/h');
      /* warning lamps */
      const lamp = (lx, on, col, label) => {
        x.fillStyle = on ? col : '#1c242e';
        x.fillRect(lx, 18, 46, 14);
        x.fillStyle = '#5a7286'; x.font = '9px monospace'; x.textAlign = 'center';
        x.fillText(label, lx + 23, 44);
      };
      lamp(660, this.radNow > 1, '#e05c4a', 'RAD');
      lamp(716, (this.charge || 0) < 5, '#e0a23a', 'PWR');
      lamp(772, this.resTotal('supplies') <= 0.01 && (this.crew || []).length > 0, '#e05c4a', 'SUPP');
      lamp(828, this.contact, '#7adf72', 'GND');
    },
    exitViewModes() {
      if (this.camOverlay) { this.camOverlay.remove(); this.camOverlay = null; }
      if (this._scopeWheel) { removeEventListener('wheel', this._scopeWheel); this._scopeWheel = null; }
      this.camView = null; this.scopeView = null; this.ivaView = null;
      this.scopeTarget = null;
    },

    /* ============== EVA ============== */
    goEva(name) {
      if (this.isEva) return;
      const situ = this.situation();
      const inSpace = situ === 'spaceLow' || situ === 'spaceHigh';
      if (!this.landed && !inSpace) { UI.toast('Cannot EVA here', 'Too much wind for a spacewalk. Land or reach orbit.', 'warn'); return; }
      /* park the parent vessel as a flight + prop */
      const idx = this.crew.indexOf(name);
      if (idx >= 0) this.crew.splice(idx, 1);
      const parent = this.serializeFlight();
      parent.name = this.flightName;
      GAME.save.flights = GAME.save.flights.filter(x => x.fid !== this.fid);
      GAME.save.flights.push(parent);
      GAME.saveNow();
      this.evaParent = parent;
      /* parent stays visible as a physical prop */
      const pv = Vessel.deserialize(parent.craft);
      const { group } = pv.buildGroup();
      this.scene.add(group);
      this.evaProp = { group, data: parent };
      /* morph into the astronaut */
      const av = new Vessel('EVA ' + name);
      av.addPart('astro', { type: 'root' });
      av.autoStage();
      this.vessel = av;
      this.isEva = true;
      this.evaName = name;
      this.crew = [name];
      this.flightName = name + ' (EVA)';
      this.stagesLeft = [];
      this.lit = new Set();
      this.nodes = [];
      this.rcs = true;
      this.camDist = 3.6;
      /* offset spawn: 2.5m along +X of the vessel */
      const off = _a.set(2.5, 0, 0).applyQuaternion(this.quat);
      if (this.landed) {
        this.landedBf.pos.add(CEL.inertialToBf(this.body, off, GAME.ut, _b));   // pure rotation: vector into body frame
        this.syncLanded(GAME.ut);
      } else {
        this.r.add(off);
      }
      this.rebuildVesselGroup();
      this.updateFeeds();
      this.refreshStagesHud();
      this.buildCrewHud();
      CAREER.event('eva');
      UI.toast('EVA', name + ' is outside! Jetpack: IJKL/HN · Board: B', '', 5000);
      AUDIO.blip(700, 0.2, 0.12, 'sine');
    },
    boardVessel() {
      if (!this.isEva || !this.evaProp) return;
      const d = this.evaProp.group.position.distanceTo(this.vGroup.position);
      if (d > 7) { UI.toast('Too far to board', Math.round(d) + ' m — get within 7 m.', 'warn'); return; }
      const parent = this.evaParent;
      GAME.save.flights = GAME.save.flights.filter(x => x.fid !== parent.fid);
      this.scene.remove(this.evaProp.group);
      const name = this.evaName;
      this.isEva = false;
      this.evaProp = null;
      this.resumeFlight(parent);
      this.crew.push(name);
      this.flightName = parent.name;
      this.rebuildVesselGroup();
      this.updateFeeds();
      this.refreshStagesHud();
      this.buildCrewHud();
      UI.toast('Aboard', name + ' is back inside.', '');
      AUDIO.thunk(0.4);
    },
    plantFlag() {
      if (!this.isEva || !this.landed) return;
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), PARTS.M.gray);
      pole.position.y = 0.7;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.34), new THREE.MeshStandardMaterial({ color: 0x2a8c4a, side: THREE.DoubleSide }));
      cloth.position.set(0.3, 1.2, 0);
      flag.add(pole, cloth);
      const bf = this.landedBf.pos.clone();
      flag.position.copy(bf);
      flag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bf.clone().normalize());
      this.views[this.body.id].group.add(flag);
      UI.toast('Flag planted', this.body.name + ' — ' + this.biomeName(), 'sci');
      AUDIO.jingle(true);
    },
    /* prop position update (parent vessel during EVA) */
    updateEvaProp() {
      if (!this.evaProp) return;
      const d = this.evaProp.data;
      const t = GAME.ut;
      const tmp = _a;
      if (d.landed && d.landedPos) {
        CEL.bfToInertial(this.body, _b.fromArray(d.landedPos), t, tmp);
        const ang = CEL.spinAngle(this.body, t);
        this.evaProp.group.quaternion.setFromAxisAngle(_c.set(0, 1, 0), ang).multiply(_q.fromArray(d.landedQuat));
      } else {
        const el2 = ORB.elementsFromState(this.body.mu, _b.fromArray(d.r), _c.fromArray(d.v), d.savedUt);
        const st = ORB.stateAtTime(el2, t);
        tmp.copy(st.r);
        this.evaProp.group.quaternion.fromArray(d.quat);
      }
      this.evaProp.group.position.copy(tmp).sub(this.r);
      this.boardDist = this.evaProp.group.position.length();
    },

    /* ============== nearby vessels (physical props) + docking ============== */
    updateNearProps(dt) {
      this.propScanT = (this.propScanT || 0) + dt;
      this.nearProps = this.nearProps || [];
      const t = GAME.ut;
      if (this.propScanT > 2) {
        this.propScanT = 0;
        const have = new Set(this.nearProps.map(p => p.data.fid));
        for (const f of GAME.save.flights) {
          if (f.fid === this.fid || f.bodyId !== this.body.id || have.has(f.fid)) continue;
          const pos = MAPVIEW.flightWorldPos(f, t, _a).sub(ORB.bodyAbsPos(this.body, t, _b));
          if (pos.distanceTo(this.r) > 2500) continue;
          /* load it as a physical kinematic craft */
          try {
            const vv = Vessel.deserialize(f.craft);
            const { group } = vv.buildGroup();
            this.scene.add(group);
            const label = U.textSprite('◇ ' + f.name, { size: 32, color: '#8fd8c8', bg: 'rgba(8,12,18,0.6)' });
            this.scene.add(label);
            this.nearProps.push({ data: f, vessel: vv, group, label });
            UI.toast('Vessel nearby', f.name + ' is within 2.5 km.', '', 3000);
          } catch (e) { /* corrupted craft: ignore */ }
        }
      }
      for (let i = this.nearProps.length - 1; i >= 0; i--) {
        const pr = this.nearProps[i];
        if (!GAME.save.flights.includes(pr.data)) { this.removeProp(i); continue; }
        const f = pr.data;
        const rel = _a; /* their inertial pos */
        if (f.landed && f.landedPos) {
          CEL.bfToInertial(this.body, _b.fromArray(f.landedPos), t, rel);
          const ang = CEL.spinAngle(this.body, t);
          pr.group.quaternion.setFromAxisAngle(_c.set(0, 1, 0), ang).multiply(_q.fromArray(f.landedQuat));
        } else {
          if (!pr.el) pr.el = ORB.elementsFromState(this.body.mu, new THREE.Vector3().fromArray(f.r), new THREE.Vector3().fromArray(f.v), f.savedUt || t);
          const st = ORB.stateAtTime(pr.el, t);
          rel.copy(st.r);
          pr.group.quaternion.fromArray(f.quat);
          pr.vRel = pr.vRel || new THREE.Vector3();
          pr.vRel.copy(st.v);
        }
        pr.group.position.copy(rel).sub(this.r);
        const d = pr.group.position.length();
        pr.label.position.copy(pr.group.position).add(_b.set(0, Math.max(d * 0.05, 4), 0));
        const ls = Math.max(d * 0.04, 2);
        pr.label.scale.set(ls * pr.label.userData.aspect, ls, 1);
        pr.label.visible = d > 25;
        if (d > 3200) { this.removeProp(i); continue; }
        /* magnetic docking capture */
        if (d < 60 && !this.dead) this.tryDock(pr);
      }
    },
    removeProp(i) {
      const pr = this.nearProps[i];
      this.scene.remove(pr.group);
      this.scene.remove(pr.label);
      this.nearProps.splice(i, 1);
    },
    dockPortsOf(vessel, group, quat) {
      const out = [];
      for (const p of vessel.parts.values()) {
        if (!p.def.dock || p.dockedTo) continue;
        const free = vessel.freeNodeIdx(p.uid);
        if (free < 0) continue;
        const n = p.def.nodes[free];
        const local = _c.set(n.x, n.y, n.z).add(p.pos);
        const wp = local.clone().applyQuaternion(quat);
        if (group) wp.add(group.position);
        const axis = new THREE.Vector3(0, n.y > 0 ? 1 : -1, 0).applyQuaternion(p.quat).applyQuaternion(quat);
        out.push({ part: p, pos: wp, axis, size: p.def.dock.size });
      }
      return out;
    },
    tryDock(pr) {
      const mine = this.dockPortsOf(this.vessel, null, this.quat);
      if (!mine.length) return;
      const theirs = this.dockPortsOf(pr.vessel, pr.group, pr.group.quaternion);
      if (!theirs.length) return;
      const relV = pr.vRel ? _d.copy(this.v).sub(pr.vRel).length() : 0;
      for (const m of mine) {
        for (const th of theirs) {
          if (m.size !== th.size) continue;
          const dist = m.pos.distanceTo(th.pos);
          if (dist > 1.1 || m.axis.dot(th.axis) > -0.5 || relV > 3) continue;
          this.completeDock(pr, m, th);
          return;
        }
      }
    },
    completeDock(pr, myPort, theirPort) {
      const other = pr.vessel;
      if (!other.reRoot(theirPort.part.uid)) { UI.toast('Docking failed', 'Their port can\u2019t carry structural load.', 'warn'); return; }
      const map = this.vessel.graft(myPort.part.uid, other);
      if (!map) { UI.toast('Docking failed', 'No free docking face.', 'warn'); return; }
      myPort.part.dockedTo = map.get(theirPort.part.uid);
      const newTheir = this.vessel.parts.get(map.get(theirPort.part.uid));
      if (newTheir) newTheir.dockedTo = myPort.part.uid;
      /* merge crew + bookkeeping */
      this.crew = [...(this.crew || []), ...(pr.data.crew || [])];
      GAME.save.flights = GAME.save.flights.filter(x => x.fid !== pr.data.fid);
      const idx = this.nearProps.indexOf(pr);
      if (idx >= 0) this.removeProp(idx);
      this.massDirty = true;
      this.updateFeeds();
      this.rebuildVesselGroup();
      this.refreshStagesHud();
      this.buildCrewHud();
      COMMS.invalidate();
      GAME.saveNow();
      UI.toast('DOCKING CONFIRMED', pr.data.name + ' is now part of ' + this.flightName + '.', 'sci', 6000);
      AUDIO.thunk(0.8);
      AUDIO.jingle(true);
      this.shakeT = 0.25;
      CAREER.event('docked', {});
    },
    undock(dockPart) {
      const otherUid = dockPart.dockedTo;
      if (!otherUid || !this.vessel.parts.has(otherUid)) { dockPart.dockedTo = null; return; }
      const other = this.vessel.parts.get(otherUid);
      /* child side = the port whose attach.parent is the other port */
      let childPort = other.attach && other.attach.parent === dockPart.uid ? other
        : dockPart.attach && dockPart.attach.parent === otherUid ? dockPart : null;
      if (!childPort) { UI.toast('Cannot undock', 'Joint not found.', 'warn'); return; }
      const subUids = this.vessel.subtreeUids(childPort.uid);
      if (subUids.includes(this.vessel.root)) { UI.toast('Cannot undock', 'That side is the command core.', 'warn'); return; }
      /* serialize the departing section as a new flight */
      const frag = { name: this.flightName + ' B', parts: [], stages: [[]], root: childPort.uid, nextUid: 1 };
      for (const u of subUids) {
        const p = this.vessel.parts.get(u);
        const att = u === childPort.uid ? { type: 'root' } : Object.assign({}, p.attach);
        frag.parts.push({ uid: u, id: p.id, attach: att, res: Object.assign({}, p.res) });
      }
      const sepDir = _a.set(0, 1, 0).applyQuaternion(childPort.quat).applyQuaternion(this.quat);
      const anchorPos = childPort.pos.clone().applyQuaternion(this.quat);
      const newFlight = {
        fid: 'f' + Date.now() + 'u', name: frag.name, bodyId: this.body.id,
        craft: frag,
        stagesLeft: [], lit: [],
        r: this.r.clone().add(anchorPos).addScaledVector(sepDir, 0.6).toArray(),
        v: this.v.clone().addScaledVector(sepDir, 0.4).toArray(),
        quat: this.quat.toArray(),
        landed: false, landedPos: null, landedQuat: null,
        met: this.met, flags: {}, scienceBank: [], crew: [],
        launchUt: this.launchUt, savedUt: GAME.ut, partCount: subUids.length, gear: false,
      };
      dockPart.dockedTo = null;
      this.vessel.removeSubtree(childPort.uid);
      GAME.save.flights.push(newFlight);
      GAME.saveNow();
      this.massDirty = true;
      this.updateFeeds();
      this.rebuildVesselGroup();
      this.refreshStagesHud();
      COMMS.invalidate();
      UI.toast('UNDOCKED', newFlight.name + ' is flying free.', '', 4000);
      AUDIO.thunk(0.6);
    },

    quicksave() { GAME.save.quick = this.snapshot(); GAME.saveNow(); UI.toast('Quicksaved', '', ''); AUDIO.blip(900, 0.1, 0.1); },
    quickload() {
      if (!GAME.save.quick) { UI.toast('No quicksave', '', 'warn'); return; }
      GAME.go('flight', { quick: JSON.parse(JSON.stringify(GAME.save.quick)) });
    },

    escMenu() {
      AUDIO.click();
      const body = document.createElement('div');
      body.className = 'escmenu';
      const mk = (label, cb, cls = '') => { const b = el('button', 'btn ' + cls, body, label); b.onclick = () => { dlg.close(); cb(); }; };
      mk('RESUME FLIGHT', () => { }, 'acc');
      mk('QUICKSAVE (F5)', () => this.quicksave());
      mk('QUICKLOAD (F9)', () => this.quickload());
      if (this.launchSnapshot) mk('REVERT TO LAUNCH', () => this.revertLaunch());
      mk('REVERT TO VAB', () => { this.abandonFlight(); GAME.go('editor', { craft: this.vessel.serialize() }); });
      mk('NOVA SPACE CENTER (KEEP FLIGHT)', () => this.leaveToSC());
      mk('SETTINGS', () => GAME.showSettings());
      mk('MAIN MENU', () => { this.leaveToSC(true); });
      const dlg = UI.dialog({ title: 'PAUSED', body });
    },
    leaveToSC(menu = false) {
      if (!this.dead && this.vessel.parts.size) {
        GAME.save.flights = GAME.save.flights.filter(x => x.fid !== this.fid);
        GAME.save.flights.push(this.serializeFlight());
      }
      GAME.saveNow();
      GAME.go(menu ? 'menu' : 'sc');
    },

    /* ============== recover ============== */
    recover() {
      const refund = Math.round(this.vessel.cost() * 0.95);
      let sciTotal = 0;
      for (const d of this.scienceBank) {
        GAME.save.sciLog[d.key] = (GAME.save.sciLog[d.key] || 0) + 1;
        sciTotal += d.value;
      }
      GAME.earn(refund);
      GAME.earnSci(sciTotal);
      CAREER.event('recovered', { flags: this.flags });
      CAREER.onRecovered(this);
      AUDIO.jingle(true);
      this.abandonFlight();
      UI.toast('Vessel recovered', `+${U.fmtFunds(refund)}${sciTotal ? `  +${Math.round(sciTotal * 10) / 10} Science` : ''}`, 'sci', 6000);
      GAME.go('sc');
    },

    /* ============== science / PAW ============== */
    situation() {
      if (this.landed || (this.contact && this.srfSpeed < 1)) {
        return (this.splashed || this.landedSplashed) ? 'splashed' : 'landed';
      }
      if (this.splashed && (this.alt ?? 99) < 25 && this.srfSpeed < 2) return 'splashed';
      return CEL.situation(this.body, this.alt, false);
    },
    biomeIdx() {
      const dirBf = CEL.inertialToBf(this.body, _a.copy(this.r).normalize(), GAME.ut, _b);
      return CEL.biomeAt(this.body, dirBf);
    },
    biomeName() {
      const b = this.body.biomes;
      return (b && b[this.biomeIdx()]) || 'Surface';
    },
    runExperiment(expId, part) {
      const res = CAREER.evalExperiment(expId, this.body, this.situation(), this.biomeIdx());
      if (!res) return;
      if (res.blocked) { UI.toast('Cannot run experiment', res.blocked, 'warn'); return; }
      if (CAREER.EXPS[expId].needsCrew && !this.crew.length) { UI.toast('Needs crew', 'This experiment requires an astronaut.', 'warn'); return; }
      this.showScienceDialog(res);
      if (expId === 'geiger') {
        /* belt survey milestone: inside a radiation belt the live reading spikes */
        if ((this.radNow || 0) > 2.5 && (this.situation() === 'spaceLow' || this.situation() === 'spaceHigh')) CAREER.event('beltScan');
      }
    },
    showScienceDialog(res) {
      const stored = this.scienceBank.some(d => d.key === res.key);
      const noTx = !!res.exp.noTransmit;
      const body = document.createElement('div');
      body.innerHTML = `<div class="sci-result"><div class="sci-amt">⚛ ${res.value}</div>
        <div><b>${res.exp.name}</b> — ${res.situName}<br><span style="color:var(--dim);font-style:italic">${res.text}</span>
        ${stored ? '<br><span style="color:var(--warn)">Duplicate of stored data.</span>' : ''}
        ${noTx ? '<br><span style="color:var(--warn)">Physical sample — cannot be transmitted. Bring it home.</span>' : ''}
        ${res.value <= 0 ? '<br><span style="color:var(--warn)">Nothing new to learn here.</span>' : ''}</div></div>`;
      const hasAntenna = [...this.vessel.parts.values()].some(p => p.def.antenna);
      const buttons = [{ label: 'DISCARD' }];
      if (!noTx) buttons.push({
        label: 'TRANSMIT (60%)', cb: () => {
          if (!hasAntenna) { UI.toast('No antenna', 'Add a Comlink to transmit.', 'warn'); return; }
          if (this.signal && !this.signal.ok) { UI.toast('No signal', 'No relay path to Mission Control. Build a relay network!', 'warn'); return; }
          if (this.resTotal('charge') < 8) { UI.toast('Insufficient charge', 'Transmitting needs 8 EC.', 'warn'); return; }
          this.drainRes('charge', 8);
          CAREER.collectScience(res, 0.6);
        },
      });
      buttons.push({
        label: 'KEEP DATA', cls: 'acc', cb: () => {
          if (stored) { UI.toast('Already stored', 'Transmit or discard duplicates.', 'warn'); return; }
          if (res.value <= 0) { UI.toast('No value', 'Already fully researched.', 'warn'); return; }
          this.scienceBank.push({ key: res.key, value: res.value, title: res.exp.name + ' — ' + res.situName });
          UI.toast('Data stored', 'Recover the vessel for full value.', 'sci');
        },
      });
      UI.dialog({ title: 'EXPERIMENT RESULTS', body, buttons });
      AUDIO.blip(1200, 0.15, 0.12, 'sine');
    },

    openPaw(mx, my) {
      this.closePaw();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1), this.cam);
      const hits = ray.intersectObjects(this.vGroup.children, true);
      let part = null;
      for (const h of hits) { if (h.object.userData.uid) { part = this.vessel.parts.get(h.object.userData.uid); break; } }
      if (!part) return;
      const paw = el('div', 'panel', document.getElementById('hud-root'));
      paw.id = 'paw';
      paw.style.left = Math.min(mx + 10, innerWidth - 270) + 'px';
      paw.style.top = Math.min(my - 10, innerHeight - 300) + 'px';
      const head = el('div', 'ptitle', paw, part.def.name + '<span style="cursor:pointer" id="paw-x">✕</span>');
      head.querySelector('#paw-x').onclick = () => this.closePaw();
      const bd = el('div', '', paw);
      const row = (label, val) => el('div', 'paw-row', bd, `<span>${label}</span><b>${val}</b>`);
      const btn = (label, cb) => { const r = el('div', 'paw-row', bd); const b = el('button', 'btn tiny', r, label); b.style.flex = '1'; b.onclick = cb; return b; };
      row('Temp', Math.round(part.temp || 280) + ' K');
      for (const k in part.res) row(PARTS.RESOURCES[k] ? PARTS.RESOURCES[k].name : k, Math.round(part.res[k] * 10) / 10);
      if (part.def.engine) {
        const litNow = this.lit.has(part.uid) && !part.failed;
        btn(part.failed ? 'RETRY IGNITION' : litNow ? 'SHUTDOWN ENGINE' : 'ACTIVATE ENGINE', () => {
          if (part.failed) {
            part.failed = Math.random() < 0.25;
            UI.toast(part.failed ? 'Still no joy' : 'Ignition!', part.def.name, part.failed ? 'warn' : '');
            if (!part.failed) this.lit.add(part.uid);
          }
          else if (litNow) this.lit.delete(part.uid);
          else this.lit.add(part.uid);
          this.closePaw();
        });
      }
      if (part.def.science === 'geiger') row('Radiation', (this.radNow || 0).toFixed(2) + ' rad/h');
      if (part.def.cameraPart) btn('CAMERA VIEW', () => { this.enterCamView(part); this.closePaw(); });
      if (part.def.telescope) btn('LOOK THROUGH TELESCOPE', () => { this.enterScopeView(part); this.closePaw(); });
      if (part.def.decouple) btn('DECOUPLE', () => { this.fireDecoupler(part); this.closePaw(); });
      if (part.def.dock && part.dockedTo) btn('UNDOCK', () => { this.undock(part); this.closePaw(); });
      if (part.def.chute && !part.chuteState) btn('DEPLOY CHUTE', () => { part.chuteArmed = true; this.closePaw(); });
      if (part.def.fairing && !part.fairingGone) btn('JETTISON FAIRING', () => { this.jettisonFairing(part); this.closePaw(); });
      if (part.def.solar && part.def.solar.deploy) btn(part.deployed ? 'RETRACT PANEL' : 'DEPLOY PANEL', () => { part.deployed = !part.deployed; this.applyGear(); this.closePaw(); });
      if (part.def.leg) btn(this.gear ? 'RETRACT LEGS (G)' : 'DEPLOY LEGS (G)', () => { this.gear = !this.gear; this.applyGear(); this.closePaw(); });
      if (part.def.light) btn('TOGGLE LIGHTS (U)', () => { this.toggleLights(); this.closePaw(); });
      if (part.def.science) btn('RUN: ' + (CAREER.EXPS[part.def.science] ? CAREER.EXPS[part.def.science].name.toUpperCase() : ''), () => { this.runExperiment(part.def.science); this.closePaw(); });
      if (part.def.pod) {
        btn('CREW REPORT', () => { this.runExperiment('crew'); this.closePaw(); });
        const situ = this.situation();
        if (situ === 'landed' || situ === 'splashed') btn('SURFACE SAMPLE', () => { this.runExperiment('surface'); this.closePaw(); });
        for (const name of (this.crew || []).slice(0, 3)) {
          btn('EVA: ' + name.toUpperCase(), () => { this.goEva(name); this.closePaw(); });
        }
        btn('IVA VIEW (C)', () => { this.enterIva(); this.closePaw(); });
        if (this.scienceBank.length) row('Stored data', this.scienceBank.length + ' (' + Math.round(this.scienceBank.reduce((s, d) => s + d.value, 0)) + '⚛)');
      }
      if (part.def.eva) {
        btn('EVA REPORT', () => { this.runExperiment('eva'); this.closePaw(); });
        const situ = this.situation();
        if (situ === 'landed' || situ === 'splashed') {
          btn('SURFACE SAMPLE', () => { this.runExperiment('surface'); this.closePaw(); });
          btn('PLANT FLAG', () => { this.plantFlag(); this.closePaw(); });
        }
        btn('BOARD VESSEL (B)', () => { this.boardVessel(); this.closePaw(); });
      }
      this.paw = paw;
    },
    closePaw() { if (this.paw) { this.paw.remove(); this.paw = null; } },

    /* ============== SAS ============== */
    sasTargetDir() {
      const vOrbit = this.v;
      const om = CEL.spinOmega(this.body, _a);
      const vSurf = _b.copy(this.v).sub(_c.crossVectors(om, this.r));
      const useSurf = this.speedDisplayMode() === 'surface';
      const vel = useSurf ? vSurf : vOrbit;
      const up = _c.copy(this.r).normalize();
      switch (this.sasMode) {
        case 'pro': return vel.lengthSq() > 0.4 ? vel.clone().normalize() : null;
        case 'retro': return vel.lengthSq() > 0.4 ? vel.clone().normalize().negate() : null;
        case 'normal': return new THREE.Vector3().crossVectors(this.r, vOrbit).normalize();
        case 'anti': return new THREE.Vector3().crossVectors(vOrbit, this.r).normalize();
        case 'radIn': return up.clone().negate();
        case 'radOut': return up.clone();
        case 'mnv': {
          const nd = this.nodes[0];
          if (!nd) return null;
          return MAPVIEW.nodeWorldDir(this, nd);
        }
        case 'custom': return this.sasCustomDir || null;
      }
      return null;
    },
    applySas(h) {
      this.cmd = { pitch: this.ctrl.pitch, yaw: this.ctrl.yaw, roll: this.ctrl.roll };
      if (!this.hasLiveControl() && !this.isEva) {
        this.cmd = { pitch: 0, yaw: 0, roll: 0 };
        if (!this.noCtrlWarned) { this.noCtrlWarned = true; UI.toast('No control', 'Probe has no electric charge (or crew is lost).', 'warn', 4000); }
        return;
      }
      this.noCtrlWarned = false;
      const manual = this.ctrl.pitch || this.ctrl.yaw || this.ctrl.roll;
      if (!this.sas || this.dead) return;
      if (manual) { this.holdQuat.copy(this.quat); return; }
      const qi = _q.copy(this.quat).invert();
      let errLocal;
      const dir = this.sasMode === 'stab' ? null : this.sasTargetDir();
      if (dir) {
        const noseLocal = _a.set(0, 1, 0);
        const dirLocal = _b.copy(dir).applyQuaternion(qi);
        const cross = new THREE.Vector3().crossVectors(noseLocal, dirLocal);
        const dot = clamp(dirLocal.y, -1, 1);
        const ang = Math.acos(dot);
        errLocal = cross.normalize().multiplyScalar(ang);
        if (!isFinite(errLocal.x)) errLocal.set(0, 0, 0);
      } else {
        const qe = _q.copy(this.quat).invert().multiply(this.holdQuat);
        if (qe.w < 0) { qe.x *= -1; qe.y *= -1; qe.z *= -1; qe.w *= -1; }
        const ang = 2 * Math.acos(clamp(qe.w, -1, 1));
        const s = Math.sqrt(Math.max(1 - qe.w * qe.w, 1e-9));
        errLocal = new THREE.Vector3(qe.x / s, qe.y / s, qe.z / s).multiplyScalar(ang);
      }
      const w = this.angVel;
      const kp = 2.2, kd = 4.0;
      const cx = clamp(kp * errLocal.x - kd * w.x, -1, 1);
      const cy = clamp(kp * errLocal.y - kd * w.y, -1, 1);
      const cz = clamp(kp * errLocal.z - kd * w.z, -1, 1);
      this.cmd.pitch = clamp(this.cmd.pitch + -cx, -1, 1);
      this.cmd.roll = clamp(this.cmd.roll + -cy, -1, 1);
      this.cmd.yaw = clamp(this.cmd.yaw + cz, -1, 1);
    },

    /* ============== main update ============== */
    update(dt) {
      if (!this.vessel) return;
      /* read continuous keys */
      const k = this.keys || {};
      this.ctrl.pitch = (k['w'] ? -1 : 0) + (k['s'] ? 1 : 0);
      this.ctrl.yaw = (k['a'] ? -1 : 0) + (k['d'] ? 1 : 0);
      this.ctrl.roll = (k['q'] ? -1 : 0) + (k['e'] ? 1 : 0);
      this.ctrl.tx = (k['j'] ? -1 : 0) + (k['l'] ? 1 : 0);
      this.ctrl.ty = (k['n'] ? -1 : 0) + (k['h'] ? 1 : 0);
      this.ctrl.tz = (k['i'] ? -1 : 0) + (k['k'] ? 1 : 0);
      if (k['shift']) this.throttle = clamp(this.throttle + dt * 0.55, 0, 1);
      if (k['control']) this.throttle = clamp(this.throttle - dt * 0.55, 0, 1);
      if (window.__AUTOLAUNCH) this.autopilot(dt);
      this.updateSignal(dt);

      const warp = this.warp;
      if (!this.physWarp && this.warpI > 0) {
        /* rails */
        GAME.ut += dt * warp;
        const t = GAME.ut;
        if (this.landed) this.syncLanded(t);
        else if (this.railsEl) {
          const st = ORB.stateAtTime(this.railsEl, t);
          this.r.copy(st.r); this.v.copy(st.v);
          this.checkSOI(t);
          const alt = this.r.length() - this.body.R;
          this.alt = alt;
          this.agl = alt;
          const om = CEL.spinOmega(this.body, _a);
          this.srfSpeed = _b.copy(this.v).sub(_c.crossVectors(om, this.r)).length();
          this.q = 0;
          this.heatFlux = 0;
          this.thrustNow = 0;
          if (this.body.atmo && alt < this.body.atmo.h + 400) { this.setWarp(0); UI.toast('Atmosphere ahead — warp stopped', '', 'warn'); }
          else if (alt < 4000) this.setWarp(0);
          /* node proximity */
          if (this.nodes[0] && this.nodes[0].ut - t < 45 * (warp > 100 ? 1 : 0.2) * warp / 50 && warp > 5) this.setWarp(this.warpI - 1);
        }
        if (this.launched) this.met += dt * warp;
      } else {
        const pw = this.physWarp ? warp : 1;
        this.applySas(dt);
        const steps = Math.min(Math.ceil(dt * pw / H_STEP), 14);
        const h = dt * pw / steps;
        for (let i = 0; i < steps; i++) {
          if (this.dead) break;
          GAME.ut += h;
          this.step(h);
        }
        if (this.launched) this.met += dt * pw;
      }

      /* milestone events */
      if (this.launched && !this.landed) {
        CAREER.event('altitude', { alt: this.alt || 0, body: this.body.id });
        const elems = this.currentElements();
        if (elems && elems.e < 1 && elems.rPe - this.body.R > (this.body.atmo ? this.body.atmo.h : 10000)) {
          if (!this.flags['orbit_' + this.body.id]) {
            this.flags['orbit_' + this.body.id] = true;
            if (this.body.id === 'gaia') this.flags.orbitedGaia = true;
            CAREER.event('orbit', { body: this.body.id, crewed: (this.crew || []).length > 0 });
            UI.toast('Stable orbit around ' + this.body.name + '!', '', '', 5000);
            AUDIO.jingle(true);
          }
        }
      }

      /* nearby vessels: physical props + docking */
      if (!this.isEva) this.updateNearProps(dt);

      /* offered-contract progress (~1 Hz) */
      this.ctT = (this.ctT || 0) + dt;
      if (this.ctT > 1) { this.ctT = 0; CAREER.checkContracts(this); }

      /* EVA: parent vessel prop + walking (W/S stroll, A/D turn on the spot) */
      if (this.isEva) {
        this.updateEvaProp();
        const up2 = _a.copy(this.r).normalize();
        if (this.contact && this.ctrl.pitch) {
          const fwd = _b.set(0, 0, 1).applyQuaternion(this.quat).addScaledVector(up2, -_b.dot(up2)).normalize();
          this.v.addScaledVector(fwd, -this.ctrl.pitch * 4.5 * dt);
        }
        if (this.ctrl.yaw) {
          _q.setFromAxisAngle(up2, -this.ctrl.yaw * 1.8 * dt);
          this.quat.premultiply(_q).normalize();
          this.holdQuat.copy(this.quat);
        }
      }

      /* multiplayer: ghosts + proximity warp lock */
      if (window.NET && NET.active) {
        NET.tickFlight(this, dt);
        this.warpLocked = NET.nearOther(this);
        if (this.warpLocked && this.warpI > 0 && !this.physWarp) {
          this.setWarp(0);
          UI.toast('Time warp locked', 'Another player\u2019s vessel is nearby.', 'warn', 2500);
        }
      } else this.warpLocked = false;

      this.updateScene(dt);
      this.updateHud(dt);
      if (this.mapOpen) MAPVIEW.update(this, dt);
      else GAME.renderer.render(this.scene, this.cam);
    },

    currentElements() {
      if (this.landed) return null;
      return ORB.elementsFromState(this.body.mu, this.r, this.v, GAME.ut);
    },

    autopilot(dt) {
      /* simple test ascent: pitch east program + circularize-ish (drives the SAS) */
      const alt = this.alt || 0;
      this.sas = true;
      const elems = this.currentElements();
      const apo = elems && elems.e < 1 ? elems.rAp - this.body.R : 0;
      const pe = elems ? elems.rPe - this.body.R : -1e9;
      if (!this.launched) { this.stage(); this.throttle = 1; }
      if (apo < 81500) {
        this.throttle = 1;
        if (alt < 300) { this.sasMode = 'stab'; this.holdQuat.copy(this.quat); }
        else {
          const f = clamp(alt / 46000, 0, 1);
          const pitch = Math.min(f * 86, 84) * U.DEG;
          const up = this.r.clone().normalize();
          const om = CEL.spinOmega(this.body, _b);
          const east = new THREE.Vector3().crossVectors(om, this.r).normalize();
          this.sasMode = 'custom';
          this.sasCustomDir = up.multiplyScalar(Math.cos(pitch)).addScaledVector(east, Math.sin(pitch)).normalize();
        }
      } else {
        /* coast to Ap, then circularize (pulse near Ap — works for low-TWR stages) */
        this.sasMode = 'pro';
        if (pe >= 73500) { this.throttle = 0; window.__AUTOLAUNCH = false; }
        else {
          const tAp = elems.e < 1 ? ORB.timeAtNu(elems, Math.PI, GAME.ut) - GAME.ut : 0;
          this.throttle = alt > 70800 && tAp < 80 ? 1 : 0;
        }
      }
      /* stage when every lit engine is starved */
      const anyLive = [...this.lit].some(uid => {
        const p = this.vessel.parts.get(uid);
        if (!p || !p.def.engine) return false;
        const feed = this.feeds.get(uid) || [];
        return feed.some(tk => (tk.res[p.def.engine.prop] || 0) > 0.05);
      });
      if (this.launched && !anyLive && this.stagesLeft.length) {
        this.stageTimer = (this.stageTimer || 0) + dt;
        if (this.stageTimer > 0.4) { this.stage(); this.stageTimer = 0; }
      } else this.stageTimer = 0;
    },

    /* ============== scene update ============== */
    updateScene(dt) {
      const t = GAME.ut;
      /* vessel at origin */
      this.vGroup.position.set(0, 0, 0);
      this.vGroup.quaternion.copy(this.quat);
      /* bodies */
      const myAbs = ORB.bodyAbsPos(this.body, t, _a).add(this.r);
      for (const b of CEL.list) {
        const v = this.views[b.id];
        const center = ORB.bodyAbsPos(b, t, _b).sub(myAbs);
        v.setFrame(center, t, this.cam.position);
      }
      const sunDir = _d.copy(myAbs).negate().normalize();
      this.sunLight.position.copy(sunDir).multiplyScalar(8000);
      for (const b of CEL.list) { this.views[b.id].setSun(sunDir); this.views[b.id].setCam(this.cam); }
      /* LOD budget: current body gets most; boost while the quadtree is converging */
      const qLen = this.views[this.body.id].buildQueue.length;
      for (const b of CEL.list) this.views[b.id].update(b === this.body ? (qLen > 30 ? 9 : 5) : 1.2);
      /* KSC buildings — show on pad & near surface (alt unset while landed used to hide pad until staging) */
      if (this.body === CEL.GAIA && !this.ksc && (this.landed || (this.alt ?? 0) < 120000)) this.ensureKsc();
      if (window.NET) NET.syncFlightRemoteKscs(this);
      /* atmosphere ambience */
      const up = _a.copy(this.r).normalize();
      const altScene = this.alt ?? Math.max(this.r.length() - this.body.R, 0);
      const pres = this.pres ?? CEL.atmoPressure(this.body, altScene);
      const dayF = clamp(sunDir.dot(up) * 1.5 + 0.22, 0, 1);
      const skyAmt = clamp(pres * 2.2, 0, 1) * dayF;
      this.skyAmt = skyAmt;
      const inSpace = (this.alt ?? 0) > (this.body.atmo ? this.body.atmo.h * 0.85 : 0);
      if (this.body.atmo && !inSpace) {
        const sc = this.body.atmo.skyCol;
        this.scene.fog.color.setRGB(sc[0] * dayF, sc[1] * dayF, sc[2] * dayF);
        this.scene.fog.density = 6e-6 * pres * (this.alt < 4000 ? 1.6 : 1);
      } else this.scene.fog.density = 0;
      this.hemi.intensity = inSpace ? 0.06 + skyAmt * 0.2 : 0.12 + skyAmt * 0.55;
      this.amb.intensity = inSpace ? 0.12 + skyAmt * 0.08 : 0.25 + skyAmt * 0.2;
      this.sunLight.intensity = inSpace ? 2.6 : 3.2;
      this.stars.update(this.cam.position, skyAmt * 1.5, dt);
      this.sunFx.update(_b.copy(sunDir).multiplyScalar(5e6).add(this.cam.position), this.cam, !this.inShadow(), skyAmt, inSpace);
      /* trees / rocks near the ground, puffy clouds in the troposphere */
      if (this.scatter) {
        if (this.scatterBody !== this.body.id && this.views[this.body.id].body.sampler) {
          this.scatter.trees.parent.remove(this.scatter.trees);
          this.scatter.rocks.parent.remove(this.scatter.rocks);
          this.scatter = new PG.Scatter(this.views[this.body.id]);
          this.scatterBody = this.body.id;
        }
        const vbf = this.views[this.body.id].camBF;
        this.scatter.update(vbf, vbf.length() - this.body.R, dayF);
      }
      if (this.birds) {
        const pv = this.views[this.body.id];
        if (this.birdsBody !== this.body.id) {
          this.birds.attachTo(pv.group);
          this.birdsBody = this.body.id;
        }
        const camAlt = _b.copy(this.r).add(this.cam.position).length() - this.body.R;
        this.birds.update(pv.camBF, this.body.R, camAlt, dt, this.body.id === 'gaia' && dayF > 0.2);
      }
      /* shadow light follows */
      const shadowOn = GAME.settings.quality >= 1 && this.agl < 25000;
      this.shadowLight.intensity = shadowOn ? 1.4 : 0;
      this.sunLight.intensity = shadowOn ? 1.8 : 3.2;
      if (shadowOn) {
        this.shadowLight.position.copy(sunDir).multiplyScalar(150);
        this.shadowLight.target.position.set(0, 0, 0);
      }
      this.updateChuteVisuals(dt);
      /* plumes + engine light + sounds */
      let plumeOn = 0, srb = 0;
      const launchPhase = this.agl < 12 && this.throttle > 0.15;
      if (!launchPhase && (this.agl || 0) > 50) { this.padSmokePos = null; this.padSmokeBody = null; }
      const east = _c.set(0, 1, 0).cross(up).normalize();
      if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
      const north = _d.crossVectors(up, east).normalize();
      const down = P_W1.copy(up).multiplyScalar(-1);
      let padAcc = null;
      for (const pl of this.plumes) {
        const p = this.vessel.parts.get(pl.uid);
        if (!p) {
          pl.cone.visible = false; if (pl.core) pl.core.visible = false; if (pl.flash) pl.flash.visible = false;
          if (pl.sprites) for (const sp of pl.sprites) sp.visible = false;
          continue;
        }
        const e = p.def.engine;
        const thr = e.srb ? 1 : this.throttle;
        const litNow = this.lit.has(pl.uid) && !p.flameout && !p.failed && thr > 0.01;
        pl.cone.visible = litNow;
        if (pl.core) pl.core.visible = litNow;
        if (pl.flash) pl.flash.visible = litNow;
        if (pl.sprites) for (const sp of pl.sprites) sp.visible = litNow;
        const mesh = this.meshes.get(pl.uid);
        if (mesh) {
          mesh.traverse(o => {
            if (o.userData.nozzleHotMat) o.userData.nozzleHotMat.emissive.setHex(litNow ? 0xff6a22 : 0);
          });
        }
        if (!litNow) continue;
        plumeOn += thr;
        if (e.srb) srb = 1;
        const vac = clamp(1 - pres * 1.15, 0.15, 1);
        const atmo = pres > 0.02;
        const len = (atmo ? 2.2 + thr * 4.2 : 1.6 + thr * 3.6) * vac * (e.prop === 'xenon' ? 0.35 : e.prop === 'lf' ? 1 : 0.85);
        const flick = 0.88 + Math.random() * 0.22;
        const w = pl.r * (atmo ? 1.8 + thr * 0.9 : 1.4 + thr * 0.6) * flick;
        const tail = pl.drop || pl.r * 0.28;
        pl.cone.scale.set(w, len, w);
        pl.cone.position.y = pl.baseY - tail - len * 0.5;
        pl.cone.material.opacity = (atmo ? 0.5 : 0.38) + thr * 0.22 + Math.random() * 0.06;
        if (pl.core) {
          const clen = len * (atmo ? 0.58 : 0.72);
          pl.core.scale.set(w * 0.42, clen, w * 0.42);
          pl.core.position.y = pl.baseY - tail * 0.9 - clen * 0.5;
          pl.core.material.opacity = 0.92 + Math.random() * 0.08;
        }
        if (pl.sprites) {
          const spriteFade = launchPhase ? 0.22 : 1;
          for (let si = 0; si < pl.sprites.length; si++) {
            const t = (si + 0.3) / pl.sprites.length;
            const sp = pl.sprites[si];
            sp.position.y = pl.baseY - tail - len * t * (0.85 + Math.random() * 0.08);
            sp.position.x = (Math.random() - 0.5) * pl.r * 0.25;
            sp.position.z = (Math.random() - 0.5) * pl.r * 0.25;
            const ss = pl.r * (2.6 - t * 1.5) * flick * (0.65 + thr * 0.55);
            sp.scale.set(ss, ss * (1.15 + vac * 0.5), 1);
            sp.material.opacity = (0.4 + thr * 0.45) * (1 - t * 0.5) * spriteFade;
          }
        }
        if (pl.flash) {
          pl.flash.position.y = pl.baseY - tail * 0.4;
          pl.flash.scale.setScalar(pl.r * (2.2 + Math.random() * 0.8) * thr);
          pl.flash.material.opacity = 0.45 + Math.random() * 0.22;
        }
        /* exhaust smoke — column from nozzle exit through the flame */
        if (atmo && mesh) {
          const exitWorld = this.nozzleExitWorld(mesh, pl, P_LEV);
          const tailWorld = this.nozzleTailWorld(mesh, pl, len, P_W2);
          this.emitExhaustStream(exitWorld, tailWorld, down, east, north, len, pl.r, thr, dt, launchPhase);
          if (launchPhase) {
            const ground = this.surfacePointBelow(exitWorld, up, down, this.agl, _b);
            if (!padAcc) padAcc = { sum: ground.clone(), n: 1, plR: pl.r, thr };
            else {
              padAcc.sum.add(ground);
              padAcc.n++;
              padAcc.plR = Math.max(padAcc.plR, pl.r);
              padAcc.thr = Math.max(padAcc.thr, thr);
            }
          }
        }
      }
      if (padAcc) {
        padAcc.sum.multiplyScalar(1 / padAcc.n);
        const cloudR = Math.max(padAcc.plR, this.vessel.bounds().maxR * 0.55);
        this.padSmokePos = padAcc.sum;
        this.padSmokeBody = this.body.id;
        this.emitPadBillow(padAcc.sum, east, north, up, down, cloudR, padAcc.thr, dt);
      }
      if (plumeOn <= 0) { this.padSmokePos = null; this.padSmokeBody = null; }
      AUDIO.setEngine(this.physWarp || this.warpI === 0 ? Math.min(plumeOn, 1.4) * (this.thrustNow > 0 ? 1 : 0) : 0, clamp(pres * 2, 0, 1), srb);
      AUDIO.setWind(clamp((this.q || 0) / 14000, 0, 1) * (this.warpI === 0 ? 1 : 0));
      AUDIO.setRCS(this.rcs && (this.ctrl.tx || this.ctrl.ty || this.ctrl.tz || (this.rcs && (this.cmd && (Math.abs(this.cmd.pitch) > 0.3)))));
      AUDIO.setBreath(!!this.isEva && this.warpI === 0);
      if ((this.radNow || 0) > 0.05 && this.warpI === 0 && [...this.vessel.parts.values()].some(p => p.def.science === 'geiger' || p.def.eva)) {
        AUDIO.setGeiger(Math.min(this.radNow * 4, 30));
      }
      /* smoke / dust particles (body-fixed so pad billow stays on the ground) */
      for (const s of this.smoke) {
        if (s.life <= 0) { s.s.visible = false; continue; }
        s.life -= dt;
        const f = 1 - s.life / s.maxLife;
        const g = s.bodyId && this.views[s.bodyId]?.group;
        if (g) {
          bodyRadialBasis(s.pos, SM_UP, SM_EAST, SM_NORTH);
          s.pos.addScaledVector(s.vel, dt);
          let rise = 0;
          if (s.hot) {
            rise = s.ground ? s.buoy * (0.06 + f * f * 3.2) : s.buoy * f * f * 2.6;
          } else {
            rise = s.buoy * (s.ground ? 0.3 : 1);
          }
          s.pos.addScaledVector(SM_UP, rise * dt * 2.2);
          const drag = s.hot ? (s.ground ? 0.75 : 0.5) : 0.85;
          s.vel.multiplyScalar(1 - drag * dt);
          const turb = s.seed || 0;
          if (s.hot) {
            const tAmp = s.ground ? 1.1 : 0.85;
            s.vel.addScaledVector(SM_EAST, Math.sin(s.life * 4.2 + turb) * dt * tAmp);
            s.vel.addScaledVector(SM_NORTH, Math.cos(s.life * 3.5 + turb * 1.2) * dt * tAmp);
            const vUp = s.vel.dot(SM_UP);
            const vEast = s.vel.dot(SM_EAST);
            const vNorth = s.vel.dot(SM_NORTH);
            if (s.ground) {
              s.vel.copy(SM_EAST).multiplyScalar(vEast).addScaledVector(SM_NORTH, vNorth);
              s.vel.addScaledVector(SM_UP, clamp(vUp, -1.2, 0.35 + f * 5.5));
            } else if (f < 0.4 && vUp > 0) {
              s.vel.addScaledVector(SM_UP, -vUp * dt * 5.5);
            }
          } else {
            s.vel.addScaledVector(SM_EAST, Math.sin(s.life * 3.8 + turb) * dt * 3.2);
            s.vel.addScaledVector(SM_NORTH, Math.cos(s.life * 4.1 + turb * 1.3) * dt * 2.4);
            s.vel.addScaledVector(SM_UP, Math.cos(s.life * 4.1 + turb) * dt * 1.2);
          }
          s.s.position.copy(g.localToWorld(_b.copy(s.pos)));
        } else {
          const upSmoke = _a.copy(this.r).normalize();
          s.pos.addScaledVector(s.vel, dt);
          s.pos.addScaledVector(upSmoke, s.buoy * dt * 2.5);
          s.vel.multiplyScalar(1 - 1.1 * dt);
          s.s.position.copy(s.pos);
        }
        const grow = s.size * (s.hot ? (s.ground ? (1.35 + f * 28) : (1.85 + f * 15)) : (0.55 + f * 9.5));
        s.s.scale.set(grow, grow * (s.hot ? (1.05 + f * 0.65) : (0.88 + f * 0.42)), 1);
        const baseOp = s.hot ? 0.96 : (s.s.material.map === this.dustTex ? 0.7 : 0.76);
        if (s.hot && f > 0.42) s.s.material.color.setHex(0x625c56);
        s.s.material.opacity = baseOp * (1 - f * (s.hot ? 0.48 : 0.82));
      }
      this.updateHeatVisuals();
      if ((this.heatFlux || 0) > 55) this.shakeT = Math.max(this.shakeT, 0.06 * clamp((this.heatFlux - 55) / 80, 0, 1));
      /* debris */
      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i];
        d.life -= dt;
        if (d.explo) {
          d.group.scale.addScalar(d.grow * dt);
          d.group.material.opacity = Math.max(d.life / 0.9, 0);
          if (d.life <= 0) { this.scene.remove(d.group); this.debris.splice(i, 1); }
          continue;
        }
        if (d.simple) {
          d.group.position.addScaledVector(d.vRel, dt);
          d.vRel.y -= 4 * dt;
          d.group.rotation.x += d.spin.x * dt;
          d.group.rotation.y += d.spin.y * dt;
        } else {
          /* ballistic in body frame */
          const r2 = d.r.lengthSq();
          d.v.addScaledVector(_b.copy(d.r).normalize(), -this.body.mu / r2 * dt);
          const rho2 = CEL.atmoDensity(this.body, d.r.length() - this.body.R);
          d.v.multiplyScalar(1 / (1 + rho2 * d.v.length() * 0.001 * dt));
          d.r.addScaledVector(d.v, dt);
          const upD = _b.copy(d.r).normalize();
          const dirBf = CEL.inertialToBf(this.body, upD, t, _c);
          const th = CEL.heightAt(this.body, dirBf);
          const floor = this.body.R + (isOverOcean(this.body, th) ? waterContactFloor({ bounds: () => ({ minY: 0, maxY: 2, maxR: 2 }) }) : surfaceFloor(this.body, th));
          const pen = floor - d.r.length();
          if (pen > 0) {
            d.r.addScaledVector(upD, pen);
            const vn = d.v.dot(upD);
            if (vn < 0) d.v.addScaledVector(upD, -vn * 0.85);
            d.v.multiplyScalar(0.72);
          }
          d.group.position.copy(d.r).sub(this.r);
          _q.set(d.spin.x * dt / 2, d.spin.y * dt / 2, d.spin.z * dt / 2, 1);
          d.quat.multiply(_q).normalize();
          d.group.quaternion.copy(d.quat);
          const settled = d.r.length() - this.body.R < th + 2.5 && d.v.length() < 1.1;
          if (settled && d.craft) {
            this.persistDebris(d);
            this.scene.remove(d.group);
            this.debris.splice(i, 1);
            continue;
          }
          if (settled) d.life = 0;
        }
        if (d.life <= 0 || d.group.position.length() > 30000) {
          this.scene.remove(d.group);
          this.debris.splice(i, 1);
        }
      }
      /* debug overlays: aero vectors + thermal tint */
      if (window.DBG && (DBG.aeroVectors || DBG.thermal)) {
        if (!this.dbgArrows) {
          this.dbgArrows = [];
          for (let i = 0; i < 28; i++) {
            const ar = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xffffff, 0.3, 0.18);
            ar.visible = false;
            this.scene.add(ar);
            this.dbgArrows.push(ar);
          }
          this.thermalSprites = [];
          const tTex = PG.glowTex([[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']], 32);
          for (let i = 0; i < 40; i++) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            sp.visible = false;
            this.scene.add(sp);
            this.thermalSprites.push(sp);
          }
        }
        let ai = 0;
        if (DBG.aeroVectors && this.aeroDbg) {
          for (const d2 of this.aeroDbg.slice(0, this.dbgArrows.length)) {
            const ar = this.dbgArrows[ai++];
            const len = clamp(d2.vec.length() / 4000, 0.6, 8);
            ar.position.copy(d2.pos);
            ar.setDirection(_b.copy(d2.vec).normalize());
            ar.setLength(len, len * 0.25, len * 0.12);
            ar.setColor(d2.col);
            ar.visible = true;
          }
        }
        for (let i = ai; i < this.dbgArrows.length; i++) this.dbgArrows[i].visible = false;
        let ti = 0;
        if (DBG.thermal) {
          for (const p of this.vessel.parts.values()) {
            if (ti >= this.thermalSprites.length) break;
            const heatF = clamp(((p.temp || 280) - 350) / (p.def.maxTemp - 350), 0, 1);
            if (heatF < 0.02) continue;
            const sp = this.thermalSprites[ti++];
            sp.position.copy(p.pos).applyQuaternion(this.quat);
            sp.scale.setScalar(PARTS.SIZES[p.def.size] * (0.8 + heatF));
            sp.material.color.setHSL(0.13 - heatF * 0.13, 1, 0.5 + heatF * 0.2);
            sp.material.opacity = 0.25 + heatF * 0.6;
            sp.visible = true;
          }
        }
        for (let i = ti; i < (this.thermalSprites || []).length; i++) this.thermalSprites[i].visible = false;
      } else if (this.dbgArrows) {
        for (const a of this.dbgArrows) a.visible = false;
        for (const s of this.thermalSprites) s.visible = false;
      }

      /* camera */
      this.updateCamera(dt);
    },

    updateCamera(dt) {
      const up = _a.copy(this.r).normalize();
      /* onboard camera / telescope / IVA override the chase camera */
      if (this.camView || this.scopeView || this.ivaView) {
        let part, axis, fov = 68, off = 0.35;
        if (this.camView) {
          part = this.vessel.parts.get(this.camView.part.uid) ? this.camView.part : null;
          axis = part ? _b.set(0, 0, 1).applyQuaternion(part.quat).applyQuaternion(this.quat) : null;
        } else if (this.scopeView) {
          part = this.vessel.parts.get(this.scopeView.part.uid) ? this.scopeView.part : null;
          axis = part ? _b.set(0, 1, 0).applyQuaternion(part.quat).applyQuaternion(this.quat) : null;
          fov = 60 / this.scopeView.zoom;
          off = (part && part.def.h ? part.def.h / 2 : 1) + 0.3;
        } else {
          /* first-person IVA: drag to look around the cabin */
          part = this.ivaView.pod;
          const ly = this.camYaw, lp = clamp(this.camPitch, -1.2, 1.2);
          axis = _b.set(Math.sin(ly) * Math.cos(lp), Math.sin(lp), Math.cos(ly) * Math.cos(lp))
            .applyQuaternion(part.quat).applyQuaternion(this.quat);
          fov = 78; off = 0.12;
        }
        if (part) {
          /* no interior meshes: hide our own hull while inside the cabin */
          this.vGroup.visible = !this.ivaView;
          const wp = _c.copy(part.pos).applyQuaternion(this.quat);
          this.cam.position.copy(wp).addScaledVector(axis, off);
          this.cam.up.copy(_d.set(0, 1, 0).applyQuaternion(this.quat));
          this.cam.lookAt(_c.copy(this.cam.position).add(axis));
          this.cam.fov = fov;
          this.cam.aspect = innerWidth / innerHeight;
          this.cam.updateProjectionMatrix();
          return;
        }
        this.exitViewModes();
      }
      if (!this.vGroup.visible) this.vGroup.visible = true;
      if (this.cam.fov !== 60) { this.cam.fov = 60; }
      let basisQ;
      if (this.camMode === 1) basisQ = this.quat;
      else {
        const east = _b.set(0, 1, 0).cross(up).normalize();
        const north = _c.crossVectors(up, east);
        basisQ = _q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, north.clone().negate()));
      }
      const cp = this.camPitch, cy = this.camYaw;
      const local = new THREE.Vector3(
        Math.cos(cp) * Math.sin(cy) * this.camDist,
        Math.sin(cp) * this.camDist,
        Math.cos(cp) * Math.cos(cy) * this.camDist);
      this.cam.position.copy(local.applyQuaternion(basisQ));
      /* keep camera above terrain */
      if (this.agl !== undefined && this.agl < 3000) {
        const camR = _b.copy(this.r).add(this.cam.position);
        const camAlt = camR.length() - this.body.R;
        const dirBf = CEL.inertialToBf(this.body, _c.copy(camR).normalize(), GAME.ut, _d);
        const th = this.body.sampler ? CEL.heightAt(this.body, dirBf) : 0;
        if (camAlt < th + 1.5) {
          this.cam.position.addScaledVector(up, th + 1.5 - camAlt);
        }
      }
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const s = Math.min(this.shakeT, 0.4) * 0.6;
        this.cam.position.x += (Math.random() - 0.5) * s;
        this.cam.position.y += (Math.random() - 0.5) * s;
        this.cam.position.z += (Math.random() - 0.5) * s;
      }
      /* mild shake under high thrust/q */
      const rumble = clamp((this.thrustNow || 0) / 4e5, 0, 0.5) * 0.05 + clamp((this.q || 0) / 40000, 0, 0.6) * 0.06;
      if (rumble > 0.001 && this.warpI === 0) {
        this.cam.position.x += (Math.random() - 0.5) * rumble;
        this.cam.position.y += (Math.random() - 0.5) * rumble;
      }
      this.cam.up.copy(this.camMode === 1 ? _b.set(0, 0, -1).applyQuaternion(this.quat) : up);
      this.cam.lookAt(0, 0, 0);
      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
    },

    /* ============== HUD ============== */
    buildHud() {
      const hud = document.getElementById('hud-root');
      hud.innerHTML += `
        <div id="fl-met"><div class="met mono" id="met-txt">T+ 00:00:00</div>
          <div class="warp" id="warp-row"></div><div id="fl-situ"></div></div>
        <div id="fl-orbit" class="panel"><div class="ptitle">ORBIT</div><div id="orbit-rows"></div></div>
        <div id="fl-res" class="panel"><div class="ptitle">RESOURCES</div><div id="res-rows"></div></div>
        <div id="fl-status" class="panel"><div id="status-rows"></div></div>
        <div id="fl-stages"></div>
        <div id="navball-wrap">
          <div id="nb-speed"><div class="spd mono" id="spd-val">0 m/s</div><div class="mode" id="spd-mode">SURFACE</div></div>
          <div id="nb-heading" class="mono"></div>
        </div>
        <div id="fl-throttle">
          <div id="g-meter" class="mono">0.0 g</div>
          <div id="thr-gauge"><div id="thr-fill" style="height:0%"></div></div>
          <div style="font-size:11px;color:var(--dim)">THROTTLE</div>
        </div>
        <div id="fl-sas"></div>
        <div id="fl-crew"></div>
        <div id="fl-msg" class="hidden"></div>
        <div style="position:absolute;top:6px;right:14px;display:flex;gap:8px;pointer-events:all" id="fl-topbtns">
          <button class="btn" id="fl-map">MAP (M)</button>
          <button class="btn acc hidden" id="fl-recover">RECOVER VESSEL</button>
          <button class="btn" id="fl-menu">▌▌</button>
        </div>`;
      document.getElementById('fl-map').onclick = () => this.toggleMap();
      document.getElementById('fl-menu').onclick = () => this.escMenu();
      document.getElementById('fl-recover').onclick = () => this.recover();
      /* navball */
      this.navball = new NavBall.Ball(document.getElementById('navball-wrap'), 200);
      document.getElementById('nb-speed').onclick = () => {
        this.speedMode = this.speedMode === 'auto' ? 'orbit' : this.speedMode === 'orbit' ? 'surface' : 'auto';
      };
      /* warp arrows — click to set warp level */
      const wr = document.getElementById('warp-row');
      wr.style.pointerEvents = 'all';
      wr.style.cursor = 'pointer';
      for (let i = 0; i < WARPS.length; i++) {
        const arrow = el('i', '', wr);
        arrow.title = WARPS[i] + '×';
        arrow.onclick = () => { AUDIO.click(); this.setWarp(i); };
      }
      this.warpLabel = el('span', 'mono', wr, '1×');
      this.warpLabel.style.cursor = 'pointer';
      this.warpLabel.title = 'Click arrows to change time warp';
      /* SAS grid */
      const sasEl = document.getElementById('fl-sas');
      const modes = [['stab', 'SAS'], ['pro', 'PRO'], ['retro', 'RETRO'], ['normal', 'NML'], ['anti', 'ANTI'], ['radOut', 'RAD+'], ['radIn', 'RAD−'], ['mnv', 'NODE'], ['rcsBtn', 'RCS']];
      this.sasBtns = {};
      for (const [id, label] of modes) {
        const b = el('div', 'sas-btn' + (id === 'stab' ? ' master' : ''), sasEl, label);
        b.onclick = () => {
          AUDIO.click();
          if (id === 'rcsBtn') { this.rcs = !this.rcs; }
          else if (id === 'stab') { this.sas = !this.sas; this.holdQuat.copy(this.quat); this.sasMode = 'stab'; }
          else { this.sasMode = this.sasMode === id ? 'stab' : id; this.sas = true; }
          this.refreshSasHud();
        };
        this.sasBtns[id] = b;
      }
      this.refreshSasHud();
      this.refreshStagesHud();
      this.refreshWarpHud();
      this.buildCrewHud();
    },
    buildCrewHud() {
      const crewEl = document.getElementById('fl-crew');
      if (!crewEl) return;
      crewEl.innerHTML = '';
      for (const name of (this.crew || []).slice(0, 3)) {
        const card = el('div', 'crew-card', crewEl);
        const cv = el('canvas', '', card);
        cv.width = 60; cv.height = 60;
        this.drawCrewFace(cv, name);
        el('div', 'cname', card, name);
      }
    },
    drawCrewFace(cv, name) {
      const x = cv.getContext('2d');
      const rng = U.mulberry32(name.length * 7919 + name.charCodeAt(0) * 131);
      x.fillStyle = '#0e161e'; x.fillRect(0, 0, 60, 60);
      x.fillStyle = '#cfd2cf';
      x.beginPath(); x.arc(30, 32, 20, 0, 7); x.fill();
      x.fillStyle = '#1a2530';
      x.beginPath(); x.ellipse(30, 30, 13, 11, 0, 0, 7); x.fill();
      const skin = ['#e8b88a', '#c98e5a', '#8a5a3a', '#f0c9a0'][(rng() * 4) | 0];
      x.fillStyle = skin;
      x.beginPath(); x.ellipse(30, 32, 10, 8.6, 0, 0, 7); x.fill();
      x.fillStyle = '#222';
      x.beginPath(); x.arc(26, 31, 1.6, 0, 7); x.arc(34, 31, 1.6, 0, 7); x.fill();
      x.strokeStyle = '#222'; x.lineWidth = 1.2;
      x.beginPath(); x.arc(30, 35, 3.2, 0.25, Math.PI - 0.25); x.stroke();
      x.strokeStyle = '#9aa0a3'; x.lineWidth = 2;
      x.beginPath(); x.arc(30, 32, 19, 0, 7); x.stroke();
    },
    refreshSasHud() {
      for (const id in this.sasBtns) {
        const b = this.sasBtns[id];
        if (id === 'rcsBtn') b.classList.toggle('on', this.rcs);
        else if (id === 'stab') b.classList.toggle('on', this.sas);
        else b.classList.toggle('on', this.sas && this.sasMode === id);
      }
    },
    refreshWarpHud() {
      const wr = document.getElementById('warp-row');
      if (!wr) return;
      wr.classList.toggle('phys', !!this.physWarp);
      const arrows = wr.querySelectorAll('i');
      const idx = this.physWarp ? this.physWarpI : this.warpI;
      arrows.forEach((a, i) => a.classList.toggle('on', i <= idx && (idx > 0 || !this.physWarp && false) || (i === 0 && idx === 0)));
      this.warpLabel.textContent = (this.physWarp ? PHYS_WARPS[this.physWarpI] + '× PHYS' : WARPS[this.warpI] + '×');
    },
    refreshStagesHud() {
      const wrap = document.getElementById('fl-stages');
      if (!wrap) return;
      wrap.innerHTML = '';
      const totalStages = this.stagesLeft.length;
      this.stageBars = [];
      this.stagesLeft.forEach((stage, i) => {
        const div = el('div', 'fst' + (i === 0 ? ' next' : ''), wrap);
        el('div', 'num', div, String(totalStages - i));
        const bars = el('div', 'bars', div);
        /* fuel bars for engines in this stage */
        const engines = stage.map(u => this.vessel.parts.get(u)).filter(p => p && p.def.engine);
        if (engines.length) {
          const solid = engines.some(p => p.def.engine.srb);
          const bar = el('div', 'bar' + (solid ? ' solid' : ''), bars);
          const fill = el('i', '', bar);
          this.stageBars.push({ stageIdx: i, engines, fill, solid });
        }
      });
    },

    speedDisplayMode() {
      if (this.speedMode !== 'auto') return this.speedMode;
      return (this.body.atmo && this.alt < this.body.atmo.h) || this.agl < 25000 && this.srfSpeed < 2200 ? 'surface' : 'orbit';
    },

    updateHud(dt) {
      const t = GAME.ut;
      /* met + situ */
      document.getElementById('met-txt').textContent = 'T+ ' + U.fmtTime(this.met);
      const situ = this.situation();
      document.getElementById('fl-situ').textContent =
        `${this.flightName} — ${({ landed: 'Landed at', splashed: 'Splashed in', flyingLow: 'Flying over', flyingHigh: 'High above', spaceLow: 'Orbiting', spaceHigh: 'High above' })[situ] || ''} ${this.body.name}` +
        ((situ === 'landed' || situ === 'splashed' || situ === 'flyingLow') ? ` (${this.biomeName()})` : '');
      /* orbit panel */
      const elems = this.currentElements();
      const rows = [];
      const row = (a, b) => rows.push(`<div class="row"><span>${a}</span><b>${b}</b></div>`);
      row('Altitude', U.fmtSI(this.alt || 0));
      if ((this.agl || 0) < 6000 && !this.landed) row('Radar alt', U.fmtSI(Math.max(this.agl || 0, 0)));
      if (elems) {
        const ap = elems.e < 1 ? elems.rAp - this.body.R : NaN;
        const pe = elems.rPe - this.body.R;
        row('Apoapsis', isFinite(ap) ? U.fmtSI(ap) : '—');
        row('Periapsis', U.fmtSI(pe));
        if (elems.e < 1) {
          const tAp = ORB.timeAtNu(elems, Math.PI, t) - t;
          const tPe = ORB.timeAtNu(elems, 0, t) - t;
          row('Time to Ap', U.fmtDelta(tAp));
          row('Time to Pe', U.fmtDelta(tPe));
        }
        row('Inclination', (elems.i / U.DEG).toFixed(1) + '°');
        row('Eccentricity', elems.e.toFixed(3));
      }
      if (this.q > 10) row('Dyn. pressure', U.fmtSI(this.q, 'Pa'));
      document.getElementById('orbit-rows').innerHTML = rows.join('');
      /* status strip: kerbalism-style life signs */
      const cfg = GAME.save.cfg || {};
      const sr = [];
      const stat = (label, val, warn) => sr.push(`<div class="st-item${warn ? ' warn' : ''}"><span>${label}</span><b>${val}</b></div>`);
      if (this.signal && !this.signal.crewed) {
        stat('SIG', this.signal.ok ? '◉ ' + Math.round(this.signal.strength * 100) + '%' + (this.signal.hops > 1 ? ' ·' + this.signal.hops + ' hops' : '') : '○ NONE', !this.signal.ok);
      }
      if (cfg.radiation !== false) {
        stat('☢', (this.radNow || 0).toFixed(2) + ' rad/h', (this.radNow || 0) > 1);
        if ((this.crew || []).length) stat('DOSE', (this.crewDose || 0).toFixed(1), (this.crewDose || 0) > 15);
      }
      if ((this.crew || []).length && cfg.lifeSupport !== false) {
        const sup = this.resTotal('supplies');
        stat('SUPP', Math.round(sup), sup < 2);
      }
      stat('EC', Math.round(this.charge || 0), (this.charge || 0) < 5);
      if (window.DBG && DBG.fps) stat('FPS', Math.round(GAME.fps || 0), (GAME.fps || 60) < 30);
      if (this.isEva) stat('BOARD', (this.boardDist || 0).toFixed(0) + ' m', false);
      if (window.NET && NET.active && this.warpLocked) stat('WARP', 'LOCKED', true);
      document.getElementById('status-rows').innerHTML = sr.join('');
      /* resources */
      const totals = this.vessel.resourceTotals();
      const rr = [];
      for (const key of ['lf', 'solid', 'mono', 'xenon', 'charge', 'supplies', 'ablator']) {
        if (!totals[key] || totals[key].max <= 0) continue;
        const r = totals[key];
        const rc = PARTS.RESOURCES[key];
        rr.push(`<div class="row"><span>${rc.name}</span><b>${Math.round(r.cur)}</b></div>
          <div class="resbar"><i style="width:${(r.cur / r.max * 100).toFixed(1)}%;background:${rc.color}"></i></div>`);
      }
      document.getElementById('res-rows').innerHTML = rr.join('');
      /* stage fuel bars */
      for (const sb of this.stageBars || []) {
        let cur = 0, max = 0;
        for (const e of sb.engines) {
          if (!this.vessel.parts.has(e.uid)) continue;
          const feed = this.vessel.feedTanks(e.uid, e.def.engine.prop);
          for (const tk of feed) {
            cur += tk.res[e.def.engine.prop] || 0;
            max += (tk.def.tank && tk.def.tank[e.def.engine.prop]) || 0;
          }
        }
        sb.fill.style.width = max > 0 ? (cur / max * 100).toFixed(1) + '%' : '0%';
      }
      /* throttle & g */
      document.getElementById('thr-fill').style.height = (this.throttle * 100).toFixed(0) + '%';
      const acc = (this.thrustNow || 0) / this.massProps().m;
      document.getElementById('g-meter').textContent = (acc / 9.81).toFixed(1) + ' g';
      /* speed + navball */
      const om = CEL.spinOmega(this.body, _a);
      const vSurf = _b.copy(this.v).sub(_c.crossVectors(om, this.r));
      const mode = this.speedDisplayMode();
      const spd = mode === 'surface' ? vSurf.length() : this.v.length();
      document.getElementById('spd-val').textContent = spd < 10000 ? spd.toFixed(1) + ' m/s' : (spd / 1000).toFixed(2) + ' km/s';
      document.getElementById('spd-mode').textContent = mode.toUpperCase();
      const up = this.r.clone().normalize();
      const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
      const north = new THREE.Vector3().crossVectors(up, east);
      const velRef = mode === 'surface' ? vSurf : this.v;
      const dirs = {};
      if (velRef.lengthSq() > 0.2) {
        dirs.prograde = velRef.clone().normalize();
        dirs.retrograde = dirs.prograde.clone().negate();
      }
      if (elems && this.v.lengthSq() > 1) {
        dirs.normal = new THREE.Vector3().crossVectors(this.r, this.v).normalize();
        dirs.antinormal = dirs.normal.clone().negate();
        dirs.radialOut = up.clone();
        dirs.radialIn = up.clone().negate();
      }
      if (this.nodes[0]) {
        const nd = MAPVIEW.nodeWorldDir(this, this.nodes[0]);
        if (nd) dirs.maneuver = nd;
      }
      const hp = this.navball.update(up, north, east, this.quat, dirs);
      document.getElementById('nb-heading').textContent = `HDG ${hp.heading.toFixed(0).padStart(3, '0')}° · PIT ${hp.pitch.toFixed(0)}°`;
      /* recover button */
      const canRecover = this.body === CEL.GAIA && this.launched && this.met > 3
        && (this.landed || (this.splashed && (this.alt ?? 99) < 30 && this.srfSpeed < 2.5));
      document.getElementById('fl-recover').classList.toggle('hidden', !canRecover);
      /* node burn info */
      if (this.nodes[0]) MAPVIEW.updateNodeHud(this);
      this.updateOverlays();
      UI.updateTopbar();
    },

    updateOverlays() {
      if (this.camView) {
        const clock = document.getElementById('cam-clock');
        if (clock) clock.textContent = 'UT ' + U.fmtTime(GAME.ut);
        const sigOk = !this.signal || this.signal.ok;
        const sigStr = this.signal ? this.signal.strength : 1;
        const tele = document.getElementById('cam-tele');
        if (tele) tele.innerHTML =
          `ALT ${U.fmtSI(this.alt || 0)}<br>VEL ${Math.round(this.srfSpeed || 0)} m/s<br>` +
          `${this.body.name.toUpperCase()} · ${this.biomeName().toUpperCase()}<br>` +
          `SIG ${sigOk ? '◉ ' + Math.round(sigStr * 100) + '%' : '○ NONE'} · PWR ${Math.round(this.charge || 0)}`;
        /* CRT static: weak or missing relay link degrades the feed */
        const stat = document.getElementById('cam-static');
        const nosig = document.getElementById('cam-nosig');
        if (stat) {
          const noise = !sigOk ? 1 : Math.max(0, 0.55 - sigStr * 0.55);
          if (noise > 0.02) {
            stat.style.opacity = noise;
            const x = stat.getContext('2d');
            const img = x.createImageData(200, 124);
            for (let i = 0; i < img.data.length; i += 4) {
              const v = (Math.random() * 255) | 0;
              img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
              img.data[i + 3] = 255;
            }
            x.putImageData(img, 0, 0);
          } else stat.style.opacity = 0;
          if (nosig) nosig.classList.toggle('hidden', sigOk);
        }
      }
      if (this.scopeView) {
        /* find the body closest to the optical axis */
        const part = this.scopeView.part;
        const axis = _a.set(0, 1, 0).applyQuaternion(part.quat).applyQuaternion(this.quat);
        const myAbs = ORB.bodyAbsPos(this.body, GAME.ut, _b).add(this.r);
        let best = null, bestAng = 0.12 + 0.4 / this.scopeView.zoom;
        for (const b of CEL.list) {
          if (b === this.body && this.alt < b.R) continue;
          const dir = ORB.bodyAbsPos(b, GAME.ut, _c).sub(myAbs);
          const dist = dir.length();
          if (dist < 1) continue;
          const ang = axis.angleTo(dir.divideScalar(dist));
          const angR = Math.atan2(b.R, dist);
          if (ang < bestAng + angR) { best = { b, dist, angR }; bestAng = ang; }
        }
        this.scopeTarget = best ? best.b : null;
        const tEl = document.getElementById('scope-target');
        const zEl = document.getElementById('scope-zoom');
        const oEl = document.getElementById('scope-obs');
        if (zEl) zEl.textContent = this.scopeView.zoom.toFixed(0) + '×';
        if (tEl) tEl.textContent = best
          ? `${best.b.name} · ${U.fmtSI(best.dist)} · ∠${(best.angR * 2 / U.DEG).toFixed(2)}°`
          : 'no target — aim with the ship (SAS off helps)';
        if (oEl) oEl.disabled = !best;
      }
      if (this.ivaView) this.drawIvaDash();
    },

    toggleMap() {
      this.mapOpen = !this.mapOpen;
      AUDIO.click();
      if (this.mapOpen) MAPVIEW.open(this);
      else MAPVIEW.close(this);
    },

    /* ============== test interface ============== */
    toText() {
      const elems = this.currentElements();
      return {
        vessel: this.flightName, body: this.body.id, met: Math.round(this.met),
        alt: Math.round(this.alt || 0), agl: Math.round(this.agl || 0),
        vel: Math.round(this.v ? this.v.length() : 0), srfVel: Math.round(this.srfSpeed || 0),
        throttle: Math.round(this.throttle * 100) / 100,
        ap: elems && elems.e < 1 ? Math.round(elems.rAp - this.body.R) : null,
        pe: elems ? Math.round(elems.rPe - this.body.R) : null,
        landed: this.landed, situ: this.situation(), parts: this.vessel.parts.size,
        stagesLeft: this.stagesLeft.length, warp: this.warp, map: this.mapOpen,
        sas: this.sas, sasMode: this.sasMode, dead: this.dead,
        sci: this.scienceBank.length,
        rad: Math.round((this.radNow || 0) * 100) / 100, dose: Math.round((this.crewDose || 0) * 10) / 10,
        supplies: Math.round(this.resTotal('supplies')), crew: (this.crew || []).length,
        eva: !!this.isEva, view: this.camView ? 'cam' : this.scopeView ? 'scope' : this.ivaView ? 'iva' : 'chase',
        deaths: this.deathLog || [],
        dbg: this.dbg ? { g: Math.round(this.dbg.grav), th: Math.round(this.dbg.thrust), aero: Math.round(this.dbg.aero), chute: Math.round(this.dbg.chute) } : null,
      };
    },

    exit() {
      AUDIO.stopLoops();
      this.exitViewModes();
      removeEventListener('keydown', this._kd);
      removeEventListener('keyup', this._ku);
      const cv = GAME.renderer.domElement;
      cv.removeEventListener('mousedown', this._md);
      removeEventListener('mousemove', this._mm);
      removeEventListener('mouseup', this._mu);
      removeEventListener('wheel', this._wh);
      cv.removeEventListener('contextmenu', this._ctx);
      if (this.mapOpen) MAPVIEW.close(this);
      if (this.navball) { this.navball.dispose(); this.navball = null; }
      if (window.NET && NET.active) NET.clearGhosts();
      if (this.vGroup) this.scene.remove(this.vGroup);
      this.vGroup = null;
      this.meshes = null;
      window.__FLIGHT = null;
    },
  };

  GAME.screens.flight = fl;
})();
