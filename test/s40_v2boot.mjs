export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(5000);
  await shot('v2-menu');
  await page.click('#btn-sandbox');
  await sleep(9000);
  await shot('v2-sc');
  await evalJs(() => GAME.go('track'));
  await sleep(5000);
  await shot('v2-tracking');
  await evalJs(() => { MAPVIEW.focus = 'gaia'; MAPVIEW.camDist = CEL.GAIA.R * 3.2; });
  await sleep(2500);
  await shot('v2-tracking-gaia');
  await evalJs(() => { MAPVIEW.focus = 'goliath'; MAPVIEW.camDist = CEL.B.goliath.R * 5; });
  await sleep(2500);
  await shot('v2-tracking-goliath');
};
