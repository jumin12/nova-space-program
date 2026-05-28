import { create } from "zustand";
import type {
  AgencyProfile,
  ControlInput,
  CraftDefinition,
  DebrisSnapshot,
  GameMode,
  PlayerRole,
} from "@orbital/common";
import { DEFAULT_CONTROL, DEFAULT_CRAFT, getPart, kscPadRotation, kscPosition } from "@orbital/common";
import {
  addPartToStackBottom,
  addPartToStackTop,
  craftToDefinition,
  createCraftRuntime,
} from "@orbital/physics";
import { loadSavedRockets, type SavedRocket } from "./craftStorage.js";

export type RoomPlayer = {
  sessionId: string;
  name: string;
  role: PlayerRole;
  ready: boolean;
};

export type ConnectionMode = "connecting" | "online" | "local" | "offline";

export type FacilityId = "vab" | "pad" | "tracking" | "rd" | "admin" | "runway";

export type GameStore = {
  connected: boolean;
  connectionMode: ConnectionMode;
  sessionId: string;
  playerName: string;
  serverUrl: string;
  phase: string;
  message: string;
  players: RoomPlayer[];
  isPilot: boolean;
  agency: AgencyProfile | null;
  pendingGameMode: GameMode | null;
  craft: CraftDefinition;
  craftHistory: CraftDefinition[];
  craftFuture: CraftDefinition[];
  selectedPartId: string | null;
  placingPartId: string | null;
  /** Stage number for newly placed VAB parts */
  vabStage: number;
  /** KSC facility overlay (null = space center home). */
  facilityScreen: FacilityId | null;
  mapOpen: boolean;
  savedRockets: SavedRocket[];
  activeSavedRocketId: string;
  input: ControlInput;
  flight: {
    altitude: number;
    velocity: number;
    verticalSpeed: number;
    acceleration: number;
    dynamicPressure: number;
    fuelRemaining: number;
    fuelCapacity: number;
    mass: number;
    throttle: number;
    activeStage: number;
    pitch: number;
    apoapsis: number;
    periapsis: number;
    inSpace: boolean;
    launched: boolean;
    armed: boolean;
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
    debris: DebrisSnapshot[];
  };
  setConnected: (connected: boolean) => void;
  setConnectionMode: (mode: ConnectionMode) => void;
  setSessionId: (sessionId: string) => void;
  setPlayerName: (name: string) => void;
  setServerUrl: (url: string) => void;
  setPhase: (phase: string) => void;
  goToMainMenu: () => void;
  setMessage: (message: string) => void;
  setPlayers: (players: RoomPlayer[]) => void;
  setIsPilot: (isPilot: boolean) => void;
  setAgency: (agency: AgencyProfile | null) => void;
  setPendingGameMode: (mode: GameMode | null) => void;
  setCraft: (craft: CraftDefinition, pushHistory?: boolean) => void;
  undoCraft: () => void;
  redoCraft: () => void;
  setSelectedPartId: (id: string | null) => void;
  setPlacingPartId: (id: string | null) => void;
  setVabStage: (stage: number) => void;
  setFacilityScreen: (facility: FacilityId | null) => void;
  setMapOpen: (open: boolean) => void;
  toggleMap: () => void;
  setSavedRockets: (rockets: SavedRocket[]) => void;
  setActiveSavedRocket: (id: string) => void;
  commitPlacingPart: (attach: "top" | "bottom") => CraftDefinition | null;
  setInput: (input: Partial<ControlInput>) => void;
  patchFlight: (patch: Partial<GameStore["flight"]>) => void;
};

const padRot = kscPadRotation();
const padPos = kscPosition(0);
const initialRockets = loadSavedRockets();

export const useGameStore = create<GameStore>((set, get) => ({
  connected: false,
  connectionMode: "offline",
  sessionId: "",
  playerName: "Commander",
  serverUrl: "http://127.0.0.1:2567",
  phase: "mainmenu",
  message: "Welcome to Orbital Frontier",
  players: [],
  isPilot: false,
  agency: null,
  pendingGameMode: null,
  craft: initialRockets[0]?.craft ?? DEFAULT_CRAFT,
  craftHistory: [],
  craftFuture: [],
  selectedPartId: null,
  placingPartId: null,
  vabStage: 1,
  facilityScreen: null,
  mapOpen: false,
  savedRockets: initialRockets,
  activeSavedRocketId: initialRockets[0]?.id ?? "default-mk1",
  input: { ...DEFAULT_CONTROL },
  flight: {
    altitude: 0,
    velocity: 0,
    verticalSpeed: 0,
    acceleration: 0,
    dynamicPressure: 0,
    fuelRemaining: 0,
    fuelCapacity: 0,
    mass: 0,
    throttle: 0,
    activeStage: 1,
    pitch: 0,
    apoapsis: 0,
    periapsis: 0,
    inSpace: false,
    launched: false,
    armed: false,
    crashed: false,
    landed: false,
    posX: padPos.x,
    posY: padPos.y,
    posZ: padPos.z,
    velX: 0,
    velY: 0,
    velZ: 0,
    rotX: padRot.x,
    rotY: padRot.y,
    rotZ: padRot.z,
    rotW: padRot.w,
    lastTelemetryId: "",
    debris: [],
  },
  setConnected: (connected) => set({ connected }),
  setConnectionMode: (connectionMode) => set({ connectionMode }),
  setSessionId: (sessionId) => set({ sessionId }),
  setPlayerName: (playerName) => set({ playerName }),
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setPhase: (phase) => set({ phase }),
  goToMainMenu: () =>
    set({
      phase: "mainmenu",
      facilityScreen: null,
      mapOpen: false,
      connectionMode: "offline",
      message: "Welcome to Orbital Frontier",
    }),
  setMessage: (message) => set({ message }),
  setPlayers: (players) => set({ players }),
  setIsPilot: (isPilot) => set({ isPilot }),
  setAgency: (agency) => set({ agency }),
  setPendingGameMode: (pendingGameMode) => set({ pendingGameMode }),
  setCraft: (craft, pushHistory = false) =>
    set((state) => {
      if (!pushHistory) return { craft };
      return {
        craft,
        craftHistory: [...state.craftHistory.slice(-30), state.craft],
        craftFuture: [],
      };
    }),
  undoCraft: () =>
    set((state) => {
      if (state.craftHistory.length === 0) return state;
      const prev = state.craftHistory[state.craftHistory.length - 1]!;
      return {
        craft: prev,
        craftHistory: state.craftHistory.slice(0, -1),
        craftFuture: [state.craft, ...state.craftFuture],
        selectedPartId: null,
      };
    }),
  redoCraft: () =>
    set((state) => {
      if (state.craftFuture.length === 0) return state;
      const next = state.craftFuture[0]!;
      return {
        craft: next,
        craftHistory: [...state.craftHistory, state.craft],
        craftFuture: state.craftFuture.slice(1),
        selectedPartId: null,
      };
    }),
  setSelectedPartId: (selectedPartId) => set({ selectedPartId }),
  setPlacingPartId: (placingPartId) => set({ placingPartId }),
  setVabStage: (vabStage) => set({ vabStage: Math.max(1, Math.min(10, vabStage)) }),
  setFacilityScreen: (facilityScreen) => set({ facilityScreen }),
  setMapOpen: (mapOpen) => set({ mapOpen }),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),
  setSavedRockets: (savedRockets) => set({ savedRockets }),
  setActiveSavedRocket: (activeSavedRocketId) => set({ activeSavedRocketId }),
  commitPlacingPart: (attach) => {
    const state = get();
    if (!state.placingPartId || !state.isPilot) return null;
    const runtime = createCraftRuntime(state.craft);
    const def = getPart(state.placingPartId);
    const stage = state.vabStage;
    if (attach === "bottom" || def.category === "engine" || def.category === "structural") {
      addPartToStackBottom(runtime, state.placingPartId, stage);
    } else {
      addPartToStackTop(runtime, state.placingPartId, stage);
    }
    const next = craftToDefinition(runtime);
    set((s) => ({
      craft: next,
      craftHistory: [...s.craftHistory.slice(-30), s.craft],
      craftFuture: [],
      placingPartId: null,
    }));
    return next;
  },
  setInput: (input) => set((state) => ({ input: { ...state.input, ...input } })),
  patchFlight: (patch) => set((state) => ({ flight: { ...state.flight, ...patch } })),
}));

export function updateCraft(next: CraftDefinition) {
  useGameStore.getState().setCraft(next, true);
}
