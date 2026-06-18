/* isolate B->A message flow */
export default async ({ page, sleep, evalJs, log, browser }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(3000);
  await evalJs(() => new Promise(res => NET.join('ws://localhost:8799', 'pipe', 'Alpha', 'sandbox', '', e => res(e || 'ok'))));
  const pageB = await browser.newPage();
  pageB.on('pageerror', e => log('B-PAGEERROR:', String(e).slice(0, 200)));
  await pageB.goto(page.url());
  await pageB.waitForTimeout(10000);
  await pageB.click('#btn-sandbox', { force: true, timeout: 60000 });
  await pageB.waitForTimeout(3000);
  const okB = await pageB.evaluate(() => new Promise(res => NET.join('ws://localhost:8799', 'pipe', 'Bravo', 'sandbox', '', e => res(e || 'ok'))));
  log('B join:', okB);
  await sleep(1500);
  /* instrument A: count raw incoming messages */
  await evalJs(() => {
    window.__msgs = [];
    const oldHandler = NET; // monkey-patch via ws
    const ws = (function () { try { return NETWS; } catch (e) { return null; } })();
  });
  await evalJs(() => {
    /* wrap A's socket onmessage to log types */
    window.__types = [];
  });
  /* B sends chat + state directly */
  const sent = await pageB.evaluate(() => {
    NET.sendChat('ping from B');
    let st = 'none';
    try {
      // direct state send
      const r = [1, 2, 3];
      // use internal send via tickFlight-less path: hack through sendChat-like call
      st = 'chat-only';
    } catch (e) { st = 'err ' + e; }
    return st;
  });
  log('B sent:', sent);
  await sleep(2000);
  const aChat = await evalJs(() => {
    // NET.chatLog is internal; check via toast side-effect impossible — expose players + use sendChat receipt
    return { players: [...NET.players.values()].map(p => p.name) };
  });
  log('A players:', JSON.stringify(aChat));
  /* now B enters flight and pumps; A checks lastState */
  await pageB.evaluate(() => GAME.go('flight', { launch: GAME.save.crafts['Hopper 1'] }));
  await pageB.waitForTimeout(1500);
  const bNet = await pageB.evaluate(() => ({ active: NET.active, mode: NET.mode, players: NET.players.size, ready: NET.ws ? NET.ws.readyState : -1, url: NET.ws ? NET.ws.url : '' }));
  log('B NET state:', JSON.stringify(bNet));
  await pageB.evaluate(() => { for (let k = 0; k < 60; k++) window.__FLIGHT.update(1 / 30); });
  await sleep(2000);
  const aState = await evalJs(() => {
    const p = [...NET.players.values()][0];
    return { hasState: !!(p && p.lastState), hasCraft: !!(p && p.craft) };
  });
  log('A received from B:', JSON.stringify(aState));
  /* control: raw second socket from B posing as a room member */
  const rawResult = await pageB.evaluate(() => new Promise(res => {
    const w = new WebSocket('ws://localhost:8799');
    w.onopen = () => {
      w.send(JSON.stringify({ t: 'join', room: 'pipe', id: 'pRAW', name: 'Raw', pass: '' }));
      setTimeout(() => { w.send(JSON.stringify({ t: 'state', s: { name: 'RawShip', body: 'gaia', r: [1, 2, 3], q: [0, 0, 0, 1], landed: true, alt: 0, parts: 1 } })); res('sent'); }, 500);
    };
    w.onerror = () => res('err');
    setTimeout(() => res('timeout'), 4000);
  }));
  log('raw B socket:', rawResult);
  await sleep(1500);
  const aState2 = await evalJs(() => {
    const out = {};
    for (const [id, p] of NET.players) out[id] = { name: p.name, hasState: !!p.lastState };
    return out;
  });
  log('A players after raw:', JSON.stringify(aState2));
  await pageB.close();
};
