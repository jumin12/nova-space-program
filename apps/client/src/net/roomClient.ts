import { Client, Room } from "colyseus.js";
import type { CraftDefinition } from "@orbital/common";
import { getServerUrl } from "./getServerUrl";
import { returnLocalLobby, cancelLocalPreflight, sendLocalInput, sendLocalPreflightInput, startLocalBuild, startLocalPreflight, igniteLocalLaunch } from "./localFlight";
import { useGameStore, type RoomPlayer } from "../store/gameStore";

type LaunchRoomState = {
  phase: string;
  pilotSessionId: string;
  craftName: string;
  craftJson: string;
  message: string;
  altitude: number;
  velocity: number;
  verticalSpeed: number;
  acceleration: number;
  dynamicPressure: number;
  fuelRemaining: number;
  mass: number;
  throttle: number;
  activeStage: number;
  pitch: number;
  apoapsis: number;
  periapsis: number;
  inSpace: boolean;
  launched: boolean;
  crashed: boolean;
  landed: boolean;
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
  lastTelemetryId: string;
  players: Map<string, RoomPlayer> | { forEach: (cb: (p: RoomPlayer, k: string) => void) => void };
};

let room: Room<LaunchRoomState> | null = null;
let client: Client | null = null;

function readPlayers(state: LaunchRoomState): RoomPlayer[] {
  const players: RoomPlayer[] = [];
  if (!state.players) return players;

  if (state.players instanceof Map) {
    for (const [, player] of state.players) {
      players.push(readPlayer(player));
    }
    return players;
  }

  state.players.forEach((player) => {
    players.push(readPlayer(player));
  });
  return players;
}

function readPlayer(player: RoomPlayer): RoomPlayer {
  return {
    sessionId: player.sessionId,
    name: player.name,
    role: player.role === "spectator" ? "spectator" : "pilot",
    ready: !!player.ready,
  };
}

function syncRoom(state: LaunchRoomState) {
  const store = useGameStore.getState();
  if (store.connectionMode === "local") return;

  const menuFlow = store.phase === "mainmenu" || store.phase === "mode_select" || store.phase === "agency_create";
  if (menuFlow) return;

  let craftParts = store.craft.parts;
  try {
    craftParts = JSON.parse(state.craftJson || "[]");
  } catch {
    // Keep existing craft if server payload is malformed.
  }

  const enteringPreflight = state.phase === "preflight" && store.phase !== "preflight";
  store.setPhase(state.phase || "lobby");
  store.setMessage(state.message || "Connected");
  store.setPlayers(readPlayers(state));
  store.setIsPilot(state.pilotSessionId === store.sessionId);
  store.setCraft({ name: state.craftName || store.craft.name, parts: craftParts });
  store.patchFlight({
    ...(enteringPreflight && state.fuelRemaining > 0 ? { fuelCapacity: state.fuelRemaining } : {}),
    altitude: state.altitude ?? 0,
    velocity: state.velocity ?? 0,
    verticalSpeed: state.verticalSpeed ?? 0,
    acceleration: state.acceleration ?? 0,
    dynamicPressure: state.dynamicPressure ?? 0,
    fuelRemaining: state.fuelRemaining ?? 0,
    mass: state.mass ?? 0,
    throttle: state.throttle ?? 0,
    activeStage: state.activeStage ?? 1,
    pitch: state.pitch ?? 0,
    apoapsis: state.apoapsis ?? 0,
    periapsis: state.periapsis ?? 0,
    inSpace: !!state.inSpace,
    launched: !!state.launched,
    armed: state.phase === "flight",
    crashed: !!state.crashed,
    landed: !!state.landed,
    posX: state.posX ?? 600000,
    posY: state.posY ?? 0,
    posZ: state.posZ ?? 0,
    velX: state.velX ?? 0,
    velY: state.velY ?? 0,
    velZ: state.velZ ?? 0,
    rotX: state.rotX ?? 0,
    rotY: state.rotY ?? 0,
    rotZ: state.rotZ ?? 0,
    rotW: state.rotW ?? 1,
    lastTelemetryId: state.lastTelemetryId ?? "",
  });

  // Pilot owns input.throttle locally; server vessel.throttle lags (ramp) and must not overwrite HUD/keys.
}

export function enableLocalMode() {
  const store = useGameStore.getState();
  store.setConnectionMode("local");
  store.setConnected(true);
  store.setIsPilot(true);
  store.setPhase("lobby");
  store.setPlayers([
    {
      sessionId: "local",
      name: store.playerName,
      role: "pilot",
      ready: true,
    },
  ]);
  store.setMessage("Offline mode — launch works locally. Run pnpm dev for multiplayer.");
}

export async function connectToRoom(): Promise<boolean> {
  const store = useGameStore.getState();
  store.setConnectionMode("connecting");

  try {
    if (room) {
      await room.leave();
      room = null;
    }

    const endpoint = getServerUrl();
    client = new Client(endpoint);
    room = await client.joinOrCreate<LaunchRoomState>("launch", {
      playerName: store.playerName,
    });

    store.setSessionId(room.sessionId);
    store.setConnectionMode("online");
    store.setConnected(true);
    syncRoom(room.state);

    room.onStateChange((state) => syncRoom(state));
    room.onError((code, message) => {
      store.setMessage(`Connection error (${code}): ${message ?? "unknown"}`);
    });
    room.onLeave(() => {
      if (useGameStore.getState().connectionMode === "online") {
        store.setConnected(false);
        store.setConnectionMode("offline");
        store.goToMainMenu();
        store.setMessage("Disconnected from server");
      }
      room = null;
    });

    return true;
  } catch (error) {
    room = null;
    client = null;
    store.setConnected(false);
    store.setConnectionMode("offline");
    const detail = error instanceof Error ? error.message : "Server unavailable";
    if (store.phase === "connecting") {
      store.setPhase("mainmenu");
      store.setMessage(`Could not reach server — ${detail}`);
    } else {
      store.setMessage(`Connection failed: ${detail}`);
    }
    return false;
  }
}

export async function disconnectRoom() {
  if (room) await room.leave();
  room = null;
  client = null;
  const store = useGameStore.getState();
  store.setConnected(false);
  store.setConnectionMode("offline");
  store.goToMainMenu();
}

export function sendName(name: string) {
  room?.send("set_name", name);
}

export function sendRole(role: "pilot" | "spectator") {
  room?.send("set_role", role);
}

export function sendReady(ready: boolean) {
  room?.send("set_ready", ready);
}

export function sendCraft(craft: CraftDefinition) {
  useGameStore.getState().setCraft(craft);
  if (useGameStore.getState().connectionMode === "online") {
    room?.send("set_craft", craft);
  }
}

export function openOrbitalMap() {
  useGameStore.getState().setMapOpen(true);
}

export function closeOrbitalMap() {
  useGameStore.getState().setMapOpen(false);
}

export function toggleMap() {
  useGameStore.getState().toggleMap();
}

export function openFacility(facility: import("../store/gameStore").FacilityId) {
  const store = useGameStore.getState();

  if (facility === "vab") {
    store.setFacilityScreen(null);
    startBuild();
    return;
  }
  if (facility === "tracking") {
    store.setFacilityScreen(null);
    openOrbitalMap();
    return;
  }
  if (facility === "pad") {
    if (!store.isPilot || !store.connected) return;
    store.setFacilityScreen("pad");
    store.setMessage("Launch Complex 1 — select a saved rocket");
    return;
  }
  store.setFacilityScreen(facility);
  store.setMessage(`Entered ${facility.toUpperCase()} — placeholder`);
}

export function returnToKsc() {
  const store = useGameStore.getState();
  store.setFacilityScreen(null);
  if (store.phase === "build" && store.connectionMode === "local") {
    returnLocalLobby();
    return;
  }
  if (store.phase !== "lobby" && store.phase !== "offline") {
    returnLobby();
    return;
  }
  store.setMessage("Kerbin Space Center");
}

export function startBuild() {
  useGameStore.getState().setFacilityScreen(null);
  if (useGameStore.getState().connectionMode === "local") {
    startLocalBuild();
    return;
  }
  room?.send("start_build");
}

export function returnLobby() {
  useGameStore.getState().setFacilityScreen(null);
  if (useGameStore.getState().connectionMode === "local") {
    returnLocalLobby();
    return;
  }
  room?.send("return_lobby");
}

export function getActiveLaunchCraft() {
  const store = useGameStore.getState();
  const saved = store.savedRockets.find((r) => r.id === store.activeSavedRocketId);
  return saved?.craft ?? store.craft;
}

export function goToLaunchPad() {
  const store = useGameStore.getState();
  const craft = getActiveLaunchCraft();
  store.setCraft(craft, false);
  store.setInput({ ...store.input, throttle: 0 });
  store.setFacilityScreen(null);
  if (store.connectionMode === "local") {
    startLocalPreflight(craft);
    return;
  }
  sendCraft(craft);
  room?.send("go_preflight");
}

export function cancelPreflight() {
  const store = useGameStore.getState();
  if (store.connectionMode === "local") {
    cancelLocalPreflight();
    return;
  }
  room?.send("cancel_preflight");
}

export function igniteLaunch() {
  const store = useGameStore.getState();
  if (store.connectionMode === "local") {
    igniteLocalLaunch();
    return;
  }
  room?.send("launch");
}

export function launchCraft() {
  goToLaunchPad();
}

export function sendInput(partial?: Partial<import("@orbital/common").ControlInput>) {
  const store = useGameStore.getState();
  const { input, isPilot, phase, connectionMode } = store;
  if (!isPilot) return;
  if (phase !== "flight" && phase !== "preflight") return;

  const payload = partial ?? input;

  if (connectionMode === "local") {
    if (phase === "preflight") {
      sendLocalPreflightInput(payload);
    } else {
      sendLocalInput(payload);
    }
    return;
  }

  room?.send("input", payload);
}

export function sendThrottle(throttle: number) {
  useGameStore.getState().setInput({ throttle });
  sendInput({ throttle });
}

export function getRoom() {
  return room;
}

export function saveTelemetryLocally() {
  const { flight, craft, playerName } = useGameStore.getState();
  const key = `orbital-telemetry-${flight.lastTelemetryId || Date.now()}`;
  const payload = {
    craftName: craft.name,
    playerName,
    savedAt: Date.now(),
    lastTelemetryId: flight.lastTelemetryId,
    summary: {
      maxAltitude: flight.altitude,
      inSpace: flight.inSpace,
      crashed: flight.crashed,
      landed: flight.landed,
    },
  };
  localStorage.setItem(key, JSON.stringify(payload));
  return key;
}

export function isOnline() {
  return useGameStore.getState().connectionMode === "online";
}

export function isLocal() {
  return useGameStore.getState().connectionMode === "local";
}
