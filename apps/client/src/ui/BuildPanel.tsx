import { BUILDER_PART_IDS, getPart } from "@orbital/common";
import { computeCraftStats, createCraftRuntime, addPartToCraft, removeLastPart, craftToDefinition } from "@orbital/physics";
import { sendCraft } from "../net/roomClient";
import { useGameStore } from "../store/gameStore";

export function BuildPanel() {
  const craft = useGameStore((s) => s.craft);
  const isPilot = useGameStore((s) => s.isPilot);
  const runtime = createCraftRuntime(craft);
  const stats = computeCraftStats(runtime);

  const updateCraft = (next: typeof craft) => {
    sendCraft(next);
  };

  return (
    <div className="stack">
      <h2>Vehicle Assembly</h2>
      <input
        type="text"
        value={craft.name}
        disabled={!isPilot}
        onChange={(e) => updateCraft({ ...craft, name: e.target.value })}
      />
      <div className="stat-grid">
        <div className="stat">
          <label>Mass</label>
          <strong>{stats.totalMassTonnes.toFixed(2)} t</strong>
        </div>
        <div className="stat">
          <label>TWR</label>
          <strong>{stats.twr.toFixed(2)}</strong>
        </div>
        <div className="stat">
          <label>Thrust</label>
          <strong>{(stats.thrust / 1000).toFixed(0)} kN</strong>
        </div>
        <div className="stat">
          <label>Fuel</label>
          <strong>{stats.fuelRemaining.toFixed(0)} u</strong>
        </div>
      </div>
      <h3>Stack</h3>
      <ul className="part-list">
        {craft.parts.map((part) => {
          const def = getPart(part.definitionId);
          return (
            <li key={part.instanceId}>
              {def.name} <span className="badge">S{part.stage}</span>
            </li>
          );
        })}
      </ul>
      {isPilot && (
        <>
          <h3>Add Part</h3>
          <div className="row">
            {BUILDER_PART_IDS.map((id) => (
              <button
                key={id}
                onClick={() => {
                  addPartToCraft(runtime, id, 1);
                  updateCraft(craftToDefinition(runtime));
                }}
              >
                {getPart(id).name}
              </button>
            ))}
          </div>
          <button onClick={() => {
            removeLastPart(runtime);
            updateCraft(craftToDefinition(runtime));
          }}>
            Remove Top Part
          </button>
        </>
      )}
    </div>
  );
}
