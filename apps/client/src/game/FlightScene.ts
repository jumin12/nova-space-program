import * as THREE from "three";
import { atmosphereDensity } from "@orbital/physics";
import { getPart, physicsToSurfaceVisual, PLANET, VISUAL } from "@orbital/common";
import type { CraftDefinition, DebrisSnapshot } from "@orbital/common";
import { FlightDebrisVisuals, type DebrisAnchor } from "./flightDebris.js";
import { buildRocketMesh, computeComOffset } from "./rocketMesh.js";
import {
  applyAscentPresentation,
  createCelestialSystem,
  setCelestialRenderMode,
  updateCelestialSystem,
  type CelestialSystem,
} from "./celestialBodies.js";
import { buildKscFacilities, buildLaunchPad } from "./kscFacilities.js";
import { buildSkyAtmosphere, updateSkyAtmosphere } from "./skyAtmosphere.js";
import { buildSurfaceTerrain } from "./surfaceTerrain.js";
import { buildVabSite, VAB_ROCKET_Y } from "./vabSite.js";
import { defaultAttachForPart, pickVab, updatePlacementGhost } from "./vabEditor.js";
import { planetQuatToThree } from "./surfaceVisual.js";
import { RocketExhaust } from "./rocketExhaust.js";
import { configureRenderer, resizeRenderer } from "./renderQuality.js";
import type { CelestialAssetBundle } from "./assets/types.js";

export type FlightTelemetry = {
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  rotW: number;
  launched: boolean;
  armed: boolean;
  throttle: number;
  altitude: number;
  fuelRemaining: number;
};

export type FlightProvider = () => {
  phase: string;
  flight: FlightTelemetry;
  debris: DebrisSnapshot[];
};

export const VISUAL_SCALE = VISUAL.worldScale;
const PLANET_RENDER_R = VISUAL.planetRadius;
const KSC = VISUAL.ksc;

export type SceneViewMode = "menu" | "kerbin";
export type KerbinSubMode = "ksc" | "vab" | "pad" | "chase";

export type CameraInput = {
  orbitX: number;
  orbitY: number;
  zoom: number;
};

export class FlightScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private celestial!: CelestialSystem;
  private worldRoot = new THREE.Group();
  private surfaceRoot = new THREE.Group();
  private terrainGroup: THREE.Group;
  private kscGroup: THREE.Group;
  private padGroup: THREE.Group;
  private vabSiteGroup: THREE.Group;
  private vabExterior: THREE.Object3D | null = null;
  private vabRocketStand = new THREE.Group();
  private rocketGroup = new THREE.Group();
  private exhaust = new RocketExhaust();
  private debrisVisuals = new FlightDebrisVisuals();
  private comMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.85 }),
  );
  private raycaster = new THREE.Raycaster();
  private sunLight: THREE.DirectionalLight;
  private sunTarget = new THREE.Object3D();
  private animationId = 0;
  private cameraPos = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private rocketHeight = 10;
  private launched = false;
  private throttle = 0;
  private enginesLit = false;
  private viewMode: SceneViewMode = "menu";
  private kerbinSub: KerbinSubMode = "ksc";
  private vabRoll = 0;
  private attachNodes = new THREE.Group();
  private placingGhost: THREE.Group | null = null;
  private placingPartId: string | null = null;
  private clock = new THREE.Clock();
  private orbit = { azimuth: 0.65, elevation: 0.38, distance: 45 };
  private sunDir = new THREE.Vector3(-1, 0.35, 0.25);
  private flightFocus = new THREE.Vector3();
  /** Smoothed 0 (ground) → 1 (space) for seamless ascent visuals */
  private ascentBlend = 0;
  private flightProvider: FlightProvider | null = null;
  private targetFlightPos = new THREE.Vector3();
  private displayFlightPos = new THREE.Vector3();
  private hoverAttach: "top" | "bottom" = "top";
  private chaseLook = new THREE.Vector3();
  private tmpWorldPos = new THREE.Vector3();
  private tmpWorldQuat = new THREE.Quaternion();
  private skyAtmosphere: THREE.Mesh;
  private flightAltitudeM = 0;
  private lastDebrisCount = 0;
  private debrisAnchor = new THREE.Vector3();
  private debrisAnchorQuat = new THREE.Quaternion();
  private sceneFog: THREE.FogExp2 | null = null;
  private fogColor = new THREE.Color();

  private defaultOrbit: Record<SceneViewMode, typeof this.orbit> = {
    menu: { azimuth: 0.12, elevation: 0.32, distance: 28000 },
    kerbin: { azimuth: -0.48, elevation: 0.11, distance: 420 },
  };

  private kerbinOrbits: Record<KerbinSubMode, typeof this.orbit> = {
    ksc: { azimuth: -0.55, elevation: 0.22, distance: 520 },
    vab: { azimuth: -0.62, elevation: 0.28, distance: 38 },
    pad: { azimuth: -0.38, elevation: 0.18, distance: 108 },
    chase: { azimuth: 0.48, elevation: 0.2, distance: 92 },
  };

  constructor(canvas: HTMLCanvasElement, celestialAssets: CelestialAssetBundle) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    configureRenderer(this.renderer);
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040c);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 800_000_000);
    this.cameraPos.set(120, 45, 180);

    this.sunLight = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunTarget);
    this.sunLight.target = this.sunTarget;

    this.scene.add(new THREE.HemisphereLight(0xb8dcff, 0x4a6a42, 0.55));
    this.scene.add(new THREE.AmbientLight(0x6688aa, 0.28));

    this.celestial = createCelestialSystem(PLANET_RENDER_R, celestialAssets);
    this.worldRoot.add(this.celestial.root);

    this.skyAtmosphere = buildSkyAtmosphere();
    this.skyAtmosphere.position.set(0, -PLANET_RENDER_R, 0);
    this.worldRoot.add(this.skyAtmosphere);

    this.terrainGroup = buildSurfaceTerrain();
    this.surfaceRoot.add(this.terrainGroup);

    this.kscGroup = buildKscFacilities();
    this.surfaceRoot.add(this.kscGroup);
    this.vabExterior = this.kscGroup.getObjectByName("vab-exterior") ?? null;

    this.padGroup = buildLaunchPad();
    this.kscGroup.add(this.padGroup);

    this.vabSiteGroup = buildVabSite();
    this.vabSiteGroup.position.set(KSC.vab.x, 0, KSC.vab.z);
    this.vabRocketStand.position.set(0, VAB_ROCKET_Y, 0);
    this.vabSiteGroup.add(this.vabRocketStand);
    this.surfaceRoot.add(this.vabSiteGroup);

    this.worldRoot.add(this.surfaceRoot);
    this.scene.add(this.worldRoot);

    this.rocketGroup.add(this.attachNodes);
    this.rocketGroup.add(this.exhaust.group);
    this.exhaust.setNozzleY(0);
    this.worldRoot.add(this.rocketGroup);
    this.worldRoot.add(this.debrisVisuals.root);

    this.resize();
    window.addEventListener("resize", this.resize);
    this.updateWorldPresentation(0);
    this.setViewMode("menu");
    this.setGameplayPhase("mainmenu");
    this.animate();
  }

  dispose() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.resize);
    this.exhaust.dispose();
    this.debrisVisuals.clear();
    this.renderer.dispose();
  }

  setFlightProvider(provider: FlightProvider | null) {
    this.flightProvider = provider;
  }

  pickVabAttachNode(clientX: number, clientY: number): "top" | "bottom" | null {
    if (this.kerbinSub !== "vab") return null;
    const r = pickVab(this.raycaster, this.rocketGroup, clientX, clientY, this.canvas, this.camera);
    return r.type === "attach" ? r.attach : null;
  }

  private getFlightAltitudeM(): number {
    if (this.launched) return Math.max(0, this.flightAltitudeM, this.rocketGroup.position.y);
    return 0;
  }

  private applyPlanetLayout() {
    const menu = this.viewMode === "menu";
    const scale = menu ? VISUAL.menuPlanetRadius / PLANET_RENDER_R : 1;
    this.celestial.kerbinGroup.scale.setScalar(scale);
    if (menu) {
      this.celestial.kerbinGroup.position.set(0, 0, 0);
      this.skyAtmosphere.position.set(0, 0, 0);
    } else {
      // Floating origin already moves the craft with altitude; planet center stays one radius below horizon.
      const centerY = -PLANET_RENDER_R * scale;
      this.celestial.kerbinGroup.position.set(0, centerY, 0);
      this.skyAtmosphere.position.set(0, centerY, 0);
    }
  }

  private updateWorldPresentation(dt: number) {
    const altM = this.getFlightAltitudeM();
    const onSurface =
      this.kerbinSub === "ksc" || this.kerbinSub === "pad" || this.kerbinSub === "vab";
    const targetBlend = this.launched
      ? THREE.MathUtils.smoothstep(altM, VISUAL.spaceViewFadeStart, VISUAL.spaceViewFadeEnd)
      : onSurface
        ? 1
        : 0;

    this.ascentBlend += (targetBlend - this.ascentBlend) * (1 - Math.exp(-dt * 3.5));

    if (this.viewMode === "menu") {
      this.surfaceRoot.visible = false;
      this.applyPlanetLayout();
      setCelestialRenderMode(this.celestial, "orbit");
      updateSkyAtmosphere(this.skyAtmosphere, 0, this.sunDir, false);
      return;
    }

    this.applyPlanetLayout();
    this.surfaceRoot.visible = true;

    const groundVis = this.launched ? 1 - this.ascentBlend : 1;
    this.updateSurfaceVisibility(groundVis);

    const showSky = this.launched || this.kerbinSub === "pad" || this.kerbinSub === "chase";
    updateSkyAtmosphere(this.skyAtmosphere, altM, this.sunDir, showSky);

    const rho = atmosphereDensity(altM);
    const rhoRatio = rho / PLANET.seaLevelDensity;

    applyAscentPresentation(this.celestial, {
      blend: Math.max(this.ascentBlend, this.launched ? rhoRatio * 0.15 : 0),
      launched: this.launched,
      menu: false,
      altitudeM: altM,
      surfaceNear: onSurface && !this.launched,
    });

    this.applySkyForBlend(altM, this.launched ? Math.max(this.ascentBlend, 1 - rhoRatio) : this.ascentBlend);
  }

  private updateSurfaceVisibility(groundVis: number) {
    if (this.kerbinSub === "vab") {
      this.terrainGroup.visible = false;
      this.kscGroup.visible = false;
      this.vabSiteGroup.visible = true;
      if (this.vabExterior) this.vabExterior.visible = false;
      return;
    }

    const onPadView = !this.launched && (this.kerbinSub === "ksc" || this.kerbinSub === "pad");
    this.terrainGroup.visible = onPadView;
    this.kscGroup.visible = onPadView && groundVis > 0.08;
    this.vabSiteGroup.visible = false;
    if (this.vabExterior) this.vabExterior.visible = true;
  }

  private applySkyForBlend(altitudeM: number, blend: number) {
    const b = THREE.MathUtils.clamp(blend, 0, 1);
    const rho = atmosphereDensity(altitudeM);
    const densityRatio = rho / PLANET.seaLevelDensity;
    const bg = new THREE.Color().lerpColors(new THREE.Color(0x6eb0e8), new THREE.Color(0x040810), b);
    this.fogColor.lerpColors(new THREE.Color(0xb0d8f8), new THREE.Color(0x1a2840), b);
    this.scene.background = bg;
    const fogDensity = densityRatio * THREE.MathUtils.lerp(0.000032, 0.000004, b);
    if (fogDensity > 0.000001) {
      if (!this.sceneFog) this.sceneFog = new THREE.FogExp2(this.fogColor.getHex(), fogDensity);
      this.sceneFog.color.copy(this.fogColor);
      this.sceneFog.density = fogDensity;
      this.scene.fog = this.sceneFog;
    } else {
      this.scene.fog = null;
    }
  }

  setViewMode(mode: SceneViewMode) {
    this.viewMode = mode;
    this.orbit = { ...this.defaultOrbit[mode] };
    this.worldRoot.visible = true;

    if (mode === "menu") {
      this.scene.background = new THREE.Color(0x02040c);
      this.scene.fog = null;
      this.comMarker.visible = false;
      this.rocketGroup.visible = false;
      this.exhaust.group.visible = false;
      this.ascentBlend = 0;
    } else {
      this.comMarker.visible = this.kerbinSub === "vab";
      this.refreshRocketMount();
    }
    this.updateWorldPresentation(0);
  }

  setGameplayPhase(phase: string) {
    if (phase === "mainmenu" || phase === "connecting") {
      this.setViewMode("menu");
      return;
    }

    this.setViewMode("kerbin");

    const prevSub = this.kerbinSub;

    if (phase === "build") {
      this.kerbinSub = "vab";
      this.launched = false;
      this.ascentBlend = 0;
      this.lastDebrisCount = 0;
      this.debrisVisuals.clear();
    } else if (phase === "lobby" || phase === "offline") {
      this.kerbinSub = "ksc";
      this.launched = false;
      this.ascentBlend = 0;
      this.lastDebrisCount = 0;
      this.debrisVisuals.clear();
    } else if (phase === "preflight") {
      this.kerbinSub = "pad";
      this.launched = false;
      this.ascentBlend = 0;
      this.lastDebrisCount = 0;
      this.debrisVisuals.clear();
    } else if (phase === "flight" || phase === "landed" || phase === "crashed" || phase === "space") {
      this.kerbinSub = "chase";
    }

    this.comMarker.visible = this.kerbinSub === "vab";
    this.rocketGroup.visible = this.kerbinSub === "vab" || this.kerbinSub === "pad" || this.kerbinSub === "chase";
    this.exhaust.group.visible = this.rocketGroup.visible;

    if (prevSub !== this.kerbinSub && !(prevSub === "pad" && phase === "flight")) {
      this.orbit = { ...this.kerbinOrbits[this.kerbinSub] };
    }

    this.updateWorldPresentation(0);
    this.refreshRocketMount();
    this.syncCameraTarget();
  }

  private refreshRocketMount() {
    if (this.viewMode !== "kerbin") return;

    if (this.kerbinSub === "vab") {
      this.mountRocketToVab();
    } else if (this.kerbinSub === "pad" && !this.launched) {
      this.mountRocketToPad();
    } else if (this.kerbinSub === "chase") {
      this.mountRocketToWorld();
    } else {
      this.rocketGroup.visible = false;
    }
  }

  private mountRocketToVab() {
    this.vabRocketStand.attach(this.rocketGroup);
    this.vabRocketStand.attach(this.exhaust.group);
    this.rocketGroup.position.set(0, 0, 0);
    this.rocketGroup.rotation.set(0, this.vabRoll, 0);
    this.rocketGroup.visible = true;
    this.syncCameraTarget();
  }

  private applyRocketOrientation(rotX: number, rotY: number, rotZ: number, rotW: number) {
    this.rocketGroup.quaternion.copy(planetQuatToThree({ x: rotX, y: rotY, z: rotZ, w: rotW }));
  }

  private mountRocketToPad() {
    this.padGroup.attach(this.rocketGroup);
    this.rocketGroup.position.set(0, this.rocketHeight * 0.5 + 2.5, 0);
    this.rocketGroup.visible = true;
    this.exhaust.setNozzleY(0);
  }

  private mountRocketToWorld() {
    this.worldRoot.attach(this.rocketGroup);
    this.rocketGroup.visible = true;
    this.exhaust.setNozzleY(0);
  }

  applyCameraInput(input: CameraInput) {
    this.orbit.azimuth += input.orbitX;
    this.orbit.elevation = THREE.MathUtils.clamp(this.orbit.elevation + input.orbitY, 0.05, 1.28);

    if (this.kerbinSub === "vab") {
      this.orbit.elevation = THREE.MathUtils.clamp(this.orbit.elevation, 0.08, 0.78);
      this.orbit.distance = THREE.MathUtils.clamp(
        this.orbit.distance * (1 + input.zoom),
        14,
        95,
      );
      this.syncCameraTarget();
      return;
    }

    const minDist = this.kerbinSub === "ksc" ? 80 : 16;
    const maxDist = this.kerbinSub === "ksc" ? 900 : 450;
    this.orbit.distance = THREE.MathUtils.clamp(this.orbit.distance * (1 + input.zoom), minDist, maxDist);
  }

  pickVabPart(clientX: number, clientY: number): string | null {
    if (this.kerbinSub !== "vab") return null;
    const r = pickVab(this.raycaster, this.rocketGroup, clientX, clientY, this.canvas, this.camera);
    return r.type === "part" ? r.instanceId : null;
  }

  pickVabAttach(clientX: number, clientY: number): "top" | "bottom" | null {
    return this.pickVabAttachNode(clientX, clientY);
  }

  rotateVabCraft(deltaRadians: number) {
    if (this.kerbinSub !== "vab") return;
    this.vabRoll += deltaRadians;
    this.rocketGroup.rotation.y = this.vabRoll;
  }

  updatePlacementPointer(clientX: number, clientY: number) {
    if (this.kerbinSub !== "vab" || !this.placingPartId) return;
    const node = this.pickVabAttachNode(clientX, clientY);
    if (node) this.hoverAttach = node;
    updatePlacementGhost(this.placingGhost, this.placingPartId, this.rocketHeight, this.hoverAttach);
  }

  setPlacingPart(definitionId: string | null) {
    this.placingPartId = definitionId;
    if (this.placingGhost) {
      this.rocketGroup.remove(this.placingGhost);
      this.placingGhost = null;
    }
    this.attachNodes.visible = this.kerbinSub === "vab";
    if (!definitionId) return;

    const def = getPart(definitionId);
    const ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(def.radius, def.radius * 0.96, def.height, 20),
      new THREE.MeshStandardMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    ghost.position.y = def.height * 0.5;
    this.placingGhost = new THREE.Group();
    this.placingGhost.add(ghost);
    this.rocketGroup.add(this.placingGhost);
    this.attachNodes.visible = true;
  }

  private rebuildAttachNodes(height: number) {
    while (this.attachNodes.children.length) {
      this.attachNodes.remove(this.attachNodes.children[0]!);
    }

    const makeNode = (y: number, attach: "top" | "bottom", color: number) => {
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 16, 16),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }),
      );
      node.position.y = y;
      node.userData.attachNode = attach;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.08, 8, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      ring.userData.attachNode = attach;
      this.attachNodes.add(node, ring);
    };

    makeNode(height + 0.2, "top", 0x44dd66);
    makeNode(0.15, "bottom", 0xff8844);
  }

  setPadThrottle(throttle: number) {
    this.throttle = throttle;
  }

  setEnginesLit(lit: boolean) {
    this.enginesLit = lit;
  }

  private syncCameraTarget() {
    if (this.launched) {
      this.lookTarget.copy(this.chaseLook);
      return;
    }

    if (this.kerbinSub === "vab") {
      this.rocketGroup.getWorldPosition(this.lookTarget);
      this.lookTarget.y += this.rocketHeight * 0.38;
    } else if (this.kerbinSub === "pad") {
      this.lookTarget.set(KSC.pad.x, this.rocketHeight * 0.5 + 2.5, KSC.pad.z);
    } else if (this.kerbinSub === "ksc") {
      this.lookTarget.set((KSC.vab.x + KSC.pad.x) * 0.5, 12, (KSC.vab.z + KSC.pad.z) * 0.5);
    } else {
      this.rocketGroup.getWorldPosition(this.lookTarget);
    }
  }

  private applyFloatingOrigin() {
    this.flightFocus.copy(this.displayFlightPos);
    this.worldRoot.position.set(-this.flightFocus.x, -this.flightFocus.y, -this.flightFocus.z);
    this.chaseLook.set(0, this.rocketHeight * 0.38, 0);
  }

  private tickFlight(dt: number) {
    if (!this.flightProvider) return;
    const { phase, flight, debris } = this.flightProvider();

    this.throttle = flight.throttle;
    this.enginesLit = flight.armed;

    if (phase !== "preflight" && phase !== "flight") return;

    this.flightAltitudeM = Math.max(0, flight.altitude);

    const targetQ = planetQuatToThree({
      x: flight.rotX,
      y: flight.rotY,
      z: flight.rotZ,
      w: flight.rotW,
    });

    if (!flight.launched) {
      this.worldRoot.position.set(0, 0, 0);
      this.rocketGroup.getWorldPosition(this.debrisAnchor);
      this.rocketGroup.getWorldQuaternion(this.debrisAnchorQuat);
      const anchor: DebrisAnchor = { pos: this.debrisAnchor, quat: this.debrisAnchorQuat };
      if (debris.length > this.lastDebrisCount) {
        this.exhaust.burst(this.throttle);
      }
      this.lastDebrisCount = debris.length;
      this.debrisVisuals.sync(debris, anchor);
      this.debrisVisuals.update(dt);
      if (this.kerbinSub === "pad") {
        if (this.rocketGroup.parent !== this.padGroup) this.mountRocketToPad();
        this.rocketGroup.position.set(0, this.rocketHeight * 0.5 + 2.5, 0);
      }
      this.applyRocketOrientation(flight.rotX, flight.rotY, flight.rotZ, flight.rotW);
      return;
    }

    if (!this.launched) {
      this.launched = true;
      this.kerbinSub = "chase";
      this.mountRocketToWorld();
      const p = physicsToSurfaceVisual(flight.posX, flight.posY, flight.posZ);
      this.targetFlightPos.set(p.x, p.y, p.z);
      this.displayFlightPos.copy(this.targetFlightPos);
      this.applyRocketOrientation(flight.rotX, flight.rotY, flight.rotZ, flight.rotW);
    }

    const p = physicsToSurfaceVisual(flight.posX, flight.posY, flight.posZ);
    this.targetFlightPos.set(p.x, p.y, p.z);

    const smooth = 1 - Math.exp(-dt * 28);
    this.displayFlightPos.lerp(this.targetFlightPos, smooth);
    this.rocketGroup.position.copy(this.displayFlightPos);
    this.rocketGroup.quaternion.slerp(targetQ, smooth);

    this.debrisAnchor.copy(this.displayFlightPos);
    this.debrisAnchorQuat.copy(this.rocketGroup.quaternion);
    if (debris.length > this.lastDebrisCount) {
      this.exhaust.burst(this.throttle);
    }
    this.lastDebrisCount = debris.length;
    this.debrisVisuals.sync(debris, { pos: this.debrisAnchor, quat: this.debrisAnchorQuat });
    this.debrisVisuals.update(dt);
    this.applyFloatingOrigin();
  }

  private updateCameraFromOrbit(dt: number) {
    if (this.kerbinSub === "chase" && this.launched) {
      const altM = this.getFlightAltitudeM();
      this.orbit.distance = THREE.MathUtils.clamp(72 + altM * 0.065, 68, 420);
      this.orbit.elevation = THREE.MathUtils.lerp(
        this.orbit.elevation,
        THREE.MathUtils.clamp(0.16 + altM * 0.00002, 0.12, 0.42),
        1 - Math.exp(-dt * 0.8),
      );
    }

    const target = this.lookTarget;
    const dist = this.orbit.distance;
    const x = target.x + dist * Math.sin(this.orbit.azimuth) * Math.cos(this.orbit.elevation);
    const y = target.y + dist * Math.sin(this.orbit.elevation);
    const z = target.z + dist * Math.cos(this.orbit.azimuth) * Math.cos(this.orbit.elevation);
    this.cameraPos.lerp(new THREE.Vector3(x, y, z), 1 - Math.exp(-dt * 4));
    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(target);
  }

  private resize = () => {
    const parent = this.canvas.parentElement ?? this.canvas;
    resizeRenderer(this.renderer, this.camera, parent.clientWidth, parent.clientHeight);
  };

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();

    updateCelestialSystem(this.celestial, dt, this.sunDir, this.viewMode === "menu");
    const sunDist = this.launched ? Math.min(400_000_000, 80_000 + this.getFlightAltitudeM() * 120) : 1200;
    this.sunLight.position.copy(this.sunDir).multiplyScalar(sunDist);
    this.sunTarget.position.copy(this.lookTarget);

    if (this.viewMode === "menu") {
      this.orbit.azimuth += dt * 0.008;
      this.lookTarget.set(0, 0, 0);
      this.worldRoot.position.set(0, 0, 0);
      this.updateCameraFromOrbit(dt);
    } else {
      this.tickFlight(dt);
      this.syncCameraTarget();
      this.updateWorldPresentation(dt);
      this.updateCameraFromOrbit(dt);
    }

    this.updateExhaust(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateExhaust(dt: number) {
    const fuelOk = this.flightProvider
      ? this.flightProvider().flight.fuelRemaining > 0.5
      : false;
    const show =
      fuelOk &&
      this.enginesLit &&
      this.throttle >= 0.04 &&
      this.viewMode === "kerbin" &&
      (this.kerbinSub === "pad" || this.kerbinSub === "chase");

    this.exhaust.update(dt, show, this.throttle);
  }

  setCraftPreview(craft: CraftDefinition, selectedPartId?: string | null, placingPartId?: string | null) {
    const exhaust = this.exhaust.group;
    if (exhaust.parent === this.rocketGroup) this.rocketGroup.remove(exhaust);
    const attach = this.attachNodes;
    if (attach.parent === this.rocketGroup) this.rocketGroup.remove(attach);
    const com = this.comMarker;
    if (com.parent === this.rocketGroup) this.rocketGroup.remove(com);

    while (this.rocketGroup.children.length) {
      this.rocketGroup.remove(this.rocketGroup.children[0]!);
    }
    const { group, height } = buildRocketMesh(craft, selectedPartId);
    this.rocketGroup.add(group);
    this.rocketHeight = height;
    this.exhaust.setNozzleY(0);
    this.rocketGroup.add(this.attachNodes);

    this.comMarker.position.set(0, computeComOffset(craft), 0);
    this.comMarker.visible = this.kerbinSub === "vab";
    this.rocketGroup.add(com);
    this.rocketGroup.add(exhaust);
    this.rebuildAttachNodes(height);
    this.setPlacingPart(placingPartId ?? null);

    if (this.viewMode === "kerbin") {
      this.refreshRocketMount();
      this.syncCameraTarget();
    }
  }

  /** @deprecated Use tickFlight via setFlightProvider — kept for compatibility */
  updateFlightState(state: FlightTelemetry) {
    this.throttle = state.throttle;
    this.enginesLit = state.armed;
  }
}
