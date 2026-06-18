/* final: persistence + beauty screenshots */
export default async ({ page, sleep, shot, state, evalJs, log }) => {
  await sleep(4500);
  await shot('final-1-menu');
  await page.click('#btn-campaign');
  await sleep(1000);
  const confirmBtn = await page.$$('.dlg-foot .btn.acc');
  if (confirmBtn.length) { await confirmBtn[0].click(); }
  await sleep(5000);
  await shot('final-2-ksc');
  /* persistence: reload → continue should appear */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(4500);
  const contVisible = await evalJs(() => !document.getElementById('btn-continue').classList.contains('hidden'));
  log('CONTINUE visible after reload:', contVisible);
  if (contVisible) {
    await page.click('#btn-continue');
    await sleep(4000);
    const st = await state();
    log('continued into:', st.screen, 'mode', st.mode);
  }
  /* editor beauty shot with Pathfinder */
  await evalJs(() => GAME.go('editor', { craft: GAME.save.crafts['Pathfinder'] }));
  await sleep(2000);
  await shot('final-3-vab');
  /* launch pad shot */
  await evalJs(() => { GAME.save.mode = 'sandbox'; GAME.go('flight', { launch: GAME.save.crafts['Pathfinder'] }); });
  await sleep(3000);
  await evalJs(() => { const fl = window.__FLIGHT; fl.camYaw = -2.0; fl.camPitch = 0.10; fl.camDist = 26; });
  await sleep(800);
  await shot('final-4-pad');
  /* liftoff plume shot */
  await evalJs(() => { window.__AUTOLAUNCH = true; });
  await sleep(5500);
  await evalJs(() => { const fl = window.__FLIGHT; fl.camYaw = -2.4; fl.camPitch = 0.30; fl.camDist = 34; });
  await sleep(300);
  await shot('final-5-ascent');
  await sleep(6000);
  await shot('final-6-highalt');
};
