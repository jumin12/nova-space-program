export default async ({ page, sleep, shot, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const report = await evalJs(() => {
    const sc = GAME.screens.sc, v = sc.view, cam = sc.cam;
    const ray = new THREE.Raycaster();
    const meshes = [];
    v.terra.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    /* visible mesh census by level */
    const census = {};
    for (const m of meshes) {
      const n = m.userData.node;
      const key = (n.ocean ? 'O' : 'T') + n.level;
      census[key] = (census[key] || 0) + 1;
    }
    /* probe sky pixels (upper half of screen) */
    const hits = [];
    const ctr = v.group.position;
    for (let py = 0.15; py <= 0.55; py += 0.1) {
      for (let px = 0.1; px <= 0.9; px += 0.2) {
        ray.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - py * 2), cam);
        const h = ray.intersectObjects(meshes, false)[0];
        if (!h) { hits.push(null); continue; }
        const n = h.object.userData.node;
        const skirt = [h.face.a, h.face.b, h.face.c].some(i => i >= 289);
        const alt = h.point.distanceTo(ctr) - v.body.R;
        hits.push({ px: +px.toFixed(1), py: +py.toFixed(1), lvl: n.level, ocean: n.ocean, skirt, d: Math.round(h.distance), alt: Math.round(alt), ctrD: Math.round(v.camBF.distanceTo(n.center) / 1000) });
      }
    }
    return { census, hits: hits.filter(Boolean), camAlt: Math.round(v.camBF.length() - v.body.R) };
  });
  log(JSON.stringify(report, null, 1));
};
