// Every native waypoint is the approved arrival beach's warp pillar (render/accepted-scenes/beach.js,
// owner 31 October 2026: the new pillar replaces all the old crystal stones). Until it is unlocked a
// waypoint is a mossy heap of carved blocks inside a broken stone ring, a faint glow in its carvings.
// When it unlocks, a rune circle lights on the ground, the heap shudders, then the blocks lift off one
// by one, fly in an arc and lock into place, bottom tier first. The capstones and a few side blocks
// stay floating, light runs through the seams and carvings, two ribbons circle the pillar and motes
// drift up. A waypoint already unlocked when first seen is shown built.
//
// Draw calls: the twenty blocks are the bones of ONE skinned mesh (and its outline hull, its carved
// grooves and their glow), so a waypoint costs about a dozen draws, not the hundred-odd of one mesh
// per block. Shapes and textures are shared by every waypoint (userData.shared); each waypoint owns
// its skeleton, its animated materials and its mote buffer, freed with the region (disposeObject).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import art from '../../data/art.json' with { type: 'json' };
import { createRng } from '../core/rng.js';
import { toon } from './toon.js';
import { hullMaterial, timeUniform } from './patch.js';

const C = art.waypointRuin;
const P2 = Math.PI / 2;
// Assembled poses (centre of each block, authored units); the main pieces have authored ruin poses,
// the rest fall somewhere in the heap per waypoint. The beach scene's own list.
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
// carvings in one 2x2 atlas (an alpha map, white on black)
const ATLAS = { spiral: [0, 0], rune: [1, 0], bands: [0, 1], square: [1, 1] };

const markShared = (o) => { o.userData.shared = true; return o; };

// A chamfered, slightly irregular stone block (the beach scene's stoneGeometry), base at y=0,
// flat-shaded with a per-face colour: stone, mossy on top.
function stoneGeometry(rng, w, h, d, { chamfer = 0.24, jitter = 0.09, extra = 8, moss = 0 } = {}) {
  const R = (a, b) => rng.range(a, b), pick = (a) => a[Math.floor(rng.next() * a.length)], pts = [];
  for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) {
    if (!ix && !iy && !iz) continue;
    const k = Math.abs(ix) + Math.abs(iy) + Math.abs(iz), c = k === 3 ? 1 - chamfer : k === 2 ? 1 - chamfer * 0.42 : 1;
    pts.push(new THREE.Vector3(ix * w / 2 * c * (1 + R(-jitter, jitter)), iy * h / 2 * c * (1 + R(-jitter, jitter)), iz * d / 2 * c * (1 + R(-jitter, jitter))));
  }
  for (let i = 0; i < extra; i++) {
    const v = new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)), m = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
    v.divideScalar(m).multiplyScalar(1 - chamfer * 0.25);pts.push(new THREE.Vector3(v.x * w / 2, v.y * h / 2, v.z * d / 2));
  }
  const g = new ConvexGeometry(pts);g.translate(0, h / 2, 0);
  const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(pick(C.stone)), c = new THREE.Color(), mossC = new THREE.Color();
  for (let t = 0; t < pos.count; t += 3) {
    const ny = nor.getY(t);c.copy(base).multiplyScalar(1 + R(-0.09, 0.07));
    if (ny > 0.78 && rng.next() < moss) c.lerp(mossC.set(pick(C.moss)), R(0.55, 0.8));
    else if (ny > 0.45 && rng.next() < moss * 0.3) c.lerp(mossC.set(pick(C.moss)), 0.3);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
// the outline shell: welded positions with smooth normals, pushed out by the hull material
function hullOf(geo) {
  const g = mergeVertices(new THREE.BufferGeometry().setAttribute('position', geo.attributes.position.clone()), 1e-4);
  g.computeVertexNormals();return g;
}
// every vertex of a block follows that block's bone
function skinTo(geo, bone) {
  const n = geo.attributes.position.count, idx = new Uint8Array(n * 4), wt = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { idx[i * 4] = bone;wt[i * 4] = 255; }
  // bytes, not floats: twenty bones and a full weight need no more (the weight normalised to 1)
  geo.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(idx, 4));geo.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(wt, 4, true));
  return geo;
}
function atlasTexture() {
  const cv = document.createElement('canvas');cv.width = cv.height = 512;
  const c = cv.getContext('2d');c.fillStyle = '#000';c.fillRect(0, 0, 512, 512);
  c.strokeStyle = '#fff';c.lineCap = 'round';c.lineJoin = 'round';c.lineWidth = 11;
  const cell = (kind, draw) => { const [i, j] = ATLAS[kind];c.save();c.translate(i * 256, j * 256);c.beginPath();c.rect(0, 0, 256, 256);c.clip();draw();c.restore(); };
  cell('spiral', () => {
    c.beginPath();for (let a = 0; a <= Math.PI * 5.2; a += 0.05) { const r = 4 + a * 4.4, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;a ? c.lineTo(x, y) : c.moveTo(x, y); }c.stroke();
    c.beginPath();c.arc(128, 128, 86, 0, Math.PI * 2);c.stroke();
    for (const a of [-2.4, -1.57, -0.74, 0.74, 1.57, 2.4]) { c.beginPath();c.moveTo(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98);c.lineTo(128 + Math.cos(a) * 180, 128 + Math.sin(a) * 180);c.stroke(); }
  });
  cell('rune', () => { c.strokeRect(34, 22, 188, 212);c.beginPath();c.moveTo(128, 64);c.lineTo(128, 196);c.moveTo(98, 64);c.lineTo(158, 64);c.moveTo(128, 118);c.lineTo(164, 118);c.lineTo(164, 150);c.stroke(); });
  cell('bands', () => { for (const y of [64, 104, 144, 184]) { c.beginPath();c.moveTo(22, y);c.lineTo(234, y);c.stroke(); } });
  cell('square', () => { c.strokeRect(40, 40, 176, 176);c.strokeRect(92, 92, 72, 72); });
  const tex = new THREE.CanvasTexture(cv);tex.anisotropy = 4;return markShared(tex);
}
function runeCircleTexture() {
  const cv = document.createElement('canvas');cv.width = cv.height = 512;
  const c = cv.getContext('2d');c.translate(256, 256);c.strokeStyle = '#fff';c.lineCap = 'round';
  c.lineWidth = 7;c.beginPath();c.arc(0, 0, 236, 0, Math.PI * 2);c.stroke();
  c.lineWidth = 4;c.beginPath();c.arc(0, 0, 206, 0, Math.PI * 2);c.stroke();
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2;c.beginPath();c.moveTo(Math.cos(a) * 210, Math.sin(a) * 210);c.lineTo(Math.cos(a) * (k % 2 ? 222 : 232), Math.sin(a) * (k % 2 ? 222 : 232));c.stroke(); }
  c.lineWidth = 5;c.beginPath();for (let a = 0; a <= Math.PI * 6; a += 0.04) { const r = 10 + a * 9;a ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(r, 0); }c.stroke();
  return markShared(new THREE.CanvasTexture(cv));
}
function glowTexture() {
  const cv = document.createElement('canvas');cv.width = cv.height = 64;
  const c = cv.getContext('2d'), grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');grd.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grd;c.fillRect(0, 0, 64, 64);return markShared(new THREE.CanvasTexture(cv));
}
function ribbonGeometry(turns, r, y0, y1, width) {
  const N = 120, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = u * turns * Math.PI * 2, y = y0 + (y1 - y0) * u, rr = r * (1 - 0.15 * Math.sin(u * Math.PI));
    for (const v of [0, 1]) { pos.push(Math.cos(a) * rr, y + (v - 0.5) * width, Math.sin(a) * rr);uv.push(u, v); }
    if (i < N) { const k = i * 2;idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));g.setIndex(idx);
  return markShared(g);
}

let kit = null;
/** Everything shared by all waypoints: the skinned block shapes, the ring, textures, static materials. */
function ruinKit() {
  if (kit) return kit;
  const rng = createRng(9031);
  const blocks = [], hulls = [], grooves = [];
  SPECS.forEach((sp, i) => {
    const geo = stoneGeometry(rng, sp.w, sp.h, sp.d, { chamfer: 0.1, jitter: 0.015, extra: 0, moss: sp.float ? 0.2 : 0.4 });
    geo.translate(0, -sp.h / 2, 0); // centred on its bone
    const hull = hullOf(geo), s = [1 + 0.06 / sp.w, 1 + 0.06 / sp.h, 1 + 0.06 / sp.d];hull.scale(...s);
    blocks.push(skinTo(geo, i));hulls.push(skinTo(hull, i));
    if (sp.carve) {
      const fw = sp.side ? sp.d : sp.w, sq = sp.carve === 'spiral' ? Math.min(fw, sp.h) * 0.9 : 0;
      const plane = new THREE.PlaneGeometry(sq || fw * 0.84, sq || sp.h * 0.84), [ai, aj] = ATLAS[sp.carve], uv = plane.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (ai + uv.getX(k)) / 2, 1 - (aj + 1 - uv.getY(k)) / 2);
      if (sp.side) { plane.rotateY(-P2);plane.translate(-(sp.w / 2 + 0.016), 0, 0); } else plane.translate(0, 0, sp.d / 2 + 0.016);
      plane.deleteAttribute('normal');grooves.push(skinTo(plane, i));
    }
  });
  // the broken stone ring and loose rubble round the heap (static, one shape for every waypoint;
  // each waypoint turns it to its own angle)
  const ring = [], ringHulls = [], R = C.ringRadius, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  // each stone with its outline shell, a little larger round its own centre (the beach's addStone)
  const place = (geo, x, y, z, rx, ry, rz) => {
    geo.computeBoundingBox();const b = geo.boundingBox, hy = (b.max.y - b.min.y) / 2, k = 1 + 0.06 / Math.min(b.max.x - b.min.x, 2 * hy, b.max.z - b.min.z) * 1.6;
    const hull = hullOf(geo);hull.translate(0, -hy, 0);hull.scale(k, k, k);hull.translate(0, hy, 0);
    m.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), one);geo.applyMatrix4(m);hull.applyMatrix4(m);ring.push(geo);ringHulls.push(hull);
  };
  for (let k = 0; k < 11; k++) {
    if (k === 3 || k === 7) continue;
    const a = k / 11 * Math.PI * 2 + 0.2;
    place(stoneGeometry(rng, 1.05, 0.5, 0.55, { chamfer: 0.12, jitter: 0.06, extra: 4, moss: 0.5 }), Math.cos(a) * 2.3 * R / 2.1, -0.14, Math.sin(a) * 2.3 * R / 2.1, 0, -a + P2 + rng.range(-0.08, 0.08), 0);
  }
  for (let k = 0; k < 9; k++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(2.8, 3.6) * R / 2.1, s = rng.range(0.22, 0.4);
    place(stoneGeometry(rng, s, s * 0.9, s, { chamfer: 0.14, extra: 0, moss: 0.3 }), Math.cos(a) * r, -0.05, Math.sin(a) * r, 0, rng.range(0, 3), 0);
  }
  for (let k = 0; k < 14; k++) {
    const a = k * 2.1 + rng.range(-0.4, 0.4), r = rng.range(1.1, R), s = rng.range(0.3, 0.62);
    place(stoneGeometry(rng, s * rng.range(1, 1.5), s * rng.range(0.6, 1), s, { chamfer: 0.1, jitter: 0.05, extra: 0, moss: 0.45 }), Math.cos(a) * r, -0.12, Math.sin(a) * r, 0, rng.range(0, 3), rng.range(-0.2, 0.2));
  }
  const ringGeo = mergeGeometries(ring), ringHull = mergeGeometries(ringHulls);
  // light along the seams: a thin frame round each joint between tiers
  const seams = [];
  for (const [w, y] of [[2.06, 0.6], [1.26, 2.13], [1.08, 2.72]]) for (const [sx, sz, px, pz] of [[w, 0.05, 0, w / 2], [w, 0.05, 0, -w / 2], [0.05, w, w / 2, 0], [0.05, w, -w / 2, 0]]) {
    const b = new THREE.BoxGeometry(sx, 0.05, sz);b.translate(px, y, pz);b.deleteAttribute('uv');b.deleteAttribute('normal');seams.push(b);
  }
  kit = {
    blocks: markShared(mergeGeometries(blocks)), hull: markShared(mergeGeometries(hulls)), grooves: markShared(mergeGeometries(grooves)),
    ring: markShared(ringGeo), ringHull: markShared(ringHull), seams: markShared(mergeGeometries(seams)),
    stone: toon('#ffffff', { vertexColors: true }),
    ink: markShared(hullMaterial(C.ink, C.inkWidth)),
    atlas: atlasTexture(), circleTex: runeCircleTexture(), circleGeo: markShared(new THREE.PlaneGeometry(5.6, 5.6)),
    ribbons: [ribbonGeometry(1.15, 1.6, 0.5, 2.9, 0.26), ribbonGeometry(0.9, 1.45, 2.6, 0.9, 0.2)],
    glow: glowTexture(),
  };
  kit.groove = markShared(new THREE.MeshBasicMaterial({ color: C.carve, alphaMap: kit.atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  kit.circleGeo.rotateX(-P2);
  return kit;
}

const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a)));return t * t * (3 - 2 * t); };

/** One waypoint, ground at y=0, in world metres (art.waypointRuin.scale). `seed` varies its heap and turn. */
export function waypointRuin(seed = 1) {
  const K = ruinKit(), rng = createRng(seed), root = new THREE.Group(), add = THREE.AdditiveBlending;
  const body = new THREE.Group();body.scale.setScalar(C.scale);body.rotation.y = rng.range(-0.5, 0.5);root.add(body); // carvings toward the camera, as the beach's
  const ring = new THREE.Mesh(K.ring, K.stone);ring.castShadow = ring.receiveShadow = true;ring.add(new THREE.Mesh(K.ringHull, K.ink));body.add(ring);
  // the blocks: twenty bones; each keeps its ruin pose and its place in the pillar
  const bones = [], tmpM = new THREE.Matrix4();
  const blocks = SPECS.map((sp, i) => {
    const b = { ...sp, order: i, phase: rng.range(0, 6.28), arc: 0.8 + (i % 3) * 0.45, landed: false };
    if (!sp.r) {
      // fallen: lying on one face, somewhere in the heap
      const a = i * 2.39 + rng.range(-0.3, 0.3), rad = rng.range(0.85, 1.9);
      b.rr = [rng.next() < 0.4 ? P2 : 0, rng.range(0, Math.PI * 2), rng.range(-0.22, 0.22)];
      tmpM.makeRotationFromEuler(new THREE.Euler(...b.rr));const el = tmpM.elements;
      const hy = Math.abs(el[1]) * sp.w / 2 + Math.abs(el[5]) * sp.h / 2 + Math.abs(el[9]) * sp.d / 2;
      b.r = [Math.cos(a) * rad, hy - 0.08, Math.sin(a) * rad];
    }
    b.qr = new THREE.Quaternion().setFromEuler(new THREE.Euler(...b.rr));
    b.qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(sp.ar || [0, 0, 0])));
    b.bone = new THREE.Bone();bones.push(b.bone);body.add(b.bone);
    return b;
  });
  const skeleton = new THREE.Skeleton(bones), identity = new THREE.Matrix4();
  const skinned = (geo, mat, shadow) => {
    const m = new THREE.SkinnedMesh(geo, mat);m.bind(skeleton, identity);
    // the blocks fly about the heap: the whole waypoint is culled by the view instead
    m.frustumCulled = false;m.castShadow = shadow;m.receiveShadow = shadow;body.add(m);return m;
  };
  skinned(K.blocks, K.stone, true);skinned(K.hull, K.ink, false);skinned(K.grooves, K.groove, false);
  const carveGlow = new THREE.MeshBasicMaterial({ color: C.carveGlow, alphaMap: K.atlas, transparent: true, depthWrite: false, blending: add, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3 });
  skinned(K.grooves, carveGlow, false);
  // light: the rune circle on the ground, seams, two ribbons, rising motes, a hint glow, landing dust
  const circleMat = new THREE.MeshBasicMaterial({ color: C.rune, alphaMap: K.circleTex, transparent: true, depthWrite: false, opacity: 0 });
  const circle = new THREE.Mesh(K.circleGeo, circleMat);circle.position.y = 0.08;body.add(circle);
  const seamMat = new THREE.MeshBasicMaterial({ color: C.glow, transparent: true, depthWrite: false, blending: add, opacity: 0 });
  body.add(new THREE.Mesh(K.seams, seamMat));
  const ribbonMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uTime: timeUniform, uColor: { value: new THREE.Color(C.ribbon) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uOpacity,uTime; uniform vec3 uColor; varying vec2 vUv; void main(){ float a=pow(sin(3.14159*vUv.x),1.2)*(1.-pow(abs(vUv.y*2.-1.),2.)); a*=.7+.3*sin(vUv.x*26.-uTime*5.); gl_FragColor=vec4(mix(uColor,vec3(1.),a*.4),min(1.,a*uOpacity*1.8)); }',
  });
  const ribbons = K.ribbons.map((g) => { const m = new THREE.Mesh(g, ribbonMat);m.frustumCulled = false;body.add(m);return m; });
  const motes = [];
  for (let k = 0; k < C.motes; k++) motes.push({ a: rng.range(0, 6.28), r: rng.range(0.6, 1.7), y: rng.range(0, 3.5), v: rng.range(0.4, 1.0) });
  const moteGeo = new THREE.BufferGeometry();moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(C.motes * 3), 3));
  const moteMat = new THREE.PointsMaterial({ size: 0.16, map: K.glow, color: C.mote, transparent: true, depthWrite: false, blending: add, opacity: 0 });
  const points = new THREE.Points(moteGeo, moteMat);points.frustumCulled = false;body.add(points);
  const hint = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glow, color: C.carveGlow, transparent: true, depthWrite: false, blending: add, opacity: 0.4 }));
  hint.scale.set(1.2, 1.2, 1);hint.position.set(0, 0.9, 0.2);body.add(hint);
  const dustMat = new THREE.SpriteMaterial({ map: K.glow, color: C.dust, transparent: true, depthWrite: false, opacity: 0 }), dust = [];
  for (let k = 0; k < 6; k++) { const sp = new THREE.Sprite(dustMat.clone());sp.visible = false;body.add(sp);dust.push({ sp, t: 1 }); }
  dustMat.dispose();
  root.userData.ruin = { T: 0, spin: 0, blocks, carveGlow, circle, seamMat, ribbonMat, ribbons, motes, points, moteMat, hint, dust, seen: false };
  updateWaypointRuin(root, false, 0, 0);
  return root;
}

const pos = new THREE.Vector3(), q = new THREE.Quaternion(), spinQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
/** Advance one waypoint. `on`: unlocked. The first call with `on` shows it built, without the rebuild. */
export function updateWaypointRuin(root, on, dt, t) {
  const W = root.userData.ruin, TMAX = C.assemble;
  if (!W.seen && dt > 0) { W.seen = true;if (on) W.T = TMAX; }
  W.T = on ? Math.min(TMAX, W.T + dt) : Math.max(0, W.T - dt * 1.5);
  const T = W.T * 4 / TMAX, G = smooth(3.45, 3.95, T); // the beach's own timing, in its 4 s
  W.spin += dt * 0.5 * G;
  for (const b of W.blocks) {
    const start = 0.55 + b.order * 0.12, lt = Math.min(1, Math.max(0, (T - start) / 0.95)), e = ease(lt);
    const ax = b.a[0], az = b.a[2];
    let tx = ax, tz = az, ty = b.a[1];
    if (b.float === 2 || b.float === 3) {
      const ang = W.spin * (b.float === 3 ? 1.6 : 1), c = Math.cos(ang), s = Math.sin(ang);
      tx = ax * c - az * s;tz = ax * s + az * c;
    }
    if (b.float) ty += Math.sin(t * 1.7 + b.phase) * 0.07 * G;
    pos.set(b.r[0] + (tx - b.r[0]) * e, b.r[1] + (ty - b.r[1]) * e + Math.sin(Math.PI * lt) * b.arc, b.r[2] + (tz - b.r[2]) * e);
    // before lifting off the heap shudders
    if (on && lt === 0 && T > 0.05) { const k = smooth(0.05, 0.5, T);pos.x += Math.sin(t * 47 + b.phase) * 0.025 * k;pos.z += Math.cos(t * 41 + b.phase) * 0.025 * k; }
    q.copy(b.qr).slerp(b.qa, e);
    if (b.float === 3) q.multiply(spinQ.setFromAxisAngle(UP, t * 0.9 * G));
    if (b.float === 2) q.premultiply(spinQ.setFromAxisAngle(UP, W.spin));
    b.bone.position.copy(pos);b.bone.quaternion.copy(q);
    if (lt >= 1 && !b.landed) {
      b.landed = true;
      // dust where a block lands (not when a built waypoint is first shown)
      if (!b.float && dt > 0 && W.T < TMAX) { const d = W.dust.find((d) => d.t >= 1) || W.dust[0];d.t = 0;d.sp.visible = true;d.sp.position.set(pos.x, b.a[1] - b.h / 2 + 0.1, pos.z); }
    }
    if (lt <= 0) b.landed = false;
  }
  W.carveGlow.opacity = G * (0.85 + 0.15 * Math.sin(t * 3)) + (on ? 0 : 0.18 + 0.12 * Math.sin(t * 2.2));
  W.circle.material.opacity = smooth(0, 0.5, T) * (0.8 + 0.15 * Math.sin(t * 2));
  W.circle.rotation.y = t * 0.15;
  W.seamMat.opacity = G * (0.8 + 0.2 * Math.sin(t * 2.6));
  W.ribbonMat.uniforms.uOpacity.value = G;
  W.ribbons[0].visible = W.ribbons[1].visible = G > 0;
  W.ribbons[0].rotation.y = t * 0.9;W.ribbons[1].rotation.y = -t * 0.7;
  const moteOn = Math.max(G, smooth(0, 0.5, T) * 0.5);
  W.moteMat.opacity = moteOn;W.points.visible = moteOn > 0;
  if (moteOn > 0) {
    const arr = W.points.geometry.attributes.position.array;
    for (let k = 0; k < W.motes.length; k++) { const m = W.motes[k];m.y = (m.y + dt * m.v) % 3.6;const a = m.a + t * 0.3;arr[k * 3] = Math.cos(a) * m.r;arr[k * 3 + 1] = m.y;arr[k * 3 + 2] = Math.sin(a) * m.r; }
    W.points.geometry.attributes.position.needsUpdate = true;
  }
  W.circle.visible = W.circle.material.opacity > 0;
  W.hint.material.opacity = on ? 0 : 0.3 + 0.2 * Math.sin(t * 2.2);W.hint.visible = !on;
  for (const d of W.dust) {
    if (d.t >= 1) continue;
    d.t = Math.min(1, d.t + dt / 0.7);d.sp.scale.setScalar(0.5 + d.t * 1.8);d.sp.material.opacity = 0.75 * (1 - d.t);d.sp.position.y += dt * 0.4;
    if (d.t >= 1) d.sp.visible = false;
  }
}
