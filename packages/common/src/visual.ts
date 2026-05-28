import { MOON, SUN } from "./celestial.js";
import { PLANET } from "./types.js";

export { PLANET };

/**
 * Flight & KSC use 1 scene unit = 1 physics meter.
 * Planet rendering uses the same radius as simulation for correct horizon curvature.
 */
export const VISUAL = {
  worldScale: 1 / 1000,
  meterScale: 1,
  /** Planet sphere radius in scene meters (= physics PLANET.radius). */
  planetRadius: PLANET.radius,
  /** Scaled globe for map / tracking (readable at Earth scale). */
  menuPlanetRadius: 28_000,
  terrainHalfSize: 2200,
  terrainFadeAltitude: 2500,
  spaceViewFadeStart: 55_000,
  spaceViewFadeEnd: PLANET.atmosphereTop,
  atmosphereShell: 1 + 2500 / PLANET.radius,
  atmosphereTopShell: 1 + PLANET.atmosphereTop / PLANET.radius,
  cloudLayers: [
    1 + 6000 / PLANET.radius,
    1 + 12_000 / PLANET.radius,
    1 + 20_000 / PLANET.radius,
    1 + 32_000 / PLANET.radius,
  ],
  /**
   * KSC layout in KSC tangent frame (m): pad at origin, +Z prograde (planet rotation),
   * VAB northwest, tracking northeast, runway east over the coastal shelf (design §10 / KSP KSC).
   */
  ksc: {
    pad: { x: 0, y: 0, z: 0 },
    vab: { x: -248, y: 0, z: 118 },
    tracking: { x: 212, y: 0, z: -132 },
    admin: { x: -128, y: 0, z: -198 },
    rd: { x: 72, y: 0, z: -208 },
    runway: { x: 392, y: 0, z: 48 },
  },
  /** Rotate planet mesh so equatorial KSC (physics +X) aligns with local up (+Y) at the pad. */
  kscPlanetMeshRotationZ: Math.PI / 2,
  /**
   * Solar system visuals: real bodies/ratios in celestial.ts, readable distances here.
   * Earth (Kerbin) at origin; Sun and Moon placed for sky rendering.
   */
  solar: {
    sunDisplayRadius: 14_000,
    /** Sun mesh distance from planet center (scene m) — lighting + visible disc in space. */
    sunOrbitDisplay: 22_000_000,
    moonDisplayRadius: 1_737_400,
    /** Moon orbital distance for sky/map (scaled for visibility; physics uses MOON.orbitRadius). */
    /** Real Moon distance (m) — used for flight sky & lighting (Earth-scale). */
    moonOrbitDisplay: MOON.orbitRadius,
    moonOrbitMapDisplay: 120_000,
    /** Sun mesh distance in map/menu views (scene m). */
    sunMapDisplay: 2_400_000,
    kerbinOrbitReal: SUN.kerbinOrbitRadius,
    moonOrbitReal: MOON.orbitRadius,
    sunRadiusReal: SUN.radius,
    moonRadiusReal: MOON.radius,
  },
} as const;

export { KSC_SITE, kscPosition, physicsToSurfaceVisual, surfaceVisualToPhysics, kscPadRotation } from "./surface.js";
