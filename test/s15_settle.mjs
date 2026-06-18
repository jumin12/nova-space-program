export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(3000);
  await shot('settle-0s');
  await sleep(15000);
  await shot('settle-15s');
  await sleep(15000);
  const q = await evalJs(() => GAME.screens.sc.view.buildQueue.length);
  console.log('pending after 30s:', q);
  await shot('settle-30s');
};
