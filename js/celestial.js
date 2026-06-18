/* celestial.js — the Solara system: bodies, terrain height/biome samplers. Global: CEL */
'use strict';
const CEL = (() => {
  const { Simplex, fbm, ridged, craters, clamp, lerp, smooth, TAU, DEG } = U;

  /* ============ body definitions ============ */
  /* orbit: a(m) e i lan aop M0 (rad). rot: sidereal s. atmo: {h, rho0, scaleH, skyCol, glowCol} */
  const B = {};
  function body(def) { B[def.id] = def; return def; }

  body({ id: 'solara', name: 'Solara', parent: null, R: 2.4e8, mu: 1.05e18, rot: 1e9, rot0: 0, star: true, sciMult: 12,
    desc: 'The local star. Surprisingly warm. Do not land.', biomes: ['Photosphere'] });

  body({ id: 'cinder', name: 'Cinder', parent: 'solara', R: 2.4e5, mu: 1.67e11, rot: 1.21e6, rot0: 0.4,
    orbit: { a: 5.26e9, e: 0.185, i: 6.1 * DEG, lan: 1.2, aop: 0.4, M0: 3.0 }, sciMult: 7,
    desc: 'A scorched cannonball skimming the star. Pack sunscreen, then pack more.',
    biomes: ['Scorched Plains', 'Ridges', 'Craters', 'Poles'] });

  body({ id: 'vesper', name: 'Vesper', parent: 'solara', R: 6.9e5, mu: 7.62e12, rot: 7.2e5, rot0: 1.1,
    orbit: { a: 9.71e9, e: 0.012, i: 2.1 * DEG, lan: 0.3, aop: 0.0, M0: 1.1 }, sciMult: 6,
    atmo: { h: 88000, rho0: 5.8, scaleH: 8200, skyCol: [0.55, 0.32, 0.72], glowCol: [0.7, 0.4, 0.95] },
    ocean: { col: [0.32, 0.13, 0.42], name: 'Lilac Sea' }, sciMultSplash: 8,
    desc: 'A violet pressure-cooker with seas of exotic solvents. Getting down is easy. Up, less so.',
    biomes: ['Lilac Sea', 'Lowlands', 'Foothills', 'Peaks', 'Poles'] });
  body({ id: 'mote', name: 'Mote', parent: 'vesper', R: 1.4e4, mu: 7.8e9, rot: 5e4, rot0: 0,
    orbit: { a: 3.15e7, e: 0.06, i: 11 * DEG, lan: 2.0, aop: 1.0, M0: 0.2 }, sciMult: 8,
    desc: 'A captured pebble. Gravity so weak you could jump into orbit. Try it.',
    biomes: ['Regolith', 'Boulders'] });

  body({ id: 'gaia', name: 'Gaia', parent: 'solara', R: 6.4e5, mu: 4.018e12, rot: 23040, rot0: 3.292,
    orbit: { a: 1.42e10, e: 0.0, i: 0, lan: 0, aop: 0, M0: 0 }, sciMult: 0.45,
    atmo: { h: 72000, rho0: 1.225, scaleH: 5800, skyCol: [0.25, 0.52, 0.88], glowCol: [0.35, 0.6, 1.0] },
    ocean: { col: [0.05, 0.18, 0.32], name: 'Sea' },
    desc: 'Home. Blue, green, and full of engineers who want their rocket parts back.',
    biomes: ['Open Water', 'Shores', 'Grasslands', 'Forest', 'Deserts', 'Highlands', 'Mountains', 'Tundra', 'Ice Caps', 'Launch Complex', 'Reef Shallows', 'Savanna', 'Wetlands', 'Volcanic Ridge', 'Dune Sea', 'Jungle'] });
  body({ id: 'selene', name: 'Selene', parent: 'gaia', R: 1.85e5, mu: 5.75e10, rot: 127000, rot0: 2.2,
    orbit: { a: 1.18e7, e: 0.0, i: 0.2 * DEG, lan: 0, aop: 0, M0: 1.7 }, sciMult: 3,
    desc: 'Gaia\u2019s big gray companion. Holds the system record for most craters per crater.',
    biomes: ['Basins', 'Craters', 'Highlands', 'Canyons', 'Poles'] });
  body({ id: 'frost', name: 'Frost', parent: 'gaia', R: 6.2e4, mu: 2.0e9, rot: 48000, rot0: 0.9,
    orbit: { a: 4.4e7, e: 0.003, i: 5.5 * DEG, lan: 1.36, aop: 0.6, M0: 4.0 }, sciMult: 4,
    desc: 'A mint-colored snowball. The flats are so smooth they feel intentional.',
    biomes: ['Glass Flats', 'Hills', 'Ridges', 'Poles'] });

  body({ id: 'rust', name: 'Rust', parent: 'solara', R: 3.3e5, mu: 3.27e11, rot: 65000, rot0: 0.2,
    orbit: { a: 2.17e10, e: 0.046, i: 0.25 * DEG, lan: 2.4, aop: 0.2, M0: 5.4 }, sciMult: 5,
    atmo: { h: 48000, rho0: 0.17, scaleH: 9000, skyCol: [0.74, 0.45, 0.28], glowCol: [0.9, 0.5, 0.3] },
    desc: 'The red one. Thin air, tall canyons, and dust in absolutely everything.',
    biomes: ['Plains', 'Dunes', 'Great Canyon', 'Highlands', 'Polar Ice'] });
  body({ id: 'shard', name: 'Shard', parent: 'rust', R: 1.3e5, mu: 1.86e10, rot: 97000, rot0: 0,
    orbit: { a: 3.45e6, e: 0.03, i: 0.2 * DEG, lan: 0, aop: 0, M0: 2.2 }, sciMult: 5.5,
    desc: 'Rust\u2019s ominously close moon. It is always in the way. Always.',
    biomes: ['Lowlands', 'Cliffs', 'Poles'] });

  body({ id: 'grit', name: 'Grit', parent: 'solara', R: 1.4e5, mu: 2.2e10, rot: 122000, rot0: 0,
    orbit: { a: 3.91e10, e: 0.142, i: 5 * DEG, lan: 4.9, aop: 1.6, M0: 0.8 }, sciMult: 6.5,
    desc: 'A lonely gray dwarf with a canyon big enough to hide your mistakes in.',
    biomes: ['Plains', 'Rift Valley', 'Craters', 'Poles'] });

  body({ id: 'goliath', name: 'Goliath', parent: 'solara', R: 5.8e6, mu: 2.7e14, rot: 36000, rot0: 0, gas: true,
    orbit: { a: 6.71e10, e: 0.05, i: 1.3 * DEG, lan: 0.9, aop: 0.1, M0: 2.6 }, sciMult: 8,
    atmo: { h: 180000, rho0: 9.0, scaleH: 26000, skyCol: [0.25, 0.62, 0.5], glowCol: [0.4, 0.9, 0.7] },
    ring: { r0: 1.55, r1: 2.4, col: [0.55, 0.65, 0.6] },
    desc: 'A teal gas giant wearing a faint ring. There is no surface, only regret.',
    biomes: ['Cloud Tops'] });
  body({ id: 'aqua', name: 'Aqua', parent: 'goliath', R: 4.7e5, mu: 1.745e12, rot: 53000, rot0: 0,
    orbit: { a: 2.74e7, e: 0.0, i: 0.5 * DEG, lan: 0, aop: 0, M0: 0.5 }, sciMult: 9,
    atmo: { h: 55000, rho0: 0.62, scaleH: 6800, skyCol: [0.3, 0.5, 0.75], glowCol: [0.4, 0.65, 1.0] },
    ocean: { col: [0.03, 0.15, 0.3], name: 'Ocean' }, sciMultSplash: 11,
    desc: 'An improbable ocean moon. Breathable-ish! (Disclaimer: not breathable.)',
    biomes: ['Ocean', 'Archipelagos', 'Shores', 'Peaks', 'Poles'] });
  body({ id: 'tundra', name: 'Tundra', parent: 'goliath', R: 2.8e5, mu: 1.72e11, rot: 116000, rot0: 0,
    orbit: { a: 4.42e7, e: 0.0, i: 1.9 * DEG, lan: 1.1, aop: 0, M0: 3.9 }, sciMult: 9,
    desc: 'Ridged ice as far as the eye can see. Bring crampons and a tripod.',
    biomes: ['Ice Plains', 'Ridges', 'Fissures', 'Poles'] });
  body({ id: 'crag', name: 'Crag', parent: 'goliath', R: 5.8e5, mu: 2.35e12, rot: 211000, rot0: 0,
    orbit: { a: 6.95e7, e: 0.0, i: 0.02 * DEG, lan: 0, aop: 0, M0: 5.1 }, sciMult: 9.5,
    desc: 'Huge, airless, unforgiving. Landing here is a badge of honor with extra gravity.',
    biomes: ['Lowlands', 'Mesas', 'Craters', 'Poles'] });
  body({ id: 'pebble', name: 'Pebble', parent: 'goliath', R: 6.0e4, mu: 1.44e9, rot: 220000, rot0: 0,
    orbit: { a: 1.29e8, e: 0.23, i: 15 * DEG, lan: 0.3, aop: 0.9, M0: 1.0 }, sciMult: 10,
    desc: 'A lumpy brown captured asteroid. Rumored to be watching you.',
    biomes: ['Regolith', 'Boulders'] });
  body({ id: 'plume', name: 'Plume', parent: 'goliath', R: 4.2e4, mu: 6.2e8, rot: 240000, rot0: 0,
    orbit: { a: 1.71e8, e: 0.17, i: 4.2 * DEG, lan: 0.1, aop: 0.2, M0: 4.4 }, sciMult: 10,
    desc: 'Small, yellow, and dusty, like a fossilized sponge in a museum nobody visits.',
    biomes: ['Dust Fields', 'Hummocks'] });

  body({ id: 'wanderer', name: 'Wanderer', parent: 'solara', R: 2.0e5, mu: 6.4e10, rot: 74000, rot0: 0,
    orbit: { a: 1.1e11, e: 0.26, i: 6.2 * DEG, lan: 0.87, aop: 4.5, M0: 5.9 }, sciMult: 11,
    desc: 'A pale far-flung wanderer streaked with canyon cracks. The end of the map.',
    biomes: ['Ice Plains', 'Canyon Cracks', 'Highlands', 'Poles'] });

  /* compute SOI + children + period */
  const list = Object.values(B);
  for (const b of list) {
    b.children = [];
    b.parentB = b.parent ? B[b.parent] : null;
  }
  for (const b of list) {
    if (b.parentB) {
      b.parentB.children.push(b);
      b.soi = b.orbit.a * Math.pow(b.mu / b.parentB.mu, 0.4);
      b.period = TAU * Math.sqrt(Math.pow(b.orbit.a, 3) / b.parentB.mu);
    } else { b.soi = Infinity; b.period = 0; }
    b.g0 = b.mu / (b.R * b.R);
    b.spaceHigh = b.atmo ? b.atmo.h * 3.5 : Math.max(b.R * 0.4, 60000);
    b.flyingHigh = b.atmo ? b.atmo.h * 0.25 : 0;
  }
  const GAIA = B.gaia, SUN = B.solara;
  const TIME_DAY = GAIA.rot, TIME_YEAR = GAIA.period;
  window.TIME_DAY = TIME_DAY; window.TIME_YEAR = TIME_YEAR;

  /* Launch site — relocatable; campaign + multiplayer players place their own complex */
  const KSC = { body: GAIA, lat: -0.0018, lon: 0, alt: 68 };
  /* every site flattens a plateau + guarantees land (island if placed at sea) */
  const sites = [];
  function siteVectors(lat, lon) {
    const dir = { x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: -Math.cos(lat) * Math.sin(lon) };
    /* east = spinAxis × dir (normalized), north = dir × east */
    let e = { x: dir.z, y: 0, z: -dir.x };
    const el = Math.hypot(e.x, e.z) || 1;
    e = { x: e.x / el, y: 0, z: e.z / el };
    const n = { x: dir.y * e.z - dir.z * e.y, y: dir.z * e.x - dir.x * e.z, z: dir.x * e.y - dir.y * e.x };
    return { dir, east: e, north: n, lat, lon };
  }
  function syncSiteAlt() {
    const dir = latLonToBf(KSC.lat, KSC.lon);
    const saved = sites.slice();
    sites.length = 0;
    const out = { h: 0 };
    samplers.gaia(dir, out, false);
    sites.length = 0;
    sites.push(...saved);
    KSC.alt = Math.max(out.h, 5);
  }
  function setSite(lat, lon) {
    KSC.lat = lat; KSC.lon = lon;
    sites[0] = Object.assign(siteVectors(lat, lon), { home: true, bay: true });
    syncSiteAlt();
    /* terrain changed under the bake — old textures would show stale square patches */
    if (typeof PG !== 'undefined' && PG.invalidateBake) PG.invalidateBake('gaia');
  }
  function addRemoteSite(lat, lon, name, agency, agencyData) {
    const i = sites.findIndex(s => !s.home && s.name === name);
    const agencyName = typeof agency === 'string' ? agency : (agency && agency.name) || '';
    const s = Object.assign(siteVectors(lat, lon), {
      home: false, bay: false, name,
      agency: agencyName,
      agencyData: agencyData || (typeof agency === 'object' ? agency : null),
    });
    if (i >= 0) sites[i] = s;
    else sites.push(s);
    if (typeof PG !== 'undefined' && PG.invalidateBake) PG.invalidateBake('gaia');
    return s;
  }
  function removeRemoteSite(name) {
    const i = sites.findIndex(s => !s.home && s.name === name);
    if (i < 0) return;
    sites.splice(i, 1);
    if (typeof PG !== 'undefined' && PG.invalidateBake) PG.invalidateBake('gaia');
  }
  function clearRemoteSites() { sites.length = sites[0] ? 1 : 0; }
  function remoteSites() { return sites.filter(s => !s.home); }
  const MIN_SITE_SEP = 0.038;
  const _sepA = { x: 0, y: 0, z: 0 }, _sepB = { x: 0, y: 0, z: 0 };
  function siteAngularDist(lat1, lon1, lat2, lon2) {
    const a = latLonToBf(lat1, lon1, _sepA);
    const b = latLonToBf(lat2, lon2, _sepB);
    return Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1));
  }
  function minSiteSepKm() { return MIN_SITE_SEP * GAIA.R / 1000; }
  function sitePlacementConflict(lat, lon) {
    for (const st of sites) {
      if (st.home) continue;
      if (siteAngularDist(lat, lon, st.lat, st.lon) < MIN_SITE_SEP) {
        const label = st.agency || (st.name ? `${st.name}'s complex` : 'another launch complex');
        return label;
      }
    }
    return null;
  }

  /* ============ radiation environment (rad/h) ============ */
  const RAD_CFG = {
    gaia: { belts: [{ r0: 1.7, r1: 2.5, latW: 0.62, str: 4.5 }, { r0: 4.0, r1: 5.8, latW: 0.85, str: 1.4 }], magneto: 8 },
    goliath: { belts: [{ r0: 1.35, r1: 3.4, latW: 0.7, str: 13 }], magneto: 12 },
    vesper: { belts: [{ r0: 1.5, r1: 2.3, latW: 0.55, str: 2.6 }], magneto: 4 },
  };
  function radiationAt(bodyB, rVec, t) {
    const rl = rVec.length();
    const alt = rl - bodyB.R;
    let dose = 0.032;                                     // galactic background
    /* solar proximity */
    if (bodyB.id === 'solara') dose += 22 * Math.min((bodyB.R * 3 / Math.max(rl, 1)) ** 2, 4);
    /* magnetosphere shields the background near magnetic bodies */
    const cfg = RAD_CFG[bodyB.id];
    if (cfg && rl < bodyB.R * cfg.magneto) dose *= 0.35;
    /* atmosphere is the best shield of all */
    if (bodyB.atmo && alt < bodyB.atmo.h) dose *= lerp(0.02, 0.6, clamp(alt / bodyB.atmo.h, 0, 1));
    /* radiation belts */
    if (cfg) {
      const rr = rl / bodyB.R;
      const latB = Math.asin(clamp(Math.abs(rVec.y) / Math.max(rl, 1), 0, 1));
      for (const b of cfg.belts) {
        if (rr > b.r0 && rr < b.r1 && latB < b.latW) {
          dose += b.str * Math.sin((rr - b.r0) / (b.r1 - b.r0) * Math.PI);
        }
      }
    }
    /* solar storms (deterministic schedule, ~6h events every few days) */
    const storm = stormAt(t);
    if (storm > 0) {
      let s = storm * 9;
      if (cfg && rl < bodyB.R * cfg.magneto) s *= 0.25;
      if (bodyB.atmo && alt < bodyB.atmo.h) s *= lerp(0.01, 0.4, clamp(alt / bodyB.atmo.h, 0, 1));
      dose += s;
    }
    return dose;
  }
  function stormAt(t) {
    const block = Math.floor(t / 21600);                  // 6h blocks
    const r = Math.abs(Math.sin(block * 127.1) * 43758.5453) % 1;
    return r < 0.055 ? 0.6 + (r / 0.055) * 0.4 : 0;
  }

  /* ============ asteroid belt (visual + flavor) ============ */
  const BELT = { a0: 2.62e10, a1: 3.38e10, iSpread: 3.5 * DEG, n: 2400 };

  /* ============ terrain samplers ============ */
  /* sampler(dir, out, lowDetail) — dir: unit vec in body-fixed frame; fills out {h, r,g,b, biome, rough} */
  const samplers = {};
  function mix3(o, c1, c2, t) { o[0] = lerp(c1[0], c2[0], t); o[1] = lerp(c1[1], c2[1], t); o[2] = lerp(c1[2], c2[2], t); }
  function set3(o, c) { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }
  const tmpC = [0, 0, 0];

  /* --- Gaia --- */
  let adjustSiteHeight = null;
  (() => {
    const n1 = Simplex(101), n2 = Simplex(202), n3 = Simplex(303), n4 = Simplex(404), n5 = Simplex(505);
    function siteEllipsoid(x, y, z, st) {
      const sd = st.dir;
      const de = (x - sd.x) * st.east.x + (y - sd.y) * st.east.y + (z - sd.z) * st.east.z;
      const dn = (x - sd.x) * st.north.x + (y - sd.y) * st.north.y + (z - sd.z) * st.north.z;
      const wob = fbm(n4, x * 32 + 1.7, y * 32, z * 32, 3) * 0.0016;
      const wobN = fbm(n3, x * 14 - 3, y * 14, z * 14, 2) * 0.0009;
      const de2 = de + wob, dn2 = dn + wobN;
      const ang = Math.atan2(dn2, de2);
      const rx = 0.0046 + Math.cos(ang * 2.3 + st.lon) * 0.0007;
      const rz = 0.0060 + Math.sin(ang * 1.7) * 0.0006;
      const ell = Math.sqrt((de2 / rx) ** 2 + (dn2 / rz) ** 2);
      return ell;
    }
    adjustSiteHeight = (d, h) => {
      let nh = h, siteM = 0;
      const x = d.x, y = d.y, z = d.z;
      for (let si = 0; si < sites.length; si++) {
        const st = sites[si];
        const sd = st.dir;
        const kd = Math.sqrt((x - sd.x) ** 2 + (y - sd.y) ** 2 + (z - sd.z) ** 2);
        if (kd >= 0.22) continue;
        if (st.home) {
          const ell = siteEllipsoid(x, y, z, st);
          const micro = fbm(n4, x * 55, y * 55, z * 55, 2) * 14 - 7;
          const core = smooth(0.42, 0.14, ell);
          const apron = smooth(1.12, 0.32, ell);
          if (core > 0) nh = lerp(nh, KSC.alt + micro * 0.12, core);
          if (apron > core) nh = lerp(nh, KSC.alt + micro * 0.35, (apron - core) / Math.max(1 - core, 0.001));
          siteM = Math.max(siteM, apron);
        } else {
          const padM = smooth(0.014, 0.004, kd);
          if (padM > 0) nh = lerp(nh, KSC.alt, padM);
          siteM = Math.max(siteM, padM);
        }
      }
      return nh;
    };
    const C = {
      water: [0.05, 0.18, 0.32], reef: [0.1, 0.38, 0.42], beach: [0.78, 0.71, 0.52], grass: [0.31, 0.47, 0.19],
      savanna: [0.55, 0.55, 0.26], forest: [0.14, 0.31, 0.11], jungle: [0.08, 0.26, 0.1],
      desert: [0.74, 0.59, 0.36], dunes: [0.8, 0.62, 0.34], wetland: [0.25, 0.38, 0.22],
      rock: [0.45, 0.42, 0.38], volcanic: [0.24, 0.2, 0.19], snow: [0.93, 0.95, 0.98],
      tundra: [0.55, 0.55, 0.45], taiga: [0.25, 0.36, 0.28], ksc: [0.37, 0.51, 0.25]
    };
    samplers.gaia = (d, out, low) => {
      const x = d.x, y = d.y, z = d.z;
      const cont = fbm(n1, x * 1.35, y * 1.35, z * 1.35, low ? 3 : 4) + 0.08;       // continents
      const mountainMask = clamp(fbm(n2, x * 2.2 + 9, y * 2.2, z * 2.2, 3) * 2.5 - 0.68, 0, 1);
      let h = cont * 2800;
      if (h > 0) {
        h += ridged(n3, x * 6, y * 6, z * 6, low ? 3 : 5) * 1800 * mountainMask * mountainMask;
        h += fbm(n4, x * 30, y * 30, z * 30, low ? 2 : 4) * 180;                     // local detail
      } else h = h * 0.7 - 400 + fbm(n4, x * 8, y * 8, z * 8, 3) * 300;              // ocean floor
      /* launch sites: continental shelf + lowland apron + plateau (multi-site aware) */
      let siteM = 0;
      for (let si = 0; si < sites.length; si++) {
        const st = sites[si], sd = st.dir;
        const kd = Math.sqrt((x - sd.x) ** 2 + (y - sd.y) ** 2 + (z - sd.z) ** 2);
        if (kd >= 0.22) continue;
        /* lift only underwater cells to guarantee dry land — never flatten a visible disc */
        const landM = smooth(0.10, 0.04, kd);
        if (landM > 0 && h < 30) h = lerp(h, Math.max(h, 48 + fbm(n4, x * 18, y * 18, z * 18, 2) * 22), landM);
        /* home complex: organic elliptical apron — soft edges blend into surrounding hills */
        if (st.home) {
          const ell = siteEllipsoid(x, y, z, st);
          const micro = fbm(n4, x * 55, y * 55, z * 55, 2) * 14 - 7;
          const core = smooth(0.42, 0.14, ell);
          const apron = smooth(1.12, 0.32, ell);
          if (core > 0) h = lerp(h, KSC.alt + micro * 0.12, core);
          if (apron > core) h = lerp(h, KSC.alt + micro * 0.35, (apron - core) / Math.max(1 - core, 0.001));
          siteM = Math.max(siteM, apron);
        } else {
          const padM = smooth(0.014, 0.004, kd);
          if (padM > 0) h = lerp(h, KSC.alt, padM);
          siteM = Math.max(siteM, padM);
        }
        /* organic bay east of the home site (noise-warped shoreline) */
        if (st.bay) {
          const de = (x - sd.x) * st.east.x + (y - sd.y) * st.east.y + (z - sd.z) * st.east.z;
          const dn = (x - sd.x) * st.north.x + (y - sd.y) * st.north.y + (z - sd.z) * st.north.z;
          if (de > 0.005 && de < 0.32 && Math.abs(dn) < 0.22) {
            const bay = Math.sqrt(((de - 0.10) / 0.085) ** 2 + (dn / 0.075) ** 2);
            const wob = fbm(n3, x * 14 + 7, y * 14, z * 14, 3) * 0.35;
            const bayM = smooth(1.0 + wob, 0.55 + wob * 0.5, bay) * smooth(0.005, 0.03, de);
            if (bayM > 0) h = lerp(h, -500, bayM);
          }
        }
      }
      out.h = h;
      const lat = Math.abs(Math.asin(clamp(y, -1, 1)));
      const moist = fbm(n2, x * 3.1, y * 3.1, z * 3.1, 3);
      const volc = fbm(n5, x * 2.6 + 17, y * 2.6, z * 2.6, 2);
      const icecap = lat > 1.28 || (lat > 1.18 && h > 1500);
      let biome, col;
      if (h <= 0) {
        if (h > -120) { biome = 10; col = C.reef; }                                  // shallows / reef
        else { biome = 0; col = C.water; }
      }
      else if (h < 45) { biome = 1; col = C.beach; }
      else if (icecap) { biome = 8; col = C.snow; }
      else if (volc > 0.52 && h > 800) { biome = 13; col = C.volcanic; }             // volcanic ridge
      else if (h > 3000) { biome = 6; col = h > 4300 ? C.snow : C.rock; }
      else if (h > 1500) { biome = 5; mix3(tmpC, C.rock, C.tundra, 0.5); col = tmpC; }
      else if (lat > 1.0) { biome = 7; col = moist > 0.1 ? C.taiga : C.tundra; }
      else if (h < 110 && moist > 0.34) { biome = 12; col = C.wetland; }             // wetlands
      else if (moist < -0.34) { biome = 14; col = C.dunes; }                         // dune sea
      else if (moist < -0.18) { biome = 4; col = C.desert; }
      else if (moist > 0.42 && lat < 0.45) { biome = 15; col = C.jungle; }           // jungle
      else if (moist > 0.22) { biome = 3; col = C.forest; }
      else if (moist < 0.0 && lat < 0.7) { biome = 11; col = C.savanna; }            // savanna
      else { biome = 2; col = C.grass; }
      if (siteM > 0.08 && h > 0) {
        mix3(tmpC, col, C.grass, clamp(siteM * 0.45, 0, 0.5));
        mix3(tmpC, tmpC, C.ksc, clamp(siteM * 0.22, 0, 0.3));
        col = tmpC;
      }
      set3(out, col); out.biome = biome;
      /* color jitter + macro hue variation (large-scale patchiness reads as farmland/geology) */
      const j = n4(x * 90, y * 90, z * 90) * 0.05 + n5(x * 7, y * 7, z * 7) * 0.035;
      out[0] = clamp(out[0] + j, 0, 1); out[1] = clamp(out[1] + j * 1.1, 0, 1); out[2] = clamp(out[2] + j * 0.8, 0, 1);
    };
  })();

  /* --- generic cratered rocky world --- */
  function rockySampler(seed, opt) {
    const n1 = Simplex(seed), n2 = Simplex(seed + 7), n3 = Simplex(seed + 19);
    const o = Object.assign({ base: 2500, ridge: 1800, craterF: 5, craterD: 1600, craterF2: 16, craterD2: 420,
      colLow: [0.32, 0.31, 0.3], colHigh: [0.55, 0.54, 0.52], colRim: [0.62, 0.6, 0.58], maria: false, biomeFn: null }, opt);
    return (d, out, low) => {
      const x = d.x, y = d.y, z = d.z;
      let h = fbm(n1, x * 1.6, y * 1.6, z * 1.6, low ? 3 : 4) * o.base;
      h += ridged(n2, x * 4.2, y * 4.2, z * 4.2, low ? 2 : 4) * o.ridge * clamp(fbm(n1, x * 1.1 + 5, y * 1.1, z * 1.1, 2) + 0.4, 0, 1);
      let mariaM = 0;
      if (o.maria) {
        mariaM = smooth(0.05, 0.25, fbm(n3, x * 1.2 + 31, y * 1.2, z * 1.2, 3));
        h = lerp(h, h * 0.25 - 350, mariaM);
      }
      const c1 = craters(x, y, z, o.craterF, o.craterD, seed);
      const c2 = low ? 0 : craters(x, y, z, o.craterF2, o.craterD2, seed + 3);
      h += c1 + c2;
      if (!low) h += fbm(n3, x * 40, y * 40, z * 40, 3) * o.base * 0.04;
      out.h = h;
      const t = clamp((h + o.base) / (2.4 * o.base), 0, 1);
      mix3(out, o.colLow, o.colHigh, t);
      if (c1 + c2 > o.craterD * 0.1) mix3(out, out, o.colRim, 0.5);
      if (o.maria && mariaM > 0.4) { out[0] *= 0.72; out[1] *= 0.72; out[2] *= 0.75; }
      const j = n3(x * 70, y * 70, z * 70) * 0.04;
      out[0] = clamp(out[0] + j, 0, 1); out[1] = clamp(out[1] + j, 0, 1); out[2] = clamp(out[2] + j, 0, 1);
      const lat = Math.abs(Math.asin(clamp(y, -1, 1)));
      out.biome = o.biomeFn ? o.biomeFn(h, lat, mariaM, c1) : 0;
    };
  }
  samplers.selene = rockySampler(900, {
    base: 2600, ridge: 1300, craterF: 4.5, craterD: 2200, craterF2: 17, craterD2: 600, maria: true,
    colLow: [0.34, 0.33, 0.33], colHigh: [0.58, 0.57, 0.56], colRim: [0.66, 0.65, 0.64],
    biomeFn: (h, lat, maria, c) => lat > 1.25 ? 4 : maria > 0.4 ? 0 : c < -200 ? 1 : h > 2400 ? 2 : h < -900 ? 3 : 1 });
  samplers.cinder = rockySampler(411, {
    base: 2100, ridge: 2400, craterF: 6, craterD: 1500, colLow: [0.3, 0.22, 0.17], colHigh: [0.52, 0.4, 0.3], colRim: [0.6, 0.5, 0.4],
    biomeFn: (h, lat) => lat > 1.2 ? 3 : h > 2200 ? 1 : h < -400 ? 2 : 0 });
  samplers.shard = rockySampler(515, {
    base: 2400, ridge: 2600, craterF: 7, craterD: 1100, colLow: [0.3, 0.29, 0.28], colHigh: [0.52, 0.5, 0.48],
    biomeFn: (h, lat) => lat > 1.2 ? 2 : h > 1800 ? 1 : 0 });
  samplers.crag = rockySampler(618, {
    base: 4200, ridge: 5200, craterF: 4, craterD: 2400, colLow: [0.38, 0.34, 0.28], colHigh: [0.62, 0.58, 0.5],
    biomeFn: (h, lat, m, c) => lat > 1.25 ? 3 : c < -300 ? 2 : h > 4500 ? 1 : 0 });

  /* canyon worlds (Rust / Grit) */
  function canyonSampler(seed, opt) {
    const n1 = Simplex(seed), n2 = Simplex(seed + 5), n3 = Simplex(seed + 9);
    return (d, out, low) => {
      const x = d.x, y = d.y, z = d.z;
      const lat = Math.asin(clamp(y, -1, 1));
      let h = fbm(n1, x * 1.8, y * 1.8, z * 1.8, low ? 3 : 4) * opt.base + opt.base * 0.25;
      h += Math.abs(fbm(n2, x * 7, y * 7, z * 7, low ? 2 : 3)) * opt.base * 0.5;      // dunes
      /* great canyon: band around tilted circle */
      const band = Math.abs(y * 0.85 + n1(x * 1.3, y * 1.3, z * 1.3) * 0.34);
      const canyon = smooth(0.16, 0.05, band) * smooth(-0.3, 0.25, n2(x * 2.1 + 3, y * 2.1, z * 2.1));
      h -= canyon * opt.canyonD * (0.6 + 0.4 * Math.abs(n3(x * 9, y * 9, z * 9)));
      h += craters(x, y, z, 9, opt.craterD, seed);
      if (!low) h += fbm(n3, x * 36, y * 36, z * 36, 3) * 130;
      out.h = h;
      const cap = Math.abs(lat) > opt.capLat - (h > opt.base ? 0.12 : 0);
      let biome;
      if (cap) { set3(out, [0.9, 0.92, 0.95]); biome = 4; }
      else if (canyon > 0.45) { mix3(out, opt.colCanyon, opt.colLow, clamp(h / opt.base, 0, 1) * 0.4); biome = 2; }
      else {
        const t = clamp(h / (opt.base * 1.8), 0, 1);
        mix3(out, opt.colLow, opt.colHigh, t);
        biome = h > opt.base * 1.25 ? 3 : (Math.abs(fbm(n2, x * 7, y * 7, z * 7, 2)) > 0.3 ? 1 : 0);
      }
      const j = n3(x * 80, y * 80, z * 80) * 0.045;
      out[0] = clamp(out[0] + j, 0, 1); out[1] = clamp(out[1] + j, 0, 1); out[2] = clamp(out[2] + j, 0, 1);
      out.biome = biome;
    };
  }
  samplers.rust = canyonSampler(721, { base: 2600, canyonD: 5200, craterD: 500, capLat: 1.22,
    colLow: [0.62, 0.3, 0.16], colHigh: [0.78, 0.46, 0.25], colCanyon: [0.4, 0.18, 0.1] });
  samplers.grit = canyonSampler(833, { base: 2200, canyonD: 6500, craterD: 1200, capLat: 1.3,
    colLow: [0.42, 0.38, 0.33], colHigh: [0.58, 0.54, 0.48], colCanyon: [0.3, 0.26, 0.22] });

  /* ice worlds */
  function iceSampler(seed, opt) {
    const n1 = Simplex(seed), n2 = Simplex(seed + 3), n3 = Simplex(seed + 11);
    return (d, out, low) => {
      const x = d.x, y = d.y, z = d.z;
      const hills = clamp(fbm(n1, x * 2, y * 2, z * 2, low ? 3 : 4) * 1.6 - opt.flatBias, 0, 2);
      let h = hills * opt.base;
      h += ridged(n2, x * 5.5, y * 5.5, z * 5.5, low ? 2 : 4) * opt.ridge * smooth(0.1, 0.5, hills);
      if (opt.cracks) {
        const cr = Math.abs(n3(x * 3.4, y * 3.4, z * 3.4));
        if (cr < 0.09) h -= (0.09 - cr) / 0.09 * opt.cracks;
      }
      if (opt.craters) h += craters(x, y, z, 7, opt.base * 0.55, seed);
      if (h < 18 && opt.flats) h = h * 0.06;
      if (!low) h += fbm(n3, x * 44, y * 44, z * 44, 2) * 30;
      out.h = h;
      const t = clamp(h / (opt.base * 1.7), 0, 1);
      mix3(out, opt.colLow, opt.colHigh, t);
      const streak = fbm(n2, x * 11 + 2, y * 11, z * 11, 3);
      out[0] *= 0.9 + streak * 0.12;
      out[2] *= 0.86 + streak * 0.18;
      let biome = h < 25 && opt.flats ? 0 : h > opt.base * 1.05 ? 2 : 1;
      if (opt.cracks && h < -opt.cracks * 0.25) { set3(out, opt.colCrack); biome = 1; }
      if (opt.craters && h < -opt.base * 0.08) {
        mix3(out, out, opt.colCrack || [0.38, 0.44, 0.5], 0.55);
        biome = 1;
      }
      const lat = Math.abs(Math.asin(clamp(y, -1, 1)));
      if (lat > 1.3) { mix3(out, out, [0.72, 0.78, 0.84], 0.35); biome = 3; }
      const j = n3(x * 60, y * 60, z * 60) * 0.045;
      out[0] = clamp(out[0] + j, 0, 1); out[1] = clamp(out[1] + j, 0, 1); out[2] = clamp(out[2] + j, 0, 1);
      out.biome = biome;
    };
  }
  samplers.frost = iceSampler(944, { base: 900, ridge: 700, flatBias: 0.55, flats: true, craters: true,
    colLow: [0.48, 0.58, 0.62], colHigh: [0.72, 0.8, 0.82], colCrack: [0.32, 0.38, 0.44] });
  samplers.tundra = iceSampler(1055, { base: 2400, ridge: 2800, flatBias: 0.2, flats: false, craters: true,
    colLow: [0.45, 0.52, 0.58], colHigh: [0.68, 0.74, 0.78], colCrack: [0.28, 0.32, 0.38] });
  samplers.wanderer = iceSampler(1166, { base: 1900, ridge: 1400, flatBias: 0.35, flats: true, cracks: 2400, craters: true,
    colLow: [0.55, 0.58, 0.6], colHigh: [0.78, 0.8, 0.82], colCrack: [0.38, 0.28, 0.22] });

  /* ocean moon Aqua */
  (() => {
    const n1 = Simplex(1277), n2 = Simplex(1281), n3 = Simplex(1283);
    samplers.aqua = (d, out, low) => {
      const x = d.x, y = d.y, z = d.z;
      let h = (fbm(n1, x * 2.4, y * 2.4, z * 2.4, low ? 3 : 4) - 0.18) * 4200;
      if (h > 0) h += ridged(n2, x * 8, y * 8, z * 8, low ? 2 : 4) * 1500;
      else h = h * 0.6 - 300;
      if (!low) h += fbm(n3, x * 38, y * 38, z * 38, 2) * 90;
      out.h = h;
      const lat = Math.abs(Math.asin(clamp(y, -1, 1)));
      let biome;
      if (h <= 0) { set3(out, [0.03, 0.15, 0.3]); biome = 0; }
      else if (h < 60) { set3(out, [0.55, 0.55, 0.4]); biome = 2; }
      else if (h > 1500) { set3(out, [0.8, 0.85, 0.9]); biome = 3; }
      else { set3(out, [0.22, 0.36, 0.2]); biome = 1; }
      if (lat > 1.22) { set3(out, [0.9, 0.94, 0.97]); biome = 4; }
      const j = n3(x * 70, y * 70, z * 70) * 0.04;
      out[0] = clamp(out[0] + j, 0, 1); out[1] = clamp(out[1] + j, 0, 1); out[2] = clamp(out[2] + j, 0, 1);
      out.biome = biome;
    };
  })();

  /* tiny potato moons — radius distortion via low-freq noise */
  function potatoSampler(seed, colA, colB, amp) {
    const n1 = Simplex(seed), n2 = Simplex(seed + 2);
    return (d, out, low) => {
      const x = d.x, y = d.y, z = d.z;
      let h = fbm(n1, x * 1.1, y * 1.1, z * 1.1, 3) * amp;
      const c1 = craters(x, y, z, 5, amp * 0.45, seed);
      const c2 = low ? 0 : craters(x, y, z, 12, amp * 0.12, seed + 2);
      h += c1 + c2;
      if (!low) h += fbm(n2, x * 14, y * 14, z * 14, 3) * amp * 0.12;
      out.h = h;
      mix3(out, colA, colB, clamp(h / amp + 0.5, 0, 1));
      if (c1 + c2 < -amp * 0.04) { out[0] *= 0.72; out[1] *= 0.72; out[2] *= 0.75; }
      const j = n2(x * 50, y * 50, z * 50) * 0.06;
      out[0] = clamp(out[0] + j, 0, 1); out[1] = clamp(out[1] + j, 0, 1); out[2] = clamp(out[2] + j, 0, 1);
      out.biome = h > amp * 0.25 ? 1 : 0;
    };
  }
  samplers.mote = potatoSampler(1388, [0.32, 0.3, 0.28], [0.52, 0.48, 0.44], 2800);
  samplers.pebble = potatoSampler(1499, [0.34, 0.26, 0.18], [0.55, 0.42, 0.3], 9000);
  samplers.plume = potatoSampler(1601, [0.48, 0.42, 0.28], [0.68, 0.6, 0.4], 5200);

  /* vesper — violet ridge world */
  (() => {
    const n1 = Simplex(1700), n2 = Simplex(1703), n3 = Simplex(1709);
    samplers.vesper = (d, out, low) => {
      const x = d.x, y = d.y, z = d.z;
      let h = (fbm(n1, x * 1.5, y * 1.5, z * 1.5, low ? 3 : 4) + 0.05) * 4800;
      const m = clamp(fbm(n2, x * 1.9 + 4, y * 1.9, z * 1.9, 3) * 2 - 0.2, 0, 1);
      if (h > 0) h += ridged(n2, x * 5, y * 5, z * 5, low ? 3 : 5) * 5200 * m;
      else h = h * 0.8 - 600;
      if (!low) h += fbm(n3, x * 30, y * 30, z * 30, 3) * 200;
      out.h = h;
      const lat = Math.abs(Math.asin(clamp(y, -1, 1)));
      let biome;
      if (h <= 0) { set3(out, [0.32, 0.13, 0.42]); biome = 0; }
      else if (h < 800) { set3(out, [0.45, 0.3, 0.5]); biome = 1; }
      else if (h < 3200) { set3(out, [0.55, 0.4, 0.62]); biome = 2; }
      else { set3(out, [0.75, 0.68, 0.82]); biome = 3; }
      if (lat > 1.25) { set3(out, [0.82, 0.78, 0.9]); biome = 4; }
      const j = n3(x * 60, y * 60, z * 60) * 0.04;
      out[0] = clamp(out[0] + j, 0, 1); out[1] = clamp(out[1] + j, 0, 1); out[2] = clamp(out[2] + j, 0, 1);
      out.biome = biome;
    };
  })();

  for (const b of list) b.sampler = samplers[b.id] || null;
  /* default site: scan equatorial belt for coastal/grass lowland (lon 0 is a 4 km peak) */
  (() => {
    const out = { h: 0 };
    let bestLat = -0.0018, bestLon = 0, bestH = 1e9;
    for (let lat = -0.14; lat <= 0.06; lat += 0.025) {
      for (let lon = -Math.PI; lon < Math.PI; lon += 0.09) {
        samplers.gaia(latLonToBf(lat, lon), out, true);
        if (out.h > 30 && out.h < 220 && out.h < bestH) { bestH = out.h; bestLat = lat; bestLon = lon; }
      }
    }
    setSite(bestLat, bestLon);
  })();

  /* ============ queries ============ */
  const _out = { h: 0, 0: 0, 1: 0, 2: 0, biome: 0 };
  function heightAt(bodyB, dirBF) {                       // terrain height above R (m)
    if (!bodyB.sampler) return 0;
    bodyB.sampler(dirBF, _out, false);
    return _out.h;
  }
  function biomeAt(bodyB, dirBF) {
    if (!bodyB.sampler) return 0;
    bodyB.sampler(dirBF, _out, false);
    return _out.biome;
  }
  function atmoDensity(bodyB, h) {
    if (!bodyB.atmo || h > bodyB.atmo.h || h < -2000) return h <= 0 && bodyB.atmo ? bodyB.atmo.rho0 : 0;
    return bodyB.atmo.rho0 * Math.exp(-Math.max(h, 0) / bodyB.atmo.scaleH);
  }
  function atmoPressure(bodyB, h) { return atmoDensity(bodyB, h) / (bodyB.atmo ? bodyB.atmo.rho0 : 1); }  // 0..1 rel
  function spinAngle(bodyB, t) { return bodyB.rot0 + TAU * t / bodyB.rot; }
  /* body-fixed <-> body-centered-inertial */
  function bfToInertial(bodyB, v, t, out) {
    const a = spinAngle(bodyB, t), c = Math.cos(a), s = Math.sin(a);
    const x = v.x * c + v.z * s, z = -v.x * s + v.z * c;
    out = out || new THREE.Vector3(); out.set(x, v.y, z); return out;
  }
  function inertialToBf(bodyB, v, t, out) {
    const a = -spinAngle(bodyB, t), c = Math.cos(a), s = Math.sin(a);
    const x = v.x * c + v.z * s, z = -v.x * s + v.z * c;
    out = out || new THREE.Vector3(); out.set(x, v.y, z); return out;
  }
  function latLonToBf(lat, lon, out) {
    out = out || new THREE.Vector3();
    out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
    return out;
  }
  /* body-fixed position on the surface at a launch site (samples terrain height) */
  function siteGroundBf(lat, lon, out) {
    const dir = latLonToBf(lat, lon, out || new THREE.Vector3());
    const h = heightAt(GAIA, dir);
    return dir.multiplyScalar(GAIA.R + h + 0.2);
  }
  /* launch pad center in body-fixed coords (matches flight spawn + KSC mesh layout) */
  function sitePadBf(lat, lon, out) {
    const base = siteGroundBf(lat, lon, out || new THREE.Vector3());
    const up = base.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    return base.add(new THREE.Vector3(170, 4.2, 60).applyQuaternion(q));
  }
  function bfToLatLon(d) { return { lat: Math.asin(clamp(d.y, -1, 1)), lon: -Math.atan2(d.z, d.x) }; }
  /* angular velocity vector of body spin (inertial frame) */
  function spinOmega(bodyB, out) { out = out || new THREE.Vector3(); out.set(0, TAU / bodyB.rot, 0); return out; }

  function situation(bodyB, h, splashed) {
    if (h <= 0.5 && splashed) return 'splashed';
    if (h <= (bodyB.landedEps || 50) && splashed === false) { } // caller decides landed via contact
    if (bodyB.atmo && h < bodyB.flyingHigh) return 'flyingLow';
    if (bodyB.atmo && h < bodyB.atmo.h) return 'flyingHigh';
    if (h < bodyB.spaceHigh) return 'spaceLow';
    return 'spaceHigh';
  }

  const NSC = KSC;
  return { B, list, GAIA, SUN, KSC, NSC, BELT, RAD_CFG, sites, setSite, syncSiteAlt, addRemoteSite, removeRemoteSite, clearRemoteSites, remoteSites, siteAngularDist, sitePlacementConflict, minSiteSepKm, MIN_SITE_SEP, adjustSiteHeight, radiationAt, stormAt, TIME_DAY, TIME_YEAR, heightAt, biomeAt, atmoDensity, atmoPressure, spinAngle, bfToInertial, inertialToBf, latLonToBf, bfToLatLon, siteGroundBf, sitePadBf, spinOmega, situation };
})();
