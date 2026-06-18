export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(4000);
  await evalJs(() => {
    GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] });
  });
  await sleep(4000);
  await evalJs(() => {
    const F = window.__FLIGHT;
    const R = F.body.R, mu = F.body.mu, r = R + 200000;
    F.r.set(r, 0, 0);
    F.v.set(0, 0, -Math.sqrt(mu / r));
    F.launched = true; F.landed = false;
  });
  await sleep(3000);
  await page.mouse.move(750, 300);
  await page.mouse.down();
  await page.mouse.move(750, 120, { steps: 10 });
  await page.mouse.up();
  await sleep(2000);
  await shot('iso-base');
  const layers = ['band', 'nebulae', 'aurora', 'puffs'];
  for (const l of layers) {
    await evalJs((lx) => {
      const F = window.__FLIGHT;
      window.__r = [];
      const hide = o => { window.__r.push(o); o.visible = false; };
      if (lx === 'band') hide(F.stars.sky);
      if (lx === 'nebulae') for (const n of F.stars.nebulae) hide(n);
      if (lx === 'aurora') for (const id in F.views) { const v = F.views[id]; if (v.aurora) for (const a of v.aurora) hide(a); }
      if (lx === 'puffs') { if (F.puffs) hide(F.puffs.group); }
    }, l);
    await sleep(300);
    await shot('iso-no-' + l);
    await evalJs(() => { for (const o of window.__r) o.visible = true; });
  }
};
