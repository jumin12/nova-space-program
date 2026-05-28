import {
  getPart,
  kscPadRotation,
  kscPosition,
  rotationAlignYTo,
  PLANET,
  type ControlInput,
  type CraftDefinition,
  type TelemetrySample,
  type VesselSnapshot,
} from "@orbital/common";
import {
  atmosphereDensity,
  dynamicPressure,
  gravityAtAltitude,
  ispAtAltitude,
  isInSpace,
  thrustAtAltitude,
} from "./atmosphere.js";
import {
  addPartToCraft,
  computeCraftStats,
  consumeFuel,
  craftToDefinition,
  createCraftRuntime,
  getAttachedParts,
  hasUsableFuel,
  removeLastPart,
  separateStage,
  stageCraft,
  type CraftRuntime,
} from "./craft.js";
import { type DebrisBody, spawnDebrisBody, stepDebrisBodies } from "./debris.js";
import {
  altitude,
  estimateApoapsisPeriapsis,
  gravityAcceleration,
  quat,
  radialVelocity,
  surfaceUp,
  vec3,
} from "./vector.js";

export type VesselState = {
  craft: CraftRuntime;
  position: import("@orbital/common").Vec3;
  velocity: import("@orbital/common").Vec3;
  rotation: import("@orbital/common").Quat;
  angularVelocity: import("@orbital/common").Vec3;
  throttle: number;
  flightTime: number;
  armed: boolean;
  launched: boolean;
  crashed: boolean;
  landed: boolean;
  stagingCooldown: number;
  telemetry: TelemetrySample[];
  maxAltitude: number;
  reachedSpace: boolean;
  onPad: boolean;
  debris: DebrisBody[];
};

const G0 = PLANET.surfaceGravity;
const MAX_ANGULAR_SPEED = 2.4;
const THROTTLE_RESPONSE = 4.5;
const SUBSTEPS = 4;

export function createVesselOnPad(craftDef: CraftDefinition): VesselState {
  const craft = createCraftRuntime(craftDef);
  const stats = computeCraftStats(craft);
  const padPosition = kscPosition(stats.height * 0.5 + 2);
  const padRot = kscPadRotation();
  return {
    craft,
    position: padPosition,
    velocity: vec3.zero(),
    rotation: padRot,
    angularVelocity: vec3.zero(),
    throttle: 0,
    flightTime: 0,
    armed: false,
    launched: false,
    crashed: false,
    landed: false,
    stagingCooldown: 0,
    telemetry: [],
    maxAltitude: 0,
    reachedSpace: false,
    onPad: true,
    debris: [],
  };
}

function padRestPosition(stats: ReturnType<typeof computeCraftStats>) {
  return kscPosition(stats.height * 0.5 + 2);
}

function engineThrustAtAlt(craft: CraftRuntime, alt: number, throttle: number): number {
  let thrust = 0;
  for (const part of getAttachedParts(craft)) {
    if (part.stage !== craft.activeStage) continue;
    const def = getPart(part.definitionId);
    const engine = def.modules.find((m) => m.type === "engine");
    if (engine?.type === "engine") {
      thrust += thrustAtAltitude(engine.thrust, engine.isp, alt);
    }
  }
  return thrust * throttle;
}

function engineVacuumIsp(craft: CraftRuntime): number {
  return computeCraftStats(craft).vacuumIsp;
}

function burnFuelForThrust(craft: CraftRuntime, thrust: number, isp: number, dt: number): number {
  if (thrust <= 0 || isp <= 0) return 0;
  return consumeFuel(craft, (thrust / (isp * G0)) * dt);
}

function applyThrottle(vessel: VesselState, input: ControlInput, dt: number) {
  const throttleTarget = Math.max(0, Math.min(1, input.throttle));
  vessel.throttle += (throttleTarget - vessel.throttle) * Math.min(1, dt * THROTTLE_RESPONSE);
}

/** Preflight: set throttle only — engines stay off until Space (clamps released). */
function stepPreflight(vessel: VesselState, input: ControlInput, dt: number) {
  if (input.launch) vessel.armed = true;
  applyThrottle(vessel, input, dt);
  vessel.onPad = true;
  const stats = computeCraftStats(vessel.craft);
  const up = surfaceUp(vessel.position);
  vessel.position = padRestPosition(stats);
  vessel.velocity = vec3.zero();
  vessel.rotation = kscPadRotation();
  vessel.angularVelocity = vec3.zero();
}


function applyControls(vessel: VesselState, input: ControlInput, dt: number, stats: ReturnType<typeof computeCraftStats>) {
  applyThrottle(vessel, input, dt);

  if (vessel.stagingCooldown > 0) {
    vessel.stagingCooldown -= dt;
  } else if (input.stage && vessel.armed) {
    const dropped = separateStage(vessel.craft);
    if (dropped) {
      vessel.debris.push(spawnDebrisBody(vessel.position, vessel.velocity, vessel.rotation, dropped));
      vessel.stagingCooldown = 0.75;
    }
  }

  if (!vessel.armed) return;

  const alt = altitude(vessel.position, PLANET.radius);
  const thrustMag =
    hasUsableFuel(vessel.craft) ? engineThrustAtAlt(vessel.craft, alt, vessel.throttle) : 0;
  const hasThrust = thrustMag > 1000;

  let torque = vec3.zero();
  if (!vessel.onPad) {
    const up = surfaceUp(vessel.position);
    const gimbalScale = (stats.maxGimbal * Math.PI) / 180;
    const controlAuthority = hasThrust ? thrustMag * gimbalScale * 0.00012 + 800 : 2200;
    torque = vec3.add(
      vec3.scale({ x: 1, y: 0, z: 0 }, input.pitch * controlAuthority),
      vec3.add(
        vec3.scale({ x: 0, y: 1, z: 0 }, input.yaw * controlAuthority * 0.85),
        vec3.scale({ x: 0, y: 0, z: 1 }, input.roll * controlAuthority * 1.1),
      ),
    );
    if (hasThrust && alt < 45_000 && alt > 120) {
      const rocketUp = vec3.normalize(vec3.rotateByQuat({ x: 0, y: 1, z: 0 }, vessel.rotation));
      const misalign = vec3.cross(rocketUp, up);
      const assist = Math.min(12_000, 1_200 + thrustMag * 0.002);
      torque = vec3.add(torque, vec3.scale(misalign, assist * (1 - alt / 50_000)));
    }
  }

  if (vessel.onPad) {
    vessel.angularVelocity = vec3.zero();
    return;
  }

  vessel.angularVelocity = vec3.add(vessel.angularVelocity, vec3.scale(torque, dt / Math.max(stats.totalMass, 1)));

  const wMag = vec3.length(vessel.angularVelocity);
  if (wMag > MAX_ANGULAR_SPEED) {
    vessel.angularVelocity = vec3.scale(vessel.angularVelocity, MAX_ANGULAR_SPEED / wMag);
  }

  const damping = Math.exp(-dt * (hasThrust ? 3.6 : 2.8));
  vessel.angularVelocity = vec3.scale(vessel.angularVelocity, damping);
}

function computeAeroAndThrust(vessel: VesselState, dt: number) {
  const stats = computeCraftStats(vessel.craft);
  const up = surfaceUp(vessel.position);
  const alt = altitude(vessel.position, PLANET.radius);
  const density = atmosphereDensity(alt);
  const speed = vec3.length(vessel.velocity);
  const q = dynamicPressure(density, speed);

  const thrustDir = vec3.normalize(vec3.rotateByQuat({ x: 0, y: 1, z: 0 }, vessel.rotation));
  let thrustForce = vec3.zero();

  if (
    vessel.armed &&
    !vessel.crashed &&
    !vessel.landed &&
    stats.hasEngine &&
    vessel.throttle > 0.01 &&
    hasUsableFuel(vessel.craft)
  ) {
    const thrust = engineThrustAtAlt(vessel.craft, alt, vessel.throttle);
    const isp = ispAtAltitude(stats.vacuumIsp, alt);
    const fuelReq = (thrust / (isp * G0)) * dt;
    const burned = burnFuelForThrust(vessel.craft, thrust, isp, dt);
    const thrustScale = fuelReq > 1e-9 ? Math.min(1, burned / fuelReq) : 0;
    if (thrustScale > 0 && hasUsableFuel(vessel.craft, 0)) {
      thrustForce = vec3.scale(thrustDir, thrust * thrustScale);
    }
  }

  const dragDir = speed > 0.5 ? vec3.scale(vessel.velocity, -1 / speed) : vec3.zero();
  const rhoRatio = atmosphereDensity(alt) / PLANET.seaLevelDensity;
  /** Cd·A with mild density boost — noticeable drag without blocking Earth-scale ascents. */
  const aeroScale = 0.72 * (1 + 0.22 * rhoRatio);
  const dragMag = q * stats.avgDragCoeff * stats.dragArea * aeroScale;
  const dragForce = vec3.scale(dragDir, dragMag);

  const stabilityTorque = vec3.zero();

  return { stats, up, alt, q, thrustForce, dragForce, stabilityTorque };
}

function applyPadConstraint(vessel: VesselState, up: import("@orbital/common").Vec3) {
  if (vessel.launched) {
    vessel.onPad = false;
    return;
  }

  const stats = computeCraftStats(vessel.craft);
  const alt = altitude(vessel.position, PLANET.radius);
  const thrustUp = vec3.dot(
    vec3.normalize(vec3.rotateByQuat({ x: 0, y: 1, z: 0 }, vessel.rotation)),
    up,
  );
  const thrustMag =
    (hasUsableFuel(vessel.craft) ? engineThrustAtAlt(vessel.craft, alt, vessel.throttle) : 0) *
    Math.max(0, thrustUp);
  const gLocal = gravityAtAltitude(alt);
  const weight = stats.totalMass * gLocal;
  const canLift =
    vessel.armed &&
    vessel.throttle >= 0.08 &&
    hasUsableFuel(vessel.craft) &&
    thrustMag >= weight * 0.98;

  vessel.onPad = true;
  if (!canLift) {
    vessel.position = padRestPosition(stats);
    vessel.velocity = vec3.zero();
    vessel.rotation = kscPadRotation();
    vessel.angularVelocity = vec3.zero();
    return;
  }

  vessel.onPad = false;
  vessel.launched = true;
}

function stepVesselOnce(vessel: VesselState, input: ControlInput, dt: number): void {
  if (input.launch) vessel.armed = true;

  if (!vessel.armed) {
    stepPreflight(vessel, input, dt);
    return;
  }

  const stats = computeCraftStats(vessel.craft);
  applyControls(vessel, input, dt, stats);

  const { up, alt, q, thrustForce, dragForce, stabilityTorque } = computeAeroAndThrust(vessel, dt);
  const freshStats = computeCraftStats(vessel.craft);
  const gravity = gravityAcceleration(vessel.position, PLANET.mu);
  const totalForce = vec3.add(vec3.add(thrustForce, dragForce), vec3.scale(gravity, freshStats.totalMass));

  const acceleration = vec3.scale(totalForce, 1 / Math.max(freshStats.totalMass, 0.001));
  vessel.velocity = vec3.add(vessel.velocity, vec3.scale(acceleration, dt));
  vessel.position = vec3.add(vessel.position, vec3.scale(vessel.velocity, dt));

  if (!vessel.onPad) {
    const angularAccel = vec3.scale(stabilityTorque, 1 / Math.max(freshStats.totalMass, 0.001));
    vessel.angularVelocity = vec3.add(vessel.angularVelocity, vec3.scale(angularAccel, dt));

    const w = vessel.angularVelocity;
    const angle = vec3.length(w) * dt;
    if (angle > 1e-6) {
      const axis = vec3.normalize(w);
      const dq = quat.fromAxisAngle(axis, angle);
      vessel.rotation = quat.normalize(quat.multiply(vessel.rotation, dq));
    }
  }

  applyPadConstraint(vessel, up);

  const bottomAlt = alt - freshStats.height * 0.5;
  if (
    !vessel.onPad &&
    bottomAlt <= 0 &&
    alt < 800 &&
    vessel.flightTime > 0.5 &&
    radialVelocity(vessel.position, vessel.velocity) < 0
  ) {
    if (vec3.length(vessel.velocity) > 18) {
      vessel.crashed = true;
    } else {
      vessel.landed = true;
      vessel.onPad = true;
    }
    vessel.velocity = vec3.zero();
    vessel.angularVelocity = vec3.zero();
    vessel.position = padRestPosition(freshStats);
  }
}

export function stepVessel(vessel: VesselState, input: ControlInput, dt: number): void {
  if (!vessel.armed) {
    stepPreflight(vessel, input, dt);
    recordTelemetrySample(vessel, input, dt);
    return;
  }

  const subDt = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    stepVesselOnce(vessel, input, subDt);
  }
  stepDebrisBodies(vessel.debris, dt);

  const alt = altitude(vessel.position, PLANET.radius);
  const freshStats = computeCraftStats(vessel.craft);
  const density = atmosphereDensity(alt);
  const speed = vec3.length(vessel.velocity);
  const q = dynamicPressure(density, speed);
  const gravity = gravityAcceleration(vessel.position, PLANET.mu);
  const thrustDir = vec3.normalize(vec3.rotateByQuat({ x: 0, y: 1, z: 0 }, vessel.rotation));
  let thrustForce = vec3.zero();
  if (vessel.armed && freshStats.hasEngine && vessel.throttle > 0.01) {
    thrustForce = vec3.scale(thrustDir, engineThrustAtAlt(vessel.craft, alt, vessel.throttle));
  }
  const dragDir = speed > 0.5 ? vec3.scale(vessel.velocity, -1 / speed) : vec3.zero();
  const dragMag = q * freshStats.avgDragCoeff * freshStats.dragArea;
  const dragForce = vec3.scale(dragDir, dragMag);
  const totalForce = vec3.add(vec3.add(thrustForce, dragForce), vec3.scale(gravity, freshStats.totalMass));
  const acceleration = vec3.scale(totalForce, 1 / Math.max(freshStats.totalMass, 0.001));

  recordTelemetrySample(vessel, input, dt, alt, freshStats, acceleration, q);
}

function recordTelemetrySample(
  vessel: VesselState,
  _input: ControlInput,
  dt: number,
  altOverride?: number,
  statsOverride?: ReturnType<typeof computeCraftStats>,
  accelOverride?: import("@orbital/common").Vec3,
  qOverride?: number,
) {
  const stats = statsOverride ?? computeCraftStats(vessel.craft);
  const alt = altOverride ?? altitude(vessel.position, PLANET.radius);
  const density = atmosphereDensity(alt);
  const speed = vec3.length(vessel.velocity);
  const q = qOverride ?? dynamicPressure(density, speed);
  const gravity = gravityAcceleration(vessel.position, PLANET.mu);
  const thrustDir = vec3.normalize(vec3.rotateByQuat({ x: 0, y: 1, z: 0 }, vessel.rotation));
  let thrustForce = vec3.zero();
  if (vessel.armed && stats.hasEngine && vessel.throttle > 0.01 && hasUsableFuel(vessel.craft)) {
    thrustForce = vec3.scale(thrustDir, engineThrustAtAlt(vessel.craft, alt, vessel.throttle));
  }
  const dragDir = speed > 0.5 ? vec3.scale(vessel.velocity, -1 / speed) : vec3.zero();
  const dragMag = q * stats.avgDragCoeff * stats.dragArea;
  const dragForce = vec3.scale(dragDir, dragMag);
  const totalForce = vec3.add(vec3.add(thrustForce, dragForce), vec3.scale(gravity, stats.totalMass));
  const acceleration = accelOverride ?? vec3.scale(totalForce, 1 / Math.max(stats.totalMass, 0.001));

  vessel.flightTime += dt;
  vessel.maxAltitude = Math.max(vessel.maxAltitude, alt);
  if (isInSpace(alt)) vessel.reachedSpace = true;

  const orbit = estimateApoapsisPeriapsis(vessel.position, vessel.velocity, PLANET.mu, PLANET.radius);
  vessel.telemetry.push({
    t: vessel.flightTime,
    altitude: alt,
    velocity: speed,
    verticalSpeed: radialVelocity(vessel.position, vessel.velocity),
    acceleration: vec3.length(acceleration),
    dynamicPressure: q,
    fuelRemaining: stats.fuelRemaining,
    mass: stats.totalMass,
    throttle: vessel.throttle,
    stage: vessel.craft.activeStage,
    pitch: quat.toEuler(vessel.rotation).pitch,
    inSpace: isInSpace(alt),
    apoapsis: orbit.apoapsis,
    periapsis: orbit.periapsis,
  });
}

export function snapshotFromVessel(vessel: VesselState): VesselSnapshot {
  const stats = computeCraftStats(vessel.craft);
  const alt = altitude(vessel.position, PLANET.radius);
  const speed = vec3.length(vessel.velocity);
  const density = atmosphereDensity(alt);
  const q = dynamicPressure(density, speed);
  const euler = quat.toEuler(vessel.rotation);
  const orbit = estimateApoapsisPeriapsis(vessel.position, vessel.velocity, PLANET.mu, PLANET.radius);
  const lastAccel = vessel.telemetry.at(-1)?.acceleration ?? 0;

  return {
    position: { ...vessel.position },
    velocity: { ...vessel.velocity },
    rotation: { ...vessel.rotation },
    angularVelocity: { ...vessel.angularVelocity },
    altitude: alt,
    surfaceDistance: vec3.length(vessel.position),
    speed,
    verticalSpeed: radialVelocity(vessel.position, vessel.velocity),
    acceleration: lastAccel,
    dynamicPressure: q,
    mass: stats.totalMass,
    fuelRemaining: stats.fuelRemaining,
    activeStage: vessel.craft.activeStage,
    throttle: vessel.throttle,
    pitch: euler.pitch,
    yaw: euler.yaw,
    roll: euler.roll,
    inSpace: isInSpace(alt),
    crashed: vessel.crashed,
    landed: vessel.landed,
    armed: vessel.armed,
    onPad: vessel.onPad,
    apoapsis: orbit.apoapsis,
    periapsis: orbit.periapsis,
    flightTime: vessel.flightTime,
    debris: vessel.debris.map((d) => ({
      id: d.id,
      craft: craftToDefinition(d.craft),
      position: { ...d.position },
      velocity: { ...d.velocity },
      rotation: { ...d.rotation },
    })),
  };
}

export function isFlightComplete(vessel: VesselState): boolean {
  const alt = altitude(vessel.position, PLANET.radius);
  if (vessel.crashed || vessel.landed) return true;
  if (vessel.flightTime > 600) return true;
  if (
    vessel.reachedSpace &&
    vessel.flightTime > 20 &&
    alt < PLANET.spaceAltitude * 0.5 &&
    radialVelocity(vessel.position, vessel.velocity) < 0
  ) {
    return true;
  }
  return false;
}

export {
  addPartToCraft,
  computeCraftStats,
  createCraftRuntime,
  craftToDefinition,
  removeLastPart,
  separateStage,
  stageCraft,
};
export type { CraftRuntime };
export type { DebrisBody } from "./debris.js";
