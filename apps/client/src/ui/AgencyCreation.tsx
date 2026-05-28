import { useState } from "react";
import { AGENCY_COLORS, AGENCY_EMBLEMS, createAgency } from "@orbital/common";
import { startGame } from "../net/startGame";
import { saveAgency } from "../store/agencyStorage";
import { useGameStore } from "../store/gameStore";

export function AgencyCreation() {
  const pendingGameMode = useGameStore((s) => s.pendingGameMode);
  const playerName = useGameStore((s) => s.playerName);
  const [name, setName] = useState(`${playerName}'s Space Program`);
  const [motto, setMotto] = useState("Ad astra per aspera");
  const [emblem, setEmblem] = useState<string>(AGENCY_EMBLEMS[0]);
  const [colorIdx, setColorIdx] = useState(0);

  const colors = AGENCY_COLORS[colorIdx] ?? AGENCY_COLORS[0];

  const create = () => {
    if (!pendingGameMode) return;
    const agency = createAgency({
      name: name.trim() || "Kerbin Space Agency",
      motto: motto.trim(),
      emblem,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      gameMode: pendingGameMode,
    });
    saveAgency(agency);
    useGameStore.getState().setAgency(agency);
    useGameStore.getState().setPlayerName(playerName || "Commander");
    startGame();
  };

  return (
    <div className="flow-screen agency-screen">
      <button
        className="flow-back"
        onClick={() => useGameStore.getState().setPhase("mode_select")}
      >
        ← Back
      </button>

      <div className="flow-content agency-layout">
        <div className="agency-form">
          <p className="flow-eyebrow">Create Your Agency</p>
          <h2>Space Agency</h2>
          <p className="flow-desc">Design your program identity — this appears across the Space Center and missions.</p>

          <label className="menu-field">
            Agency Name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
          </label>
          <label className="menu-field">
            Motto
            <input type="text" value={motto} onChange={(e) => setMotto(e.target.value)} maxLength={64} />
          </label>
          <label className="menu-field">
            Director Callsign
            <input
              type="text"
              value={playerName}
              onChange={(e) => useGameStore.getState().setPlayerName(e.target.value)}
              maxLength={24}
            />
          </label>

          <div className="agency-pickers">
            <div>
              <span className="picker-label">Emblem</span>
              <div className="emblem-grid">
                {AGENCY_EMBLEMS.map((e: string) => (
                  <button
                    key={e}
                    type="button"
                    className={`emblem-btn ${emblem === e ? "emblem-active" : ""}`}
                    onClick={() => setEmblem(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="picker-label">Colors</span>
              <div className="color-grid">
                {AGENCY_COLORS.map((c: { primary: string; secondary: string }, i: number) => (
                  <button
                    key={i}
                    type="button"
                    className={`color-btn ${colorIdx === i ? "color-active" : ""}`}
                    style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.secondary})` }}
                    onClick={() => setColorIdx(i)}
                  />
                ))}
              </div>
            </div>
          </div>

          <button className="menu-btn menu-btn-primary flow-continue" onClick={create}>
            Found Agency & Enter Kerbin
          </button>
        </div>

        <div className="agency-preview" style={{ borderColor: colors.primary }}>
          <div className="agency-flag" style={{ background: `linear-gradient(160deg, ${colors.secondary}, ${colors.primary})` }}>
            <span className="agency-flag-emblem">{emblem}</span>
          </div>
          <h3>{name || "Agency Name"}</h3>
          <p className="agency-motto">{motto}</p>
          <div className="agency-stats">
            <div><label>Mode</label><strong>{pendingGameMode ?? "—"}</strong></div>
            <div><label>Funds</label><strong>§{(pendingGameMode === "sandbox" ? "∞" : pendingGameMode === "science" ? "500k" : "50k")}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
