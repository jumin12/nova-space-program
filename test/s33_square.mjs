export default async ({ sleep, evalJs, log }) => {
  await sleep(16500);
  const rows = await evalJs(() => {
    const m = GAME.screens.menu, v = m.view, cam = m.cam;
    const ray = new THREE.Raycaster();
    const meshes = [];
    v.terra.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    const ctr = v.group.position, R = v.body.R;
    const out = ['queue:' + v.buildQueue.length];
    for (const [px, py] of [[0.57, 0.61], [0.6, 0.65], [0.45, 0.55]]) {
      ray.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - py * 2), cam);
      const hs = ray.intersectObjects(meshes, false).slice(0, 3).map(h => {
        const n = h.object.userData.node;
        return `${n.ocean ? 'O' : 'T'}${n.level} alt${Math.round(h.point.distanceTo(ctr) - R)} kids:${n.children ? n.children.map(c => (c.mesh ? 'M' : c.building ? 'b' : '-')).join('') : 'none'}`;
      });
      out.push(`(${px},${py}) ` + hs.join(' | '));
    }
    return out;
  });
  for (const r of rows) log(r);
};
