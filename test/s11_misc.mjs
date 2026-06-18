/* editor mouse-building, R&D unlock, mission control, tracking station resume */
export default async ({ page, sleep, shot, state, evalJs, log }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(2500);

  /* --- editor: build pod + tank + engine with mouse --- */
  await evalJs(() => GAME.go('editor', {}));
  await sleep(1000);
  await page.click('.ed-part');                          // comet pod
  await sleep(250);
  await page.mouse.click(740, 420);                      // place as root
  await sleep(400);
  await page.click('#ed-cats .ed-cat:nth-child(2)');     // fuel tanks tab
  await sleep(250);
  const tankCards = await page.$$('#ed-partlist .ed-part');
  await tankCards[2].click();                            // s1_1100
  await sleep(250);
  await page.mouse.move(740, 470); await sleep(150);
  await page.mouse.move(740, 500); await sleep(200);
  await page.mouse.click(740, 500);                      // snap to bottom node
  await sleep(400);
  let st = await state();
  log('editor parts after tank:', JSON.stringify(st.parts));
  await page.click('#ed-cats .ed-cat:nth-child(3)');     // engines tab
  await sleep(250);
  const engCards = await page.$$('#ed-partlist .ed-part');
  await engCards[1].click();                             // wren
  await sleep(250);
  await page.mouse.move(740, 560); await sleep(200);
  await page.mouse.click(740, 560);
  await sleep(400);
  st = await state();
  log('editor parts after engine:', JSON.stringify(st.parts), 'dv:', JSON.stringify(st.dv));
  await shot('x1-built');

  /* --- campaign R&D --- */
  await evalJs(() => { GAME.save.mode = 'campaign'; GAME.save.tech = ['start']; GAME.save.sci = 50; GAME.go('rnd'); });
  await sleep(1200);
  await shot('x2-rnd');
  /* click basicRocketry node (second tech) then research */
  await evalJs(() => GAME.screens.rnd.openNode('basicRocketry'));
  await sleep(400);
  const research = await page.$$('.dlg-foot .btn.acc');
  if (research.length) await research[0].click();
  await sleep(500);
  const tech = await evalJs(() => JSON.stringify({ tech: GAME.save.tech, sci: GAME.save.sci }));
  log('TECH AFTER RESEARCH:', tech);
  await shot('x3-rnd-unlocked');

  /* --- mission control --- */
  await evalJs(() => GAME.go('mc'));
  await sleep(800);
  await shot('x4-mc');

  /* --- tracking: leave a flight in orbit then resume --- */
  await evalJs(() => { GAME.save.mode = 'sandbox'; GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }); });
  await sleep(1500);
  await evalJs(() => {
    window.__AUTOLAUNCH = true;
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
  for (let i = 0; i < 12; i++) {
    await evalJs(() => window.__simChunk(45));
    st = await state();
    if (st.pe && st.pe > 72000) break;
    if (st.dead) { log('DIED'); return; }
  }
  await evalJs(() => { GAME.renderer.render = window.__origRender; window.__FLIGHT.navball.update = window.__origNB; window.__FLIGHT.leaveToSC(); });
  await sleep(1500);
  await evalJs(() => GAME.go('track'));
  await sleep(800);
  await shot('x5-tracking');
  const flights = await evalJs(() => JSON.stringify(GAME.save.flights.map(f => ({ name: f.name, body: f.bodyId, landed: f.landed }))));
  log('TRACKED FLIGHTS:', flights);
  /* resume it */
  const flyBtns = await page.$$('.track-row .btn.acc');
  if (flyBtns.length) { await flyBtns[0].click(); await sleep(2500); }
  st = await state();
  log('RESUMED:', st.screen, 'alt', st.alt, 'ap', st.ap, 'pe', st.pe);
  await shot('x6-resumed');
};
