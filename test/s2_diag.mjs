/* diagnose sky bands: toggle layers one at a time */
export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(4000);
  await shot('d0-baseline');
  await evalJs(() => { const v = GAME.screens.sc.view; if (v.clouds) v.clouds.visible = false; });
  await sleep(400);
  await shot('d1-noclouds');
  await evalJs(() => { const v = GAME.screens.sc.view; if (v.atmo) v.atmo.visible = false; });
  await sleep(400);
  await shot('d2-noatmo');
  await evalJs(() => {
    const v = GAME.screens.sc.view;
    v.terra.traverse(o => { if (o.isMesh && o.material === v.oceanMat) o.visible = false; });
  });
  await sleep(400);
  await shot('d3-noocean');
  const counts = await evalJs(() => {
    const v = GAME.screens.sc.view;
    let built = 0, pending = v.buildQueue.length;
    v.terra.traverse(o => { if (o.isMesh) built++; });
    return JSON.stringify({ built, pending });
  });
  console.log('PATCHES:', counts);
};
