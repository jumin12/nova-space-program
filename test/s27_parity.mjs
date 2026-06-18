export default async ({ page, sleep, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const rows = await evalJs(() => {
    const v = GAME.screens.sc.view;
    const stats = {};
    v.terra.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const n = o.userData.node;
      if (n.ocean) return;
      const pos = o.geometry.getAttribute('position');
      const ia = o.geometry.index.array;
      /* triangle 0 of the main grid */
      const a = ia[0], c = ia[1], b = ia[2];
      const A = new THREE.Vector3().fromBufferAttribute(pos, a);
      const C = new THREE.Vector3().fromBufferAttribute(pos, c);
      const B = new THREE.Vector3().fromBufferAttribute(pos, b);
      const nrm = new THREE.Vector3().subVectors(C, A).cross(new THREE.Vector3().subVectors(B, A));
      /* outward = direction of patch center (mesh.position = node.center, vertices relative) */
      const outward = n.center.clone().normalize();
      const facing = nrm.dot(outward) > 0 ? 'OUT' : 'IN';
      const key = `f${n.face} ${facing}`;
      stats[key] = (stats[key] || 0) + 1;
    });
    return Object.entries(stats).sort().map(([k, v2]) => k + ': ' + v2);
  });
  for (const r of rows) log(r);
};
