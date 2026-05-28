import {
  connectToRoom,
  enableLocalMode,
  goToLaunchPad,
  openFacility,
  openOrbitalMap,
  returnLobby,
  saveTelemetryLocally,
  sendReady,
  sendRole,
} from "../net/roomClient";
import { useGameStore } from "../store/gameStore";

const FACILITIES = [
  { id: "pad" as const, code: "LC1", name: "Launch Complex 1", desc: "Select a saved rocket and launch" },
  { id: "vab" as const, code: "VAB", name: "Vehicle Assembly", desc: "Design and save rockets" },
  { id: "tracking" as const, code: "TRK", name: "Tracking Station", desc: "Orbital map (M)" },
  { id: "rd" as const, code: "R&D", name: "Research & Development", desc: "Science tree (coming soon)" },
  { id: "runway" as const, code: "RWY", name: "Runway", desc: "Aircraft ops (coming soon)" },
  { id: "admin" as const, code: "ADM", name: "Administration", desc: "Contracts & funds (coming soon)" },
];

export function SpaceCenter() {
  const connectionMode = useGameStore((s) => s.connectionMode);
  const connected = useGameStore((s) => s.connected);
  const playerName = useGameStore((s) => s.playerName);
  const phase = useGameStore((s) => s.phase);
  const isPilot = useGameStore((s) => s.isPilot);
  const players = useGameStore((s) => s.players);
  const message = useGameStore((s) => s.message);
  const savedRockets = useGameStore((s) => s.savedRockets);
  const activeSavedRocketId = useGameStore((s) => s.activeSavedRocketId);
  const agency = useGameStore((s) => s.agency);

  const busy = connectionMode === "connecting";
  const postFlight = phase === "space" || phase === "landed" || phase === "crashed";
  const canUse = connected && isPilot && !busy;
  const activeRocket = savedRockets.find((r) => r.id === activeSavedRocketId);

  const openFacilitySafe = (id: (typeof FACILITIES)[number]["id"]) => {
    if (id === "tracking") {
      openOrbitalMap();
      return;
    }
    if (!canUse) return;
    openFacility(id);
  };

  return (
    <div className="ksc-screen ksc-screen-simple">
      <aside className="ksc-sidebar">
        <header className="ksc-sidebar-header">
          {agency && (
            <div className="ksc-agency-badge" style={{ borderColor: agency.primaryColor }}>
              <span className="agency-code">{agency.emblem}</span>
              <div>
                <strong>{agency.name}</strong>
                <small>{agency.motto}</small>
              </div>
            </div>
          )}
          <p className="ksc-eyebrow">Kerbin Space Center</p>
          <h2>Space Center</h2>
        </header>

        <p className="ksc-message">{message}</p>

        {!connected && connectionMode !== "connecting" && (
          <div className="ksc-connect-row">
            <button type="button" className="primary" disabled={busy} onClick={() => void connectToRoom()}>
              Connect to Server
            </button>
            <button type="button" disabled={busy} onClick={() => enableLocalMode()}>
              Play Offline
            </button>
          </div>
        )}

        {connected && !isPilot && connectionMode === "online" && (
          <p className="ksc-hint-warn">You are spectating — click Become Pilot below to launch.</p>
        )}

        <div className="ksc-facility-list">
          {FACILITIES.map((f) => {
            const needsPilot = f.id !== "tracking";
            const disabled = needsPilot && !canUse;
            return (
              <button
                key={f.id}
                type="button"
                className={`ksc-facility ksc-facility-active${disabled ? " ksc-facility-disabled" : ""}`}
                disabled={disabled}
                onClick={() => openFacilitySafe(f.id)}
              >
                <span className="ksc-facility-code">{f.code}</span>
                <div>
                  <strong>{f.name}</strong>
                  <small>{f.desc}</small>
                </div>
              </button>
            );
          })}
        </div>

        {canUse && activeRocket && phase === "lobby" && (
          <button
            type="button"
            className="primary ksc-quick-launch"
            onClick={() => {
              openFacility("pad");
            }}
          >
            Launch — {activeRocket.name}
          </button>
        )}

        {postFlight && (
          <div className="ksc-recovery">
            <button type="button" className="primary" onClick={() => saveTelemetryLocally()}>
              Archive Telemetry
            </button>
            <button type="button" onClick={() => returnLobby()}>
              Return to Space Center
            </button>
          </div>
        )}
      </aside>

      <div className="ksc-map-area">
        <div className="ksc-map-labels">
          <button
            type="button"
            className="ksc-map-pin ksc-pin-pad"
            disabled={!canUse}
            onClick={() => openFacility("pad")}
          >
            LC-1
          </button>
          <button
            type="button"
            className="ksc-map-pin ksc-pin-tracking"
            onClick={() => openOrbitalMap()}
          >
            TRK
          </button>
          <button
            type="button"
            className="ksc-map-pin ksc-pin-vab"
            disabled={!canUse}
            onClick={() => openFacility("vab")}
          >
            VAB
          </button>
          <button
            type="button"
            className="ksc-map-pin ksc-pin-rd"
            disabled={!canUse}
            onClick={() => openFacility("rd")}
          >
            R&D
          </button>
          <button
            type="button"
            className="ksc-map-pin ksc-pin-runway"
            disabled={!canUse}
            onClick={() => openFacility("runway")}
          >
            RWY
          </button>
          <button
            type="button"
            className="ksc-map-pin ksc-pin-admin"
            disabled={!canUse}
            onClick={() => openFacility("admin")}
          >
            ADM
          </button>
        </div>
        <p className="ksc-map-hint">M — orbital map · LC-1 uses your saved rocket roster</p>
      </div>

      <aside className="ksc-roster">
        <div className="ksc-panel">
          <h3>Flight Director</h3>
          <label>
            Callsign
            <input
              type="text"
              value={playerName}
              onChange={(e) => useGameStore.getState().setPlayerName(e.target.value)}
              disabled={busy || connectionMode === "online"}
            />
          </label>
          {connectionMode === "online" && (
            <div className="row">
              <button type="button" onClick={() => sendRole("pilot")} disabled={isPilot}>
                Become Pilot
              </button>
              <button type="button" onClick={() => sendRole("spectator")} disabled={!isPilot}>
                Spectate
              </button>
              <button type="button" onClick={() => sendReady(true)}>
                Ready
              </button>
            </div>
          )}
        </div>

        <div className="ksc-panel">
          <h3>Saved Rockets</h3>
          <ul className="ksc-saved-mini">
            {savedRockets.map((r) => (
              <li
                key={r.id}
                className={r.id === activeSavedRocketId ? "active" : ""}
                onClick={() => {
                  const store = useGameStore.getState();
                  store.setActiveSavedRocket(r.id);
                  store.setCraft(r.craft, false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    const store = useGameStore.getState();
                    store.setActiveSavedRocket(r.id);
                    store.setCraft(r.craft, false);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {r.name}
                <small>{r.craft.parts.length} pts</small>
              </li>
            ))}
          </ul>
          {activeRocket && (
            <p className="ksc-active-rocket">
              Active: <strong>{activeRocket.name}</strong>
            </p>
          )}
          {canUse && (
            <button type="button" className="primary ksc-roster-launch" onClick={() => openFacility("pad")}>
              Open Launch Pad
            </button>
          )}
        </div>

        <div className="ksc-panel">
          <h3>Crew</h3>
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.sessionId}>
                {p.name}
                <span className={`badge ${p.role === "spectator" ? "spectator" : ""}`}>{p.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
