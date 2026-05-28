import { DEFAULT_CONTROL, PHYSICS, type ControlInput, type CraftDefinition, type TelemetryLog } from "@orbital/common";
import {
  computeCraftStats,
  craftToDefinition,
  createVesselOnPad,
  isFlightComplete,
  snapshotFromVessel,
  stepVessel,
  type VesselState,
} from "@orbital/physics";
import { useGameStore } from "../store/gameStore";

let vessel: VesselState | null = null;
let loopHandle: ReturnType<typeof setInterval> | null = null;
let pilotInput: ControlInput = { ...DEFAULT_CONTROL };
let flightStartedAt = 0;
let mode: "preflight" | "flight" = "flight";

function applySnapshot() {
  if (!vessel) return;
  const snap = snapshotFromVessel(vessel);
  const store = useGameStore.getState();
  const nextCraft = craftToDefinition(vessel.craft);
  if (
    nextCraft.parts.length !== store.craft.parts.length ||
    nextCraft.parts.some((p, i) => store.craft.parts[i]?.instanceId !== p.instanceId)
  ) {
    store.setCraft(nextCraft, false);
  }

  store.patchFlight({
    altitude: snap.altitude,
    velocity: snap.speed,
    verticalSpeed: snap.verticalSpeed,
    acceleration: snap.acceleration,
    dynamicPressure: snap.dynamicPressure,
    fuelRemaining: snap.fuelRemaining,
    mass: snap.mass,
    throttle: snap.throttle,
    activeStage: snap.activeStage,
    pitch: snap.pitch,
    apoapsis: snap.apoapsis ?? 0,
    periapsis: snap.periapsis ?? 0,
    inSpace: snap.inSpace,
    launched: vessel.launched,
    armed: vessel.armed,
    crashed: snap.crashed,
    landed: snap.landed,
    posX: snap.position.x,
    posY: snap.position.y,
    posZ: snap.position.z,
    velX: snap.velocity.x,
    velY: snap.velocity.y,
    velZ: snap.velocity.z,
    rotX: snap.rotation.x,
    rotY: snap.rotation.y,
    rotZ: snap.rotation.z,
    rotW: snap.rotation.w,
    debris: snap.debris,
  });
}

function finishLocalFlight() {
  stopLocalLoop();
  if (!vessel) return;

  const store = useGameStore.getState();
  const log: TelemetryLog = {
    craftName: vessel.craft.name,
    playerName: store.playerName,
    startedAt: flightStartedAt,
    endedAt: Date.now(),
    maxAltitude: vessel.maxAltitude,
    reachedSpace: vessel.reachedSpace,
    outcome: vessel.crashed
      ? "crash"
      : vessel.landed
        ? "landed"
        : vessel.reachedSpace
          ? "space"
          : "suborbital",
    samples: vessel.telemetry.filter((_, i) => i % 3 === 0),
  };

  const id = `local-${log.startedAt}`;
  localStorage.setItem(`orbital-telemetry-${id}`, JSON.stringify(log));

  store.setPhase(
    vessel.crashed ? "crashed" : vessel.reachedSpace ? "space" : vessel.landed ? "landed" : "landed",
  );
  store.setMessage(
    vessel.reachedSpace
      ? "Suborbital space reached — telemetry saved locally"
      : vessel.crashed
        ? "Vehicle destroyed — telemetry saved locally"
        : "Flight complete — telemetry saved locally",
  );
  store.patchFlight({ lastTelemetryId: id });
  vessel = null;
}

function stopLocalLoop() {
  if (loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
  }
}

function startLoop() {
  stopLocalLoop();
  loopHandle = setInterval(() => {
    if (!vessel) return;

    const storeInput = useGameStore.getState().input;
    pilotInput.throttle = storeInput.throttle;
    pilotInput.pitch = storeInput.pitch;
    pilotInput.yaw = storeInput.yaw;
    pilotInput.roll = storeInput.roll;

    const stagePulse = mode === "flight" ? pilotInput.stage : false;
    if (mode === "flight") pilotInput.stage = false;

    stepVessel(vessel, { ...pilotInput, stage: stagePulse }, PHYSICS.fixedDt);
    applySnapshot();

    if (mode === "flight" && isFlightComplete(vessel)) {
      finishLocalFlight();
    }
  }, 1000 / 30);
}

export function isLocalFlightActive() {
  return vessel !== null;
}

export function startLocalBuild() {
  const store = useGameStore.getState();
  store.setPhase("build");
  store.setMessage("Vehicle assembly (offline mode)");
}

export function startLocalPreflight(craft: CraftDefinition) {
  stopLocalLoop();
  vessel = createVesselOnPad(craft);
  vessel.armed = false;
  vessel.throttle = 0;
  pilotInput = { ...DEFAULT_CONTROL };
  mode = "preflight";

  const fuelCapacity = computeCraftStats(vessel.craft).fuelRemaining;
  const store = useGameStore.getState();
  store.setPhase("preflight");
  store.setInput({ ...DEFAULT_CONTROL });
  store.setMessage("Launch pad — set throttle with Shift, then Space to release clamps and ignite");
  store.patchFlight({ fuelCapacity });
  applySnapshot();
  startLoop();
}

export function igniteLocalLaunch() {
  if (!vessel) return;
  vessel.armed = true;
  mode = "flight";
  flightStartedAt = Date.now();
  pilotInput.launch = true;

  const store = useGameStore.getState();
  store.setPhase("flight");
  store.setMessage("Clamps released — engines ignited");
  store.patchFlight({ armed: true });
  applySnapshot();
}

export function startLocalFlight(craft: CraftDefinition) {
  startLocalPreflight(craft);
  igniteLocalLaunch();
}

export function sendLocalInput(input: Partial<ControlInput>) {
  if (input.throttle !== undefined) pilotInput.throttle = input.throttle;
  if (input.pitch !== undefined) pilotInput.pitch = input.pitch;
  if (input.yaw !== undefined) pilotInput.yaw = input.yaw;
  if (input.roll !== undefined) pilotInput.roll = input.roll;
  if (input.stage !== undefined) pilotInput.stage = input.stage;
  if (input.launch !== undefined) pilotInput.launch = pilotInput.launch || input.launch;
}

export function returnLocalLobby() {
  stopLocalLoop();
  vessel = null;
  useGameStore.getState().patchFlight({ debris: [], fuelCapacity: 0 });
  mode = "flight";
  const store = useGameStore.getState();
  store.setPhase("lobby");
  store.setMessage("Offline mode — connect to server for multiplayer");
}

export function cancelLocalPreflight() {
  stopLocalLoop();
  vessel = null;
  mode = "flight";
  pilotInput = { ...DEFAULT_CONTROL };
  const store = useGameStore.getState();
  store.setPhase("lobby");
  store.setFacilityScreen("pad");
  store.setInput({ ...DEFAULT_CONTROL });
  store.patchFlight({ debris: [], fuelCapacity: 0 });
  store.setMessage("Launch Complex 1 — select a saved rocket");
}

export function sendLocalPreflightInput(input: Partial<ControlInput>) {
  sendLocalInput(input);
  applySnapshot();
}
