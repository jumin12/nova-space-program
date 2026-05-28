import { computeCraftStats, createCraftRuntime } from "@orbital/physics";
import { useGameStore } from "../store/gameStore";
import { cancelPreflight } from "../net/roomClient";

export function LaunchPadHud() {
  const input = useGameStore((s) => s.input);
  const flight = useGameStore((s) => s.flight);
  const craft = useGameStore((s) => s.craft);
  const message = useGameStore((s) => s.message);

  const stats = computeCraftStats(createCraftRuntime(craft));
  const ready = stats.twrSeaLevel >= 1.0;
  const ignited = flight.armed;

  return (
    <div className="launch-pad-hud">
      <div className="launch-pad-top row">
        <button onClick={() => cancelPreflight()}>← Vehicle Assembly</button>
        <div className="launch-pad-banner">
          <h2>Launch Complex 1</h2>
          <p>{craft.name}</p>
        </div>
      </div>

      <div className="launch-pad-readouts">
        <div className="readout">
          <label>Status</label>
          <strong className={ignited ? "good" : ""}>{ignited ? "Engines on" : "Engines off"}</strong>
        </div>
        <div className="readout">
          <label>TWR (SL)</label>
          <strong className={ready ? "good" : "warn"}>{stats.twrSeaLevel.toFixed(2)}</strong>
        </div>
        <div className="readout"><label>Mass</label><strong>{stats.totalMassTonnes.toFixed(2)} t</strong></div>
        <div className="readout"><label>Fuel</label><strong>{stats.fuelRemaining.toFixed(0)} kg</strong></div>
      </div>

      <div className="launch-pad-instructions">
        <div className="instruction-row">
          <kbd>Shift</kbd>
          <span>Set throttle (engines stay off until launch)</span>
        </div>
        <div className="instruction-row">
          <kbd>Ctrl</kbd>
          <span>Reduce throttle</span>
        </div>
        <div className="instruction-row highlight">
          <kbd>Space</kbd>
          <span>
            {ignited
              ? ready
                ? "Liftoff when TWR ≥ 1.0 — throttle up if needed"
                : "Throttle up — need TWR ≥ 1.0 to lift"
              : "Release clamps and ignite engines"}
          </span>
        </div>
      </div>

      <div className="launch-pad-throttle">
        <label>Throttle setting — {Math.round(input.throttle * 100)}%</label>
        <div className="throttle-bar">
          <div className="throttle-fill" style={{ width: `${input.throttle * 100}%` }} />
        </div>
      </div>

      <p className="launch-pad-message">{message}</p>
    </div>
  );
}
