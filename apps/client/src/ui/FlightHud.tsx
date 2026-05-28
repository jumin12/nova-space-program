import { computeCraftStats, createCraftRuntime } from "@orbital/physics";
import { cancelPreflight, returnLobby, saveTelemetryLocally, sendThrottle } from "../net/roomClient";
import { useGameStore } from "../store/gameStore";
import { Navball } from "./Navball";
import { getSignalStatus } from "./signalStatus";

function formatMeters(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${value.toFixed(0)} m`;
}

export function FlightHud() {
  const flight = useGameStore((s) => s.flight);
  const input = useGameStore((s) => s.input);
  const isPilot = useGameStore((s) => s.isPilot);
  const craft = useGameStore((s) => s.craft);
  const phase = useGameStore((s) => s.phase);

  const onPad = phase === "preflight" || (phase === "flight" && !flight.launched);
  const stats = computeCraftStats(createCraftRuntime(craft));
  const ready = stats.twrSeaLevel >= 1.0;
  const throttle = isPilot ? input.throttle : flight.throttle;
  const fuelCap = Math.max(flight.fuelCapacity, stats.fuelRemaining, 1);
  const fuelPct = Math.min(100, (flight.fuelRemaining / fuelCap) * 100);
  const signal = getSignalStatus({
    phase,
    launched: flight.launched,
    crashed: flight.crashed,
    inSpace: flight.inSpace,
  });

  const pitch = flight.pitch;
  const yaw = Math.atan2(2 * (flight.rotW * flight.rotY - flight.rotZ * flight.rotX), 1 - 2 * (flight.rotY * flight.rotY + flight.rotX * flight.rotX));
  const roll = Math.atan2(2 * (flight.rotW * flight.rotZ + flight.rotX * flight.rotY), 1 - 2 * (flight.rotZ * flight.rotZ + flight.rotX * flight.rotX));

  return (
    <div className="flight-hud-ksp">
      <div className="hud-left">
        <Navball pitch={pitch} yaw={yaw} roll={roll} size={130} />
        <div className="hud-resources">
          <div className="resource-bar">
            <label>Liquid Fuel</label>
            <div className="bar-track"><div className="bar-fill fuel" style={{ width: `${fuelPct}%` }} /></div>
            <span>{flight.fuelRemaining.toFixed(0)} kg</span>
          </div>
          <div className="resource-bar">
            <label>Electric Charge</label>
            <div className="bar-track"><div className="bar-fill power" style={{ width: "85%" }} /></div>
            <span>85%</span>
          </div>
          <div className="resource-bar resource-bar-signal">
            <label>Signal</label>
            <span className="signal-status">{signal}</span>
          </div>
        </div>
      </div>

      <div className="hud-center">
        {onPad && (
          <div className="hud-pad-banner">
            <strong>Launch Complex 1</strong>
            <span>{craft.name}</span>
            <p className="hud-pad-hint">
              {flight.armed
                ? ready
                  ? "Throttle up — liftoff when TWR ≥ 1"
                  : "Need TWR ≥ 1.0 to lift"
                : "Shift throttle · Space to release clamps"}
            </p>
          </div>
        )}
        {(phase === "space" || phase === "crashed" || phase === "landed") && (
          <div className={`hud-banner hud-banner-${phase}`}>
            {phase === "space" && "Suborbital space reached"}
            {phase === "crashed" && "Vehicle destroyed"}
            {phase === "landed" && "Recovered safely"}
          </div>
        )}
      </div>

      <div className="hud-right">
        <div className="hud-readout"><label>ALT</label><strong>{formatMeters(flight.altitude)}</strong></div>
        <div className="hud-readout"><label>VEL</label><strong>{formatMeters(flight.velocity)}/s</strong></div>
        <div className="hud-readout"><label>VS</label><strong>{formatMeters(flight.verticalSpeed)}/s</strong></div>
        <div className="hud-readout"><label>AP</label><strong>{formatMeters(flight.apoapsis)}</strong></div>
        <div className="hud-readout"><label>PE</label><strong>{formatMeters(flight.periapsis)}</strong></div>
        <div className="hud-readout"><label>Q</label><strong>{flight.dynamicPressure.toFixed(0)} Pa</strong></div>
      </div>

      <div className="hud-bottom">
        <div className="stage-indicator">
          <label>STAGE</label>
          <div className="stages">
          {Array.from({ length: craft.parts.reduce((m, p) => Math.max(m, p.stage), 1) }, (_, i) => {
            const maxStage = craft.parts.reduce((m, p) => Math.max(m, p.stage), 1);
            const stg = maxStage - i;
            return (
              <span key={stg} className={`stage-pip ${flight.activeStage === stg ? "active" : stg > flight.activeStage ? "spent" : ""}`}>
                {stg}
              </span>
            );
          })}
        </div>
        </div>

        {isPilot && (
          <div className="throttle-cluster">
            <label>THROTTLE {Math.round(throttle * 100)}%</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={throttle}
              onChange={(e) => sendThrottle(Number(e.target.value))}
            />
          </div>
        )}

        <div className="hud-hints">
          {onPad
            ? "Shift/Ctrl throttle · Space launch · M map"
            : "W/S pitch · A/D yaw · Q/E roll · Space stage · M map · Z/X throttle"}
        </div>

        {onPad && isPilot && (
          <button className="hud-back-vab" onClick={() => cancelPreflight()}>
            Vehicle Assembly
          </button>
        )}

        {(phase === "space" || phase === "landed" || phase === "crashed") && (
          <div className="row">
            <button onClick={() => saveTelemetryLocally()}>Save Telemetry</button>
            <button onClick={() => returnLobby()}>Space Center</button>
          </div>
        )}
      </div>
    </div>
  );
}
