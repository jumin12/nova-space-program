/* ui.js — toasts, dialogs, tooltip, topbar. Global: UI */
'use strict';
const UI = (() => {
  const { el } = U;

  /* ---------- toasts ---------- */
  const recentToasts = new Map();
  function toast(title, sub = '', kind = '', ms = 4200) {
    const now = performance.now();
    if (recentToasts.has(title) && now - recentToasts.get(title) < 3000) return null;
    recentToasts.set(title, now);
    const root = document.getElementById('toast-root');
    if (root.children.length > 7) root.firstChild.remove();
    const t = el('div', 'toast ' + kind, root);
    el('div', 't-title', t, title);
    if (sub) el('div', 't-sub', t, sub);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 420); }, ms);
    return t;
  }

  /* ---------- dialogs (stack) ---------- */
  const dlgStack = [];
  function dialog({ title, body, buttons = [], wide = false, onClose = null, closable = true }) {
    const root = document.getElementById('dialog-root');
    const shade = el('div', 'dlg-shade', root);
    const d = el('div', 'dlg', shade);
    if (wide) d.style.maxWidth = '880px';
    if (title) el('div', 'dlg-head', d, title);
    const bodyEl = el('div', 'dlg-body', d);
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    const close = () => {
      const i = dlgStack.indexOf(entry);
      if (i >= 0) dlgStack.splice(i, 1);
      shade.remove();
      if (onClose) onClose();
    };
    const entry = { close, closable };
    if (buttons.length) {
      const foot = el('div', 'dlg-foot', d);
      for (const b of buttons) {
        const btn = el('button', 'btn ' + (b.cls || ''), foot, b.label);
        btn.onclick = () => { AUDIO.click(); if (b.cb) b.cb(); if (!b.keepOpen) close(); };
      }
    }
    shade.addEventListener('mousedown', e => { if (e.target === shade && closable) close(); });
    dlgStack.push(entry);
    return { close, body: bodyEl, root: d };
  }
  function closeTopDialog() {
    for (let i = dlgStack.length - 1; i >= 0; i--) {
      if (dlgStack[i].closable) { dlgStack[i].close(); return true; }
    }
    return false;
  }
  const hasDialog = () => dlgStack.length > 0;
  function confirm(title, msg, onYes, yesLabel = 'CONFIRM') {
    dialog({ title, body: msg, buttons: [{ label: 'CANCEL' }, { label: yesLabel, cls: 'acc', cb: onYes }] });
  }

  /* ---------- tooltip ---------- */
  const tipEl = () => document.getElementById('tooltip');
  let tipTarget = null;
  function bindTip(target, htmlFn) {
    target.addEventListener('mouseenter', () => {
      tipTarget = target;
      const t = tipEl();
      t.innerHTML = typeof htmlFn === 'function' ? htmlFn() : htmlFn;
      t.classList.remove('hidden');
    });
    target.addEventListener('mouseleave', () => { if (tipTarget === target) { tipTarget = null; tipEl().classList.add('hidden'); } });
  }
  document.addEventListener('mousemove', e => {
    const t = tipEl();
    if (!t || t.classList.contains('hidden')) return;
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + w > innerWidth - 8) x = e.clientX - w - 12;
    if (y + h > innerHeight - 8) y = e.clientY - h - 12;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  });

  /* ---------- career topbar ---------- */
  let topbarEl = null;
  function topbar(show) {
    if (!show) { if (topbarEl) topbarEl.remove(); topbarEl = null; return; }
    if (topbarEl) return;
    topbarEl = el('div', '', document.getElementById('hud-root'));
    topbarEl.id = 'topbar';
    topbarEl.innerHTML = `
      <div class="tb-item tb-funds"><span class="ico">⛁</span><span id="tb-funds">—</span></div>
      <div class="tb-item tb-sci"><span class="ico">⚛</span><span id="tb-sci">—</span></div>
      <div class="tb-item tb-ut mono" id="tb-ut">UT —</div>`;
  }
  function updateTopbar() {
    if (!topbarEl || !window.GAME || !GAME.save) return;
    const s = GAME.save;
    const f = document.getElementById('tb-funds');
    if (f) f.textContent = s.mode === 'sandbox' ? '∞' : U.fmtFunds(s.funds).replace('₢ ', '');
    const sc = document.getElementById('tb-sci');
    if (sc) sc.textContent = s.mode === 'sandbox' ? '∞' : Math.floor(s.sci);
    const ut = document.getElementById('tb-ut');
    if (ut) ut.textContent = 'UT ' + U.fmtTime(GAME.ut);
  }

  /* ---------- help dialog ---------- */
  function showHelp() {
    const k = (a, b) => `<div class="hk"><span>${a}</span><b>${b}</b></div>`;
    dialog({
      title: 'HOW TO PLAY', wide: true,
      body: `
      <div class="help-cols">
        <div style="flex:1">
          <div class="help-h">GETTING STARTED</div>
          <div style="color:var(--dim);font-size:13.5px;line-height:1.5">
          Build a rocket in the <b>VAB</b> (start with a pod, add a parachute, tank, engine).
          Launch it, fly it, recover it. Spend Science in <b>R&D</b> to unlock parts, and complete
          contracts from <b>Mission Control</b> to earn funds.<br><br>
          To reach orbit: launch straight up, then tip eastward (D key) gradually — about 45° by 12 km —
          and burn until your <b>apoapsis</b> (map view) reaches ~80 km. Coast to apoapsis, then burn
          prograde until your periapsis rises above 72 km. Welcome to space.</div>
          <div class="help-h">FLIGHT</div>
          ${k('Throttle', 'Shift / Ctrl')}${k('Full / cut throttle', 'Z / X')}
          ${k('Pitch / yaw', 'W S / A D')}${k('Roll', 'Q E')}
          ${k('Stage', 'Space')}${k('SAS toggle', 'T')}${k('RCS toggle', 'R')}
          ${k('RCS translate', 'I J K L H N')}${k('Landing legs', 'G')}${k('Lights', 'U')}
        </div>
        <div style="flex:1">
          <div class="help-h">TIME & VIEWS</div>
          ${k('Map view', 'M')}${k('Time warp ±', ', / .')}${k('Physics warp', 'Alt + .')}
          ${k('Camera mode / exit feeds', 'V')}${k('IVA cockpit', 'C')}
          ${k('Board from EVA', 'B')}${k('Pause menu', 'Esc')}
          ${k('Quicksave / load', 'F5 / F9')}${k('Fullscreen', 'F')}
          <div class="help-h">EDITOR</div>
          ${k('Place / pick part', 'Left click')}${k('Delete held part', 'Del or right-click')}
          ${k('Symmetry', 'X')}${k('Angle snap', 'S')}${k('Rotate held part', 'Q / E')}
          <div class="help-h">PROBES, RELAYS & CREWS</div>
          <div style="color:var(--dim);font-size:13.5px;line-height:1.5">
          Probes need <b>electric charge</b> and (in campaign) a <b>signal path</b> to Mission Control —
          planets block line-of-sight, so loft relay-dish satellites to stay connected. Crews need
          <b>supplies</b> and fear <b>radiation</b>: watch the ☢ meter, avoid the belts, shelter behind
          Storm Cellar lining. Right-click a nav camera for the CRT feed, or a telescope to stargaze.</div>
          <div class="help-h">DOCKING</div>
          <div style="color:var(--dim);font-size:13.5px;line-height:1.5">
          Fit matching Clamp-Ports on two craft. Fly within 2.5 km and the other vessel loads
          physically — approach under 2 m/s with ports facing each other and the magnets do the rest.
          Right-click a docked port to undock.</div>
          <div class="help-h">MANEUVER NODES</div>
          <div style="color:var(--dim);font-size:13.5px;line-height:1.5">
          In map view, click a point on your orbit to add a node. Use the node panel to plan a burn,
          then point at the blue marker on the navball and burn when the countdown reaches zero.</div>
          <div class="help-h">SCIENCE</div>
          <div style="color:var(--dim);font-size:13.5px;line-height:1.5">
          Right-click parts in flight to run experiments. Different biomes, altitudes and worlds give
          different results. Transmit (60%) with an antenna, or recover the vessel for full value.</div>
        </div>
      </div>`,
      buttons: [{ label: 'GOT IT', cls: 'acc' }],
    });
  }

  return { toast, dialog, confirm, closeTopDialog, hasDialog, bindTip, topbar, updateTopbar, showHelp };
})();
