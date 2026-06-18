/* multiplayer: two pages join the local relay, exchange roster + coop science */
export default async ({ page, sleep, shot, evalJs, log, browser }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(4000);
  /* lobby browser: list rooms (should be empty), then host with a password */
  const list0 = await evalJs(() => new Promise(res => {
    NET.listRooms('ws://localhost:8799', rooms => res(rooms), err => res('ERR ' + err));
  }));
  log('initial room list:', JSON.stringify(list0));
  const okA = await evalJs(() => new Promise(res => {
    NET.join('ws://localhost:8799', 'testroom', 'Alpha', 'coop', 'secret', err => res(err || 'ok'));
  }));
  log('A host:', okA);
  /* wrong password must be rejected */
  const badB = await evalJs(() => new Promise(res => {
    const ws2 = new WebSocket('ws://localhost:8799');
    ws2.onopen = () => ws2.send(JSON.stringify({ t: 'join', room: 'testroom', id: 'pX', name: 'Mallory', pass: 'wrong' }));
    ws2.onmessage = ev => { res(JSON.parse(ev.data).t); ws2.close(); };
    setTimeout(() => res('timeout'), 3000);
  }));
  log('wrong password result:', badB);
  /* player B: second page in the same browser */
  const pageB = await browser.newPage();
  pageB.on('console', m => { if (m.type() === 'error') log('B-ERROR:', m.text().slice(0, 300)); });
  pageB.on('pageerror', e => log('B-PAGEERROR:', String(e).slice(0, 300)));
  await pageB.goto(page.url());
  await pageB.waitForTimeout(12000);
  await pageB.click('#btn-sandbox', { force: true, timeout: 60000 });
  await pageB.waitForTimeout(6000);
  const listB = await pageB.evaluate(() => new Promise(res => {
    NET.listRooms('ws://localhost:8799', rooms => res(rooms), err => res('ERR ' + err));
  }));
  log('B sees rooms:', JSON.stringify(listB));
  const okB = await pageB.evaluate(() => new Promise(res => {
    NET.join('ws://localhost:8799', 'testroom', 'Bravo', 'coop', 'secret', err => res(err || 'ok'));
  }));
  log('B join:', okB);
  await sleep(2500);
  const rosterA = await evalJs(() => [...NET.players.values()].map(p => p.name));
  const rosterB = await pageB.evaluate(() => [...NET.players.values()].map(p => p.name));
  log('A sees:', JSON.stringify(rosterA), 'B sees:', JSON.stringify(rosterB));
  /* coop sci share: A earns science, B should receive it */
  const sciB0 = await pageB.evaluate(() => GAME.save.sci);
  await evalJs(() => { GAME.save.mode = 'campaign'; GAME.earnSci(25); NET.onScience(25, 'Test'); });
  await sleep(1500);
  const sciB1 = await pageB.evaluate(() => { return GAME.save.sci; });
  log('B sci before/after coop share:', sciB0, sciB1);
  /* chat */
  await evalJs(() => NET.sendChat('hello from Alpha'));
  await sleep(1000);
  const chatB = await pageB.evaluate(() => NET.active ? (window.__chat = true) : false);
  /* real-vessel ghosts: A launches, B launches, check proximity + craft sync.
     NOTE: pageB is a background tab — its RAF loop is paused, so pump updates manually. */
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Hopper 1'] }));
  await pageB.evaluate(() => GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }));
  await sleep(2000);
  for (let i = 0; i < 4; i++) {
    await pageB.evaluate(() => { for (let k = 0; k < 40; k++) window.__FLIGHT.update(1 / 30); });
    await sleep(1200);
  }
  const lockA = await evalJs(() => {
    const p = [...NET.players.values()][0];
    return {
      ghosts: NET.players.size, near: NET.nearOther(window.__FLIGHT), locked: window.__FLIGHT.warpLocked,
      gotCraft: !!(p && p.craft), craftParts: p && p.craft ? p.craft.parts.length : 0,
      realGhost: !!(p && p.ghost && p.ghost.group.children.length > 2),
    };
  });
  log('A proximity+craft:', JSON.stringify(lockA));
  await shot('mp-flight-ghost');
  await pageB.close();
};
