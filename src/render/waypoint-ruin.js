// Waypoints after the approved beach scene: until it is unlocked a waypoint is a mossy heap of
// fallen, carved blocks inside a broken stone ring, with a faint glow in its carvings. When the
// hero unlocks it, a rune circle lights on the ground, the heap shudders, then the blocks lift off
// one by one, fly in an arc and lock into place, bottom tier first. The capstones and a few side
// blocks stay floating, light runs through the seams and carvings, two ribbons of light circle the
// pillar and motes drift up. A waypoint already unlocked when first seen is shown built.
// Geometry and textures are shared by every waypoint (userData.shared); each waypoint owns only
// its animated materials and its mote buffer, freed with the region.
import * as THREE from 'three';
import art from '../../data/art.json' with {type:'json'};
import { createRng } from '../core/rng.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';
import { hullMaterial, timeUniform } from './patch.js';
import { glowTexture } from './vfx.js';
import { stoneGeometry } from './ledges.js';

const C = art.waypointRuin;
const P2 = Math.PI / 2;
// assembled poses (centre of each block); the main pieces have authored ruin poses, the rest are
// scattered round the heap per waypoint
const SPECS = [
  { w: 1.0, h: 0.6, d: 1.0, a: [-0.52, 0.3, -0.52] }, { w: 1.0, h: 0.6, d: 1.0, a: [0.52, 0.3, -0.52] },
  { w: 1.0, h: 0.6, d: 1.0, a: [-0.52, 0.3, 0.52], carve: 'square' }, { w: 1.0, h: 0.6, d: 1.0, a: [0.52, 0.3, 0.52] },
  { w: 1.0, h: 1.5, d: 0.7, a: [0, 1.35, -0.28], r: [0.15, 0.32, -0.95], rr: [P2, 0.4, 0] },
  { w: 0.3, h: 1.36, d: 0.96, a: [-0.66, 1.29, 0.02], carve: 'bands', side: true },
  { w: 0.3, h: 1.36, d: 0.96, a: [0.66, 1.29, 0.02] },
  { w: 1.12, h: 1.56, d: 0.36, a: [0, 1.38, 0.27], carve: 'spiral', r: [0.0, 0.34, 0.2], rr: [-1.25, 0.12, 0.08] },
  { w: 0.5, h: 0.55, d: 0.5, a: [-0.27, 2.42, -0.27] }, { w: 0.5, h: 0.55, d: 0.5, a: [0.27, 2.42, -0.27] },
  { w: 0.5, h: 0.55, d: 0.5, a: [-0.27, 2.42, 0.27] }, { w: 0.5, h: 0.55, d: 0.5, a: [0.27, 2.42, 0.27] },
  { w: 1.32, h: 0.2, d: 1.32, a: [0, 3.02, 0], float: 1, r: [0.35, 0.1, -1.75], rr: [0.05, 0.3, 0.03] },
  { w: 1.0, h: 0.2, d: 1.0, a: [0, 3.25, 0], float: 1, r: [0.42, 0.3, -1.72], rr: [-0.04, 0.5, 0.06] },
  { w: 0.66, h: 0.18, d: 0.66, a: [0, 3.46, 0], float: 1, r: [0.38, 0.49, -1.76], rr: [0.08, 0.2, -0.05] },
  { w: 0.86, h: 1.16, d: 0.24, a: [1.6, 1.65, 0.4], ar: [0, -0.5, 0], carve: 'rune', float: 2, r: [1.25, 0.12, 0.65], rr: [-P2, 0.3, 0] },
  { w: 0.62, h: 0.55, d: 0.55, a: [-1.55, 2.0, 0.15], ar: [0, 0.4, 0.15], carve: 'bands', float: 2 },
  { w: 0.36, h: 0.34, d: 0.36, a: [-1.15, 1.05, 0.95], float: 3 },
  { w: 0.34, h: 0.32, d: 0.34, a: [1.25, 2.75, -0.6], float: 3 },
  { w: 0.3, h: 0.3, d: 0.3, a: [-0.85, 2.9, -0.85], float: 3 },
];

function canvasTexture(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, size, size);
  c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round'; draw(c);
  const tex = new THREE.CanvasTexture(cv); tex.userData.shared = true; return tex;
}
// carvings drawn white on black (an alpha map): a spiral sun, a rune, bands and nested squares
function carveTexture(kind) {
  return canvasTexture(256, (c) => {
    c.lineWidth = 11;
    if (kind === 'spiral') {
      c.beginPath(); for (let a = 0; a <= Math.PI * 5.2; a += 0.05) { const r = 4 + a * 4.4, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r; a ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      c.beginPath(); c.arc(128, 128, 86, 0, Math.PI * 2); c.stroke();
      for (const a of [-2.4, -1.57, -0.74, 0.74, 1.57, 2.4]) { c.beginPath(); c.moveTo(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98); c.lineTo(128 + Math.cos(a) * 180, 128 + Math.sin(a) * 180); c.stroke(); }
    } else if (kind === 'rune') {
      c.strokeRect(34, 22, 188, 212);
      c.beginPath(); c.moveTo(128, 64); c.lineTo(128, 196); c.moveTo(98, 64); c.lineTo(158, 64); c.moveTo(128, 118); c.lineTo(164, 118); c.lineTo(164, 150); c.stroke();
    } else if (kind === 'bands') {
      for (const y of [64, 104, 144, 184]) { c.beginPath(); c.moveTo(22, y); c.lineTo(234, y); c.stroke(); }
    } else {
      c.strokeRect(40, 40, 176, 176); c.strokeRect(92, 92, 72, 72);
    }
  });
}
function runeCircleTexture() {
  return canvasTexture(512, (c) => {
    c.translate(256, 256);
    c.lineWidth = 7; c.beginPath(); c.arc(0, 0, 236, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 206, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * 210, Math.sin(a) * 210); c.lineTo(Math.cos(a) * (k % 2 ? 222 : 232), Math.sin(a) * (k % 2 ? 222 : 232)); c.stroke(); }
    c.lineWidth = 5; c.beginPath(); for (let a = 0; a <= Math.PI * 6; a += 0.04) { const r = 10 + a * 9; a ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(r, 0); } c.stroke();
  });
}
function ribbonGeometry(turns, r, y0, y1, width) {
  const N = 120, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = u * turns * Math.PI * 2, y = y0 + (y1 - y0) * u, rr = r * (1 - 0.15 * Math.sin(u * Math.PI));
    for (const v of [0, 1]) { pos.push(Math.cos(a) * rr, y + (v - 0.5) * width, Math.sin(a) * rr); uv.push(u, v); }
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.userData.shared = true; return g;
}
const markShared = (o) => { o.userData.shared = true; return o; };
function hullOf(geo) {
  const g = mergeVertices(new THREE.BufferGeometry().setAttribute('position', geo.attributes.position.clone()), 1e-4);
  g.computeVertexNormals(); return markShared(g);
}

let kit = null;
/** Everything shared by all waypoints: block shapes, ring stones, textures, static materials. */
function ruinKit() {
  if (kit) return kit;
  const rng = createRng(9031);
  const blocks = SPECS.map((sp) => {
    const geo = markShared(stoneGeometry(rng, { w: sp.w, h: sp.h, d: sp.d, chamfer: 0.1, jitter: 0.015, extra: 0, moss: sp.float ? 0.2 : 0.4, centred: true }));
    return { geo, hull: hullOf(geo), plane: sp.carve ? markShared(new THREE.PlaneGeometry(...(sp.carve === 'spiral' ? [Math.min(sp.w, sp.h) * 0.9, Math.min(sp.w, sp.h) * 0.9] : [(sp.side ? sp.d : sp.w) * 0.84, sp.h * 0.84]))) : null };
  });
  const ringStone = markShared(stoneGeometry(rng, { w: 1.05, h: 0.5, d: 0.55, chamfer: 0.12, jitter: 0.06, extra: 4, moss: 0.5 }));
  const rubble = [0, 1, 2].map(() => markShared(stoneGeometry(rng, { w: 1, h: 1, d: 1, chamfer: 0.12, jitter: 0.06, extra: 3, moss: 0.4 })));
  const carves = Object.fromEntries(['spiral', 'rune', 'bands', 'square'].map((k) => [k, carveTexture(k)]));
  const add = THREE.AdditiveBlending;
  kit = {
    blocks, ringStone, ringHull: hullOf(ringStone), rubble, rubbleHull: rubble.map(hullOf), carves,
    stone: markShared(toon('#ffffff', { vertexColors: true })),
    ink: markShared(hullMaterial('#4c4852', 0.025)),
    groove: markShared(new THREE.MeshBasicMaterial({ color: C.carve, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })),
    circleTex: runeCircleTexture(), circleGeo: markShared(new THREE.PlaneGeometry(5.6, 5.6)),
    seamGeo: markShared(new THREE.BoxGeometry(1, 0.05, 1)),
    ribbons: [ribbonGeometry(1.15, 1.6, 0.5, 2.9, 0.26), ribbonGeometry(0.9, 1.45, 2.6, 0.9, 0.2)],
    glow: markShared(glowTexture()), add,
  };
  return kit;
}

const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** One waypoint (local metres, ground at y=0). `seed` varies the heap between waypoints. */
export function waypointRuin(seed = 1) {
  const K = ruinKit(), rng = createRng(seed), root = new THREE.Group();
  const mesh = (geo, mat, hullGeo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; if (hullGeo) m.add(new THREE.Mesh(hullGeo, K.ink)); return m; };
  // the broken stone ring and loose rubble (static)
  const R = C.ringRadius;
  for (let k = 0; k < 11; k++) {
    if (k === 3 || k === 7) continue;
    const a = k / 11 * Math.PI * 2 + 0.2, m = mesh(K.ringStone, K.stone, K.ringHull);
    m.position.set(Math.cos(a) * R, -0.14, Math.sin(a) * R); m.rotation.y = -a + P2 + rng.range(-0.08, 0.08); root.add(m);
  }
  for (let k = 0; k < 9; k++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(R + 0.5, R + 1.2), s = rng.range(0.22, 0.4), v = k % 3;
    const m = mesh(K.rubble[v], K.stone, K.rubbleHull[v]); m.position.set(Math.cos(a) * r, -0.05, Math.sin(a) * r); m.scale.set(s, s * 0.9, s); m.rotation.y = rng.range(0, 3); root.add(m);
  }
  for (let k = 0; k < 14; k++) {
    const a = k * 2.1 + rng.range(-0.4, 0.4), r = rng.range(1.1, R - 0.2), s = rng.range(0.3, 0.62), v = k % 3;
    const m = mesh(K.rubble[v], K.stone, K.rubbleHull[v]); m.position.set(Math.cos(a) * r, -0.12, Math.sin(a) * r);
    m.scale.set(s * rng.range(1, 1.5), s * rng.range(0.6, 1), s); m.rotation.set(0, rng.range(0, 3), rng.range(-0.2, 0.2)); root.add(m);
  }
  // the blocks: ruin and assembled poses
  const tmpM = new THREE.Matrix4();
  const blocks = SPECS.map((sp, i) => {
    const b = { ...sp, order: i, phase: rng.range(0, 6.28), arc: 0.8 + (i % 3) * 0.45 };
    if (!sp.r) {
      // fallen: lying on one face, somewhere in the heap
      const a = i * 2.39 + rng.range(-0.3, 0.3), rad = rng.range(0.85, 1.9);
      b.rr = [rng.next() < 0.4 ? P2 : 0, rng.range(0, Math.PI * 2), rng.range(-0.22, 0.22)];
      tmpM.makeRotationFromEuler(new THREE.Euler(...b.rr)); const e = tmpM.elements;
      const hy = Math.abs(e[1]) * sp.w / 2 + Math.abs(e[5]) * sp.h / 2 + Math.abs(e[9]) * sp.d / 2;
      b.r = [Math.cos(a) * rad, hy - 0.08, Math.sin(a) * rad];
    }
    b.qr = new THREE.Quaternion().setFromEuler(new THREE.Euler(...b.rr));
    b.qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(sp.ar || [0, 0, 0])));
    b.mesh = mesh(K.blocks[i].geo, K.stone, K.blocks[i].hull);
    if (sp.carve) {
      const glow = new THREE.MeshBasicMaterial({ color: C.carveGlow, alphaMap: K.carves[sp.carve], transparent: true, depthWrite: false, blending: K.add, opacity: 0 });
      const groove = new THREE.MeshBasicMaterial({ color: C.carve, alphaMap: K.carves[sp.carve], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      for (const [mat, off] of [[groove, 0.014], [glow, 0.02]]) {
        const d = new THREE.Mesh(K.blocks[i].plane, mat);
        if (sp.side) { d.rotation.y = -P2; d.position.x = -(sp.w / 2 + off); } else d.position.z = sp.d / 2 + off;
        b.mesh.add(d);
      }
      b.glow = glow;
    }
    root.add(b.mesh);
    return b;
  });
  // light: the rune circle on the ground, seams, two ribbons, rising motes, a hint glow, dust
  const circleMat = new THREE.MeshBasicMaterial({ color: C.rune, alphaMap: K.circleTex, transparent: true, depthWrite: false, opacity: 0 });
  const circle = new THREE.Mesh(K.circleGeo, circleMat); circle.rotation.x = -P2; circle.position.y = 0.08; root.add(circle);
  const seamMat = new THREE.MeshBasicMaterial({ color: C.glow, transparent: true, depthWrite: false, blending: K.add, opacity: 0 });
  for (const [w, y] of [[2.06, 0.6], [1.26, 2.13], [1.08, 2.72]]) for (const [sx, sz, px, pz] of [[w, 0.05, 0, w / 2], [w, 0.05, 0, -w / 2], [0.05, w, w / 2, 0], [0.05, w, -w / 2, 0]]) {
    const m = new THREE.Mesh(K.seamGeo, seamMat); m.scale.set(sx, 1, sz); m.position.set(px, y, pz); root.add(m);
  }
  const ribbonMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uTime: timeUniform, uColor: { value: new THREE.Color(C.ribbon) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uOpacity,uTime; uniform vec3 uColor; varying vec2 vUv; void main(){ float a=pow(sin(3.14159*vUv.x),1.2)*(1.-pow(abs(vUv.y*2.-1.),2.)); a*=.7+.3*sin(vUv.x*26.-uTime*5.); gl_FragColor=vec4(mix(uColor,vec3(1.),a*.4),min(1.,a*uOpacity*1.8)); }',
  });
  const ribbons = K.ribbons.map((g) => { const m = new THREE.Mesh(g, ribbonMat); root.add(m); return m; });
  const motes = [];
  for (let k = 0; k < C.motes; k++) motes.push({ a: rng.range(0, 6.28), r: rng.range(0.6, 1.7), y: rng.range(0, 3.5), v: rng.range(0.4, 1.0) });
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(C.motes * 3), 3));
  const moteMat = new THREE.PointsMaterial({ size: 0.16, map: K.glow, color: C.mote, transparent: true, depthWrite: false, blending: K.add, opacity: 0 });
  const points = new THREE.Points(moteGeo, moteMat); points.frustumCulled = false; root.add(points);
  const hint = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glow, color: C.carveGlow, transparent: true, depthWrite: false, blending: K.add, opacity: 0.4 }));
  hint.scale.set(1.2, 1.2, 1); hint.position.set(0, 0.9, 0.2); root.add(hint);
  const dust = [];
  for (let k = 0; k < 8; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glow, color: C.dust, transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; root.add(sp); dust.push({ sp, t: 1 }); }
  root.userData.ruin = { T: 0, TMAX: C.assemble, spin: 0, blocks, circle, seamMat, ribbonMat, ribbons, motes, points, moteMat, hint, dust, seen: false };
  updateWaypointRuin(root, false, 0, 0);
  return root;
}

const pos = new THREE.Vector3(), q = new THREE.Quaternion(), spinQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
/** Advance one waypoint. `on`: unlocked. First call with `on` shows it built, without the rebuild. */
export function updateWaypointRuin(root, on, dt, t) {
  const W = root.userData.ruin;
  if (!W.seen && dt > 0) { W.seen = true; if (on) W.T = W.TMAX; }
  W.T = on ? Math.min(W.TMAX, W.T + dt) : Math.max(0, W.T - dt * 1.5);
  const T = W.T, G = smooth(3.45, 3.95, T * 4 / W.TMAX);
  W.spin += dt * 0.5 * G;
  for (const b of W.blocks) {
    const start = 0.55 + b.order * 0.12, lt = Math.min(1, Math.max(0, (T * 4 / W.TMAX - start) / 0.95)), e = ease(lt);
    const ax = b.a[0], az = b.a[2];
    let tx = ax, tz = az, ty = b.a[1];
    if (b.float === 2 || b.float === 3) {
      const ang = W.spin * (b.float === 3 ? 1.6 : 1), c = Math.cos(ang), s = Math.sin(ang);
      tx = ax * c - az * s; tz = ax * s + az * c;
    }
    if (b.float) ty += Math.sin(t * 1.7 + b.phase) * 0.07 * G;
    pos.set(b.r[0] + (tx - b.r[0]) * e, b.r[1] + (ty - b.r[1]) * e + Math.sin(Math.PI * lt) * b.arc, b.r[2] + (tz - b.r[2]) * e);
    // before lifting off the heap shudders
    if (on && lt === 0 && T > 0.05) { const k = smooth(0.05, 0.5, T); pos.x += Math.sin(t * 47 + b.phase) * 0.025 * k; pos.z += Math.cos(t * 41 + b.phase) * 0.025 * k; }
    q.copy(b.qr).slerp(b.qa, e);
    if (b.float === 3) q.multiply(spinQ.setFromAxisAngle(UP, t * 0.9 * G));
    if (b.float === 2) q.premultiply(spinQ.setFromAxisAngle(UP, W.spin));
    b.mesh.position.copy(pos); b.mesh.quaternion.copy(q);
    if (lt >= 1 && !b.landed) {
      b.landed = true;
      // dust where a block lands (not when a built waypoint is first shown)
      if (!b.float && dt > 0 && T < W.TMAX) { const d = W.dust.find((d) => d.t >= 1) || W.dust[0]; d.t = 0; d.sp.visible = true; d.sp.position.set(pos.x, b.a[1] - b.h / 2 + 0.1, pos.z); }
    }
    if (lt <= 0) b.landed = false;
    if (b.glow) b.glow.opacity = G * (0.85 + 0.15 * Math.sin(t * 3 + b.phase)) + (on ? 0 : 0.18 + 0.12 * Math.sin(t * 2.2));
  }
  W.circle.material.opacity = smooth(0, 0.5, T) * (0.8 + 0.15 * Math.sin(t * 2));
  W.circle.rotation.z = t * 0.15;
  W.seamMat.opacity = G * (0.8 + 0.2 * Math.sin(t * 2.6));
  W.ribbonMat.uniforms.uOpacity.value = G;
  W.ribbons[0].rotation.y = t * 0.9; W.ribbons[1].rotation.y = -t * 0.7;
  const moteOn = Math.max(G, smooth(0, 0.5, T) * 0.5);
  W.moteMat.opacity = moteOn;
  if (moteOn > 0) {
    const arr = W.points.geometry.attributes.position.array;
    for (let k = 0; k < W.motes.length; k++) { const m = W.motes[k]; m.y = (m.y + dt * m.v) % 3.6; const a = m.a + t * 0.3; arr[k * 3] = Math.cos(a) * m.r; arr[k * 3 + 1] = m.y; arr[k * 3 + 2] = Math.sin(a) * m.r; }
    W.points.geometry.attributes.position.needsUpdate = true;
  }
  W.hint.material.opacity = on ? 0 : 0.3 + 0.2 * Math.sin(t * 2.2);
  for (const d of W.dust) {
    if (d.t >= 1) continue;
    d.t = Math.min(1, d.t + dt / 0.7); d.sp.scale.setScalar(0.5 + d.t * 1.8); d.sp.material.opacity = 0.75 * (1 - d.t); d.sp.position.y += dt * 0.4;
    if (d.t >= 1) d.sp.visible = false;
  }
}
