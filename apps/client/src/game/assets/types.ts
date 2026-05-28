import type * as THREE from "three";

export type BootProgressCallback = (stage: string, progress: number) => void;

export type CelestialAssetBundle = {
  planetMap: THREE.CanvasTexture;
  planetNormal: THREE.CanvasTexture;
  planetRoughness: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
  munMap: THREE.CanvasTexture;
};
