/* net.js — lightweight multiplayer over a dumb WebSocket relay (no authoritative server).
   Lobby browser + optional room passwords; other players render as their REAL vessels.
   Modes: race (separate agencies), coop (shared funds/science/tech), sandbox (free play).
   Each player keeps their own clock; warp is locked near other players. Global: NET */
'use strict';
const NET = (() => {
  const N = {
    active: false, ws: null, room: '', name: '', mode: 'sandbox',
    players: new Map(),          // id -> {name, color, site, lastState, craft, ghost}
    id: 'p' + Math.random().toString(36).slice(2, 8),
    sendAcc: 0, craftAcc: 0, lastCraftSig: '', chatLog: [],
    colors: ['#7adfff', '#ffb454', '#d670e8', '#a8e34d'],
    pendingJoin: null, listCb: null,
  };

  /* ---------- low-level connection ---------- */
  function open(url, onReady, onFail) {
    if (N.ws && N.ws.readyState === 1 && N.url === url) { onReady(); return; }
    try {
      if (N.ws) { N.ws.onclose = null; N.ws.close(); }
      const ws = new WebSocket(url);
      N.ws = ws; N.url = url;
      let opened = false;
      ws.onopen = () => { opened = true; onReady(); };
      ws.onerror = () => { if (!opened) onFail && onFail('Could not reach the relay. Check the URL.'); };
      ws.onclose = () => {
        if (N.active) UI.toast('Disconnected', 'Lost connection to the session relay.', 'warn');
        N.active = false;
        clearGhosts();
        N.players.clear();
        updateLobbyUi();
      };
      ws.onmessage = ev => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        handle(m);
      };
    } catch (e) { onFail && onFail('Bad relay URL.'); }
  }
  function send(obj) {
    if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(obj));
  }
  function listRooms(url, cb, onFail) {
    open(url, () => { N.listCb = cb; send({ t: 'listRooms' }); }, onFail);
  }
  function join(url, room, name, mode, pass, onResult) {
    open(url, () => {
      N.pendingJoin = { room, name, mode, onResult };
      send({ t: 'join', room, id: N.id, name, mode, pass: pass || '', site: GAME.save && GAME.save.site });
    }, err => onResult && onResult(err));
  }
  function disconnect() {
    if (N.ws) { send({ t: 'leave' }); N.ws.close(); }
    N.active = false;
    clearGhosts();
    N.players.clear();
  }

  /* ---------- message handling ---------- */
  function handle(m) {
    switch (m.t) {
      case 'rooms':
        if (N.listCb) { N.listCb(m.rooms); N.listCb = null; }
        break;
      case 'joined': {
        const pj = N.pendingJoin;
        N.pendingJoin = null;
        N.room = m.room; N.mode = m.mode; N.active = true;
        if (pj) { N.name = pj.name; pj.onResult && pj.onResult(null, m.mode); }
        UI.toast('Connected', `Session “${m.room}” · ${String(m.mode).toUpperCase()}`, 'sci');
        updateLobbyUi();
        break;
      }
      case 'badpass':
        if (N.pendingJoin) { const pj = N.pendingJoin; N.pendingJoin = null; pj.onResult && pj.onResult('Wrong password for that session.'); }
        break;
      case 'full':
        if (N.pendingJoin) { const pj = N.pendingJoin; N.pendingJoin = null; pj.onResult && pj.onResult('That session is full (4 players).'); }
        break;
      case 'roster': {
        const seen = new Set();
        for (const p of m.players) {
          if (p.id === N.id) continue;
          seen.add(p.id);
          if (!N.players.has(p.id)) {
            N.players.set(p.id, { name: p.name, site: p.site, color: N.colors[N.players.size % N.colors.length] });
            UI.toast('Player joined', p.name, '');
            if (p.site) CEL.addRemoteSite(p.site.lat, p.site.lon, p.name);
            /* introduce ourselves: share our craft right away */
            N.lastCraftSig = '';
          }
        }
        for (const id of [...N.players.keys()]) {
          if (!seen.has(id)) {
            const p = N.players.get(id);
            UI.toast('Player left', p.name, '');
            dropGhost(p);
            N.players.delete(id);
          }
        }
        updateLobbyUi();
        break;
      }
      case 'state': {
        const p = N.players.get(m.id);
        if (p) p.lastState = m.s;
        break;
      }
      case 'craft': {
        const p = N.players.get(m.id);
        if (p) { p.craft = m.craft; p.craftDirty = true; }
        break;
      }
      case 'chat': {
        const p = N.players.get(m.id);
        pushChat((p ? p.name : '???') + ': ' + m.text);
        UI.toast('💬 ' + (p ? p.name : '???'), m.text, '', 4000);
        break;
      }
      case 'milestone': {
        const p = N.players.get(m.id);
        if (N.mode === 'race') UI.toast('🏁 ' + (p ? p.name : '???'), m.name, 'sci', 6000);
        break;
      }
      case 'coop': {
        if (N.mode !== 'coop') break;
        if (m.kind === 'funds') { GAME.save.funds += m.amt; UI.updateTopbar(); }
        if (m.kind === 'sci') { GAME.save.sci += m.amt; UI.updateTopbar(); }
        if (m.kind === 'tech' && !GAME.save.tech.includes(m.tech)) {
          GAME.save.tech.push(m.tech);
          const p = N.players.get(m.id);
          UI.toast('Research shared', (p ? p.name : 'Teammate') + ' unlocked ' + (CAREER.TECH[m.tech] ? CAREER.TECH[m.tech].name : m.tech), 'sci');
        }
        GAME.saveNow();
        break;
      }
      case 'site': {
        const p = N.players.get(m.id);
        if (p) { p.site = m.site; CEL.addRemoteSite(m.site.lat, m.site.lon, p.name); }
        break;
      }
    }
  }
  function pushChat(line) {
    N.chatLog.push(line);
    if (N.chatLog.length > 60) N.chatLog.shift();
  }

  /* ---------- game hooks ---------- */
  function onScience(amount, what) { if (N.mode === 'coop') send({ t: 'coop', kind: 'sci', amt: amount }); }
  function onFunds(amount) { if (N.mode === 'coop') send({ t: 'coop', kind: 'funds', amt: amount }); }
  function onTech(techId) { if (N.mode === 'coop') send({ t: 'coop', kind: 'tech', tech: techId }); }
  function onContract(c) { send({ t: 'milestone', name: c.name }); }
  function broadcastSite(site) { send({ t: 'site', site }); }

  /* ---------- flight integration: state + REAL vessel ghosts ---------- */
  const _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3();
  function tickFlight(fl, dt) {
    N.sendAcc += dt;
    if (N.sendAcc > 0.25) {
      N.sendAcc = 0;
      send({
        t: 'state', s: {
          name: fl.flightName, body: fl.body.id,
          r: [fl.r.x, fl.r.y, fl.r.z], q: fl.quat.toArray(),
          landed: fl.landed, alt: Math.round(fl.alt || 0), parts: fl.vessel.parts.size,
        },
      });
    }
    /* craft sync: share our real ship whenever it changes (staging, docking, …) */
    N.craftAcc += dt;
    if (N.craftAcc > 2) {
      N.craftAcc = 0;
      const sig = fl.vessel.parts.size + ':' + fl.vessel.root + ':' + fl.flightName;
      if (sig !== N.lastCraftSig) {
        N.lastCraftSig = sig;
        send({ t: 'craft', craft: fl.vessel.serialize() });
      }
    }
    for (const [id, p] of N.players) {
      const s = p.lastState;
      if (!s || s.body !== fl.body.id) { hideGhost(p); continue; }
      if (!p.ghost || p.craftDirty) makeGhost(p, fl.scene);
      p.ghost.group.visible = true;
      p.ghost.label.visible = true;
      const gpos = _g1.set(s.r[0], s.r[1], s.r[2]).sub(fl.r);
      p.ghost.group.position.copy(gpos);
      p.ghost.group.quaternion.fromArray(s.q);
      const d = gpos.length();
      p.ghost.label.position.copy(gpos);
      p.ghost.label.position.y += Math.max(d * 0.04, 4);
      const ls = Math.max(d * 0.045, 2.4);
      p.ghost.label.scale.set(ls * p.ghost.label.userData.aspect, ls, 1);
      p.ghost.glow.scale.setScalar(Math.max(d * 0.015, 2));
      p.ghost.glow.material.opacity = U.clamp(d / 800, 0, 0.8);
    }
  }
  function makeGhost(p, scene) {
    dropGhost(p);
    p.craftDirty = false;
    const group = new THREE.Group();
    let built = false;
    if (p.craft) {
      try {
        const vv = Vessel.deserialize(p.craft);
        group.add(vv.buildGroup().group);
        built = true;
      } catch (e) { /* fall through to marker */ }
    }
    if (!built) {
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color), roughness: 0.5, metalness: 0.3 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.4, 12), mat);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1, 12), mat);
      nose.position.y = 1.7;
      group.add(body, nose);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: PG.glowTex([[0, p.color + 'ff'], [0.4, p.color + '88'], [1, p.color + '00']], 64),
      transparent: true, depthTest: false, blending: THREE.AdditiveBlending,
    }));
    glow.renderOrder = 30;
    group.add(glow);
    const label = U.textSprite('◆ ' + p.name, { size: 36, color: p.color, bg: 'rgba(8,12,18,0.7)' });
    label.renderOrder = 31;
    scene.add(group, label);
    p.ghost = { group, glow, label };
    return p.ghost;
  }
  function hideGhost(p) {
    if (p.ghost) { p.ghost.group.visible = false; p.ghost.label.visible = false; }
  }
  function dropGhost(p) {
    if (p.ghost) {
      if (p.ghost.group.parent) p.ghost.group.parent.remove(p.ghost.group);
      if (p.ghost.label.parent) p.ghost.label.parent.remove(p.ghost.label);
      p.ghost = null;
    }
  }
  function clearGhosts() { for (const p of N.players.values()) dropGhost(p); }
  function nearOther(fl) {
    for (const p of N.players.values()) {
      const s = p.lastState;
      if (!s || s.body !== fl.body.id) continue;
      if (_g1.set(s.r[0], s.r[1], s.r[2]).sub(fl.r).length() < 40000) return true;
    }
    return false;
  }

  /* ---------- lobby UI: browse / host / join with password ---------- */
  function openLobby() {
    const cfgRelay = (window.NSP_CONFIG && window.NSP_CONFIG.relayUrl) || '';
    const lastUrl = localStorage.getItem('nsp_relay') || cfgRelay || 'ws://localhost:8765';
    const lastName = localStorage.getItem('nsp_callsign') || 'Pilot-' + (Math.random() * 90 + 10 | 0);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="set-row"><label>Relay server</label><input id="mp-url" type="text" value="${lastUrl}" placeholder="wss://your-relay.onrender.com" style="width:280px"></div>
      <div class="set-row"><label>Callsign</label><input id="mp-name" type="text" value="${lastName}" style="width:160px"></div>
      <div style="display:flex;gap:8px;margin:10px 0 6px">
        <button class="btn acc" id="mp-browse">⟳ BROWSE SESSIONS</button>
        <span id="mp-status" style="color:var(--warn);font-size:13px;align-self:center"></span></div>
      <div id="mp-roomlist" class="mp-roomlist"><div style="color:var(--dim);padding:10px">Press BROWSE to list open sessions on the relay.</div></div>
      <hr style="border-color:#1d2935">
      <div style="font-weight:700;letter-spacing:.12em;color:var(--acc);margin-bottom:6px">HOST A NEW SESSION</div>
      <div class="set-row"><label>Session name</label><input id="mp-room" type="text" value="launch-club" style="width:160px"></div>
      <div class="set-row"><label>Password <span style="color:var(--dim);font-size:11px">(optional)</span></label><input id="mp-pass" type="text" value="" style="width:160px"></div>
      <div class="set-row"><label>Mode</label>
        <select id="mp-mode">
          <option value="race">Race to Space — separate agencies, shared glory</option>
          <option value="coop">Co-op — shared funds, science & research</option>
          <option value="sandbox" selected>Sandbox — everything unlocked, fly together</option>
        </select></div>
      <div style="color:var(--dim);font-size:12.5px;margin-top:6px;line-height:1.5">
        Up to 4 players · everyone keeps their <b>own time controls</b> (warp locks within 40 km of
        another player) · other players appear as their <b>real vessels</b> · new players place their
        own launch complex. Relay hosting guide is in the README (free on Render).</div>`;
    const dlg = UI.dialog({
      title: 'MULTIPLAYER', body,
      buttons: [
        { label: 'CLOSE' },
        {
          label: 'HOST SESSION', cls: 'acc', keepOpen: true, cb: () => {
            doJoin(body.querySelector('#mp-room').value.trim() || 'launch-club', body.querySelector('#mp-pass').value, body.querySelector('#mp-mode').value);
          },
        },
      ],
    });
    const status = msg => { const s = body.querySelector('#mp-status'); if (s) s.textContent = msg || ''; };
    const doJoin = (room, pass, mode) => {
      const url = body.querySelector('#mp-url').value.trim();
      const name = body.querySelector('#mp-name').value.trim() || 'Pilot';
      localStorage.setItem('nsp_relay', url);
      localStorage.setItem('nsp_callsign', name);
      status('Connecting…');
      join(url, room, name, mode, pass, (err, actualMode) => {
        if (err) { status(err); return; }
        dlg.close();
        afterJoin(actualMode || mode);
      });
    };
    body.querySelector('#mp-browse').onclick = () => {
      const url = body.querySelector('#mp-url').value.trim();
      localStorage.setItem('nsp_relay', url);
      status('Fetching sessions…');
      listRooms(url, rooms => {
        status('');
        const list = body.querySelector('#mp-roomlist');
        if (!rooms.length) { list.innerHTML = '<div style="color:var(--dim);padding:10px">No open sessions — host one below!</div>'; return; }
        list.innerHTML = '';
        for (const r of rooms) {
          const row = document.createElement('div');
          row.className = 'mp-room';
          row.innerHTML = `<span class="mp-room-name">${r.locked ? '🔒 ' : ''}${r.room}</span>
            <span class="mp-room-meta">${String(r.mode).toUpperCase()} · ${r.count}/${r.max}</span>
            <button class="btn tiny acc">JOIN</button>`;
          row.querySelector('button').onclick = () => {
            if (r.locked) {
              const pw = document.createElement('div');
              pw.innerHTML = `<div class="set-row"><label>Password for “${r.room}”</label><input id="mp-pw2" type="text" style="width:160px"></div>`;
              UI.dialog({
                title: 'PASSWORD REQUIRED', body: pw,
                buttons: [{ label: 'CANCEL' }, { label: 'JOIN', cls: 'acc', cb: () => doJoin(r.room, pw.querySelector('#mp-pw2').value, r.mode) }],
              });
            } else doJoin(r.room, '', r.mode);
          };
          list.appendChild(row);
        }
      }, err => status(err));
    };
  }
  function afterJoin(mode) {
    if (!GAME.save || (mode === 'sandbox') !== (GAME.save.mode === 'sandbox')) {
      GAME.newGame(mode === 'sandbox' ? 'sandbox' : 'campaign', GAME.save && GAME.save.cfg);
    }
    if (!GAME.save.siteChosen) GAME.go('sitepick', { mp: true });
    else GAME.go('sc');
  }
  function updateLobbyUi() {
    const elx = document.getElementById('mp-roster');
    if (!elx) return;
    const rows = [`<b style="color:var(--acc)">${N.name} (you)</b>`];
    for (const p of N.players.values()) rows.push(`<span style="color:${p.color}">${p.name}</span>`);
    elx.innerHTML = N.active ? `◉ ${N.room} · ${N.mode.toUpperCase()}<br>` + rows.join(' · ') : '';
  }
  function sendChat(text) { send({ t: 'chat', text }); pushChat(N.name + ': ' + text); }

  return {
    get active() { return N.active; }, get mode() { return N.mode; }, get players() { return N.players; },
    get ws() { return N.ws; },
    open, join, listRooms, disconnect, openLobby, tickFlight, nearOther, clearGhosts,
    onScience, onFunds, onTech, onContract, broadcastSite, sendChat, updateLobbyUi,
  };
})();
/* top-level const does NOT create window.NET — the in-game `window.NET &&` guards need it */
window.NET = NET;
