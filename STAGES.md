# Orbital Frontier — Stage Roadmap

Implementation tracker aligned with `designdoc.txt`. Each stage builds on the previous.

## Stage 0 — Prototype Foundation [DONE] (playable)

**Goal:** Prove browser core loop — build, launch, physics, suborbital space, telemetry, multiplayer presence.

| Feature | Status |
|---------|--------|
| Kerbin-scale planet (600 km, 70 km atmosphere) | done |
| KSP-scale parts (1.25 m / 2.5 m) | done |
| ISP physics, staging, pad hold | done |
| Main menu + game mode select | done |
| Agency creation (name, emblem, colors) | done |
| 3D Kerbin Space Center (VAB, LC-1, tracking, runway) | done |
| 3D VAB hangar with orbit camera | done |
| Click-to-select parts, undo/redo | done |
| Launch pad preflight + Shift/Space controls | done |
| Flight HUD + navball | done |
| Colyseus multiplayer / offline fallback | done |
| Telemetry save | done |

**Not in Stage 0 (by design doc):** full part joints, research, moon, time warp, map view.

---

## Stage 1 — Early Space Program Campaign [IN PROGRESS] (next)

**Goal:** First complete game — moon, research, missions, science, progression to ~90-science tier.

### Milestone A — Agency & Persistence
- [ ] Server-side agency profiles
- [ ] Multiplayer agency roster
- [ ] Save/load campaigns

### Milestone B — Full VAB (designdoc §18.8)
- [x] 3D workspace + orbit camera
- [x] Part categories + selection
- [x] Undo/redo
- [x] Drag-and-drop attachment nodes
- [ ] Symmetry ( radial / quad )
- [ ] Subassemblies
- [ ] Delta-v calculator
- [ ] Engineering warnings overlay
- [ ] CoM / CoT / CoL markers

### Milestone C — Space Center World
- [x] 3D facility layout on Kerbin
- [ ] Clickable facility hotspots
- [ ] Facility upgrade levels (§18.11)
- [ ] Administration screen

### Milestone D — Flight & Map
- [ ] Map view (patched conics)
- [ ] Maneuver nodes
- [ ] SAS / stability assist toggle
- [ ] Low-altitude KSC visible during ascent

### Milestone E — Moon & Orbit
- [ ] Mun-like moon
- [ ] SOI transitions
- [ ] Lunar landing missions

### Milestone F — Research & Missions
- [ ] Tech tree
- [ ] Contracts
- [ ] Science collection

### Milestone G — Stage 1 Complete (§17)
- [ ] Create/join multiplayer agency end-to-end
- [ ] Progress from sounding rocket → satellite → lunar flyby

---

## Stage 2+ (design doc)

See `designdoc.txt` for interplanetary, colonies, advanced multiplayer, and graphics phases (§20).

---

## Current Session Focus

Bridging Stage 0 → Stage 1 foundation:

1. Agency creation flow (Career / Science / Sandbox)
2. Full-screen 3D VAB per §18.8 wireframe
3. KSC as explorable 3D world on Kerbin
4. KSP-parity UI shell (menus, panels, readouts)

Run `pnpm dev` and flow: **Main Menu → New Game → Mode → Agency → KSC → VAB → Launch Pad → Flight**.
