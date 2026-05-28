import * as THREE from "three";
import { PLANET, VISUAL } from "@orbital/common";

/** Inverted sky dome — KSP-like Rayleigh haze and sun glow. */
export function buildSkyAtmosphere(): THREE.Mesh {
  const radius = PLANET.radius * VISUAL.atmosphereTopShell * 1.04;
  const geo = new THREE.SphereGeometry(radius, 128, 80);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    uniforms: {
      uAltitude: { value: 0 },
      uAtmoTop: { value: PLANET.atmosphereTop },
      uScaleHeight: { value: PLANET.scaleHeight },
      uSunDir: { value: new THREE.Vector3(0.55, 0.25, 0.35).normalize() },
      uPlanetR: { value: PLANET.radius },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uAltitude;
      uniform float uAtmoTop;
      uniform float uScaleHeight;
      uniform vec3 uSunDir;
      uniform float uPlanetR;
      varying vec3 vWorldPos;

      void main() {
        float h = clamp(uAltitude, 0.0, uAtmoTop);
        float rho = exp(-h / uScaleHeight);
        float heightFrac = clamp(h / uAtmoTop, 0.0, 1.0);

        vec3 viewDir = normalize(vWorldPos - cameraPosition);
        float sunDot = max(dot(viewDir, uSunDir), 0.0);
        float upDot = max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0);
        float horizon = pow(1.0 - upDot, 2.0);

        vec3 zenithDeep = vec3(0.04, 0.12, 0.38);
        vec3 zenithHigh = vec3(0.18, 0.42, 0.78);
        vec3 zenith = mix(zenithHigh, zenithDeep, heightFrac);

        vec3 horizonDay = mix(vec3(0.62, 0.82, 1.0), vec3(0.95, 0.72, 0.42), pow(sunDot, 0.25));
        vec3 horizonSpace = vec3(0.02, 0.04, 0.1);
        vec3 horizonCol = mix(horizonDay, horizonSpace, heightFrac);

        vec3 col = mix(zenith, horizonCol, horizon * (0.65 + rho * 0.35));
        col += vec3(1.0, 0.92, 0.75) * pow(sunDot, 48.0) * 0.55 * rho;
        col += vec3(0.35, 0.55, 0.95) * pow(max(dot(uSunDir, vec3(0.0, 1.0, 0.0)), 0.0), 2.0) * horizon * 0.15;

        float alpha = mix(0.12, 0.82, horizon) * rho * (1.0 - heightFrac * 0.25);
        alpha = clamp(alpha, 0.0, 0.92);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sky-atmosphere";
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export function updateSkyAtmosphere(
  mesh: THREE.Mesh,
  altitudeM: number,
  sunDir: THREE.Vector3,
  visible: boolean,
) {
  mesh.visible = visible;
  const mat = mesh.material as THREE.ShaderMaterial;
  mat.uniforms.uAltitude!.value = altitudeM;
  mat.uniforms.uSunDir!.value.copy(sunDir);
}
