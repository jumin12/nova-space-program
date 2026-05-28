import * as THREE from "three";

/** KSP-style open integration bay — placed on KSC at VAB coordinates. */
export function buildVabSite(): THREE.Group {
  const site = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 56),
    new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.88, metalness: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  site.add(floor);

  const doorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(52, 18, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x9098a4, roughness: 0.7, metalness: 0.35 }),
  );
  doorFrame.position.set(0, 9, 28);
  site.add(doorFrame);

  const grid = new THREE.GridHelper(48, 48, 0x5a7080, 0x3a4550);
  grid.position.y = 0.04;
  site.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.82, metalness: 0.15 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(48, 22, 1.2), wallMat);
  back.position.set(0, 11, -26);
  back.name = "vab-wall-back";
  back.receiveShadow = true;
  site.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 52), wallMat);
  left.position.set(-24, 11, 0);
  site.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 52), wallMat);
  right.position.set(24, 11, 0);
  site.add(right);

  const crane = new THREE.Mesh(
    new THREE.BoxGeometry(36, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xffcc44, metalness: 0.5, roughness: 0.45 }),
  );
  crane.position.set(0, 20, -8);
  site.add(crane);

  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.8, 1.2, 20),
    new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.7, metalness: 0.45 }),
  );
  stand.position.y = 0.6;
  stand.name = "vab-stand";
  stand.receiveShadow = true;
  site.add(stand);

  const light = new THREE.PointLight(0xfff8ee, 120, 90);
  light.position.set(0, 24, 8);
  light.castShadow = true;
  site.add(light);

  site.add(new THREE.AmbientLight(0x8899aa, 0.35));

  return site;
}

export const VAB_ROCKET_Y = 1.2;
