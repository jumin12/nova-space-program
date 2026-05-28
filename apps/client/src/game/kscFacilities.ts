import * as THREE from "three";
import { VISUAL } from "@orbital/common";

const KSC = VISUAL.ksc;

function box(w: number, h: number, d: number, color: number | string, metal = 0.2) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: metal }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function padStrip(w: number, d: number) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: 0x4a4e48, roughness: 0.9 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.receiveShadow = true;
  return mesh;
}

function makeFacilityLabel(title: string, subtitle: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 88;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(8, 14, 12, 0.9)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#6fcf6f";
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = "#8fdf8f";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText(title, 16, 36);
  ctx.fillStyle = "#a8b8a8";
  ctx.font = "17px system-ui, sans-serif";
  ctx.fillText(subtitle, 16, 62);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  );
  sprite.scale.set(36, 9, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function roadStrip(x1: number, z1: number, x2: number, z2: number, width = 14) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(len, width),
    new THREE.MeshStandardMaterial({ color: 0x4a4e48, roughness: 0.92 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -Math.atan2(dz, dx);
  mesh.position.set((x1 + x2) * 0.5, 0.03, (z1 + z2) * 0.5);
  mesh.receiveShadow = true;
  return mesh;
}

/** KSC at sea level (0,0,0 = launch pad). Scale is 1 unit = 1 meter. */
export function buildKscFacilities(): THREE.Group {
  const kscGroup = new THREE.Group();

  const hubX = (KSC.vab.x + KSC.pad.x) * 0.5;
  const hubZ = (KSC.vab.z + KSC.pad.z) * 0.5;
  kscGroup.add(roadStrip(KSC.pad.x, KSC.pad.z, hubX, hubZ));
  kscGroup.add(roadStrip(hubX, hubZ, KSC.vab.x, KSC.vab.z));
  kscGroup.add(roadStrip(hubX, hubZ, KSC.admin.x, KSC.admin.z));
  kscGroup.add(roadStrip(hubX, hubZ, KSC.rd.x, KSC.rd.z));
  kscGroup.add(roadStrip(hubX, hubZ, KSC.tracking.x, KSC.tracking.z));
  kscGroup.add(roadStrip(KSC.pad.x, KSC.pad.z, KSC.runway.x, KSC.runway.z));

  const crawler = padStrip(20, 140);
  crawler.position.set((KSC.vab.x + KSC.pad.x) * 0.5, 0, (KSC.vab.z + KSC.pad.z) * 0.5);
  kscGroup.add(crawler);

  const vab = new THREE.Group();
  vab.name = "vab-exterior";
  vab.position.set(KSC.vab.x, 0, KSC.vab.z);
  vab.add(padStrip(100, 85));
  vab.add(box(94, 62, 72, 0xd8dce4, 0.35));
  const vabDoor = box(34, 44, 2, 0xa8b0bc, 0.5);
  vabDoor.position.set(0, 10, 37);
  vab.add(vabDoor);
  const vabRoof = box(98, 8, 76, 0xb0b8c4, 0.4);
  vabRoof.position.y = 35;
  vab.add(vabRoof);
  const vabSideL = box(4, 50, 60, 0xc0c8d0, 0.3);
  vabSideL.position.set(-48, 25, 0);
  vab.add(vabSideL);
  const vabSideR = vabSideL.clone();
  vabSideR.position.x = 48;
  vab.add(vabSideR);
  const vabLabel = makeFacilityLabel("VAB", "Vehicle Assembly Building");
  vabLabel.position.set(0, 72, 0);
  vab.add(vabLabel);
  kscGroup.add(vab);

  const admin = new THREE.Group();
  admin.position.set(KSC.admin.x, 0, KSC.admin.z);
  admin.add(padStrip(52, 36));
  admin.add(box(44, 18, 28, 0xc8ccd4, 0.25));
  const adminTop = box(20, 8, 14, 0xb0b8c0, 0.2);
  adminTop.position.y = 13;
  admin.add(adminTop);
  const adminLabel = makeFacilityLabel("ADM", "Administration");
  adminLabel.position.set(0, 26, 0);
  admin.add(adminLabel);
  kscGroup.add(admin);

  const rd = new THREE.Group();
  rd.position.set(KSC.rd.x, 0, KSC.rd.z);
  rd.add(padStrip(50, 40));
  rd.add(box(42, 16, 32, 0xb8c0cc, 0.3));
  const rdDome = new THREE.Mesh(
    new THREE.SphereGeometry(14, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({ color: 0xe0e8f0, roughness: 0.4, metalness: 0.35 }),
  );
  rdDome.position.y = 16;
  rd.add(rdDome);
  const rdLabel = makeFacilityLabel("R&D", "Research & Development");
  rdLabel.position.set(0, 36, 0);
  rd.add(rdLabel);
  kscGroup.add(rd);

  const tracking = new THREE.Group();
  tracking.position.set(KSC.tracking.x, 0, KSC.tracking.z);
  tracking.add(padStrip(40, 40));
  const dishBase = box(14, 12, 14, 0x889098, 0.4);
  dishBase.position.y = 6;
  tracking.add(dishBase);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.45),
    new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide }),
  );
  dish.rotation.x = -Math.PI * 0.35;
  dish.position.set(0, 16, 0);
  tracking.add(dish);
  const trkLabel = makeFacilityLabel("TRK", "Tracking Station");
  trkLabel.position.set(0, 36, 0);
  tracking.add(trkLabel);
  kscGroup.add(tracking);

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 240),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.85 }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(KSC.runway.x, 0.05, KSC.runway.z);
  runway.rotation.z = Math.PI / 2;
  runway.receiveShadow = true;
  kscGroup.add(runway);
  const rwyLabel = makeFacilityLabel("RWY", "Runway");
  rwyLabel.position.set(KSC.runway.x, 20, KSC.runway.z);
  kscGroup.add(rwyLabel);

  const padLabel = makeFacilityLabel("LC-1", "Launch Complex 1");
  padLabel.position.set(KSC.pad.x, 78, KSC.pad.z);
  kscGroup.add(padLabel);

  return kscGroup;
}

export function buildLaunchPad(): THREE.Group {
  const padGroup = new THREE.Group();
  padGroup.position.set(KSC.pad.x, 0, KSC.pad.z);

  const padMat = new THREE.MeshStandardMaterial({ color: 0x606468, roughness: 0.82, metalness: 0.4 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(11, 13, 1.4, 40), padMat);
  pad.position.y = 0.7;
  pad.castShadow = true;
  pad.receiveShadow = true;
  padGroup.add(pad);

  const flame = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 4, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 }),
  );
  flame.position.y = 0.25;
  padGroup.add(flame);

  const towerMat = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.55, roughness: 0.5 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 62, 2.2), towerMat);
  tower.position.set(-17, 31, 0);
  tower.castShadow = true;
  padGroup.add(tower);

  for (let y = 5; y <= 54; y += 7) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(15, 0.6, 0.6), towerMat);
    arm.position.set(-8.5, y, 0);
    padGroup.add(arm);
  }

  for (let i = 0; i < 4; i++) {
    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 9, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x888c90, metalness: 0.6, roughness: 0.45 }),
    );
    const angle = (i / 4) * Math.PI * 2;
    clamp.position.set(Math.cos(angle) * 9, 4.5, Math.sin(angle) * 9);
    padGroup.add(clamp);
  }

  const bunker = box(8, 4, 6, 0x5a5e62, 0.35);
  bunker.position.set(22, 2, 12);
  padGroup.add(bunker);

  return padGroup;
}
