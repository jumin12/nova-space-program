/* navball.js — attitude sphere instrument. Global: NavBall */
'use strict';
const NavBall = (() => {
  /* ---------- ball texture ---------- */
  function ballTexture() {
    const W = 1024, H = 512, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    /* sky / ground */
    const sky = x.createLinearGradient(0, 0, 0, H / 2);
    sky.addColorStop(0, '#3a7dd1'); sky.addColorStop(0.85, '#79b6e8'); sky.addColorStop(1, '#a8d4f2');
    x.fillStyle = sky; x.fillRect(0, 0, W, H / 2);
    const gnd = x.createLinearGradient(0, H / 2, 0, H);
    gnd.addColorStop(0, '#b07b3e'); gnd.addColorStop(0.18, '#8a5a2b'); gnd.addColorStop(1, '#4a2f14');
    x.fillStyle = gnd; x.fillRect(0, H / 2, W, H / 2);
    /* horizon */
    x.fillStyle = '#ffffff'; x.fillRect(0, H / 2 - 2, W, 4);
    const uForHeading = h => ((0.5 - h / 360) % 1 + 1) % 1;
    const vForPitch = p => (90 - p) / 180;
    /* pitch ladder */
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let p = -80; p <= 80; p += 10) {
      if (p === 0) continue;
      const y = vForPitch(p) * H;
      x.strokeStyle = p > 0 ? 'rgba(255,255,255,.75)' : 'rgba(255,235,200,.65)';
      x.lineWidth = p % 30 === 0 ? 2.5 : 1.4;
      const compress = Math.cos(p * Math.PI / 180);            // visual compensation
      for (let h = 0; h < 360; h += 30) {
        const u = uForHeading(h) * W;
        const len = (p % 30 === 0 ? 34 : 20) / Math.max(compress, 0.3);
        x.beginPath(); x.moveTo(u - len / 2, y); x.lineTo(u + len / 2, y); x.stroke();
      }
      if (p % 30 === 0) {
        x.fillStyle = 'rgba(255,255,255,.85)';
        x.font = `600 ${22 / Math.max(compress, 0.45)}px Rajdhani`;
        for (let h = 15; h < 360; h += 90) x.fillText(Math.abs(p), uForHeading(h) * W, y);
      }
    }
    /* meridians */
    for (let h = 0; h < 360; h += 30) {
      const u = uForHeading(h) * W;
      x.strokeStyle = 'rgba(255,255,255,.28)';
      x.lineWidth = h % 90 === 0 ? 2.4 : 1.2;
      x.beginPath(); x.moveTo(u, H * 0.06); x.lineTo(u, H * 0.94); x.stroke();
    }
    /* heading labels on horizon */
    x.font = '700 30px Rajdhani';
    const labels = [[0, 'N'], [45, '45'], [90, 'E'], [135, '135'], [180, 'S'], [225, '225'], [270, 'W'], [315, '315']];
    for (const [h, t] of labels) {
      const u = uForHeading(h) * W;
      x.fillStyle = h % 90 === 0 ? '#ffe07a' : 'rgba(255,255,255,.9)';
      x.fillText(t, u, H / 2 - 22);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  /* ---------- marker icons ---------- */
  function icon(draw, size = 64) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    x.lineWidth = 5; x.lineCap = 'round';
    draw(x, size);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(0.34);
    return sp;
  }
  const GREEN = '#c9f24b', RED = '#ff8b5e', CYAN = '#62d8e8', MAGENTA = '#d670e8', BLUE = '#5aa6ff', ORANGE = '#ffb454';
  const ICONS = {
    prograde: x => { x.strokeStyle = GREEN; x.beginPath(); x.arc(32, 32, 13, 0, 7); x.stroke(); x.beginPath(); x.moveTo(32, 19); x.lineTo(32, 6); x.moveTo(19, 32); x.lineTo(7, 32); x.moveTo(45, 32); x.lineTo(57, 32); x.stroke(); x.fillStyle = GREEN; x.beginPath(); x.arc(32, 32, 3.5, 0, 7); x.fill(); },
    retrograde: x => { x.strokeStyle = GREEN; x.beginPath(); x.arc(32, 32, 13, 0, 7); x.stroke(); x.beginPath(); x.moveTo(23, 23); x.lineTo(41, 41); x.moveTo(41, 23); x.lineTo(23, 41); x.moveTo(32, 19); x.lineTo(32, 6); x.moveTo(19, 32); x.lineTo(7, 32); x.moveTo(45, 32); x.lineTo(57, 32); x.stroke(); },
    radialOut: x => { x.strokeStyle = CYAN; x.beginPath(); x.arc(32, 32, 14, 0, 7); x.stroke(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; x.beginPath(); x.moveTo(32 + Math.cos(a) * 13, 32 + Math.sin(a) * 13); x.lineTo(32 + Math.cos(a) * 4, 32 + Math.sin(a) * 4); x.stroke(); } },
    radialIn: x => { x.strokeStyle = CYAN; x.beginPath(); x.arc(32, 32, 14, 0, 7); x.stroke(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; x.beginPath(); x.moveTo(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14); x.lineTo(32 + Math.cos(a) * 23, 32 + Math.sin(a) * 23); x.stroke(); } },
    normal: x => { x.strokeStyle = MAGENTA; x.beginPath(); x.moveTo(32, 12); x.lineTo(50, 46); x.lineTo(14, 46); x.closePath(); x.stroke(); x.fillStyle = MAGENTA; x.beginPath(); x.arc(32, 36, 3, 0, 7); x.fill(); },
    antinormal: x => { x.strokeStyle = MAGENTA; x.beginPath(); x.moveTo(32, 52); x.lineTo(50, 18); x.lineTo(14, 18); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(25, 28); x.lineTo(39, 28); x.moveTo(32, 21); x.lineTo(32, 35); x.stroke(); },
    maneuver: x => { x.strokeStyle = BLUE; x.beginPath(); x.arc(32, 32, 12, 0, 7); x.stroke(); x.beginPath(); x.moveTo(32, 20); x.lineTo(32, 4); x.stroke(); x.beginPath(); x.moveTo(24, 10); x.lineTo(32, 4); x.lineTo(40, 10); x.stroke(); x.fillStyle = BLUE; x.beginPath(); x.arc(32, 32, 4, 0, 7); x.fill(); },
    level: x => { x.strokeStyle = ORANGE; x.lineWidth = 6; x.beginPath(); x.moveTo(4, 32); x.lineTo(22, 32); x.lineTo(28, 42); x.lineTo(32, 32); x.lineTo(36, 42); x.lineTo(42, 32); x.lineTo(60, 32); x.stroke(); x.fillStyle = ORANGE; x.beginPath(); x.arc(32, 32, 3, 0, 7); x.fill(); },
  };

  class Ball {
    constructor(parentEl, size = 200) {
      this.size = size;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setSize(size, size);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.domElement.id = 'nb-canvas';
      parentEl.appendChild(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.cam = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 10);
      this.cam.position.z = 3;
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ map: ballTexture() }));
      this.scene.add(this.ball);
      /* shading + bezel overlay */
      const shade = new THREE.Sprite(new THREE.SpriteMaterial({
        map: PG.glowTex([[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0.04)'], [0.86, 'rgba(0,0,0,0.34)'], [0.97, 'rgba(0,0,0,0.6)'], [1, 'rgba(8,12,16,0.9)']], 256),
        depthTest: false, transparent: true,
      }));
      shade.scale.setScalar(2.34); shade.renderOrder = 5;
      this.scene.add(shade);
      this.markers = {};
      for (const k in ICONS) {
        const sp = icon(ICONS[k]);
        sp.renderOrder = 6;
        sp.visible = false;
        this.markers[k] = sp;
        this.scene.add(sp);
      }
      this.markers.level.visible = true;
      this.markers.level.position.set(0, 0, 1.28);
      this.markers.level.scale.setScalar(0.5);
      this.markers.level.renderOrder = 8;
      this._m = new THREE.Matrix4();
      this._S = new THREE.Matrix4();
      this._V = new THREE.Matrix4();
      this._q = new THREE.Quaternion();
      this._tv = new THREE.Vector3();
    }

    /* up/north/east: surface frame (inertial). q: vessel quaternion. dirs: {prograde: Vector3|null, ...} */
    update(up, north, east, q, dirs) {
      /* S columns: north, up, east ; V columns: vessel axes */
      const S = this._S, V = this._V;
      S.makeBasis(north, up, east);
      const vx = this._tv.set(1, 0, 0).applyQuaternion(q).clone();
      const vy = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const vz = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      V.makeBasis(vx, vy, vz);
      /* R = V^T * S : surface frame in vessel coords */
      const m = this._m.copy(V).transpose().multiply(S);
      /* cam remap: cam = C * vessel, C: x→x, y→z(out), z→-y(down)… nose +Y_v faces viewer */
      const e = m.elements;
      /* m maps surface→vessel. Build ball matrix mapping ballspace(=surface paint)→cam */
      const C = new THREE.Matrix4().set(
        1, 0, 0, 0,
        0, 0, -1, 0,
        0, 1, 0, 0,
        0, 0, 0, 1);
      const B = C.multiply(m);
      this.ball.quaternion.setFromRotationMatrix(B);
      /* heading & pitch of nose */
      const nUp = vy.dot(up), nN = vy.dot(north), nE = vy.dot(east);
      const pitch = Math.asin(U.clamp(nUp, -1, 1)) / U.DEG;
      let heading = Math.atan2(nE, nN) / U.DEG;
      if (heading < 0) heading += 360;
      /* markers */
      for (const k in this.markers) {
        if (k === 'level') continue;
        const d = dirs && dirs[k];
        const sp = this.markers[k];
        if (!d) { sp.visible = false; continue; }
        /* direction in vessel coords → cam coords */
        const dv = this._tv.set(d.dot(vx), d.dot(vy), d.dot(vz));
        const camP = new THREE.Vector3(dv.x, dv.z, dv.y);
        sp.visible = camP.z > 0.04;
        sp.position.copy(camP).multiplyScalar(1.02);
      }
      this.renderer.render(this.scene, this.cam);
      return { heading, pitch };
    }
    dispose() {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
  return { Ball };
})();
