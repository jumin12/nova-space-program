/* audio.js — 100% procedural WebAudio. Global: AUDIO */
'use strict';
const AUDIO = (() => {
  let ctx = null, master, sfxBus, musBus, started = false;
  const S = { master: 0.8, sfx: 0.9, music: 0.5 };

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = S.master; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx; sfxBus.connect(master);
      musBus = ctx.createGain(); musBus.gain.value = S.music; musBus.connect(master);
      makeNoiseBuf();
      return true;
    } catch (e) { return false; }
  }
  function resume() { if (ensure() && ctx.state === 'suspended') ctx.resume(); started = true; }

  let noiseBuf;
  function makeNoiseBuf() {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {           // pink-ish noise
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 2.1;
    }
  }
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

  /* ---------- continuous loops (engine / wind / rcs) ---------- */
  function makeLoop(filterType, baseFreq) {
    if (!ensure()) return null;
    const src = noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = baseFreq; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    const sub = ctx.createOscillator(); sub.type = 'triangle'; sub.frequency.value = 38;
    const subG = ctx.createGain(); subG.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(sfxBus);
    sub.connect(subG); subG.connect(sfxBus);
    src.start(); sub.start();
    return { f, g, sub, subG, level: 0 };
  }
  const loops = {};
  function loop(name, type, freq) { if (!loops[name] && ctx) loops[name] = makeLoop(type, freq); return loops[name]; }

  function setEngine(level, atmo = 1, srb = 0) {       // level 0..1
    if (!started) return;
    const L = loop('eng', 'lowpass', 500); if (!L) return;
    const t = ctx.currentTime;
    const v = level * 0.62;
    L.g.gain.setTargetAtTime(v, t, 0.08);
    L.f.frequency.setTargetAtTime(220 + level * (520 + srb * 600) + atmo * 160, t, 0.1);
    L.subG.gain.setTargetAtTime(level * 0.34, t, 0.08);
    L.sub.frequency.setTargetAtTime(30 + level * 22 + srb * 14, t, 0.1);
  }
  function setWind(level) {
    if (!started) return;
    const L = loop('wind', 'bandpass', 800); if (!L) return;
    const t = ctx.currentTime;
    L.g.gain.setTargetAtTime(Math.min(level, 1) * 0.5, t, 0.18);
    L.f.frequency.setTargetAtTime(400 + level * 1900, t, 0.2);
  }
  function setRCS(on) {
    if (!started) return;
    const L = loop('rcs', 'highpass', 3000); if (!L) return;
    L.g.gain.setTargetAtTime(on ? 0.12 : 0, ctx.currentTime, 0.03);
  }
  /* EVA suit breathing */
  let breathT = null;
  function setBreath(on) {
    if (!started || !ensure()) return;
    if (on && !breathT) {
      breathT = setInterval(() => {
        const n = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        n.connect(f); f.connect(g); g.connect(sfxBus);
        n.start(); n.stop(t + 2);
      }, 2600);
    } else if (!on && breathT) { clearInterval(breathT); breathT = null; }
  }
  /* geiger counter clicks — rate in clicks/sec */
  let geigerAcc = 0, geigerLast = 0;
  function setGeiger(rate) {
    if (!started || !ensure() || rate <= 0) return;
    const now = performance.now();
    const dt = Math.min((now - geigerLast) / 1000, 0.5);
    geigerLast = now;
    geigerAcc += rate * dt;
    while (geigerAcc > 1) {
      geigerAcc -= 1;
      setTimeout(() => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 2800 + Math.random() * 900;
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
        o.connect(g); g.connect(sfxBus); o.start(); o.stop(t + 0.02);
      }, Math.random() * 200);
    }
  }
  function stopLoops() { for (const k in loops) if (loops[k]) loops[k].g.gain.value = 0; setBreath(false); }

  /* ---------- one-shots ---------- */
  function blip(freq = 880, dur = 0.07, vol = 0.18, type = 'square') {
    if (!started || !ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(sfxBus); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }
  function thunk(vol = 0.5) {
    if (!started || !ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(sfxBus); o.start(); o.stop(t + 0.25);
    const n = noiseSrc(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 900;
    ng.gain.setValueAtTime(vol * 0.6, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(f); f.connect(ng); ng.connect(sfxBus); n.start(); n.stop(t + 0.15);
  }
  function explosion(vol = 0.9) {
    if (!started || !ensure()) return;
    const t = ctx.currentTime;
    const n = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.9);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    n.connect(f); f.connect(g); g.connect(sfxBus); n.start(); n.stop(t + 1.2);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    og.gain.setValueAtTime(vol * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(og); og.connect(sfxBus); o.start(); o.stop(t + 0.9);
  }
  function chute() { blip(420, 0.3, 0.2, 'sawtooth'); thunk(0.3); }
  function warp(up) { blip(up ? 520 : 380, 0.12, 0.1, 'sine'); blip(up ? 760 : 300, 0.18, 0.08, 'sine'); }
  function click() { blip(1400, 0.03, 0.08, 'square'); }
  function hover() { blip(2100, 0.02, 0.03, 'sine'); }
  function jingle(good = true) {
    if (!started) return;
    const seq = good ? [523, 659, 784, 1047] : [392, 330, 262];
    seq.forEach((f, i) => setTimeout(() => blip(f, 0.22, 0.14, 'triangle'), i * 110));
  }
  function alarm() { blip(880, 0.14, 0.2, 'square'); setTimeout(() => blip(880, 0.14, 0.2, 'square'), 200); }

  /* ---------- ambient music (generative pad) ---------- */
  let musTimer = null;
  function music(on) {
    if (!ensure()) return;
    if (!on) { if (musTimer) { clearInterval(musTimer); musTimer = null; } return; }
    if (musTimer) return;
    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    const padNote = (f, dur) => {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = f; o2.frequency.value = f * 1.003;
      fl.type = 'lowpass'; fl.frequency.value = 600;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
      o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(musBus);
      o1.start(); o2.start(); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    };
    const pluck = (f) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = f;
      fl.type = 'lowpass'; fl.frequency.value = 1800;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6);
      o.connect(fl); fl.connect(g); g.connect(musBus);
      o.start(); o.stop(t + 1.7);
    };
    const bass = (f) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f / 4;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 1.2);
      g.gain.linearRampToValueAtTime(0, t + 6.5);
      o.connect(g); g.connect(musBus);
      o.start(); o.stop(t + 6.6);
    };
    let step = 0;
    const tick = () => {
      const r = Math.sin(step * 12.9898) * 43758.5453; const rr = r - Math.floor(r);
      padNote(scale[(step * 3 + ((rr * 4) | 0)) % scale.length] / 2, 7);
      if (step % 2 === 0) padNote(scale[(step * 2) % scale.length], 5);
      if (step % 2 === 1) bass(scale[(step * 3) % scale.length]);
      if (rr > 0.4) setTimeout(() => pluck(scale[(step * 5 + 2) % scale.length] * 2), 900 + rr * 1600);
      step++;
    };
    tick(); musTimer = setInterval(tick, 3800);
  }

  function setVolumes(m, s, mu) {
    S.master = m; S.sfx = s; S.music = mu;
    if (ctx) { master.gain.value = m; sfxBus.gain.value = s; musBus.gain.value = mu; }
  }

  return { resume, setEngine, setWind, setRCS, setBreath, setGeiger, stopLoops, blip, thunk, explosion, chute, warp, click, hover, jingle, alarm, music, setVolumes, get started() { return started; } };
})();
