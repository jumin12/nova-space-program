export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(9000);
  await evalJs(() => { const sc = GAME.screens.sc; sc.auto = false; sc.scene.fog = null; });
  await sleep(2000);
  await shot('nofog-default');
  await evalJs(() => { const sc = GAME.screens.sc; sc.camPitch = 0.18; sc.camDist = 800; });
  await sleep(6000);
  await shot('nofog-graze');
  await evalJs(() => { const sc = GAME.screens.sc; sc.camPitch = 1.45; sc.camDist = 25000; });
  await sleep(8000);
  await shot('nofog-down');
};
