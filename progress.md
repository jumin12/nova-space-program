Original prompt: I want to create a web game that launches by launching it's index.html file. The game should be an exact clone of kerbal space program in 3d with all the parts, and everything made in 3d from code. I want the game to have the proper physics. look amazing, have all the parts, editors, campaign, science, biomes, solar system, and proper scale and be 3d. the game should astound me and be so impressive I quite using any other ai. do this as efficiently as possible with great graphics, and it should look and play and feel so good I would think I am playing ksp in the browser.

# NOVA SPACE PROGRAM — progress log

## Status: v4.0 — contracts, debug console, living world, tougher career

## v4.0 additions (this round)

- **Flashing black sky triangles FIXED**: removed the v3 far-ring horizon cull (limb patches
  toggling at the threshold caused the flashes). The impostor globe alone handles the limb.
- **Stale square patches after site placement FIXED**: `PG.invalidateBake('gaia')` runs inside
  `CEL.setSite` — globes/maps rebuild from the new terrain (PlanetView tracks `bakeStamp`).
  Gaia bake now 1536px, full-octave sampling (sharper from orbit).
- **Clouds restored**: the v3 night-fade was killing them at dawn (alpha floor now 0.22, gentler
  sun curve). Puff deck lowered to 1.5–5.3 km and densified.
- **Offered contracts** (CAREER): procedural missions — altitude/speed records, part field tests
  (alt band), science-in-situation, biome touchdowns, satellites (alt ±20%, optional polar:
  needs probe+antenna+solar+EC), crewed-altitude-and-recover. 3 offers / 3 active max,
  accept/decline/abandon; checked ~1Hz in flight (`CAREER.checkContracts`), science hook via
  `onScienceCollected`, recovery hook via `onRecovered`. Mission Control has AVAILABLE / ACTIVE /
  MILESTONES tabs with icon+star cards.
- **Debug console (~)**: aero force vectors (drag red / lift blue, ArrowHelper pool), thermal
  overlay (per-part heat sprites), infinite propellant, no damage, force signal, FPS, set-orbit
  teleport, UT+1h, refill EC, +100 science.
- **Living world v2**: grass tufts (2400 crossed quads, rebuilds every 130m within 1.5km),
  broadleaf+conifer tree species, real city building clusters (instanced towers with
  window-emissive material that lights at night, clustered by the SAME Simplex(777) noise as the
  orbital night-light bake — lights now sit on buildings), birds v2 (4 persistent V-formation
  flocks on wide circuits, no pop-out). Launch smoke denser/darker-edged; engine plumes gained
  white-hot core cones + nozzle flash sprites + flicker.
- **Aero/heat v2**: wings use a sin(2α) lift curve perpendicular to airflow (planes fly);
  reentry flux is leading-edge weighted (0.35–1.0 by position along the velocity axis).
- **Editor v3**: ship keeps its position when parts are removed (no floor snap), grab the ROOT
  to drag the whole ship (click to set down), Q/E rotate + R/F slide held surface parts.
- **Tech tree v4**: 34 nodes (added Recovery Systems, Improved Engines, Structural Engineering,
  Field Science, Probe Autonomy), steeper costs throughout (late game 88–130⚛), early parts
  cost more, starting funds 36k normal / 22k veteran.
- **Space center v3**: Mission Control rebuilt (tiered glass hall + wing + dish + forecourt),
  campus spread out (tracking station moved to its own hill at (330,-260) — it overlapped the
  hangar), astronaut quarters + admin tower, IVA is first-person mouse-look (drag) with an
  EVA HATCH button; astronaut scaled to 0.68 with A/D turning.

## v3.0 additions (this round)

- **Black pole triangles FIXED**: the cloud spheres. Two causes: (a) sphere-UV pinching stretched
  cloud texels into giant wedges radiating from the poles → cloudTexture now tapers alpha to 0
  near the poles; (b) night-side clouds rendered as opaque black shapes that ate the starfield →
  `cloudMaterial()` fades cloud alpha by sun-facing (uSunC uniform via PlanetView.setSun).
- **Impostor globes** (`PlanetView.ensureGlobe`): baked-texture sphere at R+minH−800 under the
  terrain (minH from 1200 sampler probes; bakes staggered ≥600ms apart via `lastBakeAt`). From
  high altitude (camAlt>6000) the chunky horizon-ring patches are HIDDEN (dist > horizonDist·0.96)
  and the smooth textured globe takes the limb. Distant planets now always look textured.
- **COMMS module** (`js/comms.js`): ground station at the home site (range 2e11) + every
  antenna-equipped flight; link if dist < sqrt(rangeA·rangeB) and no body blocks LOS; BFS through
  relay-capable nodes. Probe cores/pods have a built-in 6e5 antenna; Comlink 3e6; RA-15 relay 6e7;
  RA-100 relay 5e10. `signalFor(fl)` cached ~1Hz. Campaign default ON (cfg.commNet), sandbox OFF.
  No signal ⇒ probes lose control + can't transmit; camera feed shows CRT static ("NO SIGNAL").
- **Docking**: nearby saved flights (<2.5 km, same body) load as physical kinematic craft
  (`updateNearProps`). Magnetic capture: matching-size free dock ports within 1.1m, axes opposed,
  rel speed <3 m/s → `Vessel.reRoot` (flips node-attach chain) + `Vessel.graft` (BFS re-add with
  uid map) merge them; crew merges; joint recorded via part.dockedTo. UNDOCK via PAW splits the
  subtree into a new flight with a small separation impulse.
- **Map modes** (flight map + tracking): ORBITS / COMM NET (live link lines, color by strength)
  / RADIATION (additive belt tori from CEL.RAD_CFG).
- **MP v3**: relay (~100 lines) gained a lobby (`listRooms`) + per-room passwords (first joiner
  sets mode+pass) + `joined/badpass/full` replies. Client: lobby browser UI, host-with-password,
  and REAL VESSELS for other players (craft serialization synced on change, ghost rebuilt via
  Vessel.deserialize). ⚠ `window.NET = NET` is REQUIRED — top-level `const` doesn't create the
  window property and every in-game `window.NET &&` guard was silently dead (states/craft/coop
  hooks never fired). Watch for this with any new global module.
- **New parts**: RA-15/RA-100 relay dishes, Clamp-Port Jr/Sr (dockS/dock2; dock1 now functional),
  TR-9 truss, N-1 nuclear engine, GX-7 gravimeter (grav experiment), Belvedere cupola.
  New tech nodes: relayNet, deepComms, docking, advExperiments, nuclearProp (~30 nodes total).
- **World life**: sailboats on coastal water + birds (sprite flocks <2.5km) + denser trees,
  KSC v3 (VAB girders/window walls/helipad, MC dish + lit windows, wind farm, runway-clear road,
  building keep-out for trees), SC zoom out to 30 km, launch smoke denser + pad billow,
  editor: bbox-accurate floor rest (no more sunken craft), left-drag orbit, zoom to 170m.
- New milestones: Orbital Handshake (dock), Voice of the Sky (relayed signal hop>1).
- Tests: s46 (lobby/passwords/real ghosts), s48/s49 (pipe diagnostics), s50 (dock+undock),
  s51 (map modes, CRT, smoke), s52/s53 (launch/night probes).

Note on scope: an original game in the orbital-sim genre (all names, art, text, audio and code are
our own procedural creations).

## v2.0 additions (this round)

- **Tracking Station rebuilt** as a full-3D textured system map (was a black screen: the old DOM-only
  screen never rendered the scene). Shares MAPVIEW with the in-flight map via
  `openStandalone()/updateStandalone()/closeStandalone()`.
- **Baked planet textures** `PG.bakeBodyTexture(body)` (equirect canvas from the CPU sampler, ocean
  depth tinting, city night-light emissive map for Gaia) — feeds the map spheres, the site-picker
  globe, and the menu. SphereGeometry UVs match the bake exactly (verified: u=0 at -X, v=0 at +Y);
  `mesh.rotation.y = spinAngle` aligns body-fixed → world.
- **Launch sites are relocatable** (`CEL.setSite`, multi-site sampler mask, site-relative bay).
  Campaign start + first MP join open the `sitepick` globe screen. SC scene rebuilds via
  `sc.resetScene()`.
- **Hardcore systems** (campaign-configurable via `GAME.showCampaignSetup` → save.cfg): EC drain,
  supplies (1/crew/6h, starvation kills after 3h), radiation (`CEL.radiationAt`: belts, magnetosphere,
  atmosphere shielding, deterministic solar storms via `CEL.stormAt`), crew dose (sickness 18, death
  40), `radShield` parts multiply dose, ignition failures (4%, retry via PAW), hardcore = crew loss
  fails the mission. Probes without EC lose control (`hasLiveControl`).
- **Probe-first tech tree** (25 nodes): sounding rockets → instruments/telemetry → orbital probes →
  life support → crewed capsules. Stock crafts rebuilt accordingly (Dart 1 sounding rocket, probe
  Aurora 1/Pathfinder, crewed Meridian 1, Skylark Trainer plane).
- **New parts**: avionics nose core, Cricket SRB, film camera (no-transmit science), geiger counter,
  nav camera (control-room view), Stargazer telescope (zoom view + per-target observation science),
  supplies canisters, Storm Cellar rad lining, aviation set (cockpit, wings, elevons, turbofan
  [airBreather: thrust scales w/ pressure, flameout in vacuum], rolling gear [low-friction contact],
  intake), hidden `astro` EVA part. Panel-line bump maps on tank/pod materials.
- **View modes** (flight): onboard camera feed (scanline overlay + live telemetry), telescope
  (zoom 2-90×, nearest-body targeting, OBSERVE science + milestone), IVA (canvas dashboard with live
  gauges + warning lamps; hull hidden while inside). `V` exits, `C` toggles IVA.
- **EVA**: pod PAW → astronaut becomes the active vessel (parent parked as a flight + physical prop,
  propagated on rails/landed); jetpack RCS, ground stroll, surface samples, EVA report, plant flag,
  board within 7m (`B`). EVA suits exempt from supply drain.
- **Planes**: crafts containing rolling gear spawn on the runway threshold horizontally, gear down.
- **Multiplayer** (`js/net.js` + `server/relay.js`, ws relay, no authority, ≤4 players): rooms,
  roster, 4Hz state ghosts (colored capsule+glow+label), per-player time controls with warp lock
  within 40km (`NET.nearOther`), modes: race (milestone banners), coop (funds/sci/tech deltas
  shared; spends shared too), sandbox. Remote players' launch sites appear in-world
  (`CEL.addRemoteSite`). README documents Render deployment (free tier, wss URL).
- **Visual overhaul**: richer Gaia biomes (16 incl. reef/savanna/wetlands/volcanic/dunes/jungle),
  slope-rock + snow-sparkle + macro-variation terrain shader, city night lights (per-vertex `city`
  attribute × shader dot noise × night factor), ocean fresnel + dual-scale ripples + swell mottling,
  aurora ovals (gaia/goliath; shader curtains, night-gated), cloud cirrus second layer, near-camera
  volumetric cloud puffs (`PG.CloudPuffs`), instanced trees/rocks (`PG.Scatter`), night airglow rim
  in the atmosphere shader, asteroid belt (`PG.Belt`, in map), point-dust galaxy + nebulae, SC v2
  (hangar, fuel farm, floodlights at night, runway lights, tree line), new cyan/teal UI theme,
  campaign setup + site picker screens, science archive in R&D.

## v2.0 gotchas (hard-won)

- ⚠ **Never use giant sprites or giant spheres for sky glow.** Sprites scaled ~1e11 at distance
  ~7e11 (and the old equirect sky sphere at 7.5e11) render as huge hard-edged WEDGES/FANS from many
  camera angles (clip/precision artifact, present in both flight + map scenes). The galaxy band and
  nebulae are now additive POINTS (5200 dust points, `Stars.sky`) — points never wedge. If you see
  giant gray/black triangle fans in the sky, look for oversized sprites first.
- ⚠ **Scatter placement must use dedicated vectors** — aliasing one scratch vector for
  anchor/quaternion/position random-walked the whole forest across the planet (black shard swarm in
  the sky during ascent). Same class of bug as the flight.step scratch aliasing.
- MAPVIEW (flight mode) must call `this.stars.update(cam.position, 0)` — the sprite/point sky is
  positioned per-frame now (a nebula sitting at origin once washed the whole map lavender).
- `evalJs` in tests: hiding layers per-category (`s43/s44/s45`) is the fastest way to bisect scene
  artifacts; replicate the EXACT flight profile (the s8 simChunk flow) — teleporting often hides
  ascent-accumulated state.
- Map body ring opacity ≤0.16 or it reads as a solid disc.
- s13's transfer burn needs an in-page apoapsis cutoff (light probe stacks accelerate too hard for
  6s polling — it once escaped Gaia and "landed" on the sun).
- EVA: `goEva` must remove the astronaut from `crew` BEFORE `serializeFlight()` of the parent.
- Coop funds: GAME.earn/spend broadcast deltas; contract rewards must NOT also broadcast in
  `onContract` (double pay).

## Architecture (classic scripts, no build step, file:// safe)

Load order matters (see index.html):
- `vendor/three.min.js` — Three.js r147 (last UMD build; local, offline-capable)
- `js/utils.js` — math, simplex/worley noise, seeded RNG, formatting, `window.GAME` seed
- `js/audio.js` — 100% procedural WebAudio (engine rumble, wind, UI, generative music)
- `js/celestial.js` — 16-body Solara system; per-body terrain/biome samplers (CPU + collision)
- `js/orbits.js` — Kepler: elements<->state, anomaly solvers (elliptic+hyperbolic), ephemeris cache
- `js/planetgfx.js` — quadtree cube-sphere LOD planets (per-patch origin), atmosphere scattering
  shader, ocean, clouds, gas giant + ring, stars, sun flare
- `js/parts.js` — ~50 part defs + procedural mesh builders + offscreen thumbnail renderer
- `js/vessel.js` — part tree, layout, mass/CoM/MoI, fuel-feed graph, auto-staging, Δv simulator
- `js/navball.js` — canvas-texture ball + marker math (S/V basis remap)
- `js/ui.js` — toasts (deduped), dialog stack, tooltips, topbar
- `js/editor.js` — VAB: node snap, surface attach, symmetry, staging UI, save/load, launch
- `js/flight.js` — THE big one: 6DOF physics @120Hz substeps, aero, heating, chutes, legs, contact,
  SAS PID, gimbal, RCS, staging/decouple/debris, SOI switching, rails warp, HUD, FX, PAW, recovery
- `js/mapview.js` — map scene, orbit lines, Ap/Pe markers, maneuver nodes + prediction + encounter scan
- `js/career.js` — science system (situ×biome×body, diminishing), tech tree (17 nodes), 14 milestones,
  stock crafts, R&D/MissionControl/Tracking screens
- `js/spacecenter.js` — 3D KSC hub with clickable buildings
- `js/main.js` — boot, renderer (log depth, ACES), screen manager, menu w/ 3D Gaia, saves, settings

## Conventions / gotchas (READ BEFORE EDITING)

- Y-up world. Bodies spin about +Y. East = spinAxis × up (NO negate). Longitude increases east,
  bf dir = (cos lat cos lon, sin lat, -cos lat sin lon).
- Physics state: per-vessel `body` + r/v in body-centered inertial frame (JS doubles). Renderer uses
  floating origin (vessel at 0,0,0) + logarithmicDepthBuffer. Custom shaders need logdepth chunks.
- NEVER alias the shared scratch vectors (_a.._d) across roles inside flight.step — there are
  dedicated P_* scratch vectors for up/vAtm/vAir/nose/dir/lever; F/tau are fresh per substep.
  (A scratch-aliasing bug once made thrust vanish — see git history of pain.)
- Terrain sampler must be LOD-consistent (the `low` flag must not change heights) or patch seams
  appear.
- ⚠ PATCH WINDING (the root cause of weeks of "sky grid/checkerboard/dome" artifacts): the main
  grid MUST be (a,b,c),(b,d,c) — front faces point OUTWARD. The old (a,c,b) order rendered the
  whole planet inside-out: it *looked* right head-on (you saw far-bowl backfaces) but grazing
  sightlines leaked between culled near-patches (horizon checkerboard), skirts glowed along
  silhouettes, and a "mountain dome" (the far-side bowl) arched over the sky. If terrain artifacts
  ever look physically impossible, check winding FIRST (probe: raycast with mat.side temporarily
  DoubleSide and compare against FrontSide hits — see test/s26/s27/s28).
- Skirts: SINGLE outward-facing winding (flip detected per edge vs. outward dir); depth scales with
  cell (clamp(cell*0.15, 1, 140)) to seal T-junction cracks between LOD rings. No radial "lift" —
  it floods low coasts with lifted coarse ocean. Debug hook: window.PG_NOSKIRT=true skips skirts.
- Quadtree: split gated on parent mesh built; build queue sorted level-asc (breadth-first) so coarse
  ancestors hide fast; horizon-culled split demand (margin sqrt(2R*2500) for peaks beyond horizon);
  splitK 4.0 for levels<=6 (smooth limb from orbit), 2.7 for <=7, else 2.0. Flight boosts the
  current body's build budget to 9ms while its queue >30 (fast convergence after scene entry).
- KSC sits in a procedural lowland apron (celestial.js flatM, ~33km radius) — no mountain wall
  ringing the space center. SC fog density 1.1e-5 (9e-5 fogged out everything past 15km).
- The sea east of KSC is an elliptical, noise-warped bay (a hard lat/lon-rectangle carve used to
  read as a giant square sea on the menu globe / from orbit).
- Stars/milkyway sphere radius 8e11 (must exceed camera.far of all scenes? No — far is 2e12).
- autoStage: decouplers bucket at depth-1 (fire WITH the engines above the dropped stage = hot stage).
- SAS sign conventions: cmd.pitch<0 → +X torque; gimbal gp=+cmd.pitch, gy=-cmd.yaw (matches wheels).
- Test hooks: `window.render_game_to_text()`, `window.advanceTime(ms)`, `window.__AUTOLAUNCH=true`
  (test ascent autopilot in flight.js), `window.__FLIGHT`, `window.PG_NOSKIRT`.

## Testing

`node test/drive.mjs test/<scenario>.mjs` (Playwright, headless, swiftshader). Scenarios:
- s1 boot/menu/SC · s7+s12 editor build & staging · s8 launch→orbit (autopilot) · s9 career loop
  (hop, science dialog, chute landing, recovery, milestones) · s10 node+warp+quickload ·
  s11 R&D/MC/tracking/resume · s13 full Selene transfer (TLI plan, staging, SOI handoff) ·
  s14 final screens + save/continue · s15 SC terrain settle · s20-s30 terrain diagnostics
  (sky probes, quadtree walk, winding checks, layer isolation, aerial views).
All pass with zero console errors. Screenshots land in test/shots/.
Note: drive.mjs `evalJs(fn, arg)` forwards one arg to page.evaluate (it silently dropped it
before — caused a misleading no-op layer-isolation test).

## Known limitations / next-agent TODO ideas

- No docking mechanics (Clamp-Port is structural only); no comm-network ranges (antennas gate
  transmission only).
- One maneuver node at a time; no multi-patch conic chains beyond first encounter.
- Asparagus fuel routing not modeled (feed = own stack until decoupler); Δv sim assumes same.
- Reentry heating is coarse (leading-shield check, per-part temp); no part occlusion shading.
- Editor: no part rotation keys (parts auto-orient); no subassembly save; planes are built
  vertically (spawn rotates them onto the runway).
- Plane aero is rocket-aero with bigger fins — flyable but not a flight model.
- Multiplayer is fully trusting (no authority): griefing-resistant only by friendship. Time is
  per-player; ghosts render at reported positions regardless of clock skew (by design).
- Coarse night-side limb patches still read as small dark shards for a few seconds after scene
  entry until the quadtree settles (splitK raised; an impostor-under-terrain would finish it).
- EVA in orbit keeps the parent on its rails orbit — fine for minutes-long EVAs, drifts over hours.
- Telescope view shows the actual scene: distant bodies at low LOD are blobs (could render a
  baked-texture impostor at high zoom).
