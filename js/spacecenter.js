/* spacecenter.js — 3D hub: terrain at NSC, clickable facilities. Screen: 'sc' */
'use strict';
(() => {
  const { el, V3, clamp } = U;

  function towerTruss(h, w) {
    const g = new THREE.Group();
    const mat = PARTS.M.darkgray;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), mat);
      leg.position.set(dx * w / 2, h / 2, dz * w / 2);
      g.add(leg);
    }
    for (let y = 4; y < h; y += 5) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.4, w + 0.5), mat);
      ring.position.y = y;
      g.add(ring);
    }
    return g;
  }

  function buildKSC() {
    const g = new THREE.Group();
    const mWhite = new THREE.MeshStandardMaterial({ color: 0xdfe2df, roughness: 0.65 });
    const mGray = new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 0.8 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x3c4348, roughness: 0.7 });
    const mGreen = new THREE.MeshStandardMaterial({ color: 0x4f7d2c, roughness: 0.7 });
    const mGlass = new THREE.MeshStandardMaterial({ color: 0x1a2c3a, roughness: 0.2, metalness: 0.7 });
    const mConc = new THREE.MeshStandardMaterial({ color: 0x7e8284, roughness: 0.92 });
    const mark = (mesh, target, label) => { mesh.traverse(o => { o.userData.target = target; o.userData.label = label; }); return mesh; };

    /* window-grid texture (emissive at night via 'bldgwin' material name) */
    const winTex = (() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#0c1318'; x.fillRect(0, 0, 128, 128);
      const rng = U.mulberry32(42);
      for (let ry = 8; ry < 128; ry += 18) for (let rx = 6; rx < 128; rx += 14) {
        x.fillStyle = rng() < 0.72 ? '#ffe9b0' : '#1a242c';
        x.fillRect(rx, ry, 8, 10);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })();
    const mWin = () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x222c34, roughness: 0.4, metalness: 0.4, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0 });
      m.name = 'bldgwin';
      return m;
    };

    /* VAB (tall box with girders, windows, doors) */
    const vab = new THREE.Group();
    const vabBody = new THREE.Mesh(new THREE.BoxGeometry(60, 84, 52), mWhite);
    vabBody.position.y = 42;
    const door = new THREE.Mesh(new THREE.BoxGeometry(26, 64, 1.5), mGray);
    door.position.set(0, 34, 26.4);
    const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 64, 1.8), mDark);
    doorSeam.position.set(0, 34, 26.5);
    vab.add(vabBody, door, doorSeam);
    for (const sx of [-20, 20]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(7, 84, 0.8), mGreen);
      stripe.position.set(sx, 42, 26.2);
      vab.add(stripe);
    }
    /* corner girders + side window strips */
    for (const [cx, cz] of [[-30, -26], [30, -26], [-30, 26], [30, 26]]) {
      const gird = new THREE.Mesh(new THREE.BoxGeometry(2.4, 84, 2.4), mDark);
      gird.position.set(cx, 42, cz);
      vab.add(gird);
    }
    for (const sz of [-1, 1]) {
      const winsM = mWin();
      winsM.emissiveMap.repeat = new THREE.Vector2(3, 4);
      const wins = new THREE.Mesh(new THREE.BoxGeometry(0.8, 60, 40), winsM);
      wins.position.set(sz * 30.5, 38, 0);
      vab.add(wins);
    }
    const helipad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.4, 20), mDark);
    helipad.position.set(-46, 0.2, 30);
    const hRing = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.5, 6, 24), mWhite);
    hRing.rotation.x = Math.PI / 2;
    hRing.position.set(-46, 0.5, 30);
    vab.add(helipad, hRing);
    const vabRoof = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 14), mDark);
    vabRoof.position.y = 87;
    vab.add(vabRoof);
    vab.position.set(-160, 0, -40);
    g.add(mark(vab, 'editor', 'VEHICLE ASSEMBLY BUILDING'));

    /* launch pad */
    const pad = new THREE.Group();
    const padBase = new THREE.Mesh(new THREE.CylinderGeometry(34, 38, 3, 8), mConc);
    padBase.position.y = 1.5;
    const padTop = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1.2, 8), mDark);
    padTop.position.y = 3.6;
    const tower = towerTruss(42, 5);
    tower.position.set(-19, 3, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 2), mDark);
    arm.position.set(-12, 36, 0);
    pad.add(padBase, padTop, tower, arm);
    pad.position.set(170, 0, 60);
    g.add(mark(pad, 'launch', 'LAUNCH PAD'));

    /* R&D dome campus */
    const rnd = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), mWhite);
    const lab1 = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 16), mGray);
    lab1.position.set(30, 5, 10);
    const lab2 = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 14), mWhite);
    lab2.position.set(-26, 7, 14);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(30.4, 4, 16.4), mGlass);
    glass.position.set(30, 6, 10);
    rnd.add(dome, lab1, lab2, glass);
    rnd.position.set(-120, 0, 170);
    g.add(mark(rnd, 'rnd', 'RESEARCH & DEVELOPMENT'));

    /* mission control */
    /* mission control: tiered glass control hall + wing + dish + forecourt */
    const mc = new THREE.Group();
    const mcB = new THREE.Mesh(new THREE.BoxGeometry(52, 9, 26), mWhite);
    mcB.position.y = 4.5;
    const mcWinM = mWin();
    mcWinM.emissiveMap.repeat = new THREE.Vector2(8, 1);
    const mcG = new THREE.Mesh(new THREE.BoxGeometry(52.4, 4.6, 26.4), mcWinM);
    mcG.position.y = 9.5;
    const mcTop = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 20), mWhite);
    mcTop.position.set(-6, 14.4, 0);
    const mcWin2 = mWin();
    mcWin2.emissiveMap.repeat = new THREE.Vector2(5, 1);
    const mcG2 = new THREE.Mesh(new THREE.BoxGeometry(30.4, 3.4, 20.4), mcWin2);
    mcG2.position.set(-6, 15.3, 0);
    const mcRoofRim = new THREE.Mesh(new THREE.BoxGeometry(54, 1, 28), mDark);
    mcRoofRim.position.y = 11.4;
    const mcWing = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 34), mGray);
    mcWing.position.set(28, 3.5, -8);
    const mcDish = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 9, 0, Math.PI * 2, 0, Math.PI / 3), mWhite);
    mcDish.rotation.x = Math.PI * 0.8;
    mcDish.position.set(-16, 19.5, 0);
    const mcMast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 8, 8), mGray);
    mcMast.position.set(-16, 14, 0);
    const court = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 0.3, 24), mConc);
    court.position.set(0, 0.15, 26);
    mc.add(mcB, mcG, mcTop, mcG2, mcRoofRim, mcWing, mcDish, mcMast, court);
    mc.position.set(-10, 0, 230);
    g.add(mark(mc, 'mc', 'MISSION CONTROL'));

    /* astronaut quarters + admin block (cosmetic campus filler) */
    const campus = new THREE.Group();
    const aq = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 14), mWhite);
    aq.position.set(0, 4, 0);
    const aqWinM = mWin();
    aqWinM.emissiveMap.repeat = new THREE.Vector2(3, 1);
    const aqG = new THREE.Mesh(new THREE.BoxGeometry(20.4, 3, 14.4), aqWinM);
    aqG.position.set(0, 4.5, 0);
    const admin = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 16, 10), mWhite);
    admin.position.set(34, 8, 6);
    const adminCap = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 1, 10), mDark);
    adminCap.position.set(34, 16.5, 6);
    campus.add(aq, aqG, admin, adminCap);
    campus.position.set(70, 0, 230);
    g.add(campus);

    /* tracking station — radome campus with dishes + control block */
    const tr = new THREE.Group();
    const trBase = new THREE.Mesh(new THREE.CylinderGeometry(28, 34, 2.5, 10), mConc);
    trBase.position.y = 1.25;
    tr.add(trBase);
    const ops = new THREE.Mesh(new THREE.BoxGeometry(38, 12, 22), mWhite);
    ops.position.set(-8, 8, 4);
    tr.add(ops);
    const opsRoof = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 24), mDark);
    opsRoof.position.set(-8, 15, 4);
    tr.add(opsRoof);
    const glassWall = new THREE.Mesh(new THREE.BoxGeometry(38.4, 5, 22.4), mGlass);
    glassWall.position.set(-8, 5.5, 4);
    tr.add(glassWall);
    for (let i = 0; i < 4; i++) {
      const dish = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 14, 10), mGray);
      mast.position.y = 7;
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 6), mDark);
      yoke.position.set(0, 13.5, 0);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(12, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2.8), mWhite);
      bowl.rotation.x = Math.PI * 0.72;
      bowl.position.set(0, 14.5, 2.5);
      const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 6), mDark);
      feed.rotation.x = Math.PI / 2;
      feed.position.set(0, 14.5, 6);
      dish.add(mast, yoke, bowl, feed);
      dish.position.set(i * 32 - 48, 0, -28 - (i % 2) * 14);
      dish.rotation.y = 0.35 + i * 0.55;
      tr.add(dish);
    }
    const radome = new THREE.Mesh(new THREE.SphereGeometry(16, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mWhite);
    radome.position.set(22, 8, -8);
    tr.add(radome);
    const radomeBase = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 6, 12), mGray);
    radomeBase.position.set(22, 3, -8);
    tr.add(radomeBase);
    tr.position.set(330, 0, -260);
    g.add(mark(tr, 'track', 'TRACKING STATION'));

    /* runway — full length with threshold stripes + edge lights */
    const rw = new THREE.Mesh(new THREE.BoxGeometry(760, 0.5, 34), mDark);
    rw.position.set(120, 0.25, -120);
    g.add(rw);
    for (let i = 0; i < 16; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(18, 0.55, 2), mWhite);
      dash.position.set(-220 + i * 46, 0.3, -120);
      g.add(dash);
    }
    for (const zz of [-136, -104]) {
      for (let i = 0; i < 19; i++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7),
          new THREE.MeshStandardMaterial({ color: 0x333322, emissive: 0xffd35e, emissiveIntensity: 0.9 }));
        lamp.position.set(-230 + i * 40, 0.6, zz);
        g.add(lamp);
      }
    }
    /* threshold piano keys */
    for (let i = 0; i < 8; i++) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(12, 0.55, 2.6), mWhite);
      key.position.set(-244, 0.3, -132.4 + i * 3.6);
      g.add(key);
    }

    /* HANGAR — rounded roof, big doors, for the aviation-minded */
    const hg = new THREE.Group();
    const hRoof = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 56, 24, 1, false, 0, Math.PI), mWhite);
    hRoof.rotation.set(0, 0, Math.PI / 2);
    hRoof.position.y = 8;
    const hBack = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 1, 24, 1, false, 0, Math.PI), mGray);
    hBack.rotation.set(0, 0, Math.PI / 2);
    hBack.position.set(-28.5, 8, 0);
    const hWalls = new THREE.Mesh(new THREE.BoxGeometry(56, 8, 34), mWhite);
    hWalls.position.y = 4;
    const hDoor = new THREE.Mesh(new THREE.BoxGeometry(50, 13, 1.2), mGlass);
    hDoor.position.set(0, 6.5, 17.2);
    const hStripe = new THREE.Mesh(new THREE.BoxGeometry(56.4, 1.6, 34.4), mGreen);
    hStripe.position.y = 8.4;
    hg.add(hRoof, hBack, hWalls, hDoor, hStripe);
    hg.position.set(-40, 0, -170);
    g.add(mark(hg, 'hangar', 'AIRCRAFT HANGAR'));

    /* fuel farm */
    for (let i = 0; i < 3; i++) {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 16, 18), mWhite);
      silo.position.set(120 + i * 16, 8, 150);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mGray);
      cap.position.set(120 + i * 16, 16, 150);
      g.add(silo, cap);
    }

    /* floodlight towers around the pad */
    for (const [fx, fz] of [[140, 20], [205, 30], [170, 105]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 24, 8), mGray);
      mast.position.set(fx, 12, fz);
      const head = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x2c3338, emissive: 0xfff2cf, emissiveIntensity: 0 }));
      head.name = 'floodhead';
      head.position.set(fx, 23, fz);
      head.lookAt(170, 4, 60);
      g.add(mast, head);
    }

    /* tree line + service road */
    const treeGeo = new THREE.ConeGeometry(2.2, 6, 7);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d4422, roughness: 0.95 });
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2.4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1 });
    const rngT = U.mulberry32(808);
    const keepOut = [[-160, -40, 80], [170, 60, 80], [-120, 170, 60], [-10, 230, 65], [70, 230, 55], [330, -260, 80], [-40, -170, 65], [136, 150, 45], [40, 96, 20], [10, 14, 30]];
    for (let i = 0; i < 40; i++) {
      const a = rngT() * Math.PI * 2, rr = 280 + rngT() * 200;
      const tx = Math.cos(a) * rr, tz = Math.sin(a) * rr;
      if (Math.abs(tz + 120) < 45 && tx > -280 && tx < 500) continue;   // keep the runway clear
      if (keepOut.some(([kx, kz, kr]) => Math.hypot(tx - kx, tz - kz) < kr)) continue;
      const tree = new THREE.Mesh(treeGeo, treeMat);
      tree.position.set(tx, 4.6, tz);
      tree.scale.setScalar(0.8 + rngT() * 0.9);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 1.2, tz);
      g.add(tree, trunk);
    }
    /* wind farm on the ridge line */
    for (let i = 0; i < 4; i++) {
      const wt = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 34, 8), mWhite);
      mast.position.y = 17;
      const hub = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), mGray);
      hub.position.set(0, 34, 1.4);
      const rotor = new THREE.Group();
      rotor.name = 'rotor';
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(1.4, 13, 0.3), mWhite);
        blade.position.y = 6.5;
        const piv = new THREE.Group();
        piv.rotation.z = b / 3 * Math.PI * 2;
        piv.add(blade);
        rotor.add(piv);
      }
      rotor.position.set(0, 34, 1.8);
      wt.add(mast, hub, rotor);
      wt.position.set(-380 + i * 70, 0, 320);
      wt.lookAt(170, 0, 60);
      g.add(wt);
    }
    /* service road: VAB → pad, kept clear of the runway */
    const road = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 300), mConc);
    road.position.set(10, 0.15, 14);
    road.rotation.y = Math.PI / 2 - 0.14;
    g.add(road);

    /* flag */
    const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 8), mGray);
    fp.position.set(40, 7, 96);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    flag.position.set(43.6, 12, 96);
    flag.userData.agencyFlag = true;
    g.add(fp, flag);
    if (typeof GAME !== 'undefined' && GAME.applyAgencyFlag) GAME.applyAgencyFlag(g);

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  const SC_WARPS = [1, 5, 25, 100, 1000, 10000, 100000];

  const sc = {
    scene: null, cam: null, view: null, stars: null, ksc: null,
    camYaw: 0.7, camPitch: 0.22, camDist: 330, auto: true, warpI: 0,
    ray: new THREE.Raycaster(), mouse: new THREE.Vector2(-2, -2), hover: null,

    ensureScene() {
      if (this.scene) return;
      this.scene = new THREE.Scene();
      this.cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 2e12);
      this.stars = new PG.Stars(this.scene);
      this.sun = new THREE.DirectionalLight(0xfff2dc, 3.0);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc2 = 400;
      Object.assign(this.sun.shadow.camera, { left: -sc2, right: sc2, top: sc2, bottom: -sc2, near: 1, far: 4000 });
      this.scene.add(this.sun, this.sun.target);
      this.hemi = new THREE.HemisphereLight(0x9ec2e8, 0x4a3b28, 0.55);
      this.scene.add(this.hemi);
      this.view = new PG.PlanetView(CEL.GAIA, this.scene, { detail: 1, clouds: true });
      this.sunFx = new PG.SunFX(this.scene);
      /* buildings ride the rotating planet group */
      this.ksc = buildKSC();
      const bf = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon);
      this.ksc.position.copy(bf);
      const up = bf.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      this.ksc.quaternion.copy(q);
      this.view.group.add(this.ksc);
      this.scene.fog = new THREE.FogExp2(0x9ab8d8, 0);
    },

    enter() {
      this.ensureScene();
      const bf = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon);
      this.ksc.position.copy(bf);
      const up = bf.clone().normalize();
      this.ksc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      /* one terrain refresh — full warm-up runs during boot */
      if (!this.warmed) {
        this.warmed = true;
        const bf = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon);
        const ksc = CEL.bfToInertial(CEL.GAIA, bf, GAME.ut);
        const camGuess = ksc.clone().normalize().multiplyScalar(420);
        camGuess.y += 60;
        this.view.setFrame(ksc.clone().negate(), GAME.ut, camGuess);
        this.view.update(48);
      }
      UI.topbar(true);
      const hud = document.getElementById('hud-root');
      const ll = `${(CEL.KSC.lat / U.DEG).toFixed(1)}°, ${(CEL.KSC.lon / U.DEG).toFixed(1)}°`;
      const ag = (GAME.save.agency && GAME.save.agency.name) || 'AGENCY';
      el('div', 'sc-name', hud, (GAME.save.siteChosen ? ag + ' · LC ' + ll : ag) + ` — GAIA · SLOT ${GAME.activeSlot + 1}`);
      const warpHud = el('div', '', hud);
      warpHud.id = 'sc-warp';
      warpHud.style.cssText = 'position:absolute;top:54px;right:14px;display:flex;gap:4px;align-items:center;pointer-events:all;z-index:5';
      const timeLbl = el('span', '', warpHud);
      timeLbl.style.cssText = 'font-size:12px;color:var(--dim);letter-spacing:.1em;margin-right:4px';
      timeLbl.textContent = 'TIME';
      const wr = el('div', 'warp', warpHud); wr.id = 'sc-warp-row';
      this.warpLbl = el('span', 'mono', warpHud, '1×');
      this.warpLbl.style.cssText = 'font-size:13px;color:var(--acc)';
      for (let i = 0; i < SC_WARPS.length; i++) {
        const arrow = el('i', '', wr);
        arrow.title = SC_WARPS[i] + '×';
        arrow.onclick = () => { AUDIO.click(); this.warpI = i; this.refreshWarpHud(); };
      }
      this.refreshWarpHud();
      this.label = el('div', '', hud); this.label.id = 'sc-label'; this.label.style.display = 'none';
      const bar = el('div', '', hud); bar.id = 'sc-bar';
      const mkBtn = (label, target, acc) => {
        const b = el('button', 'btn' + (acc ? ' acc' : ''), bar, label);
        b.onclick = () => { AUDIO.click(); this.goTarget(target); };
      };
      mkBtn('VAB', 'editor', true);
      mkBtn('HANGAR', 'hangar');
      mkBtn('LAUNCH PAD', 'launch');
      mkBtn('R&D', 'rnd');
      mkBtn('MISSION CONTROL', 'mc');
      mkBtn('TRACKING', 'track');
      if (window.NET) mkBtn('MULTIPLAYER', 'multi');
      mkBtn('⚙', 'settings');
      mkBtn('?', 'help');
      mkBtn('MENU', 'menu');
      const roster = el('div', '', hud);
      roster.id = 'mp-roster';
      if (window.NET) NET.updateLobbyUi();
      this.bindInput();
    },
    refreshWarpHud() {
      const wr = document.getElementById('sc-warp-row');
      if (!wr) return;
      wr.querySelectorAll('i').forEach((a, i) => a.classList.toggle('on', i <= this.warpI));
      if (this.warpLbl) this.warpLbl.textContent = SC_WARPS[this.warpI || 0] + '×';
    },

    resetScene() {
      /* called when the launch site moves: rebuild terrain + buildings */
      if (this.view) this.view.dispose();
      this.scene = null; this.view = null; this.warmed = false;
    },

    goTarget(t) {
      if (t === 'launch') {
        /* launch the most recent craft, or send to VAB */
        const names = Object.keys(GAME.save.crafts);
        if (!names.length) { UI.toast('No crafts yet', 'Build something in the VAB first!', 'warn'); return; }
        const body = document.createElement('div');
        body.innerHTML = `<div style="color:var(--dim);margin-bottom:8px">Select a craft to launch:</div>`;
        for (const n of names) {
          const v = Vessel.deserialize(GAME.save.crafts[n]);
          const cost = v.cost();
          const locked = [...v.parts.values()].some(p => !CAREER.partUnlocked(p.id));
          const row = el('div', 'track-row', body);
          row.innerHTML = `<div><div class="tr-name">${n}</div><div class="tr-sub">${v.parts.size} parts — ${U.fmtFunds(cost)}${locked ? ' — <span style="color:var(--warn)">contains locked parts</span>' : ''}</div></div>`;
          const b = el('button', 'btn acc', row, 'LAUNCH');
          b.disabled = locked || !GAME.canAfford(cost);
          b.onclick = () => {
            dlg.close();
            GAME.spend(cost);
            GAME.autosaveLaunch('pre', n);
            GAME.go('flight', { launch: GAME.save.crafts[n] });
          };
        }
        const dlg = UI.dialog({ title: 'LAUNCH PAD', body, buttons: [{ label: 'CANCEL' }] });
        return;
      }
      if (t === 'settings') { GAME.showSettings(); return; }
      if (t === 'help') { UI.showHelp(); return; }
      if (t === 'multi') { NET.openLobby(); return; }
      if (t === 'hangar') { GAME.go('editor', { hangar: true }); return; }
      if (t === 'menu') { GAME.saveNow(); GAME.go('menu'); return; }
      GAME.go(t);
    },

    bindInput() {
      const cv = GAME.renderer.domElement;
      this._down = e => { this.dragging = true; this.auto = false; this.lx = e.clientX; this.ly = e.clientY; };
      this._move = e => {
        this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        if (!this.dragging) return;
        this.camYaw -= (e.clientX - this.lx) * 0.005;
        this.camPitch = clamp(this.camPitch + (e.clientY - this.ly) * 0.004, 0.08, 1.2);
        this.lx = e.clientX; this.ly = e.clientY;
      };
      this._up = () => this.dragging = false;
      this._wheel = e => { this.camDist = clamp(this.camDist * (e.deltaY > 0 ? 1.12 : 0.89), 60, 30000); };
      this._click = e => {
        if (this.hover && !this.dragMoved) this.goTarget(this.hover);
      };
      cv.addEventListener('mousedown', this._down);
      addEventListener('mousemove', this._move);
      addEventListener('mouseup', this._up);
      cv.addEventListener('wheel', this._wheel);
      cv.addEventListener('click', this._click);
    },

    update(dt) {
      GAME.ut += dt * SC_WARPS[this.warpI || 0];
      if (this.auto) this.camYaw += dt * 0.02;
      /* frame: KSC at origin */
      const t = GAME.ut;
      const bf = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon);
      const kscInertial = CEL.bfToInertial(CEL.GAIA, bf, t);
      const center = kscInertial.clone().negate();
      const up = kscInertial.clone().normalize();
      /* camera */
      const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
      const north = new THREE.Vector3().crossVectors(up, east);
      const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
      const horiz = east.clone().multiplyScalar(cy).addScaledVector(north, sy);
      this.cam.position.copy(horiz.multiplyScalar(Math.cos(this.camPitch) * this.camDist))
        .addScaledVector(up, Math.sin(this.camPitch) * this.camDist + 8);
      this.cam.up.copy(up);
      this.cam.lookAt(up.clone().multiplyScalar(20));
      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
      /* sun + fog */
      const sunDir = ORB.bodyAbsPos(CEL.GAIA, t).negate().normalize();
      this.sun.position.copy(sunDir).multiplyScalar(2500);
      this.sun.target.position.set(0, 0, 0);
      const dayF = clamp(sunDir.dot(up) * 1.6 + 0.18, 0.02, 1);
      this.sun.intensity = 3.0 * dayF;
      this.hemi.intensity = 0.2 + 0.45 * dayF;
      /* night floodlights + lit windows + spinning wind turbines */
      const nightF = 1 - clamp(dayF * 2.2, 0, 1);
      this.ksc.traverse(o => {
        if (o.name === 'floodhead') o.material.emissiveIntensity = nightF * 1.6;
        if (o.material && o.material.name === 'bldgwin') o.material.emissiveIntensity = nightF * 1.1 + 0.04;
        if (o.name === 'rotor') o.rotation.z += dt * 0.7;
      });
      if (!this.padLight) {
        this.padLight = new THREE.PointLight(0xffeecf, 0, 240, 1.8);
        this.padLight.position.set(170, 30, 60);
        this.ksc.add(this.padLight);
      }
      this.padLight.intensity = nightF * 2.2;
      if (this.scene.fog) {
        this.scene.fog.density = 1.4e-5 + (1 - dayF) * 4e-6;
        this.scene.fog.color.setRGB(0.5 * dayF + 0.03, 0.62 * dayF + 0.035, 0.82 * dayF + 0.05);
      }
      const sk = CEL.GAIA.atmo.skyCol;
      this.scene.background = new THREE.Color(
        sk[0] * (0.35 + dayF * 0.55) + 0.04,
        sk[1] * (0.38 + dayF * 0.58) + 0.08,
        sk[2] * (0.4 + dayF * 0.55) + 0.12,
      );
      this.view.setFrame(center, t, this.cam.position);
      this.view.setSun(sunDir);
      this.view.setCam(this.cam);
      this.view.update(10);
      this.stars.update(this.cam.position, dayF * 1.3, dt);
      this.sunFx.update(sunDir.clone().multiplyScalar(5e6).add(this.cam.position), this.cam, sunDir.dot(up) > -0.12);
      if (window.NET && NET.active && NET.syncScRemoteKscs) NET.syncScRemoteKscs(this);
      /* hover */
      this.ray.setFromCamera(this.mouse, this.cam);
      const hits = this.ray.intersectObjects(this.ksc.children, true);
      let target = null, label = '', pt = null;
      for (const h of hits) { if (h.object.userData.target) { target = h.object.userData.target; label = h.object.userData.label; pt = h.point; break; } }
      this.hover = target;
      document.body.style.cursor = target ? 'pointer' : 'default';
      if (target && pt) {
        const sp = pt.clone().project(this.cam);
        this.label.style.display = 'block';
        this.label.style.left = ((sp.x + 1) / 2 * innerWidth) + 'px';
        this.label.style.top = ((-sp.y + 1) / 2 * innerHeight) + 'px';
        this.label.textContent = label;
      } else this.label.style.display = 'none';
      GAME.renderer.render(this.scene, this.cam);
    },

    toText() {
      return { hover: this.hover || null, kscButtons: ['VAB', 'LAUNCH PAD', 'R&D', 'MISSION CONTROL', 'TRACKING'] };
    },

    exit() {
      const cv = GAME.renderer.domElement;
      cv.removeEventListener('mousedown', this._down);
      removeEventListener('mousemove', this._move);
      removeEventListener('mouseup', this._up);
      cv.removeEventListener('wheel', this._wheel);
      cv.removeEventListener('click', this._click);
      document.body.style.cursor = 'default';
      if (this.remoteKscs) {
        for (const grp of this.remoteKscs.values()) {
          if (grp.parent) grp.parent.remove(grp);
        }
        this.remoteKscs = null;
      }
    },
  };
  GAME.screens.sc = sc;
  GAME.buildKSC = buildKSC;
})();
