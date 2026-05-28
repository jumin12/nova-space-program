import { useEffect, useRef } from "react";

type NavballProps = {
  pitch: number;
  yaw: number;
  roll: number;
  size?: number;
};

export function Navball({ pitch, yaw, roll, size = 120 }: NavballProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;

    ctx.clearRect(0, 0, size, size);

    // Bezel
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sky/ground sphere clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(-roll);

    const pitchPx = pitch * (r / 1.2);
    ctx.translate(0, pitchPx);

    // Sky
    ctx.fillStyle = "#1a6eb8";
    ctx.fillRect(-r, -r * 2, r * 2, r * 2);
    // Ground
    ctx.fillStyle = "#4a7a32";
    ctx.fillRect(-r, 0, r * 2, r * 2);

    // Horizon line
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();

    // Pitch ladder
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.font = "9px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let deg = -60; deg <= 60; deg += 10) {
      if (deg === 0) continue;
      const y = (-deg * Math.PI) / 180 * (r / 1.2);
      const w = deg % 20 === 0 ? 18 : 10;
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      if (deg % 20 === 0) {
        ctx.fillText(`${Math.abs(deg)}`, w + 3, y + 3);
      }
    }

    ctx.restore();

    // Yaw marks (fixed)
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    for (let deg = 0; deg < 360; deg += 30) {
      const a = ((deg - yaw * 180 / Math.PI) - 90) * Math.PI / 180;
      const x1 = cx + Math.cos(a) * (r - 8);
      const y1 = cy + Math.sin(a) * (r - 8);
      const x2 = cx + Math.cos(a) * (r - 2);
      const y2 = cy + Math.sin(a) * (r - 2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Aircraft symbol
    ctx.strokeStyle = "#ffcc00";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    // N marker
    ctx.fillStyle = "#ff4444";
    ctx.font = "bold 11px sans-serif";
    const nAngle = (-yaw - Math.PI / 2);
    ctx.fillText("N", cx + Math.cos(nAngle) * (r - 14) - 4, cy + Math.sin(nAngle) * (r - 14) + 4);
  }, [pitch, yaw, roll, size]);

  return <canvas ref={canvasRef} className="navball" style={{ width: size, height: size }} />;
}
