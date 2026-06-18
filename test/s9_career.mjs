/* career loop: suborbital hop, science, chute landing, recovery */
export default async ({ page, sleep, shot, state, evalJs, log }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(2500);
  const funds0 = await evalJs(() => { GAME.save.mode = 'campaign'; GAME.save.funds = 50000; GAME.save.sci = 0; return GAME.save.funds; });
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Hopper 1'] }));
  await sleep(2000);
  /* stub rendering for fast sim */
  await evalJs(() => {
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
    fl.stage();           // ignite
  });
  await evalJs(() => window.__simChunk(30));
  await state();
  /* run thermometer experiment near apogee */
  await evalJs(() => { window.__FLIGHT.runExperiment('thermo'); });
  await sleep(400);
  await shot('c1-science-dialog');
  const keepBtns = await page.$$('.dlg-foot .btn.acc');
  if (keepBtns.length) await keepBtns[keepBtns.length - 1].click();
  await sleep(300);
  /* drop SRB then arm chute */
  await evalJs(() => { window.__FLIGHT.stage(); window.__FLIGHT.stage(); });
  for (let i = 0; i < 14; i++) {
    await evalJs(() => window.__simChunk(30));
    const st = await state();
    if (!st || st.screen !== 'flight') break;
    if (st.landed && st.met > 20) { log('LANDED BACK'); break; }
    if (st.dead) { log('DIED', JSON.stringify(st.deaths)); break; }
  }
  await evalJs(() => { GAME.renderer.render = window.__origRender; const fl = window.__FLIGHT; if (fl) fl.navball.update = window.__origNB; });
  await sleep(800);
  await shot('c2-landed');
  /* recover */
  const recHidden = await evalJs(() => document.getElementById('fl-recover').classList.contains('hidden'));
  log('recover hidden?', recHidden);
  if (!recHidden) {
    await page.click('#fl-recover');
    await sleep(1500);
    const after = await evalJs(() => JSON.stringify({ screen: GAME.currentName, funds: Math.round(GAME.save.funds), sci: GAME.save.sci, contracts: GAME.save.contracts }));
    log('AFTER RECOVERY:', after);
    await shot('c3-back-at-ksc');
  }
};
