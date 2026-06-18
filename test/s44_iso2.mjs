export default async ({ page, sleep, shot, evalJs, log }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(4000);
  await evalJs(() => {
    window.__AUTOLAUNCH = true;
    GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] });
  });
  /* real-time ascent like s8 (autopilot cuts itself off once circularized) */
  await sleep(75000);
  await shot('i2-base');
  /* isolate flight-scene layers */
  for (const l of ['debris', 'smoke', 'plumes', 'heat']) {
    await evalJs((lx) => {
      const F = window.__FLIGHT;
      window.__r = [];
      const hide = o => { if (o && o.visible !== false) { window.__r.push(o); o.visible = false; } };
      if (lx === 'debris') for (const d of F.debris) hide(d.group);
      if (lx === 'smoke') for (const s of F.smoke) hide(s.s);
      if (lx === 'plumes') for (const p of F.plumes) hide(p.cone);
      if (lx === 'heat') hide(F.fxHeat);
    }, l);
    await sleep(300);
    await shot('i2-no-' + l);
    await evalJs(() => { for (const o of window.__r) o.visible = true; });
  }
  log('debris:', await evalJs(() => window.__FLIGHT.debris.length));
  /* now open map and isolate */
  await evalJs(() => window.__FLIGHT.toggleMap());
  await sleep(1500);
  await shot('i2-map');
  for (const l of ['mpoints', 'msky', 'mneb', 'mbelt', 'msprites']) {
    await evalJs((lx) => {
      const M = MAPVIEW;
      window.__r = [];
      const hide = o => { if (o && o.visible !== false) { window.__r.push(o); o.visible = false; } };
      if (lx === 'mpoints') hide(M.stars.points);
      if (lx === 'msky') hide(M.stars.sky);
      if (lx === 'mneb') for (const n of M.stars.nebulae) hide(n);
      if (lx === 'mbelt') hide(M.belt.points);
      if (lx === 'msprites') M.scene.traverse(o => { if (o.isSprite) hide(o); });
    }, l);
    await sleep(300);
    await shot('i2-map-no-' + l);
    await evalJs(() => { for (const o of window.__r) o.visible = true; });
  }
};
