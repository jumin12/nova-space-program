export default async ({ page, sleep, shot, evalJs, state, log }) => {
  await sleep(5500);
  await shot('w-menu');
  /* campaign setup flow */
  await page.click('#btn-campaign');
  await sleep(800);
  await shot('w-campaign-setup');
  const found = await evalJs(() => {
    const btns = [...document.querySelectorAll('.dlg-foot .btn')];
    const b = btns.find(b2 => b2.textContent.includes('FOUND'));
    if (b) { b.click(); return true; }
    return false;
  });
  log('campaign setup confirmed:', found);
  await sleep(4000);
  await shot('w-sitepick');
  /* click somewhere on the globe (center-right of screen) */
  await page.mouse.click(750, 300);
  await sleep(600);
  await shot('w-sitepick-marked');
  await evalJs(() => {
    /* force-pick the classic site for determinism */
    document.querySelector('#sp-default').click();
  });
  await sleep(9000);
  await shot('w-sc-campaign');
  const st = await state();
  log('post-site state:', JSON.stringify(st));
  /* editor: open hangar mode */
  await evalJs(() => GAME.go('editor', { hangar: true }));
  await sleep(3500);
  await shot('w-hangar-editor');
  /* load the Skylark */
  await evalJs(() => {
    const ed = GAME.screens.editor;
    ed.vessel = Vessel.deserialize(GAME.save.crafts['Skylark Trainer']);
    ed.rebuild();
    ed.frameCamera();
  });
  await sleep(1200);
  await shot('w-skylark');
  await evalJs(() => GAME.go('sc'));
  await sleep(2000);
};
