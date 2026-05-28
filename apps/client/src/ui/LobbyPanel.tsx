import { connectToRoom, disconnectRoom, enableLocalMode, isLocal, launchCraft, returnLobby, saveTelemetryLocally, sendName, sendReady, sendRole, startBuild } from "../net/roomClient";
import { useGameStore } from "../store/gameStore";

export function LobbyPanel() {
  const connected = useGameStore((s) => s.connected);
  const connectionMode = useGameStore((s) => s.connectionMode);
  const playerName = useGameStore((s) => s.playerName);
  const players = useGameStore((s) => s.players);
  const isPilot = useGameStore((s) => s.isPilot);
  const phase = useGameStore((s) => s.phase);

  const busy = connectionMode === "connecting";

  return (
    <div className="stack">
      <h2>Space Center</h2>
      <label>
        Callsign
        <input
          type="text"
          value={playerName}
          onChange={(e) => useGameStore.getState().setPlayerName(e.target.value)}
          disabled={busy || (connected && connectionMode === "online")}
        />
      </label>

      <div className="row">
        {connectionMode === "offline" && (
          <>
            <button className="primary" onClick={() => void connectToRoom()}>
              Connect Multiplayer
            </button>
            <button onClick={() => enableLocalMode()}>Play Offline</button>
          </>
        )}
        {connectionMode === "online" && (
          <button onClick={() => void disconnectRoom()}>Disconnect</button>
        )}
        {connectionMode === "local" && (
          <button onClick={() => void connectToRoom()}>Try Multiplayer Again</button>
        )}
        {connectionMode === "online" && (
          <button onClick={() => sendName(playerName)}>Update Name</button>
        )}
      </div>

      <h3>Crew</h3>
      <ul className="player-list">
        {players.length === 0 ? (
          <li>{busy ? "Connecting…" : "No players yet"}</li>
        ) : (
          players.map((player) => (
            <li key={player.sessionId}>
              {player.name}
              <span className={`badge ${player.role === "spectator" ? "spectator" : ""}`}>
                {player.role}
              </span>
              {player.ready ? " • ready" : ""}
            </li>
          ))
        )}
      </ul>

      {connected && connectionMode === "online" && (
        <div className="row">
          <button onClick={() => sendRole("pilot")} disabled={isPilot}>
            Become Pilot
          </button>
          <button onClick={() => sendRole("spectator")} disabled={!isPilot}>
            Spectate
          </button>
          <button onClick={() => sendReady(true)}>Ready</button>
        </div>
      )}

      {connected && isPilot && phase === "lobby" && (
        <button className="primary" onClick={() => startBuild()}>
          Enter Vehicle Assembly
        </button>
      )}

      {connected && isPilot && (phase === "build" || phase === "preflight") && (
        <button className="primary" onClick={() => launchCraft()}>
          Launch Rocket
        </button>
      )}

      {connected && (phase === "space" || phase === "landed" || phase === "crashed") && (
        <div className="row">
          <button onClick={() => saveTelemetryLocally()}>Save Telemetry Copy</button>
          <button onClick={() => returnLobby()}>Return To Lobby</button>
        </div>
      )}

      {isLocal() && connected && phase === "lobby" && (
        <p className="controls-help">
          Offline mode: build and launch work locally. Run <code>pnpm dev</code> in the project folder for multiplayer.
        </p>
      )}
    </div>
  );
}
