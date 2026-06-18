/* count actual socket sends from a background page's flight loop */
export default async ({ page, sleep, evalJs, log, browser }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(3000);
  await evalJs(() => new Promise(res => NET.join('ws://localhost:8799', 'pipe2', 'Alpha', 'sandbox', '', e => res(e || 'ok'))));
  const pageB = await browser.newPage();
  pageB.on('pageerror', e => log('B-PAGEERROR:', String(e).slice(0, 200)));
  await pageB.goto(page.url());
  await pageB.waitForTimeout(10000);
  await pageB.click('#btn-sandbox', { force: true, timeout: 60000 });
  await pageB.waitForTimeout(3000);
  await pageB.evaluate(() => new Promise(res => NET.join('ws://localhost:8799', 'pipe2', 'Bravo', 'sandbox', '', e => res(e || 'ok'))));
  await sleep(1000);
  await pageB.evaluate(() => GAME.go('flight', { launch: GAME.save.crafts['Hopper 1'] }));
  await pageB.waitForTimeout(1500);
  const counts = await pageB.evaluate(() => {
    window.__sent = [];
    const orig = NET.ws.send.bind(NET.ws);
    NET.ws.send = m => { window.__sent.push(JSON.parse(m).t); orig(m); };
    for (let k = 0; k < 60; k++) window.__FLIGHT.update(1 / 30);
    return { sent: window.__sent, buffered: NET.ws.bufferedAmount, ready: NET.ws.readyState, active: NET.active };
  });
  log('B socket sends during pump:', JSON.stringify(counts));
  await sleep(2000);
  const aGot = await evalJs(() => {
    const p = [...NET.players.values()][0];
    return { hasState: !!(p && p.lastState) };
  });
  log('A got state:', JSON.stringify(aGot));
  await pageB.close();
};
