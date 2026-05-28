import type { PerspectiveCamera, WebGLRenderer } from "three";
import * as THREE from "three";

/** Cap DPR for performance while keeping edges smooth on HiDPI displays. */
export function targetPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2.5);
}

export function configureRenderer(renderer: WebGLRenderer): void {
  renderer.setPixelRatio(targetPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}

export function resizeRenderer(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): void {
  renderer.setPixelRatio(targetPixelRatio());
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}
