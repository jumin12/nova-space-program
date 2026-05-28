import { PLANET } from "@orbital/common";

export function atmosphereDensity(altitudeMeters: number): number {
  if (altitudeMeters >= PLANET.atmosphereTop) return 0;
  const h = Math.max(0, altitudeMeters);
  return PLANET.seaLevelDensity * Math.exp(-h / PLANET.scaleHeight);
}

/** 0–1, KSP-like falloff for drag and visuals. */
export function atmosphereDensityRatio(altitudeMeters: number): number {
  return atmosphereDensity(altitudeMeters) / PLANET.seaLevelDensity;
}

export function dynamicPressure(density: number, speed: number): number {
  return 0.5 * density * speed * speed;
}

export function ispAtAltitude(vacuumIsp: number, altitudeMeters: number): number {
  if (altitudeMeters >= PLANET.atmosphereTop) return vacuumIsp;
  const pressureRatio = atmosphereDensity(altitudeMeters) / PLANET.seaLevelDensity;
  const seaLevelIsp = vacuumIsp * 0.82;
  return seaLevelIsp + (vacuumIsp - seaLevelIsp) * (1 - pressureRatio);
}

export function thrustAtAltitude(ratedVacuumThrust: number, vacuumIsp: number, altitudeMeters: number): number {
  const isp = ispAtAltitude(vacuumIsp, altitudeMeters);
  return ratedVacuumThrust * (isp / vacuumIsp);
}

export function machNumber(speed: number, altitudeMeters: number): number {
  const temp = 288.15 - 0.0065 * Math.min(altitudeMeters, 11000);
  const speedOfSound = Math.sqrt(1.4 * 287 * Math.max(180, temp));
  return speed / speedOfSound;
}

/** Space begins at the Kármán line (100 km on Earth-scale Kerbin). */
export function isInSpace(altitudeMeters: number): boolean {
  return altitudeMeters >= PLANET.spaceAltitude;
}

/** Approximate gravity magnitude at altitude (m/s²) for pad / UI checks. */
export function gravityAtAltitude(altitudeMeters: number): number {
  const r = PLANET.radius + Math.max(0, altitudeMeters);
  return PLANET.mu / (r * r);
}
