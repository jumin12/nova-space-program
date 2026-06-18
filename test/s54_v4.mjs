/* v4: SC campus, grass/cities scatter, contracts UI, debug menu, tech tree, IVA look */
export default async ({ page, sleep, shot, evalJs, log, state }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(6000);
  await shot('v4-sc');
  /* mission control with tabs */
  await evalJs(() => GAME.go('mc'));
  await sleep(1500);
  await shot('v4-contracts');
  const offers = await evalJs(() => (GAME.save.offers || []).map(o => o.type + ':' + o.name));
  log('offers:', JSON.stringify(offers));
  /* accept the first offer */
  await evalJs(() => {
    const btn = document.querySelector('.c-actions .btn.acc');
    if (btn) btn.click();
  });
  await sleep(600);
  await evalJs(() => document.querySelector('.mc-tab[data-t=active]').click());
  await sleep(500);
  await shot('v4-contracts-active');
  /* tech tree */
  await evalJs(() => GAME.go('rnd'));
  await sleep(1800);
  await shot('v4-techtree');
  /* flight with debug menu + aero vectors */
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }));
  await sleep(3500);
  await evalJs(() => { GAME.toggleDebug(); DBG.aeroVectors = true; DBG.fps = true; });
  await sleep(500);
  await evalJs(() => window.__FLIGHT.stage());
  await sleep(4000);
  await shot('v4-debug-aero');
  /* ground look: grass + birds + city check */
  const counts = await evalJs(() => {
    const F = window.__FLIGHT;
    const sc = F.scatter;
    return {
      grass: sc ? sc.grass.count : -1, trees: sc ? sc.trees.count : -1, trees2: sc ? sc.trees2.count : -1,
      cities: sc ? sc.cities.count : -1, boats: sc ? sc.boats.count : -1,
      birds: F.birds ? F.birds.birds.filter(b => b.sp.visible).length : -1,
      clouds: !!F.views.gaia.clouds && F.views.gaia.clouds.visible !== false,
    };
  });
  log('scatter counts:', JSON.stringify(counts));
  /* IVA first-person look on a crewed pod */
  await evalJs(() => {
    const v = new Vessel('IVA Test');
    v.addPart('comet', { type: 'root' });
    v.autoStage();
    GAME.go('flight', { launch: v.serialize() });
  });
  await sleep(3000);
  await evalJs(() => { window.__FLIGHT.enterIva(); window.__FLIGHT.camYaw = 0.8; });
  await sleep(1500);
  await shot('v4-iva-look');
};
