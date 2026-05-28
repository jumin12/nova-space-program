import type { CraftDefinition, PartDefinition } from "./types.js";

/** KSP-style size tiers: small = 1.25 m, medium = 2.5 m diameter. Mass in tonnes, fuel in kg. */
export const PARTS: Record<string, PartDefinition> = {
  "probe.core": {
    id: "probe.core",
    name: "Mk1 Command Pod",
    category: "probe",
    mass: 0.84,
    height: 1.15,
    radius: 0.625,
    color: "#e8ecf0",
    modules: [{ type: "probeCore" }],
    aero: { dragCoefficient: 0.32, area: 1.4 },
  },
  "tank.rt-5": {
    id: "tank.rt-5",
    name: "RT-5 Fuel Tank",
    category: "tank",
    mass: 0.225,
    height: 2.0,
    radius: 0.625,
    color: "#7a9a42",
    modules: [{ type: "fuelTank", capacity: 180, initialFuel: 180 }],
    aero: { dragCoefficient: 0.24, area: 2.2 },
  },
  "tank.fl-t200": {
    id: "tank.fl-t200",
    name: "FL-T200 Fuel Tank",
    category: "tank",
    mass: 1.25,
    height: 4.0,
    radius: 1.25,
    color: "#6f8f3a",
    modules: [{ type: "fuelTank", capacity: 1600, initialFuel: 1600 }],
    aero: { dragCoefficient: 0.22, area: 6.5 },
  },
  "engine.solid-srb": {
    id: "engine.solid-srb",
    name: "RTSR-2 Solid Booster",
    category: "engine",
    mass: 4.5,
    height: 7.0,
    radius: 1.25,
    color: "#c47030",
    modules: [
      { type: "fuelTank", capacity: 4_200, initialFuel: 4_200 },
      { type: "engine", thrust: 2_500_000, isp: 235, fuelRate: 0, gimbal: 0 },
    ],
    aero: { dragCoefficient: 0.28, area: 5.5 },
  },
  "engine.lv-t45": {
    id: "engine.lv-t45",
    name: "LV-T45 Liquid Engine",
    category: "engine",
    mass: 1.5,
    height: 1.3,
    radius: 1.25,
    color: "#9aa0a8",
    modules: [{ type: "engine", thrust: 1_650_000, isp: 318, fuelRate: 0, gimbal: 3 }],
    aero: { dragCoefficient: 0.26, area: 2.0 },
  },
  "decoupler.tr-18": {
    id: "decoupler.tr-18",
    name: "TR-18A Stack Decoupler",
    category: "decoupler",
    mass: 0.1,
    height: 0.5,
    radius: 1.25,
    color: "#3c4248",
    modules: [{ type: "decoupler" }],
    aero: { dragCoefficient: 0.18, area: 1.2 },
  },
  "fins.basic": {
    id: "fins.basic",
    name: "AV-R8 Winglet",
    category: "structural",
    mass: 0.08,
    height: 1.0,
    radius: 1.25,
    color: "#2e3640",
    modules: [],
    aero: { dragCoefficient: 0.12, area: 1.8 },
  },
};

/** parts[0] = stack top (probe). parts[n-1] = bottom (engine/fins). Decoupler on spent stage. */
/** Two-stage Kerbin launcher: solids + core stage (design §10 early rockets). */
export const DEFAULT_CRAFT: CraftDefinition = {
  name: "Kerbin Express Mk1",
  parts: [
    { instanceId: "p1", definitionId: "probe.core", stage: 2 },
    { instanceId: "p2", definitionId: "tank.rt-5", stage: 2 },
    { instanceId: "p3", definitionId: "engine.lv-t45", stage: 2 },
    { instanceId: "p4", definitionId: "decoupler.tr-18", stage: 1 },
    { instanceId: "p5", definitionId: "tank.fl-t200", stage: 1 },
    { instanceId: "p6", definitionId: "engine.lv-t45", stage: 1 },
    { instanceId: "p7", definitionId: "engine.solid-srb", stage: 1 },
    { instanceId: "p8", definitionId: "engine.solid-srb", stage: 1 },
    { instanceId: "p9", definitionId: "fins.basic", stage: 1 },
  ],
};

export const BUILDER_PART_IDS = [
  "probe.core",
  "tank.rt-5",
  "tank.fl-t200",
  "engine.lv-t45",
  "engine.solid-srb",
  "decoupler.tr-18",
  "fins.basic",
] as const;

export function getPart(id: string): PartDefinition {
  const part = PARTS[id];
  if (!part) throw new Error(`Unknown part: ${id}`);
  return part;
}
