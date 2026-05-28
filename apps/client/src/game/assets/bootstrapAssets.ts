import type { BootProgressCallback, CelestialAssetBundle } from "./types.js";
import { generateCloudMap, generateKerbinMaps, generateMunMap } from "./planetProcgen.js";
import {
  clearCelestialAssetBundle,
  getCelestialAssetBundle,
  hasCelestialAssetBundle,
  setCelestialAssetBundle,
} from "./assetCache.js";

let loadPromise: Promise<CelestialAssetBundle> | null = null;

function lerpProgress(base: number, span: number, t: number): number {
  return base + span * Math.max(0, Math.min(1, t));
}

export async function bootstrapGameAssets(report: BootProgressCallback): Promise<CelestialAssetBundle> {
  if (hasCelestialAssetBundle()) return getCelestialAssetBundle();
  if (loadPromise) return loadPromise;

  loadPromise = loadAssets(report);
  return loadPromise;
}

async function loadAssets(report: BootProgressCallback): Promise<CelestialAssetBundle> {
  report("Initializing renderer", 0.02);
  await new Promise((r) => setTimeout(r, 0));

  report("Seeding planetary noise", 0.06);

  const planet = await generateKerbinMaps((sub, t) => {
    if (sub.startsWith("Carving")) {
      report("Generating Kerbin terrain — continents", lerpProgress(0.08, 0.42, t));
    } else if (sub.startsWith("Painting")) {
      report("Generating Kerbin terrain — oceans & biomes", lerpProgress(0.5, 0.22, t));
    } else {
      report("Generating Kerbin terrain — surface relief", lerpProgress(0.72, 0.14, t));
    }
  });

  report("Scattering cloud decks", 0.88);
  const cloudMap = await generateCloudMap();

  report("Surveying Mun", 0.94);
  const munMap = await generateMunMap();

  report("Preparing launch facilities", 0.98);

  const bundle: CelestialAssetBundle = {
    planetMap: planet.color,
    planetNormal: planet.normal,
    planetRoughness: planet.roughness,
    cloudMap,
    munMap,
  };

  setCelestialAssetBundle(bundle);
  report("Ready", 1);
  return bundle;
}

export function resetBootstrapForRetry() {
  loadPromise = null;
  clearCelestialAssetBundle();
}
