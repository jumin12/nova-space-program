# Deploying NOVA SPACE PROGRAM on Render

This project has two parts:

| Part | What it is | Render service type |
|------|------------|---------------------|
| **Game client** | Static HTML/JS (`index.html`, `js/`, `css/`, `vendor/`) | **Static Site** |
| **Multiplayer relay** | Tiny WebSocket forwarder (`server/relay.js`) | **Web Service** (Node) |

Single-player works with only the static site. Multiplayer needs **both** services.

---

## Step 1 — GitHub repository

The game lives in the GitHub repo **nova-space-program**:

https://github.com/jumin12/nova-space-program

To clone locally:

```bash
git clone https://github.com/jumin12/nova-space-program.git
cd nova-space-program
```

---

## Step 2 — Deploy with Render Blueprint (recommended)

1. Create a free account at [render.com](https://render.com) if you don't have one.
2. Open **Dashboard → New → Blueprint**.
3. Connect the **nova-space-program** GitHub repository.
4. Render reads `render.yaml` and creates two services:
   - `nova-relay` — Node WebSocket relay
   - `nova-space-program` — static game site
5. Click **Apply**. Wait for both deploys to finish (relay ~2 min, static site ~1 min).
6. Note the public URLs Render assigns, e.g.:
   - Game: `https://nova-space-program.onrender.com`
   - Relay: `https://nova-relay.onrender.com`

---

## Step 3 — Wire multiplayer to your relay

1. Open `js/config.js` in the repo.
2. Set the relay URL (use **`wss://`**, not `https://`):

```javascript
window.NSP_CONFIG = window.NSP_CONFIG || {
  relayUrl: 'wss://nova-relay.onrender.com',
};
```

Replace `nova-relay` with your actual Render service name if different.

3. Commit and push — Render redeploys the static site automatically.

Players can still override the relay URL in the in-game **MULTIPLAYER** dialog; the config value is just the default.

---

## Step 4 — Verify single-player

1. Open your game URL: `https://nova-space-program.onrender.com`
2. Choose **SANDBOX** or **CAMPAIGN**.
3. Build a rocket in the VAB and launch.
4. Saves are stored in the browser (localStorage) — each device has its own saves.

No relay server is required for single-player.

---

## Step 5 — Verify multiplayer

### Host a session

1. Open the game URL in your browser.
2. Click **MULTIPLAYER**.
3. Confirm **Relay server** shows `wss://nova-relay.onrender.com` (or your relay URL).
4. Enter a **Callsign**.
5. Under **HOST A NEW SESSION**:
   - Session name: e.g. `launch-club`
   - Password: optional
   - Mode: Sandbox / Co-op / Race
6. Click **HOST SESSION**.

### Join from another browser (or friend)

1. Open the same game URL (incognito window, phone, or another PC).
2. **MULTIPLAYER** → **BROWSE SESSIONS** (uses the relay URL).
3. Click **JOIN** on your session (enter password if set).
4. Each player places their launch complex on the globe when prompted.
5. You should see each other's vessels when flying nearby.

### LAN / local testing (no Render)

Terminal 1 — relay:

```bash
cd server
npm install
npm start
```

Terminal 2 — game:

```bash
python -m http.server 8080
```

Open `http://localhost:8080`, set relay to `ws://localhost:8765`.

---

## Manual deploy (without Blueprint)

### Static game site

1. **New → Static Site** → connect repo.
2. **Branch**: `master` (or `main`).
3. **Root Directory**: leave blank (repo root).
4. **Build Command**: `echo "static"` (or leave empty).
5. **Publish Directory**: `.`
6. Deploy.

### WebSocket relay

1. **New → Web Service** → same repo.
2. **Root Directory**: `server`
3. **Runtime**: Node
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`
6. **Instance Type**: Free
7. **Health Check Path**: `/`
8. Deploy.

---

## Render free-tier notes

- **Relay sleeps** after ~15 minutes with no connections. First player to connect wakes it (~30 seconds).
- **WebSockets** work on Render web services — use `wss://` from HTTPS game pages.
- Relay holds **no game state** and supports up to **4 players per room**.
- Rooms are ephemeral — when everyone leaves, the room is deleted.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Multiplayer can't connect | Use `wss://` not `https://`. Check relay service is running (visit relay URL in browser — should show a text message). |
| Browse sessions empty | Relay may be waking up — wait 30s and try again. Host a session first. |
| Wrong password | Host must share the exact password; passwords are case-sensitive. |
| Players don't see each other | Fly within ~40 km; warp locks when nearby. Ensure both joined the **same room name**. |
| Game loads but is slow | Enable hardware acceleration in browser settings. Chromium-based browsers work best. |

---

## Security

The relay forwards JSON messages between clients — it does not validate game actions. Treat public rooms as untrusted. Use **passwords** for private sessions.
