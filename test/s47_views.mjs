/* EVA / IVA / nav-camera / telescope feature test */
export default async ({ page, sleep, shot, evalJs, log, state }) => {
  await sleep(5000);
  await page.click('#btn-sandbox');
  await sleep(4000);
  await evalJs(() => {
    const v = new Vessel('Observatory 1');
    const pod = v.addPart('comet', { type: 'root' });
    const down = pod.def.nodes.findIndex(n => n.dir === 'down');
    const scope = v.addPart('telescope', { type: 'node', parent: pod.uid, pIdx: down, mIdx: 0 });
    v.addPart('navcam', { type: 'surface', parent: pod.uid, angle: 0.5, y: 0, symId: 0 });
    v.addPart('supplyS', { type: 'surface', parent: pod.uid, angle: 2.5, y: -0.2, symId: 0 });
    v.autoStage();
    GAME.go('flight', { launch: v.serialize() });
  });
  await sleep(4000);
  await shot('v-pad');
  /* IVA */
  await evalJs(() => window.__FLIGHT.enterIva());
  await sleep(1500);
  await shot('v-iva');
  log('iva state:', JSON.stringify(await state()));
  await evalJs(() => window.__FLIGHT.exitViewModes());
  /* nav camera */
  await evalJs(() => {
    const F = window.__FLIGHT;
    const cam = [...F.vessel.parts.values()].find(p => p.def.cameraPart);
    F.enterCamView(cam);
  });
  await sleep(1200);
  await shot('v-camview');
  log('cam state:', JSON.stringify(await state()));
  await evalJs(() => window.__FLIGHT.exitViewModes());
  /* EVA */
  await evalJs(() => { const F = window.__FLIGHT; F.goEva(F.crew[0]); });
  await sleep(2500);
  await shot('v-eva');
  log('eva state:', JSON.stringify(await state()));
  await evalJs(() => window.__FLIGHT.plantFlag());
  await sleep(800);
  await shot('v-flag');
  const board = await evalJs(() => {
    const F = window.__FLIGHT;
    const d = F.boardDist;
    F.boardVessel();
    return { dist: Math.round(d * 10) / 10, eva: F.isEva, crew: F.crew.length };
  });
  log('board:', JSON.stringify(board));
  await sleep(1500);
  /* telescope from orbit, aimed at Selene */
  await evalJs(() => {
    const F = window.__FLIGHT;
    const R = F.body.R, mu = F.body.mu, r = R + 350000;
    F.r.set(r, 0, 0);
    F.v.set(0, 0, -Math.sqrt(mu / r));
    F.launched = true; F.landed = false;
    F.sas = false;
    /* aim vessel +Y at Selene */
    const selene = CEL.B.selene;
    const myAbs = ORB.bodyAbsPos(F.body, GAME.ut, new THREE.Vector3()).add(F.r);
    const dir = ORB.bodyAbsPos(selene, GAME.ut, new THREE.Vector3()).sub(myAbs).normalize();
    F.quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    F.angVel.set(0, 0, 0);
    const scope = [...F.vessel.parts.values()].find(p => p.def.telescope);
    F.enterScopeView(scope);
    F.scopeView.zoom = 30;
  });
  await sleep(2500);
  await shot('v-scope');
  const tgt = await evalJs(() => window.__FLIGHT.scopeTarget ? window.__FLIGHT.scopeTarget.id : null);
  log('scope target:', tgt);
  await evalJs(() => document.querySelector('#scope-obs') && document.querySelector('#scope-obs').click());
  await sleep(1200);
  await shot('v-scope-obs');
};
