import * as THREE from "three";
import { getPart } from "@orbital/common";
import type { CraftDefinition } from "@orbital/common";

export type RocketMeshResult = {
  group: THREE.Group;
  height: number;
  partMeshes: Map<string, THREE.Object3D>;
};

/** craft.parts[0] = top, craft.parts.at(-1) = bottom — build upward from engine pad. */
export function stackBottomToTop(craft: CraftDefinition) {
  return [...craft.parts].reverse();
}

export function buildRocketMesh(craft: CraftDefinition, selectedId?: string | null): RocketMeshResult {
  const group = new THREE.Group();
  const partMeshes = new Map<string, THREE.Object3D>();
  let y = 0;

  for (const part of stackBottomToTop(craft)) {
    const def = getPart(part.definitionId);
    const isEngine = def.category === "engine";
    const selected = part.instanceId === selectedId;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(def.color),
      roughness: isEngine ? 0.35 : 0.62,
      metalness: isEngine ? 0.55 : 0.12,
      emissive: selected ? new THREE.Color(0x224466) : new THREE.Color(0x000000),
      emissiveIntensity: selected ? 0.45 : 0,
    });

    const partGroup = new THREE.Group();
    partGroup.userData.instanceId = part.instanceId;
    partGroup.userData.definitionId = part.definitionId;
    partGroup.userData.stage = part.stage;

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(def.radius, def.radius * 0.96, def.height, 24),
      mat,
    );
    body.castShadow = true;
    body.userData.instanceId = part.instanceId;
    body.position.y = y + def.height * 0.5;
    partGroup.add(body);

    if (def.category === "probe") {
      const window = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius * 0.35, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.2, metalness: 0.6 }),
      );
      window.position.set(0, def.height * 0.15, def.radius * 0.85);
      body.add(window);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(def.radius, def.height * 0.45, 24), mat.clone());
      nose.position.y = def.height * 0.55;
      body.add(nose);
    }

    if (isEngine) {
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(def.radius * 0.55, def.radius * 0.85, def.height * 0.45, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }),
      );
      bell.position.y = -def.height * 0.35;
      body.add(bell);
    }

    if (def.category === "structural") {
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, def.height * 0.9, def.radius * 0.9),
          new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: 0.5, metalness: 0.35 }),
        );
        const angle = (f / 4) * Math.PI * 2;
        fin.position.set(Math.cos(angle) * (def.radius + 0.35), 0, Math.sin(angle) * (def.radius + 0.35));
        fin.rotation.y = -angle;
        body.add(fin);
      }
    }

    if (selected) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(def.radius + 0.15, 0.06, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y + def.height * 0.5;
      partGroup.add(ring);
    }

    group.add(partGroup);
    partMeshes.set(part.instanceId, partGroup);
    y += def.height;
  }

  return { group, height: y, partMeshes };
}

export function computeComOffset(craft: CraftDefinition): number {
  let totalMass = 0;
  let moment = 0;
  let y = 0;
  for (const part of stackBottomToTop(craft)) {
    const def = getPart(part.definitionId);
    const mass = def.mass * 1000;
    const cy = y + def.height * 0.5;
    totalMass += mass;
    moment += mass * cy;
    y += def.height;
  }
  return totalMass > 0 ? moment / totalMass : 0;
}
