# Orbital Frontier

Browser-based multiplayer space program — KSP-inspired build/launch loop on Kerbin-scale physics.

## Quick Start

```powershell
pnpm install
pnpm dev
```

Open **http://localhost:5173**

## New Game Flow

1. **Main Menu** — Continue saved agency or **New Game**
2. **Game Mode** — Career / Science / Sandbox (designdoc §18.10)
3. **Agency Creation** — name, motto, emblem, colors
4. **Kerbin Space Center** — 3D facilities on the planet (VAB, LC-1, tracking, runway)
5. **VAB** — full 3D hangar: click parts to select, orbit camera, undo/redo, stack builder
6. **Launch Pad** — Shift throttle, Space launch
7. **Flight** — reach 70 km; telemetry saved

## Controls

| Input | Action |
|-------|--------|
| Shift / Ctrl | Throttle up / down |
| Space | Launch (pad) / Stage (flight) |
| W/S A/D Q/E | Pitch / yaw / roll |
| Left-click | Select part (VAB) |
| Right-drag | Orbit camera |
| Scroll | Zoom |
| F | Fullscreen |

## Roadmap

See **[STAGES.md](./STAGES.md)** for Stage 0 completion status and Stage 1 milestones (moon, research, map view, full VAB symmetry, etc.).

## Project Layout

```
apps/client      — React + Three.js
apps/server      — Colyseus launch server
packages/common  — parts, planet, agency types
packages/physics — vessel simulation
designdoc.txt    — full design reference
```
