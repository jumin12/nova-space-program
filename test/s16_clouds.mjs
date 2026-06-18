export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  await shot('cl-on');
  await evalJs(() => { GAME.screens.sc.view.clouds.visible = false; });
  await sleep(500);
  await shot('cl-off');
};
