export default async ({ page, sleep, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const rows = await evalJs(() => {
    const sc = GAME.screens.sc, v = sc.view, cam = sc.cam;
    const ray = new THREE.Raycaster();
    const meshes = [];
    v.terra.traverse(o => { if (o.isMesh && o.visible && !o.userData.node.ocean) meshes.push(o); });
    const ctr = v.group.position;
    const out = [];
    const s0 = v.mat.side;
    v.mat.side = THREE.DoubleSide;
    for (let px = 0.1; px <= 0.9; px += 0.1) {
      ray.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - 0.38 * 2), cam);
      const h = ray.intersectObjects(meshes, false)[0];
      if (!h) { out.push(px.toFixed(1) + ' sky'); continue; }
      const n = h.object.userData.node;
      /* outward at the actual hit point (scene space) */
      const outward = h.point.clone().sub(ctr).normalize();
      /* face normal is geometry-local; rotate to world */
      const wn = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      const d = wn.dot(outward);
      const rd = wn.dot(ray.ray.direction);
      out.push(`${px.toFixed(1)} T${n.level} d${(h.distance / 1000).toFixed(1)}k tri(${h.face.a},${h.face.b},${h.face.c}) fn·out:${d.toFixed(2)} fn·ray:${rd.toFixed(2)}`);
    }
    v.mat.side = s0;
    return out;
  });
  for (const r of rows) log(r);
};
