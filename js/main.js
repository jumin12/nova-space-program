/* main.js — boot, renderer, screen manager, main menu, saves, settings. Global: GAME */
'use strict';
Object.assign(window.GAME, {
  renderer: null, ut: 0, save: null, current: null, currentName: '',
  settings: { quality: 2, volMaster: 0.8, volSfx: 0.9, volMusic: 0.45 },
  qualityNames: ['Low', 'Medium', 'High'],
});

(() => {
  const { el } = U;
  const LS_SAVE_LEGACY = 'nsp_save_v1', LS_SET = 'nsp_settings_v1';
  const LS_SLOTS_META = 'nsp_slots_meta_v2', LS_SLOT_PREFIX = 'nsp_slot_';
  const NUM_SLOTS = 5;

  /* ---------- persistence ---------- */
  function storageOk() {
    try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return true; } catch (e) { return false; }
  }
  const canStore = storageOk();
  GAME.activeSlot = 0;

  function slotKey(i) { return LS_SLOT_PREFIX + i; }
  function emptySlotMeta(i) { return { slot: i, empty: true }; }
  function loadMeta() {
    if (!canStore) return { activeSlot: 0, slots: Array.from({ length: NUM_SLOTS }, (_, i) => emptySlotMeta(i)) };
    try {
      const m = JSON.parse(localStorage.getItem(LS_SLOTS_META));
      if (m && Array.isArray(m.slots) && m.slots.length === NUM_SLOTS) return m;
    } catch (e) { /* fresh */ }
    return { activeSlot: 0, slots: Array.from({ length: NUM_SLOTS }, (_, i) => emptySlotMeta(i)) };
  }
  function saveMeta(meta) {
    if (!canStore) return;
    try { localStorage.setItem(LS_SLOTS_META, JSON.stringify(meta)); } catch (e) { }
  }
  function summarizeSave(s) {
    return {
      empty: false,
      mode: s.mode || 'campaign',
      ut: s.ut || 0,
      agencyName: (s.agency && s.agency.name) || '',
      siteChosen: !!s.siteChosen,
      funds: Math.round(s.funds || 0),
      sci: Math.round((s.sci || 0) * 10) / 10,
      flights: (s.flights || []).length,
      crafts: Object.keys(s.crafts || {}).length,
      mpSessionKey: s.mpSessionKey || null,
    };
  }
  function updateSlotMeta(slot, opts) {
    if (!GAME.save) return;
    const meta = loadMeta();
    meta.activeSlot = GAME.activeSlot = slot;
    meta.slots[slot] = Object.assign({ slot, updated: Date.now(), label: (opts && opts.label) || 'Saved' }, summarizeSave(GAME.save));
    saveMeta(meta);
  }
  function migrateLegacySave() {
    if (!canStore) return;
    const legacy = localStorage.getItem(LS_SAVE_LEGACY);
    if (!legacy) return;
    const meta = loadMeta();
    if (!meta.slots[0].empty) return;
    try {
      localStorage.setItem(slotKey(0), legacy);
      const s = JSON.parse(legacy);
      meta.slots[0] = Object.assign({ slot: 0, updated: Date.now(), label: 'Migrated save' }, summarizeSave(s));
      meta.activeSlot = 0;
      saveMeta(meta);
      localStorage.removeItem(LS_SAVE_LEGACY);
    } catch (e) { }
  }
  migrateLegacySave();
  GAME.activeSlot = loadMeta().activeSlot;

  GAME.getSlotsMeta = () => loadMeta();
  GAME.hasAnySave = () => loadMeta().slots.some(s => !s.empty);
  GAME.loadSave = (slot) => {
    if (!canStore) return null;
    const i = slot != null ? slot : GAME.activeSlot;
    try {
      const s = localStorage.getItem(slotKey(i));
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  };
  GAME.saveNow = (opts) => {
    if (!GAME.save) return;
    GAME.save.ut = GAME.ut;
    GAME.save.saveSlot = GAME.activeSlot;
    if (canStore) {
      try { localStorage.setItem(slotKey(GAME.activeSlot), JSON.stringify(GAME.save)); } catch (e) { }
      updateSlotMeta(GAME.activeSlot, opts);
    }
  };
  GAME.loadSlot = (slot, opts) => {
    const s = GAME.loadSave(slot);
    if (!s) return null;
    GAME.activeSlot = slot;
    const meta = loadMeta();
    meta.activeSlot = slot;
    saveMeta(meta);
    GAME.save = s;
    GAME.ut = s.ut || 0;
    if (opts && opts.mpFromSave != null) GAME.save.mpFromSave = opts.mpFromSave;
    CAREER.migrate();
    return s;
  };
  GAME.newGameInSlot = (slot, mode, cfg) => {
    GAME.activeSlot = slot;
    GAME.newGame(mode, cfg);
  };
  GAME.wipeSlot = (slot) => {
    if (!canStore) return;
    localStorage.removeItem(slotKey(slot));
    const meta = loadMeta();
    meta.slots[slot] = emptySlotMeta(slot);
    if (meta.activeSlot === slot) {
      const next = meta.slots.findIndex(s => !s.empty);
      meta.activeSlot = next >= 0 ? next : 0;
    }
    saveMeta(meta);
    if (GAME.activeSlot === slot) { GAME.save = null; GAME.ut = 0; }
  };
  GAME.wipeSave = () => {
    if (!canStore) return;
    for (let i = 0; i < NUM_SLOTS; i++) localStorage.removeItem(slotKey(i));
    localStorage.removeItem(LS_SLOTS_META);
    localStorage.removeItem(LS_SAVE_LEGACY);
    GAME.save = null;
    GAME.ut = 0;
    GAME.activeSlot = 0;
  };
  GAME.autosaveLaunch = (phase, detail) => {
    if (!GAME.save) return;
    const tag = phase === 'pre' ? 'Pre-launch autosave' : 'Post-flight autosave';
    GAME.saveNow({ label: detail ? tag + ' · ' + detail : tag });
  };
  GAME.fmtSlotTime = (ut) => {
    const d = Math.floor((ut || 0) / 86400) + 1;
    const h = Math.floor(((ut || 0) % 86400) / 3600);
    return 'Day ' + d + ' · ' + h + 'h';
  };
  GAME.showSlotPicker = (opts) => {
    opts = opts || {};
    const meta = loadMeta();
    const body = document.createElement('div');
    body.innerHTML = `<div style="color:var(--dim);font-size:12.5px;margin-bottom:8px;line-height:1.45">${opts.hint || 'Select a save slot.'}</div><div class="slot-list" id="slot-list"></div>`;
    const list = body.querySelector('#slot-list');
    let picked = meta.activeSlot;
    const syncMeta = () => {
      const m = loadMeta();
      meta.activeSlot = m.activeSlot;
      meta.slots = m.slots;
    };
    const render = () => {
      list.innerHTML = '';
      for (let i = 0; i < NUM_SLOTS; i++) {
        const sm = meta.slots[i];
        const row = document.createElement('div');
        row.className = 'slot-row' + (sm.empty ? ' slot-empty' : '') + (i === picked ? ' active' : '');
        if (sm.empty) {
          row.innerHTML = `<span class="slot-num">SLOT ${i + 1}</span><div class="slot-body"><div class="slot-name">Empty</div><div class="slot-meta">No save data</div></div>`;
        } else {
          const mode = String(sm.mode || 'campaign').toUpperCase();
          const ag = sm.agencyName || 'Agency';
          row.innerHTML = `<span class="slot-num">SLOT ${i + 1}</span><div class="slot-body">
            <div class="slot-name">${ag}</div>
            <div class="slot-meta">${mode} · ${GAME.fmtSlotTime(sm.ut)} · ${sm.flights || 0} flights · ${sm.crafts || 0} crafts</div>
            <div class="slot-meta">${sm.label || ''}</div></div>
            ${sm.mpSessionKey ? '<span class="slot-tag">MP</span>' : ''}`;
        }
        row.onclick = () => { AUDIO.click(); picked = i; render(); };
        list.appendChild(row);
      }
    };
    render();
    const buttons = [{ label: 'CANCEL' }];
    if (opts.mode === 'load') {
      buttons.push({
        label: 'LOAD', cls: 'acc', cb: () => {
          const sm = meta.slots[picked];
          if (sm.empty) { UI.toast('Empty slot', 'Nothing saved in that slot.', 'warn'); return; }
          opts.onSelect && opts.onSelect(picked);
        },
      });
      buttons.push({
        label: 'DELETE', cls: 'danger', cb: () => {
          const sm = meta.slots[picked];
          if (sm.empty) return;
          UI.confirm('DELETE SLOT', `Erase slot ${picked + 1}? This cannot be undone.`, () => {
            GAME.wipeSlot(picked);
            syncMeta();
            render();
          });
        },
      });
    } else if (opts.mode === 'mp') {
      buttons.push({
        label: 'START', cls: 'acc', cb: () => {
          opts.onStart && opts.onStart(picked);
        },
      });
    } else {
      buttons.push({
        label: opts.okLabel || 'SELECT', cls: 'acc', cb: () => {
          const sm = meta.slots[picked];
          if (!sm.empty && opts.confirmOverwrite !== false) {
            UI.confirm('OVERWRITE SLOT', `Slot ${picked + 1} already has a save. Replace it?`, () => opts.onSelect && opts.onSelect(picked));
          } else opts.onSelect && opts.onSelect(picked);
        },
      });
    }
    UI.dialog({ title: opts.title || 'SAVE SLOTS', body, buttons });
  };
  GAME.pickSaveSlot = (onSelect, opts) => GAME.showSlotPicker(Object.assign({ onSelect }, opts));
  GAME.showMultiplayerSlotSetup = () => {
    GAME.showSlotPicker({
      title: 'MULTIPLAYER — SELECT SLOT',
      mode: 'mp',
      hint: 'Select a save slot and press START. Empty slots begin a new game; occupied slots continue your progress.',
      onStart: (slot) => {
        const sm = GAME.getSlotsMeta().slots[slot];
        if (sm.empty) {
          GAME.newGameInSlot(slot, 'sandbox');
          GAME.save.mpFromSave = false;
        } else {
          GAME.loadSlot(slot, { mpFromSave: true });
        }
        NET.openLobby();
      },
    });
  };
  function saveSettings() { if (canStore) try { localStorage.setItem(LS_SET, JSON.stringify(GAME.settings)); } catch (e) { } }
  function loadSettings() {
    if (!canStore) return;
    try { const s = localStorage.getItem(LS_SET); if (s) Object.assign(GAME.settings, JSON.parse(s)); } catch (e) { }
  }

  /* ---------- campaign configuration ---------- */
  GAME.defaultCfg = (preset) => ({
    explorer: { radiation: false, lifeSupport: false, failures: false, commNet: false, sciMult: 1.5, startFunds: 80000, hardcore: false, preset },
    normal: { radiation: true, lifeSupport: true, failures: false, commNet: true, sciMult: 1, startFunds: 36000, hardcore: false, preset },
    veteran: { radiation: true, lifeSupport: true, failures: true, commNet: true, sciMult: 0.7, startFunds: 22000, hardcore: true, preset },
  })[preset] || GAME.defaultCfg('normal');

  GAME.defaultAgency = () => ({
    name: 'Nova Aerospace',
    flag: { bg: '#1a3d5c', stripe: '#e8c84a', emblem: '#ffffff', pattern: 'stripes' },
  });

  GAME.drawAgencyFlag = (ctx, w, h, flag) => {
    const f = flag || GAME.defaultAgency().flag;
    ctx.fillStyle = f.bg;
    ctx.fillRect(0, 0, w, h);
    if (f.pattern === 'stripes') {
      ctx.fillStyle = f.stripe;
      for (let i = 0; i < 5; i++) ctx.fillRect(0, (h / 5) * i, w, h / 10);
    } else if (f.pattern === 'diagonal') {
      ctx.fillStyle = f.stripe;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.55); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.25); ctx.lineTo(0, h * 0.8);
      ctx.closePath(); ctx.fill();
    } else if (f.pattern === 'canton') {
      ctx.fillStyle = f.stripe;
      ctx.fillRect(0, 0, w * 0.42, h * 0.52);
    }
    ctx.fillStyle = f.emblem;
    const cx = f.pattern === 'canton' ? w * 0.21 : w * 0.5;
    const cy = f.pattern === 'canton' ? h * 0.26 : h * 0.5;
    const r = Math.min(w, h) * 0.11;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 2.2);
    ctx.lineTo(cx + r * 0.85, cy + r * 0.3);
    ctx.lineTo(cx - r * 0.85, cy + r * 0.3);
    ctx.closePath();
    ctx.fill();
  };

  GAME.agencyFlagTex = (flag) => {
    const key = JSON.stringify(flag || {});
    if (!GAME._flagTex) GAME._flagTex = new Map();
    if (GAME._flagTex.has(key)) return GAME._flagTex.get(key);
    const c = document.createElement('canvas');
    c.width = 128; c.height = 80;
    GAME.drawAgencyFlag(c.getContext('2d'), 128, 80, flag);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    GAME._flagTex.set(key, tex);
    return tex;
  };

  GAME.applyAgencyFlag = (root, flagOpt) => {
    const flag = flagOpt || (GAME.save && GAME.save.agency && GAME.save.agency.flag);
    if (!flag || !root) return;
    const tex = GAME.agencyFlagTex(flag);
    root.traverse(o => {
      if (o.userData && o.userData.agencyFlag && o.material) {
        o.material.map = tex;
        o.material.color.setHex(0xffffff);
        o.material.needsUpdate = true;
      }
    });
  };

  GAME.newGame = (mode, cfg) => {
    cfg = cfg || GAME.defaultCfg('normal');
    if (mode === 'sandbox') cfg = Object.assign({}, cfg, { commNet: false, radiation: cfg.radiation, failures: false });
    GAME.save = {
      mode, funds: mode === 'sandbox' ? 1e12 : cfg.startFunds, sci: 0,
      tech: mode === 'sandbox' ? Object.keys(CAREER.TECH) : ['start'],
      sciLog: {}, contracts: {}, crafts: {}, flights: [], debris: [], launchCount: {},
      ut: 0, stockAdded: false, cfg,
      site: { lat: -0.0018, lon: 0 }, siteChosen: false, agencyReady: false,
      mpFromSave: false, mpSetupDone: false, mpSessionKey: null,
      saveSlot: GAME.activeSlot,
    };
    GAME.ut = 5 * 3600;                      // pleasant morning at the space center
    CEL.setSite(GAME.save.site.lat, GAME.save.site.lon);
    CAREER.installStockCrafts();
    GAME.saveNow({ label: 'New game' });
  };

  /* ---------- funds / science helpers ---------- */
  GAME.canAfford = c => GAME.save.mode === 'sandbox' || GAME.save.funds >= c;
  GAME.spend = c => {
    if (GAME.save.mode !== 'sandbox') { GAME.save.funds -= c; UI.updateTopbar(); }
    if (window.NET && NET.active && NET.mode === 'coop' && c > 0) NET.onFunds(-c);
  };
  GAME.earn = c => {
    if (GAME.save.mode !== 'sandbox') GAME.save.funds += c;
    if (window.NET && NET.active && NET.mode === 'coop' && c > 0) NET.onFunds(c);
    UI.updateTopbar();
  };
  GAME.earnSci = s => { if (GAME.save.mode !== 'sandbox') GAME.save.sci += s; UI.updateTopbar(); };

  GAME.showCampaignSetup = (onStart) => {
    const cfg = GAME.defaultCfg('normal');
    const body = document.createElement('div');
    const tgl = (id, label, checked, hint) => `
      <div class="set-row"><label>${label} <span style="color:var(--dim);font-size:11px">${hint}</span></label>
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}></div>`;
    body.innerHTML = `
      <div class="set-row"><label>Difficulty preset</label>
        <select id="cs-preset">
          <option value="explorer">Explorer — relaxed, more science</option>
          <option value="normal" selected>Engineer — the intended experience</option>
          <option value="veteran">Veteran — radiation, failures, permadeath</option>
        </select></div>
      <hr style="border-color:#1d2935">
      ${tgl('cs-rad', 'Radiation', cfg.radiation, 'belts, storms, crew dose')}
      ${tgl('cs-ls', 'Life support', cfg.lifeSupport, 'crew consume supplies')}
      ${tgl('cs-comm', 'Relay network', cfg.commNet, 'probes need a signal path home')}
      ${tgl('cs-fail', 'Ignition failures', cfg.failures, 'engines can refuse to light')}
      ${tgl('cs-hard', 'Hardcore', cfg.hardcore, 'crew loss fails the mission')}
      <div class="set-row"><label>Starting funds</label><input id="cs-funds" type="range" min="15000" max="150000" step="5000" value="${cfg.startFunds}"><span id="cs-funds-v" class="mono">${U.fmtFunds(cfg.startFunds)}</span></div>
      <div class="set-row"><label>Science gain</label><input id="cs-sci" type="range" min="0.4" max="2" step="0.1" value="${cfg.sciMult}"><span id="cs-sci-v" class="mono">${cfg.sciMult}×</span></div>`;
    const sync = (preset) => {
      const c = GAME.defaultCfg(preset);
      body.querySelector('#cs-rad').checked = c.radiation;
      body.querySelector('#cs-ls').checked = c.lifeSupport;
      body.querySelector('#cs-comm').checked = c.commNet;
      body.querySelector('#cs-fail').checked = c.failures;
      body.querySelector('#cs-hard').checked = c.hardcore;
      body.querySelector('#cs-funds').value = c.startFunds;
      body.querySelector('#cs-sci').value = c.sciMult;
      body.querySelector('#cs-funds-v').textContent = U.fmtFunds(c.startFunds);
      body.querySelector('#cs-sci-v').textContent = c.sciMult + '×';
    };
    body.querySelector('#cs-preset').onchange = e => sync(e.target.value);
    body.querySelector('#cs-funds').oninput = e => body.querySelector('#cs-funds-v').textContent = U.fmtFunds(+e.target.value);
    body.querySelector('#cs-sci').oninput = e => body.querySelector('#cs-sci-v').textContent = (+e.target.value) + '×';
    UI.dialog({
      title: 'NEW CAMPAIGN', body,
      buttons: [
        { label: 'CANCEL' },
        {
          label: 'FOUND THE AGENCY', cls: 'acc', cb: () => {
            onStart({
              preset: body.querySelector('#cs-preset').value,
              radiation: body.querySelector('#cs-rad').checked,
              lifeSupport: body.querySelector('#cs-ls').checked,
              commNet: body.querySelector('#cs-comm').checked,
              failures: body.querySelector('#cs-fail').checked,
              hardcore: body.querySelector('#cs-hard').checked,
              startFunds: +body.querySelector('#cs-funds').value,
              sciMult: +body.querySelector('#cs-sci').value,
            });
          },
        },
      ],
    });
  };

  /* ---------- renderer ---------- */
  function initRenderer() {
    const canvas = document.getElementById('gl');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    r.setSize(innerWidth, innerHeight);
    r.setPixelRatio(Math.min(devicePixelRatio, GAME.settings.quality >= 2 ? 2 : 1.25));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = GAME.settings.quality >= 1;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    GAME.renderer = r;
    addEventListener('resize', () => {
      r.setSize(innerWidth, innerHeight);
      if (GAME.current && GAME.current.resize) GAME.current.resize();
    });
  }

  /* ---------- screen manager ---------- */
  GAME.go = (name, args) => {
    if (GAME.current && GAME.current.exit) GAME.current.exit(name);
    document.getElementById('hud-root').innerHTML = '';
    UI.topbar(false);
    GAME.currentName = name;
    GAME.current = GAME.screens[name];
    if (!GAME.current) { console.error('no screen', name); return; }
    GAME.current.enter(args || {});
  };

  /* ---------- main loop ---------- */
  let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    dt = Math.min(dt, 0.1);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; GAME.fps = fps; }
    PG.oceanTime.value += dt;
    try {
      if (GAME.current && GAME.current.update) GAME.current.update(dt);
    } catch (e) { console.error(e); }
    UI.updateTopbar();
  }

  /* deterministic stepping hook for automated testing */
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) {
      if (GAME.current && GAME.current.update) GAME.current.update(1 / 60);
    }
  };
  window.render_game_to_text = () => {
    const o = { screen: GAME.currentName, ut: Math.round(GAME.ut) };
    if (GAME.save) { o.funds = Math.round(GAME.save.funds); o.sci = Math.round(GAME.save.sci * 10) / 10; o.mode = GAME.save.mode; }
    if (GAME.current && GAME.current.toText) Object.assign(o, GAME.current.toText());
    return JSON.stringify(o);
  };

  /* ---------- debug console (~) ---------- */
  window.DBG = { infFuel: false, noDamage: false, aeroVectors: false, thermal: false, forceSignal: false, fps: false };
  GAME.toggleDebug = () => {
    let p = document.getElementById('debug-panel');
    if (p) { p.remove(); return; }
    p = el('div', 'panel', document.getElementById('hud-root'));
    p.id = 'debug-panel';
    const chk = (key, label) => `<label class="dbg-row"><input type="checkbox" data-k="${key}" ${DBG[key] ? 'checked' : ''}> ${label}</label>`;
    p.innerHTML = `<div class="ptitle">DEBUG CONSOLE<span id="dbg-x" style="cursor:pointer">✕</span></div>
      <div style="padding:8px 12px">
        ${chk('aeroVectors', 'Aerodynamic force vectors')}
        ${chk('thermal', 'Thermal overlay')}
        ${chk('infFuel', 'Infinite propellant')}
        ${chk('noDamage', 'No crash / heat damage')}
        ${chk('forceSignal', 'Force comm signal')}
        ${chk('fps', 'Show FPS')}
        <div class="dbg-row"><button class="btn tiny" id="dbg-orbit">SET ORBIT</button>
          <input id="dbg-alt" type="text" value="120" style="width:54px"> km</div>
        <div class="dbg-row"><button class="btn tiny" id="dbg-warpub">UT +1h</button>
          <button class="btn tiny" id="dbg-ec">REFILL EC</button>
          <button class="btn tiny" id="dbg-sci">+100⚛</button></div>
        <div style="color:var(--dim);font-size:11px;margin-top:6px">Vectors: <span style="color:#ff6a5e">drag</span> · <span style="color:#7adfff">lift</span> · thermal tints hot parts red.</div>
      </div>`;
    p.querySelector('#dbg-x').onclick = () => p.remove();
    p.querySelectorAll('input[type=checkbox]').forEach(c => c.onchange = () => { DBG[c.dataset.k] = c.checked; });
    p.querySelector('#dbg-orbit').onclick = () => {
      const F = window.__FLIGHT;
      if (!F) { UI.toast('Debug', 'Set Orbit works in flight.', 'warn'); return; }
      const alt = (+p.querySelector('#dbg-alt').value || 120) * 1000;
      const r = F.body.R + alt;
      F.r.set(r, 0, 0);
      F.v.set(0, 0, -Math.sqrt(F.body.mu / r));
      F.landed = false; F.launched = true;
      UI.toast('Debug', `Teleported to ${alt / 1000} km circular orbit.`, '');
    };
    p.querySelector('#dbg-warpub').onclick = () => { GAME.ut += 3600; UI.toast('Debug', 'UT +1h', ''); };
    p.querySelector('#dbg-ec').onclick = () => {
      const F = window.__FLIGHT;
      if (F) { F.adjustCharge(1e6); UI.toast('Debug', 'Charge refilled.', ''); }
    };
    p.querySelector('#dbg-sci').onclick = () => { GAME.earnSci(100); };
  };

  /* ---------- settings dialog ---------- */
  GAME.showSettings = () => {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="set-row"><label>Graphics quality</label>
        <select id="set-q">${GAME.qualityNames.map((n, i) => `<option value="${i}" ${GAME.settings.quality === i ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="set-row"><label>Master volume</label><input id="set-vm" type="range" min="0" max="1" step="0.05" value="${GAME.settings.volMaster}"></div>
      <div class="set-row"><label>Sound effects</label><input id="set-vs" type="range" min="0" max="1" step="0.05" value="${GAME.settings.volSfx}"></div>
      <div class="set-row"><label>Music</label><input id="set-vmu" type="range" min="0" max="1" step="0.05" value="${GAME.settings.volMusic}"></div>
      <div class="set-row"><label>Reset all progress</label><button class="btn danger" id="set-wipe">DELETE ALL SAVES</button></div>
      <div style="color:var(--dim);font-size:12.5px;margin-top:8px">Quality changes apply fully after returning to the space center.</div>`;
    const d = UI.dialog({ title: 'SETTINGS', body, buttons: [{ label: 'CLOSE', cls: 'acc' }] });
    body.querySelector('#set-q').onchange = e => { GAME.settings.quality = +e.target.value; saveSettings(); };
    const vol = () => {
      GAME.settings.volMaster = +body.querySelector('#set-vm').value;
      GAME.settings.volSfx = +body.querySelector('#set-vs').value;
      GAME.settings.volMusic = +body.querySelector('#set-vmu').value;
      AUDIO.setVolumes(GAME.settings.volMaster, GAME.settings.volSfx, GAME.settings.volMusic);
      saveSettings();
    };
    for (const id of ['#set-vm', '#set-vs', '#set-vmu']) body.querySelector(id).oninput = vol;
    body.querySelector('#set-wipe').onclick = () => UI.confirm('DELETE ALL SAVES', 'Erase all save slots? This cannot be undone.', () => { GAME.wipeSave(); location.reload(); });
  };

  /* ================= MAIN MENU screen ================= */
  const _menuV = new THREE.Vector3();
  const menu = {
    scene: null, cam: null, view: null, stars: null, sun: null, t: 0,
    launchT: 0, padBf: null, padUp: null, padEast: null,

    preload() {
      if (this.scene) return;
      this.scene = new THREE.Scene();
      this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 10, 2e12);
      this.stars = new PG.Stars(this.scene);
      this.sunLight = new THREE.DirectionalLight(0xfff3e0, 2.6);
      this.scene.add(this.sunLight, new THREE.AmbientLight(0x223344, 0.5));
      this.view = new PG.PlanetView(CEL.GAIA, this.scene, { detail: -2, clouds: true, cloudMapMode: true });
      this.sunFx = new PG.SunFX(this.scene);
      this.padBf = CEL.sitePadBf(CEL.KSC.lat, CEL.KSC.lon, _menuV);
      this.padUp = this.padBf.clone().normalize();
      this.padEast = new THREE.Vector3(0, 1, 0).cross(this.padUp).normalize();
      if (this.padEast.lengthSq() < 0.01) this.padEast.set(1, 0, 0);
      this.rocket = new THREE.Group();
      const pod = PARTS.build('sprite'); pod.position.y = 1.55;
      const tank = PARTS.build('s1_1100'); tank.position.y = 0.75;
      const eng = PARTS.build('pixie'); eng.position.y = 0.05;
      this.rocket.add(pod, tank, eng);
      this.rocket.position.copy(this.padBf);
      this.rocket.quaternion.setFromUnitVectors(_menuV.set(0, 1, 0), this.padUp);
      this.view.group.add(this.rocket);
      const plumeTex = PG.glowTex([
        [0, 'rgba(255,255,240,1)'], [0.12, 'rgba(255,220,140,0.9)'],
        [0.35, 'rgba(255,150,60,0.55)'], [0.7, 'rgba(220,80,30,0.15)'], [1, 'rgba(180,50,20,0)'],
      ], 96);
      this.plume = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 1.8, 2.4, 20, 1, true),
        new THREE.MeshBasicMaterial({ map: plumeTex, color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide }));
      this.plume.frustumCulled = false;
      this.plume.renderOrder = 12;
      this.plume.rotation.x = Math.PI;
      this.plume.position.y = -0.2;
      this.plume.visible = false;
      this.rocket.add(this.plume);
      this.smoke = [];
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: PG.glowTex([[0, 'rgba(200,195,188,0.55)'], [0.4, 'rgba(160,150,140,0.25)'], [1, 'rgba(120,110,100,0)']], 64),
          transparent: true, depthWrite: false, opacity: 0,
        }));
        sp.visible = false;
        this.view.group.add(sp);
        this.smoke.push({ s: sp, life: 0 });
      }
    },

    enter() {
      document.getElementById('screen-menu').classList.remove('hidden');
      this.preload();
      this.t = 0;
      if (this.rocket) {
        this.rocket.position.copy(this.padBf);
        this.plume.visible = false;
      }
      const cont = document.getElementById('btn-continue');
      cont.classList.toggle('hidden', !GAME.hasAnySave());
      AUDIO.music(true);
    },

    updateLaunchFx(dt, lift, firing) {
      this.plume.visible = firing;
      if (firing) {
        const flick = 0.85 + Math.random() * 0.3;
        this.plume.scale.set(flick, 0.9 + lift * 0.002 + Math.random() * 0.25, flick);
        this.plume.material.opacity = 0.72 + Math.random() * 0.2;
      }
      if (firing && Math.random() < dt * 14) {
        const sp = this.smoke.find(x => x.life <= 0);
        if (sp) {
          sp.s.position.copy(this.rocket.position);
          sp.s.material.opacity = 0.55;
          sp.s.scale.setScalar(12 + Math.random() * 18);
          sp.s.visible = true;
          sp.life = 1.6 + Math.random() * 0.8;
        }
      }
      for (const sp of this.smoke) {
        if (sp.life <= 0) continue;
        sp.life -= dt;
        sp.s.position.addScaledVector(this.padUp, dt * (8 + lift * 0.02));
        sp.s.material.opacity = Math.max(sp.life / 1.8, 0) * 0.5;
        sp.s.scale.multiplyScalar(1 + dt * 0.35);
        if (sp.life <= 0) sp.s.visible = false;
      }
    },

    update(dt) {
      this.t += dt;
      const R = CEL.GAIA.R;
      const sunDir = new THREE.Vector3(-0.85, 0.06, -0.5).normalize();
      const a = this.t * 0.008 + 2.6;
      this.cam.position.set(Math.cos(a) * R * 2.4, R * 0.55 + Math.sin(this.t * 0.02) * R * 0.1, Math.sin(a) * R * 2.4);
      this.cam.lookAt(-R * 0.35, R * 0.12, 0);
      this.rocket.position.copy(this.padBf);
      this.rocket.quaternion.setFromUnitVectors(_menuV.set(0, 1, 0), this.padUp);
      this.plume.visible = false;

      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
      this.sunLight.position.copy(sunDir).multiplyScalar(1e7);
      this.view.setFrame(new THREE.Vector3(0, 0, 0), this.t * 60, this.cam.position);
      this.view.setSun(sunDir);
      this.view.setCam(this.cam);
      this.view.update(6);
      this.stars.update(this.cam.position, 0.04);
      this.sunFx.update(sunDir.clone().multiplyScalar(5e6), this.cam, sunDir.dot(new THREE.Vector3(-0.35, 0.12, 0)) > -0.05, 0.15);
      GAME.renderer.render(this.scene, this.cam);
    },
    exit() {
      document.getElementById('screen-menu').classList.add('hidden');
      AUDIO.music(false);
    },
  };
  GAME.screens.menu = menu;

  /* ================= AGENCY SETUP screen ================= */
  const agencysetup = {
    enter(args) {
      this.mp = args && args.mp;
      const def = (GAME.save && GAME.save.agency) || GAME.defaultAgency();
      this.flag = Object.assign({}, def.flag);
      this.name = def.name || 'Nova Aerospace';
      const hud = document.getElementById('hud-root');
      this.ui = el('div', '', hud);
      this.ui.id = 'agency-ui';
      this.ui.innerHTML = `
        <div class="ag-title">FOUND YOUR AGENCY</div>
        <div class="ag-sub">Name your space program and design its flag before choosing a launch site.</div>
        <div class="ag-panel">
          <div class="ag-col">
            <div class="set-row"><label>Agency name</label>
              <input id="ag-name" type="text" maxlength="32" value="${this.name}" style="width:240px"></div>
            <div class="set-row"><label>Flag pattern</label>
              <select id="ag-pattern">
                <option value="stripes">Horizontal stripes</option>
                <option value="solid">Solid field</option>
                <option value="diagonal">Diagonal band</option>
                <option value="canton">Canton + emblem</option>
              </select></div>
            <div class="set-row"><label>Field color</label><input id="ag-bg" type="color" value="${this.flag.bg}"></div>
            <div class="set-row"><label>Accent color</label><input id="ag-stripe" type="color" value="${this.flag.stripe}"></div>
            <div class="set-row"><label>Emblem color</label><input id="ag-emblem" type="color" value="${this.flag.emblem}"></div>
          </div>
          <div class="ag-col ag-preview-wrap">
            <div class="ag-preview-label">FLAG PREVIEW</div>
            <canvas id="ag-canvas" width="256" height="160"></canvas>
          </div>
        </div>
        <div class="ag-actions">
          <button class="btn acc" id="ag-go">CONTINUE TO SITE SELECTION</button>
        </div>`;
      this.canvas = this.ui.querySelector('#ag-canvas');
      this.ctx = this.canvas.getContext('2d');
      const redraw = () => {
        this.name = this.ui.querySelector('#ag-name').value.trim() || 'Nova Aerospace';
        this.flag = {
          bg: this.ui.querySelector('#ag-bg').value,
          stripe: this.ui.querySelector('#ag-stripe').value,
          emblem: this.ui.querySelector('#ag-emblem').value,
          pattern: this.ui.querySelector('#ag-pattern').value,
        };
        GAME.drawAgencyFlag(this.ctx, this.canvas.width, this.canvas.height, this.flag);
      };
      this.ui.querySelector('#ag-name').oninput = redraw;
      for (const id of ['ag-bg', 'ag-stripe', 'ag-emblem', 'ag-pattern']) {
        this.ui.querySelector('#' + id).oninput = redraw;
        this.ui.querySelector('#' + id).onchange = redraw;
      }
      this.ui.querySelector('#ag-pattern').value = this.flag.pattern || 'stripes';
      redraw();
      this.ui.querySelector('#ag-go').onclick = () => {
        AUDIO.click();
        const name = this.ui.querySelector('#ag-name').value.trim();
        if (!name) { UI.toast('Name required', 'Give your agency a name.', 'warn'); return; }
        GAME.save.agency = {
          name,
          flag: {
            bg: this.ui.querySelector('#ag-bg').value,
            stripe: this.ui.querySelector('#ag-stripe').value,
            emblem: this.ui.querySelector('#ag-emblem').value,
            pattern: this.ui.querySelector('#ag-pattern').value,
          },
        };
        GAME.save.agencyReady = true;
        GAME._flagTex = null;
        GAME.saveNow();
        UI.toast('Agency founded', name, 'sci');
        GAME.go('sitepick', { mp: this.mp });
      };
    },
    update() { },
    exit() { },
  };
  GAME.screens.agencysetup = agencysetup;
  GAME.goAgencyOrSite = (mp) => {
    if (!GAME.save.agencyReady) GAME.go('agencysetup', { mp });
    else if (!GAME.save.siteChosen) GAME.go('sitepick', { mp });
    else GAME.go('sc');
  };

  /* ================= LAUNCH SITE PICKER screen ================= */
  const sitepick = {
    ensureScene() {
      if (this.scene) return;
      this.scene = new THREE.Scene();
      this.cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1000, 1e10);
      this.stars = new PG.Stars(this.scene, 3000);
      this.scene.add(new THREE.AmbientLight(0x8898b8, 0.6));
      this.sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
      this.sun.position.set(1e7, 4e6, 6e6);
      this.scene.add(this.sun);
      const baked = PG.bakeBodyTexture(CEL.GAIA);
      this.globe = new THREE.Mesh(new THREE.SphereGeometry(CEL.GAIA.R, 96, 64), PG.bodyGlobeMaterial(baked, 0.2));
      this.scene.add(this.globe);
      this.marker = new THREE.Group();
      const pin = new THREE.Mesh(new THREE.ConeGeometry(CEL.GAIA.R * 0.012, CEL.GAIA.R * 0.05, 10), new THREE.MeshBasicMaterial({ color: 0x7adfff }));
      pin.rotation.x = Math.PI;
      pin.position.y = CEL.GAIA.R * 0.028;
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(CEL.GAIA.R * 0.018, CEL.GAIA.R * 0.003, 8, 24), new THREE.MeshBasicMaterial({ color: 0x7adfff }));
      ringM.rotation.x = Math.PI / 2;
      this.marker.add(pin, ringM);
      this.marker.visible = false;
      this.scene.add(this.marker);
      this.remoteMarkers = new THREE.Group();
      this.scene.add(this.remoteMarkers);
      this.ray = new THREE.Raycaster();
    },
    syncRemoteMarkers() {
      if (!this.remoteMarkers) return;
      while (this.remoteMarkers.children.length) this.remoteMarkers.remove(this.remoteMarkers.children[0]);
      if (!this.mp) return;
      for (const st of CEL.remoteSites()) {
        const p = CEL.latLonToBf(st.lat, st.lon).multiplyScalar(CEL.GAIA.R);
        const g = new THREE.Group();
        const pin = new THREE.Mesh(
          new THREE.ConeGeometry(CEL.GAIA.R * 0.01, CEL.GAIA.R * 0.04, 8),
          new THREE.MeshBasicMaterial({ color: 0xffb454 }));
        pin.rotation.x = Math.PI;
        pin.position.y = CEL.GAIA.R * 0.024;
        g.add(pin);
        g.position.copy(p);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
        this.remoteMarkers.add(g);
      }
    },

    enter(args) {
      this.ensureScene();
      this.mp = args && args.mp;
      this.yaw = 0.6; this.pitch = 0.2; this.dist = CEL.GAIA.R * 3.1;
      this.picked = null;
      this.syncRemoteMarkers();
      const sepKm = Math.round(CEL.minSiteSepKm());
      const hud = document.getElementById('hud-root');
      this.ui = el('div', '', hud);
      this.ui.id = 'sitepick-ui';
      this.ui.innerHTML = `
        <div class="sp-title">CHOOSE YOUR LAUNCH SITE</div>
        <div class="sp-sub">Click anywhere on land to found your complex.${this.mp ? ' Other players will see your site.' : ''} Complexes must be at least ${sepKm} km apart.${this.mp ? ' Orange pins mark other players.' : ''}</div>
        <div class="sp-info mono" id="sp-info">—</div>
        <div class="sp-actions">
          <button class="btn acc" id="sp-go" disabled>FOUND COMPLEX HERE</button>
        </div>`;
      this.ui.querySelector('#sp-go').onclick = () => { AUDIO.click(); if (this.picked) this.confirm(this.picked.lat, this.picked.lon); };
      const cv = GAME.renderer.domElement;
      this._down = e => { this.drag = true; this.moved = false; this.lx = e.clientX; this.ly = e.clientY; };
      this._move = e => {
        if (!this.drag) return;
        const dx = e.clientX - this.lx, dy = e.clientY - this.ly;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
        this.yaw -= dx * 0.005; this.pitch = U.clamp(this.pitch + dy * 0.004, -1.3, 1.3);
        this.lx = e.clientX; this.ly = e.clientY;
      };
      this._up = () => this.drag = false;
      this._click = e => { if (!this.moved) this.pick(e); };
      this._wheel = e => { this.dist = U.clamp(this.dist * (e.deltaY > 0 ? 1.12 : 0.89), CEL.GAIA.R * 1.5, CEL.GAIA.R * 8); };
      cv.addEventListener('mousedown', this._down);
      addEventListener('mousemove', this._move);
      addEventListener('mouseup', this._up);
      cv.addEventListener('click', this._click);
      addEventListener('wheel', this._wheel, { passive: true });
    },
    pick(e) {
      this.ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.cam);
      const hit = this.ray.intersectObject(this.globe)[0];
      const info = this.ui.querySelector('#sp-info');
      const go = this.ui.querySelector('#sp-go');
      if (!hit) { this.marker.visible = false; this.picked = null; go.disabled = true; info.textContent = '—'; return; }
      const p = hit.point.clone().normalize();
      const ll = CEL.bfToLatLon(p);
      const h = CEL.heightAt(CEL.GAIA, p);
      const biome = CEL.GAIA.biomes[CEL.biomeAt(CEL.GAIA, p)];
      const onLand = h > 5;
      const conflict = onLand ? CEL.sitePlacementConflict(ll.lat, ll.lon) : null;
      this.marker.position.copy(p).multiplyScalar(CEL.GAIA.R);
      this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p);
      this.marker.visible = true;
      this.picked = onLand && !conflict ? { lat: ll.lat, lon: ll.lon } : null;
      go.disabled = !this.picked;
      if (!onLand) info.textContent = `LAT ${(ll.lat / U.DEG).toFixed(2)}° · LON ${(ll.lon / U.DEG).toFixed(2)}° · ${biome.toUpperCase()} · NEED DRY LAND`;
      else if (conflict) info.textContent = `TOO CLOSE TO ${conflict.toUpperCase()} — NEED ${Math.round(CEL.minSiteSepKm())} KM CLEARANCE`;
      else info.textContent = `LAT ${(ll.lat / U.DEG).toFixed(2)}° · LON ${(ll.lon / U.DEG).toFixed(2)}° · ${biome.toUpperCase()} · VIABLE SITE`;
      AUDIO.blip(this.picked ? 980 : 320, 0.06, 0.08);
    },
    confirm(lat, lon) {
      GAME.save.site = { lat, lon };
      GAME.save.siteChosen = true;
      if (this.mp) {
        GAME.save.mpSetupDone = true;
        if (window.NET && NET.sessionKey) GAME.save.mpSessionKey = NET.sessionKey();
      }
      CEL.setSite(lat, lon);
      if (GAME.screens.sc.resetScene) GAME.screens.sc.resetScene();
      if (window.NET && NET.active) NET.broadcastSite(GAME.save.site);
      GAME.saveNow();
      UI.toast('Complex founded', `LAT ${(lat / U.DEG).toFixed(1)}° LON ${(lon / U.DEG).toFixed(1)}°`, 'sci');
      GAME.go('sc');
    },
    update(dt) {
      this.globe.rotation.y += dt * 0.0;
      const cp = this.pitch, cy = this.yaw;
      this.cam.position.set(Math.cos(cp) * Math.sin(cy) * this.dist, Math.sin(cp) * this.dist, Math.cos(cp) * Math.cos(cy) * this.dist);
      this.cam.lookAt(0, 0, 0);
      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
      this.stars.update(this.cam.position, 0);
      if (this.mp) this.syncRemoteMarkers();
      GAME.renderer.render(this.scene, this.cam);
    },
    exit() {
      const cv = GAME.renderer.domElement;
      cv.removeEventListener('mousedown', this._down);
      removeEventListener('mousemove', this._move);
      removeEventListener('mouseup', this._up);
      cv.removeEventListener('click', this._click);
      removeEventListener('wheel', this._wheel);
    },
  };
  GAME.screens.sitepick = sitepick;

  /* ---------- loading ---------- */
  const TIPS = [
    'Pressurizing fuel lines…', 'Untangling parachute cords…', 'Convincing boosters to point up…',
    'Calibrating the navball…', 'Painting go-faster stripes…', 'Reticulating orbital splines…',
    'Counting down from 10…', 'Warming up the launch pad…', 'Teaching probes about loneliness…',
    'Folding solar panels origami-style…', 'Polishing Selene (it was dusty)…', 'Reading the manual (optional)…',
  ];
  const _warmV = new THREE.Vector3();
  let _partPreIdx = 0;
  const _partPreIds = () => Object.keys(PARTS.CATALOG);

  function preloadSpaceCenter() {
    const sc = GAME.screens.sc;
    sc.ensureScene();
    const bf = CEL.siteGroundBf(CEL.KSC.lat, CEL.KSC.lon);
    const ksc = CEL.bfToInertial(CEL.GAIA, bf, 0, new THREE.Vector3());
    const camGuess = ksc.clone().normalize().multiplyScalar(420);
    camGuess.y += 60;
    sc.view.setFrame(ksc.clone().negate(), 0, camGuess);
    sc.view.setSun(new THREE.Vector3(-0.8, 0.2, -0.5).normalize());
    sc.view.update(32);
    sc.warmed = true;
    GAME.renderer.render(sc.scene, sc.cam);
  }

  function preloadFlight() {
    const fl = GAME.screens.flight;
    fl.ensureScene();
    fl.cam.position.set(0, CEL.GAIA.R + 800, CEL.GAIA.R * 0.4);
    fl.cam.lookAt(0, 0, 0);
    const sun = new THREE.Vector3(0.7, 0.25, -0.5).normalize();
    const center = new THREE.Vector3(0, 0, 0);
    for (const b of CEL.list) {
      const v = fl.views[b.id];
      v.setFrame(center, 0, fl.cam.position);
      v.setSun(sun);
      v.update(4);
    }
    GAME.renderer.render(fl.scene, fl.cam);
  }

  function boot() {
    loadSettings();
    AUDIO.setVolumes(GAME.settings.volMaster, GAME.settings.volSfx, GAME.settings.volMusic);
    initRenderer();
    const fill = document.getElementById('load-fill');
    const tip = document.getElementById('load-tip');
    let prog = 0, tipI = 0, loadStep = 0, warmFrames = 0;
    const tipTimer = setInterval(() => { tip.textContent = TIPS[tipI++ % TIPS.length]; }, 900);
    const setProg = (p, label) => {
      prog = p;
      fill.style.width = (prog * 100).toFixed(0) + '%';
      if (label) tip.textContent = label;
    };

    const warm = () => {
      if (loadStep === 0) {
        const pb = PG.prebakeBodies(20);
        setProg(pb.progress * 0.22, 'Baking planetary surfaces…');
        if (pb.done) loadStep = 1;
        requestAnimationFrame(warm);
        return;
      }
      if (loadStep === 1) {
        menu.preload();
        setProg(0.28, 'Building main menu…');
        loadStep = 2;
        requestAnimationFrame(warm);
        return;
      }
      if (loadStep === 2) {
        preloadSpaceCenter();
        setProg(0.42, 'Warming launch complex…');
        loadStep = 3;
        requestAnimationFrame(warm);
        return;
      }
      if (loadStep === 3) {
        GAME.screens.editor.ensureScene();
        setProg(0.52, 'Stocking the VAB…');
        loadStep = 4;
        requestAnimationFrame(warm);
        return;
      }
      if (loadStep === 4) {
        if (window.MAPVIEW) MAPVIEW.ensure(null);
        setProg(0.62, 'Calibrating tracking station…');
        loadStep = 5;
        requestAnimationFrame(warm);
        return;
      }
      if (loadStep === 5) {
        sitepick.ensureScene();
        setProg(0.70, 'Surveying launch sites…');
        loadStep = 6;
        requestAnimationFrame(warm);
        return;
      }
      if (loadStep === 6) {
        preloadFlight();
        setProg(0.80, 'Preflight systems…');
        loadStep = 7;
        requestAnimationFrame(warm);
        return;
      }
      if (loadStep === 7) {
        const ids = _partPreIds();
        const t0 = performance.now();
        while (_partPreIdx < ids.length && performance.now() - t0 < 14) PARTS.thumbnail(ids[_partPreIdx++]);
        const partP = _partPreIdx / ids.length;
        setProg(0.80 + partP * 0.12, 'Indexing parts catalog…');
        if (_partPreIdx >= ids.length) loadStep = 8;
        requestAnimationFrame(warm);
        return;
      }
      warmFrames++;
      const warmCam = new THREE.Vector3(CEL.GAIA.R * 2.4, CEL.GAIA.R * 0.5, 0);
      const warmSun = new THREE.Vector3(-0.85, 0.06, -0.5).normalize();
      menu.view.setFrame(new THREE.Vector3(0, 0, 0), 0, warmCam);
      menu.view.setSun(warmSun);
      menu.view.setCam(menu.cam);
      menu.view.update(14);
      GAME.renderer.render(menu.scene, menu.cam);
      setProg(0.92 + Math.min(1, warmFrames / 20) * 0.08, 'Final systems check…');
      if (warmFrames < 20) {
        requestAnimationFrame(warm);
        return;
      }
      clearInterval(tipTimer);
      document.getElementById('screen-loading').classList.add('hidden');
      GAME.go('menu');
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(warm);

    /* menu buttons */
    const startCampaign = (slot) => GAME.showCampaignSetup(cfg => { GAME.newGameInSlot(slot, 'campaign', cfg); GAME.go('agencysetup'); });
    document.getElementById('btn-campaign').onclick = () => {
      AUDIO.resume(); AUDIO.click();
      GAME.pickSaveSlot(slot => startCampaign(slot), {
        title: 'CAMPAIGN — SELECT SLOT',
        hint: 'Pick a slot for your new campaign. Existing saves in that slot will be replaced.',
        okLabel: 'START CAMPAIGN',
      });
    };
    document.getElementById('btn-sandbox').onclick = () => {
      AUDIO.resume(); AUDIO.click();
      GAME.pickSaveSlot(slot => {
        const existing = GAME.loadSave(slot);
        if (existing && existing.mode === 'sandbox') {
          GAME.loadSlot(slot, { mpFromSave: false });
          GAME.go('sc');
        } else if (existing) {
          UI.confirm('NEW SANDBOX', 'Replace the save in this slot with a new sandbox?', () => {
            GAME.newGameInSlot(slot, 'sandbox');
            GAME.go('agencysetup');
          });
        } else {
          GAME.newGameInSlot(slot, 'sandbox');
          GAME.go('agencysetup');
        }
      }, {
        title: 'SANDBOX — SELECT SLOT',
        hint: 'Pick a slot. If it already holds a sandbox, you can continue it; otherwise start fresh.',
        confirmOverwrite: false,
        okLabel: 'SELECT',
      });
    };
    document.getElementById('btn-continue').onclick = () => {
      AUDIO.resume(); AUDIO.click();
      const meta = GAME.getSlotsMeta();
      const sm = meta.slots[meta.activeSlot];
      if (sm && !sm.empty) {
        GAME.loadSlot(meta.activeSlot, { mpFromSave: true });
        GAME.go('sc');
        return;
      }
      GAME.showSlotPicker({
        title: 'CONTINUE', mode: 'load',
        hint: 'Your last active slot is empty — pick a slot to load.',
        onSelect: (slot) => { GAME.loadSlot(slot, { mpFromSave: true }); GAME.go('sc'); },
      });
    };
    document.getElementById('btn-multi').onclick = () => {
      AUDIO.resume(); AUDIO.click();
      GAME.showMultiplayerSlotSetup();
    };
    document.getElementById('btn-settings').onclick = () => { AUDIO.resume(); AUDIO.click(); GAME.showSettings(); };
    document.getElementById('btn-help').onclick = () => { AUDIO.resume(); AUDIO.click(); UI.showHelp(); };
    addEventListener('click', () => AUDIO.resume(), { once: true });
    addEventListener('keydown', e => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
        else document.exitFullscreen();
      }
      if (e.key === '`' || e.key === '~') GAME.toggleDebug();
    });
  }

  addEventListener('DOMContentLoaded', boot);
})();
