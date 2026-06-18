/* map: maneuver node, predicted orbit, warp-to-node, burn, quicksave */
export default async ({ page, sleep, shot, state, evalJs, log }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(2500);
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }));
  await sleep(1500);
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
      while (t < secs && fl2 && !fl2.dead && GAME.currentName === 'flight') { fl2.update(1 / 30); t += 1 / 30; }
    };
  });
  for (let i = 0; i < 12; i++) {
    await evalJs(() => window.__simChunk(45));
    const st = await state();
    if (st.pe && st.pe > 72000) { log('IN ORBIT'); break; }
    if (st.dead) { log('DIED'); return; }
  }
  /* quicksave test */
  await evalJs(() => { window.__FLIGHT.quicksave(); });
  /* add node + open map */
  await evalJs(() => {
    const fl = window.__FLIGHT;
    fl.nodes = [{ ut: GAME.ut + 500, prograde: 862, normal: 0, radial: 0 }];
    GAME.renderer.render = window.__origRender;
    fl.navball.update = window.__origNB;
    fl.toggleMap();
    MAPVIEW.refreshPanel(fl);
    MAPVIEW.camDist = 3.2e7;
  });
  await sleep(1800);
  await shot('m1-node-map');
  const dir = await evalJs(() => { const fl = window.__FLIGHT; const d = MAPVIEW.nodeWorldDir(fl, fl.nodes[0]); return d ? 'ok' : 'null'; });
  log('node dir:', dir);
  /* warp to node */
  await evalJs(() => { const fl = window.__FLIGHT; fl.warpTo = fl.nodes[0].ut - 45; });
  for (let i = 0; i < 10; i++) {
    await sleep(700);
    const st = await state();
    if (st.warp === 1 && st.met > 300) break;
  }
  await shot('m2-warped');
  /* burn the node: aim + thrust until Ap ~ target */
  await evalJs(() => {
    GAME.renderer.render = () => {};
    const fl = window.__FLIGHT;
    fl.navball.update = () => ({ heading: 90, pitch: 0 });
    fl.sas = true; fl.sasMode = 'mnv';
  });
  await evalJs(() => window.__simChunk(30));     // align
  await evalJs(() => { window.__FLIGHT.throttle = 1; });
  for (let i = 0; i < 14; i++) {
    await evalJs(() => window.__simChunk(15));
    const st = await state();
    if (st.ap && st.ap > 11000000) { log('AP RAISED:', st.ap); break; }
    if (st.dead) { log('DIED'); return; }
  }
  await evalJs(() => {
    const fl = window.__FLIGHT;
    fl.throttle = 0;
    GAME.renderer.render = window.__origRender;
    fl.navball.update = window.__origNB;
    fl.nodes = [];
    MAPVIEW.refreshPanel(fl);
  });
  await sleep(1500);
  await shot('m3-transfer');
  await state();
  /* quickload check */
  await evalJs(() => { window.__FLIGHT.quickload(); });
  await sleep(2500);
  const st2 = await state();
  log('AFTER QUICKLOAD ap:', st2.ap, 'pe:', st2.pe);
  await shot('m4-quickloaded');
};
