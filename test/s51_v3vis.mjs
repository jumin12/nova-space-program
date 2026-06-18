/* v3 visuals: map modes, comm net, radiation overlay, CRT static, launch smoke, night clouds */
export default async ({ page, sleep, shot, evalJs, log }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(5000);
  /* tracking station: radiation + comm modes */
  await evalJs(() => GAME.go('track'));
  await sleep(4000);
  await evalJs(() => { MAPVIEW.focus = 'gaia'; MAPVIEW.camDist = CEL.GAIA.R * 6; MAPVIEW.setMode('rad'); });
  await sleep(1500);
  await shot('v3-map-radiation');
  await evalJs(() => MAPVIEW.setMode('comm'));
  await sleep(1500);
  await shot('v3-map-comm');
  await evalJs(() => { MAPVIEW.setMode('orbit'); GAME.go('sc'); });
  await sleep(3000);
  await shot('v3-sc-detail');
  /* launch: pad smoke billow */
  await evalJs(() => GAME.go('flight', { launch: GAME.save.crafts['Aurora 1'] }));
  await sleep(3500);
  await evalJs(() => { const F = window.__FLIGHT; F.stage(); });
  await sleep(2600);
  await shot('v3-launch-smoke');
  /* night side clouds check: teleport to dark-side orbit and look at the planet */
  await evalJs(() => {
    const F = window.__FLIGHT;
    const R = F.body.R, mu = F.body.mu, r = R + 300000;
    /* sun is roughly -X from gaia; park on the night side (+X is day here — use -X) */
    F.r.set(-r, 0, 0);
    F.v.set(0, 0, Math.sqrt(mu / r));
    F.launched = true; F.landed = false;
    F.throttle = 0; F.lit.clear();
    F.camPitch = -0.7; F.camDist = 60;
  });
  await sleep(6000);
  await shot('v3-nightside');
  /* CRT camera with no signal: nuke comm by forcing campaign-style commNet with no antenna */
  await evalJs(() => {
    const F = window.__FLIGHT;
    GAME.save.cfg = GAME.save.cfg || {};
    GAME.save.cfg.commNet = true;
    GAME.save.mode = 'campaign';
    COMMS.invalidate();
    F.signal = null; F.sigT = 99;
    /* strip antennas so the link dies (deep space, no relays) */
    F.r.set(-CEL.GAIA.R * 40, 0, 0);
    const cam = [...F.vessel.parts.values()].find(p => p.def.cameraPart);
    if (cam) F.enterCamView(cam);
  });
  await sleep(2500);
  await shot('v3-crt-nosignal');
  const sig = await evalJs(() => window.__FLIGHT.signal);
  log('signal state:', JSON.stringify(sig));
};
