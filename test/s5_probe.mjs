export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(6000);
  const probe = await evalJs(() => {
    const sc = GAME.screens.sc;
    const ray = new THREE.Raycaster();
    const out = [];
    for (const [nx, ny] of [[0, 0.75], [-0.4, 0.6], [0.3, 0.85], [0, -0.5]]) {
      ray.setFromCamera(new THREE.Vector2(nx, ny), sc.cam);
      const hits = ray.intersectObjects(sc.scene.children, true).slice(0, 3).map(h => ({
        ndc: [nx, ny],
        dist: Math.round(h.distance),
        type: h.object.type,
        mat: h.object.material && h.object.material.type,
        ocean: h.object.material === sc.view.oceanMat,
        terr: h.object.material === sc.view.mat,
        level: h.object.userData.node ? h.object.userData.node.level : null,
        oceanNode: h.object.userData.node ? h.object.userData.node.ocean : null,
        face: h.object.userData.node ? h.object.userData.node.face : null,
        pt: h.point.toArray().map(v => Math.round(v)),
      }));
      out.push(hits);
    }
    /* also: camera altitude sanity */
    const camW = sc.cam.position.clone().sub(sc.view.group.position);
    return JSON.stringify({ camAltFromCenter: Math.round(camW.length() - sc.view.body.R), hits: out }, null, 1);
  });
  console.log('PROBE:', probe);
};
