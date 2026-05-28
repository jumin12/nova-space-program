import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";
import { loadAgency } from "../store/agencyStorage";
import { startGame } from "../net/startGame";

type MainMenuProps = {
  onRequestFullscreen?: () => void;
};

export function MainMenu({ onRequestFullscreen }: MainMenuProps) {
  const playerName = useGameStore((s) => s.playerName);
  const phase = useGameStore((s) => s.phase);
  const agency = useGameStore((s) => s.agency);
  const connecting = phase === "connecting";

  useEffect(() => {
    useGameStore.getState().setFacilityScreen(null);
    const saved = loadAgency();
    if (saved && !agency) useGameStore.getState().setAgency(saved);
  }, [agency]);

  const savedAgency = agency ?? loadAgency();

  return (
    <div className="main-menu">
      <div className="main-menu-bg" />
      <div className="main-menu-stars" />
      <div className="main-menu-vignette" />
      <div className="main-menu-planet-glow" />

      <nav className="main-menu-nav">
        <div className="main-menu-brand-compact">
          <span className="main-menu-logo-sm">OF</span>
          <span>Orbital Frontier</span>
        </div>
      </nav>

      <div className="main-menu-hero">
        <div className="main-menu-brand">
          <p className="main-menu-eyebrow">Kerbal Space Program Inspired</p>
          <h1 className="main-menu-title">ORBITAL<br />FRONTIER</h1>
          <p className="main-menu-tagline">Build rockets. Launch from Kerbin. Explore with your agency.</p>
        </div>

        <div className="main-menu-actions">
          {savedAgency && (
            <button
              type="button"
              className="menu-btn menu-btn-primary"
              disabled={connecting}
              onClick={() => {
                useGameStore.getState().setAgency(savedAgency);
                startGame();
              }}
            >
              {connecting ? "Connecting…" : `Continue — ${savedAgency.name}`}
            </button>
          )}

          <button
            type="button"
            className={`menu-btn ${savedAgency ? "" : "menu-btn-primary"}`}
            disabled={connecting}
            onClick={() => {
              onRequestFullscreen?.();
              useGameStore.getState().setPhase("mode_select");
            }}
          >
            New Game
          </button>
          <button className="menu-btn" disabled>
            Load Game
          </button>
          <button className="menu-btn" disabled>
            Settings
          </button>
          <button className="menu-btn" disabled>
            Mods
          </button>

          {!savedAgency && (
            <label className="menu-field menu-field-inline">
              Callsign
              <input
                type="text"
                value={playerName}
                disabled={connecting}
                onChange={(e) => useGameStore.getState().setPlayerName(e.target.value)}
              />
            </label>
          )}
        </div>
      </div>

      <footer className="main-menu-footer">
        <span>Stage 0 → 1 Foundation</span>
        <span>Right-drag · Scroll · Shift throttle · Space launch</span>
      </footer>
    </div>
  );
}
