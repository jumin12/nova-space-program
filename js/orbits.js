/* orbits.js — Keplerian two-body machinery (Y-up world). Global: ORB */
'use strict';
const ORB = (() => {
  const { TAU, clamp, wrapTau } = U;
  const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), t3 = new THREE.Vector3();

  /* ---------- elements from cartesian state (r,v rel. parent, inertial) ---------- */
  function elementsFromState(mu, r, v, epoch) {
    const h = new THREE.Vector3().crossVectors(r, v);
    let hm = h.length();
    if (hm < 1e-7) { h.set(1e-7, 1e-7, 0); hm = h.length(); }     // degenerate radial orbit guard
    const N = h.clone().divideScalar(hm);
    const rm = r.length(), vm = v.length();
    const evec = new THREE.Vector3().crossVectors(v, h).divideScalar(mu).sub(t1.copy(r).divideScalar(rm));
    const e = evec.length();
    const energy = vm * vm / 2 - mu / rm;
    const a = Math.abs(energy) < 1e-12 ? 1e15 : -mu / (2 * energy);
    const p = hm * hm / mu;
    const i = Math.acos(clamp(N.y, -1, 1));
    const node = t2.crossVectors(Y, h);                            // ascending node dir
    let lan, nhat;
    if (node.length() < 1e-8 * hm) { lan = 0; nhat = t2.copy(X); }
    else { nhat = node.normalize(); lan = Math.atan2(-nhat.z, nhat.x); }
    let aop, phat;
    const ehat = e > 1e-9 ? t3.copy(evec).divideScalar(e) : t3.copy(nhat);
    aop = Math.atan2(new THREE.Vector3().crossVectors(nhat, ehat).dot(N), clamp(nhat.dot(ehat), -1, 1));
    if (e <= 1e-9) aop = 0;
    /* true anomaly now */
    const rhat = t1.copy(r).divideScalar(rm);
    let nu = Math.atan2(new THREE.Vector3().crossVectors(ehat, rhat).dot(N), clamp(ehat.dot(rhat), -1, 1));
    const M0 = meanFromTrue(e, nu);
    const n = Math.sqrt(mu / Math.pow(Math.abs(a), 3));
    return finalize({ mu, a, e, i, lan, aop, M0, epoch, n, p });
  }

  /* ---------- elements directly (planet definitions) ---------- */
  function elementsFromOrbit(mu, o) {
    const p = o.a * (1 - o.e * o.e);
    return finalize({ mu, a: o.a, e: o.e, i: o.i, lan: o.lan, aop: o.aop, M0: o.M0, epoch: 0, n: Math.sqrt(mu / Math.pow(Math.abs(o.a), 3)), p });
  }

  function finalize(el) {
    /* basis vectors */
    const nhat = new THREE.Vector3(1, 0, 0).applyAxisAngle(Y, el.lan);
    const N = new THREE.Vector3(0, 1, 0).applyAxisAngle(nhat, el.i);
    const P = nhat.clone().applyAxisAngle(N, el.aop);
    const Q = new THREE.Vector3().crossVectors(N, P);
    el.P = P; el.Q = Q; el.N = N;
    el.period = el.e < 1 ? TAU / el.n : Infinity;
    el.rPe = el.p / (1 + el.e);
    el.rAp = el.e < 1 ? el.p / (1 - el.e) : Infinity;
    return el;
  }

  /* ---------- anomaly conversions ---------- */
  function meanFromTrue(e, nu) {
    if (e < 1) {
      const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
      return E - e * Math.sin(E);
    } else {
      const c = Math.cos(nu);
      let coshH = (e + c) / (1 + e * c);
      coshH = Math.max(coshH, 1.0000001);
      let H = Math.acosh(coshH);
      if (nu < 0) H = -H;
      return e * Math.sinh(H) - H;
    }
  }
  function trueFromMean(e, M) {
    if (e < 1) {
      M = wrapTau(M);
      let E = e < 0.8 ? M : Math.PI;
      for (let k = 0; k < 16; k++) {
        const f = E - e * Math.sin(E) - M;
        const d = 1 - e * Math.cos(E);
        E -= f / d;
        if (Math.abs(f) < 1e-10) break;
      }
      return { nu: 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), E };
    } else {
      let H = Math.asinh(M / e);
      for (let k = 0; k < 24; k++) {
        const f = e * Math.sinh(H) - H - M;
        const d = e * Math.cosh(H) - 1;
        H -= f / d;
        if (Math.abs(f) < 1e-10) break;
      }
      return { nu: 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(H / 2)), E: H };
    }
  }

  /* ---------- state at time / anomaly ---------- */
  function stateAtTime(el, t, out) {
    const M = el.M0 + el.n * (t - el.epoch);
    const { nu } = trueFromMean(el.e, M);
    return stateAtNu(el, nu, out);
  }
  function stateAtNu(el, nu, out) {
    out = out || { r: new THREE.Vector3(), v: new THREE.Vector3() };
    const c = Math.cos(nu), s = Math.sin(nu);
    const rm = el.p / (1 + el.e * c);
    out.r.copy(el.P).multiplyScalar(rm * c).addScaledVector(el.Q, rm * s);
    const k = Math.sqrt(el.mu / el.p);
    out.v.copy(el.P).multiplyScalar(-k * s).addScaledVector(el.Q, k * (el.e + c));
    out.nu = nu; out.rm = rm;
    return out;
  }
  function posAtNu(el, nu, out) {
    out = out || new THREE.Vector3();
    const c = Math.cos(nu), s = Math.sin(nu);
    const rm = el.p / (1 + el.e * c);
    return out.copy(el.P).multiplyScalar(rm * c).addScaledVector(el.Q, rm * s);
  }
  function radiusAtNu(el, nu) { return el.p / (1 + el.e * Math.cos(nu)); }

  /* time when orbit reaches true anomaly nu, first occurrence ≥ fromT */
  function timeAtNu(el, nu, fromT) {
    const M = meanFromTrue(el.e, nu);
    let t = el.epoch + (M - el.M0) / el.n;
    if (el.e < 1) {
      const P = el.period;
      while (t < fromT - 1e-6) t += P;
      while (t - P >= fromT - 1e-6) t -= P;
    }
    return t;
  }
  /* time to reach radius R (outbound dir=+1 / inbound dir=-1); null if never */
  function timeToRadius(el, R, fromT, dir = 1) {
    const cnu = (el.p / R - 1) / el.e;
    if (el.e < 1e-9 || cnu > 1 || cnu < -1) return null;
    const nu = dir > 0 ? Math.acos(cnu) : -Math.acos(cnu);
    if (el.e >= 1) {                                   // hyperbolic: single pass
      const M = meanFromTrue(el.e, nu);
      const t = el.epoch + (M - el.M0) / el.n;
      return t >= fromT - 1e-6 ? t : null;
    }
    return timeAtNu(el, nu, fromT);
  }
  function nuAtTime(el, t) {
    const M = el.M0 + el.n * (t - el.epoch);
    return trueFromMean(el.e, M).nu;
  }

  /* ---------- sampled polyline of an orbit for rendering ---------- */
  function orbitPoints(el, segs = 200, maxR = Infinity, fromNu = null, toNu = null) {
    const pts = [];
    let a0, a1;
    if (el.e < 1) { a0 = fromNu !== null ? fromNu : 0; a1 = toNu !== null ? toNu : a0 + TAU; }
    else {
      const nuInf = Math.acos(clamp(-1 / el.e, -1, 1)) - 0.02;
      let nuMax = nuInf;
      if (isFinite(maxR)) {
        const cn = (el.p / maxR - 1) / el.e;
        if (cn > -1 && cn < 1) nuMax = Math.min(nuMax, Math.acos(cn));
      }
      a0 = fromNu !== null ? Math.max(fromNu, -nuMax) : -nuMax;
      a1 = toNu !== null ? Math.min(toNu, nuMax) : nuMax;
    }
    for (let i = 0; i <= segs; i++) {
      const nu = a0 + (a1 - a0) * i / segs;
      const r = radiusAtNu(el, nu);
      if (r > maxR * 1.05 || r < 0) continue;
      pts.push(posAtNu(el, nu));
    }
    return pts;
  }

  /* ============ planet ephemeris ============ */
  for (const b of CEL.list) if (b.orbit) b.el = elementsFromOrbit(b.parentB.mu, b.orbit);

  let cacheT = NaN; const cachePos = {}, cacheVel = {};
  function ensureCache(t) {
    if (cacheT === t) return;
    cacheT = t;
    for (const b of CEL.list) {
      if (!b.orbit) { (cachePos[b.id] = cachePos[b.id] || new THREE.Vector3()).set(0, 0, 0); (cacheVel[b.id] = cacheVel[b.id] || new THREE.Vector3()).set(0, 0, 0); continue; }
      const st = stateAtTime(b.el, t, b._st || (b._st = { r: new THREE.Vector3(), v: new THREE.Vector3() }));
      const pp = cachePos[b.parent], pv = cacheVel[b.parent];
      (cachePos[b.id] = cachePos[b.id] || new THREE.Vector3()).copy(st.r).add(pp);
      (cacheVel[b.id] = cacheVel[b.id] || new THREE.Vector3()).copy(st.v).add(pv);
    }
  }
  function bodyAbsPos(body, t, out) { ensureCache(t); return (out || new THREE.Vector3()).copy(cachePos[body.id]); }
  function bodyAbsVel(body, t, out) { ensureCache(t); return (out || new THREE.Vector3()).copy(cacheVel[body.id]); }
  /* position of body B relative to body A's center (inertial axes) */
  function bodyRelPos(bodyB, bodyA, t, out) {
    ensureCache(t);
    return (out || new THREE.Vector3()).copy(cachePos[bodyB.id]).sub(cachePos[bodyA.id]);
  }
  function bodyRelVel(bodyB, bodyA, t, out) {
    ensureCache(t);
    return (out || new THREE.Vector3()).copy(cacheVel[bodyB.id]).sub(cacheVel[bodyA.id]);
  }

  /* ============ misc helpers ============ */
  function apPe(el, bodyR) {
    return {
      ap: el.e < 1 ? el.rAp - bodyR : NaN,
      pe: el.rPe - bodyR,
      tAp: el.e < 1 ? null : null, // filled by caller via timeAtNu(el, PI)
    };
  }
  function speedAtR(el, r) { return Math.sqrt(Math.max(el.mu * (2 / r - 1 / el.a), 0)); }
  function circSpeed(mu, r) { return Math.sqrt(mu / r); }

  return { elementsFromState, elementsFromOrbit, stateAtTime, stateAtNu, posAtNu, radiusAtNu, timeAtNu, timeToRadius, nuAtTime, orbitPoints, bodyAbsPos, bodyAbsVel, bodyRelPos, bodyRelVel, meanFromTrue, trueFromMean, apPe, speedAtR, circSpeed };
})();
