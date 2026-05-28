import * as THREE from "three";
import { getPart } from "@orbital/common";

export type VabPickResult =
  | { type: "part"; instanceId: string }
  | { type: "attach"; attach: "top" | "bottom" }
  | { type: "none" };

export function pickVab(
  raycaster: THREE.Raycaster,
  rocketRoot: THREE.Object3D,
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
): VabPickResult {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1),
  );
  raycaster.setFromCamera(ndc, camera);

  const attachHits = raycaster.intersectObjects(rocketRoot.children, true).filter((h) => {
    let o: THREE.Object3D | null = h.object;
    while (o) {
      if (o.userData.attachNode) return true;
      o = o.parent;
    }
    return false;
  });
  for (const hit of attachHits) {
    let o: THREE.Object3D | null = hit.object;
    while (o) {
      const n = o.userData.attachNode;
      if (n === "top" || n === "bottom") return { type: "attach", attach: n };
      o = o.parent;
    }
  }

  const hits = raycaster.intersectObjects(rocketRoot.children, true);
  for (const hit of hits) {
    if (hit.object.userData.attachNode) continue;
    let o: THREE.Object3D | null = hit.object;
    while (o) {
      if (o.userData.instanceId) return { type: "part", instanceId: String(o.userData.instanceId) };
      o = o.parent;
    }
  }

  return { type: "none" };
}

/** KSP-style: ghost locked to stack attach point (top by default). */
export function updatePlacementGhost(
  ghost: THREE.Group | null,
  placingPartId: string | null,
  stackHeight: number,
  attach: "top" | "bottom",
) {
  if (!ghost || !placingPartId) return;

  const def = getPart(placingPartId);
  const y =
    attach === "bottom"
      ? def.height * 0.5 + 0.15
      : stackHeight + def.height * 0.5 + 0.2;
  ghost.position.set(0, y, 0);
}

export function defaultAttachForPart(definitionId: string): "top" | "bottom" {
  const def = getPart(definitionId);
  if (def.category === "engine" || def.category === "structural") return "bottom";
  return "top";
}
