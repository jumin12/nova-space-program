import * as THREE from "three";

type Particle = {
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  heat: number;
};

const MAX_FLAME = 200;
const MAX_SMOKE = 360;

/**
 * Exhaust in rocket local space: -Y is out the engine bell.
 * Parent this group to the rocket stack (bottom at y≈0).
 */
export class RocketExhaust {
  readonly group = new THREE.Group();
  private flame: Particle[] = [];
  private smoke: Particle[] = [];
  private flameGeo = new THREE.BufferGeometry();
  private smokeGeo = new THREE.BufferGeometry();
  private flamePoints: THREE.Points;
  private smokePoints: THREE.Points;
  private glow: THREE.Mesh;
  private engineLight: THREE.PointLight;
  private nozzleY = 0;

  constructor() {
    const flameMat = new THREE.PointsMaterial({
      size: 5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      color: 0xffffff,
    });
    const smokeMat = new THREE.PointsMaterial({
      size: 8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      vertexColors: true,
      color: 0xaaaaaa,
    });

    this.flamePoints = new THREE.Points(this.flameGeo, flameMat);
    this.smokePoints = new THREE.Points(this.smokeGeo, smokeMat);
    this.flamePoints.frustumCulled = false;
    this.smokePoints.frustumCulled = false;
    this.flamePoints.renderOrder = 10;
    this.smokePoints.renderOrder = 9;

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff9922,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.5, 16, 1, true), glowMat);
    this.glow.rotation.x = Math.PI;
    this.glow.position.y = -0.5;
    this.glow.renderOrder = 8;

    this.engineLight = new THREE.PointLight(0xffaa55, 0, 40, 2);
    this.engineLight.position.y = -0.8;

    this.group.add(this.smokePoints, this.flamePoints, this.glow, this.engineLight);
  }

  dispose() {
    this.flameGeo.dispose();
    this.smokeGeo.dispose();
    (this.flamePoints.material as THREE.Material).dispose();
    (this.smokePoints.material as THREE.Material).dispose();
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
  }

  /** Local Y of engine bell (stack builds from y=0 at bottom). */
  setNozzleY(y: number) {
    this.nozzleY = y;
    this.group.position.set(0, y, 0);
  }

  burst(throttle: number) {
    for (let i = 0; i < 30; i++) this.spawnFlame(throttle, true);
    for (let i = 0; i < 50; i++) this.spawnSmoke(throttle, true);
  }

  update(dt: number, active: boolean, throttle: number) {
    const power = active ? throttle : 0;

    if (power > 0.02) {
      const nF = Math.floor(8 + power * 28);
      const nS = Math.floor(4 + power * 16);
      for (let i = 0; i < nF; i++) this.spawnFlame(power, false);
      for (let i = 0; i < nS; i++) this.spawnSmoke(power, false);
    }

    this.integrate(this.flame, dt, true);
    this.integrate(this.smoke, dt, false);
    this.pushGeometry(this.flame, this.flameGeo, true);
    this.pushGeometry(this.smoke, this.smokeGeo, false);

    const on = power > 0.03;
    this.flamePoints.visible = on && this.flame.length > 0;
    this.smokePoints.visible = on && this.smoke.length > 0;
    this.glow.visible = on;
    this.engineLight.intensity = on ? 1.5 + power * 3 : 0;
    if (on) {
      const s = 0.7 + power * 1.6;
      this.glow.scale.set(s, s * (1.1 + power * 0.6), s);
      (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.25 + power * 0.45;
    }
  }

  private integrate(list: Particle[], dt: number, flame: boolean) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      const drag = flame ? 0.88 : 0.92;
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      if (!flame) {
        p.vy += dt * 2.5;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += dt * (flame ? 2 : 5);
      p.heat *= 1 - dt * (flame ? 1.8 : 0.5);
    }
  }

  private pushGeometry(list: Particle[], geo: THREE.BufferGeometry, flame: boolean) {
    const n = list.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = list[i]!;
      const t = p.life / p.maxLife;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      if (flame) {
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.35 + p.heat * 0.55;
        col[i * 3 + 2] = 0.05;
      } else {
        const g = 0.25 + (1 - t) * 0.35;
        col[i * 3] = g;
        col[i * 3 + 1] = g;
        col[i * 3 + 2] = g + 0.05;
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setDrawRange(0, n);
  }

  private spawnFlame(throttle: number, burst: boolean) {
    if (this.flame.length >= MAX_FLAME) this.flame.shift();
    const spread = burst ? 0.9 : 0.35 + throttle * 0.4;
    const life = burst ? 0.15 + Math.random() * 0.25 : 0.08 + Math.random() * 0.18;
    this.flame.push({
      life,
      maxLife: life,
      x: (Math.random() - 0.5) * spread,
      y: -0.2 - Math.random() * 0.4,
      z: (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 2,
      vy: -(12 + Math.random() * 22 * throttle),
      vz: (Math.random() - 0.5) * 2,
      size: burst ? 2.5 : 1.5,
      heat: 0.9,
    });
  }

  private spawnSmoke(throttle: number, burst: boolean) {
    if (this.smoke.length >= MAX_SMOKE) this.smoke.shift();
    const spread = burst ? 1.4 : 0.6 + throttle * 0.5;
    const life = burst ? 1.8 + Math.random() * 1.5 : 1 + Math.random() * 1.5;
    this.smoke.push({
      life,
      maxLife: life,
      x: (Math.random() - 0.5) * spread,
      y: -0.4 - Math.random() * 0.6,
      z: (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -(4 + Math.random() * 8 * throttle),
      vz: (Math.random() - 0.5) * 1.5,
      size: burst ? 3 : 2,
      heat: 0.2,
    });
  }
}
