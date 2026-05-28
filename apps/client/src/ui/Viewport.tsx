import { useEffect, useRef } from "react";
import { FlightScene, type SceneViewMode } from "../game/FlightScene";
import { getCelestialAssetBundle } from "../game/assets/assetCache.js";
import { defaultAttachForPart } from "../game/vabEditor.js";
import { igniteLaunch, sendCraft, sendInput, sendThrottle, toggleMap } from "../net/roomClient";
import { useGameStore } from "../store/gameStore";
import { createCraftRuntime, craftToDefinition, removePartById } from "@orbital/physics";

function phaseToView(phase: string): SceneViewMode {
  if (
    phase === "mainmenu" ||
    phase === "connecting" ||
    phase === "mode_select" ||
    phase === "agency_create"
  ) {
    return "menu";
  }
  return "kerbin";
}

function isMenuBackgroundPhase(phase: string) {
  return (
    phase === "mainmenu" ||
    phase === "connecting" ||
    phase === "mode_select" ||
    phase === "agency_create"
  );
}

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<FlightScene | null>(null);
  const craft = useGameStore((s) => s.craft);
  const selectedPartId = useGameStore((s) => s.selectedPartId);
  const placingPartId = useGameStore((s) => s.placingPartId);
  const phase = useGameStore((s) => s.phase);
  const isPilot = useGameStore((s) => s.isPilot);
  const stagePressed = useRef(false);
  const launchPressed = useRef(false);
  const rmbDown = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new FlightScene(canvasRef.current, getCelestialAssetBundle());
    scene.setFlightProvider(() => {
      const s = useGameStore.getState();
      const f = s.flight;
      return {
        phase: s.phase,
        debris: s.flight.debris ?? [],
        flight: {
          posX: f.posX,
          posY: f.posY,
          posZ: f.posZ,
          velX: f.velX,
          velY: f.velY,
          velZ: f.velZ,
          rotX: f.rotX,
          rotY: f.rotY,
          rotZ: f.rotZ,
          rotW: f.rotW,
          launched: f.launched,
          armed: f.armed,
          throttle: s.isPilot ? s.input.throttle : f.throttle,
          altitude: f.altitude,
          fuelRemaining: f.fuelRemaining,
        },
      };
    });
    sceneRef.current = scene;
    return () => sceneRef.current?.dispose();
  }, []);

  useEffect(() => {
    sceneRef.current?.setViewMode(phaseToView(phase));
    sceneRef.current?.setGameplayPhase(phase);
  }, [phase]);

  useEffect(() => {
    sceneRef.current?.setCraftPreview(craft, selectedPartId, placingPartId);
  }, [craft, selectedPartId, placingPartId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isMenuBackgroundPhase(phase)) return;

    const tryPlacePart = (clientX: number, clientY: number) => {
      const store = useGameStore.getState();
      if (store.phase !== "build" || !store.placingPartId) return;

      const attach =
        sceneRef.current?.pickVabAttach(clientX, clientY) ??
        defaultAttachForPart(store.placingPartId);

      const next = store.commitPlacingPart(attach);
      if (next) sendCraft(next);
    };

    const onMouseDown = (e: MouseEvent) => {
      const store = useGameStore.getState();
      if (e.button === 0 && store.phase === "build") {
        if (store.placingPartId) {
          tryPlacePart(e.clientX, e.clientY);
          return;
        }
        const id = sceneRef.current?.pickVabPart(e.clientX, e.clientY);
        if (id) store.setSelectedPartId(id);
        else if (!rmbDown.current) store.setSelectedPartId(null);
      }
      if (e.button === 2 || e.button === 1) {
        rmbDown.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) tryPlacePart(e.clientX, e.clientY);
      if (e.button === 2 || e.button === 1) rmbDown.current = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (useGameStore.getState().phase === "build" && useGameStore.getState().placingPartId) {
        sceneRef.current?.updatePlacementPointer(e.clientX, e.clientY);
      }
      if (!rmbDown.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      sceneRef.current?.applyCameraInput({ orbitX: -dx * 0.005, orbitY: dy * 0.004, zoom: 0 });
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sceneRef.current?.applyCameraInput({ orbitX: 0, orbitY: 0, zoom: e.deltaY * 0.0012 });
    };

    const onContextMenu = (e: Event) => {
      e.preventDefault();
      if (useGameStore.getState().phase === "build" && useGameStore.getState().placingPartId) {
        useGameStore.getState().setPlacingPartId(null);
      }
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [phase]);

  useEffect(() => {
    const down = new Set<string>();

    const rampThrottle = (dt: number) => {
      if (!isPilot || (phase !== "flight" && phase !== "preflight")) return;
      const prev = useGameStore.getState().input.throttle;
      let t = prev;
      if (down.has("ShiftLeft") || down.has("ShiftRight")) t = Math.min(1, t + dt * 1.5);
      if (down.has("ControlLeft") || down.has("ControlRight")) t = Math.max(0, t - dt * 1.5);
      if (down.has("KeyZ")) t = 1;
      if (down.has("KeyX")) t = 0;
      if (Math.abs(t - prev) > 0.001) sendThrottle(t);
    };

    const sendFlightControls = (stagePulse = false) => {
      if (!isPilot || phase !== "flight") return;
      sendInput({
        pitch: (down.has("KeyS") ? 1 : 0) + (down.has("KeyW") ? -1 : 0),
        yaw: (down.has("KeyD") ? 1 : 0) + (down.has("KeyA") ? -1 : 0),
        roll: (down.has("KeyE") ? 1 : 0) + (down.has("KeyQ") ? -1 : 0),
        stage: stagePulse,
        throttle: useGameStore.getState().input.throttle,
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) {
        const store = useGameStore.getState();
        if (
          store.phase === "lobby" ||
          store.phase === "offline" ||
          store.phase === "preflight" ||
          store.phase === "flight" ||
          store.phase === "build" ||
          store.phase === "space" ||
          store.phase === "landed" ||
          store.phase === "crashed"
        ) {
          e.preventDefault();
          toggleMap();
        }
        return;
      }

      if (phase === "build" && isPilot) {
        if (e.code === "KeyQ") {
          e.preventDefault();
          const snap = e.shiftKey ? Math.PI / 12 : 0.12;
          sceneRef.current?.rotateVabCraft(-snap);
          return;
        }
        if (e.code === "KeyE") {
          e.preventDefault();
          const snap = e.shiftKey ? Math.PI / 12 : 0.12;
          sceneRef.current?.rotateVabCraft(snap);
          return;
        }
        if (e.code === "Delete" || e.code === "Backspace") {
          const store = useGameStore.getState();
          if (!store.selectedPartId) return;
          e.preventDefault();
          const rt = createCraftRuntime(store.craft);
          if (removePartById(rt, store.selectedPartId)) {
            const next = craftToDefinition(rt);
            store.setCraft(next, true);
            sendCraft(next);
            store.setSelectedPartId(null);
          }
          return;
        }
        if (e.code === "Escape") {
          useGameStore.getState().setPlacingPartId(null);
          return;
        }
      }

      if (phase === "preflight" && e.code === "Space") {
        e.preventDefault();
        if (!launchPressed.current) {
          launchPressed.current = true;
          igniteLaunch();
        }
        return;
      }

      if (phase === "flight" && e.code === "Space") {
        e.preventDefault();
        if (!stagePressed.current) {
          stagePressed.current = true;
          sendFlightControls(true);
        }
        return;
      }

      down.add(e.code);
      sendFlightControls(false);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      down.delete(e.code);
      if (e.code === "Space") {
        stagePressed.current = false;
        launchPressed.current = false;
      }
      sendFlightControls(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    let last = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      rampThrottle(dt);
      if (phase === "flight" && isPilot) sendFlightControls(false);
    }, 1000 / 30);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      clearInterval(interval);
    };
  }, [isPilot, phase]);

  const menuBackground = isMenuBackgroundPhase(phase);

  return (
    <div className={`viewport${menuBackground ? " viewport--menu-bg" : ""}`}>
      <canvas ref={canvasRef} id="game-canvas" aria-hidden={menuBackground} />
      {(phase === "lobby" || phase === "offline" || phase === "preflight" || phase === "flight" || phase === "build") && (
        <div className="camera-hint">
          {phase === "build"
            ? "Click part · Green=top / Orange=bottom attach · Q/E rotate · Del remove · M map · RMB orbit"
            : "Right-drag orbit · Scroll zoom · M orbital map"}
        </div>
      )}
    </div>
  );
}
