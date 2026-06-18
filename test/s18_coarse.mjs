export default async ({ page, sleep, evalJs }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const out = await evalJs(() => {
    const v = GAME.screens.sc.view;
    const res = [];
    const walk = (n) => {
      if (n.mesh && n.mesh.visible && n.level <= 5) {
        const dist = Math.round((v.camBF.distanceTo(n.center) - n.size * 0.7) / 1000);
        res.push({ lvl: n.level, face: n.face, distKm: dist, sizeKm: Math.round(n.size / 1000), kids: !!n.children, horizKm: Math.round(v.horizonDist / 1000) });
      }
      if (n.children) for (const c of n.children) walk(c);
    };
    for (const r of v.roots) walk(r);
    return JSON.stringify(res.slice(0, 40));
  });
  console.log('VISIBLE COARSE:', out);
};
