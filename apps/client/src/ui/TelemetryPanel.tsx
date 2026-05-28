import { useGameStore } from "../store/gameStore";

function formatMeters(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${value.toFixed(0)} m`;
}

export function TelemetryPanel() {
  const flight = useGameStore((s) => s.flight);
  const phase = useGameStore((s) => s.phase);
  const input = useGameStore((s) => s.input);
  const isPilot = useGameStore((s) => s.isPilot);

  return (
    <div className="stack">
      <h2>Telemetry</h2>
      <div className="stat-grid">
        <div className="stat">
          <label>Altitude</label>
          <strong>{formatMeters(flight.altitude)}</strong>
        </div>
        <div className="stat">
          <label>Velocity</label>
          <strong>{formatMeters(flight.velocity)}/s</strong>
        </div>
        <div className="stat">
          <label>Vertical Speed</label>
          <strong>{formatMeters(flight.verticalSpeed)}/s</strong>
        </div>
        <div className="stat">
          <label>Acceleration</label>
          <strong>{flight.acceleration.toFixed(1)} m/s²</strong>
        </div>
        <div className="stat">
          <label>Dynamic Pressure</label>
          <strong>{flight.dynamicPressure.toFixed(0)} Pa</strong>
        </div>
        <div className="stat">
          <label>Apoapsis</label>
          <strong>{formatMeters(flight.apoapsis)}</strong>
        </div>
        <div className="stat">
          <label>Periapsis</label>
          <strong>{formatMeters(flight.periapsis)}</strong>
        </div>
        <div className="stat">
          <label>Stage</label>
          <strong>{flight.activeStage}</strong>
        </div>
        <div className="stat">
          <label>Fuel</label>
          <strong>{flight.fuelRemaining.toFixed(0)} u</strong>
        </div>
        <div className="stat">
          <label>Mass</label>
          <strong>{(flight.mass / 1000).toFixed(2)} t</strong>
        </div>
        <div className="stat">
          <label>In Space</label>
          <strong>{flight.inSpace ? "YES" : "NO"}</strong>
        </div>
        <div className="stat">
          <label>Telemetry ID</label>
          <strong>{flight.lastTelemetryId || "—"}</strong>
        </div>
      </div>

      {phase === "flight" && isPilot && (
        <>
          <h3>Throttle</h3>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={input.throttle}
            onChange={(e) => useGameStore.getState().setInput({ throttle: Number(e.target.value) })}
          />
          <div className="controls-help">
            W/S pitch, A/D yaw, Q/E roll, Space stage, X cut throttle, Z max throttle
          </div>
        </>
      )}
    </div>
  );
}
