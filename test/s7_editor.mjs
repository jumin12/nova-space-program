/* editor: load stock craft, inspect stats, place a part */
export default async ({ page, sleep, shot, state, evalJs }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(3000);
  await evalJs(() => GAME.go('editor', {}));
  await sleep(1500);
  await shot('ed1-empty');
  /* place a pod as root: click first catalog card, then click canvas center */
  await page.click('.ed-part');                  // comet pod card
  await sleep(300);
  await page.mouse.click(740, 450);
  await sleep(500);
  await state();
  await shot('ed2-pod');
  /* load stock Aurora 1 */
  await evalJs(() => {
    const ed = GAME.screens.editor;
    ed.vessel = Vessel.deserialize(GAME.save.crafts['Aurora 1']);
    document.getElementById('ed-craftname').value = ed.vessel.name;
    ed.clearGhosts(); ed.rebuild(); ed.frameCamera();
  });
  await sleep(1200);
  await shot('ed3-aurora');
  const st = await state();
  if (!st.parts || st.partCount < 8) console.log('WARN: aurora craft too small');
};
