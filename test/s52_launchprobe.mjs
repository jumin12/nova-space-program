export default async ({ page, sleep, shot, evalJs, log }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(4000);
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }));
  await sleep(3000);
  await evalJs(() => window.__FLIGHT.stage());
  for (let i = 0; i < 4; i++) {
    await sleep(1500);
    const st = await evalJs(() => {
      const F = window.__FLIGHT;
      return {
        met: Math.round(F.met * 10) / 10, alt: Math.round(F.alt), launched: F.launched,
        thrust: Math.round(F.thrustNow || 0), lit: [...F.lit].length,
        smokeAlive: F.smoke.filter(s => s.life > 0).length,
        plumesVisible: F.plumes.filter(p => p.cone.visible).length,
        stagesLeft: F.stagesLeft.length,
      };
    });
    log('t+' + (i * 1.5 + 1.5).toFixed(1), JSON.stringify(st));
  }
  await shot('probe-launch');
};
