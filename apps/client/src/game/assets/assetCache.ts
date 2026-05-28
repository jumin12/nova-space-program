import type { CelestialAssetBundle } from "./types.js";

/** Bump when planet/atmosphere generation changes to force reload. */
export const CELESTIAL_ASSET_VERSION = 12;

let bundle: CelestialAssetBundle | null = null;
let loadedVersion = 0;

export function setCelestialAssetBundle(next: CelestialAssetBundle) {
  bundle = next;
  loadedVersion = CELESTIAL_ASSET_VERSION;
}

export function clearCelestialAssetBundle() {
  bundle = null;
  loadedVersion = 0;
}

export function isCelestialAssetBundleCurrent(): boolean {
  return bundle !== null && loadedVersion === CELESTIAL_ASSET_VERSION;
}

export function getCelestialAssetBundle(): CelestialAssetBundle {
  if (!isCelestialAssetBundleCurrent()) throw new Error("Celestial assets not loaded yet");
  return bundle!;
}

export function hasCelestialAssetBundle(): boolean {
  return isCelestialAssetBundleCurrent();
}
