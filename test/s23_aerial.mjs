export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(9000);
  /* straight down from 25km */
  await evalJs(() => { const sc = GAME.screens.sc; sc.auto = false; sc.camPitch = 1.45; sc.camDist = 25000; });
  await sleep(9000);
  await shot('aerial-down');
  /* 45-degree from 4km */
  await evalJs(() => { const sc = GAME.screens.sc; sc.camPitch = 0.7; sc.camDist = 4000; });
  await sleep(7000);
  await shot('aerial-45');
  /* low grazing from 800m — worst case for slot artifacts */
  await evalJs(() => { const sc = GAME.screens.sc; sc.camPitch = 0.18; sc.camDist = 800; });
  await sleep(7000);
  await shot('aerial-graze');
};
