/* docking: two craft with clamp-ports meet in orbit, capture, then undock */
export default async ({ page, sleep, shot, evalJs, log }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(4000);
  /* active vessel: probe with a dock port on top */
  await evalJs(() => {
    const v = new Vessel('Chaser');
    const core = v.addPart('sprite', { type: 'root' });
    const up = core.def.nodes.findIndex(n => n.dir === 'up');
    v.addPart('dock1', { type: 'node', parent: core.uid, pIdx: up, mIdx: 1 });
    v.autoStage();
    GAME.go('flight', { launch: v.serialize() });
  });
  await sleep(3500);
  /* target vessel saved as a flight 30m away in the same orbit */
  const setup = await evalJs(() => {
    const F = window.__FLIGHT;
    const R = F.body.R, mu = F.body.mu, r = R + 250000;
    F.r.set(r, 0, 0);
    F.v.set(0, 0, -Math.sqrt(mu / r));
    F.launched = true; F.landed = false;
    /* target: probe + dock port, dock facing DOWN toward the chaser's dock */
    const tv = new Vessel('Target Station');
    const core = tv.addPart('sprite', { type: 'root' });
    const dn = core.def.nodes.findIndex(n => n.dir === 'down');
    tv.addPart('dock1', { type: 'node', parent: core.uid, pIdx: dn, mIdx: 0 });
    tv.autoStage();
    const f = {
      fid: 'ftarget', name: 'Target Station', bodyId: F.body.id,
      craft: tv.serialize(), stagesLeft: [], lit: [],
      /* parked 1.5m along the chaser's dock axis: inside magnetic capture range */
      r: F.r.clone().add(new THREE.Vector3(0, 1.5, 0)).toArray(),
      v: F.v.clone().toArray(),
      quat: [0, 0, 0, 1], landed: false, landedPos: null, landedQuat: null,
      met: 0, flags: {}, scienceBank: [], crew: [], launchUt: GAME.ut, savedUt: GAME.ut,
      partCount: 2, gear: false,
    };
    GAME.save.flights.push(f);
    GAME.saveNow();
    /* chaser points its dock (up,+Y) at the target above */
    F.quat.set(0, 0, 0, 1);
    F.angVel.set(0, 0, 0);
    F.sas = false;
    return 'ok';
  });
  log('setup:', setup);
  /* pump updates: the prop spawns on the 2s scan, then magnetic capture grabs it */
  for (let i = 0; i < 12; i++) {
    const st = await evalJs(() => {
      const F = window.__FLIGHT;
      for (let k = 0; k < 30; k++) F.update(1 / 30);
      const prop = F.nearProps && F.nearProps[0];
      return {
        props: F.nearProps ? F.nearProps.length : 0,
        dist: prop ? Math.round(prop.group.position.length() * 10) / 10 : -1,
        parts: F.vessel.parts.size,
        flights: GAME.save.flights.length,
      };
    });
    log('tick', i, JSON.stringify(st));
    if (st.parts > 2) { log('DOCKED — merged parts:', st.parts); break; }
  }
  await shot('dock-merged');
  const merged = await evalJs(() => {
    const F = window.__FLIGHT;
    return {
      parts: F.vessel.parts.size, flights: GAME.save.flights.length,
      docked: [...F.vessel.parts.values()].filter(p => p.dockedTo).length,
    };
  });
  log('after dock:', JSON.stringify(merged));
  /* undock */
  const undocked = await evalJs(() => {
    const F = window.__FLIGHT;
    const port = [...F.vessel.parts.values()].find(p => p.def.dock && p.dockedTo);
    if (!port) return 'no joint';
    F.undock(port);
    return { parts: F.vessel.parts.size, flights: GAME.save.flights.length };
  });
  log('after undock:', JSON.stringify(undocked));
  await sleep(800);
  await shot('dock-undocked');
};
