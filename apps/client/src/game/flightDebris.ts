import * as THREE from "three";
import type { DebrisSnapshot } from "@orbital/common";
import { physicsToSurfaceVisual } from "@orbital/common";
import { buildRocketMesh } from "./rocketMesh.js";
import { planetQuatToThree } from "./surfaceVisual.js";

type DebrisVisual = {
  group: THREE.Group;
  targetPos: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  fresh: boolean;
};

export type DebrisAnchor = {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
};

export class FlightDebrisVisuals {
  readonly root = new THREE.Group();
  private entries = new Map<string, DebrisVisual>();

  sync(debris: DebrisSnapshot[], anchor?: DebrisAnchor) {
    const ids = new Set(debris.map((d) => d.id));

    for (const [id, entry] of this.entries) {
      if (ids.has(id)) continue;
      this.root.remove(entry.group);
      this.entries.delete(id);
    }

    for (const d of debris) {
      let entry = this.entries.get(d.id);
      if (!entry) {
        const { group } = buildRocketMesh(d.craft);
        this.root.add(group);
        entry = {
          group,
          targetPos: new THREE.Vector3(),
          targetQuat: new THREE.Quaternion(),
          fresh: true,
        };
        this.entries.set(d.id, entry);
      }

      const local = physicsToSurfaceVisual(d.position.x, d.position.y, d.position.z);
      entry.targetPos.set(local.x, local.y, local.z);
      entry.targetQuat.copy(planetQuatToThree(d.rotation));

      if (entry.fresh && anchor) {
        entry.group.position.copy(anchor.pos);
        entry.group.quaternion.copy(anchor.quat);
        entry.fresh = false;
      }
    }
  }

  update(dt: number) {
    const smooth = 1 - Math.exp(-dt * 26);
    for (const entry of this.entries.values()) {
      entry.group.position.lerp(entry.targetPos, smooth);
      entry.group.quaternion.slerp(entry.targetQuat, smooth);
    }
  }

  clear() {
    for (const entry of this.entries.values()) {
      this.root.remove(entry.group);
    }
    this.entries.clear();
  }
}
