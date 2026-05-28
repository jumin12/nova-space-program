import { useEffect, useRef } from "react";
import { OrbitalMapScene } from "../game/orbitalMapScene.js";
import { useGameStore } from "../store/gameStore";
import { getSignalStatus } from "./signalStatus";

type Props = {
  onClose: () => void;
};

export function OrbitalMapView({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbitalMapScene | null>(null);
  const flight = useGameStore((s) => s.flight);
  const phase = useGameStore((s) => s.phase);
  const craftName = useGameStore((s) => s.craft.name);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new OrbitalMapScene(canvas);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !e.repeat) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const altKm = (flight.altitude / 1000).toFixed(1);
  const velKmS = (flight.velocity / 1000).toFixed(2);
  const apKm =
    flight.apoapsis != null && Number.isFinite(flight.apoapsis)
      ? (flight.apoapsis / 1000).toFixed(1)
      : "—";
  const peKm =
    flight.periapsis != null && Number.isFinite(flight.periapsis)
      ? (flight.periapsis / 1000).toFixed(1)
      : "—";
  const signal = getSignalStatus({
    phase,
    launched: flight.launched,
    crashed: flight.crashed,
    inSpace: flight.inSpace,
  });

  return (
    <div className="orbital-map-overlay">
      <div className="orbital-map-toolbar">
        <div>
          <p className="ksc-eyebrow">Tracking Station</p>
          <h2>Orbital Map</h2>
        </div>
        <div className="orbital-map-stats">
          <span>
            <label>Altitude</label> {altKm} km
          </span>
          <span>
            <label>Velocity</label> {velKmS} km/s
          </span>
          <span>
            <label>Apoapsis</label> {apKm} km
          </span>
          <span>
            <label>Periapsis</label> {peKm} km
          </span>
          <span>
            <label>Vessel</label> {craftName}
          </span>
          <span className={flight.inSpace ? "map-in-space" : ""}>
            <label>Regime</label> {flight.inSpace ? "Space" : "Atmosphere"}
          </span>
          <span>
            <label>Signal</label> {signal}
          </span>
        </div>
        <button type="button" className="primary" onClick={onClose}>
          Close (M)
        </button>
      </div>
      <canvas ref={canvasRef} className="orbital-map-canvas" />
      <p className="orbital-map-hint">
        KSP-style map · Drag orbit · Scroll zoom · Cyan = orbit · Green dashed = ground track · Facilities on equator
      </p>
    </div>
  );
}
