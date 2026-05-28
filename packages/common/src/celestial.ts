import { PLANET } from "./types.js";

/** Moon at Earth-scale distance (visual + future SOI). */
export const MOON = {
  id: "mun",
  name: "Mun",
  radius: 1_737_400,
  mu: 4.904_869_5e12,
  orbitRadius: 384_400_000,
  orbitPeriod: 2_360_584,
  surfaceGravity: 1.62,
  color: "#8a8a92",
} as const;

export const SUN = {
  id: "sun",
  name: "Kerbol",
  radius: 696_000_000,
  kerbinOrbitRadius: 149_597_870_700,
  kerbinOrbitPeriod: 31_557_600,
  color: "#fff4e0",
} as const;

export const KERBIN = PLANET;
