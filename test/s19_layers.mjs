export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const layers = ['ocean', 'terra', 'atmo', 'sky', 'points', 'clouds'];
  for (const layer of layers) {
    await evalJs((l => {
      const sc = GAME.screens.sc, v = sc.view;
      window.__restore = [];
      const hide = (o) => { if (o && o.visible !== false) { window.__restore.push(o); o.visible = false; } };
      if (l === 'ocean') v.terra.traverse(o => { if (o.isMesh && o.material === v.oceanMat) hide(o); });
      if (l === 'terra') v.terra.traverse(o => { if (o.isMesh && o.material === v.mat) hide(o); });
      if (l === 'atmo') hide(v.atmo);
      if (l === 'sky') hide(sc.stars.sky);
      if (l === 'points') hide(sc.stars.points);
      if (l === 'clouds') hide(v.clouds);
    }), layer);
    await sleep(400);
    await shot('layer-no-' + layer);
    await evalJs(() => { for (const o of window.__restore) o.visible = true; });
  }
};
