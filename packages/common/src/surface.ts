import { PLANET, type Quat, type Vec3 } from "./types.js";

/** Kerbin Space Center — equator, prime meridian, coastal launch site (KSP-like). */
export const KSC_SITE = {
  /** Equator — same latitude band as KSP KSC. */
  latRad: 0,
  /** Prime meridian on the equirectangular map (u = 0.5). */
  lonRad: 0,
} as const;

export type SurfaceFrame = {
  ref: Vec3;
  up: Vec3;
  east: Vec3;
  north: Vec3;
};

export function positionOnPlanet(latRad: number, lonRad: number, altitudeM = 0): Vec3 {
  const r = PLANET.radius + altitudeM;
  const cosLat = Math.cos(latRad);
  return {
    x: r * cosLat * Math.cos(lonRad),
    y: r * Math.sin(latRad),
    z: r * cosLat * Math.sin(lonRad),
  };
}

export function kscPosition(altitudeM = 0): Vec3 {
  return positionOnPlanet(KSC_SITE.latRad, KSC_SITE.lonRad, altitudeM);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-12) return { x: 0, y: 1, z: 0 };
  return scale(v, 1 / len);
}

export function getKscSurfaceFrame(): SurfaceFrame {
  const ref = kscPosition(0);
  const up = normalize(ref);
  let east = cross({ x: 0, y: 1, z: 0 }, up);
  if (Math.hypot(east.x, east.y, east.z) < 1e-6) {
    east = { x: 0, y: 0, z: 1 };
  }
  east = normalize(east);
  const north = normalize(cross(up, east));
  return { ref, up, east, north };
}

/** Planet-centered physics position → KSC tangent frame (meters, y = altitude). */
export function physicsToSurfaceVisual(x: number, y: number, z: number): Vec3 {
  const { ref, up, east, north } = getKscSurfaceFrame();
  const d = sub({ x, y, z }, ref);
  return {
    x: dot(d, east),
    y: dot(d, up),
    z: dot(d, north),
  };
}

/** KSC tangent frame → planet-centered physics position. */
export function surfaceVisualToPhysics(local: Vec3): Vec3 {
  const { ref, up, east, north } = getKscSurfaceFrame();
  return add(
    ref,
    add(scale(east, local.x), add(scale(up, local.y), scale(north, local.z))),
  );
}

/** Quaternion rotating craft +Y to align with a world-space up vector. */
export function rotationAlignYTo(up: Vec3): Quat {
  const craftUp = { x: 0, y: 1, z: 0 };
  const axis = cross(craftUp, up);
  const axisLen = Math.hypot(axis.x, axis.y, axis.z);
  if (axisLen < 1e-8) {
    return dot(craftUp, up) > 0
      ? { x: 0, y: 0, z: 0, w: 1 }
      : { x: 1, y: 0, z: 0, w: 0 };
  }
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(craftUp, up))));
  const n = scale(axis, 1 / axisLen);
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) };
}

/** Pad orientation: craft +Y aligned with surface up at KSC. */
export function kscPadRotation(): Quat {
  return rotationAlignYTo(getKscSurfaceFrame().up);
}
