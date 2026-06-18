/* planetgfx.js — quadtree LOD planets, atmosphere scattering, ocean, clouds, stars, sun. Global: PG */
'use strict';
const PG = (() => {
  const { clamp, lerp, V3 } = U;
  const oceanTime = { value: 0 };

  /* ===================== cube-sphere face setup ===================== */
  const FACES = [
    { n: V3(1, 0, 0), u: V3(0, 0, -1), v: V3(0, 1, 0) },
    { n: V3(-1, 0, 0), u: V3(0, 0, 1), v: V3(0, 1, 0) },
    { n: V3(0, 1, 0), u: V3(1, 0, 0), v: V3(0, 0, -1) },
    { n: V3(0, -1, 0), u: V3(1, 0, 0), v: V3(0, 0, 1) },
    { n: V3(0, 0, 1), u: V3(1, 0, 0), v: V3(0, 1, 0) },
    { n: V3(0, 0, -1), u: V3(-1, 0, 0), v: V3(0, 1, 0) },
  ];
  /* uniform-ish cube→sphere */
  function cubeToSphere(p, out) {
    const x = p.x, y = p.y, z = p.z;
    const x2 = x * x, y2 = y * y, z2 = z * z;
    out.set(
      x * Math.sqrt(Math.max(1 - y2 / 2 - z2 / 2 + y2 * z2 / 3, 0)),
      y * Math.sqrt(Math.max(1 - z2 / 2 - x2 / 2 + z2 * x2 / 3, 0)),
      z * Math.sqrt(Math.max(1 - x2 / 2 - y2 / 2 + x2 * y2 / 3, 0)));
    return out;
  }

  const RES = 17;                                  // verts per patch edge
  /* terrain material: close-up detail, slope rock, snow sparkle, night city lights */
  function terrainMaterial(body) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.02 });
    const airless = !body.atmo && !body.ocean;
    mat.userData.u = { sun: { value: new THREE.Vector3(1, 0, 0) }, ctr: { value: new THREE.Vector3() }, airless: { value: airless ? 1 : 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSunW = mat.userData.u.sun;
      sh.uniforms.uCtrW = mat.userData.u.ctr;
      sh.uniforms.uTimeT = oceanTime;
      sh.uniforms.uAirless = mat.userData.u.airless;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vWp; attribute float city; varying float vCity;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWp = (modelMatrix * vec4(position,1.0)).xyz; vCity = city;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWp; varying float vCity;
uniform vec3 uSunW; uniform vec3 uCtrW; uniform float uTimeT; uniform float uAirless;
float vhash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(vhash(i),vhash(i+vec3(1,0,0)),f.x),mix(vhash(i+vec3(0,1,0)),vhash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(vhash(i+vec3(0,0,1)),vhash(i+vec3(1,0,1)),f.x),mix(vhash(i+vec3(0,1,1)),vhash(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{ float d = length(vViewPosition);
  vec3 upW = normalize(vWp - uCtrW);
  /* slope-based rock exposure (flat-face normal from derivatives) */
  vec3 fnW = normalize(cross(dFdx(vWp), dFdy(vWp)));
  float slope = abs(dot(fnW, upW));
  float rockM = smoothstep(0.86, 0.62, slope) * (1.0 - step(0.5, vCity));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.37, 0.34) * (0.75 + diffuseColor.g * 0.4), rockM * 0.7);
  float fade = 1.0 - smoothstep(600.0, 2600.0, d);
  if (fade > 0.01) {
    float n1 = vnoise(vWp*1.7) * 0.6 + vnoise(vWp*9.0) * 0.4;
    diffuseColor.rgb *= 1.0 + (n1 - 0.5) * 0.3 * fade;
    if (uAirless > 0.5) {
      float crater = vnoise(vWp * 3.2) * 0.5 + vnoise(vWp * 11.0) * 0.5;
      diffuseColor.rgb *= 0.78 + crater * 0.28;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, rockM * 0.85);
    } else {
      float white = smoothstep(0.78, 0.9, (diffuseColor.r + diffuseColor.g + diffuseColor.b) / 3.0);
      if (white > 0.01) {
        float sp = step(0.985, vnoise(vWp * 24.0));
        diffuseColor.rgb += white * sp * 0.35 * fade;
      }
    }
  }
  /* macro variation so far terrain isn't flat-toned */
  diffuseColor.rgb *= 0.94 + 0.12 * vnoise(vWp * 0.00014); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ /* night glow comes from 3D city buildings in Scatter — keep terrain dark */ }`);
    };
    return mat;
  }
  function oceanMaterial(body) {
    const c = body.ocean.col;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c[0], c[1], c[2]), roughness: 0.22, metalness: 0.28,
      transparent: true, opacity: 0.95,
    });
    mat.userData.u = { sun: { value: new THREE.Vector3(1, 0, 0) }, ctr: { value: new THREE.Vector3() } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = oceanTime;
      sh.uniforms.uSunO = mat.userData.u.sun;
      sh.uniforms.uCtrO = mat.userData.u.ctr;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp2;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp2 = (modelMatrix * vec4(position,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime; uniform vec3 uSunO; uniform vec3 uCtrO; varying vec3 vWp2;
float ohash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float onoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(ohash(i),ohash(i+vec3(1,0,0)),f.x),mix(ohash(i+vec3(0,1,0)),ohash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(ohash(i+vec3(0,0,1)),ohash(i+vec3(1,0,1)),f.x),mix(ohash(i+vec3(0,1,1)),ohash(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{ /* fresnel: deep saturated blue head-on, pale glancing; subtle swell mottling at distance */
  vec3 V = normalize(vViewPosition);
  vec3 upWo = normalize(vWp2 - uCtrO);
  float fres = pow(1.0 - clamp(dot(V, normalize(vNormal)), 0.0, 1.0), 3.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.7 + vec3(0.04, 0.07, 0.08), fres * 0.65);
  float swell = onoise(vWp2 * 0.00045 + uTime * 0.01);
  diffuseColor.rgb *= 0.92 + swell * 0.16; }`)
        .replace('#include <normal_fragment_maps>', `
{ float d = length(vViewPosition);
  float fade = 1.0 - smoothstep(2000.0, 30000.0, d);
  if (fade > 0.01) {
    float e = 18.0;
    float n0 = onoise(vWp2*0.11 + uTime*0.35) + 0.5 * onoise(vWp2*0.43 - uTime*0.6);
    float nx = onoise(vWp2*0.11 + vec3(e*0.01,0.0,0.0) + uTime*0.35) + 0.5 * onoise(vWp2*0.43 + vec3(e*0.01,0.0,0.0) - uTime*0.6);
    float nz = onoise(vWp2*0.11 + vec3(0.0,0.0,e*0.01) + uTime*0.35) + 0.5 * onoise(vWp2*0.43 + vec3(0.0,0.0,e*0.01) - uTime*0.6);
    vec3 pert = vec3((nx-n0), 0.0, (nz-n0)) * 2.0 * fade;
    normal = normalize(normal + pert.x * vec3(1.0,0.0,0.0) + pert.z * vec3(0.0,0.0,1.0));
  } }`);
    };
    return mat;
  }

  /* ===================== atmosphere shader ===================== */
  function atmoMesh(body) {
    const a = body.atmo;
    const top = body.R + a.h * 4.2;
    const geo = new THREE.SphereGeometry(1, 96, 64);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uR: { value: body.R }, uTop: { value: top },
        uH: { value: a.scaleH * 2.4 },
        uSky: { value: new THREE.Vector3(a.skyCol[0], a.skyCol[1], a.skyCol[2]) },
        uK: { value: Math.min(a.rho0, 3) * 1.0 },
        uAltFade: { value: 1 },
        uInvPV: { value: new THREE.Matrix4() },
        uViewport: { value: new THREE.Vector2(1920, 1080) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uCenter, uSun, uSky;
        uniform float uR, uTop, uH, uK, uAltFade;
        uniform mat4 uInvPV;
        uniform vec2 uViewport;
        vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r){
          vec3 oc = ro - c;
          float b = dot(oc, rd);
          float cc = dot(oc, oc) - r*r;
          float disc = b*b - cc;
          if (disc < 0.0) return vec2(1e20, -1e20);
          float s = sqrt(disc);
          return vec2(-b-s, -b+s);
        }
        void main(){
          #include <logdepthbuf_fragment>
          vec3 ro = cameraPosition;
          /* per-pixel ray from gl_FragCoord — interpolated clip coords wedge at the poles */
          vec2 ndc = vec2(
            (gl_FragCoord.x / uViewport.x) * 2.0 - 1.0,
            (gl_FragCoord.y / uViewport.y) * 2.0 - 1.0);
          vec4 wp4 = uInvPV * vec4(ndc, 1.0, 1.0);
          vec3 rd = normalize(wp4.xyz / wp4.w - ro);
          vec2 ts = raySphere(ro, rd, uCenter, uTop);
          float tN = max(ts.x, 0.0), tF = ts.y;
          vec2 tp = raySphere(ro, rd, uCenter, uR);
          if (tp.x > 0.0) tF = min(tF, tp.x);
          float L = tF - tN;
          if (L <= 0.0) discard;
          float stepL = L / 14.0;
          float od = 0.0; vec3 sumB = vec3(0.0); vec3 sumR = vec3(0.0); float sunsetA = 0.0;
          vec3 betaR = vec3(5.8, 13.5, 33.1) * 1e-5;
          vec3 betaM = vec3(21.0);
          for (int i = 0; i < 14; i++) {
            vec3 p = ro + rd * (tN + (float(i)+0.5) * stepL);
            vec3 up = p - uCenter;
            float alt = length(up) - uR;
            up = normalize(up);
            float dens = exp(-max(alt, 0.0) / uH);
            od += dens * stepL;
            float sd = dot(up, uSun);
            float day = clamp(sd * 2.8 + 0.28, 0.0, 1.15);
            float twil = pow(clamp(1.0 - abs(sd), 0.0, 1.0), 3.5) * clamp(sd*7.0+0.85, 0.0, 1.0);
            sunsetA += dens * twil * stepL;
            float w = dens * day * stepL;
            sumB += betaR * w;
            sumR += betaM * w * 0.35;
          }
          float x = od / uH * uK;
          float scat = 1.0 - exp(-x * 0.55);
          vec3 col = uSky * (sumB.x + sumB.y + sumB.z) / uH * uK * 9.5;
          col += vec3(0.18, 0.08, 0.02) * (sumR.x / uH * uK) * 2.2;
          col = mix(col, vec3(1.05, 0.42, 0.1) * scat, clamp(sunsetA / uH * uK * 0.85, 0.0, 0.62));
          float mu = dot(rd, uSun);
          float g = 0.76;
          float mie = pow(max(mu, 0.0), 12.0) * (1.0 - g*g) / pow(1.0 + g*g - 2.0*g*mu, 1.5);
          col += mix(vec3(1.0, 0.92, 0.78), uSky, 0.35) * mie * scat * 0.55;
          col += uSky * pow(max(mu, 0.0), 32.0) * scat * 0.22;
          float horiz = pow(1.0 - abs(dot(rd, normalize(ro - uCenter))), 2.5);
          col += mix(vec3(0.55, 0.72, 0.95), vec3(0.95, 0.55, 0.28), clamp(1.0 - mu * 1.8 - 0.15, 0.0, 1.0)) * horiz * scat * 0.18;
          col += (uSky * 0.5 + vec3(0.1, 0.28, 0.18)) * scat * 0.04;
          col = 1.0 - exp(-col * 2.4);
          float alpha = clamp(length(col) * 2.3, 0.22, 1.0) * uAltFade;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(top);
    m.renderOrder = 5;
    m.frustumCulled = false;
    return m;
  }

  /* ===================== cloud layer ===================== */
  function cloudNoiseAt(n, n2, tv, cover) {
    const lat = Math.asin(clamp(tv.y, -1, 1));
    const poleFade = clamp((1 - Math.abs(lat) / (Math.PI / 2)) * 2.4, 0, 1);
    const poleFade2 = poleFade * poleFade * (3 - 2 * poleFade);
    const base = U.fbm(n, tv.x * 2.4, tv.y * 2.4, tv.z * 2.4, 6);
    const detail = U.fbm(n2, tv.x * 6.5, tv.y * 6.5, tv.z * 6.5, 4);
    const billow = U.fbm(n, tv.x * 11 + 1.3, tv.y * 11, tv.z * 11, 3);
    const cells = 1 - Math.abs(U.fbm(n2, tv.x * 12 + 2.1, tv.y * 12, tv.z * 12, 3) * 2 - 1);
    let v = base * 0.52 + detail * 0.34 + billow * 0.28 + cells * 0.42;
    v = clamp((v - (0.32 - cover * 0.48)) * 2.5, 0, 1);
    v = Math.pow(v, 0.82);
    v = v * v * (3.0 - 2.0 * v);
    return { v, a: v * 252 * poleFade2 };
  }

  /* cube map avoids the equirectangular N–S meridian seam on sphere geometry */
  function cloudCubeTexture(seed, cover = 0.52) {
    const size = 256;
    const n = U.Simplex(seed), n2 = U.Simplex(seed + 5);
    const tv = new THREE.Vector3();
    const canvases = [];
    for (const face of FACES) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(size, size);
      const d = img.data;
      for (let y = 0; y < size; y++) {
        const sv = 1 - (y / (size - 1)) * 2;
        for (let x = 0; x < size; x++) {
          const su = (x / (size - 1)) * 2 - 1;
          tv.copy(face.n).addScaledVector(face.u, su).addScaledVector(face.v, sv).normalize();
          const { v, a } = cloudNoiseAt(n, n2, tv, cover);
          const i = (y * size + x) * 4;
          const g = 246 + v * 9;
          d[i] = g; d[i + 1] = g + 3; d[i + 2] = 255; d[i + 3] = a;
        }
      }
      ctx.putImageData(img, 0, 0);
      canvases.push(c);
    }
    const tex = new THREE.CubeTexture(canvases);
    tex.needsUpdate = true;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }
  /* dedicated cloud shader — cube-mapped, seam-free longitude sampling */
  function cloudMaterial(tex, opacity = 1) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uView: { value: new THREE.Vector3(0, 0, 1) },
        uCenter: { value: new THREE.Vector3() },
        uOpacity: { value: opacity },
      },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform vec3 uCenter;
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(wp.xyz - uCenter);
          gl_Position = projectionMatrix * viewMatrix * wp;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform samplerCube uMap;
        uniform vec3 uSun;
        uniform vec3 uView;
        uniform float uOpacity;
        varying vec3 vDir;
        float cloudSample(vec3 dir) {
          dir = normalize(dir);
          float a = textureCube(uMap, dir).a;
          /* soften cube-face edges with tiny directional offsets */
          a = max(a, textureCube(uMap, normalize(dir + vec3(0.018, 0.012, 0.0))).a * 0.42);
          a = max(a, textureCube(uMap, normalize(dir + vec3(0.0, 0.014, 0.016))).a * 0.38);
          return a;
        }
        void main() {
          #include <logdepthbuf_fragment>
          vec3 dir = normalize(vDir);
          vec3 sunN = normalize(uSun);
          vec3 viewN = normalize(uView);
          float a = cloudSample(dir);
          float a2 = cloudSample(normalize(dir + vec3(0.07, 0.05, 0.04)));
          float a3 = cloudSample(normalize(dir + vec3(-0.05, 0.08, 0.06)));
          a = max(a, max(a2 * 0.58, a3 * 0.42));
          float depth = 1.0;
          for (int i = 1; i < 7; i++) {
            vec3 sn = normalize(dir + viewN * float(i) * 0.012);
            float la = cloudSample(sn);
            la = max(la, cloudSample(normalize(sn + vec3(0.04, 0.03, 0.05))) * 0.55);
            depth *= 1.0 - la * 0.12;
          }
          a *= clamp(depth, 0.55, 1.0);
          a = 1.0 - pow(1.0 - a, 1.65);
          float ndl = dot(dir, sunN);
          float dayC = clamp(ndl * 1.85 + 0.68, 0.0, 1.0);
          float pole = smoothstep(0.998, 0.9, abs(dir.y));
          float night = 0.22 + 0.78 * dayC;
          a *= night * pole;
          if (a < 0.006) discard;
          float shell = pow(clamp(1.0 - abs(dot(dir, viewN)), 0.0, 1.0), 1.45);
          a *= 0.88 + 0.38 * shell;
          vec3 shadow = vec3(0.52, 0.64, 0.78);
          vec3 lit = vec3(1.0, 0.99, 0.96);
          float under = clamp(-ndl * 1.4 + 0.25, 0.0, 1.0);
          vec3 col = mix(shadow, lit, pow(dayC, 0.78));
          col = mix(col, shadow * 0.82, under * a * 0.55);
          col = mix(col * 0.88, col * 1.12, shell);
          float rim = pow(1.0 - abs(ndl), 3.2) * dayC;
          col += vec3(1.0, 0.94, 0.82) * rim * a * 0.22;
          float silver = pow(max(ndl, 0.0), 8.0) * 0.07;
          col += vec3(1.0, 0.98, 0.9) * silver * a;
          float edge = pow(shell, 1.35);
          float thick = a * (0.72 + 0.78 * edge);
          col += vec3(0.92, 0.95, 1.0) * edge * a * 0.14;
          col = mix(col * 0.9, col * 1.1, smoothstep(0.12, 0.85, edge));
          gl_FragColor = vec4(col, thick * uOpacity * 0.92);
        }`,
    });
    mat.userData.u = { sun: mat.uniforms.uSun, view: mat.uniforms.uView, opacity: mat.uniforms.uOpacity, center: mat.uniforms.uCenter };
    return mat;
  }

  function bodyCloudSeed(body) {
    return body.id === 'gaia' ? 11 : body.id === 'aqua' ? 22 : body.id === 'vesper' ? 33 : 33;
  }

  /* three concentric cloud shells — cumulus deck, cirrus veil, low haze */
  function attachCloudLayers(body, parentGroup) {
    if (!body.atmo || body.gas || body.id === 'rust') return [];
    const seed = bodyCloudSeed(body);
    const gaia = body.id === 'gaia';
    const cfg = [
      { rMul: 1.0064, cover: gaia ? 0.86 : 0.72, op: 0.78, seedOff: 0, seg: [128, 96], ro: 3 },
      { rMul: 1.0096, cover: gaia ? 0.36 : 0.3, op: 0.44, seedOff: 41, seg: [72, 48], ro: 3 },
      { rMul: 1.0034, cover: gaia ? 0.44 : 0.38, op: 0.36, seedOff: 67, seg: [96, 64], ro: 2 },
    ];
    const layers = [];
    for (const c of cfg) {
      const tex = cloudCubeTexture(seed + c.seedOff, c.cover);
      const mat = cloudMaterial(tex, c.op);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(body.R * c.rMul, c.seg[0], c.seg[1]), mat);
      mesh.renderOrder = c.ro;
      mesh.frustumCulled = false;
      parentGroup.add(mesh);
      layers.push({ mesh, mat, baseOp: c.op, spin: 1 + layers.length * 0.04 });
    }
    return layers;
  }

  const MAP_CLOUD_OPS = [0.98, 0.62, 0.52];

  /* ===================== sun surface + shared globe materials ===================== */
  function sunSurfaceTexture(w = 512) {
    const W = w, H = w / 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const n = U.Simplex(42), n2 = U.Simplex(43);
    const tv = new THREE.Vector3();
    for (let y = 0; y < H; y++) {
      const lat = (0.5 - y / H) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let x = 0; x < W; x++) {
        const lon = (x / W) * Math.PI * 2 - Math.PI;
        tv.set(cl * Math.cos(lon), sl, -cl * Math.sin(lon));
        const gran = U.fbm(n, tv.x * 18, tv.y * 18, tv.z * 18, 4);
        const cell = U.fbm(n2, tv.x * 42, tv.y * 42, tv.z * 42, 3);
        const hot = 0.55 + gran * 0.28 + cell * 0.12;
        const limb = clamp(tv.dot(new THREE.Vector3(0.2, 0.35, 0.9).normalize()) * 0.5 + 0.5, 0.35, 1);
        const i = (y * W + x) * 4;
        d[i] = 255 * hot * limb;
        d[i + 1] = 210 * hot * limb * 0.92;
        d[i + 2] = 140 * hot * limb * 0.75;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }
  const _globeNightStub = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    return new THREE.CanvasTexture(c);
  })();
  /* Lit globe shader — baked texture always reads clearly in dim space lighting */
  function bodyGlobeMaterial(baked, nightI = 0.22) {
    const u = {
      uMap: { value: baked.map },
      uNight: { value: baked.night || _globeNightStub },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uNightI: { value: baked.night ? nightI : 0 },
      uFill: { value: 0.24 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv;
        varying vec3 vN;
        void main() {
          vUv = uv;
          vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D uMap, uNight;
        uniform vec3 uSun;
        uniform float uNightI, uFill;
        varying vec2 vUv;
        varying vec3 vN;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 diff = texture2D(uMap, vUv).rgb;
          float NdL = max(dot(vN, normalize(uSun)), 0.0);
          vec3 col = diff * (uFill + (1.0 - uFill) * NdL);
          if (uNightI > 0.001) {
            float night = 1.0 - smoothstep(0.02, 0.32, NdL);
            col += texture2D(uNight, vUv).rgb * vec3(1.0, 0.66, 0.4) * night * uNightI;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    mat.userData.u = { sun: u.uSun };
    return mat;
  }
  function impostorAltThreshold(body) {
    if (body.atmo) return Math.max(body.atmo.h * 1.15, 3500);
    return Math.max(body.R * 0.035, 3500);
  }
  /* full quadtree only below this — avoids a LOD explosion when descending through the mid-atmosphere */
  function surfaceLodAlt(body) {
    if (body.atmo) return Math.min(body.atmo.h * 0.22, 18000);
    return Math.max(body.R * 0.015, 2800);
  }

  /* ===================== gas giant texture ===================== */
  function gasTexture(body) {
    const w = 1024, h = 512, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const n = U.Simplex(77), n2 = U.Simplex(78);
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const base = [0.18, 0.5, 0.42], light = [0.55, 0.85, 0.7], dark = [0.08, 0.3, 0.28];
    for (let y = 0; y < h; y++) {
      const v = y / h, lat = (v - 0.5) * Math.PI;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const swirl = n(Math.cos(u * Math.PI * 2) * 2, Math.sin(u * Math.PI * 2) * 2, lat * 3) * 0.22;
        let band = Math.sin(lat * 16 + swirl * 26 + n2(0, lat * 5, u * 2) * 3.5) * 0.5 + 0.5;
        band = band * 0.7 + 0.3 * n(u * 10, lat * 7, 1.8);
        const storm = Math.max(0, 0.65 - Math.hypot((u - 0.3) * 3.2, (v - 0.62) * 7)) * 1.4;
        const storm2 = Math.max(0, 0.55 - Math.hypot((u - 0.72) * 4, (v - 0.38) * 5)) * 1.1;
        band = clamp(band + storm * 0.5 + storm2 * 0.35, 0, 1);
        const i = (y * w + x) * 4;
        const cl = band > 0.5 ? light : dark;
        const t = Math.abs(band - 0.5) * 2;
        d[i] = (lerp(base[0], cl[0], t)) * 255;
        d[i + 1] = (lerp(base[1], cl[1], t)) * 255;
        d[i + 2] = (lerp(base[2], cl[2], t)) * 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }
  function ringMesh(body) {
    const r0 = body.R * body.ring.r0, r1 = body.R * body.ring.r1;
    const geo = new THREE.RingGeometry(r0, r1, 180, 24);
    /* radial stripes texture */
    const c = document.createElement('canvas'); c.width = 256; c.height = 1;
    const ctx = c.getContext('2d');
    const rng = U.mulberry32(31337);
    for (let x = 0; x < 256; x++) {
      const a = 0.16 + rng() * 0.5 * (0.4 + 0.6 * Math.sin(x / 256 * Math.PI));
      ctx.fillStyle = `rgba(${170 + rng() * 50 | 0},${185 + rng() * 40 | 0},${175 + rng() * 40 | 0},${a})`;
      ctx.fillRect(x, 0, 1, 1);
    }
    const tex = new THREE.CanvasTexture(c);
    /* map ring radius to texture u */
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      uv.setXY(i, (Math.hypot(x, y) - r0) / (r1 - r0), 0.5);
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  /* ===================== PlanetView ===================== */
  class PlanetView {
    constructor(body, scene, opts = {}) {
      this.body = body;
      this.scene = scene;
      this.group = new THREE.Group();                  // positioned at body center, rotated by spin
      this.terra = new THREE.Group();
      this.group.add(this.terra);
      scene.add(this.group);
      this.detail = opts.detail !== undefined ? opts.detail : 0;
      this.cloudMapMode = !!opts.cloudMapMode;
      this.castShadows = !!opts.shadows;
      this.maxDepth = Math.max(3, Math.ceil(Math.log2(body.R * 1.57 / 16 / 3.5)) + this.detail);
      this.buildQueue = [];
      this.camBF = new THREE.Vector3();
      this._tmp = new THREE.Vector3();
      this._sampleOut = { h: 0, 0: 0, 1: 0, 2: 0, biome: 0 };

      if (body.star) {
        const tex = sunSurfaceTexture(512);
        const geo = new THREE.SphereGeometry(body.R, 96, 72);
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        this.terra.add(new THREE.Mesh(geo, mat));
      } else if (body.gas) {
        const geo = new THREE.SphereGeometry(body.R, 96, 64);
        const mat = new THREE.MeshStandardMaterial({ map: gasTexture(body), roughness: 1 });
        this.terra.add(new THREE.Mesh(geo, mat));
        if (body.ring) this.group.add(ringMesh(body));
      } else {
        this.mat = terrainMaterial(body);
        this.roots = FACES.map((f, fi) => this.makeNode(fi, 0, -1, -1, 1, 1));
        for (const r of this.roots) this.requestBuild(r);
        if (body.ocean) {
          this.oceanMat = oceanMaterial(body);
          this.oceanRoots = FACES.map((f, fi) => this.makeNode(fi, 0, -1, -1, 1, 1, true));
          for (const r of this.oceanRoots) this.requestBuild(r);
        }
      }
      if (body.atmo && !body.gas) { this.atmo = atmoMesh(body); scene.add(this.atmo); }
      if (body.gas && body.atmo) { this.atmo = atmoMesh(body); scene.add(this.atmo); }
      this.cloudLayers = [];
      if (opts.clouds !== false && body.atmo && !body.gas && body.id !== 'rust') {
        this.cloudLayers = attachCloudLayers(body, this.group);
        if (this.cloudLayers[0]) {
          this.clouds = this.cloudLayers[0].mesh;
          this.cloudMat = this.cloudLayers[0].mat;
          this.clouds2 = this.cloudLayers[1]?.mesh;
          this.cloudMat2 = this.cloudLayers[1]?.mat;
          this.clouds3 = this.cloudLayers[2]?.mesh;
          this.cloudMat3 = this.cloudLayers[2]?.mat;
        }
      }
      /* polar aurora ovals (optional — disabled on menu to avoid limb flashing) */
      if ((body.id === 'gaia' || body.id === 'goliath') && opts.clouds !== false && opts.aurora !== false) {
        this.aurora = [];
        for (const pole of [1, -1]) {
          const m = auroraMesh(body, pole);
          this.aurora.push(m);
          this.group.add(m);
        }
      }
      /* textured impostor ready immediately — visible at any solar-system distance */
      if (!body.star) this.ensureGlobe();
    }

    makeNode(face, level, u0, v0, u1, v1, ocean = false) {
      const f = FACES[face];
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const p = this._tmp.copy(f.n).addScaledVector(f.u, cu).addScaledVector(f.v, cv);
      const dir = cubeToSphere(p, new THREE.Vector3());
      const center = dir.multiplyScalar(this.body.R);
      return { face, level, u0, v0, u1, v1, center, size: this.body.R * 1.57 * (u1 - u0) / 2, mesh: null, children: null, building: false, ocean };
    }

    requestBuild(node) {
      if (node.building || node.mesh) return;
      node.building = true;
      this.buildQueue.push(node);
    }

    buildPatch(node) {
      if (!node.ocean && this.body.ocean && node.level >= 5 && this.underwaterTerrain(node)) {
        node.building = false;
        return;
      }
      const f = FACES[node.face];
      const N = RES, M = N + 2;                        // margin ring for normals
      const posG = new Float64Array(M * M * 3);
      const colG = new Float32Array(N * N * 3);
      const cityG = new Float32Array(N * N);
      const habitable = this.body.id === 'gaia' && !node.ocean;
      const du = (node.u1 - node.u0) / (N - 1), dv = (node.v1 - node.v0) / (N - 1);
      const p = new THREE.Vector3(), dir = new THREE.Vector3();
      const out = { h: 0, 0: 0, 1: 0, 2: 0, biome: 0 };
      const R = this.body.R;
      const low = false;   // heights must be LOD-consistent or patch seams appear
      for (let j = 0; j < M; j++) {
        for (let i = 0; i < M; i++) {
          const u = node.u0 + (i - 1) * du, v = node.v0 + (j - 1) * dv;
          p.copy(f.n).addScaledVector(f.u, u).addScaledVector(f.v, v);
          cubeToSphere(p, dir);
          let h = 0;
          if (!node.ocean && this.body.sampler) {
            this.body.sampler(dir, out, low);
            h = out.h;
            if (habitable && typeof CEL !== 'undefined' && CEL.adjustSiteHeight) h = CEL.adjustSiteHeight(dir, h);
            if (j > 0 && j < M - 1 && i > 0 && i < M - 1) {
              const ci = ((j - 1) * N + (i - 1)) * 3;
              colG[ci] = out[0]; colG[ci + 1] = out[1]; colG[ci + 2] = out[2];
              if (habitable && h > 2 && h < 600 && [1, 2, 3, 11, 12].includes(out.biome)) cityG[(j - 1) * N + (i - 1)] = 1;
            }
          }
          const k = (j * M + i) * 3, rr = R + h;
          posG[k] = dir.x * rr - node.center.x;
          posG[k + 1] = dir.y * rr - node.center.y;
          posG[k + 2] = dir.z * rr - node.center.z;
        }
      }
      /* build geometry: N×N grid + tiny apron. Heights are LOD-consistent so cracks are sub-pixel;
         large skirts/aprons were repeatedly the source of sky-grid artifacts — keep them micro. */
      const cell = node.size * 2 / (N - 1);
      const apronOut = clamp(cell * 0.04, 0.05, 1.5);
      /* deep enough to seal T-junction cracks between LOD rings (chord error grows with cell);
         single outward winding keeps deep skirts invisible except across cracks */
      const apronDown = clamp(cell * 0.15, 1, 140);
      const vertCount = N * N + N * 4;
      const positions = new Float32Array(vertCount * 3);
      const normals = new Float32Array(vertCount * 3);
      const colors = new Float32Array(vertCount * 3);
      const cities = new Float32Array(vertCount);
      const va = new THREE.Vector3(), vb = new THREE.Vector3(), vn = new THREE.Vector3();
      const cdir = node.center.clone().normalize();
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const gi = ((j + 1) * M + (i + 1)) * 3, vi = (j * N + i) * 3;
          positions[vi] = posG[gi]; positions[vi + 1] = posG[gi + 1]; positions[vi + 2] = posG[gi + 2];
          /* central difference normal */
          const gl = ((j + 1) * M + i) * 3, gr = ((j + 1) * M + (i + 2)) * 3;
          const gd = (j * M + (i + 1)) * 3, gu = ((j + 2) * M + (i + 1)) * 3;
          va.set(posG[gr] - posG[gl], posG[gr + 1] - posG[gl + 1], posG[gr + 2] - posG[gl + 2]);
          vb.set(posG[gu] - posG[gd], posG[gu + 1] - posG[gd + 1], posG[gu + 2] - posG[gd + 2]);
          vn.crossVectors(va, vb).normalize();
          if (vn.dot(va.set(posG[gi] + node.center.x, posG[gi + 1] + node.center.y, posG[gi + 2] + node.center.z)) < 0) vn.negate();
          normals[vi] = vn.x; normals[vi + 1] = vn.y; normals[vi + 2] = vn.z;
          if (node.ocean) { colors[vi] = 1; colors[vi + 1] = 1; colors[vi + 2] = 1; }
          else { colors[vi] = colG[vi]; colors[vi + 1] = colG[vi + 1]; colors[vi + 2] = colG[vi + 2]; }
          cities[j * N + i] = cityG[j * N + i];
        }
      }
      /* skirts: copy edges, push toward planet center */
      let sv = N * N;
      const edges = [[], [], [], []];
      for (let i = 0; i < N; i++) { edges[0].push(i); edges[1].push((N - 1) * N + i); edges[2].push(i * N); edges[3].push(i * N + N - 1); }
      const skirtIdx = [];
      const _up = new THREE.Vector3(), _out = new THREE.Vector3();
      const edgeOut = [null, null, null, null];
      for (let e = 0; e < 4; e++) {
        for (const src of edges[e]) {
          const si = sv * 3, oi = src * 3;
          /* per-vertex radial up + horizontal outward direction */
          const px = positions[oi] + node.center.x, py = positions[oi + 1] + node.center.y, pz = positions[oi + 2] + node.center.z;
          _up.set(px, py, pz).normalize();
          _out.set(positions[oi], positions[oi + 1], positions[oi + 2]);
          _out.addScaledVector(_up, -_out.dot(_up));
          if (_out.lengthSq() < 1e-6) _out.set(1, 0, 0);
          _out.normalize();
          if (!edgeOut[e]) edgeOut[e] = _out.clone();
          positions[si] = positions[oi] + _out.x * apronOut - _up.x * apronDown;
          positions[si + 1] = positions[oi + 1] + _out.y * apronOut - _up.y * apronDown;
          positions[si + 2] = positions[oi + 2] + _out.z * apronOut - _up.z * apronDown;
          normals[si] = normals[oi]; normals[si + 1] = normals[oi + 1]; normals[si + 2] = normals[oi + 2];
          colors[si] = colors[oi]; colors[si + 1] = colors[oi + 1]; colors[si + 2] = colors[oi + 2];
          cities[sv] = cities[src];
          skirtIdx.push(sv); sv++;
        }
      }
      const idx = [];
      /* (a,b,c) order winds the surface OUTWARD (three.js front face); the old (a,c,b) order
         rendered the whole planet as backfaces — culling/raycast leaked at grazing angles */
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      /* skirt triangles — SINGLE outward-facing winding. (Double-winding made skirts visible
         from behind along terrain silhouettes: bright grid-line artifact.) */
      const _se1 = new THREE.Vector3(), _se2 = new THREE.Vector3(), _sn = new THREE.Vector3();
      const addSkirt = (e) => {
        const a0 = edges[e][0] * 3, a1 = edges[e][1] * 3, s0 = skirtIdx[e * N] * 3;
        _se1.set(positions[s0] - positions[a0], positions[s0 + 1] - positions[a0 + 1], positions[s0 + 2] - positions[a0 + 2]);
        _se2.set(positions[a1] - positions[a0], positions[a1 + 1] - positions[a0 + 1], positions[a1 + 2] - positions[a0 + 2]);
        _sn.crossVectors(_se1, _se2);
        const flip = _sn.dot(edgeOut[e]) < 0;
        for (let i = 0; i < N - 1; i++) {
          const a = edges[e][i], b = edges[e][i + 1];
          const sa = skirtIdx[e * N + i], sb = skirtIdx[e * N + i + 1];
          if (flip) idx.push(a, b, sa, b, sb, sa);
          else idx.push(a, sa, b, b, sa, sb);
        }
      };
      if (!window.PG_NOSKIRT) { addSkirt(0); addSkirt(1); addSkirt(2); addSkirt(3); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('city', new THREE.BufferAttribute(cities, 1));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, node.ocean ? this.oceanMat : this.mat);
      mesh.position.copy(node.center);
      if (!node.ocean) { mesh.receiveShadow = true; }
      mesh.userData.node = node;
      /* bounding sphere generous (heights) */
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), node.size * 1.7 + apronOut + 9000);
      node.mesh = mesh;
      node.building = false;
      this.terra.add(mesh);
    }

    /* split/merge pass; camBF = camera in body-fixed frame */
    underwaterTerrain(node) {
      if (node.ocean || !this.body.ocean || !this.body.sampler || node.level < 5) return false;
      this._tmp.copy(node.center).normalize();
      this.body.sampler(this._tmp, this._sampleOut, true);
      return this._sampleOut.h < 0;
    }
    updateNode(node) {
      if (!node.ocean && this.body.ocean && this.underwaterTerrain(node)) {
        if (node.mesh) node.mesh.visible = false;
        return;
      }
      const dist = Math.max(this.camBF.distanceTo(node.center) - node.size * 0.7, 1);
      const beyondHorizon = dist > this.horizonDist + node.size * 1.8;
      /* coarse levels split eagerly so the planet limb stays smooth from orbit */
      const splitK = node.level <= 4 ? 5.2 : node.level <= 6 ? 4.2 : node.level <= 7 ? 2.7 : 2.0;
      const wantSplit = !beyondHorizon && dist < node.size * splitK && node.level < (node.ocean ? Math.min(this.maxDepth, 7) : this.maxDepth) && !!node.mesh;
      if (wantSplit && !node.children) {
        const um = (node.u0 + node.u1) / 2, vm = (node.v0 + node.v1) / 2;
        node.children = [
          this.makeNode(node.face, node.level + 1, node.u0, node.v0, um, vm, node.ocean),
          this.makeNode(node.face, node.level + 1, um, node.v0, node.u1, vm, node.ocean),
          this.makeNode(node.face, node.level + 1, node.u0, vm, um, node.v1, node.ocean),
          this.makeNode(node.face, node.level + 1, um, vm, node.u1, node.v1, node.ocean),
        ];
        for (const c of node.children) this.requestBuild(c);
      } else if (!wantSplit && node.children && (dist > node.size * (node.level <= 7 ? 3.5 : 2.8) || beyondHorizon && dist > node.size * 2.4)) {
        this.disposeChildren(node);
        if (node.mesh) node.mesh.visible = true;
      }
      if (node.children) {
        const ready = node.children.every(c => c.mesh || c.children);
        if (node.mesh) node.mesh.visible = !ready;
        for (const c of node.children) this.updateNode(c);
      }
      /* NOTE: do NOT hide horizon-ring patches from altitude — toggling them at the
         threshold produced flashing black sky triangles at the limb. The impostor
         globe sits underneath them instead. */
    }
    disposeChildren(node) {
      if (!node.children) return;
      for (const c of node.children) {
        this.disposeChildren(c);
        if (c.mesh) { this.terra.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
        c.building = false;
      }
      node.children = null;
    }

    /* centerScene: body center in scene coords; t: UT; camScene: camera pos in scene */
    /* textured impostor sphere just below the terrain: covers build gaps, sagging
       coarse patches and the night limb with correct colors (kills "black shards"),
       and makes distant bodies look fully textured at any LOD */
    ensureGlobe() {
      if (this.body.star) return;
      /* rebuild if the bake was invalidated (site placement reshapes terrain) */
      const stamp = bakeStamp[this.body.id] || 0;
      if (this.globe && this.globeStamp === stamp) return;
      if (this.globe) {
        this.group.remove(this.globe);
        this.globe.geometry.dispose();
        if (this.globe.material.dispose) this.globe.material.dispose();
        this.globe = null;
      }
      if (!bakedTex[this.body.id]) bakeBodyTexture(this.body);
      this.globeStamp = stamp;
      const baked = bakeBodyTexture(this.body);
      let closeR = globeCloseRCache[this.body.id];
      if (closeR == null) {
        closeR = this.body.R;
        if (this.body.sampler) {
          const out = { h: 0, 0: 0, 1: 0, 2: 0, biome: 0 };
          const dir = new THREE.Vector3();
          const rng = U.mulberry32(this.body.R | 0);
          let minH = 0;
          for (let i = 0; i < 1200; i++) {
            dir.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
            if (dir.lengthSq() < 1e-4) continue;
            dir.normalize();
            this.body.sampler(dir, out, false);
            if (out.h < minH) minH = out.h;
          }
          closeR = this.body.R + minH - 800;
        }
        globeCloseRCache[this.body.id] = closeR;
      }
      this.globeCloseR = closeR;
      this.globeImpostorR = this.body.R;
      const mat = bodyGlobeMaterial(baked, 0.22);
      this.globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
      this.globe.scale.setScalar(this.globeImpostorR);
      this.globe.renderOrder = 0;
      this.globe.frustumCulled = false;
      this.group.add(this.globe);
    }

    setFrame(centerScene, t, camScene) {
      this.group.position.copy(centerScene);
      const ang = CEL.spinAngle(this.body, t);
      this.group.rotation.set(0, ang, 0);
      if (this.mat) this.mat.userData.u.ctr.value.copy(centerScene);
      if (this.oceanMat) this.oceanMat.userData.u.ctr.value.copy(centerScene);
      if (this.atmo) {
        this.atmo.position.copy(centerScene);
        this.atmo.material.uniforms.uCenter.value.copy(centerScene);
        const alt = Math.max(this.camBF.length() - this.body.R, 0);
        const ah = this.body.atmo.h;
        const fade = alt < ah * 0.12 ? 1
          : alt > ah * 1.05 ? 0
          : clamp(1 - (alt - ah * 0.12) / (ah * 0.93), 0, 1);
        this.atmo.material.uniforms.uAltFade.value = fade;
        this.atmo.visible = fade > 0.02;
      }
      if (this.cloudLayers.length) {
        for (let i = 0; i < this.cloudLayers.length; i++) {
          const sign = i % 2 ? -1 : 1;
          this.cloudLayers[i].mesh.rotation.y = t * 0.000011 * this.cloudLayers[i].spin * sign + i * 0.37;
          if (this.cloudLayers[i].mat.userData.u.center) {
            this.cloudLayers[i].mat.userData.u.center.value.copy(centerScene);
          }
        }
      }
      /* camera in body-fixed coords */
      this.camBF.copy(camScene).sub(centerScene);
      const c = Math.cos(-ang), s = Math.sin(-ang);
      const x = this.camBF.x * c + this.camBF.z * s, z = -this.camBF.x * s + this.camBF.z * c;
      this.camBF.x = x; this.camBF.z = z;
      if (this.cloudLayers.length) {
        const alt = Math.max(this.camAlt, 0);
        const ah = this.body.atmo.h;
        if (this.cloudMapMode) {
          for (let i = 0; i < this.cloudLayers.length; i++) {
            this.cloudLayers[i].mat.userData.u.opacity.value = MAP_CLOUD_OPS[i] || 0.5;
          }
        } else {
          /* thin near the surface so terrain isn't washed out; fuller in orbit / space */
          let mul = 0.82;
          if (alt < ah * 0.32) {
            mul *= 0.32 + 0.68 * (alt / (ah * 0.32));
          } else if (alt >= ah * 0.28) {
            mul *= clamp(0.92 + (alt - ah * 0.28) / (ah * 2.4), 0.92, 1.28);
          }
          const layerMul = [1, 0.68, 0.55];
          for (let i = 0; i < this.cloudLayers.length; i++) {
            this.cloudLayers[i].mat.userData.u.opacity.value = this.cloudLayers[i].baseOp * mul * (layerMul[i] || 0.5);
          }
        }
      }
    }
    setSun(sunDirScene) {
      if (this.atmo) this.atmo.material.uniforms.uSun.value.copy(sunDirScene);
      if (this.mat) this.mat.userData.u.sun.value.copy(sunDirScene);
      if (this.oceanMat) this.oceanMat.userData.u.sun.value.copy(sunDirScene);
      if (this.globe?.material?.userData?.u?.sun) this.globe.material.userData.u.sun.value.copy(sunDirScene);
      const viewN = this.camBF.clone().normalize();
      for (const cl of this.cloudLayers) {
        cl.mat.userData.u.sun.value.copy(sunDirScene);
        cl.mat.userData.u.view.value.copy(viewN);
        if (cl.mat.userData.u.center) cl.mat.userData.u.center.value.copy(this.group.position);
      }
      if (this.cloudMat && !this.cloudLayers.length) {
        this.cloudMat.userData.u.sun.value.copy(sunDirScene);
        this.cloudMat.userData.u.view.value.copy(viewN);
      }
      if (this.aurora) for (const a of this.aurora) a.material.uniforms.uSunA.value.copy(sunDirScene);
    }
    setCam(camera) {
      if (!this.atmo) return;
      camera.updateMatrixWorld();
      this.atmo.material.uniforms.uInvPV.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
      if (window.GAME && GAME.renderer) {
        const vp = this.atmo.material.uniforms.uViewport.value;
        GAME.renderer.getDrawingBufferSize(vp);
      }
    }

    update(budgetMs = 5) {
      this.ensureGlobe();
      const camAlt = Math.max(this.camBF.length() - this.body.R, 2);
      this.camAlt = camAlt;
      /* margin: mountains can poke above the geometric horizon from beyond it */
      this.horizonDist = Math.sqrt(camAlt * (camAlt + 2 * this.body.R)) + Math.sqrt(2 * this.body.R * 2500);
      /* baked globe above mid-altitude; full quadtree only near the surface for landing */
      const globeOnly = camAlt > surfaceLodAlt(this.body);
      this.impostor = globeOnly;
      if (this.globe) {
        this.globe.visible = true;
        const r = globeOnly ? (this.globeImpostorR ?? this.body.R) : (this.globeCloseR ?? this.body.R);
        this.globe.scale.setScalar(r);
        this.globe.renderOrder = globeOnly ? 0 : -2;
      }
      if (this.terra) this.terra.visible = !globeOnly;
      if (globeOnly) {
        for (const n of this.buildQueue) n.building = false;
        this.buildQueue.length = 0;
        return;
      }
      if (this.roots) {
        for (const r of this.roots) {
          if (!r.mesh && !r.building) this.requestBuild(r);
          this.updateNode(r);
        }
      }
      if (this.oceanRoots) {
        for (const r of this.oceanRoots) {
          if (!r.mesh && !r.building) this.requestBuild(r);
          this.updateNode(r);
        }
      }
      const t0 = performance.now();
      /* breadth-first: complete coarse levels before refining (hides stale ancestors fast) */
      if (this.buildQueue.length > 1) {
        if (this.buildQueue.length > 400) this.buildQueue.sort((a, b) => a.level - b.level);
        else this.buildQueue.sort((a, b) => (a.level - b.level) || (this.camBF.distanceTo(a.center) - this.camBF.distanceTo(b.center)));
      }
      const buildCap = this.buildQueue.length > 600 ? Math.min(budgetMs, 2.5) : budgetMs;
      while (this.buildQueue.length && performance.now() - t0 < buildCap) {
        const n = this.buildQueue.shift();
        if (!n.building) continue;
        this.buildPatch(n);
      }
    }

    dispose() {
      const killNode = n => { if (!n) return; this.disposeChildren(n); if (n.mesh) { this.terra.remove(n.mesh); n.mesh.geometry.dispose(); } };
      if (this.roots) for (const r of this.roots) killNode(r);
      if (this.oceanRoots) for (const r of this.oceanRoots) killNode(r);
      this.scene.remove(this.group);
      if (this.atmo) { this.scene.remove(this.atmo); this.atmo.geometry.dispose(); this.atmo.material.dispose(); }
      if (this.globe) { this.globe.geometry.dispose(); if (this.globe.material.dispose) this.globe.material.dispose(); }
      this.terra.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
  }
  /* ===================== aurora ovals ===================== */
  function auroraMesh(body, pole) {
    /* lat band near the magnetic pole; animated curtains via shader */
    const t0 = pole > 0 ? 0.24 : Math.PI - 0.40;
    const geo = new THREE.SphereGeometry(body.R * 1.018, 96, 10, 0, Math.PI * 2, t0, 0.16);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uT: oceanTime, uSunA: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv; varying vec3 vN;
        void main(){
          vUv = uv; vN = normalize(mat3(modelMatrix) * position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        varying vec2 vUv; varying vec3 vN;
        uniform float uT; uniform vec3 uSunA;
        float ah(float p){ return fract(sin(p * 127.1) * 43758.5453); }
        float an(float p){ float i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(ah(i), ah(i+1.0), f); }
        void main(){
          #include <logdepthbuf_fragment>
          float lon = vUv.x * 40.0;
          /* drifting curtain stripes at two scales */
          float c1 = an(lon * 2.0 + uT * 0.10);
          float c2 = an(lon * 7.0 - uT * 0.23);
          float band = smoothstep(0.35, 0.95, c1 * 0.65 + c2 * 0.55);
          float edge = sin(vUv.y * 3.14159);
          float night = clamp(-dot(normalize(vN), uSunA) * 2.0 + 0.4, 0.0, 1.0);
          vec3 col = mix(vec3(0.1, 0.9, 0.45), vec3(0.5, 0.25, 0.9), vUv.y) * band * edge;
          gl_FragColor = vec4(col * night * 0.85, band * edge * night * 0.8);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 4;
    m.frustumCulled = false;
    return m;
  }

  /* ===================== baked global textures (map / globes / telescope) ===================== */
  const bakedTex = {};
  const bakeStamp = {};                 // bumped when a body's bake is invalidated
  const globeCloseRCache = {};
  let lastBakeAt = 0;
  /* the terrain sampler changed (e.g. a launch site was founded): re-bake everything
     that uses the old texture or stale square patches appear on the globe/map */
  function invalidateBake(bodyId) {
    if (bakedTex[bodyId]) {
      if (bakedTex[bodyId].map) bakedTex[bodyId].map.dispose();
      if (bakedTex[bodyId].night) bakedTex[bodyId].night.dispose();
      delete bakedTex[bodyId];
    }
    delete globeCloseRCache[bodyId];
    bakeStamp[bodyId] = (bakeStamp[bodyId] || 0) + 1;
  }
  let _prebakeList = null, _prebakeI = 0;
  function prebakeBodies(budgetMs = 16) {
    if (!_prebakeList) _prebakeList = CEL.list.filter(b => !b.star);
    const t0 = performance.now();
    while (_prebakeI < _prebakeList.length && performance.now() - t0 < budgetMs) {
      bakeBodyTexture(_prebakeList[_prebakeI++]);
    }
    return { done: _prebakeI >= _prebakeList.length, progress: _prebakeI / _prebakeList.length };
  }

  function bakeBodyTexture(body, w = 0) {
    if (bakedTex[body.id]) return bakedTex[body.id];
    if (body.gas) { bakedTex[body.id] = { map: gasTexture(body) }; return bakedTex[body.id]; }
    if (body.star) { bakedTex[body.id] = { map: sunSurfaceTexture(w || 512) }; return bakedTex[body.id]; }
    if (!body.sampler) {
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const x = c.getContext('2d'); x.fillStyle = '#888';
      x.fillRect(0, 0, 8, 8);
      bakedTex[body.id] = { map: new THREE.CanvasTexture(c) };
      return bakedTex[body.id];
    }
    const W = w || (body.id === 'gaia' ? 1536 : 1024), H = W / 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const out = { h: 0, 0: 0, 1: 0, 2: 0, biome: 0 };
    const dir = new THREE.Vector3();
    const oc = body.ocean && body.ocean.col;
    const night = body.id === 'gaia' ? document.createElement('canvas') : null;
    let nctx = null, nimg = null;
    if (night) { night.width = W; night.height = H; nctx = night.getContext('2d'); nimg = nctx.createImageData(W, H); }
    const nz = U.Simplex(777);
    /* full-octave sampling for the home world: it's the texture players stare at */
    const lowDetail = body.id !== 'gaia';
    const airless = !body.atmo && !body.ocean;
    const outN = { h: 0, 0: 0, 1: 0, 2: 0 };
    const dirN = new THREE.Vector3();
    const eps = 0.0012;
    for (let y = 0; y < H; y++) {
      const lat = (0.5 - y / H) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let x = 0; x < W; x++) {
        const lon = (x / W) * Math.PI * 2 - Math.PI;
        dir.set(cl * Math.cos(lon), sl, -cl * Math.sin(lon));
        body.sampler(dir, out, lowDetail);
        const i = (y * W + x) * 4;
        let r = out[0], g = out[1], b = out[2];
        if (airless) {
          const lon2 = lon + eps, lat2 = lat + eps;
          const cl2 = Math.cos(lat2), sl2 = Math.sin(lat2);
          dirN.set(cl2 * Math.cos(lon2), sl2, -cl2 * Math.sin(lon2));
          body.sampler(dirN, outN, true);
          const hx = outN.h - out.h;
          dirN.set(cl * Math.cos(lon), sl2, -cl * Math.sin(lon));
          body.sampler(dirN, outN, true);
          const hy = outN.h - out.h;
          const shade = clamp(0.62 + hx * 0.00035 + hy * 0.00028, 0.42, 1.08);
          r *= shade; g *= shade; b *= shade;
        }
        if (out.h <= 0 && oc) {
          const deep = clamp(-out.h / 2200, 0, 1);
          r = lerp(oc[0] * 1.7, oc[0] * 0.55, deep);
          g = lerp(oc[1] * 1.7, oc[1] * 0.55, deep);
          b = lerp(oc[2] * 1.45, oc[2] * 0.62, deep);
        }
        d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; d[i + 3] = 255;
        if (nimg && out.h > 2 && out.h < 600) {
          const settle = U.fbm(nz, dir.x * 9, dir.y * 9, dir.z * 9, 2);
          if (settle > 0.21) {
            const v = clamp((settle - 0.21) * 8, 0, 1) * (0.4 + 0.6 * ((U.hash3(x, y, 7) * 9301) % 1));
            const dim = v * 0.12;
            nimg.data[i] = 255 * dim; nimg.data[i + 1] = 190 * dim; nimg.data[i + 2] = 110 * dim; nimg.data[i + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const entry = { map: new THREE.CanvasTexture(c) };
    if (nctx) { nctx.putImageData(nimg, 0, 0); entry.night = new THREE.CanvasTexture(night); }
    bakedTex[body.id] = entry;
    return entry;
  }

  /* ===================== stars v4: KSP-style field — crisp points + milky-way haze ===================== */
  const starPointVert = `
    attribute float aSize;
    attribute vec3 color;
    varying vec3 vCol;
    void main() {
      vCol = color;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize;
      gl_Position = projectionMatrix * mv;
    }`;
  const starPointFrag = `
    uniform float uDim;
    uniform sampler2D uTex;
    varying vec3 vCol;
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      if (dot(uv, uv) > 0.25) discard;
      float soft = texture2D(uTex, gl_PointCoord).r;
      float a = soft * (1.0 - uDim);
      gl_FragColor = vec4(vCol, a);
    }`;
  const starHazeFrag = `
    uniform float uDim;
    uniform sampler2D uTex;
    varying vec3 vCol;
    void main() {
      float soft = texture2D(uTex, gl_PointCoord).r;
      float a = soft * 0.22 * (1.0 - uDim);
      gl_FragColor = vec4(vCol, a);
    }`;
  function starPointMat(tex, haze = false) {
    return new THREE.ShaderMaterial({
      uniforms: { uDim: { value: 0 }, uTex: { value: tex } },
      vertexShader: starPointVert, fragmentShader: haze ? starHazeFrag : starPointFrag,
      transparent: true, depthWrite: false, fog: false,
      blending: haze ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
  class Stars {
    constructor(scene, count = 24000) {
      const starTex = glowTex([
        [0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,1)'],
        [0.35, 'rgba(245,248,255,0.55)'], [1, 'rgba(230,235,245,0)'],
      ], 32);
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sizes = new Float32Array(count);
      const rng = U.mulberry32(90210);
      const v = new THREE.Vector3();
      const galTilt = new THREE.Vector3(1, 0, 0.22).normalize();
      for (let i = 0; i < count; i++) {
        const inBand = rng() < 0.48;
        if (inBand) {
          const a = rng() * Math.PI * 2;
          const spread = (rng() + rng() + rng() - 1.5) * 0.11;
          v.set(Math.cos(a), spread, Math.sin(a)).normalize().applyAxisAngle(galTilt, 0.82);
        } else {
          v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
        }
        const R = 8.5e11;
        pos[i * 3] = v.x * R; pos[i * 3 + 1] = v.y * R; pos[i * 3 + 2] = v.z * R;
        const mag = rng() * rng() * rng();
        const temp = rng();
        let r = 0.96, g = 0.97, b = 1.0;
        if (temp < 0.07) { r = 1.0; g = 0.78; b = 0.62; }
        else if (temp > 0.93) { r = 0.72; g = 0.8; b = 1.0; }
        const bandBoost = inBand ? 1.12 : 1.0;
        const bright = (0.42 + mag * 0.95) * bandBoost;
        col[i * 3] = r * bright; col[i * 3 + 1] = g * bright; col[i * 3 + 2] = b * bright;
        sizes[i] = 0.55 + mag * mag * 2.4 + (mag > 0.88 ? 1.1 : 0);
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      this.mat = starPointMat(starTex);
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = -100;
      scene.add(this.points);
      const hazeN = 7500;
      const hg = new THREE.BufferGeometry();
      const hpos = new Float32Array(hazeN * 3), hcol = new Float32Array(hazeN * 3), hsizes = new Float32Array(hazeN);
      const brng = U.mulberry32(7777);
      const hazeTex = glowTex([
        [0, 'rgba(255,248,240,0.35)'], [0.25, 'rgba(230,225,255,0.18)'], [1, 'rgba(200,210,255,0)'],
      ], 64);
      const dv = new THREE.Vector3();
      for (let i = 0; i < hazeN; i++) {
        const a = brng() * Math.PI * 2;
        const spread = (brng() + brng() - 1) * 0.18;
        dv.set(Math.cos(a), spread, Math.sin(a)).normalize().applyAxisAngle(galTilt, 0.82);
        const core = Math.abs(U.wrapPi(a - 2.05)) < 0.7 - Math.abs(spread) * 1.5;
        const b = (core ? 0.38 : 0.16) * (0.5 + brng() * 0.5);
        hcol[i * 3] = 0.92 * b; hcol[i * 3 + 1] = 0.88 * b; hcol[i * 3 + 2] = 0.82 * b;
        hsizes[i] = core ? 2.8 + brng() * 3.2 : 1.4 + brng() * 2.0;
        const R = 8.0e11;
        hpos[i * 3] = dv.x * R; hpos[i * 3 + 1] = dv.y * R; hpos[i * 3 + 2] = dv.z * R;
      }
      hg.setAttribute('position', new THREE.BufferAttribute(hpos, 3));
      hg.setAttribute('color', new THREE.BufferAttribute(hcol, 3));
      hg.setAttribute('aSize', new THREE.BufferAttribute(hsizes, 1));
      this.dustMat = starPointMat(hazeTex, true);
      this.sky = new THREE.Points(hg, this.dustMat);
      this.sky.frustumCulled = false;
      this.sky.renderOrder = -101;
      scene.add(this.sky);
      this.nebulae = [];
    }
    update(camPos, dim = 0) {
      this.points.position.copy(camPos);
      this.sky.position.copy(camPos);
      this.mat.uniforms.uDim.value = clamp(dim, 0, 1);
      this.dustMat.uniforms.uDim.value = clamp(dim * 1.2, 0, 1);
    }
  }
  function smoothstep_(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* photographic puff lobe — dense core, soft falloff, low-frequency billow only */
  function cloudLobeTexture(seed, size = 256) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const n = U.Simplex(seed), n2 = U.Simplex(seed + 29);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const dx = u - 0.5, dy = v - 0.5;
        const dist = Math.hypot(dx, dy);
        const core = Math.pow(clamp(1 - dist / 0.46, 0, 1), 1.35);
        const billow = U.fbm(n, u * 2.8 + 0.2, v * 2.8, 0.42, 4);
        const detail = U.fbm(n2, u * 5.5, v * 5.5, 0.55, 2) * 0.22;
        let a = core * (0.78 + billow * 0.28 + detail);
        a *= smoothstep_(0.52, 0.12, dist);
        a = Math.pow(clamp(a, 0, 1), 0.88);
        const i = (y * size + x) * 4;
        const g = 238 + billow * 14;
        d[i] = g; d[i + 1] = g + 4; d[i + 2] = 255; d[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }

  /* formation layouts: dozens of overlapping lobes per cloud mass */
  const CLOUD_FORMATIONS = ['cumulus', 'stratus', 'tower', 'fair'];
  function sampleEllipsoid(rng, ex, ey, ez) {
    const phi = Math.acos(2 * rng() - 1);
    const th = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 0.38);
    return [
      r * Math.sin(phi) * Math.cos(th) * ex,
      r * Math.cos(phi) * ey,
      r * Math.sin(phi) * Math.sin(th) * ez,
    ];
  }

  function layoutCloudLobes(type, rng, lobes, lobeTex, shadowTex) {
    const counts = { cumulus: 54, stratus: 58, tower: 52, fair: 46 };
    const nL = counts[type] || 52;
    const scales = { cumulus: [480, 920], stratus: [620, 1180], tower: [440, 860], fair: [400, 740] };
    const ell = {
      cumulus: [1.05, 0.72, 1.0],
      stratus: [1.45, 0.28, 1.1],
      tower: [0.62, 1.55, 0.62],
      fair: [0.95, 0.55, 0.95],
    }[type] || [1, 1, 1];
    const [sMin, sMax] = scales[type] || scales.cumulus;
    for (let L = 0; L < nL; L++) {
      const shadow = L > nL * 0.58;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: shadow ? shadowTex : lobeTex[L % lobeTex.length], transparent: true, depthWrite: false, opacity: 0,
        blending: THREE.NormalBlending, color: shadow ? 0xb8c4d4 : 0xffffff,
      }));
      s.center.set(0.5, 0.48);
      const [lx, ly, lz] = sampleEllipsoid(rng, ell[0], ell[1], ell[2]);
      s.position.set(lx, ly, lz);
      const overlap = 1.08 + rng() * 0.22;
      s.userData.lobeScale = (sMin + rng() * (sMax - sMin)) * overlap;
      s.material.rotation = rng() * Math.PI * 2;
      s.visible = false;
      lobes.push(s);
    }
    return lobes;
  }

  /* ===================== volumetric cloud field (body-fixed formations, not flat shells) ===================== */
  class CloudPuffs {
    constructor(count = 18) {
      this.lobeTex = [cloudLobeTexture(41), cloudLobeTexture(73), cloudLobeTexture(109), cloudLobeTexture(151)];
      this.shadowTex = cloudLobeTexture(199, 200);
      this.puffs = [];
      this.group = new THREE.Group();
      this.planetGroup = null;
      this.anchorRad = null;
      this._pos = new THREE.Vector3();
      this._e = new THREE.Vector3();
      this._nv = new THREE.Vector3();
      this._yUp = new THREE.Vector3(0, 1, 0);
      this._q = new THREE.Quaternion();
      for (let i = 0; i < count; i++) {
        const cluster = new THREE.Group();
        const rng = U.mulberry32(i * 131 + 7);
        const fType = CLOUD_FORMATIONS[i % CLOUD_FORMATIONS.length];
        const lobes = layoutCloudLobes(fType, rng, [], this.lobeTex, this.shadowTex);
        for (const s of lobes) cluster.add(s);
        cluster.visible = false;
        this.group.add(cluster);
        this.puffs.push({ cluster, lobes, seed: i * 17.31, fType });
      }
    }
    attachTo(planetGroup) {
      if (this.planetGroup === planetGroup) return;
      if (this.planetGroup) this.planetGroup.remove(this.group);
      this.planetGroup = planetGroup;
      planetGroup.add(this.group);
      this.anchorRad = null;
    }
    tangentBasis(radial, eOut, nvOut) {
      const up = radial;
      if (Math.abs(up.y) < 0.93) eOut.set(0, 1, 0).cross(up).normalize();
      else eOut.set(1, 0, 0).cross(up).normalize();
      nvOut.crossVectors(up, eOut);
    }
    update(camBF, bodyR, camAlt, dayF, dt) {
      const show = camAlt > 700 && camAlt < 26000;
      this.group.visible = show;
      if (!show) return;
      const radial = this._pos.copy(camBF).normalize();
      if (!this.anchorRad || this.anchorRad.angleTo(radial) > 0.09) {
        if (!this.anchorRad) this.anchorRad = new THREE.Vector3();
        this.anchorRad.copy(radial);
        const rng = U.mulberry32((Math.abs(radial.x * 91.3 + radial.y * 53.7 + radial.z * 17.2) * 1e5 | 0) % 1e9);
        const e = this._e, nv = this._nv;
        this.tangentBasis(this.anchorRad, e, nv);
        for (const p of this.puffs) {
          const ang = rng() * Math.PI * 2;
          const dist = 2800 + rng() * rng() * 12000;
          let alt = 2400 + rng() * rng() * 7000;
          if (p.fType === 'tower') alt += 1200 + rng() * 2500;
          if (p.fType === 'stratus') alt = 1800 + rng() * rng() * 3200;
          p.bfBase = new THREE.Vector3()
            .copy(this.anchorRad).multiplyScalar(bodyR + alt)
            .addScaledVector(e, Math.cos(ang) * dist)
            .addScaledVector(nv, Math.sin(ang) * dist);
          p.alpha = 0.42 + rng() * 0.48;
          p.driftE = (rng() - 0.5) * 9;
          p.driftN = (rng() - 0.5) * 9;
          p.driftU = (rng() - 0.5) * 1.2;
          p.t = rng() * 100;
          p.windPhase = rng() * 6.28;
          p.windSpd = 0.35 + rng() * 0.55;
        }
      }
      const e = this._e, nv = this._nv;
      this.tangentBasis(this.anchorRad, e, nv);
      for (const p of this.puffs) {
        if (!p.bfBase) continue;
        p.t += dt;
        const upLocal = p.bfBase.clone().normalize();
        this._q.setFromUnitVectors(this._yUp, upLocal);
        p.cluster.quaternion.copy(this._q);
        const wind = Math.sin(p.t * 0.06 + p.windPhase) * 0.5 + 0.5;
        const pos = this._pos.copy(p.bfBase)
          .addScaledVector(e, p.driftE * p.t * 0.28 * p.windSpd + wind * 55)
          .addScaledVector(nv, p.driftN * p.t * 0.24 * p.windSpd + wind * 42)
          .addScaledVector(this.anchorRad, p.driftU * Math.sin(p.t * 0.04) * 28);
        p.cluster.position.copy(pos);
        const camDist = pos.distanceTo(camBF);
        const fade = clamp(1 - camDist / 22000, 0, 1) * clamp(camDist / 700 - 0.03, 0, 1);
        const breathe = 1 + Math.sin(p.t * 0.022 + p.seed) * 0.07 + Math.sin(p.t * 0.051 + p.seed * 1.2) * 0.04;
        const op = p.alpha * fade * (0.55 + dayF * 0.82);
        p.cluster.visible = op > 0.02;
        if (!p.cluster.visible) continue;
        const formScale = p.fType === 'stratus' ? 1.42 : p.fType === 'tower' ? 1.18 : 1.05;
        for (let L = 0; L < p.lobes.length; L++) {
          const s = p.lobes[L];
          s.visible = true;
          const lf = L / p.lobes.length;
          const lsc = s.userData.lobeScale * formScale * breathe * (0.92 + Math.sin(p.seed + L * 1.6 + p.t * 0.035) * 0.08);
          s.scale.set(lsc * 1.02, lsc * 0.86, 1);
          s.material.rotation += dt * 0.006 * (L % 2 ? 1 : -1);
          const lobeOp = op * (0.68 + (1 - lf) * 0.28) * (0.92 + Math.sin(p.t * 0.05 + L * 1.4) * 0.08);
          s.material.opacity = clamp(lobeOp, 0, 0.92);
        }
      }
    }
  }

  /* ===================== ground scatter: trees + rocks (instanced) ===================== */
  function mergedGeo(parts) {
    /* parts: [geo, color[3], dx, dy, dz, scale] merged with vertex colors
       (handles both indexed and non-indexed geometries, e.g. IcosahedronGeometry) */
    const pos = [], col = [], nrm = [];
    for (const [geo, c, dx, dy, dz, s] of parts) {
      const p = geo.attributes.position, n = geo.attributes.normal;
      const count = geo.index ? geo.index.count : p.count;
      for (let i = 0; i < count; i++) {
        const k = geo.index ? geo.index.getX(i) : i;
        pos.push(p.getX(k) * (s || 1) + (dx || 0), p.getY(k) * (s || 1) + (dy || 0), p.getZ(k) * (s || 1) + (dz || 0));
        nrm.push(n.getX(k), n.getY(k), n.getZ(k));
        col.push(c[0], c[1], c[2]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  function treeGeometry() {
    return mergedGeo([
      [new THREE.CylinderGeometry(0.12, 0.22, 1.8, 6), [0.28, 0.18, 0.1], 0, 0.9, 0],
      [new THREE.ConeGeometry(1.6, 2.8, 7), [0.1, 0.28, 0.09], 0, 2.6, 0],
      [new THREE.ConeGeometry(1.2, 2.4, 7), [0.14, 0.34, 0.11], 0, 4.2, 0],
      [new THREE.ConeGeometry(0.75, 1.6, 6), [0.18, 0.4, 0.13], 0, 5.6, 0],
    ]);
  }
  function broadleafGeometry() {
    return mergedGeo([
      [new THREE.CylinderGeometry(0.14, 0.28, 2.4, 6), [0.32, 0.21, 0.12], 0, 1.2, 0],
      [new THREE.IcosahedronGeometry(1.8, 1), [0.18, 0.4, 0.13], 0, 3.5, 0],
      [new THREE.IcosahedronGeometry(1.35, 1), [0.24, 0.48, 0.16], 0.95, 2.8, 0.55],
      [new THREE.IcosahedronGeometry(1.1, 1), [0.14, 0.34, 0.11], -0.85, 3.0, -0.45],
      [new THREE.IcosahedronGeometry(0.85, 0), [0.2, 0.38, 0.14], 0.4, 4.2, -0.3],
    ]);
  }
  function bushGeometry() {
    return mergedGeo([
      [new THREE.IcosahedronGeometry(0.95, 0), [0.16, 0.36, 0.12], 0, 0.55, 0],
      [new THREE.IcosahedronGeometry(0.7, 0), [0.2, 0.42, 0.14], 0.55, 0.45, 0.35],
      [new THREE.IcosahedronGeometry(0.6, 0), [0.14, 0.32, 0.1], -0.45, 0.5, -0.25],
      [new THREE.CylinderGeometry(0.06, 0.1, 0.5, 4), [0.3, 0.2, 0.11], 0, 0.25, 0],
    ]);
  }
  function grassGeometry() {
    const mk = (rot, hue, h) => {
      const p = new THREE.PlaneGeometry(0.42, h || 0.55);
      p.translate(0, (h || 0.55) * 0.5, 0);
      p.rotateY(rot);
      return p;
    };
    return mergedGeo([
      [mk(0, 0, 0.5), [0.3, 0.44, 0.17], 0, 0, 0],
      [mk(Math.PI / 2, 0, 0.48), [0.36, 0.5, 0.19], 0, 0, 0],
      [mk(Math.PI / 4, 0, 0.42), [0.28, 0.4, 0.16], 0.05, 0, 0.02],
      [mk(-Math.PI / 4, 0, 0.38), [0.34, 0.48, 0.18], -0.04, 0, -0.02],
      [mk(Math.PI / 3, 0, 0.35), [0.32, 0.46, 0.17], 0.03, 0, -0.03],
    ]);
  }
  function flowerGeometry() {
    const mk = (rot, c) => {
      const p = new THREE.PlaneGeometry(0.22, 0.22);
      p.translate(0, 0.14, 0);
      p.rotateY(rot);
      return [p, c, 0, 0, 0];
    };
    return mergedGeo([
      mk(0, [0.92, 0.42, 0.52]),
      mk(Math.PI / 2, [0.95, 0.78, 0.28]),
      mk(Math.PI / 4, [0.72, 0.48, 0.92]),
      [new THREE.CylinderGeometry(0.02, 0.03, 0.22, 4), [0.22, 0.38, 0.14], 0, 0.11, 0],
    ]);
  }
  function reedGeometry() {
    return mergedGeo([
      [new THREE.CylinderGeometry(0.03, 0.05, 1.4, 4), [0.34, 0.42, 0.22], 0, 0.7, 0],
      [new THREE.CylinderGeometry(0.025, 0.035, 1.1, 4), [0.38, 0.46, 0.24], 0.12, 0.55, 0.08],
      [new THREE.SphereGeometry(0.14, 5, 4), [0.42, 0.5, 0.26], 0, 1.38, 0],
      [new THREE.SphereGeometry(0.1, 5, 4), [0.4, 0.48, 0.25], 0.1, 1.28, 0.06],
    ]);
  }
  function stumpGeometry() {
    return mergedGeo([
      [new THREE.CylinderGeometry(0.35, 0.42, 0.45, 6), [0.34, 0.24, 0.14], 0, 0.22, 0],
      [new THREE.CylinderGeometry(0.42, 0.48, 0.08, 6), [0.42, 0.32, 0.18], 0, 0.48, 0],
      [new THREE.ConeGeometry(0.18, 0.35, 5), [0.16, 0.32, 0.11], 0.22, 0.12, 0.15],
    ]);
  }
  function distantTreeGeometry() {
    return mergedGeo([
      [new THREE.CylinderGeometry(0.08, 0.14, 1.2, 4), [0.3, 0.2, 0.11], 0, 0.6, 0],
      [new THREE.ConeGeometry(1.1, 2.4, 5), [0.12, 0.3, 0.1], 0, 2.0, 0],
    ]);
  }
  function cityBuildingGeometry() {
    return mergedGeo([
      [new THREE.BoxGeometry(1, 1, 1), [0.52, 0.55, 0.58], 0, 0.5, 0],
      [new THREE.BoxGeometry(0.5, 0.32, 0.5), [0.48, 0.51, 0.55], 0.26, 1.14, 0.18],
      [new THREE.BoxGeometry(0.38, 0.24, 0.38), [0.46, 0.49, 0.53], -0.22, 1.32, -0.16],
      [new THREE.BoxGeometry(0.22, 0.55, 0.22), [0.44, 0.47, 0.5], 0.05, 1.55, 0.05],
    ]);
  }
  function boatGeometry() {
    const pos = [], col = [], nrm = [];
    const push = (geo, c, dx, dy, dz, s = 1, rx = 0) => {
      geo.rotateX(rx);
      const p = geo.attributes.position, n = geo.attributes.normal;
      const idx = geo.index;
      for (let i = 0; i < idx.count; i++) {
        const k = idx.getX(i);
        pos.push(p.getX(k) * s + dx, p.getY(k) * s + dy, p.getZ(k) * s + dz);
        nrm.push(n.getX(k), n.getY(k), n.getZ(k));
        col.push(c[0], c[1], c[2]);
      }
    };
    /* hull + cabin + sail */
    push(new THREE.CylinderGeometry(1.4, 0.7, 5.5, 7), [0.85, 0.88, 0.9], 0, 0.6, 0, 1, Math.PI / 2);
    push(new THREE.BoxGeometry(1.6, 1.0, 1.8), [0.45, 0.5, 0.55], 0, 1.5, -0.4);
    push(new THREE.ConeGeometry(1.6, 4.2, 4), [0.95, 0.95, 0.92], 0, 3.6, 0.8, 0.6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  class Scatter {
    constructor(view) {
      this.view = view;
      const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 0.95, flatShading: true });
      const boatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
      const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, alphaTest: 0 });
      /* city blocks: gray towers with window strips that light at night */
      const cityTex = (() => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const x = c.getContext('2d');
        x.fillStyle = '#11181f'; x.fillRect(0, 0, 64, 64);
        const rng = U.mulberry32(99);
        for (let ry = 4; ry < 64; ry += 9) for (let rx = 4; rx < 64; rx += 8) {
          x.fillStyle = rng() < 0.6 ? '#ffdf9e' : '#141c24';
          x.fillRect(rx, ry, 4, 5);
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
      })();
      this.cityMat = new THREE.MeshStandardMaterial({ color: 0x8d9499, roughness: 0.85, emissive: 0xffffff, emissiveMap: cityTex, emissiveIntensity: 0 });
      this.trees = new THREE.InstancedMesh(treeGeometry(), treeMat, 720);
      this.trees2 = new THREE.InstancedMesh(broadleafGeometry(), treeMat, 480);
      this.bushes = new THREE.InstancedMesh(bushGeometry(), treeMat, 640);
      this.grass = new THREE.InstancedMesh(grassGeometry(), grassMat, 1400);
      this.rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.85, 0), rockMat, 380);
      this.boats = new THREE.InstancedMesh(boatGeometry(), boatMat, 48);
      this.cities = new THREE.InstancedMesh(cityBuildingGeometry(), this.cityMat, 480);
      this.flowers = new THREE.InstancedMesh(flowerGeometry(), treeMat, 520);
      this.reeds = new THREE.InstancedMesh(reedGeometry(), treeMat, 280);
      this.stumps = new THREE.InstancedMesh(stumpGeometry(), treeMat, 180);
      this.distant = new THREE.InstancedMesh(distantTreeGeometry(), treeMat, 420);
      this.all = [this.trees, this.trees2, this.bushes, this.grass, this.rocks, this.boats, this.cities,
        this.flowers, this.reeds, this.stumps, this.distant];
      for (const m of this.all) { m.castShadow = m !== this.grass && m !== this.flowers; m.count = 0; m.frustumCulled = false; view.group.add(m); }
      this.lastAnchor = new THREE.Vector3(1e12, 0, 0);
      this.lastGrassAnchor = new THREE.Vector3(1e12, 0, 0);
      this.lastMidAnchor = new THREE.Vector3(1e12, 0, 0);
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
      this._p = new THREE.Vector3(); this._up = new THREE.Vector3();
      this.out = { h: 0, 0: 0, 1: 0, 2: 0, biome: 0 };
      this.cityNoise = U.Simplex(777);                 // matches the night-light bake clustering
    }
    /* camBF: camera in body-fixed frame; dayF lights city windows at night */
    update(camBF, camAlt, dayF = 1) {
      const body = this.view.body;
      const vis = camAlt < 22000 && !!body.sampler;
      const near = camAlt < 1400;
      const mid = camAlt < 5500;
      for (const m of this.all) m.visible = vis;
      this.grass.visible = vis && camAlt < 3200;
      this.flowers.visible = vis && near;
      this.reeds.visible = vis && near;
      this.stumps.visible = vis && near;
      this.distant.visible = vis && mid;
      this.cityMat.emissiveIntensity = (1 - U.clamp(dayF * 2.2, 0, 1)) * 1.45 + 0.03;
      if (!vis) return;
      /* NOTE: dedicated vectors only — aliasing the scratch here once random-walked
         the whole forest across the planet */
      const anchor = new THREE.Vector3().copy(camBF).normalize().multiplyScalar(body.R);
      const anchorDir = this._p.copy(anchor).normalize();
      body.sampler(anchorDir, this.out, true);
      const overWater = body.ocean && this.out.h < -30;
      const isGaia = body.id === 'gaia';
      const lowSample = true;
      const dirV = new THREE.Vector3(), posV = new THREE.Vector3(), axV = new THREE.Vector3();
      const Y = new THREE.Vector3(0, 1, 0);
      const tangent = (up, eOut, nvOut) => {
        if (Math.abs(up.y) < 0.93) eOut.set(0, 1, 0).cross(up).normalize();
        else eOut.set(1, 0, 0).cross(up).normalize();
        nvOut.crossVectors(up, eOut);
      };
      /* dense grass ring rebuilds more often, in a tight radius */
      if (isGaia && camAlt < 3200 && anchor.distanceTo(this.lastGrassAnchor) > 110) {
        this.lastGrassAnchor.copy(anchor);
        const rng = U.mulberry32((Math.abs(anchor.x * 3.1 + anchor.z * 9.7) | 0) % 1e9);
        const up = new THREE.Vector3().copy(anchor).normalize();
        const e = new THREE.Vector3(), nv = new THREE.Vector3();
        tangent(up, e, nv);
        let gi = 0, fi = 0;
        for (let i = 0; i < 2800 && (gi < 1400 || fi < 520); i++) {
          const ang = rng() * Math.PI * 2, rad = 8 + Math.pow(rng(), 0.58) * 680;
          dirV.copy(anchor).addScaledVector(e, Math.cos(ang) * rad).addScaledVector(nv, Math.sin(ang) * rad).normalize();
          body.sampler(dirV, this.out, lowSample);
          const b = this.out.biome;
          if (this.out.h < 2) continue;
          this._q.setFromUnitVectors(Y, this._p.copy(dirV));
          const spin = new THREE.Quaternion().setFromAxisAngle(Y, rng() * 6.28);
          this._q.multiply(spin);
          posV.copy(dirV).multiplyScalar(body.R + this.out.h - 0.02);
          if ((b === 2 || b === 11 || b === 12 || b === 3 || b === 9) && gi < 1400) {
            this._m.compose(posV, this._q, this._s.setScalar(0.55 + rng() * 1.25));
            this.grass.setMatrixAt(gi++, this._m);
          }
          if (near && (b === 2 || b === 11 || b === 12) && this.out.h < 120 && fi < 520 && rng() < 0.22) {
            this._m.compose(posV, this._q, this._s.setScalar(0.7 + rng() * 1.4));
            this.flowers.setMatrixAt(fi++, this._m);
          }
        }
        this.grass.count = gi;
        this.flowers.count = fi;
        this.grass.instanceMatrix.needsUpdate = true;
        this.flowers.instanceMatrix.needsUpdate = true;
      } else if (camAlt >= 3200) {
        this.grass.count = 0;
        this.flowers.count = 0;
      }
      /* mid-range tree line impostors */
      if (isGaia && mid && anchor.distanceTo(this.lastMidAnchor) > 420) {
        this.lastMidAnchor.copy(anchor);
        const rng = U.mulberry32((Math.abs(anchor.x * 5.7 + anchor.z * 2.3) | 0) % 1e9);
        const up = new THREE.Vector3().copy(anchor).normalize();
        const e = new THREE.Vector3(), nv = new THREE.Vector3();
        tangent(up, e, nv);
        let di = 0;
        for (let i = 0; i < 1200 && di < 420; i++) {
          const ang = rng() * Math.PI * 2, rad = 380 + Math.pow(rng(), 0.5) * 4200;
          dirV.copy(anchor).addScaledVector(e, Math.cos(ang) * rad).addScaledVector(nv, Math.sin(ang) * rad).normalize();
          body.sampler(dirV, this.out, lowSample);
          const b = this.out.biome;
          if (this.out.h < 4 || !(b === 3 || b === 7 || b === 15 || b === 2 || b === 12)) continue;
          if (rng() > 0.38) continue;
          this._q.setFromUnitVectors(Y, this._p.copy(dirV));
          posV.copy(dirV).multiplyScalar(body.R + this.out.h - 0.15);
          this._m.compose(posV, this._q, this._s.setScalar(1.4 + rng() * 2.8));
          this.distant.setMatrixAt(di++, this._m);
        }
        this.distant.count = di;
        this.distant.instanceMatrix.needsUpdate = true;
      } else if (!mid) this.distant.count = 0;
      const rebuildDist = near ? 320 : mid ? 480 : (overWater ? 1600 : 720);
      if (anchor.distanceTo(this.lastAnchor) < rebuildDist) return;
      this.lastAnchor.copy(anchor);
      const rng = U.mulberry32((Math.abs(anchor.x * 7.31 + anchor.z * 3.77 + anchor.y * 11.93) | 0) % 1e9);
      const up = new THREE.Vector3().copy(anchor).normalize();
      const e = Math.abs(up.y) < 0.93 ? new THREE.Vector3(0, 1, 0).cross(up).normalize() : new THREE.Vector3(1, 0, 0).cross(up).normalize();
      const nv = new THREE.Vector3().crossVectors(up, e);
      /* open ocean: skip the heavy land scatter pass — only place a few boats */
      if (overWater && isGaia) {
        let bi = 0;
        for (let i = 0; i < 520 && bi < 36; i++) {
          const ang = rng() * Math.PI * 2;
          const rad = 120 + Math.pow(rng(), 0.45) * 8200;
          dirV.copy(anchor).addScaledVector(e, Math.cos(ang) * rad).addScaledVector(nv, Math.sin(ang) * rad).normalize();
          body.sampler(dirV, this.out, lowSample);
          const h = this.out.h;
          if (h < -25 && h > -700 && rng() < 0.15) {
            this._q.setFromUnitVectors(Y, this._p.copy(dirV));
            const spin = new THREE.Quaternion().setFromAxisAngle(Y, rng() * 6.28);
            this._q.multiply(spin);
            posV.copy(dirV).multiplyScalar(body.R + 0.4);
            this._m.compose(posV, this._q, this._s.setScalar(0.8 + rng() * 1.1));
            this.boats.setMatrixAt(bi++, this._m);
          }
        }
        this.trees.count = 0; this.trees2.count = 0; this.bushes.count = 0;
        this.rocks.count = 0; this.cities.count = 0; this.reeds.count = 0; this.stumps.count = 0;
        this.boats.count = bi;
        for (const m of [this.trees, this.trees2, this.bushes, this.rocks, this.boats, this.cities, this.reeds, this.stumps]) m.instanceMatrix.needsUpdate = true;
        return;
      }
      let ti = 0, t2i = 0, bui = 0, ri = 0, bi = 0, ci = 0, rei = 0, sti = 0;
      const placeCity = (dir, hgt, foot) => {
        if (ci >= 480) return;
        this._q.setFromUnitVectors(Y, this._p.copy(dir));
        const spin = new THREE.Quaternion().setFromAxisAngle(Y, rng() * 6.28);
        this._q.multiply(spin);
        posV.copy(dir).multiplyScalar(body.R + foot);
        this._m.compose(posV, this._q, this._s.set(3.5 + rng() * 5, hgt, 3.5 + rng() * 5));
        this.cities.setMatrixAt(ci++, this._m);
      };
      for (let i = 0; i < 4200 && (ti < 720 || t2i < 480 || bui < 640 || ri < 380 || bi < 48 || ci < 480 || rei < 280 || sti < 180); i++) {
        const ang = rng() * Math.PI * 2;
        const rad = 80 + Math.pow(rng(), 0.38) * 9200;
        dirV.copy(anchor).addScaledVector(e, Math.cos(ang) * rad).addScaledVector(nv, Math.sin(ang) * rad).normalize();
        body.sampler(dirV, this.out, lowSample);
        const h = this.out.h, b = this.out.biome;
        if (isGaia) {
          /* settlements first: same clustering noise as the orbital night lights */
          if (h > 2 && h < 600 && (b === 1 || b === 2 || b === 11 || b === 12) && ci < 478) {
            const settle = U.fbm(this.cityNoise, dirV.x * 9, dirV.y * 9, dirV.z * 9, 2);
            if (settle > 0.2 && rng() < 0.52) {
              const hgt = 8 + rng() * rng() * 32;
              placeCity(dirV, hgt, h - 0.4);
              const nBld = 1 + (rng() * 3 | 0);
              for (let bi2 = 0; bi2 < nBld && ci < 480; bi2++) {
                const off = new THREE.Vector3().copy(dirV).addScaledVector(e, (rng() - 0.5) * 0.00045).addScaledVector(nv, (rng() - 0.5) * 0.00045).normalize();
                body.sampler(off, this.out, lowSample);
                if (this.out.h < 2) continue;
                placeCity(off, 5 + rng() * rng() * 18, this.out.h - 0.35);
              }
              continue;
            }
          }
          const treeB = (b === 3 || b === 15) ? 1 : (b === 2 && rng() < 0.42) || (b === 7 && rng() < 0.48) || (b === 12 && rng() < 0.38) ? 1 : 0;
          if (treeB && h > 3) {
            const broad = (b === 15 || (b === 2 || b === 12)) && rng() < 0.65;
            const sc = 0.75 + rng() * 2.2;
            this._q.setFromUnitVectors(Y, this._p.copy(dirV));
            const spin = new THREE.Quaternion().setFromAxisAngle(Y, rng() * 6.28);
            this._q.multiply(spin);
            posV.copy(dirV).multiplyScalar(body.R + h - 0.2);
            this._m.compose(posV, this._q, this._s.setScalar(sc));
            if (broad && t2i < 480) this.trees2.setMatrixAt(t2i++, this._m);
            else if (ti < 720) this.trees.setMatrixAt(ti++, this._m);
            if (near && (b === 3 || b === 7 || b === 15) && sti < 180 && rng() < 0.12) {
              this._m.compose(posV, this._q, this._s.setScalar(0.65 + rng() * 0.9));
              this.stumps.setMatrixAt(sti++, this._m);
            }
            continue;
          }
          if ((b === 2 || b === 11 || b === 12) && h > 2 && h < 180 && bui < 640 && rng() < 0.38) {
            const sc = 0.55 + rng() * 1.1;
            this._q.setFromUnitVectors(Y, this._p.copy(dirV));
            posV.copy(dirV).multiplyScalar(body.R + h - 0.08);
            this._m.compose(posV, this._q, this._s.setScalar(sc));
            this.bushes.setMatrixAt(bui++, this._m);
            continue;
          }
          if (near && (b === 2 || b === 11) && h < 8 && h > -2 && rei < 280 && rng() < 0.18) {
            this._q.setFromUnitVectors(Y, this._p.copy(dirV));
            posV.copy(dirV).multiplyScalar(body.R + Math.max(h, 0.1) - 0.05);
            this._m.compose(posV, this._q, this._s.setScalar(0.8 + rng() * 1.6));
            this.reeds.setMatrixAt(rei++, this._m);
            continue;
          }
          if ((b === 5 || b === 6) && rng() < 0.42 && ri < 380 && h > 2) {
            this._q.setFromUnitVectors(Y, this._p.copy(dirV));
            posV.copy(dirV).multiplyScalar(body.R + h - 0.3);
            this._m.compose(posV, this._q, this._s.setScalar(0.5 + rng() * 2.4));
            this.rocks.setMatrixAt(ri++, this._m);
          }
          /* coastal waters get little sailboats */
          if (h < -25 && h > -700 && bi < 36 && rng() < 0.15) {
            this._q.setFromUnitVectors(Y, this._p.copy(dirV));
            const spin = new THREE.Quaternion().setFromAxisAngle(Y, rng() * 6.28);
            this._q.multiply(spin);
            posV.copy(dirV).multiplyScalar(body.R + 0.4);
            this._m.compose(posV, this._q, this._s.setScalar(0.8 + rng() * 1.1));
            this.boats.setMatrixAt(bi++, this._m);
          }
        } else if (ri < 380 && rng() < 0.38) {
          /* airless worlds: boulders everywhere */
          this._q.setFromAxisAngle(axV.set(rng() - 0.5, rng(), rng() - 0.5).normalize(), rng() * 6.28);
          posV.copy(dirV).multiplyScalar(body.R + h - 0.3);
          this._m.compose(posV, this._q, this._s.setScalar(0.4 + rng() * rng() * 3));
          this.rocks.setMatrixAt(ri++, this._m);
        }
      }
      this.trees.count = ti; this.trees2.count = t2i; this.bushes.count = bui;
      this.rocks.count = ri; this.boats.count = bi; this.cities.count = ci;
      this.reeds.count = rei; this.stumps.count = sti;
      for (const m of [this.trees, this.trees2, this.bushes, this.rocks, this.boats, this.cities, this.reeds, this.stumps]) m.instanceMatrix.needsUpdate = true;
    }
  }

  /* ===================== birds: body-fixed soaring flocks (stable circles, no camera chase) ===================== */
  class Birds {
    constructor(count = 28) {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d');
      x.strokeStyle = 'rgba(24,28,32,0.95)'; x.lineWidth = 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(3, 20); x.quadraticCurveTo(12, 9, 16, 16); x.quadraticCurveTo(20, 9, 29, 20); x.stroke();
      const tex = new THREE.CanvasTexture(c);
      this.birds = [];
      this.group = new THREE.Group();
      this.planetGroup = null;
      this.flocks = [];
      this.anchorRad = null;
      this._pos = new THREE.Vector3();
      this._e = new THREE.Vector3();
      this._nv = new THREE.Vector3();
      const rng = U.mulberry32(1217);
      for (let f = 0; f < 3; f++) {
        const flock = {
          a: rng() * 6.28,
          r: 180 + rng() * 420,
          alt: 90 + rng() * 220,
          w: (0.04 + rng() * 0.035) * (rng() < 0.5 ? 1 : -1),
          offE: (rng() - 0.5) * 2800,
          offN: (rng() - 0.5) * 2800,
          members: [],
        };
        const n = 4 + (rng() * 4 | 0);
        for (let i = 0; i < n && this.birds.length < count; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
          sp.visible = false;
          this.group.add(sp);
          const rank = Math.ceil(i / 2), side = i % 2 === 0 ? 1 : -1;
          this.birds.push({ sp, flock, off: rank * 5 * side, back: rank * 7, bob: rng() * 9, flap: rng() * 9 });
        }
        this.flocks.push(flock);
      }
    }
    attachTo(planetGroup) {
      if (this.planetGroup === planetGroup) return;
      if (this.planetGroup) this.planetGroup.remove(this.group);
      this.planetGroup = planetGroup;
      planetGroup.add(this.group);
      this.anchorRad = null;
    }
    tangentBasis(radial, eOut, nvOut) {
      if (Math.abs(radial.y) < 0.93) eOut.set(0, 1, 0).cross(radial).normalize();
      else eOut.set(1, 0, 0).cross(radial).normalize();
      nvOut.crossVectors(radial, eOut);
    }
    update(camBF, bodyR, camAlt, dt, onGaia) {
      const show = onGaia && camAlt < 3200 && camAlt > 15;
      this.group.visible = show;
      if (!show) { for (const b of this.birds) b.sp.visible = false; return; }
      const radial = this._pos.copy(camBF).normalize();
      if (!this.anchorRad || this.anchorRad.angleTo(radial) > 0.12) {
        if (!this.anchorRad) this.anchorRad = new THREE.Vector3();
        this.anchorRad.copy(radial);
      }
      const e = this._e, nv = this._nv;
      this.tangentBasis(this.anchorRad, e, nv);
      for (const fl of this.flocks) {
        fl.a += fl.w * dt;
        fl.cx = Math.cos(fl.a) * fl.r;
        fl.cz = Math.sin(fl.a) * fl.r;
        fl.hx = -Math.sin(fl.a) * Math.sign(fl.w);
        fl.hz = Math.cos(fl.a) * Math.sign(fl.w);
      }
      for (const b of this.birds) {
        const fl = b.flock;
        b.flap += dt * (5 + Math.sin(b.bob) * 1.5);
        b.bob += dt * 0.45;
        const px = fl.cx - fl.hx * b.back + fl.hz * b.off + fl.offE;
        const pz = fl.cz - fl.hz * b.back - fl.hx * b.off + fl.offN;
        const alt = fl.alt + Math.sin(b.bob * 2) * 3;
        const pos = this._pos.copy(this.anchorRad).multiplyScalar(bodyR + alt)
          .addScaledVector(e, px)
          .addScaledVector(nv, pz);
        b.sp.position.copy(pos);
        const d = pos.distanceTo(camBF);
        b.sp.visible = d < 2400 && d > 8;
        const s = U.clamp(d * 0.014, 0.8, 6);
        b.sp.scale.set(s, s * (0.62 + Math.abs(Math.sin(b.flap)) * 0.38), 1);
        b.sp.material.rotation = Math.atan2(fl.hx, fl.hz);
        b.sp.material.opacity = U.clamp(2.0 - d / 1200, 0.2, 0.82);
      }
    }
  }

  /* ===================== asteroid belt (map + flavor) ===================== */
  class Belt {
    constructor(scene) {
      const n = CEL.BELT.n;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const rng = U.mulberry32(33550336);
      this.angles = new Float32Array(n);
      this.radii = new Float32Array(n);
      this.incs = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        this.radii[i] = U.lerp(CEL.BELT.a0, CEL.BELT.a1, Math.pow(rng(), 0.7));
        this.angles[i] = rng() * Math.PI * 2;
        this.incs[i] = (rng() * 2 - 1) * CEL.BELT.iSpread;
        const b = 0.35 + rng() * 0.5;
        col[i * 3] = b; col[i * 3 + 1] = b * 0.92; col[i * 3 + 2] = b * 0.8;
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
      this.points.frustumCulled = false;
      scene.add(this.points);
    }
    /* offset: solara position in scene coords */
    update(offset, t) {
      const attr = this.points.geometry.attributes.position;
      const n = this.angles.length;
      for (let i = 0; i < n; i++) {
        const om = Math.sqrt(1.05e18 / this.radii[i] ** 3);
        const a = this.angles[i] + om * t;
        const x = Math.cos(a) * this.radii[i], z = Math.sin(a) * this.radii[i];
        attr.setXYZ(i, x + offset.x, Math.sin(a * 2) * this.incs[i] * this.radii[i] * 0.2 + offset.y, z + offset.z);
      }
      attr.needsUpdate = true;
      this.points.geometry.computeBoundingSphere();
    }
  }

  /* ===================== sun billboard + flare ===================== */
  function glowTex(stops, size = 256) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  class SunFX {
    constructor(scene) {
      this.core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex([[0, 'rgba(255,252,235,1)'], [0.1, 'rgba(255,238,195,1)'], [0.22, 'rgba(255,215,150,0.75)'], [0.45, 'rgba(255,185,100,0.28)'], [0.72, 'rgba(255,155,70,0.08)'], [1, 'rgba(255,130,50,0)']], 256),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
      }));
      this.core.renderOrder = -50;
      scene.add(this.core);
      this.flares = [];
      const flareCfg = [[0.35, 0.05, 'rgba(160,220,255,0.5)'], [0.55, 0.028, 'rgba(255,200,150,0.45)'], [0.78, 0.075, 'rgba(140,255,180,0.3)'], [1.18, 0.04, 'rgba(255,160,160,0.4)']];
      for (const [d, s, col] of flareCfg) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex([[0, col], [0.5, col.replace(/[\d.]+\)$/, '0.12)')], [1, 'rgba(0,0,0,0)']], 64),
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
        }));
        sp.userData = { d, s };
        sp.renderOrder = 99;
        this.flares.push(sp);
        scene.add(sp);
      }
      this._ndc = new THREE.Vector3();
    }
    /* sunPosScene: position of sun in scene; atmoDim: 0..1 sky density; inSpace: above atmosphere */
    update(sunPosScene, camera, visible, atmoDim = 0, inSpace = false) {
      const atmo = clamp(atmoDim, 0, 1);
      const dist = sunPosScene.distanceTo(camera.position);
      this.core.position.copy(sunPosScene);
      this.core.scale.setScalar(dist * (inSpace ? 0.038 : 0.055));
      this.core.material.opacity = inSpace ? 0.08 : 0.18 + atmo * 0.38;
      this._ndc.copy(sunPosScene).project(camera);
      const onScreen = visible && this._ndc.z < 1 && Math.abs(this._ndc.x) < 1.15 && Math.abs(this._ndc.y) < 1.15;
      const lensOn = onScreen && !inSpace && atmo > 0.07;
      for (const f of this.flares) {
        f.visible = lensOn;
        if (!lensOn) continue;
        const fx = this._ndc.x * (1 - f.userData.d), fy = this._ndc.y * (1 - f.userData.d);
        f.position.set(fx, fy, -0.5).unproject(camera);
        const fd = f.position.distanceTo(camera.position);
        f.scale.setScalar(f.userData.s * fd * 1.1);
        f.material.opacity = atmo * 0.42;
      }
      this.core.visible = !!visible && (!inSpace || atmo > 0.04);
    }
  }

  function mapCloudShell(body) {
    const grp = new THREE.Group();
    const layers = attachCloudLayers(body, grp);
    return { group: grp, layers };
  }

  return { PlanetView, Stars, SunFX, FACES, cubeToSphere, glowTex, oceanTime, bakeBodyTexture, prebakeBodies, bodyGlobeMaterial, sunSurfaceTexture, invalidateBake, CloudPuffs, Scatter, Belt, Birds, mapCloudShell, attachCloudLayers, MAP_CLOUD_OPS };
})();
