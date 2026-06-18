export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4000);
  await evalJs(() => { window.PG_NOSKIRT = 1; });
  await page.click('#btn-sandbox');
  await sleep(5000);
  await shot('f1-noskirts');
  await evalJs(() => { const sc = GAME.screens.sc; sc.camDist = 1500; sc.camPitch = 0.25; });
  await sleep(1000);
  await shot('f2-noskirts-wide');
  await evalJs(() => { const sc = GAME.screens.sc; sc.view.terra.visible = false; });
  await sleep(600);
  await shot('f3-noterra');
};
