/* editor: node-snap placement via real clicks at projected coordinates */
export default async ({ page, sleep, shot, state, evalJs, log }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(2500);
  await evalJs(() => GAME.go('editor', {}));
  await sleep(800);
  await page.click('.ed-part');
  await sleep(200);
  await page.mouse.click(740, 450);
  await sleep(400);
  /* hold tank, find the pod's bottom-node marker on screen, click there */
  await page.click('#ed-cats .ed-cat:nth-child(2)');
  await sleep(200);
  const cards = await page.$$('#ed-partlist .ed-part');
  await cards[2].click();
  await sleep(300);
  const nodePos = await evalJs(() => {
    const ed = GAME.screens.editor;
    const marks = ed.nodeMarkers.map(m => {
      const sp = m.position.clone().add(ed.craftGroup.position).project(ed.cam);
      return [(sp.x + 1) / 2 * innerWidth, (-sp.y + 1) / 2 * innerHeight, m.userData.open.n.dir];
    });
    return JSON.stringify(marks);
  });
  log('node markers at:', nodePos);
  const marks = JSON.parse(nodePos);
  const down = marks.find(m => m[2] === 'down');
  if (down) {
    await page.mouse.move(down[0], down[1]);
    await sleep(250);
    await page.mouse.click(down[0], down[1]);
    await sleep(400);
  }
  let st = await state();
  log('after tank:', JSON.stringify(st.parts));
  /* engine below tank */
  await page.click('#ed-cats .ed-cat:nth-child(3)');
  await sleep(200);
  const eng = await page.$$('#ed-partlist .ed-part');
  await eng[1].click();
  await sleep(300);
  const np2 = JSON.parse(await evalJs(() => {
    const ed = GAME.screens.editor;
    return JSON.stringify(ed.nodeMarkers.map(m => {
      const sp = m.position.clone().add(ed.craftGroup.position).project(ed.cam);
      return [(sp.x + 1) / 2 * innerWidth, (-sp.y + 1) / 2 * innerHeight, m.userData.open.n.dir, m.userData.open.part.id];
    }));
  }));
  log('markers2:', JSON.stringify(np2));
  const down2 = np2.find(m => m[2] === 'down' && m[3] === 's1_1100');
  if (down2) {
    await page.mouse.move(down2[0], down2[1]);
    await sleep(250);
    await page.mouse.click(down2[0], down2[1]);
    await sleep(400);
  }
  st = await state();
  log('after engine:', JSON.stringify(st.parts), 'stages:', JSON.stringify(st.stages), 'dv:', JSON.stringify(st.dv));
  await shot('y1-stack');
  /* symmetry fins: cycle X then surface-click on tank */
  await page.keyboard.press('x');
  await page.keyboard.press('x');                       // 3× symmetry
  await page.click('#ed-cats .ed-cat:nth-child(6)');    // aero
  await sleep(200);
  const fins = await page.$$('#ed-partlist .ed-part');
  await fins[0].click();
  await sleep(300);
  /* click on tank surface: project tank center */
  const tankPx = JSON.parse(await evalJs(() => {
    const ed = GAME.screens.editor;
    const tank = [...ed.vessel.parts.values()].find(p => p.id === 's1_1100');
    const wp = tank.pos.clone().add(ed.craftGroup.position).project(ed.cam);
    return JSON.stringify([(wp.x + 1) / 2 * innerWidth, (-wp.y + 1) / 2 * innerHeight]);
  }));
  await page.mouse.move(tankPx[0] - 18, tankPx[1]);
  await sleep(300);
  await page.mouse.click(tankPx[0] - 18, tankPx[1]);
  await sleep(500);
  st = await state();
  log('after fins:', JSON.stringify(st.parts), 'count:', st.partCount);
  await shot('y2-fins');
};
