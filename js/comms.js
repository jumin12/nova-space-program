/* comms.js — relay network: ground station + relay satellites + line-of-sight + ranges.
   Link rule (KSP-style): two nodes connect if distance < sqrt(rangeA * rangeB) and no body
   blocks the segment. Probes need a route to the ground station for full control + science
   transmission (campaign setting). Global: COMMS */
'use strict';
const COMMS = (() => {
  const GROUND_RANGE = 2e11;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

  /* best antenna/relay capability of a craft (serialized parts or live vessel).
     Probe cores and crewed pods carry a weak built-in command antenna (covers the
     launch range / low orbit) — dedicated antennas extend from there. */
  function commCaps(parts) {
    let ant = 0, relay = 0;
    for (const p of parts) {
      const def = PARTS.CATALOG[p.id || p];
      if (!def) continue;
      if (def.probe || def.pod) ant = Math.max(ant, 6e5);
      if (!def.antenna) continue;
      ant = Math.max(ant, def.antenna.range || 0);
      if (def.antenna.relay) relay = Math.max(relay, def.antenna.range || 0);
    }
    return { ant, relay };
  }

  /* segment p1→p2 blocked by any body? (skip endpoints' own bodies handled by offset) */
  function losBlocked(p1, p2, t) {
    const d = _a.copy(p2).sub(p1);
    const len = d.length();
    if (len < 1) return false;
    d.divideScalar(len);
    for (const b of CEL.list) {
      if (b.star) continue;
      const bp = ORB.bodyAbsPos(b, t, _b);
      const toC = _c.copy(bp).sub(p1);
      const proj = toC.dot(d);
      if (proj < 0 || proj > len) continue;
      const perp2 = toC.lengthSq() - proj * proj;
      const rEff = b.R * 0.985;                       // grazing rays clear the limb
      if (perp2 < rEff * rEff) return true;
    }
    return false;
  }

  /* gather network nodes at time t; activeFl = current flight (optional) */
  function gatherNodes(t, activeFl) {
    const nodes = [];
    /* home ground station at the launch complex */
    const up = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon).add(
      CEL.latLonToBf(CEL.KSC.lat, CEL.KSC.lon).multiplyScalar(40));
    const homePos = CEL.bfToInertial(CEL.GAIA, up, t, new THREE.Vector3()).add(ORB.bodyAbsPos(CEL.GAIA, t, _a));
    nodes.push({ id: 'home', name: 'Mission Control', pos: homePos, ant: GROUND_RANGE, relay: GROUND_RANGE, home: true });
    /* saved flights */
    for (const f of (GAME.save && GAME.save.flights) || []) {
      if (activeFl && f.fid === activeFl.fid) continue;
      const caps = commCaps(f.craft.parts);
      if (!caps.ant) continue;
      const body = CEL.B[f.bodyId];
      const pos = new THREE.Vector3();
      if (f.landed && f.landedPos) {
        CEL.bfToInertial(body, _b.fromArray(f.landedPos), t, pos);
      } else {
        const el = ORB.elementsFromState(body.mu, _b.fromArray(f.r), _c.fromArray(f.v), f.savedUt || t);
        pos.copy(ORB.stateAtTime(el, t).r);
      }
      pos.add(ORB.bodyAbsPos(body, t, _a));
      nodes.push({ id: f.fid, name: f.name, pos, ant: caps.ant, relay: caps.relay, flight: f });
    }
    /* active vessel */
    if (activeFl && activeFl.vessel) {
      const caps = commCaps([...activeFl.vessel.parts.values()].map(p => ({ id: p.id })));
      const pos = ORB.bodyAbsPos(activeFl.body, t, _a).clone().add(activeFl.r);
      nodes.push({ id: 'active', name: activeFl.flightName, pos, ant: caps.ant, relay: caps.relay, active: true });
    }
    return nodes;
  }

  /* BFS from home through relays; returns { byId: Map(id -> {hops, strength}), links: [...] } */
  function evaluate(t, activeFl) {
    const nodes = gatherNodes(t, activeFl);
    const byId = new Map();
    const links = [];
    const home = nodes[0];
    byId.set('home', { hops: 0, strength: 1 });
    /* expand frontier: only home + relay-capable nodes forward the signal */
    const frontier = [home];
    const visited = new Set(['home']);
    while (frontier.length) {
      const cur = frontier.shift();
      const curRange = cur.home ? cur.relay : cur.relay;     // forwarding power
      if (!curRange) continue;
      for (const n of nodes) {
        if (visited.has(n.id)) continue;
        const nRange = Math.max(n.ant, n.relay);
        if (!nRange) continue;
        const maxLink = Math.sqrt(curRange * nRange);
        const dist = cur.pos.distanceTo(n.pos);
        if (dist > maxLink) continue;
        if (losBlocked(cur.pos, n.pos, t)) continue;
        const strength = U.clamp(1 - (dist / maxLink) ** 2, 0.05, 1);
        const curInfo = byId.get(cur.id);
        byId.set(n.id, { hops: curInfo.hops + 1, strength: Math.min(curInfo.strength, strength), via: cur.id });
        links.push({ a: cur, b: n, strength });
        visited.add(n.id);
        if (n.relay) frontier.push(n);
      }
    }
    return { nodes, byId, links };
  }

  /* cached signal check for the active flight (recomputed ~1Hz).
     Sandbox flies free unless the player opts in; campaign defaults to commNet ON. */
  let cache = { t: -1e9, result: null };
  function commNetOn() {
    if (!GAME.save) return false;
    const cfg = GAME.save.cfg || {};
    if (GAME.save.mode === 'sandbox') return cfg.commNet === true;
    return cfg.commNet !== false;
  }
  function signalFor(fl) {
    if (!commNetOn()) return { ok: true, strength: 1, hops: 0 };
    if (Math.abs(GAME.ut - cache.t) > 1 || !cache.result) {
      cache = { t: GAME.ut, result: evaluate(GAME.ut, fl) };
    }
    const info = cache.result.byId.get('active');
    if (!info) return { ok: false, strength: 0, hops: -1 };
    return { ok: true, strength: info.strength, hops: info.hops };
  }
  function invalidate() { cache.t = -1e9; }

  return { evaluate, signalFor, commCaps, losBlocked, invalidate, GROUND_RANGE };
})();
