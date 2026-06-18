export default async ({ page, sleep, evalJs, log }) => {
  await sleep(4500);
  await page.click('#btn-sandbox');
  await sleep(12000);
  const report = await evalJs(() => {
    const sc = GAME.screens.sc, v = sc.view, cam = sc.cam;
    const ray = new THREE.Raycaster();
    const meshes = [];
    v.terra.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    /* hole ray: (0.32,0.37) saw through local ground. march it to expected ground contact */
    ray.setFromCamera(new THREE.Vector2(0.32 * 2 - 1, 1 - 0.37 * 2), cam);
    const ctr = v.group.position, R = v.body.R;
    const ang = CEL.spinAngle(v.body, GAME.ut);
    const toBF = (w) => {
      const p = w.clone().sub(ctr);
      const c = Math.cos(-ang), s = Math.sin(-ang);
      return new THREE.Vector3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
    };
    let groundBF = null, tHit = 0;
    for (let t = 400; t < 12000; t += 50) {
      const w = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
      const bf = toBF(w);
      const dir = bf.clone().normalize();
      const h = CEL.heightAt(v.body, dir);
      if (bf.length() - R < h) { groundBF = dir; tHit = t; break; }
    }
    if (!groundBF) return ['ray never crosses sampler ground within 12km'];
    const out = ['expected ground contact at t=' + tHit + 'm'];
    /* walk quadtree to the containing leaf by closest child center */
    const target = groundBF.clone().multiplyScalar(R);
    let best = null, bd = 1e30;
    for (const r of v.roots) { const d = r.center.distanceTo(target); if (d < bd) { bd = d; best = r; } }
    let n = best;
    while (n) {
      out.push(`L${n.level} mesh:${!!n.mesh} vis:${n.mesh ? n.mesh.visible : '-'} bld:${n.building} kids:${n.children ? 4 : 0} dist:${Math.round(v.camBF.distanceTo(n.center) / 1000)}k size:${Math.round(n.size / 1000)}k`);
      if (!n.children) break;
      let bc = null, bcd = 1e30;
      for (const c of n.children) { const d = c.center.distanceTo(target); if (d < bcd) { bcd = d; bc = c; } }
      n = bc;
    }
    return out;
  });
  for (const r of report) log(r);
};
