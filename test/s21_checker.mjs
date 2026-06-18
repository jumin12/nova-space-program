export default async ({ page, sleep, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const report = await evalJs(() => {
    const sc = GAME.screens.sc, v = sc.view, cam = sc.cam;
    const ray = new THREE.Raycaster();
    const meshes = [];
    v.terra.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    const ctr = v.group.position;
    const rows = [];
    /* the checkerboard band: y ~0.33-0.42 of screen */
    for (let py = 0.3; py <= 0.44; py += 0.035) {
      for (let px = 0.15; px <= 0.85; px += 0.175) {
        ray.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - py * 2), cam);
        const all = ray.intersectObjects(meshes, false).slice(0, 3).map(h => {
          const n = h.object.userData.node;
          return (n.ocean ? 'O' : 'T') + n.level + ' d' + Math.round(h.distance / 1000) + 'k a' + Math.round(h.point.distanceTo(ctr) - v.body.R);
        });
        rows.push(`(${px.toFixed(2)},${py.toFixed(2)}) ` + (all.join(' | ') || 'sky'));
      }
    }
    return rows;
  });
  for (const r of report) log(r);
};
