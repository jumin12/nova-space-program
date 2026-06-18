/* night side diagnostics: globe presence, terrain visibility, city lights */
export default async ({ page, sleep, shot, evalJs, log }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(4000);
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }));
  await sleep(3000);
  await evalJs(() => {
    const F = window.__FLIGHT;
    const R = F.body.R, mu = F.body.mu, r = R + 300000;
    F.r.set(-r, 0, 0);
    F.v.set(0, 0, Math.sqrt(mu / r));
    F.launched = true; F.landed = false;
    F.camPitch = -0.7; F.camDist = 60;
  });
  await sleep(8000);
  const diag = await evalJs(() => {
    const F = window.__FLIGHT;
    const v = F.views.gaia;
    let visNodes = 0, hidNodes = 0;
    v.terra.traverse(o => { if (o.isMesh) (o.visible ? visNodes++ : hidNodes++); });
    /* raycast from camera through screen center + low-center */
    const ray = new THREE.Raycaster();
    const hits = {};
    for (const [label, nx, ny] of [['center', 0, 0], ['low', 0, -0.6]]) {
      ray.setFromCamera(new THREE.Vector2(nx, ny), F.cam);
      ray.far = 1e9;
      const h = ray.intersectObjects([v.terra, v.globe].filter(Boolean), true)[0];
      hits[label] = h ? (h.object === v.globe ? 'globe@' + Math.round(h.distance / 1000) + 'km' : 'terrain@' + Math.round(h.distance / 1000) + 'km') : 'NOTHING';
    }
    const sunDir = ORB.bodyAbsPos(F.body, GAME.ut, new THREE.Vector3()).add(F.r).negate().normalize();
    const up = F.r.clone().normalize();
    return {
      globe: !!v.globe, globeInScene: !!(v.globe && v.globe.parent),
      visNodes, hidNodes, camAlt: Math.round(v.camAlt || -1),
      hits, sunDot: Math.round(sunDir.dot(up) * 100) / 100,
      sig: F.signal,
    };
  });
  log('NIGHT DIAG:', JSON.stringify(diag));
  await shot('night-diag');
};
