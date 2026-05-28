import { getPart, PLANET, type CraftDefinition, type StackedPart } from "@orbital/common";

export type { CraftDefinition, StackedPart };

export type RuntimePart = {
  instanceId: string;
  definitionId: string;
  stage: number;
  attached: boolean;
  fuel: number;
  fuelCapacity: number;
};

export type CraftRuntime = {
  name: string;
  parts: RuntimePart[];
  activeStage: number;
  maxStage: number;
};

export function createCraftRuntime(craft: CraftDefinition): CraftRuntime {
  const parts: RuntimePart[] = craft.parts.map((p) => {
    const def = getPart(p.definitionId);
    const tank = def.modules.find((m) => m.type === "fuelTank");
    return {
      instanceId: p.instanceId,
      definitionId: p.definitionId,
      stage: p.stage,
      attached: true,
      fuel: tank?.type === "fuelTank" ? tank.initialFuel : 0,
      fuelCapacity: tank?.type === "fuelTank" ? tank.capacity : 0,
    };
  });
  const maxStage = parts.reduce((max, p) => Math.max(max, p.stage), 1);
  const minStage = parts.reduce((min, p) => Math.min(min, p.stage), maxStage);
  return { name: craft.name, parts, activeStage: minStage, maxStage };
}

export function getAttachedParts(craft: CraftRuntime): RuntimePart[] {
  return craft.parts.filter((p) => p.attached);
}

export function getActiveEngines(craft: CraftRuntime) {
  const engines: { thrust: number; isp: number; gimbal: number }[] = [];
  for (const part of getAttachedParts(craft)) {
    if (part.stage !== craft.activeStage) continue;
    const def = getPart(part.definitionId);
    const engine = def.modules.find((m) => m.type === "engine");
    if (engine?.type === "engine") {
      engines.push({ thrust: engine.thrust, isp: engine.isp, gimbal: engine.gimbal });
    }
  }
  return engines;
}

export function computeCraftStats(craft: CraftRuntime) {
  const attached = getAttachedParts(craft);
  let dryMass = 0;
  let fuelMass = 0;
  let thrust = 0;
  let dragArea = 0;
  let dragCoeffSum = 0;
  let height = 0;
  let hasEngine = false;
  let maxGimbal = 0;
  let avgIsp = 0;
  let ispWeight = 0;

  for (const part of attached) {
    const def = getPart(part.definitionId);
    dryMass += def.mass * 1000;
    fuelMass += part.fuel;
    height += def.height;
    if (def.aero) {
      dragArea += def.aero.area;
      dragCoeffSum += def.aero.dragCoefficient * def.aero.area;
    }
    const engine = def.modules.find((m) => m.type === "engine");
    if (engine?.type === "engine" && part.stage === craft.activeStage) {
      thrust += engine.thrust;
      hasEngine = true;
      maxGimbal = Math.max(maxGimbal, engine.gimbal);
      avgIsp += engine.isp * engine.thrust;
      ispWeight += engine.thrust;
    }
  }

  const totalMass = dryMass + fuelMass;
  const avgDragCoeff = dragArea > 0 ? dragCoeffSum / dragArea : 0.3;
  const twr = totalMass > 0 ? thrust / (totalMass * PLANET.surfaceGravity) : 0;
  const seaLevelThrust = attached.reduce((sum, part) => {
    if (part.stage !== craft.activeStage) return sum;
    const def = getPart(part.definitionId);
    const engine = def.modules.find((m) => m.type === "engine");
    if (engine?.type === "engine") {
      return sum + engine.thrust * 0.82;
    }
    return sum;
  }, 0);
  const twrSeaLevel = totalMass > 0 ? seaLevelThrust / (totalMass * PLANET.surfaceGravity) : 0;
  const vacuumIsp = ispWeight > 0 ? avgIsp / ispWeight : 280;

  return {
    dryMass,
    fuelMass,
    totalMass,
    thrust,
    dragArea,
    avgDragCoeff,
    height,
    hasEngine,
    twr,
    twrSeaLevel,
    maxGimbal,
    vacuumIsp,
    fuelRemaining: attached.reduce((sum, p) => sum + p.fuel, 0),
    totalMassTonnes: totalMass / 1000,
  };
}

/** Detach and extract the active stage (KSP-style — spent stack becomes its own craft). */
export function separateStage(craft: CraftRuntime): CraftRuntime | null {
  if (craft.activeStage >= craft.maxStage) return null;
  const stageToDrop = craft.activeStage;
  const dropped = craft.parts.filter((p) => p.stage === stageToDrop);
  if (!dropped.length) return null;

  craft.parts = craft.parts.filter((p) => p.stage !== stageToDrop);
  craft.activeStage += 1;
  craft.maxStage = craft.parts.reduce((max, p) => Math.max(max, p.stage), 1);

  return {
    name: `${craft.name} (stage ${stageToDrop})`,
    parts: dropped.map((p) => ({ ...p, attached: true })),
    activeStage: stageToDrop,
    maxStage: stageToDrop,
  };
}

/** @deprecated Use separateStage — kept for tests. */
export function stageCraft(craft: CraftRuntime): boolean {
  return separateStage(craft) !== null;
}

export function hasUsableFuel(craft: CraftRuntime, minKg = 0.5): boolean {
  const activeFuel = getAttachedParts(craft)
    .filter((p) => p.stage === craft.activeStage)
    .reduce((sum, p) => sum + p.fuel, 0);
  return activeFuel > minKg;
}

export function consumeFuel(craft: CraftRuntime, amount: number): number {
  let remaining = amount;
  const attached = getAttachedParts(craft)
    .filter((p) => p.fuel > 0 && p.stage === craft.activeStage)
    .sort((a, b) => a.stage - b.stage);

  for (const part of attached) {
    if (remaining <= 0) break;
    const used = Math.min(part.fuel, remaining);
    part.fuel -= used;
    remaining -= used;
  }
  return amount - remaining;
}

export function addPartToStackTop(craft: CraftRuntime, definitionId: string, stage = 1): StackedPart {
  const id = `p${craft.parts.length + 1}-${Date.now().toString(36)}`;
  const def = getPart(definitionId);
  const tank = def.modules.find((m) => m.type === "fuelTank");
  const part: RuntimePart = {
    instanceId: id,
    definitionId,
    stage,
    attached: true,
    fuel: tank?.type === "fuelTank" ? tank.initialFuel : 0,
    fuelCapacity: tank?.type === "fuelTank" ? tank.capacity : 0,
  };
  craft.parts.unshift(part);
  craft.maxStage = craft.parts.reduce((max, p) => Math.max(max, p.stage), 1);
  return { instanceId: id, definitionId, stage };
}

export function addPartToStackBottom(craft: CraftRuntime, definitionId: string, stage = 1): StackedPart {
  return addPartToCraft(craft, definitionId, stage);
}

export function addPartToCraft(craft: CraftRuntime, definitionId: string, stage = 1): StackedPart {
  const id = `p${craft.parts.length + 1}-${Date.now().toString(36)}`;
  const def = getPart(definitionId);
  const tank = def.modules.find((m) => m.type === "fuelTank");
  craft.parts.push({
    instanceId: id,
    definitionId,
    stage,
    attached: true,
    fuel: tank?.type === "fuelTank" ? tank.initialFuel : 0,
    fuelCapacity: tank?.type === "fuelTank" ? tank.capacity : 0,
  });
  craft.maxStage = craft.parts.reduce((max, p) => Math.max(max, p.stage), 1);
  if (craft.activeStage < 1) craft.activeStage = craft.maxStage;
  return { instanceId: id, definitionId, stage };
}

export function removePartById(craft: CraftRuntime, instanceId: string): boolean {
  if (craft.parts.length <= 1) return false;
  const idx = craft.parts.findIndex((p) => p.instanceId === instanceId);
  if (idx < 0) return false;
  craft.parts.splice(idx, 1);
  craft.maxStage = craft.parts.reduce((max, p) => Math.max(max, p.stage), 1);
  craft.activeStage = Math.min(craft.activeStage, craft.maxStage);
  return true;
}

export function setPartStage(craft: CraftRuntime, instanceId: string, stage: number): boolean {
  const part = craft.parts.find((p) => p.instanceId === instanceId);
  if (!part) return false;
  part.stage = Math.max(1, Math.min(10, stage));
  craft.maxStage = craft.parts.reduce((max, p) => Math.max(max, p.stage), 1);
  return true;
}

/** Reorder stack (index 0 = top of rocket, matching VAB / rocketMesh). */
export function reorderPartInStack(craft: CraftRuntime, instanceId: string, toIndex: number): boolean {
  const from = craft.parts.findIndex((p) => p.instanceId === instanceId);
  if (from < 0) return false;
  const [part] = craft.parts.splice(from, 1);
  const to = Math.max(0, Math.min(craft.parts.length, toIndex));
  craft.parts.splice(to, 0, part);
  return true;
}

/** Move part to another stage; inserts after last part of that stage in the stack. */
export function movePartToStage(craft: CraftRuntime, instanceId: string, targetStage: number): boolean {
  const from = craft.parts.findIndex((p) => p.instanceId === instanceId);
  if (from < 0) return false;
  const stage = Math.max(1, Math.min(10, targetStage));
  const [part] = craft.parts.splice(from, 1);
  part.stage = stage;

  let insertAt = craft.parts.length;
  for (let i = craft.parts.length - 1; i >= 0; i--) {
    if (craft.parts[i]!.stage === stage) {
      insertAt = i + 1;
      break;
    }
  }
  craft.parts.splice(insertAt, 0, part);
  craft.maxStage = craft.parts.reduce((max, p) => Math.max(max, p.stage), 1);
  return true;
}

export function removeLastPart(craft: CraftRuntime): boolean {
  if (craft.parts.length <= 1) return false;
  craft.parts.pop();
  craft.maxStage = craft.parts.reduce((max, p) => Math.max(max, p.stage), 1);
  craft.activeStage = Math.min(craft.activeStage, craft.maxStage);
  return true;
}

export function craftToDefinition(craft: CraftRuntime, attachedOnly = false): CraftDefinition {
  const source = attachedOnly ? getAttachedParts(craft) : craft.parts;
  return {
    name: craft.name,
    parts: source.map((p) => ({
      instanceId: p.instanceId,
      definitionId: p.definitionId,
      stage: p.stage,
    })),
  };
}
