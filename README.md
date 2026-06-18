# NOVA SPACE PROGRAM v4.0

A complete 3D space-program game that runs **offline, in your browser, from a single file**.
Double-click `index.html` — that's the whole install. Every planet, part, texture, and sound is
generated procedurally from code at runtime.

---

## Quick start

1. Open `index.html` in Chrome, Edge, or Firefox.
2. Pick **CAMPAIGN** (full progression with customizable difficulty), **SANDBOX** (everything
   unlocked), or **MULTIPLAYER** (see below).
3. New campaigns let you **place your launch complex anywhere on the planet** — click the globe.
4. Build something in the **VAB** (or a plane in the **HANGAR**), then fly it.

Press `?` at the space complex for the full tutorial and controls.

## What's inside

- **A 16-body solar system** at proper scale: terrestrial worlds, an ocean moon, a ringed gas
  giant, ice worlds, an asteroid belt, radiation belts, and auroras over the poles.
- **Quadtree LOD planets** with biomes (16 on Gaia alone), procedural trees, boulders, city
  lights on the night side, volumetric cloud decks, and shader oceans.
- **Real orbital mechanics** — patched conics, maneuver nodes, encounter prediction, SOI
  handoffs, time warp on rails, and a full-3D map with textured worlds (also powering the
  Tracking Station).
- **6-DOF flight physics** — per-part aero, lift, reentry heating with ablative shields,
  parachutes, landing legs, rolling gear, RCS, SAS modes, gimbal steering.
- **A probe-first campaign** — sounding rockets → orbital probes → crewed capsules, across a
  34-node tech tree, with milestones, a science archive, and 12 experiment types (film cameras,
  geiger counters, telescopes, gravimeters, EVA reports…).
- **A living contract board** — Mission Control offers rotating procedural missions: altitude
  and speed records, part field tests, satellite deployments to specific orbits, biome
  touchdowns, and crewed flights — accept up to three and they complete themselves in flight.
- **A debug console on `~`** — aero force vectors, thermal overlay, infinite fuel, no-damage,
  orbit teleport, and more, for tinkering like an engineer.
- **Hardcore survival systems** (all toggleable in campaign setup): electric charge, solar
  power with occlusion, crew supplies, radiation belts and solar storms, crew dose tracking,
  ignition failures, hardcore permadeath.
- **Onboard camera view** — fly probes from a CRT mission-control feed (with real static when
  your relay link drops); **telescope view** — aim a space telescope and observe distant worlds
  for science; **IVA** — a working cockpit with live gauges; **EVA** — spacewalk, plant flags,
  take samples, jetpack around.
- **Satellite relay networks** — antennas have ranges, planets block line-of-sight, and probes
  need a signal path to Mission Control to transmit science (and to be controlled at all, if
  you enable it). Launch relay-dish constellations to cover the far side and deep space.
- **Orbital docking** — rendezvous with any of your vessels: they load physically when you get
  close. Align matching clamp-ports, drift in slowly, and the magnetic capture clicks them into
  one ship (crew transfers too). Undock from the part menu to split them apart again.
- **Tracking station map modes** — orbits, the live comm network (links colored by strength),
  and radiation belt overlays.
- **Aviation** — wings, elevons, turbofans, rolling gear, a hangar, and a lit runway.
- **Multiplayer for up to 4 players** — lobby browser, optional session passwords, and other
  players rendered as their **real ships** (see below).

## Multiplayer

Multiplayer uses a tiny **relay server** — it holds no game state and makes no decisions; it
just forwards messages between the players in a session. Anyone can host one, and one relay
serves many sessions at once: players open the game, press **MULTIPLAYER → BROWSE SESSIONS**,
and join any open room (or host their own, optionally with a **password**). Other players show
up in your world as their **actual ships**, kept in sync as they stage and dock.

### Modes

| Mode | Description |
|---|---|
| **Race to Space** | Separate agencies and funds. Everyone sees milestone banners — first to the moons wins bragging rights. |
| **Co-op** | One shared agency: funds, science, and research unlocks are pooled across all players. |
| **Sandbox** | Everything unlocked. Fly together, build together, crash together. |

### Rules of time

Every player runs **their own clock and their own time warp**. Warp locks automatically while
another player's vessel is within 40 km of yours, so close encounters stay synchronized.
Each player **places their own launch complex** on the globe when joining a session for the
first time — visit each other!

### Hosting the relay locally (LAN play)

```bash
cd server
npm install
npm start            # listens on ws://localhost:8765
```

Players on your network join with `ws://YOUR-LAN-IP:8765`.

### Hosting on Render (internet play, free)

Full step-by-step setup (static game site + multiplayer relay) is in **[DEPLOY.md](DEPLOY.md)**.

Quick summary:

1. Push this repo to GitHub (`nova-space-program`).
2. On [render.com](https://render.com) → **New → Blueprint** → connect the repo (`render.yaml` deploys both services).
3. Set `js/config.js` → `relayUrl: 'wss://your-relay.onrender.com'` and push again.
4. Share the static site URL for single-player and multiplayer.

Notes: Render's free relay tier sleeps after ~15 minutes of inactivity (~30s wake time).
Use **`wss://`** (not `https://`) for the relay URL. Up to 4 players per room.

## Controls (essentials)

| Action | Key |
|---|---|
| Throttle / cut / full | `Shift` `Ctrl` / `X` / `Z` |
| Pitch / yaw / roll | `W S` / `A D` / `Q E` |
| Stage | `Space` |
| SAS / RCS / gear / lights | `T` / `R` / `G` / `U` |
| Map | `M` |
| Time warp / physics warp | `,` `.` / `Alt+.` |
| Camera mode · IVA · exit special views | `V` · `C` · `V` |
| EVA board | `B` |
| Quicksave / quickload | `F5` / `F9` |
| Editor: symmetry / angle snap | `X` / `S` |

## Tech notes

- Pure JavaScript + Three.js (bundled locally), zero build tools, zero network dependencies in
  single-player. Saves live in your browser's local storage.
- The multiplayer relay (`server/relay.js`) is ~80 lines of `ws` — read it before you trust it.
- Runs best in Chromium-based browsers with hardware acceleration enabled.
