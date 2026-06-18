export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(4000);
  const info = await evalJs(() => {
    const sc = GAME.screens.sc;
    sc.scene.fog = null;
    if (sc.view.atmo) sc.view.atmo.visible = false;
    if (sc.view.clouds) sc.view.clouds.visible = false;
    sc.stars.points.visible = false; sc.stars.sky.visible = false;
    const camToCenter = sc.cam.position.distanceTo(sc.view.group.position);
    return JSON.stringify({ camToCenter, R: sc.view.body.R, groupPos: sc.view.group.position.toArray().map(x => Math.round(x)) });
  });
  console.log('INFO:', info);
  await sleep(500);
  await shot('e1-nofog');
  await evalJs(() => { GAME.screens.sc.camDist = 6000; GAME.screens.sc.camPitch = 0.5; });
  await sleep(800);
  await shot('e2-zoomout');
  await evalJs(() => { GAME.screens.sc.camDist = 300000; });
  await sleep(1500);
  await shot('e3-space');
};
