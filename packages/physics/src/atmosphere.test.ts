import { describe, expect, it } from "vitest";
import { PLANET } from "@orbital/common";
import { atmosphereDensity, isInSpace } from "./atmosphere.js";

describe("atmosphere", () => {
  it("uses the Kármán line at 100 km", () => {
    expect(PLANET.spaceAltitude).toBe(100_000);
    expect(isInSpace(99_999)).toBe(false);
    expect(isInSpace(100_000)).toBe(true);
  });

  it("decays with scale height", () => {
    const sea = atmosphereDensity(0);
    const high = atmosphereDensity(10_000);
    expect(high).toBeLessThan(sea * 0.35);
    expect(atmosphereDensity(PLANET.atmosphereTop)).toBeLessThan(sea * 0.02);
  });
});
