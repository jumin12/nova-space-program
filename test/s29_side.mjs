export default async ({ page, sleep, shot, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const info = await evalJs(() => {
    const v = GAME.screens.sc.view;
    return {
      matSide: v.mat.side, oceanSide: v.oceanMat.side,
      FRONT: THREE.FrontSide, BACK: THREE.BackSide, DOUBLE: THREE.DoubleSide,
    };
  });
  log(JSON.stringify(info));
  await evalJs(() => { GAME.screens.sc.view.mat.side = THREE.FrontSide; GAME.screens.sc.view.mat.needsUpdate = true; });
  await sleep(500);
  await shot('side-front');
  await evalJs(() => { GAME.screens.sc.view.mat.side = THREE.BackSide; GAME.screens.sc.view.mat.needsUpdate = true; });
  await sleep(500);
  await shot('side-back');
};
