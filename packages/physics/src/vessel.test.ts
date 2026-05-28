import { describe, expect, it } from "vitest";
import {
  DEFAULT_CRAFT,
  DEFAULT_CONTROL,
  PHYSICS,
  PLANET,
  type CraftDefinition,
} from "@orbital/common";
import { altitude } from "./vector.js";
import { createVesselOnPad, isFlightComplete, stepVessel } from "./vessel.js";

/** Heavier stack for Earth-scale Kármán-line ascent in simulation tests. */
/** Two-stage stack sized for Earth-scale Kármán-line ascents in simulation. */
const SOUNDING_ROCKET: CraftDefinition = {
  name: "Sounding Profile",
  parts: [
    { instanceId: "p1", definitionId: "probe.core", stage: 2 },
    { instanceId: "p2", definitionId: "tank.rt-5", stage: 2 },
    { instanceId: "p3", definitionId: "engine.lv-t45", stage: 2 },
    { instanceId: "p4", definitionId: "decoupler.tr-18", stage: 1 },
    { instanceId: "p5", definitionId: "tank.fl-t200", stage: 1 },
    { instanceId: "p6", definitionId: "tank.fl-t200", stage: 1 },
    { instanceId: "p7", definitionId: "tank.fl-t200", stage: 1 },
    { instanceId: "p8", definitionId: "tank.fl-t200", stage: 1 },
    { instanceId: "p9", definitionId: "engine.solid-srb", stage: 1 },
    { instanceId: "p10", definitionId: "engine.lv-t45", stage: 1 },
  ],
};

describe("vessel simulation", () => {
  it("uses consistent planet radius for pad and altitude", () => {
    const vessel = createVesselOnPad(DEFAULT_CRAFT);
    expect(altitude(vessel.position, PLANET.radius)).toBeLessThan(50);
  });

  it("reaches high altitude on a staged sounding rocket profile", () => {
    const vessel = createVesselOnPad(SOUNDING_ROCKET);
    vessel.armed = true;
    const base = { ...DEFAULT_CONTROL, throttle: 1, launch: true };

    for (let i = 0; i < 120 * 120; i++) {
      const stage = i === 480;
      stepVessel(vessel, { ...base, stage }, PHYSICS.fixedDt);
      if (vessel.reachedSpace) break;
    }

    expect(vessel.maxAltitude).toBeGreaterThan(8_000);
    expect(vessel.maxAltitude).toBeLessThan(PLANET.spaceAltitude);
  }, 15_000);

  it("detects flight completion after reentry from suborbital hop", () => {
    const vessel = createVesselOnPad(DEFAULT_CRAFT);
    vessel.armed = true;
    const input = { ...DEFAULT_CONTROL, throttle: 1 };
    let complete = false;

    for (let i = 0; i < 30 * 610 && !complete; i++) {
      stepVessel(vessel, input, PHYSICS.fixedDt);
      if (i === 900) stepVessel(vessel, { ...input, stage: true }, PHYSICS.fixedDt);
      complete = isFlightComplete(vessel);
    }

    expect(complete).toBe(true);
  });
});
