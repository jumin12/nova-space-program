export default async ({ page, sleep, shot, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  await shot('ol-default');
  const rows = await evalJs(() => {
    const sc = GAME.screens.sc, v = sc.view, cam = sc.cam;
    const ray = new THREE.Raycaster();
    const meshes = [];
    v.terra.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    const ctr = v.group.position, R = v.body.R;
    const ang = CEL.spinAngle(v.body, GAME.ut);
    const out = [];
    for (let px = 0.1; px <= 0.9; px += 0.1) {
      ray.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - 0.38 * 2), cam);
      const h = ray.intersectObjects(meshes, false)[0];
      if (!h) { out.push(px.toFixed(1) + ' sky'); continue; }
      const n = h.object.userData.node;
      const cell = n.size * 2 / 16;
      const lift = Math.min(cell * cell / (4 * R), 60);
      /* sampler height at the hit direction */
      const p = h.point.clone().sub(ctr);
      const c = Math.cos(-ang), s = Math.sin(-ang);
      const bf = new THREE.Vector3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c).normalize();
      const hs = Math.round(CEL.heightAt(v.body, bf));
      out.push(`${px.toFixed(1)} ${n.ocean ? 'OCEAN' : 'TERRA'} L${n.level} hitAlt:${Math.round(p.length() - R)} lift:${lift.toFixed(1)} sampler:${hs} d:${Math.round(h.distance / 1000)}k`);
    }
    return out;
  });
  for (const r of rows) log(r);
  await evalJs(() => {
    const v = GAME.screens.sc.view;
    v.terra.traverse(o => { if (o.isMesh && o.material === v.oceanMat) o.visible = false; });
  });
  await sleep(300);
  await shot('ol-no-ocean');
};
