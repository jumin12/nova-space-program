import * as THREE from "three";
import { KSC_SITE } from "@orbital/common";

const PLANET_W = 4096;
const PLANET_H = 2048;
const ROWS_PER_CHUNK = 32;

/** Soft blur RGBA image data to remove procedural sparkle on the globe. */
function blurImageData(data: Uint8ClampedArray, w: number, h: number, passes = 2): void {
  const tmp = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const y = Math.min(h - 1, Math.max(0, py + oy));
          for (let ox = -1; ox <= 1; ox++) {
            const x = Math.min(w - 1, Math.max(0, px + ox));
            const i = (y * w + x) * 4;
            r += data[i]!;
            g += data[i + 1]!;
            b += data[i + 2]!;
            a += data[i + 3]!;
            n++;
          }
        }
        const o = (py * w + px) * 4;
        tmp[o] = r / n;
        tmp[o + 1] = g / n;
        tmp[o + 2] = b / n;
        tmp[o + 3] = a / n;
      }
    }
    data.set(tmp);
  }
}

function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function smooth3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = c000 * (1 - ux) + c100 * ux;
  const x10 = c010 * (1 - ux) + c110 * ux;
  const x01 = c001 * (1 - ux) + c101 * ux;
  const x11 = c011 * (1 - ux) + c111 * ux;
  const y0 = x00 * (1 - uy) + x10 * uy;
  const y1 = x01 * (1 - uy) + x11 * uy;
  return y0 * (1 - uz) + y1 * uz;
}

function fbm3(x: number, y: number, z: number, octaves = 6): number {
  let sum = 0;
  let amp = 0.52;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += smooth3(x * freq, y * freq, z * freq) * amp;
    freq *= 2.05;
    amp *= 0.48;
  }
  return sum;
}

function ridged3(x: number, y: number, z: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    const n = smooth3(x * freq, y * freq, z * freq);
    const r = 1 - Math.abs(n * 2 - 1);
    sum += r * amp;
    freq *= 2.1;
    amp *= 0.5;
  }
  return sum;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 48 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function dirFromUv(u: number, v: number) {
  const lat = (0.5 - v) * Math.PI;
  const lon = (u - 0.5) * Math.PI * 2;
  const cosLat = Math.cos(lat);
  return {
    x: cosLat * Math.cos(lon),
    y: Math.sin(lat),
    z: cosLat * Math.sin(lon),
    lat,
    lon,
  };
}

export type KerbinSample = {
  ice: number;
  isLand: boolean;
  coast: number;
  height: number;
  land: number;
  lat: number;
  lon: number;
  detail: number;
  mountains: number;
  biome: "ice" | "ocean" | "beach" | "desert" | "grass" | "forest" | "mountain" | "ksc";
};

export function sampleKerbin(dir: { x: number; y: number; z: number; lat: number; lon: number }): KerbinSample {
  const { x, y, z, lat, lon } = dir;
  const absLat = Math.abs(lat);
  const ice = Math.pow(Math.min(1, absLat / 0.95), 3.8);

  const warp = fbm3(x * 1.2 + 4.2, y * 1.2, z * 1.2 + 2.8, 5);
  const wx = x + (warp - 0.5) * 0.62;
  const wy = y + (warp - 0.5) * 0.28;
  const wz = z + (warp - 0.5) * 0.62;

  const macro = fbm3(wx * 0.95 + 2.4, wy * 0.95, wz * 0.95, 7);
  const continents = fbm3(wx * 1.35 + 6.1, wy * 1.35, wz * 1.35, 6);
  const detail = fbm3(wx * 5.2, wy * 5.2, wz * 5.2, 5);
  const mountains = ridged3(wx * 2.8 + 11, wy * 2.8, wz * 2.8 + 5, 5);
  const micro = fbm3(wx * 12, wy * 12, wz * 12, 3);

  const dLon = lon - KSC_SITE.lonRad;
  const dLat = lat - KSC_SITE.latRad;
  const distKsc = Math.hypot(dLon * 2.1, dLat * 2.6);

  const easternSea =
    lon > 0.04 && lon < 0.78 && absLat < 0.45
      ? 1 - Math.exp(-((lon - 0.32) ** 2) * 5.5 - lat * lat * 10)
      : 0;
  const kscPeninsula = Math.exp(-distKsc * distKsc * 14) * (1 - ice * 0.85);

  let land = macro * 0.45 + continents * 0.42 + detail * 0.12 - 0.46;
  land += 0.08 * kscPeninsula;
  land -= 0.68 * easternSea;
  land -= ice * 0.72;

  const poleBlend = 1 - Math.pow(Math.min(1, absLat / (Math.PI * 0.5)), 3.2);
  land = land * poleBlend + (1 - poleBlend) * 0.15;

  const isLand = land > 0.38 && ice < 0.58;
  const coast = isLand ? Math.min(1, (land - 0.38) * 5) : Math.min(1, (0.38 - land) * 4);

  const height = isLand
    ? 0.1 + mountains * 0.58 + detail * 0.32 + micro * 0.12
    : -0.1 - (0.38 - land) * 0.65;

  let biome: KerbinSample["biome"] = "ocean";
  if (ice > 0.5) biome = "ice";
  else if (!isLand) biome = coast > 0.25 ? "beach" : "ocean";
  else if (distKsc < 0.08 && isLand) biome = "grass";
  else if (height > 0.55) biome = "mountain";
  else if (absLat > 0.52 && detail < 0.42) biome = "desert";
  else if (detail + micro > 0.92) biome = "forest";
  else biome = "grass";

  return { ice, isLand, coast, height, land, lat, lon, detail, mountains, biome };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** KSP Kerbin palette — saturated oceans, lush continents, white caps. */
function colorKerbin(s: KerbinSample): [number, number, number] {
  const { ice, isLand, coast, height, biome, mountains } = s;

  if (ice > 0.42) {
    const t = clamp01((ice - 0.42) / 0.58);
    return [lerp(195, 248, t), lerp(212, 252, t), lerp(225, 255, t)];
  }

  if (!isLand) {
    const depth = clamp01(0.12 + (-height) * 1.3);
    const shallow = coast * 0.6;
    if (biome === "beach") {
      return [lerp(88, 128, shallow), lerp(142, 178, shallow), lerp(128, 162, shallow)];
    }
    return [
      lerp(14, 38, depth) + shallow * 12,
      lerp(48, 98, depth) + shallow * 42,
      lerp(98, 168, depth) + shallow * 38,
    ];
  }

  if (coast < 0.18) return [218, 202, 148];

  switch (biome) {
    case "mountain":
      return [118 + mountains * 28, 108 + mountains * 22, 92];
    case "desert":
      return [188, 158, 108];
    case "forest":
      return [38, 118, 48];
    case "grass":
      return [72, 148, 68];
    default:
      return height > 0.48 ? [112, 122, 98] : [82, 138, 72];
  }
}

export type PlanetMapsResult = {
  color: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
};

export async function generateKerbinMaps(
  onProgress: (sub: string, fraction: number) => void,
): Promise<PlanetMapsResult> {
  const w = PLANET_W;
  const h = PLANET_H;
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = w;
  colorCanvas.height = h;
  const colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true })!;
  const colorImg = colorCtx.createImageData(w, h);

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = w;
  roughCanvas.height = h;
  const roughCtx = roughCanvas.getContext("2d")!;
  const roughImg = roughCtx.createImageData(w, h);

  onProgress("Sculpting Kerbin continents", 0);

  for (let py = 0; py < h; py++) {
    const v = py / h;
    for (let px = 0; px < w; px++) {
      const u = px / w;
      const sample = sampleKerbin(dirFromUv(u, v));
      const [r, g, b] = colorKerbin(sample);
      const i = (py * w + px) * 4;
      colorImg.data[i] = r;
      colorImg.data[i + 1] = g;
      colorImg.data[i + 2] = b;
      colorImg.data[i + 3] = 255;

      let rough = 195;
      if (!sample.isLand) rough = 32 + sample.coast * 48;
      else if (sample.biome === "mountain") rough = 248;
      else if (sample.biome === "ocean" || sample.biome === "beach") rough = 40;
      else rough = 175;
      roughImg.data[i] = rough;
      roughImg.data[i + 1] = rough;
      roughImg.data[i + 2] = rough;
      roughImg.data[i + 3] = 255;
    }

    if (py % ROWS_PER_CHUNK === 0 || py === h - 1) {
      onProgress("Painting Kerbin biomes", py / h);
      await yieldToMain();
    }
  }

  for (let py = 0; py < h; py++) {
    const i0 = (py * w) * 4;
    const i1 = (py * w + (w - 1)) * 4;
    for (let c = 0; c < 4; c++) {
      colorImg.data[i1 + c] = colorImg.data[i0 + c];
      roughImg.data[i1 + c] = roughImg.data[i0 + c];
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  onProgress("Carving surface relief", 0.9);
  await yieldToMain();

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = w;
  normalCanvas.height = h;
  const normalCtx = normalCanvas.getContext("2d")!;
  const normalImg = normalCtx.createImageData(w, h);
  const eps = 3.5 / w;
  for (let py = 0; py < h; py++) {
    const v = py / h;
    for (let px = 0; px < w; px++) {
      const u = px / w;
      const hC = sampleKerbin(dirFromUv(u, v)).height;
      const hR = sampleKerbin(dirFromUv(u + eps, v)).height;
      const hU = sampleKerbin(dirFromUv(u, v - eps)).height;
      const dx = (hR - hC) * 2.2;
      const dy = (hU - hC) * 2.2;
      let nx = -dx;
      let ny = 1;
      let nz = -dy;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (py * w + px) * 4;
      normalImg.data[i] = Math.floor(nx * 127 + 128);
      normalImg.data[i + 1] = Math.floor(ny * 127 + 128);
      normalImg.data[i + 2] = Math.floor(nz * 127 + 128);
      normalImg.data[i + 3] = 255;
    }
    if (py % 64 === 0) await yieldToMain();
  }
  blurImageData(normalImg.data, w, h, 2);
  blurImageData(roughImg.data, w, h, 1);
  normalCtx.putImageData(normalImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const makeTex = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    color: makeTex(colorCanvas, true),
    normal: makeTex(normalCanvas, false),
    roughness: makeTex(roughCanvas, false),
  };
}

export async function generateCloudMap(): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;

  for (let py = 0; py < h; py++) {
    const v = py / h;
    for (let px = 0; px < w; px++) {
      const u = px / w;
      const dir = dirFromUv(u, v);
      const n =
        fbm3(dir.x * 2.8 + 2, dir.y * 2.8, dir.z * 2.8, 5) * 0.72 +
        fbm3(dir.x * 5.5, dir.y * 5.5, dir.z * 5.5, 3) * 0.28;
      const a = Math.floor(clamp01((n - 0.46) * 1.75) * 200);
      const i = (py * w + px) * 4;
      const bright = 235 + Math.floor(n * 18);
      img.data[i] = bright;
      img.data[i + 1] = bright;
      img.data[i + 2] = bright + 8;
      img.data[i + 3] = a;
    }
    if (py % 64 === 0) await yieldToMain();
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export async function generateMunMap(): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#5a5a64";
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 1200; i++) {
    const u = Math.random();
    const v = Math.random();
    const dir = dirFromUv(u, v);
    const n = fbm3(dir.x * 8, dir.y * 8, dir.z * 8, 3);
    if (n < 0.4) continue;
    const px = u * w;
    const py = v * h;
    const r = 1 + n * 20;
    const g = 36 + Math.floor(n * 38);
    ctx.fillStyle = `rgba(${g},${g},${g + 10},0.55)`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  await yieldToMain();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
