import { describe, expect, it } from "vitest";
import { DEFAULT_CRAFT } from "@orbital/common";
import {
  computeCraftStats,
  craftToDefinition,
  createCraftRuntime,
  separateStage,
} from "./craft.js";

describe("craft staging", () => {
  it("extracts spent stage instead of deleting parts", () => {
    const craft = createCraftRuntime(DEFAULT_CRAFT);
    expect(craft.activeStage).toBe(1);
    expect(craft.parts.length).toBe(6);

    const dropped = separateStage(craft);
    expect(dropped).not.toBeNull();
    expect(craft.activeStage).toBe(2);
    expect(craft.parts.length).toBe(2);
    expect(dropped!.parts.length).toBe(4);

    const def = craftToDefinition(craft);
    expect(def.parts.map((p) => p.definitionId)).toEqual(["probe.core", "tank.rt-5"]);
    expect(dropped!.parts.map((p) => p.definitionId)).toEqual([
      "decoupler.tr-18",
      "tank.fl-t200",
      "engine.lv-t45",
      "fins.basic",
    ]);
    expect(computeCraftStats(craft).hasEngine).toBe(false);
  });

  it("keeps decoupler on the spent stage", () => {
    const dec = DEFAULT_CRAFT.parts.find((p) => p.definitionId === "decoupler.tr-18");
    expect(dec?.stage).toBe(1);
  });
});
