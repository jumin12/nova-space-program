import * as THREE from "three";
import { MOON, PLANET, SUN, VISUAL } from "@orbital/common";

export type SolarViewMode = "flight" | "map" | "menu";

export type SolarBodies = {
  sunGroup: THREE.Group;
  sunMesh: THREE.Mesh;
  moonMesh: THREE.Mesh;
  sunDirection: THREE.Vector3;
};

function isEarthScale(surfaceRadius: number): boolean {
  return surfaceRadius >= VISUAL.planetRadius * 0.5;
}

/** Sun + Moon; parent to kerbinGroup so orbits are centered on the planet. */
export function createSolarBodies(surfaceRadius: number): SolarBodies {
  const sunDir = new THREE.Vector3(0.92, 0.28, 0.26).normalize();
  const earthScale = isEarthScale(surfaceRadius);

  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(VISUAL.solar.sunDisplayRadius, 48, 48),
    new THREE.MeshBasicMaterial({ color: SUN.color }),
  );
  const sunCorona = new THREE.Mesh(
    new THREE.SphereGeometry(VISUAL.solar.sunDisplayRadius * 1.35, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const sunGroup = new THREE.Group();
  sunGroup.add(sunCore, sunCorona);

  const sunDist = earthScale ? SUN.kerbinOrbitRadius : VISUAL.solar.sunMapDisplay;
  sunGroup.position.copy(sunDir).multiplyScalar(sunDist);

  const moonRadius = earthScale
    ? MOON.radius
    : MOON.radius * (surfaceRadius / PLANET.radius);
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(moonRadius, 48, 48),
    new THREE.MeshStandardMaterial({
      color: MOON.color,
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
  moonMesh.castShadow = true;

  return { sunGroup, sunMesh: sunCore, moonMesh, sunDirection: sunDir.clone().negate() };
}

export function updateSolarBodies(
  bodies: SolarBodies,
  elapsed: number,
  surfaceRadius: number,
  options: { viewMode?: SolarViewMode; showMoon?: boolean; showSunMesh?: boolean } = {},
) {
  const earthScale = isEarthScale(surfaceRadius);
  const viewMode = options.viewMode ?? (earthScale ? "flight" : "menu");

  const moonOrbit =
    viewMode === "map" || viewMode === "menu"
      ? VISUAL.solar.moonOrbitMapDisplay * (earthScale ? 1 : surfaceRadius / VISUAL.menuPlanetRadius)
      : MOON.orbitRadius;

  const moonAngle = (elapsed / MOON.orbitPeriod) * Math.PI * 2;
  bodies.moonMesh.position.set(
    Math.cos(moonAngle) * moonOrbit,
    Math.sin(moonAngle) * 0.035 * moonOrbit,
    Math.sin(moonAngle) * moonOrbit,
  );
  bodies.moonMesh.visible = options.showMoon !== false;

  const sunDist =
    viewMode === "flight" && earthScale
      ? SUN.kerbinOrbitRadius
      : earthScale
        ? VISUAL.solar.sunOrbitDisplay
        : VISUAL.solar.sunMapDisplay * (surfaceRadius / VISUAL.menuPlanetRadius);
  bodies.sunGroup.position.copy(bodies.sunDirection).negate().multiplyScalar(sunDist);
  bodies.sunGroup.visible = options.showSunMesh !== false;

  bodies.sunDirection.copy(bodies.sunGroup.position).normalize().negate();
}
