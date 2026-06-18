/* utils.js — math, noise, RNG, formatting, DOM helpers. Global: U */
'use strict';
window.GAME = { screens: {} };   // seeded early so later scripts can register screens
const U = (() => {
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const remap = (x, a, b, c, d) => c + (d - c) * clamp((x - a) / (b - a), 0, 1);
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  /* ---- seeded RNG ---- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const hash3 = (x, y, z) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  /* ---- simplex noise 3D (Gustavson-style gradient noise) ---- */
  function Simplex(seed) {
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
    const grad3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
    const F3 = 1 / 3, G3 = 1 / 6;
    return function (xin, yin, zin) {
      let n0, n1, n2, n3;
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 < 0) n0 = 0; else { const gi = permMod12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[gi] * x0 + grad3[gi + 1] * y0 + grad3[gi + 2] * z0); }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 < 0) n1 = 0; else { const gi = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[gi] * x1 + grad3[gi + 1] * y1 + grad3[gi + 2] * z1); }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 < 0) n2 = 0; else { const gi = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (grad3[gi] * x2 + grad3[gi + 1] * y2 + grad3[gi + 2] * z2); }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 < 0) n3 = 0; else { const gi = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (grad3[gi] * x3 + grad3[gi + 1] * y3 + grad3[gi + 2] * z3); }
      return 32 * (n0 + n1 + n2 + n3);
    };
  }

  /* fbm helpers operating on a unit-sphere direction vector */
  function fbm(noise, x, y, z, oct, lac = 2, gain = 0.5) {
    let amp = 0.5, f = 1, sum = 0;
    for (let o = 0; o < oct; o++) { sum += amp * noise(x * f, y * f, z * f); f *= lac; amp *= gain; }
    return sum;
  }
  function ridged(noise, x, y, z, oct, lac = 2.1, gain = 0.55) {
    let amp = 0.5, f = 1, sum = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let n = 1 - Math.abs(noise(x * f, y * f, z * f));
      n *= n * w; w = clamp(n * 2, 0, 1);
      sum += n * amp; f *= lac; amp *= gain;
    }
    return sum;
  }
  /* worley F1 on 3D point grid — for craters: returns {d, cx, cy, cz, id} of nearest feature */
  function worley(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let best = 8, bid = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const cx = xi + dx, cy = yi + dy, cz = zi + dz;
      const fx = cx + hash3(cx, cy, cz), fy = cy + hash3(cx + 91, cy + 7, cz + 13), fz = cz + hash3(cx + 41, cy + 67, cz + 3);
      const d2 = (fx - x) * (fx - x) + (fy - y) * (fy - y) + (fz - z) * (fz - z);
      if (d2 < best) { best = d2; bid = hash3(cx + 7, cy + 31, cz + 17); }
    }
    return { d: Math.sqrt(best), id: bid };
  }
  /* crater field: sum of bowl-shaped depressions with rims */
  function craters(x, y, z, freq, depth, rng = 0) {
    const w = worley(x * freq + rng, y * freq, z * freq);
    const r = 0.25 + w.id * 0.45;                 // crater radius in cell units
    const d = w.d / r;
    if (d > 1.3) return 0;
    const bowl = d < 1 ? (d * d - 1) : 0;          // -1 at center → 0 at rim
    const rim = Math.exp(-Math.pow((d - 1) * 3.5, 2)) * 0.35;
    return (bowl * 0.7 + rim) * depth * (0.4 + w.id * 0.6);
  }

  /* ---- formatting ---- */
  function fmtSI(v, unit = 'm', digits = 1) {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + ' G' + unit;
    if (a >= 1e6) return (v / 1e6).toFixed(2) + ' M' + unit;
    if (a >= 1e4) return (v / 1e3).toFixed(digits) + ' k' + unit;
    if (a >= 1e3) return (v / 1e3).toFixed(2) + ' k' + unit;
    return v.toFixed(a < 10 ? 1 : 0) + ' ' + unit;
  }
  const fmtMass = kg => kg >= 1000 ? (kg / 1000).toFixed(2) + ' t' : kg.toFixed(0) + ' kg';
  const pad2 = n => String(n).padStart(2, '0');
  function fmtTime(s, full = false) {
    if (!isFinite(s)) return '—';
    const neg = s < 0; s = Math.abs(s);
    const DAY = 23040, YEAR = 9203328;            // Gaia day / year (set in celestial too)
    const y = Math.floor(s / YEAR); s -= y * YEAR;
    const d = Math.floor(s / DAY); s -= d * DAY;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    let out = '';
    if (y) out += y + 'y ';
    if (d || y) out += d + 'd ';
    out += `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
    return (neg ? '-' : '') + out;
  }
  function fmtDelta(s) {
    if (!isFinite(s)) return '—';
    const a = Math.abs(s);
    if (a < 60) return s.toFixed(0) + 's';
    if (a < 3600) return Math.floor(s / 60) + 'm ' + Math.floor(Math.abs(s) % 60) + 's';
    if (a < 86400 * 4) return Math.floor(s / 3600) + 'h ' + Math.floor((a % 3600) / 60) + 'm';
    return (s / 23040).toFixed(1) + 'd';
  }
  const fmtFunds = f => '₢ ' + Math.round(f).toLocaleString('en-US');

  /* ---- DOM ---- */
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  /* canvas-based text sprite for 3D labels */
  function textSprite(text, { size = 44, color = '#cfe3ee', bg = null, font = 'Rajdhani' } = {}) {
    const c = document.createElement('canvas'); const ctx = c.getContext('2d');
    ctx.font = `600 ${size}px ${font}`;
    const w = Math.ceil(ctx.measureText(text).width) + 18;
    c.width = w; c.height = size + 18;
    const ctx2 = c.getContext('2d');
    if (bg) { ctx2.fillStyle = bg; ctx2.fillRect(0, 0, c.width, c.height); }
    ctx2.font = `600 ${size}px ${font}`; ctx2.fillStyle = color; ctx2.textBaseline = 'middle';
    ctx2.fillText(text, 9, c.height / 2);
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.userData.aspect = c.width / c.height;
    return sp;
  }

  /* angle helpers */
  const wrapTau = a => { a %= TAU; return a < 0 ? a + TAU : a; };
  const wrapPi = a => { a = wrapTau(a); return a > Math.PI ? a - TAU : a; };

  return { TAU, DEG, clamp, lerp, smooth, remap, V3, mulberry32, hash3, Simplex, fbm, ridged, worley, craters, fmtSI, fmtMass, fmtTime, fmtDelta, fmtFunds, el, textSprite, wrapTau, wrapPi, pad2 };
})();
