export default async ({ page, sleep, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const rows = await evalJs(() => {
    const sc = GAME.screens.sc, v = sc.view, cam = sc.cam;
    const ray = new THREE.Raycaster();
    const meshes = [];
    v.terra.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    const out = [];
    const probe = (label) => {
      for (const px of [0.2, 0.4]) {
        ray.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - 0.38 * 2), cam);
        const h = ray.intersectObjects(meshes, false)[0];
        if (!h) { out.push(`${label} ${px}: sky`); continue; }
        const n = h.object.userData.node;
        out.push(`${label} ${px}: ${n.ocean ? 'O' : 'T'}${n.level} d${(h.distance / 1000).toFixed(1)}k face(${h.face.a},${h.face.b},${h.face.c})`);
      }
    };
    probe('front');
    const s0 = v.mat.side, s1 = v.oceanMat.side;
    v.mat.side = THREE.DoubleSide; v.oceanMat.side = THREE.DoubleSide;
    probe('double');
    v.mat.side = s0; v.oceanMat.side = s1;
    return out;
  });
  for (const r of rows) log(r);
};
