/** Earth-scale home planet (real radius, Kármán-line space, exponential atmosphere). */
export const PLANET = {
  id: "home",
  name: "Kerbin",
  /** Earth equatorial radius (m). */
  radius: 6_371_000,
  /** Standard gravitational parameter (m³/s²). */
  mu: 3.986_004_418e14,
  surfaceGravity: 9.806_65,
  /** Kármán line — edge of sensible atmosphere (m). */
  atmosphereTop: 100_000,
  spaceAltitude: 100_000,
  seaLevelDensity: 1.225,
  /** Earth scale height (m). */
  scaleHeight: 8_500,
  rotationPeriod: 86_164.1,
} as const;

export const PHYSICS = {
  fixedDt: 1 / 30,
  maxSubsteps: 4,
} as const;

export const DEFAULT_SERVER_PORT = 2567;

export type Vec3 = { x: number; y: number; z: number };

export type Quat = { x: number; y: number; z: number; w: number };

export type PartCategory =
  | "probe"
  | "tank"
  | "engine"
  | "decoupler"
  | "structural";

export type PartModule =
  | { type: "engine"; thrust: number; isp: number; fuelRate: number; gimbal: number }
  | { type: "fuelTank"; capacity: number; initialFuel: number }
  | { type: "decoupler" }
  | { type: "probeCore" };

export type PartDefinition = {
  id: string;
  name: string;
  category: PartCategory;
  mass: number;
  height: number;
  radius: number;
  color: string;
  modules: PartModule[];
  aero?: { dragCoefficient: number; area: number };
};

export type StackedPart = {
  instanceId: string;
  definitionId: string;
  stage: number;
};

export type CraftDefinition = {
  name: string;
  parts: StackedPart[];
};

export type FlightPhase = "lobby" | "build" | "preflight" | "flight" | "landed" | "crashed" | "space";

export type PlayerRole = "pilot" | "spectator";

export type ControlInput = {
  throttle: number;
  pitch: number;
  yaw: number;
  roll: number;
  stage: boolean;
  launch: boolean;
};

export type TelemetrySample = {
  t: number;
  altitude: number;
  velocity: number;
  verticalSpeed: number;
  acceleration: number;
  dynamicPressure: number;
  fuelRemaining: number;
  mass: number;
  throttle: number;
  stage: number;
  pitch: number;
  inSpace: boolean;
  apoapsis?: number;
  periapsis?: number;
};

export type TelemetryLog = {
  craftName: string;
  playerName: string;
  startedAt: number;
  endedAt: number;
  maxAltitude: number;
  reachedSpace: boolean;
  outcome: "space" | "suborbital" | "crash" | "landed";
  samples: TelemetrySample[];
};

export type DebrisSnapshot = {
  id: string;
  craft: CraftDefinition;
  position: Vec3;
  velocity: Vec3;
  rotation: Quat;
};

export type VesselSnapshot = {
  position: Vec3;
  velocity: Vec3;
  rotation: Quat;
  angularVelocity: Vec3;
  altitude: number;
  surfaceDistance: number;
  speed: number;
  verticalSpeed: number;
  acceleration: number;
  dynamicPressure: number;
  mass: number;
  fuelRemaining: number;
  activeStage: number;
  throttle: number;
  pitch: number;
  yaw: number;
  roll: number;
  inSpace: boolean;
  crashed: boolean;
  landed: boolean;
  armed: boolean;
  onPad: boolean;
  apoapsis?: number;
  periapsis?: number;
  flightTime: number;
  debris: DebrisSnapshot[];
};

export type LobbyPlayer = {
  sessionId: string;
  name: string;
  role: PlayerRole;
  ready: boolean;
};

export const DEFAULT_CONTROL: ControlInput = {
  throttle: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  stage: false,
  launch: false,
};
