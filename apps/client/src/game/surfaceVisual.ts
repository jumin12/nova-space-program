import * as THREE from "three";
import type { Quat } from "@orbital/common";
import { getKscSurfaceFrame } from "@orbital/common";

let frameQuat: THREE.Quaternion | null = null;

/** Quaternion mapping KSC local axes (X=east, Y=up, Z=north) into planet-centered space. */
function getFrameQuaternion(): THREE.Quaternion {
  if (!frameQuat) {
    const { up, east, north } = getKscSurfaceFrame();
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(east.x, east.y, east.z),
      new THREE.Vector3(up.x, up.y, up.z),
      new THREE.Vector3(north.x, north.y, north.z),
    );
    frameQuat = new THREE.Quaternion().setFromRotationMatrix(basis);
  }
  return frameQuat;
}

/** Physics/planet quaternion → Three.js mesh (local Y = up). */
export function planetQuatToThree(q: Quat): THREE.Quaternion {
  const qf = getFrameQuaternion();
  const qp = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  return qf.clone().invert().multiply(qp).multiply(qf);
}

export function threeQuatToPlanet(q: THREE.Quaternion): Quat {
  const qf = getFrameQuaternion();
  const ql = qf.clone().multiply(q).multiply(qf.clone().invert());
  return { x: ql.x, y: ql.y, z: ql.z, w: ql.w };
}
