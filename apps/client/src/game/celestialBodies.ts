import * as THREE from "three";
import { PLANET, VISUAL } from "@orbital/common";
import type { CelestialAssetBundle } from "./assets/types.js";
import { createSolarBodies, updateSolarBodies, type SolarBodies } from "./solarSystem.js";

export type CelestialRenderMode = "orbit" | "surface" | "space";

export type CelestialSystem = {
  root: THREE.Group;
  kerbinGroup: THREE.Group;
  kerbinMesh: THREE.Mesh;
  planetSun: THREE.DirectionalLight;
  planetFill: THREE.HemisphereLight;
  atmosphere: THREE.Mesh;
  atmosphereInner: THREE.Mesh;
  cloudGroup: THREE.Group;
  munMesh: THREE.Mesh;
  sunMesh: THREE.Mesh;
  stars: THREE.Points;
  solar: SolarBodies;
  elapsed: number;
};

function createPlanetMaterial(assets: CelestialAssetBundle): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: assets.planetMap,
    normalMap: assets.planetNormal,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.88,
    metalness: 0.01,
    color: new THREE.Color(0xffffff),
  });
  mat.map!.colorSpace = THREE.SRGBColorSpace;
  return mat;
}

export type AscentPresentation = {
  blend: number;
  launched: boolean;
  menu: boolean;
  altitudeM: number;
  surfaceNear?: boolean;
};

function createAtmosphereMaterial(side: THREE.Side): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side,
    uniforms: {
      uColorInner: { value: new THREE.Color(0x88c8f0) },
      uColorOuter: { value: new THREE.Color(0x1a4a8a) },
      uIntensity: { value: 1.35 },
      uDensity: { value: 1 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorInner;
      uniform vec3 uColorOuter;
      uniform float uIntensity;
      uniform float uDensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
        vec3 col = mix(uColorInner, uColorOuter, fresnel);
        float alpha = fresnel * uIntensity * uDensity;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
      }
    `,
  });
}

export function createCelestialSystem(surfaceRadius: number, assets: CelestialAssetBundle): CelestialSystem {
  const root = new THREE.Group();
  const kerbinGroup = new THREE.Group();
  root.add(kerbinGroup);

  const solar = createSolarBodies(surfaceRadius);

  const planetSun = new THREE.DirectionalLight(0xfff4e6, 4.2);
  planetSun.castShadow = false;
  kerbinGroup.add(planetSun);
  const planetFill = new THREE.HemisphereLight(0xd8e8ff, 0x3d5c34, 0.48);
  kerbinGroup.add(planetFill);

  /** Y-up sphere: north pole +Y, equator in XZ — matches equirectangular texture. */
  const kerbinMesh = new THREE.Mesh(
    new THREE.SphereGeometry(surfaceRadius, 256, 256),
    createPlanetMaterial(assets),
  );
  kerbinMesh.receiveShadow = true;
  kerbinMesh.frustumCulled = false;
  kerbinMesh.rotation.z = VISUAL.kscPlanetMeshRotationZ;
  kerbinGroup.add(kerbinMesh);

  kerbinGroup.add(solar.sunGroup);
  kerbinGroup.add(solar.moonMesh);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(surfaceRadius * VISUAL.atmosphereTopShell, 96, 96),
    createAtmosphereMaterial(THREE.BackSide),
  );
  atmosphere.rotation.z = VISUAL.kscPlanetMeshRotationZ;
  kerbinGroup.add(atmosphere);

  const atmosphereInner = new THREE.Mesh(
    new THREE.SphereGeometry(surfaceRadius * VISUAL.atmosphereShell, 96, 96),
    createAtmosphereMaterial(THREE.FrontSide),
  );
  atmosphereInner.rotation.z = VISUAL.kscPlanetMeshRotationZ;
  atmosphereInner.renderOrder = 1;
  kerbinGroup.add(atmosphereInner);

  const cloudTex = assets.cloudMap;
  cloudTex.wrapS = THREE.RepeatWrapping;
  cloudTex.wrapT = THREE.ClampToEdgeWrapping;
  const cloudGroup = new THREE.Group();
  cloudGroup.rotation.z = VISUAL.kscPlanetMeshRotationZ;
  for (let i = 0; i < VISUAL.cloudLayers.length; i++) {
    const scale = VISUAL.cloudLayers[i]!;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(surfaceRadius * scale, 64, 64),
      new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.1 + i * 0.03,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        depthTest: true,
      }),
    );
    cloudGroup.add(shell);
  }
  kerbinGroup.add(cloudGroup);

  if (assets.munMap) {
    const moonMat = solar.moonMesh.material as THREE.MeshStandardMaterial;
    moonMat.map = assets.munMap;
    moonMat.map.colorSpace = THREE.SRGBColorSpace;
    moonMat.color.set(0xffffff);
  }

  const starGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(3500 * 3);
  for (let i = 0; i < 3500; i++) {
    const r = surfaceRadius * 4 + Math.random() * surfaceRadius * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: surfaceRadius * 0.00022,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  root.add(stars);

  return {
    root,
    kerbinGroup,
    kerbinMesh,
    planetSun,
    planetFill,
    atmosphere,
    atmosphereInner,
    cloudGroup,
    munMesh: solar.moonMesh,
    sunMesh: solar.sunMesh,
    stars,
    solar,
    elapsed: 0,
  };
}

export function setCelestialRenderMode(system: CelestialSystem, mode: CelestialRenderMode) {
  const showPlanet = mode !== "surface";
  system.kerbinMesh.visible = showPlanet;
  const planetMat = system.kerbinMesh.material as THREE.MeshStandardMaterial;
  planetMat.opacity = 1;
  planetMat.transparent = false;
  system.atmosphere.visible = showPlanet;
  system.atmosphereInner.visible = showPlanet;
  system.cloudGroup.visible = showPlanet;
  system.munMesh.visible = mode !== "surface";
  system.stars.visible = mode === "space" || mode === "orbit";
  system.solar.sunGroup.visible = mode === "space" || mode === "orbit";
}

function atmosphereDensityVisual(altitudeM: number): number {
  if (altitudeM >= PLANET.atmosphereTop) return 0;
  return Math.exp(-altitudeM / PLANET.scaleHeight);
}

export function applyAscentPresentation(system: CelestialSystem, state: AscentPresentation) {
  if (state.menu) {
    setCelestialRenderMode(system, "orbit");
    return;
  }

  const b = THREE.MathUtils.clamp(state.blend, 0, 1);
  const rho = atmosphereDensityVisual(state.altitudeM);
  const planetMat = system.kerbinMesh.material as THREE.MeshStandardMaterial;
  const atmoMat = system.atmosphere.material as THREE.ShaderMaterial;
  const atmoInnerMat = system.atmosphereInner.material as THREE.ShaderMaterial;
  const nearSurface = !!state.surfaceNear && !state.launched;

  if (nearSurface) {
    system.kerbinMesh.visible = true;
    planetMat.transparent = false;
    planetMat.opacity = 1;
    system.atmosphere.visible = false;
    system.atmosphereInner.visible = false;
    system.cloudGroup.visible = false;
    system.munMesh.visible = true;
    system.stars.visible = false;
    system.solar.sunGroup.visible = false;
    return;
  }

  const atmoIntensity = THREE.MathUtils.lerp(0.2, 0.75, rho) * (state.launched ? 0.85 : 0.65);
  atmoMat.uniforms.uDensity!.value = rho;
  atmoInnerMat.uniforms.uDensity!.value = rho;
  atmoMat.uniforms.uIntensity!.value = atmoIntensity;
  atmoInnerMat.uniforms.uIntensity!.value = atmoIntensity * 1.15;

  if (state.launched) {
    system.kerbinMesh.visible = true;
    planetMat.transparent = false;
    planetMat.opacity = 1;
    system.atmosphere.visible = rho > 0.002;
    system.atmosphereInner.visible = rho > 0.002;
    system.cloudGroup.visible = state.altitudeM < PLANET.atmosphereTop * 0.85;
    for (let i = 0; i < system.cloudGroup.children.length; i++) {
      const m = (system.cloudGroup.children[i] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m.opacity = (0.14 + i * 0.04) * rho;
    }
    system.munMesh.visible = true;
    system.stars.visible = b > 0.25;
    system.solar.sunGroup.visible = b > 0.45;
    return;
  }

  system.kerbinMesh.visible = true;
  planetMat.transparent = false;
  planetMat.opacity = 1;
  system.atmosphere.visible = true;
  system.atmosphereInner.visible = true;
  system.cloudGroup.visible = rho > 0.06;
  system.munMesh.visible = false;
  system.stars.visible = false;
  system.solar.sunGroup.visible = false;
}

export function updateCelestialSystem(
  system: CelestialSystem,
  dt: number,
  sunLitDirection: THREE.Vector3,
  animateOrbit = false,
) {
  system.elapsed += dt;

  system.kerbinMesh.rotation.y += dt * 0.0008;
  system.cloudGroup.rotation.y += dt * 0.0012;

  const planetR = (system.kerbinMesh.geometry as THREE.SphereGeometry).parameters.radius;
  const mapView = planetR < VISUAL.planetRadius * 0.01;
  updateSolarBodies(system.solar, system.elapsed, planetR, {
    viewMode: mapView ? "map" : "flight",
    showMoon: true,
    showSunMesh: mapView || system.kerbinMesh.visible,
  });

  sunLitDirection.copy(system.solar.sunDirection);
  system.planetSun.position.copy(system.solar.sunDirection).multiplyScalar(-planetR * 3);
  system.planetSun.target = system.kerbinMesh;
}
