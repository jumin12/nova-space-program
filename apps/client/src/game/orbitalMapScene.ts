import * as THREE from "three";
import { KSC_SITE, PLANET, VISUAL } from "@orbital/common";
import { getCelestialAssetBundle } from "./assets/assetCache.js";
import {
  createCelestialSystem,
  setCelestialRenderMode,
  updateCelestialSystem,
  type CelestialSystem,
} from "./celestialBodies.js";
import { configureRenderer, resizeRenderer } from "./renderQuality.js";
import { updateSolarBodies } from "./solarSystem.js";
import { physicsToMapGlobe, sampleGroundTrack, sampleOrbitPhysics } from "./orbitPath.js";
import { useGameStore } from "../store/gameStore.js";

const FACILITIES: { id: string; label: string; dx: number; dz: number }[] = [
  { id: "pad", label: "LC-1", dx: 0, dz: 0 },
  { id: "vab", label: "VAB", dx: VISUAL.ksc.vab.x, dz: VISUAL.ksc.vab.z },
  { id: "tracking", label: "TRK", dx: VISUAL.ksc.tracking.x, dz: VISUAL.ksc.tracking.z },
  { id: "rd", label: "R&D", dx: VISUAL.ksc.rd.x, dz: VISUAL.ksc.rd.z },
  { id: "admin", label: "ADM", dx: VISUAL.ksc.admin.x, dz: VISUAL.ksc.admin.z },
  { id: "runway", label: "RWY", dx: VISUAL.ksc.runway.x, dz: VISUAL.ksc.runway.z },
];

function kscOffsetLatLon(dx: number, dz: number) {
  const lat = KSC_SITE.latRad + dz / PLANET.radius;
  const lon = KSC_SITE.lonRad + dx / (PLANET.radius * Math.cos(KSC_SITE.latRad));
  return { lat, lon };
}

function latLonToPhysics(lat: number, lon: number): { x: number; y: number; z: number } {
  const r = PLANET.radius;
  const cl = Math.cos(lat);
  return { x: r * cl * Math.cos(lon), y: r * Math.sin(lat), z: r * cl * Math.sin(lon) };
}

function makeFacilityMarker(label: string, color: number, globeRadius: number) {
  const group = new THREE.Group();
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(globeRadius * 0.008, 12, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(globeRadius * 0.009, globeRadius * 0.013, 24),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  ring.lookAt(0, 0, 0);
  group.add(pin, ring);
  group.userData.label = label;
  return group;
}

export class OrbitalMapScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private celestial: CelestialSystem;
  private globeRadius: number;
  private facilityGroup = new THREE.Group();
  private vesselGroup = new THREE.Group();
  private orbitLine: THREE.Line;
  private groundTrack: THREE.Line;
  private sunDir = new THREE.Vector3(-0.85, 0.4, 0.25);
  private az = 0.45;
  private el = 0.32;
  private dist: number;
  private frame = 0;
  private clock = new THREE.Clock();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  constructor(private canvas: HTMLCanvasElement) {
    this.globeRadius = VISUAL.menuPlanetRadius;
    this.dist = this.globeRadius * 2.65;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    configureRenderer(this.renderer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040c);

    this.camera = new THREE.PerspectiveCamera(48, 1, 10, this.globeRadius * 20);

    this.celestial = createCelestialSystem(this.globeRadius, getCelestialAssetBundle());
    this.celestial.kerbinGroup.position.set(0, 0, 0);
    this.celestial.kerbinGroup.scale.setScalar(1);
    this.scene.add(this.celestial.root);
    setCelestialRenderMode(this.celestial, "orbit");
    this.celestial.stars.visible = true;
    this.celestial.munMesh.visible = true;

    for (const f of FACILITIES) {
      const { lat, lon } = kscOffsetLatLon(f.dx, f.dz);
      const phys = latLonToPhysics(lat, lon);
      const g = physicsToMapGlobe(phys, this.globeRadius, 120);
      const marker = makeFacilityMarker(f.label, f.id === "pad" ? 0xff8844 : 0x6fcf6f, this.globeRadius);
      marker.position.set(g.x, g.y, g.z);
      const outward = marker.position.clone().normalize();
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      this.facilityGroup.add(marker);
    }
    this.scene.add(this.facilityGroup);

    const orbitGeo = new THREE.BufferGeometry();
    const orbitMat = new THREE.LineBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.85,
    });
    this.orbitLine = new THREE.Line(orbitGeo, orbitMat);
    this.scene.add(this.orbitLine);

    const groundGeo = new THREE.BufferGeometry();
    const groundMat = new THREE.LineDashedMaterial({
      color: 0x88ffaa,
      transparent: true,
      opacity: 0.55,
      dashSize: this.globeRadius * 0.02,
      gapSize: this.globeRadius * 0.012,
    });
    this.groundTrack = new THREE.Line(groundGeo, groundMat);
    this.scene.add(this.groundTrack);

    this.vesselGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(this.globeRadius * 0.014, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffdd44 }),
      ),
    );
    const vesselRing = new THREE.Mesh(
      new THREE.RingGeometry(this.globeRadius * 0.016, this.globeRadius * 0.022, 32),
      new THREE.MeshBasicMaterial({ color: 0xffaa22, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    this.vesselGroup.add(vesselRing);
    this.vesselGroup.visible = false;
    this.scene.add(this.vesselGroup);

    this.scene.add(new THREE.AmbientLight(0x446688, 0.4));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(this.globeRadius * 2, this.globeRadius * 0.4, this.globeRadius);
    this.scene.add(sun);

    this.bindInput();
    this.resize();
    window.addEventListener("resize", this.resize);
    this.syncFromStore();
    this.animate();
  }

  private bindInput() {
    const onPointerDown = (e: PointerEvent) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const onPointerUp = () => {
      this.dragging = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.az -= dx * 0.005;
      this.el = THREE.MathUtils.clamp(this.el - dy * 0.004, -0.15, 1.25);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist * (1 + e.deltaY * 0.001), this.globeRadius * 1.45, this.globeRadius * 7.5);
    };

    this.canvas.addEventListener("pointerdown", onPointerDown);
    this.canvas.addEventListener("pointerup", onPointerUp);
    this.canvas.addEventListener("pointerleave", onPointerUp);
    this.canvas.addEventListener("pointermove", onPointerMove);
    this.canvas.addEventListener("wheel", onWheel, { passive: false });

    this.disposeInput = () => {
      this.canvas.removeEventListener("pointerdown", onPointerDown);
      this.canvas.removeEventListener("pointerup", onPointerUp);
      this.canvas.removeEventListener("pointerleave", onPointerUp);
      this.canvas.removeEventListener("pointermove", onPointerMove);
      this.canvas.removeEventListener("wheel", onWheel);
    };
  }

  private disposeInput: (() => void) | null = null;

  syncFromStore() {
    const { flight, phase } = useGameStore.getState();
    const inFlight = phase === "flight" || phase === "preflight";
    const showVessel = inFlight && (flight.launched || phase === "preflight");

    if (showVessel && (Math.abs(flight.posX) > 1 || flight.launched)) {
      const g = physicsToMapGlobe(
        { x: flight.posX, y: flight.posY, z: flight.posZ },
        this.globeRadius,
        Math.max(200, flight.altitude * 0.15),
      );
      this.vesselGroup.position.set(g.x, g.y, g.z);
      this.vesselGroup.lookAt(0, 0, 0);
      this.vesselGroup.visible = true;
    } else {
      this.vesselGroup.visible = false;
    }

    const speed = Math.hypot(flight.velX, flight.velY, flight.velZ);
    if (flight.launched && speed > 5 && flight.altitude > 200) {
      const orbitPts = sampleOrbitPhysics(
        { x: flight.posX, y: flight.posY, z: flight.posZ },
        { x: flight.velX, y: flight.velY, z: flight.velZ },
        PLANET.mu,
        180,
      );
      const orbitGlobe = orbitPts.map((p) => {
        const o = physicsToMapGlobe(p, this.globeRadius, 800);
        return new THREE.Vector3(o.x, o.y, o.z);
      });
      this.orbitLine.geometry.dispose();
      this.orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(orbitGlobe);
      this.orbitLine.visible = orbitGlobe.length > 2;

      const ground = sampleGroundTrack(orbitPts, this.globeRadius);
      const groundVec = ground.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      this.groundTrack.geometry.dispose();
      const groundGeo = new THREE.BufferGeometry().setFromPoints(groundVec);
      groundGeo.computeBoundingSphere();
      if ("computeLineDistances" in groundGeo) {
        (groundGeo as THREE.BufferGeometry & { computeLineDistances: () => void }).computeLineDistances();
      }
      this.groundTrack.geometry.dispose();
      this.groundTrack.geometry = groundGeo;
      this.groundTrack.visible = groundVec.length > 2;
    } else {
      this.orbitLine.visible = false;
      this.groundTrack.visible = false;
    }
  }

  private resize = () => {
    resizeRenderer(this.renderer, this.camera, this.canvas.clientWidth, this.canvas.clientHeight);
  };

  private animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.syncFromStore();

    updateCelestialSystem(this.celestial, dt, this.sunDir, false);
    updateSolarBodies(this.celestial.solar, this.celestial.elapsed, this.globeRadius, {
      viewMode: "map",
      showMoon: true,
      showSunMesh: true,
    });

    const x = this.dist * Math.cos(this.el) * Math.sin(this.az);
    const y = this.dist * Math.sin(this.el);
    const z = this.dist * Math.cos(this.el) * Math.cos(this.az);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.disposeInput?.();
    this.orbitLine.geometry.dispose();
    (this.orbitLine.material as THREE.Material).dispose();
    this.groundTrack.geometry.dispose();
    (this.groundTrack.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
