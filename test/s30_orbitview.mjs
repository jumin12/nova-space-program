export default async ({ page, sleep, shot, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(5000);
  await evalJs(() => {
    GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] || Object.values(GAME.save.crafts)[0] });
  });
  await sleep(4000);
  await shot('ov-pad');
  await evalJs(() => {
    const F = window.__FLIGHT;
    const R = F.body.R, mu = F.body.mu, r = R + 200000;
    F.r.set(r, 0, 0);
    F.v.set(0, 0, -Math.sqrt(mu / r));
    F.launched = true; F.landed = false;
  });
  await sleep(3000);
  /* drag to look down at the planet */
  await page.mouse.move(750, 300);
  await page.mouse.down();
  await page.mouse.move(750, 80, { steps: 12 });
  await page.mouse.up();
  await sleep(14000);
  await shot('ov-planet');
};
