import { DEFAULT_CRAFT, PHYSICS, PLANET } from "@orbital/common";
import { createVesselOnPad, stepVessel } from "@orbital/physics";
import { useGameStore } from "../store/gameStore";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export function installTestHooks() {
  window.render_game_to_text = () => {
    const state = useGameStore.getState();
    return JSON.stringify(
      {
        coordinateSystem: "Y-up planet; position meters from planet center; rocket starts on +Y pad",
        connected: state.connected,
        phase: state.phase,
        isPilot: state.isPilot,
        craft: state.craft,
        input: state.input,
        flight: state.flight,
        players: state.players,
      },
      null,
      0,
    );
  };

  window.advanceTime = (ms: number) => {
    const steps = Math.max(1, Math.round(ms / (1000 * PHYSICS.fixedDt)));
    const vessel = createVesselOnPad(DEFAULT_CRAFT);
    const input = { throttle: 1, pitch: 0, yaw: 0, roll: 0, stage: false, launch: true };
    for (let i = 0; i < steps; i++) {
      if (i === 900) stepVessel(vessel, { ...input, stage: true }, PHYSICS.fixedDt);
      else stepVessel(vessel, input, PHYSICS.fixedDt);
    }
    void PLANET;
  };
}
