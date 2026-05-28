import * as THREE from "three";

/**
 * Small launch apron at LC-1 only (design: pad detail mesh + procedural planet horizon).
 * Kept minimal to avoid z-fighting with the Kerbin sphere.
 */
export function buildSurfaceTerrain(): THREE.Group {
  const group = new THREE.Group();

  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x4a4e48,
    roughness: 0.94,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const apron = new THREE.Mesh(new THREE.CircleGeometry(140, 64), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.35;
  apron.renderOrder = 2;
  apron.receiveShadow = true;
  apron.name = "pad-apron";
  group.add(apron);

  const grassRing = new THREE.Mesh(
    new THREE.RingGeometry(140, 320, 64),
    new THREE.MeshStandardMaterial({
      color: 0x4a8a48,
      roughness: 0.98,
      metalness: 0,
    }),
  );

  const coastHint = new THREE.Mesh(
    new THREE.RingGeometry(320, 520, 48),
    new THREE.MeshStandardMaterial({
      color: 0x3a6a88,
      roughness: 0.92,
      metalness: 0,
      transparent: true,
      opacity: 0.35,
    }),
  );
  coastHint.rotation.x = -Math.PI / 2;
  coastHint.position.y = 0.005;
  coastHint.name = "pad-coast";
  group.add(coastHint);
  grassRing.rotation.x = -Math.PI / 2;
  grassRing.position.y = 0.28;
  grassRing.renderOrder = 2;
  grassRing.receiveShadow = true;
  grassRing.name = "pad-grass-ring";
  group.add(grassRing);

  return group;
}
