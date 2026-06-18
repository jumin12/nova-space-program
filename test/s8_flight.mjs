/* flight: launch Aurora 1 with test autopilot to orbit */
export default async ({ page, sleep, shot, state, evalJs, log }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(2500);
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }));
  await sleep(2500);
  await shot('fl1-pad');
  await state();
  /* enable autopilot + stub rendering for fast sim */
  await evalJs(() => {
    window.__AUTOLAUNCH = true;
    window.__origRender = GAME.renderer.render.bind(GAME.renderer);
    GAME.renderer.render = () => {};
    const fl = window.__FLIGHT;
    window.__origNB = fl.navball.update.bind(fl.navball);
    fl.navball.update = () => ({ heading: 90, pitch: 45 });
    window.__simChunk = (secs) => {
      const fl2 = window.__FLIGHT;
      let t = 0;
      while (t < secs && fl2 && !fl2.dead) { fl2.update(1 / 30); t += 1 / 30; }
    };
  });
  for (let i = 0; i < 22; i++) {
    await evalJs(() => window.__simChunk(45));
    const st = await state();
    if (!st) break;
    if (st.dead) { log('VESSEL DIED'); break; }
    if (st.pe && st.pe > 72000) { log('ORBIT ACHIEVED'); break; }
    if (st.met > 900) { log('TIMEOUT'); break; }
  }
  /* restore rendering, screenshot orbit view */
  await evalJs(() => {
    GAME.renderer.render = window.__origRender;
    const fl = window.__FLIGHT;
    fl.navball.update = window.__origNB;
    fl.camDist = 22;
  });
  await sleep(1200);
  await shot('fl2-orbit');
  /* map view */
  await evalJs(() => { window.__FLIGHT.toggleMap(); });
  await sleep(1500);
  await shot('fl3-map');
  await state();
};
