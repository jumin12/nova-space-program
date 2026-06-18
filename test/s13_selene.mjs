/* grand finale: launch, orbit, plan transfer to Selene, warp into its SOI */
export default async ({ page, sleep, shot, state, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(2500);
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Pathfinder'] }));
  await sleep(2500);
  await shot('z1-pathfinder-pad');
  /* ascent with live render for a beauty shot at 8s */
  await evalJs(() => { window.__AUTOLAUNCH = true; });
  await sleep(7000);
  await shot('z2-liftoff');
  /* fast sim to orbit */
  await evalJs(() => {
    window.__origRender = GAME.renderer.render.bind(GAME.renderer);
    GAME.renderer.render = () => {};
    const fl = window.__FLIGHT;
    window.__origNB = fl.navball.update.bind(fl.navball);
    fl.navball.update = () => ({ heading: 90, pitch: 45 });
    window.__simChunk = (secs) => {
      const fl2 = window.__FLIGHT; let t = 0;
      while (t < secs && fl2 && !fl2.dead && GAME.currentName === 'flight') { fl2.update(1 / 30); t += 1 / 30; }
    };
  });
  let st;
  for (let i = 0; i < 14; i++) {
    await evalJs(() => window.__simChunk(45));
    st = await state();
    if (st.pe && st.pe > 72000) { log('PARKED IN ORBIT'); break; }
    if (st.dead) { log('DIED', JSON.stringify(st.deaths)); return; }
  }
  /* find a transfer burn time that encounters Selene */
  const plan = await evalJs(() => {
    const fl = window.__FLIGHT;
    const elems = fl.currentElements();
    const selene = CEL.B.selene;
    const mu = fl.body.mu;
    const r0 = (elems.rAp + elems.rPe) / 2;
    const rT = selene.orbit.a;
    const aX = (r0 + rT) / 2;
    const dv = Math.sqrt(mu * (2 / r0 - 1 / aX)) - Math.sqrt(mu / r0);
    const tFlight = Math.PI * Math.sqrt(aX * aX * aX / mu);
    /* search node time: arrival radius-vector ≈ Selene position at arrival */
    let best = null;
    for (let dt = 60; dt < elems.period + 60; dt += 20) {
      const t0 = GAME.ut + dt;
      const st0 = ORB.stateAtTime(elems, t0);
      const pro = st0.v.clone().normalize();
      const vNew = st0.v.clone().addScaledVector(pro, dv);
      const tel = ORB.elementsFromState(mu, st0.r, vNew, t0);
      const arr = ORB.stateAtTime(tel, t0 + tFlight);
      const mp = ORB.bodyRelPos(selene, fl.body, t0 + tFlight);
      const miss = arr.r.distanceTo(mp);
      if (!best || miss < best.miss) best = { ut: t0, miss, dv };
    }
    fl.nodes = [{ ut: best.ut, prograde: best.dv, normal: 0, radial: 0 }];
    return JSON.stringify({ dv: Math.round(best.dv), inT: Math.round(best.ut - GAME.ut), miss: Math.round(best.miss / 1000) + 'km' });
  });
  log('TRANSFER PLAN:', plan);
  /* warp to node, then burn along maneuver marker */
  await evalJs(() => { const fl = window.__FLIGHT; fl.warpTo = fl.nodes[0].ut - 40; });
  for (let i = 0; i < 40; i++) {
    await evalJs(() => window.__simChunk(8));
    st = await state();
    if (st.warp === 1 && (await evalJs(() => window.__FLIGHT.nodes[0].ut - GAME.ut)) < 60) break;
  }
  await evalJs(() => { const fl = window.__FLIGHT; fl.sas = true; fl.sasMode = 'mnv'; });
  await evalJs(() => window.__simChunk(35));
  const dvNeed = await evalJs(() => MAPVIEW.nodeDv(window.__FLIGHT.nodes[0]));
  await evalJs(() => { window.__FLIGHT.throttle = 1; });
  for (let i = 0; i < 80; i++) {
    /* fine-grained burn with in-page apoapsis cutoff (light probes accelerate hard) */
    const done = await evalJs(() => {
      const fl = window.__FLIGHT;
      let t = 0;
      while (t < 4 && fl && !fl.dead) {
        fl.update(1 / 30); t += 1 / 30;
        const el = fl.currentElements();
        if (el && (el.e >= 1 || el.rAp - fl.body.R > 11200000)) { fl.throttle = 0; return 'cut'; }
      }
      return fl.dead ? 'dead' : 'burning';
    });
    if (done === 'cut') break;
    if (done === 'dead') { log('DIED'); return; }
    st = await state();
    if (st.dbg && st.dbg.th === 0 && st.stagesLeft > 1) await evalJs(() => window.__FLIGHT.stage());
  }
  await evalJs(() => { window.__FLIGHT.throttle = 0; window.__FLIGHT.nodes = []; });
  st = await state();
  log('POST BURN ap:', st.ap);
  /* coast with rails warp until SOI switch */
  await evalJs(() => { window.__FLIGHT.setWarp(5); });
  for (let i = 0; i < 60; i++) {
    await evalJs(() => window.__simChunk(10));
    st = await state();
    if (st.body === 'selene') { log('SELENE SOI!'); break; }
    if (st.dead) { log('DIED'); return; }
  }
  /* restore render for screenshots */
  await evalJs(() => {
    GAME.renderer.render = window.__origRender;
    const fl = window.__FLIGHT;
    fl.navball.update = window.__origNB;
    if (fl.warpI > 0) fl.setWarp(0);
    fl.camDist = 30;
  });
  await sleep(1500);
  await shot('z3-selene-soi');
  await evalJs(() => { const fl = window.__FLIGHT; if (!fl.mapOpen) fl.toggleMap(); MAPVIEW.focus = 'selene'; MAPVIEW.camDist = 8e6; });
  await sleep(1500);
  await shot('z4-selene-map');
  await state();
};
