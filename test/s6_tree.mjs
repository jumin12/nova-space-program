export default async ({ page, sleep, evalJs }) => {
  await sleep(4000);
  await page.click('#btn-sandbox');
  await sleep(7000);
  const info = await evalJs(() => {
    const v = GAME.screens.sc.view;
    const stats = { pending: v.buildQueue.length, perLevel: {}, visibleParents: [], holes: 0 };
    const walk = (n) => {
      const L = n.level;
      stats.perLevel[L] = stats.perLevel[L] || { meshes: 0, visible: 0, withChildren: 0 };
      if (n.mesh) { stats.perLevel[L].meshes++; if (n.mesh.visible) stats.perLevel[L].visible++; }
      if (n.children) {
        stats.perLevel[L].withChildren++;
        const ready = n.children.every(c => c.mesh || c.children);
        if (n.mesh && n.mesh.visible && n.children) {
          const missing = n.children.filter(c => !c.mesh && !c.children).map(c => ({ lvl: c.level, building: c.building, dist: Math.round(v.camBF.distanceTo(c.center)), size: Math.round(c.size) }));
          if (missing.length) stats.visibleParents.push({ lvl: n.level, face: n.face, missing });
        }
        for (const c of n.children) walk(c);
      }
    };
    for (const r of v.roots) walk(r);
    stats.visibleParents = stats.visibleParents.slice(0, 8);
    return JSON.stringify(stats, null, 1);
  });
  console.log('TREE:', info);
};
