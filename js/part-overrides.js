/* part-overrides.js — build custom part meshes from asset-editor JSON and patch PARTS.build */
'use strict';
const NSP_PART_BUILDER = (() => {
  const MAT_HEX = {
    white: 0xe9e9e4, offwhite: 0xcfd2cf, gray: 0x8d949c, darkgray: 0x4a5057, dark: 0x23262b,
    nozzle: 0x2c2f34, orange: 0xd57f2e, rust: 0xa45b22, glass: 0x1a2838, gold: 0xc8a23a,
    solar: 0x18306a, greenlight: 0x37e04a, redpaint: 0xb33a2e, ablator: 0x5b4632, chute: 0xe06a28,
  };

  let panelTex = null;
  function getPanelTex() {
    if (panelTex) return panelTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#808080'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#6a6a6a'; x.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const y = 8 + i * 24; x.beginPath(); x.moveTo(0, y); x.lineTo(128, y); x.stroke(); }
    panelTex = new THREE.CanvasTexture(c);
    panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping;
    return panelTex;
  }

  function makeMat(name, emissive) {
    const hex = MAT_HEX[name] || 0xaaaaaa;
    const m = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: name === 'nozzle' ? 0.3 : 0.45,
      metalness: name === 'nozzle' || name === 'gold' ? 0.85 : 0.15,
    });
    if (['white', 'offwhite', 'orange'].includes(name)) {
      m.bumpMap = getPanelTex();
      m.bumpScale = 0.01;
    }
    if (emissive) {
      m.emissive = new THREE.Color(emissive.color || '#37e04a');
      m.emissiveIntensity = emissive.intensity ?? 1;
    }
    return m;
  }

  function getGameMat(name, emissive) {
    if (!emissive && window.PARTS && PARTS.M && PARTS.M[name]) {
      const m = PARTS.M[name];
      return m.clone ? m.clone() : m;
    }
    return makeMat(name, emissive);
  }

  function pieceMesh(p) {
    const par = p.params || {};
    if (p.type === 'bufferMesh' && p.geo) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.geo.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(p.geo.nrm, 3));
      if (p.geo.idx && p.geo.idx.length) geo.setIndex(p.geo.idx);
      const mesh = new THREE.Mesh(geo, getGameMat(p.material || 'gray'));
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }
    const mat = getGameMat(p.material || 'white');
    let mesh;
    switch (p.type) {
      case 'box':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(par.w || 1, par.h || 1, par.d || 1), mat);
        break;
      case 'cylinder':
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(
          par.radiusTop ?? 0.5, par.radiusBottom ?? 0.5, par.height ?? 1, par.segments ?? 24), mat);
        break;
      case 'cone':
        mesh = new THREE.Mesh(new THREE.ConeGeometry(par.radius ?? 0.5, par.height ?? 1, par.segments ?? 24), mat);
        break;
      case 'sphere':
        mesh = new THREE.Mesh(new THREE.SphereGeometry(par.radius ?? 0.5, par.segments ?? 18, par.segments ?? 18), mat);
        break;
      case 'torus':
        mesh = new THREE.Mesh(new THREE.TorusGeometry(par.radius ?? 0.5, par.tube ?? 0.05, 12, par.segments ?? 32), mat);
        mesh.rotation.x = Math.PI / 2;
        break;
      case 'bell': {
        const prof = [];
        const rT = par.rThroat ?? 0.2, rE = par.rExit ?? 0.5, len = par.length ?? 0.6;
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          prof.push(new THREE.Vector2(rT + (rE - rT) * Math.pow(t, 1.6), -t * len));
        }
        mesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), mat);
        break;
      }
      case 'fin': {
        const sh = new THREE.Shape();
        const sp = par.span ?? 0.8, ch = par.chord ?? 0.45;
        sh.moveTo(0, 0); sh.lineTo(ch, 0); sh.lineTo(ch * 0.15, sp); sh.lineTo(0, sp * 0.85); sh.closePath();
        mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }), mat);
        mesh.rotation.y = Math.PI / 2;
        break;
      }
      case 'panel':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(par.w ?? 1.2, par.h ?? 0.04, par.d ?? 0.8), getGameMat('solar'));
        break;
      default:
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    }
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  function buildFromAsset(def) {
    const g = new THREE.Group();
    for (const p of def.pieces || []) {
      const grp = new THREE.Group();
      const m = pieceMesh(p);
      grp.add(m);
      grp.position.fromArray(p.pos || [0, 0, 0]);
      grp.rotation.set(p.rot?.[0] || 0, p.rot?.[1] || 0, p.rot?.[2] || 0);
      grp.scale.fromArray(p.scale || [1, 1, 1]);
      g.add(grp);
    }
    for (const fx of def.effects || []) {
      if (fx.type === 'emissive') {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(fx.radius ?? 0.07, 12, 10),
          makeMat('dark', { color: fx.color || '#37e04a', intensity: fx.intensity ?? 1.2 }));
        bulb.position.fromArray(fx.pos || [0, 0.5, 0]);
        bulb.userData.nspBlink = fx.blink || null;
        g.add(bulb);
      }
    }
    if (def.userData) {
      if (def.userData.plume) g.userData.plume = def.userData.plume;
      if (def.userData.legLen) g.userData.legLen = def.userData.legLen;
    }
    g.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.userData.nspEmissiveBase = o.material.emissiveIntensity;
      }
    });
    return g;
  }

  function tickBlink(group, t) {
    group.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const b = o.userData.nspBlink;
      if (!b?.period) return;
      const on = (t % b.period) / b.period < (b.duty ?? 0.5);
      o.material.emissiveIntensity = on ? (o.userData.nspEmissiveBase ?? 1) : 0.04;
    });
  }

  function patchParts() {
    if (!window.PARTS || !PARTS.build) return false;
    const O = window.NSP_PART_OVERRIDES || {};
    const ids = Object.keys(O);
    if (!ids.length) return true;
    const orig = PARTS.build;
    PARTS.buildOriginal = orig;
    PARTS.build = function (id) {
      if (O[id]) {
        const g = buildFromAsset(O[id]);
        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return g;
      }
      return orig(id);
    };
    /* drop cached templates for overridden parts */
    if (PARTS._invalidateOverride) PARTS._invalidateOverride(ids);
    return true;
  }

  return { buildFromAsset, patchParts, tickBlink, MAT_HEX, makeMat, pieceMesh, getGameMat };
})();

(function installOverrides() {
  function go() {
    if (!NSP_PART_BUILDER.patchParts()) setTimeout(go, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();

window.NSP_PART_BUILDER = NSP_PART_BUILDER;
