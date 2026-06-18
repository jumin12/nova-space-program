export default async ({ page, sleep, shot, evalJs, state }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(2500);
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }));
  await sleep(2500);
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
    if (!st || st.dead) break;
    if (st.pe && st.pe > 72000) break;
    if (st.met > 900) break;
  }
  await evalJs(() => {
    GAME.renderer.render = window.__origRender;
    const fl = window.__FLIGHT;
    fl.navball.update = window.__origNB;
    fl.camDist = 22;
  });
  await sleep(1200);
  await shot('t-base');
  for (const l of ['band', 'neb', 'points', 'aurora', 'sunfx', 'plumes', 'scatter', 'puffs', 'smoke', 'clouds']) {
    await evalJs((lx) => {
      const F = window.__FLIGHT;
      window.__r = [];
      const hide = o => { if (o && o.visible !== false) { window.__r.push(o); o.visible = false; } };
      if (lx === 'band') hide(F.stars.sky);
      if (lx === 'neb') for (const n of F.stars.nebulae) hide(n);
      if (lx === 'points') hide(F.stars.points);
      if (lx === 'aurora') for (const id in F.views) { const v = F.views[id]; if (v.aurora) for (const a of v.aurora) hide(a); }
      if (lx === 'sunfx') { hide(F.sunFx.core); for (const f of F.sunFx.flares) hide(f); }
      if (lx === 'plumes') for (const p of F.plumes) hide(p.cone);
      if (lx === 'scatter') { if (F.scatter) { hide(F.scatter.trees); hide(F.scatter.rocks); } }
      if (lx === 'puffs') { if (F.puffs) hide(F.puffs.group); }
      if (lx === 'smoke') for (const s of F.smoke) hide(s.s);
      if (lx === 'clouds') for (const id in F.views) { const v = F.views[id]; if (v.clouds) hide(v.clouds); if (v.clouds2) hide(v.clouds2); }
    }, l);
    await sleep(300);
    await shot('t-no-' + l);
    await evalJs(() => { for (const o of window.__r) o.visible = true; });
  }
};
