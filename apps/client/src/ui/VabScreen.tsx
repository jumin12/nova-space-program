import { useMemo, useState } from "react";
import { BUILDER_PART_IDS, getPart, type PartCategory } from "@orbital/common";
import {
  computeCraftStats,
  createCraftRuntime,
  addPartToStackTop,
  addPartToStackBottom,
  removeLastPart,
  removePartById,
  setPartStage,
  movePartToStage,
  reorderPartInStack,
  craftToDefinition,
} from "@orbital/physics";
import { openFacility, returnToKsc, sendCraft } from "../net/roomClient";
import { persistSavedRockets } from "../store/craftStorage";
import { useGameStore, updateCraft } from "../store/gameStore";

const CATEGORIES: { id: PartCategory | "all"; label: string }[] = [
  { id: "all", label: "All Parts" },
  { id: "probe", label: "Command Pods" },
  { id: "tank", label: "Fuel Tanks" },
  { id: "engine", label: "Engines" },
  { id: "decoupler", label: "Decouplers" },
  { id: "structural", label: "Aerodynamics" },
];

export function VabScreen() {
  const craft = useGameStore((s) => s.craft);
  const isPilot = useGameStore((s) => s.isPilot);
  const selectedPartId = useGameStore((s) => s.selectedPartId);
  const placingPartId = useGameStore((s) => s.placingPartId);
  const craftHistory = useGameStore((s) => s.craftHistory);
  const craftFuture = useGameStore((s) => s.craftFuture);
  const [category, setCategory] = useState<PartCategory | "all">("all");
  const [dragPartId, setDragPartId] = useState<string | null>(null);
  const vabStage = useGameStore((s) => s.vabStage);
  const setVabStage = useGameStore((s) => s.setVabStage);

  const runtime = createCraftRuntime(craft);
  const stats = computeCraftStats(runtime);
  const selectedPart = craft.parts.find((p) => p.instanceId === selectedPartId);
  const selectedDef = selectedPart ? getPart(selectedPart.definitionId) : null;

  const stages = useMemo(() => {
    const max = craft.parts.reduce((m, p) => Math.max(m, p.stage), 1);
    return Array.from({ length: max }, (_, i) => max - i);
  }, [craft.parts]);

  const applyCraft = (next: typeof craft) => {
    updateCraft(next);
    sendCraft(next);
  };

  const filteredParts = BUILDER_PART_IDS.filter((id) => {
    if (category === "all") return true;
    return getPart(id).category === category;
  });

  const beginPlacePart = (definitionId: string) => {
    useGameStore.getState().setPlacingPartId(definitionId);
  };

  const addStage = () => {
    const max = craft.parts.reduce((m, p) => Math.max(m, p.stage), 1);
    setVabStage(Math.min(10, max + 1));
  };

  const partsForStage = (stage: number) =>
    craft.parts.filter((p) => p.stage === stage);

  const applyCraftReorder = (mutate: (rt: ReturnType<typeof createCraftRuntime>) => void) => {
    const rt = createCraftRuntime(craft);
    mutate(rt);
    applyCraft(craftToDefinition(rt));
  };

  const handleDropOnStage = (targetStage: number, beforeInstanceId: string | null) => {
    if (!dragPartId || !isPilot) return;
    applyCraftReorder((rt) => {
      const current = rt.parts.find((p) => p.instanceId === dragPartId);
      if (!current) return;
      if (current.stage !== targetStage) {
        movePartToStage(rt, dragPartId, targetStage);
      }
      if (beforeInstanceId) {
        const toIndex = rt.parts.findIndex((p) => p.instanceId === beforeInstanceId);
        if (toIndex >= 0) reorderPartInStack(rt, dragPartId, toIndex);
      }
    });
    setDragPartId(null);
  };

  /** Reorder rocket stack (craft.parts index 0 = bottom). Drop on row = insert at that stack slot. */
  const handleDropOnStack = (beforeInstanceId: string | null) => {
    if (!dragPartId || !isPilot) return;
    applyCraftReorder((rt) => {
      let toIndex = rt.parts.length;
      if (beforeInstanceId) {
        const idx = rt.parts.findIndex((p) => p.instanceId === beforeInstanceId);
        if (idx >= 0) toIndex = idx;
      }
      reorderPartInStack(rt, dragPartId, toIndex);
    });
    setDragPartId(null);
  };

  return (
    <div className="vab-screen vab-screen-full">
      <header className="vab-toolbar">
        <div className="vab-toolbar-left">
          <button type="button" onClick={() => returnToKsc()}>Back to Space Center</button>
          <h2>Vehicle Assembly Building</h2>
        </div>
        <div className="vab-toolbar-center">
          <button disabled={!isPilot || craftHistory.length === 0} onClick={() => useGameStore.getState().undoCraft()}>
            Undo
          </button>
          <button disabled={!isPilot || craftFuture.length === 0} onClick={() => useGameStore.getState().redoCraft()}>
            Redo
          </button>
          <span className="vab-hint">
            {placingPartId
              ? `Placing on stage ${vabStage} — click green (top) or orange (bottom) node`
              : "Click part to place · Q/E rotate craft · RMB orbit · Scroll zoom"}
          </span>
        </div>
        <div className="vab-toolbar-right">
          {placingPartId && (
            <button onClick={() => useGameStore.getState().setPlacingPartId(null)}>Cancel</button>
          )}
          {isPilot && (
            <button
              className="primary launch-btn"
              onClick={() => {
                const store = useGameStore.getState();
                const name = store.craft.name.trim() || "Custom Rocket";
                const next = store.savedRockets.map((r) =>
                  r.id === store.activeSavedRocketId
                    ? { ...r, name, craft: store.craft, updatedAt: Date.now() }
                    : r,
                );
                persistSavedRockets(next);
                store.setSavedRockets(next);
                openFacility("pad");
              }}
            >
              Save &amp; Open Launch Pad
            </button>
          )}
        </div>
      </header>

      <div className="vab-body">
        <aside className="vab-panel vab-parts-panel">
          <input type="search" className="vab-search" placeholder="Search parts..." disabled />
          <div className="vab-categories">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={category === c.id ? "cat-active" : ""}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="part-catalog">
            {filteredParts.map((id) => {
              const def = getPart(id);
              return (
                <button
                  key={id}
                  className={`part-card ${placingPartId === id ? "part-placing" : ""}`}
                  disabled={!isPilot}
                  onPointerDown={(e) => {
                    if (!isPilot) return;
                    e.preventDefault();
                    beginPlacePart(id);
                  }}
                  onDoubleClick={() => {
                    if (!isPilot) return;
                    const rt = createCraftRuntime(craft);
                    if (def.category === "engine" || def.category === "structural") {
                      addPartToStackBottom(rt, id, vabStage);
                    } else {
                      addPartToStackTop(rt, id, vabStage);
                    }
                    applyCraft(craftToDefinition(rt));
                  }}
                >
                  <span className="part-swatch" style={{ background: def.color }} />
                  <div>
                    <strong>{def.name}</strong>
                    <small>
                      {def.mass.toFixed(2)} t · {(def.radius * 2).toFixed(2)} m
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="vab-center-spacer" aria-hidden />

        <aside className="vab-panel vab-details-panel">
          <h3>Craft</h3>
          <input
            type="text"
            className="craft-name-input"
            value={craft.name}
            disabled={!isPilot}
            onChange={(e) => {
              const next = { ...craft, name: e.target.value };
              useGameStore.getState().setCraft(next);
              sendCraft(next);
            }}
          />

          <h3>Stages</h3>
          <p className="vab-stage-note">
            Drag parts between stages · order within a stage · new parts go to stage {vabStage}
          </p>
          <div className="vab-stages-board">
            {stages.map((stg) => {
              const stageParts = [...partsForStage(stg)].reverse();
              return (
                <div
                  key={stg}
                  className={`vab-stage-column ${vabStage === stg ? "vab-stage-column-active" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnStage(stg, null);
                  }}
                >
                  <button
                    type="button"
                    className="vab-stage-column-head"
                    onClick={() => setVabStage(stg)}
                  >
                    Stage {stg}
                  </button>
                  <div className="vab-stage-drop-list">
                    {stageParts.map((part) => {
                      const def = getPart(part.definitionId);
                      return (
                        <div
                          key={part.instanceId}
                          className={`vab-stage-part ${part.instanceId === selectedPartId ? "part-selected" : ""} ${dragPartId === part.instanceId ? "vab-dragging" : ""}`}
                          draggable={isPilot}
                          onDragStart={() => isPilot && setDragPartId(part.instanceId)}
                          onDragEnd={() => setDragPartId(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDropOnStage(stg, part.instanceId);
                          }}
                          onClick={() => useGameStore.getState().setSelectedPartId(part.instanceId)}
                        >
                          {def.name}
                        </div>
                      );
                    })}
                    {stageParts.length === 0 && (
                      <div className="vab-stage-empty">Drop parts here</div>
                    )}
                  </div>
                </div>
              );
            })}
            {isPilot && stages.length < 10 && (
              <button type="button" className="vab-stage-add-col" onClick={addStage} title="Add stage">
                +
              </button>
            )}
          </div>

          {selectedPart && selectedDef ? (
            <div className="vab-selected-part">
              <h3>Selected Part</h3>
              <p><strong>{selectedDef.name}</strong></p>
              <p className="ksc-subtitle">Stage {selectedPart.stage} · {selectedDef.category}</p>
              {isPilot && (
                <div className="row">
                  <label>
                    Stage
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={selectedPart.stage}
                      onChange={(e) => {
                        const rt = createCraftRuntime(craft);
                        setPartStage(rt, selectedPart.instanceId, Number(e.target.value));
                        applyCraft(craftToDefinition(rt));
                      }}
                    />
                  </label>
                  <button
                    className="danger-btn"
                    onClick={() => {
                      const rt = createCraftRuntime(craft);
                      removePartById(rt, selectedPart.instanceId);
                      useGameStore.getState().setSelectedPartId(null);
                      applyCraft(craftToDefinition(rt));
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="vab-select-hint">Click a part in the 3D rocket to inspect</p>
          )}

          <h3>Full stack (bottom → top)</h3>
          <p className="vab-stage-note">Drag to reorder parts on the rocket (top of list = top of stack)</p>
          <ul
            className="part-list stage-list vab-stack-list"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDropOnStack(null);
            }}
          >
            {[...craft.parts].reverse().map((part) => {
              const def = getPart(part.definitionId);
              return (
                <li
                  key={part.instanceId}
                  className={`vab-stack-part ${part.instanceId === selectedPartId ? "part-selected" : ""} ${dragPartId === part.instanceId ? "vab-dragging" : ""}`}
                  draggable={isPilot}
                  onDragStart={() => isPilot && setDragPartId(part.instanceId)}
                  onDragEnd={() => setDragPartId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDropOnStack(part.instanceId);
                  }}
                  onClick={() => useGameStore.getState().setSelectedPartId(part.instanceId)}
                >
                  <span className="stage-num">S{part.stage}</span>
                  {def.name}
                </li>
              );
            })}
          </ul>

          {isPilot && (
            <button
              className="danger-btn"
              onClick={() => {
                const rt = createCraftRuntime(craft);
                removeLastPart(rt);
                applyCraft(craftToDefinition(rt));
              }}
            >
              Remove Bottom Part
            </button>
          )}
        </aside>
      </div>

      <footer className="vab-footer vab-footer-full">
        <div className="readout"><label>Mass</label><strong>{stats.totalMassTonnes.toFixed(2)} t</strong></div>
        <div className="readout">
          <label>TWR (SL)</label>
          <strong className={stats.twrSeaLevel >= 1.0 ? "good" : "warn"}>{stats.twrSeaLevel.toFixed(2)}</strong>
        </div>
        <div className="readout"><label>Thrust (vac)</label><strong>{(stats.thrust / 1000).toFixed(0)} kN</strong></div>
        <div className="readout"><label>Fuel</label><strong>{stats.fuelRemaining.toFixed(0)} kg</strong></div>
        <div className="readout"><label>Parts</label><strong>{craft.parts.length}</strong></div>
        <div className="readout"><label>Stages</label><strong>{runtime.maxStage}</strong></div>
        {stats.twrSeaLevel < 1.0 && <div className="vab-warning">TWR below 1.0 — add engines or reduce mass</div>}
      </footer>
    </div>
  );
}
