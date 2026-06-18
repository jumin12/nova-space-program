/* career.js — science, tech tree, contracts, R&D + Mission Control + Tracking screens. Global: CAREER */
'use strict';
const CAREER = (() => {
  const { el } = U;

  /* ============ tech tree — probes first, crews earned, slow grind to the stars ============ */
  const TECH = {
    start: { name: 'Sounding Rockets', cost: 0, x: 0, y: 2.4, parents: [] },
    rocketry1: { name: 'Basic Rocketry', cost: 5, x: 1, y: 1.5, parents: ['start'] },
    instruments: { name: 'Early Instruments', cost: 8, x: 1, y: 3.3, parents: ['start'] },
    stability: { name: 'Stability', cost: 12, x: 2, y: 0.6, parents: ['rocketry1'] },
    rocketry2: { name: 'General Rocketry', cost: 18, x: 2, y: 1.9, parents: ['rocketry1'] },
    telemetry: { name: 'Telemetry & Tracking', cost: 15, x: 2, y: 3.3, parents: ['instruments'] },
    aviation: { name: 'Aviation', cost: 32, x: 2, y: 4.6, parents: ['instruments'] },
    recovery: { name: 'Recovery Systems', cost: 16, x: 3, y: 0.0, parents: ['stability'] },
    survivability: { name: 'Survivability', cost: 18, x: 3, y: 0.9, parents: ['stability'] },
    propulsion2: { name: 'Improved Engines', cost: 26, x: 3, y: 1.7, parents: ['rocketry2'] },
    structures: { name: 'Structural Engineering', cost: 22, x: 3, y: 2.6, parents: ['rocketry2'] },
    flightControl: { name: 'Flight Control', cost: 24, x: 3, y: 3.5, parents: ['telemetry'] },
    relayNet: { name: 'Relay Networks', cost: 46, x: 3, y: 4.6, parents: ['telemetry'] },
    landing: { name: 'Landing Systems', cost: 28, x: 4, y: 0.2, parents: ['survivability', 'recovery'] },
    advRocketry: { name: 'Advanced Rocketry', cost: 40, x: 4, y: 1.4, parents: ['propulsion2'] },
    precision: { name: 'Precision Engines', cost: 56, x: 4, y: 2.3, parents: ['propulsion2'] },
    spaceExploration: { name: 'Deep Sounding', cost: 36, x: 4, y: 3.1, parents: ['flightControl'] },
    orbitalProbes: { name: 'Orbital Probes', cost: 40, x: 4, y: 4.0, parents: ['flightControl'] },
    opticsLab: { name: 'Orbital Optics', cost: 62, x: 4, y: 4.9, parents: ['orbitalProbes'] },
    lifeSupport: { name: 'Life Support', cost: 44, x: 5, y: 0.6, parents: ['survivability'] },
    heavyProp: { name: 'Heavy Propulsion', cost: 52, x: 5, y: 1.5, parents: ['advRocketry'] },
    radiationTech: { name: 'Radiation Shielding', cost: 58, x: 5, y: 2.4, parents: ['spaceExploration'] },
    surfaceSci: { name: 'Field Science', cost: 42, x: 5, y: 3.2, parents: ['spaceExploration'] },
    electrics: { name: 'Electrics', cost: 48, x: 5, y: 4.0, parents: ['orbitalProbes'] },
    probesAdv: { name: 'Probe Autonomy', cost: 56, x: 5, y: 4.9, parents: ['orbitalProbes', 'electrics'] },
    commandModules: { name: 'Crewed Capsules', cost: 75, x: 6, y: 1.0, parents: ['precision', 'lifeSupport'] },
    heavyConstruction: { name: 'Colossal Construction', cost: 88, x: 6, y: 1.9, parents: ['heavyProp'] },
    docking: { name: 'Orbital Docking', cost: 64, x: 6, y: 2.8, parents: ['probesAdv'] },
    advExperiments: { name: 'Advanced Experiments', cost: 70, x: 6, y: 3.6, parents: ['surfaceSci', 'opticsLab'] },
    ion: { name: 'Ion Propulsion', cost: 115, x: 6, y: 4.4, parents: ['electrics'] },
    deepComms: { name: 'Deep Space Network', cost: 95, x: 6, y: 5.2, parents: ['relayNet', 'electrics'] },
    advCapsules: { name: 'Advanced Capsules', cost: 100, x: 7, y: 1.4, parents: ['commandModules'] },
    nuclearProp: { name: 'Nuclear Propulsion', cost: 130, x: 7, y: 2.3, parents: ['heavyConstruction'] },
  };
  const techParts = id => Object.values(PARTS.CATALOG).filter(p => p.tech === id);
  const hasTech = id => GAME.save.tech.includes(id);
  const partUnlocked = defId => GAME.save.mode === 'sandbox' || hasTech(PARTS.CATALOG[defId].tech);

  /* ============ science ============ */
  const EXPS = {
    crew: { name: 'Crew Report', base: 5, needsCrew: true, flavor: 'The crew describes the view as “{adj}”. Detailed notes attached, plus one doodle.' },
    surface: { name: 'Surface Sample', base: 30, needsCrew: true, situs: ['landed', 'splashed'], flavor: 'A scoop of {biome} material. Smells faintly of {smell}.' },
    eva: { name: 'EVA Report', base: 12, needsCrew: true, flavor: 'Field notes from outside the vehicle: “{adj}”. Helmet camera footage attached.' },
    thermo: { name: 'Temperature Scan', base: 8, flavor: 'The thermometer reports {temp}. It seems {adj} about it.' },
    baro: { name: 'Pressure Scan', base: 12, flavor: 'Pressure logged. The needle moved {adj2}.' },
    bio: { name: 'Bio Pod Reaction', base: 10, flavor: 'The sample turned {color} and is now {verb}. Fascinating.' },
    seismo: { name: 'Seismic Reading', base: 20, situs: ['landed'], flavor: 'The ground of {body} hums at a stately rhythm. Geologists weep with joy.' },
    atmos: { name: 'Atmosphere Analysis', base: 18, needsAtmo: true, flavor: 'Air composition of {body} catalogued. Do not breathe (see appendix).' },
    matsci: { name: 'Materials Study', base: 25, flavor: 'Several materials experienced {body} conditions. Some are no longer materials.' },
    photo: { name: 'Film Photography', base: 16, noTransmit: true, flavor: 'A roll of film exposed over {body}. The lab begs you to bring it home intact.' },
    geiger: { name: 'Radiation Survey', base: 14, flavor: 'Background count over {body}: {adj2} energetic. The detector {verb}.' },
    scope: { name: 'Telescope Observation', base: 22, situs: ['spaceLow', 'spaceHigh'], flavor: 'Long-exposure imagery of {target}. Astronomers are openly weeping (the good kind).' },
    grav: { name: 'Gravity Gradient Survey', base: 24, situs: ['spaceLow', 'spaceHigh'], flavor: 'The gravity field of {body} has lumps. Cartographers of the invisible rejoice.' },
  };
  const SITU_MULT = { landed: 1.3, splashed: 1.2, flyingLow: 0.7, flyingHigh: 0.9, spaceLow: 1.0, spaceHigh: 1.05 };
  const SITU_NAME = { landed: 'landed at', splashed: 'splashed down in', flyingLow: 'flying low over', flyingHigh: 'flying high over', spaceLow: 'in space near', spaceHigh: 'in space high above' };
  const DIMINISH = [1, 0.4, 0.15, 0];

  function sciKey(expId, bodyId, situ, biome) {
    const biomeMatters = situ === 'landed' || situ === 'splashed' || situ === 'flyingLow';
    return `${expId}|${bodyId}|${situ}${biomeMatters ? '|' + biome : ''}`;
  }
  /* evaluate an experiment without collecting; opts.target = telescope target body */
  function evalExperiment(expId, body, situ, biomeIdx, opts = {}) {
    const exp = EXPS[expId];
    if (!exp) return null;
    if (exp.situs && !exp.situs.includes(situ)) return { blocked: `Needs to be ${exp.situs.join(' or ')}.` };
    if (exp.needsAtmo && !body.atmo) return { blocked: 'Requires an atmosphere.' };
    const biome = (body.biomes && body.biomes[biomeIdx]) || 'Surface';
    let key, mult;
    if (expId === 'scope') {
      if (!opts.target) return { blocked: 'No target centered in the telescope.' };
      key = `scope|${opts.target.id}|obs`;
      mult = Math.max(opts.target.sciMult, 1);
    } else {
      key = sciKey(expId, body.id, situ, biomeIdx);
      mult = (situ === 'splashed' && body.sciMultSplash ? body.sciMultSplash : body.sciMult) * (SITU_MULT[situ] || 1);
    }
    const count = GAME.save.sciLog[key] || 0;
    const sciScale = (GAME.save.cfg && GAME.save.cfg.sciMult) || 1;
    const value = Math.round(exp.base * mult * DIMINISH[Math.min(count, 3)] * sciScale * 10) / 10;
    const rng = U.mulberry32((U.hash3(expId.length, body.id.length, biomeIdx + count) * 1e9) | 0);
    const pick = a => a[(rng() * a.length) | 0];
    const text = exp.flavor
      .replace('{adj}', pick(['breathtaking', 'mildly terrifying', 'spinny', 'very far from snacks', 'poetic', 'extremely round']))
      .replace('{adj2}', pick(['dramatically', 'barely', 'suspiciously', 'with great purpose']))
      .replace('{temp}', pick(['a balmy reading', 'a brisk reading', 'numbers best left unread', 'pleasantly survivable values']))
      .replace('{color}', pick(['chartreuse', 'a deeply unsettling beige', 'plaid, somehow', 'luminous teal']))
      .replace('{verb}', pick(['humming', 'judging you', 'photosynthesizing aggressively', 'doing fine, thanks']))
      .replace('{smell}', pick(['ozone', 'old garage', 'victory', 'regolith and ambition']))
      .replace('{biome}', biome).replace('{body}', body.name)
      .replace('{target}', opts.target ? opts.target.name : '');
    const situName = expId === 'scope' ? `observing ${opts.target.name}` :
      `${SITU_NAME[situ]} ${body.name}` + (situ === 'landed' || situ === 'splashed' || situ === 'flyingLow' ? ` (${biome})` : '');
    return { expId, exp, body, situ, biome, biomeIdx, key, count, value, text, situName };
  }
  function collectScience(result, factor = 1) {
    GAME.save.sciLog[result.key] = (GAME.save.sciLog[result.key] || 0) + 1;
    const got = Math.round(result.value * factor * 10) / 10;
    GAME.earnSci(got);
    if (window.NET && NET.active) NET.onScience(got, result.exp.name);
    UI.toast(`+${got} Science`, result.exp.name + ' — ' + result.situName, 'sci');
    onScienceCollected(result);
    GAME.saveNow();
    return got;
  }

  /* ============ contracts (milestones) ============ */
  const CONTRACTS = [
    { id: 'first', name: 'Ignition!', desc: 'Launch your first vessel from the pad.', funds: 9000, sci: 4 },
    { id: 'alt10', name: 'Touch the Sky', desc: 'Reach an altitude of 10 km.', funds: 14000, sci: 6 },
    { id: 'space', name: 'Officially Space', desc: 'Climb above the atmosphere (72 km).', funds: 26000, sci: 12 },
    { id: 'orbit', name: 'Going in Circles', desc: 'Achieve a stable uncrewed orbit of Gaia (periapsis above 72 km).', funds: 45000, sci: 16 },
    { id: 'return', name: 'There and Back Again', desc: 'Recover a vessel that has orbited Gaia.', funds: 32000, sci: 12 },
    { id: 'crewedOrbit', name: 'A Human Touch', desc: 'Put a crewed capsule into a stable Gaia orbit (and keep the crew alive).', funds: 90000, sci: 24 },
    { id: 'firstEva', name: 'Step Outside', desc: 'Perform an EVA in space or on another world.', funds: 55000, sci: 18 },
    { id: 'beltSurvey', name: 'Hot Zone Survey', desc: 'Run a radiation survey inside Gaia\u2019s radiation belt.', funds: 60000, sci: 22 },
    { id: 'firstDock', name: 'Orbital Handshake', desc: 'Dock two vessels together in space.', funds: 85000, sci: 26 },
    { id: 'relayUp', name: 'Voice of the Sky', desc: 'Put a relay-dish satellite into orbit and route a signal through it.', funds: 70000, sci: 20 },
    { id: 'scopeDeploy', name: 'Eyes of Glass', desc: 'Make a telescope observation of another world from space.', funds: 48000, sci: 20 },
    { id: 'seleneFly', name: 'Gray New World', desc: 'Fly by Selene — enter its sphere of influence.', funds: 40000, sci: 14 },
    { id: 'seleneOrbit', name: 'Selene Orbiter', desc: 'Enter a closed orbit around Selene.', funds: 48000, sci: 16 },
    { id: 'seleneLand', name: 'One Small Hop', desc: 'Land a vessel intact on Selene.', funds: 90000, sci: 30 },
    { id: 'seleneReturn', name: 'Souvenir Run', desc: 'Recover a vessel on Gaia that visited Selene\u2019s surface.', funds: 70000, sci: 24 },
    { id: 'frostLand', name: 'Mint Condition', desc: 'Land a vessel intact on Frost.', funds: 100000, sci: 32 },
    { id: 'escape', name: 'Slip the Leash', desc: 'Escape Gaia\u2019s sphere of influence entirely.', funds: 60000, sci: 20 },
    { id: 'interplanetary', name: 'Interplanetary Species', desc: 'Enter the sphere of influence of another planet.', funds: 140000, sci: 45 },
    { id: 'rustLand', name: 'Red Dust Boots', desc: 'Land a vessel intact on Rust.', funds: 220000, sci: 70 },
    { id: 'goliathSoi', name: 'Eye of the Giant', desc: 'Reach the Goliath system.', funds: 300000, sci: 90 },
  ];
  function contractState(id) { return GAME.save.contracts[id] || 'open'; }

  /* ============ offered contracts (procedural missions) ============ */
  const BIOME_TARGETS = ['Grasslands', 'Forest', 'Deserts', 'Highlands', 'Mountains', 'Tundra', 'Savanna', 'Wetlands', 'Dune Sea', 'Jungle'];
  const TESTABLE = ['stub', 'bison', 'pixie', 'wren', 'chuteNose', 'finCtrl', 'heat1', 'drogue', 'kestrel', 'anvil', 'rad_300'];
  function genOffer(rng) {
    const orbitDone = contractState('orbit') === 'done';
    const crewTech = hasTech('commandModules');
    const tier = orbitDone ? (rng() < 0.5 ? 2 : 1) : 1;
    const types = ['alt', 'speed', 'test', 'sci', 'land'];
    if (orbitDone) types.push('sat', 'sat', 'sci');
    if (crewTech && orbitDone) types.push('crewAlt');
    const type = types[(rng() * types.length) | 0];
    const F = (x) => Math.round(x * (0.85 + rng() * 0.3));
    const id = 'oc' + Math.floor(rng() * 1e9).toString(36) + Date.now().toString(36).slice(-4);
    switch (type) {
      case 'alt': {
        const km = orbitDone ? 150 + ((rng() * 12) | 0) * 50 : 12 + ((rng() * 8) | 0) * 6;
        return { id, type, name: `Altitude record: ${km} km`, desc: `Push a vessel above ${km} km. The press release writes itself.`, alt: km * 1000, funds: F(6000 + km * 90), sci: F(3 + km / 18), stars: km > 100 ? 2 : 1 };
      }
      case 'speed': {
        const ms = 350 + ((rng() * 8) | 0) * 100;
        return { id, type, name: `Speed run: ${ms} m/s`, desc: `Hit ${ms} m/s inside the atmosphere without shedding parts (parts optional).`, speed: ms, funds: F(7000 + ms * 9), sci: F(4), stars: ms > 800 ? 2 : 1 };
      }
      case 'test': {
        const pid = TESTABLE[(rng() * TESTABLE.length) | 0];
        const def = PARTS.CATALOG[pid];
        const lo = 4 + ((rng() * 6) | 0) * 3;
        const hi = lo + 6;
        return { id, type, name: `Field test: ${def.name}`, desc: `Fly a ${def.name} between ${lo} and ${hi} km and hold it there for a moment. Engineering wants data, not excuses.`, part: pid, a0: lo * 1000, a1: hi * 1000, funds: F(9000 + def.cost * 2.2), sci: F(5), stars: 1 };
      }
      case 'sci': {
        const exps = ['thermo', 'baro', 'photo', 'geiger', 'bio'];
        const eId = exps[(rng() * exps.length) | 0];
        const situ = orbitDone && rng() < 0.5 ? 'spaceLow' : 'flyingHigh';
        return { id, type, name: `Research: ${EXPS[eId].name}`, desc: `Collect or transmit ${EXPS[eId].name} data while ${SITU_NAME[situ]} Gaia.`, exp: eId, situ, funds: F(8000 + (situ === 'spaceLow' ? 9000 : 2000)), sci: F(8), stars: situ === 'spaceLow' ? 2 : 1 };
      }
      case 'land': {
        const biome = BIOME_TARGETS[(rng() * BIOME_TARGETS.length) | 0];
        return { id, type, name: `Touchdown: ${biome}`, desc: `Land a vessel intact in the ${biome} of Gaia. Style points optional but encouraged.`, biome, funds: F(16000), sci: F(10), stars: 2 };
      }
      case 'sat': {
        const km = 90 + ((rng() * 14) | 0) * 35;
        const polar = rng() < 0.3;
        return { id, type, name: `${polar ? 'Polar satellite' : 'Satellite'}: ${km} km orbit`, desc: `Place a powered, antenna-equipped probe in a stable ${km} km (±20%) orbit${polar ? ' with inclination above 75°' : ''}.`, alt: km * 1000, polar, funds: F(26000 + km * 60), sci: F(14), stars: polar ? 3 : 2 };
      }
      case 'crewAlt': {
        const km = 80 + ((rng() * 6) | 0) * 40;
        return { id, type, name: `Crewed flight: ${km} km`, desc: `Fly a crewed capsule above ${km} km and bring everyone home alive. Emphasis on alive.`, alt: km * 1000, crewed: true, funds: F(34000 + km * 110), sci: F(16), stars: 3 };
      }
    }
  }
  function refreshOffers(force) {
    const s = GAME.save;
    if (!s.offers) s.offers = [];
    if (!s.activeContracts) s.activeContracts = [];
    const rng = U.mulberry32((Date.now() % 1e9) | 0);
    while (s.offers.length < 3) s.offers.push(genOffer(rng));
    if (force) { s.offers = []; while (s.offers.length < 3) s.offers.push(genOffer(rng)); }
  }
  function acceptOffer(id) {
    const s = GAME.save;
    const i = s.offers.findIndex(o => o.id === id);
    if (i < 0 || s.activeContracts.length >= 3) return false;
    s.activeContracts.push(s.offers.splice(i, 1)[0]);
    refreshOffers();
    GAME.saveNow();
    return true;
  }
  function declineOffer(id) {
    const s = GAME.save;
    s.offers = s.offers.filter(o => o.id !== id);
    refreshOffers();
    GAME.saveNow();
  }
  function abandonContract(id) {
    GAME.save.activeContracts = GAME.save.activeContracts.filter(o => o.id !== id);
    GAME.saveNow();
  }
  function completeOffer(c) {
    GAME.save.activeContracts = GAME.save.activeContracts.filter(o => o.id !== c.id);
    GAME.earn(c.funds);
    GAME.earnSci(c.sci);
    AUDIO.jingle(true);
    UI.toast('CONTRACT COMPLETE: ' + c.name, `+${U.fmtFunds(c.funds)}  +${c.sci} Science`, 'sci', 6500);
    GAME.saveNow();
  }
  /* called ~1 Hz from flight with the live vessel */
  function checkContracts(fl) {
    const list = GAME.save.activeContracts || [];
    if (!list.length || !fl.launched) return;
    for (const c of [...list]) {
      switch (c.type) {
        case 'alt':
          if (c.crewed) break;
          if ((fl.alt || 0) > c.alt && fl.body.id === 'gaia') completeOffer(c);
          break;
        case 'speed':
          if ((fl.srfSpeed || 0) > c.speed && (fl.pres || 0) > 0.05 && fl.body.id === 'gaia') completeOffer(c);
          break;
        case 'test': {
          const hasPart = [...fl.vessel.parts.values()].some(p => p.id === c.part);
          if (hasPart && fl.alt > c.a0 && fl.alt < c.a1 && fl.body.id === 'gaia') completeOffer(c);
          break;
        }
        case 'land':
          if (fl.landed && fl.met > 5 && fl.body.id === 'gaia' && fl.biomeName() === c.biome) completeOffer(c);
          break;
        case 'sat': {
          const elems = fl.currentElements();
          if (!elems || elems.e >= 1 || fl.body.id !== 'gaia') break;
          const ap = elems.rAp - fl.body.R, pe = elems.rPe - fl.body.R;
          const okAlt = ap > c.alt * 0.8 && ap < c.alt * 1.2 && pe > Math.max(c.alt * 0.8, 73000);
          const okIncl = !c.polar || elems.i / U.DEG > 75;
          const parts = [...fl.vessel.parts.values()];
          const okCraft = parts.some(p => p.def.probe) && parts.some(p => p.def.antenna) && parts.some(p => p.def.solar);
          if (okAlt && okIncl && okCraft && fl.charge > 0.5) completeOffer(c);
          break;
        }
        case 'crewAlt':
          if ((fl.alt || 0) > c.alt && (fl.crew || []).length > 0) { c.armed = true; }
          break;
      }
    }
  }
  /* recovery hook: crewed-altitude contracts complete when everyone comes home */
  function onRecovered(fl) {
    for (const c of [...(GAME.save.activeContracts || [])]) {
      if (c.type === 'crewAlt' && c.armed && (fl.crew || []).length > 0) completeOffer(c);
    }
  }
  function recoverDebris(did) {
    const d = (GAME.save.debris || []).find(x => x.did === did);
    if (!d || !d.craft) return false;
    if (d.bodyId !== 'gaia') {
      UI.toast('Cannot recover', 'Debris must be on Gaia to recover at Nova Space Center.', 'warn');
      return false;
    }
    let refund = 0;
    try {
      const v = Vessel.deserialize(d.craft);
      refund = Math.round(v.cost() * 0.5);
    } catch (e) { refund = 0; }
    GAME.earn(refund);
    GAME.save.debris = (GAME.save.debris || []).filter(x => x.did !== did);
    GAME.saveNow();
    AUDIO.jingle(true);
    UI.toast('Debris recovered', `+${U.fmtFunds(refund)}`, '', 5000);
    return true;
  }
  function deleteDebris(did) {
    const n = (GAME.save.debris || []).length;
    GAME.save.debris = (GAME.save.debris || []).filter(x => x.did !== did);
    if (GAME.save.debris.length < n) { GAME.saveNow(); return true; }
    return false;
  }
  /* science hook */
  function onScienceCollected(result) {
    for (const c of [...(GAME.save.activeContracts || [])]) {
      if (c.type === 'sci' && result.expId === c.exp && result.situ === c.situ && result.body.id === 'gaia') completeOffer(c);
    }
  }
  function completeContract(c) {
    if (contractState(c.id) === 'done') return;
    GAME.save.contracts[c.id] = 'done';
    GAME.earn(c.funds);
    GAME.earnSci(c.sci);
    AUDIO.jingle(true);
    UI.toast('MILESTONE: ' + c.name, `+${U.fmtFunds(c.funds)}  +${c.sci} Science`, '', 6000);
    if (window.NET && NET.active) NET.onContract(c);
    GAME.saveNow();
  }
  /* events fired by flight */
  function event(type, data = {}) {
    const done = id => { const c = CONTRACTS.find(c => c.id === id); if (c) completeContract(c); };
    switch (type) {
      case 'launch': done('first'); break;
      case 'altitude': if (data.alt >= 10000 && data.body === 'gaia') done('alt10'); if (data.alt >= 72000 && data.body === 'gaia') done('space'); break;
      case 'orbit':
        if (data.body === 'gaia') done('orbit');
        if (data.body === 'gaia' && data.crewed) done('crewedOrbit');
        if (data.body === 'selene') done('seleneOrbit');
        break;
      case 'eva': done('firstEva'); break;
      case 'beltScan': done('beltSurvey'); break;
      case 'scopeObs': done('scopeDeploy'); break;
      case 'docked': done('firstDock'); break;
      case 'relayed': done('relayUp'); break;
      case 'soi':
        if (data.body === 'selene') done('seleneFly');
        if (data.body === 'solara') done('escape');
        if (['vesper', 'rust', 'grit', 'goliath', 'wanderer', 'cinder'].includes(data.body)) done('interplanetary');
        if (data.body === 'goliath' || ['aqua', 'tundra', 'crag', 'pebble', 'plume'].includes(data.body)) done('goliathSoi');
        break;
      case 'landed':
        if (data.body === 'selene') done('seleneLand');
        if (data.body === 'frost') done('frostLand');
        if (data.body === 'rust') done('rustLand');
        break;
      case 'recovered':
        if (data.flags && data.flags.orbitedGaia) done('return');
        if (data.flags && data.flags.landedSelene) done('seleneReturn');
        break;
    }
  }

  /* ============ stock crafts ============ */
  function stack(v, parent, defId) {
    const pNodes = parent.def.nodes;
    const pIdx = pNodes.findIndex(n => n.dir === 'down');
    const cNodes = PARTS.CATALOG[defId].nodes;
    const mIdx = cNodes.findIndex(n => n.dir === 'up');
    return v.addPart(defId, { type: 'node', parent: parent.uid, pIdx, mIdx });
  }
  function surf(v, parent, defId, angle, y, symId) {
    return v.addPart(defId, { type: 'surface', parent: parent.uid, angle, y, symId });
  }
  function installStockCrafts() {
    const mk = (name, fn) => {
      const v = new Vessel(name);
      fn(v);
      v.autoStage();
      GAME.save.crafts[name] = v.serialize();
    };
    mk('Dart 1', v => {
      /* the classic first sounding rocket: avionics + film camera + a Cricket */
      const core = v.addPart('avionics', { type: 'root' });
      v.addPart('nose0', { type: 'node', parent: core.uid, pIdx: core.def.nodes.findIndex(n => n.dir === 'up'), mIdx: 0 });
      const dec = stack(v, core, 'dec0');
      const srb = stack(v, dec, 'cricket');
      for (let i = 0; i < 3; i++) surf(v, srb, 'finStatic', i * Math.PI * 2 / 3, -0.28, 1);
      surf(v, core, 'thermo', Math.PI * 0.5, 0, 0);
      surf(v, core, 'filmCam', Math.PI * 1.5, 0, 0);
    });
    mk('Hopper 1', v => {
      const core = v.addPart('sprite', { type: 'root' });
      v.addPart('chuteNose', { type: 'node', parent: core.uid, pIdx: core.def.nodes.findIndex(n => n.dir === 'up'), mIdx: 0 });
      const dec = stack(v, core, 'dec1');
      const srb = stack(v, dec, 'stub');
      for (let i = 0; i < 3; i++) surf(v, srb, 'finStatic', i * Math.PI * 2 / 3, -0.55, 1);
      surf(v, core, 'thermo', Math.PI, -0.02, 0);
      surf(v, core, 'filmCam', Math.PI * 0.4, -0.02, 0);
    });
    mk('Aurora 1', v => {
      const core = v.addPart('sprite', { type: 'root' });
      v.addPart('chuteNose', { type: 'node', parent: core.uid, pIdx: core.def.nodes.findIndex(n => n.dir === 'up'), mIdx: 0 });
      const rw = stack(v, core, 'rwheel_s');
      const d1 = stack(v, rw, 'dec1');
      const t1 = stack(v, d1, 's1_2200');
      const t1b = stack(v, t1, 's1_2200');
      const e1 = stack(v, t1b, 'albatross');
      const d2 = stack(v, e1, 'dec1');
      const srb = stack(v, d2, 'bison');
      for (let i = 0; i < 4; i++) surf(v, srb, 'finStatic', i * Math.PI / 2, -1.7, 1);
      surf(v, core, 'thermo', Math.PI, -0.02, 0);
      surf(v, t1, 'bioPod', 0.6, 0.7, 0);
      surf(v, t1, 'solarFix', Math.PI * 0.9, 0, 2);
      surf(v, t1, 'solarFix', Math.PI * 1.9, 0, 2);
      surf(v, t1, 'navcam', 0.1, 0.9, 0);
      surf(v, t1, 'antenna', 2.8, 0.9, 0);
    });
    mk('Pathfinder', v => {
      const core = v.addPart('sprite', { type: 'root' });
      v.addPart('chuteNose', { type: 'node', parent: core.uid, pIdx: core.def.nodes.findIndex(n => n.dir === 'up'), mIdx: 0 });
      const rw = stack(v, core, 'rwheel_s');
      const hs = stack(v, rw, 'heat1');
      const d1 = stack(v, hs, 'dec1');
      const t1 = stack(v, d1, 's1_1100');
      const e1 = stack(v, t1, 'kestrel');
      surf(v, t1, 'antenna', 0.4, 0, 0);
      surf(v, t1, 'solarFix', Math.PI * 0.8, 0, 2);
      surf(v, t1, 'solarFix', Math.PI * 1.8, 0, 2);
      surf(v, t1, 'geiger', 2.6, 0.3, 0);
      const d2 = stack(v, e1, 'dec1');
      const t2 = stack(v, d2, 's1_2200');
      const e2 = stack(v, t2, 'kestrel');
      const d3 = stack(v, e2, 'dec1');
      const t3 = stack(v, d3, 's1_2200');
      const t3b = stack(v, t3, 's1_2200');
      const e3 = stack(v, t3b, 'albatross');
      const d4 = stack(v, e3, 'dec1');
      const srb = stack(v, d4, 'anvil');
      for (let i = 0; i < 4; i++) surf(v, srb, 'finBig', i * Math.PI / 2 + 0.4, -2.2, 1);
      surf(v, t2, 'bioPod', 1.2, 0.8, 0);
    });
    mk('Meridian 1', v => {
      /* first crewed orbiter: capsule, supplies, shielding, full return stack */
      const pod = v.addPart('comet', { type: 'root' });
      v.addPart('chuteNose', { type: 'node', parent: pod.uid, pIdx: pod.def.nodes.findIndex(n => n.dir === 'up'), mIdx: 0 });
      const sup = stack(v, pod, 'supplyM');
      const hs = stack(v, sup, 'heat1');
      const d1 = stack(v, hs, 'dec1');
      const t1 = stack(v, d1, 's1_2200');
      const t1b = stack(v, t1, 's1_2200');
      const e1 = stack(v, t1b, 'albatross');
      const d2 = stack(v, e1, 'dec1');
      const t2 = stack(v, d2, 's1_2200');
      const t2b = stack(v, t2, 's1_1100');
      const e2 = stack(v, t2b, 'wren');
      for (let i = 0; i < 4; i++) surf(v, e2, 'finCtrl', i * Math.PI / 2, 0.1, 1);
      surf(v, pod, 'thermo', Math.PI, -0.1, 0);
      surf(v, t1, 'navcam', 0.4, 0.8, 0);
    });
    mk('Skylark Trainer', v => {
      const cab = v.addPart('aerocab', { type: 'root' });
      const tank = stack(v, cab, 's1_1100');
      const eng = stack(v, tank, 'jet');
      surf(v, tank, 'wingMain', Math.PI * 0.5, -0.1, 1);
      surf(v, tank, 'wingMain', Math.PI * 1.5, -0.1, 1);
      surf(v, eng, 'elevon', Math.PI * 0.5, -0.4, 2);
      surf(v, eng, 'elevon', Math.PI * 1.5, -0.4, 2);
      surf(v, cab, 'wheel', 0, -0.35, 0);
      surf(v, eng, 'wheel', Math.PI * 0.65, -0.3, 3);
      surf(v, eng, 'wheel', Math.PI * 1.35, -0.3, 3);
    });
    GAME.save.stockAdded = true;
  }
  function migrate() {
    const s = GAME.save;
    if (!s.sciLog) s.sciLog = {};
    if (!s.contracts) s.contracts = {};
    if (!s.crafts) s.crafts = {};
    if (!s.flights) s.flights = [];
    if (!s.debris) s.debris = [];
    if (!s.launchCount) s.launchCount = {};
    if (!s.cfg) s.cfg = GAME.defaultCfg ? GAME.defaultCfg('normal') : {};
    if (!s.site) s.site = { lat: -0.0018, lon: 0 };
    CEL.setSite(s.site.lat, s.site.lon);
    refreshOffers();
    if (!s.stockAdded) installStockCrafts();
  }

  /* decode a science-log key into human-readable text */
  function describeKey(key) {
    const [exp, bodyId, situ, biome] = key.split('|');
    const e = EXPS[exp];
    const b = CEL.B[bodyId];
    if (exp === 'scope') return `Telescope Observation — ${b ? b.name : bodyId}`;
    let s = `${e ? e.name : exp} — ${b ? b.name : bodyId}`;
    if (situ) s += `, ${SITU_NAME[situ] || situ}`.replace(' ' + (b ? b.name : ''), '');
    if (biome !== undefined && b && b.biomes && b.biomes[+biome]) s += ` (${b.biomes[+biome]})`;
    return s;
  }

  /* ============ R&D screen ============ */
  const rnd = {
    enter() {
      UI.topbar(true);
      const root = el('div', '', document.getElementById('hud-root'));
      root.id = 'rnd-wrap';
      root.innerHTML = `<div style="position:absolute;top:54px;left:14px;display:flex;gap:10px;align-items:center;z-index:5">
        <button class="btn" id="rnd-back">◄ COMPLEX</button>
        <span style="font-size:20px;font-weight:700;letter-spacing:.2em;color:var(--acc)">RESEARCH & DEVELOPMENT</span>
        <button class="btn" id="rnd-archive">⚛ SCIENCE ARCHIVE</button></div>
        <div id="rnd-canvas-wrap"><div id="rnd-tree"><svg id="rnd-svg" width="2400" height="1080"></svg></div></div>`;
      root.querySelector('#rnd-back').onclick = () => { AUDIO.click(); GAME.go('sc'); };
      root.querySelector('#rnd-archive').onclick = () => {
        AUDIO.click();
        const keys = Object.keys(GAME.save.sciLog);
        const body = document.createElement('div');
        body.innerHTML = keys.length
          ? `<div style="max-height:50vh;overflow-y:auto">${keys.map(k => `<div class="archive-row"><span>◈</span> ${describeKey(k)} <i style="color:var(--dim)">×${GAME.save.sciLog[k]}</i></div>`).join('')}</div>`
          : '<div style="color:var(--dim)">No data collected yet. Go measure something!</div>';
        UI.dialog({ title: 'SCIENCE ARCHIVE — ' + keys.length + ' ENTRIES', body, buttons: [{ label: 'CLOSE', cls: 'acc' }], wide: true });
      };
      this.renderTree();
    },
    renderTree() {
      const tree = document.getElementById('rnd-tree');
      tree.querySelectorAll('.tech-node').forEach(n => n.remove());
      const svg = document.getElementById('rnd-svg');
      svg.innerHTML = '';
      const px = t => 60 + t.x * 240, py = t => 40 + t.y * 158;
      for (const id in TECH) {
        const t = TECH[id];
        for (const pid of t.parents) {
          const p = TECH[pid];
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const x1 = px(p) + 150, y1 = py(p) + 40, x2 = px(t), y2 = py(t) + 40;
          line.setAttribute('d', `M${x1},${y1} C${x1 + 50},${y1} ${x2 - 50},${y2} ${x2},${y2}`);
          line.setAttribute('stroke', hasTech(id) ? 'rgba(168,227,77,.6)' : hasTech(pid) ? 'rgba(110,140,160,.5)' : 'rgba(70,90,105,.3)');
          line.setAttribute('stroke-width', '2.5');
          line.setAttribute('fill', 'none');
          svg.appendChild(line);
        }
      }
      for (const id in TECH) {
        const t = TECH[id];
        const unlocked = hasTech(id);
        const avail = !unlocked && t.parents.every(p => hasTech(p));
        const node = el('div', 'tech-node ' + (unlocked ? 'unlocked' : avail ? 'avail' : 'locked'), tree);
        node.style.left = px(t) + 'px';
        node.style.top = py(t) + 'px';
        const parts = techParts(id);
        node.innerHTML = `<div class="tn-name">${t.name}</div>
          <div class="tn-cost">${unlocked ? 'RESEARCHED' : '⚛ ' + t.cost + ' Science'}</div>
          <div class="tn-parts">${parts.slice(0, 8).map(p => `<img src="${PARTS.thumbnail(p.id, 64)}" title="${p.name}">`).join('')}</div>`;
        node.onclick = () => this.openNode(id);
      }
    },
    openNode(id) {
      AUDIO.click();
      const t = TECH[id];
      const unlocked = hasTech(id);
      const avail = !unlocked && t.parents.every(p => hasTech(p));
      const parts = techParts(id);
      const body = document.createElement('div');
      body.innerHTML = `<div style="color:var(--dim);margin-bottom:10px">${unlocked ? 'Already researched.' : avail ? 'Available for research.' : 'Requires: ' + t.parents.map(p => TECH[p].name).join(', ')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${parts.map(p => `
          <div style="display:flex;gap:8px;align-items:center;background:#101a22;border:1px solid #22303c;border-radius:5px;padding:6px">
            <img src="${PARTS.thumbnail(p.id, 64)}" style="width:48px;height:48px">
            <div><div style="font-size:13px;font-weight:600">${p.name}</div>
            <div style="font-size:11.5px;color:var(--dim)">${U.fmtFunds(p.cost)}</div></div>
          </div>`).join('') || '<i style="color:var(--dim)">No parts — pure knowledge.</i>'}</div>`;
      const buttons = [{ label: 'CLOSE' }];
      if (avail) {
        const can = GAME.save.mode === 'sandbox' || GAME.save.sci >= t.cost;
        buttons.push({
          label: `RESEARCH (⚛ ${t.cost})`, cls: can ? 'acc' : '', cb: () => {
            if (!can) { UI.toast('Not enough Science', `Need ⚛ ${t.cost}, have ${Math.floor(GAME.save.sci)}`, 'warn'); return; }
            if (GAME.save.mode !== 'sandbox') GAME.save.sci -= t.cost;
            GAME.save.tech.push(id);
            AUDIO.jingle(true);
            UI.toast('Research complete', t.name, 'sci');
            if (window.NET && NET.active) NET.onTech(id);
            GAME.saveNow();
            this.renderTree();
          },
        });
      }
      UI.dialog({ title: t.name.toUpperCase(), body, buttons, wide: true });
    },
    update() {
      GAME.renderer.clear ? null : null;
    },
    exit() { },
  };

  /* ============ Mission Control screen: offers / active / milestones ============ */
  const TYPE_ICONS = { alt: '▲', speed: '≫', test: '⚙', sci: '⚗', land: '⊕', sat: '◉', crewAlt: '⬡' };
  const mc = {
    enter() {
      UI.topbar(true);
      refreshOffers();
      const root = el('div', '', document.getElementById('hud-root'));
      root.id = 'rnd-wrap';
      root.innerHTML = `<div style="position:absolute;top:54px;left:14px;display:flex;gap:10px;align-items:center;z-index:5;pointer-events:all">
        <button class="btn" id="mc-back">◄ COMPLEX</button>
        <span style="font-size:20px;font-weight:700;letter-spacing:.2em;color:var(--acc)">MISSION CONTROL</span>
        <div id="mc-tabs">
          <div class="mc-tab on" data-t="avail">AVAILABLE</div>
          <div class="mc-tab" data-t="active">ACTIVE</div>
          <div class="mc-tab" data-t="mile">MILESTONES</div>
        </div></div>
        <div class="fullpanel" style="overflow-y:auto;padding-top:46px" id="mc-list"></div>`;
      root.querySelector('#mc-back').onclick = () => { AUDIO.click(); GAME.go('sc'); };
      root.querySelectorAll('.mc-tab').forEach(t => t.onclick = () => {
        AUDIO.click();
        root.querySelectorAll('.mc-tab').forEach(x => x.classList.remove('on'));
        t.classList.add('on');
        this.renderTab(t.dataset.t);
      });
      this.renderTab('avail');
    },
    stars(n) { return '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(Math.max(0, 3 - n)) + '</span>'; },
    card(list, c, kind) {
      const div = el('div', 'contract offer', list);
      div.innerHTML = `<div class="c-head"><span><i class="c-ico">${TYPE_ICONS[c.type] || '◆'}</i> ${c.name}</span>
        <span class="c-stars">${this.stars(c.stars || 1)}</span></div>
        <div class="c-desc">${c.desc}</div>
        <div class="c-rew"><span style="color:var(--gold)">⛁ ${U.fmtFunds(c.funds)}</span><span style="color:var(--acc2)">⚛ ${c.sci} Science</span>
        <span style="flex:1"></span><span class="c-actions"></span></div>`;
      const actions = div.querySelector('.c-actions');
      if (kind === 'avail') {
        const acc = el('button', 'btn tiny acc', actions, 'ACCEPT');
        acc.onclick = () => {
          AUDIO.click();
          if (GAME.save.activeContracts.length >= 3) { UI.toast('Contract limit', 'Finish or abandon an active contract first (max 3).', 'warn'); return; }
          acceptOffer(c.id);
          this.renderTab('avail');
        };
        const dec = el('button', 'btn tiny', actions, 'DECLINE');
        dec.onclick = () => { AUDIO.click(); declineOffer(c.id); this.renderTab('avail'); };
      } else {
        const ab = el('button', 'btn tiny danger', actions, 'ABANDON');
        ab.onclick = () => UI.confirm('ABANDON CONTRACT', 'Give up “' + c.name + '”? No penalty, just shame.', () => { abandonContract(c.id); this.renderTab('active'); });
      }
    },
    renderTab(tab) {
      const list = document.getElementById('mc-list');
      if (!list) return;
      list.innerHTML = '';
      if (tab === 'avail') {
        el('div', 'mc-note', list, 'New offers rotate in as you decline or complete them. Up to 3 contracts active at once.');
        for (const c of GAME.save.offers || []) this.card(list, c, 'avail');
      } else if (tab === 'active') {
        if (!(GAME.save.activeContracts || []).length) el('div', 'mc-note', list, 'No active contracts. Accept some from the AVAILABLE tab — they complete automatically in flight.');
        for (const c of GAME.save.activeContracts || []) this.card(list, c, 'active');
      } else {
        for (const c of CONTRACTS) {
          const done = contractState(c.id) === 'done';
          const div = el('div', 'contract' + (done ? ' done' : ''), list);
          div.innerHTML = `<div class="c-head"><span>${done ? '✓ ' : '◆ '}${c.name}</span>
            <span style="color:${done ? 'var(--acc)' : 'var(--dim)'};font-size:13px">${done ? 'COMPLETE' : 'IN PROGRESS'}</span></div>
            <div class="c-desc">${c.desc}</div>
            <div class="c-rew"><span style="color:var(--gold)">⛁ ${U.fmtFunds(c.funds)}</span><span style="color:var(--acc2)">⚛ ${c.sci} Science</span></div>`;
        }
      }
    },
    update() { },
    exit() { },
  };

  /* ============ Tracking Station: full 3D system map + fleet roster ============ */
  const TRACK_WARPS = [1, 5, 25, 100, 1000, 10000, 100000];
  const track = {
    enter() {
      UI.topbar(true);
      this.warpI = 0;
      const root = el('div', '', document.getElementById('hud-root'));
      root.id = 'track-wrap';
      root.innerHTML = `<div style="position:absolute;top:54px;left:14px;display:flex;gap:10px;align-items:center;z-index:5;pointer-events:all">
        <button class="btn" id="tr-back">◄ COMPLEX</button>
        <button class="btn" id="tr-nsc" title="Focus Nova Space Center on Gaia">◉ NSC</button>
        <span style="font-size:18px;font-weight:700;letter-spacing:.2em;color:var(--acc)">TRACKING STATION</span></div>
        <div id="tr-modes" style="position:absolute;top:58px;left:50%;transform:translateX(-50%);pointer-events:all">${MAPVIEW.modeBarHtml()}</div>
        <div id="tr-warp" style="position:absolute;top:54px;right:14px;display:flex;gap:4px;align-items:center;pointer-events:all;z-index:5">
          <span style="font-size:12px;color:var(--dim);letter-spacing:.1em;margin-right:4px">TIME</span>
          <div class="warp" id="tr-warp-row"></div><span class="mono" id="tr-warp-lbl" style="font-size:13px;color:var(--acc)">1×</span></div>
        <div id="tr-side" class="panel tr-panel">
          <div class="tr-tabs" style="display:flex;gap:6px;margin-bottom:10px">
            <button class="btn tiny acc" id="tr-tab-fleet">FLEET</button>
            <button class="btn tiny" id="tr-tab-debris">DEBRIS</button>
          </div>
          <div class="ptitle" id="tr-list-title">ACTIVE FLEET</div>
          <div id="tr-list"></div></div>
        <div id="tr-hint">drag: rotate · scroll: zoom · click arrows to warp time · click a world to focus</div>
        <div id="tr-overlay" aria-hidden="true"></div>`;
      root.querySelector('#tr-back').onclick = () => { AUDIO.click(); GAME.go('sc'); };
      root.querySelector('#tr-nsc').onclick = () => {
        AUDIO.click();
        MAPVIEW.focus = 'gaia';
        MAPVIEW.camDist = CEL.GAIA.R * 2.4;
        const bf = CEL.sitePadBf(CEL.KSC.lat, CEL.KSC.lon);
        const pad = CEL.bfToInertial(CEL.GAIA, bf, GAME.ut, new THREE.Vector3()).normalize();
        MAPVIEW.camYaw = Math.atan2(pad.x, pad.z);
        MAPVIEW.camPitch = U.clamp(Math.asin(pad.y) * 0.55 + 0.18, 0.12, 1.1);
      };
      const wr = root.querySelector('#tr-warp-row');
      for (let i = 0; i < TRACK_WARPS.length; i++) {
        const arrow = el('i', '', wr);
        arrow.title = TRACK_WARPS[i] + '×';
        arrow.onclick = () => { AUDIO.click(); this.warpI = i; this.refreshWarpHud(); };
      }
      this.refreshWarpHud();
      MAPVIEW.openStandalone();
      const modes = root.querySelector('#tr-modes');
      modes.querySelectorAll('.map-mode').forEach(b => {
        b.onclick = () => {
          MAPVIEW.setMode(b.dataset.m);
          if (b.dataset.m === 'debris') this.listMode = 'debris';
          else if (b.dataset.m === 'orbit') this.listMode = 'fleet';
          this.refreshList();
        };
      });
      MAPVIEW.setMode(MAPVIEW.mode || 'orbit');
      this.listMode = 'fleet';
      root.querySelector('#tr-tab-fleet').onclick = () => { AUDIO.click(); this.listMode = 'fleet'; MAPVIEW.setMode('orbit'); this.refreshList(); };
      root.querySelector('#tr-tab-debris').onclick = () => { AUDIO.click(); this.listMode = 'debris'; MAPVIEW.setMode('debris'); this.refreshList(); };
      this.refreshList();
    },
    refreshWarpHud() {
      const wr = document.getElementById('tr-warp-row');
      const lbl = document.getElementById('tr-warp-lbl');
      if (!wr) return;
      const arrows = wr.querySelectorAll('i');
      arrows.forEach((a, i) => a.classList.toggle('on', i <= this.warpI));
      if (lbl) lbl.textContent = TRACK_WARPS[this.warpI] + '×';
    },
    refreshList() {
      const list = document.getElementById('tr-list');
      const title = document.getElementById('tr-list-title');
      if (!list) return;
      list.innerHTML = '';
      const fleetTab = document.getElementById('tr-tab-fleet');
      const debrisTab = document.getElementById('tr-tab-debris');
      if (fleetTab) fleetTab.classList.toggle('acc', this.listMode !== 'debris');
      if (debrisTab) debrisTab.classList.toggle('acc', this.listMode === 'debris');
      if (this.listMode === 'debris') {
        if (title) title.textContent = 'DEBRIS FIELD';
        const items = GAME.save.debris || [];
        if (!items.length) {
          el('div', '', list, '<div style="color:var(--dim);padding:12px;font-size:13px">No debris tracked.<br>Stage separation debris will appear here after landing.</div>');
          return;
        }
        for (const d of [...items]) {
          const row = el('div', 'track-row', list);
          const body = CEL.B[d.bodyId];
          const where = (d.splashed ? 'Splashed' : 'Landed') + ' · ' + (body ? body.name : d.bodyId);
          row.innerHTML = `<div><div class="tr-name">${d.name}</div><div class="tr-sub">${where} — ${d.partCount || 0} parts</div></div>`;
          const btns = el('div', '', row);
          btns.style.cssText = 'display:flex;gap:6px';
          const focus = el('button', 'btn tiny', btns, '◉');
          focus.title = 'Focus';
          focus.onclick = () => { AUDIO.click(); MAPVIEW.focus = d.bodyId; MAPVIEW.camDist = CEL.B[d.bodyId].R * 6; };
          if (d.bodyId === 'gaia' && d.craft) {
            const rec = el('button', 'btn tiny acc', btns, 'REC');
            rec.title = 'Recover debris at Nova Space Center';
            rec.onclick = () => {
              AUDIO.click();
              if (recoverDebris(d.did)) {
                MAPVIEW.closeStandalone();
                MAPVIEW.openStandalone();
                this.refreshList();
              }
            };
          }
          const del = el('button', 'btn tiny danger', btns, '✕');
          del.title = 'Delete debris';
          del.onclick = () => UI.confirm('DELETE DEBRIS', 'Permanently remove this debris from tracking?', () => {
            if (deleteDebris(d.did)) {
              MAPVIEW.closeStandalone();
              MAPVIEW.openStandalone();
              this.refreshList();
            }
          });
        }
        return;
      }
      if (title) title.textContent = 'ACTIVE FLEET';
      if (!GAME.save.flights.length) {
        el('div', '', list, '<div style="color:var(--dim);padding:12px;font-size:13px">No vessels in flight.<br>The sky is quiet. Too quiet.</div>');
      }
      for (const f of [...GAME.save.flights]) {
        const row = el('div', 'track-row', list);
        const where = f.landed ? `Landed · ${CEL.B[f.bodyId].name}` : `Orbiting · ${CEL.B[f.bodyId].name}`;
        row.innerHTML = `<div><div class="tr-name">${f.name}</div><div class="tr-sub">${where} — ${f.partCount} parts — MET ${U.fmtTime(GAME.ut - f.launchUt)}</div></div>`;
        const btns = el('div', '', row);
        btns.style.cssText = 'display:flex;gap:6px';
        const focus = el('button', 'btn tiny', btns, '◉');
        focus.title = 'Focus';
        focus.onclick = () => { AUDIO.click(); MAPVIEW.focus = f.bodyId; MAPVIEW.camDist = CEL.B[f.bodyId].R * 6; };
        if (f.craft.parts.some(p => PARTS.CATALOG[p.id] && PARTS.CATALOG[p.id].cameraPart)) {
          const feed = el('button', 'btn tiny', btns, 'FEED');
          feed.title = 'Open the onboard camera feed';
          feed.onclick = () => { AUDIO.click(); GAME.go('flight', { resume: f, view: 'cam' }); };
        }
        const fly = el('button', 'btn tiny acc', btns, 'FLY');
        fly.onclick = () => { AUDIO.click(); GAME.go('flight', { resume: f }); };
        const term = el('button', 'btn tiny danger', btns, '✕');
        term.title = 'Terminate';
        term.onclick = () => UI.confirm('TERMINATE ' + f.name, 'Permanently destroy this vessel?', () => {
          GAME.save.flights = GAME.save.flights.filter(x => x.fid !== f.fid);
          GAME.saveNow();
          MAPVIEW.closeStandalone();
          MAPVIEW.openStandalone();
          this.refreshList();
        });
      }
    },
    update(dt) {
      GAME.ut += dt * TRACK_WARPS[this.warpI || 0];
      MAPVIEW.updateStandalone(dt);
    },
    exit() { MAPVIEW.closeStandalone(); },
  };

  GAME.screens.rnd = rnd;
  GAME.screens.mc = mc;
  GAME.screens.track = track;

  return { TECH, EXPS, CONTRACTS, hasTech, partUnlocked, techParts, evalExperiment, collectScience, event, installStockCrafts, migrate, SITU_NAME, describeKey, completeContract, refreshOffers, checkContracts, onRecovered, recoverDebris, deleteDebris };
})();
