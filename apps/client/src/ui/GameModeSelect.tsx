import { GAME_MODES, type GameMode } from "@orbital/common";
import { useGameStore } from "../store/gameStore";

export function GameModeSelect() {
  const pending = useGameStore((s) => s.pendingGameMode);

  return (
    <div className="flow-screen mode-select-screen">
      <button type="button" className="flow-back" onClick={() => useGameStore.getState().goToMainMenu()}>
        ← Back
      </button>
      <div className="flow-content">
        <p className="flow-eyebrow">New Campaign</p>
        <h2>Select Game Mode</h2>
        <p className="flow-desc">Choose how your space program will progress.</p>

        <div className="mode-grid">
          {GAME_MODES.map((mode: { id: GameMode; name: string; desc: string }) => (
            <button
              key={mode.id}
              className={`mode-card ${pending === mode.id ? "mode-card-active" : ""}`}
              onClick={() => useGameStore.getState().setPendingGameMode(mode.id)}
            >
              <strong>{mode.name}</strong>
              <span>{mode.desc}</span>
            </button>
          ))}
        </div>

        <button
          className="menu-btn menu-btn-primary flow-continue"
          disabled={!pending}
          onClick={() => useGameStore.getState().setPhase("agency_create")}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
