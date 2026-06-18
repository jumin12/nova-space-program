/* relay.js — dumb WebSocket room relay for NOVA SPACE PROGRAM multiplayer.
   No game logic, no authority: it forwards messages to everyone else in the room.
   Supports a lobby list and optional room passwords — still ~100 lines, still free to host.
   Run locally:   npm install && npm start        (ws://localhost:8765)
   Run on Render: see README.md — deploys as-is.  (wss://your-app.onrender.com) */
'use strict';
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8765;
const MAX_PLAYERS = 4;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('NOVA SPACE PROGRAM relay — connect via WebSocket (wss://this-host)\n');
});
const wss = new WebSocketServer({ server });

/* roomName -> { pass, mode, players: Map<ws, {id, name, site}> } */
const rooms = new Map();

function roster(roomName) {
  const r = rooms.get(roomName);
  if (!r) return [];
  return [...r.players.values()].map(p => ({ id: p.id, name: p.name, site: p.site }));
}
function roomList() {
  return [...rooms.entries()].map(([name, r]) => ({
    room: name, mode: r.mode, count: r.players.size, max: MAX_PLAYERS, locked: !!r.pass,
  }));
}
function broadcast(roomName, msg, except = null) {
  const r = rooms.get(roomName);
  if (!r) return;
  const data = JSON.stringify(msg);
  for (const ws of r.players.keys()) {
    if (ws !== except && ws.readyState === 1) ws.send(data);
  }
}

wss.on('connection', ws => {
  let room = null;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'listRooms') {
      ws.send(JSON.stringify({ t: 'rooms', rooms: roomList() }));
      return;
    }
    if (m.t === 'join') {
      const name = String(m.room || 'session').slice(0, 32);
      let r = rooms.get(name);
      if (!r) {
        /* first joiner founds the room and sets mode + password */
        r = { pass: m.pass ? String(m.pass).slice(0, 64) : '', mode: m.mode || 'sandbox', players: new Map() };
        rooms.set(name, r);
      }
      if (r.pass && r.pass !== (m.pass || '')) { ws.send(JSON.stringify({ t: 'badpass' })); return; }
      if (r.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); return; }
      room = name;
      r.players.set(ws, { id: m.id, name: String(m.name).slice(0, 24), site: m.site });
      ws.send(JSON.stringify({ t: 'joined', room: name, mode: r.mode }));
      broadcast(room, { t: 'roster', players: roster(room) });
      console.log(`[${room}] ${m.name} joined (${r.players.size}/${MAX_PLAYERS})`);
      return;
    }
    if (process.env.DEBUG) console.log(`msg t=${m.t} room=${room}`);
    if (!room) return;
    const r = rooms.get(room);
    const me = r && r.players.get(ws);
    if (!me) return;
    if (m.t === 'site') me.site = m.site;
    if (m.t === 'leave') { ws.close(); return; }
    /* relay everything else, stamped with the sender id */
    m.id = me.id;
    broadcast(room, m, ws);
  });
  ws.on('close', () => {
    if (!room) return;
    const r = rooms.get(room);
    if (!r) return;
    const me = r.players.get(ws);
    r.players.delete(ws);
    if (me) console.log(`[${room}] ${me.name} left (${r.players.size}/${MAX_PLAYERS})`);
    if (r.players.size === 0) rooms.delete(room);
    else broadcast(room, { t: 'roster', players: roster(room) });
  });
});

server.listen(PORT, () => {
  console.log(`NOVA relay listening on :${PORT} (rooms cap: ${MAX_PLAYERS} players, lobby+passwords on)`);
});
