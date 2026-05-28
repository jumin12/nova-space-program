import type { Quat, Vec3 } from "@orbital/common";

export const vec3 = {
  zero(): Vec3 {
    return { x: 0, y: 0, z: 0 };
  },
  add(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  },
  sub(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  },
  scale(v: Vec3, s: number): Vec3 {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  },
  dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  },
  cross(a: Vec3, b: Vec3): Vec3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  },
  length(v: Vec3): number {
    return Math.hypot(v.x, v.y, v.z);
  },
  normalize(v: Vec3): Vec3 {
    const len = vec3.length(v);
    if (len < 1e-9) return vec3.zero();
    return vec3.scale(v, 1 / len);
  },
  rotateByQuat(v: Vec3, q: Quat): Vec3 {
    const qv = { x: q.x, y: q.y, z: q.z };
    const t = vec3.scale(vec3.cross(qv, v), 2);
    return vec3.add(v, vec3.add(vec3.scale(t, q.w), vec3.cross(qv, t)));
  },
};

export const quat = {
  identity(): Quat {
    return { x: 0, y: 0, z: 0, w: 1 };
  },
  fromAxisAngle(axis: Vec3, angleRad: number): Quat {
    const half = angleRad * 0.5;
    const s = Math.sin(half);
    const n = vec3.normalize(axis);
    return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) };
  },
  multiply(a: Quat, b: Quat): Quat {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
  },
  normalize(q: Quat): Quat {
    const len = Math.hypot(q.x, q.y, q.z, q.w);
    if (len < 1e-12) return quat.identity();
    const s = 1 / len;
    return { x: q.x * s, y: q.y * s, z: q.z * s, w: q.w * s };
  },
  toEuler(q: Quat): { pitch: number; yaw: number; roll: number } {
    const sinp = 2 * (q.w * q.x + q.y * q.z);
    const cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
    const pitch = Math.atan2(sinp, cosp);
    const siny = 2 * (q.w * q.y - q.z * q.x);
    const cosy = 1 - 2 * (q.y * q.y + q.x * q.x);
    const yaw = Math.abs(siny) >= 1 ? Math.sign(siny) * (Math.PI / 2) : Math.asin(siny);
    const sinr = 2 * (q.w * q.z + q.x * q.y);
    const cosr = 1 - 2 * (q.z * q.z + q.x * q.x);
    const roll = Math.atan2(sinr, cosr);
    return { pitch, yaw, roll };
  },
  fromEuler(pitch: number, yaw: number, roll: number): Quat {
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);
    return {
      w: cr * cp * cy + sr * sp * sy,
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy,
    };
  },
};

export function surfaceUp(position: Vec3): Vec3 {
  return vec3.normalize(position);
}

export function altitude(position: Vec3, planetRadius: number): number {
  return vec3.length(position) - planetRadius;
}

export function gravityAcceleration(position: Vec3, mu: number): Vec3 {
  const r = vec3.length(position);
  if (r < 1) return vec3.zero();
  const gMag = -mu / (r * r);
  const up = vec3.normalize(position);
  return vec3.scale(up, gMag);
}

export function radialVelocity(position: Vec3, velocity: Vec3): number {
  const up = vec3.normalize(position);
  return vec3.dot(velocity, up);
}

export function tangentialVelocity(position: Vec3, velocity: Vec3): Vec3 {
  const up = vec3.normalize(position);
  const radial = vec3.scale(up, vec3.dot(velocity, up));
  return vec3.sub(velocity, radial);
}

export function specificOrbitalEnergy(position: Vec3, velocity: Vec3, mu: number): number {
  const r = vec3.length(position);
  const v2 = vec3.dot(velocity, velocity);
  return v2 * 0.5 - mu / r;
}

export function estimateApoapsisPeriapsis(
  position: Vec3,
  velocity: Vec3,
  mu: number,
  planetRadius: number,
): { apoapsis?: number; periapsis?: number } {
  const r = vec3.length(position);
  const v2 = vec3.dot(velocity, velocity);
  const energy = v2 * 0.5 - mu / r;
  if (energy >= 0) {
    return { apoapsis: Infinity, periapsis: altitude(position, planetRadius) };
  }
  const a = -mu / (2 * energy);
  const h = vec3.cross(position, velocity);
  const h2 = vec3.dot(h, h);
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h2) / (mu * mu)));
  const rp = a * (1 - e);
  const ra = a * (1 + e);
  return {
    apoapsis: Math.max(0, ra - planetRadius),
    periapsis: Math.max(0, rp - planetRadius),
  };
}
