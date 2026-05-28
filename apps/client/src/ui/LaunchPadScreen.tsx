import { computeCraftStats, createCraftRuntime } from "@orbital/physics";
import { goToLaunchPad, returnToKsc } from "../net/roomClient";
import {
  createSavedRocket,
  persistSavedRockets,
  type SavedRocket,
} from "../store/craftStorage";
import { useGameStore } from "../store/gameStore";

export function LaunchPadScreen() {
  const craft = useGameStore((s) => s.craft);
  const savedRockets = useGameStore((s) => s.savedRockets);
  const activeSavedRocketId = useGameStore((s) => s.activeSavedRocketId);
  const isPilot = useGameStore((s) => s.isPilot);
  const connected = useGameStore((s) => s.connected);

  const selected =
    savedRockets.find((r) => r.id === activeSavedRocketId) ?? savedRockets[0] ?? null;
  const stats = selected ? computeCraftStats(createCraftRuntime(selected.craft)) : null;

  const selectRocket = (rocket: SavedRocket) => {
    const store = useGameStore.getState();
    store.setActiveSavedRocket(rocket.id);
    store.setCraft(rocket.craft, false);
    store.setMessage(`Selected ${rocket.name} for launch`);
  };

  const saveCurrentToSlot = () => {
    const store = useGameStore.getState();
    const name = craft.name.trim() || "Custom Rocket";
    const existing = store.savedRockets.find((r) => r.id === store.activeSavedRocketId);
    let next: SavedRocket[];
    if (existing) {
      next = store.savedRockets.map((r) =>
        r.id === existing.id ? { ...r, name, craft: store.craft, updatedAt: Date.now() } : r,
      );
    } else {
      const created = createSavedRocket(name, store.craft);
      next = [...store.savedRockets, created];
      store.setActiveSavedRocket(created.id);
    }
    persistSavedRockets(next);
    store.setSavedRockets(next);
    store.setMessage(`Saved ${name}`);
  };

  const duplicateRocket = () => {
    if (!selected) return;
    const created = createSavedRocket(`${selected.name} Copy`, selected.craft);
    const next = [...savedRockets, created];
    persistSavedRockets(next);
    const store = useGameStore.getState();
    store.setSavedRockets(next);
    store.setActiveSavedRocket(created.id);
    store.setCraft(created.craft, false);
  };

  const deleteRocket = (id: string) => {
    if (savedRockets.length <= 1) return;
    const next = savedRockets.filter((r) => r.id !== id);
    persistSavedRockets(next);
    const store = useGameStore.getState();
    store.setSavedRockets(next);
    if (store.activeSavedRocketId === id) {
      const first = next[0]!;
      store.setActiveSavedRocket(first.id);
      store.setCraft(first.craft, false);
    }
  };

  const launch = () => {
    if (!selected) return;
    if (!connected) {
      useGameStore.getState().setMessage("Connect or choose Play Offline from the Space Center first.");
      return;
    }
    if (!isPilot) {
      useGameStore.getState().setMessage("You must be Pilot to launch (Become Pilot in Space Center).");
      return;
    }
    selectRocket(selected);
    goToLaunchPad();
  };

  return (
    <div className="launch-pad-screen">
      <header className="launch-pad-header">
        <button type="button" className="ghost" onClick={() => returnToKsc()}>
          ← Space Center
        </button>
        <div>
          <p className="ksc-eyebrow">Launch Complex 1</p>
          <h2>Launch Pad</h2>
          <p className="launch-pad-sub">Select a saved vehicle and roll to the pad. Press M anytime for the orbital map.</p>
        </div>
      </header>

      <div className="launch-pad-body">
        <section className="launch-pad-list">
          <h3>Saved Rockets</h3>
          <ul>
            {savedRockets.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`saved-rocket-row ${r.id === activeSavedRocketId ? "saved-rocket-active" : ""}`}
                  onClick={() => selectRocket(r)}
                >
                  <strong>{r.name}</strong>
                  <small>{r.craft.parts.length} parts</small>
                </button>
                {savedRockets.length > 1 && (
                  <button
                    type="button"
                    className="saved-rocket-delete"
                    title="Delete"
                    onClick={() => deleteRocket(r.id)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="launch-pad-list-actions">
            <button type="button" onClick={saveCurrentToSlot}>
              Save Current Design
            </button>
            <button type="button" onClick={duplicateRocket} disabled={!selected}>
              Duplicate
            </button>
          </div>
        </section>

        <section className="launch-pad-detail">
          {selected && stats ? (
            <>
              <h3>{selected.name}</h3>
              <div className="readout-grid">
                <div className="readout">
                  <label>Parts</label>
                  <strong>{selected.craft.parts.length}</strong>
                </div>
                <div className="readout">
                  <label>Mass</label>
                  <strong>{stats.totalMassTonnes.toFixed(2)} t</strong>
                </div>
                <div className="readout">
                  <label>TWR (vac)</label>
                  <strong>{stats.twr.toFixed(2)}</strong>
                </div>
                <div className="readout">
                  <label>TWR (SL)</label>
                  <strong>{stats.twrSeaLevel.toFixed(2)}</strong>
                </div>
                <div className="readout">
                  <label>Stages</label>
                  <strong>{stats.hasEngine ? "Ready" : "No engine"}</strong>
                </div>
              </div>
              <button
                type="button"
                className="primary launch-pad-go"
                disabled={!stats.hasEngine}
                onClick={launch}
              >
                Roll to Pad &amp; Preflight
              </button>
              {!stats.hasEngine && (
                <p className="launch-pad-warn">Add an engine in the VAB before launching.</p>
              )}
            </>
          ) : (
            <p>No saved rockets. Build one in the VAB and save it here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
