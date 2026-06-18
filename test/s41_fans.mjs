export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(6000);
  await evalJs(() => GAME.go('track'));
  await sleep(3000);
  await evalJs(() => { MAPVIEW.focus = 'gaia'; MAPVIEW.camDist = CEL.GAIA.R * 3.2; });
  await sleep(1500);
  for (const layer of ['sky', 'nebulae', 'belt', 'points']) {
    await evalJs((l) => {
      const M = MAPVIEW;
      window.__restore = [];
      const hide = o => { window.__restore.push(o); o.visible = false; };
      if (l === 'sky') hide(M.stars.sky);
      if (l === 'points') hide(M.stars.points);
      if (l === 'nebulae') for (const n of M.stars.nebulae) hide(n);
      if (l === 'belt') hide(M.belt.points);
    }, layer);
    await sleep(400);
    await shot('fan-no-' + layer);
    await evalJs(() => { for (const o of window.__restore) o.visible = true; });
  }
};
