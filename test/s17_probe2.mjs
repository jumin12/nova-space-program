export default async ({ page, sleep, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const out = await evalJs(() => {
    const sc = GAME.screens.sc;
    const ray = new THREE.Raycaster();
    const res = [];
    /* probe a horizontal scanline through the band region */
    for (let nx = -0.8; nx <= 0.8; nx += 0.2) {
      ray.setFromCamera(new THREE.Vector2(nx, 0.55), sc.cam);
      const hits = ray.intersectObjects(sc.scene.children, true).slice(0, 1);
      for (const h of hits) {
        const node = h.object.userData.node;
        const N = 17;
        const skirt = h.face && (h.face.a >= N * N || h.face.b >= N * N || h.face.c >= N * N);
        res.push({
          nx: Math.round(nx * 10) / 10,
          d: Math.round(h.distance),
          lvl: node ? node.level : null,
          ocean: node ? !!node.ocean : null,
          skirt: !!skirt,
          mat: h.object.material.type,
        });
      }
    }
    return JSON.stringify(res);
  });
  console.log('SCANLINE:', out);
};
