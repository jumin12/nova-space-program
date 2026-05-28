import { PLANET, type Vec3 } from "@orbital/common";

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function gravityAt(pos: Vec3, mu: number): Vec3 {
  const r = Math.hypot(pos.x, pos.y, pos.z);
  if (r < 1) return { x: 0, y: 0, z: 0 };
  const g = -mu / (r * r);
  return { x: (pos.x / r) * g, y: (pos.y / r) * g, z: (pos.z / r) * g };
}

/** Physics position → point on map globe (scene units). */
export function physicsToMapGlobe(
  pos: Vec3,
  globeRadius: number,
  altitudeOffset = 0,
): { x: number; y: number; z: number } {
  const r = Math.hypot(pos.x, pos.y, pos.z) || PLANET.radius;
  const s = (globeRadius + altitudeOffset) / r;
  return { x: pos.x * s, y: pos.y * s, z: pos.z * s };
}

/** Two-body orbit samples in physics space (meters). */
export function sampleOrbitPhysics(
  position: Vec3,
  velocity: Vec3,
  mu: number,
  steps = 160,
): Vec3[] {
  const r0 = Math.hypot(position.x, position.y, position.z);
  const v2 = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2;
  const energy = 0.5 * v2 - mu / r0;

  let duration = 7200;
  if (energy < 0 && r0 > 1) {
    const a = -mu / (2 * energy);
    duration = 2 * Math.PI * Math.sqrt((a * a * a) / mu);
  } else if (energy >= 0) {
    duration = 3600;
  }

  const dt = duration / steps;
  const pts: Vec3[] = [];
  let p = { ...position };
  let v = { ...velocity };

  for (let i = 0; i <= steps; i++) {
    pts.push({ ...p });
    const a = gravityAt(p, mu);
    v = add(v, scale(a, dt));
    p = add(p, scale(v, dt));
  }
  return pts;
}

export function sampleGroundTrack(orbitPoints: Vec3[], globeRadius: number): Vec3[] {
  return orbitPoints.map((p) => {
    const r = Math.hypot(p.x, p.y, p.z) || PLANET.radius;
    return physicsToMapGlobe(p, globeRadius, 0);
  });
}
