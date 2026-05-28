import { PLANET } from "@orbital/common";
import { atmosphereDensity, dynamicPressure } from "./atmosphere.js";
import { computeCraftStats, type CraftRuntime } from "./craft.js";
import {
  altitude,
  gravityAcceleration,
  quat,
  surfaceUp,
  vec3,
} from "./vector.js";
import type { Quat, Vec3 } from "@orbital/common";

export type DebrisBody = {
  id: string;
  craft: CraftRuntime;
  position: Vec3;
  velocity: Vec3;
  rotation: Quat;
  angularVelocity: Vec3;
  age: number;
};

export function spawnDebrisBody(
  parentPos: Vec3,
  parentVel: Vec3,
  parentRot: Quat,
  droppedCraft: CraftRuntime,
): DebrisBody {
  const radialUp = surfaceUp(parentPos);
  const craftDown = vec3.normalize(vec3.rotateByQuat({ x: 0, y: -1, z: 0 }, parentRot));
  const dropH = computeCraftStats(droppedCraft).height;

  const offset = vec3.scale(craftDown, dropH * 0.42);
  const sepSpeed = 14 + Math.random() * 10;
  const sepVel = vec3.scale(craftDown, -sepSpeed);

  const lateral = vec3.cross(radialUp, craftDown);
  const latLen = vec3.length(lateral);
  if (latLen > 1e-6) {
    const latDir = vec3.scale(lateral, 1 / latLen);
    const kick = (Math.random() - 0.5) * 8;
    sepVel.x += latDir.x * kick;
    sepVel.y += latDir.y * kick;
    sepVel.z += latDir.z * kick;
  }

  return {
    id: `debris-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    craft: droppedCraft,
    position: vec3.add(parentPos, offset),
    velocity: vec3.add(parentVel, sepVel),
    rotation: { ...parentRot },
    angularVelocity: {
      x: (Math.random() - 0.5) * 2.5,
      y: (Math.random() - 0.5) * 1.8,
      z: (Math.random() - 0.5) * 2.5,
    },
    age: 0,
  };
}

export function stepDebrisBodies(bodies: DebrisBody[], dt: number): void {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const d = bodies[i]!;
    d.age += dt;

    const stats = computeCraftStats(d.craft);
    const mass = Math.max(stats.totalMass, 1);
    const alt = altitude(d.position, PLANET.radius);
    const gravity = gravityAcceleration(d.position, PLANET.mu);
    const density = atmosphereDensity(alt);
    const speed = vec3.length(d.velocity);
    const q = dynamicPressure(density, speed);
    const dragDir = speed > 0.5 ? vec3.scale(d.velocity, -1 / speed) : vec3.zero();
    const dragMag = q * stats.avgDragCoeff * stats.dragArea * 0.65;
    const dragAccel = vec3.scale(dragDir, dragMag / mass);
    const accel = vec3.add(gravity, dragAccel);

    d.velocity = vec3.add(d.velocity, vec3.scale(accel, dt));
    d.position = vec3.add(d.position, vec3.scale(d.velocity, dt));

    const w = d.angularVelocity;
    const angle = vec3.length(w) * dt;
    if (angle > 1e-6) {
      const axis = vec3.normalize(w);
      const dq = quat.fromAxisAngle(axis, angle);
      d.rotation = quat.normalize(quat.multiply(d.rotation, dq));
    }

    d.angularVelocity = vec3.scale(d.angularVelocity, Math.exp(-dt * 0.28));

    if (d.age > 480) {
      bodies.splice(i, 1);
    }
  }
}
