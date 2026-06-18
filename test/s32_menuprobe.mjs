export default async ({ sleep, shot, evalJs, log }) => {
  await sleep(16500);
  await shot('mp-shot');
  const rows = await evalJs(() => {
    const m = GAME.screens.menu, v = m.view, cam = m.cam;
    const ray = new THREE.Raycaster();
    const meshes = [];
    v.terra.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    const out = [];
    for (let py = 0.45; py <= 0.85; py += 0.08) {
      let line = '';
      for (let px = 0.3; px <= 0.75; px += 0.045) {
        ray.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - py * 2), cam);
        const h = ray.intersectObjects(meshes, false)[0];
        if (!h) { line += ' .'; continue; }
        const n = h.object.userData.node;
        line += n.ocean ? ' O' + n.level : ' t' + n.level;
      }
      out.push(line);
    }
    return out;
  });
  for (const r of rows) log(r);
};
