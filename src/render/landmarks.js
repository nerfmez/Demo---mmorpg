// Zone landmarks (data: each map's `landmarks`): one set piece per zone, so every place reads as
// its own from the road. Procedural, cel-shaded and merged per colour like the wreck; static
// batching then folds them into the map's cells. Local +Z faces the landmark's `rot` (toward
// the road); colliders come from the same data in core/world.js. Built-in set pieces (wreck,
// lighthouse, den, ruin ring) are drawn by their own builders and skipped here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outlined, darker } from './toon.js';
import { createRng } from '../core/rng.js';

const PI = Math.PI;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const cone = (r, h, n = 10) => new THREE.ConeGeometry(r, h, n);
const ball = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const lump = (r, detail = 0) => new THREE.DodecahedronGeometry(r, detail);
const ring = (r, tube, arc = PI * 2, seg = 24, radial = 6) => new THREE.TorusGeometry(r, tube, radial, seg, arc);
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();

/** Collects geometry per colour and merges it into one outlined mesh each (same-hue outline). */
class Parts {
  constructor() { this.parts = new Map(); }
  add(color, geometry, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], opts = {}) {
    m4.compose(v4.set(...pos), q4.setFromEuler(e4.set(...rot)), s4.set(...(typeof scale === 'number' ? [scale, scale, scale] : scale)));
    const key = color + (opts.glow ? '|' + opts.glow : '') + (opts.double ? '|d' : '') + (opts.bare ? '|b' : '');
    if (!this.parts.has(key)) this.parts.set(key, { color, opts, geos: [] });
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    this.parts.get(key).geos.push(g.applyMatrix4(m4));
    return this;
  }
  build(group = new THREE.Group(), width = 0.035) {
    for (const { color, opts, geos } of this.parts.values()) {
      const geo = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      const mat = toon(color, { emissive: opts.glow, emissiveIntensity: opts.glow ? 0.85 : 1, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
      group.add(outlined(geo, mat, { outline: opts.bare || opts.double ? null : darker(color, 0.42), width, castShadow: !opts.glow }));
    }
    this.parts.clear();
    return group;
  }
}

/** A curve swept into a tube (vines, roots, fern stems). */
const tube = (points, r, seg = 24, radial = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, radial, false);
/** Ridge battens along the hips of an n-sided pyramid roof (they read from the top-down camera). */
function hips(p, color, n, R, base, top, turn, r = 0.07) {
  for (let i = 0; i < n; i++) { const a = turn + (i / n) * PI * 2; p.add(color, tube([[Math.sin(a) * R, base, Math.cos(a) * R], [0, top, 0]], r, 1, 5), [0, 0, 0]); }
}

// ---------------- Azure Coast ----------------

/** Headland: a vermilion shrine gate on the cliff, stone lanterns, a rope with paper streamers. */
function cliffShrine(p) {
  const RED = '#d6493b', INK = '#33292d', STONE = '#bdb7aa', GLOW = '#ffd98a';
  for (const s of [-1, 1]) {
    p.add(RED, cyl(0.24, 0.3, 4.4, 12), [s * 1.8, 2.2, 0], [0, 0, s * 0.03]);
    p.add(INK, cyl(0.36, 0.36, 0.4, 12), [s * 1.8, 0.2, 0]);
    // stone lanterns
    p.add(STONE, cyl(0.42, 0.52, 0.3, 8), [s * 3, 0.15, 1.4]);
    p.add(STONE, cyl(0.15, 0.2, 0.9, 8), [s * 3, 0.75, 1.4]);
    p.add(STONE, box(0.62, 0.12, 0.62), [s * 3, 1.25, 1.4]);
    p.add('#fff1c4', box(0.4, 0.38, 0.4), [s * 3, 1.5, 1.4], [0, 0, 0], 1, { glow: GLOW });
    p.add(STONE, cone(0.58, 0.42, 4), [s * 3, 1.9, 1.4], [0, PI / 4, 0]);
    p.add(STONE, ball(0.09, 6, 5), [s * 3, 2.15, 1.4]);
  }
  p.add(RED, box(4.6, 0.26, 0.34), [0, 3.55, 0]); // nuki
  p.add(RED, box(5.6, 0.34, 0.5), [0, 4.3, 0]); // kasagi base
  p.add(INK, box(6.2, 0.16, 0.62), [0, 4.55, 0]);
  for (const s of [-1, 1]) p.add(INK, box(0.9, 0.16, 0.62), [s * 3.2, 4.66, 0], [0, 0, s * 0.28]); // upturned ends
  p.add(INK, box(0.7, 0.9, 0.12), [0, 3.95, 0.2]);
  p.add('#e9c46a', box(0.5, 0.7, 0.04), [0, 3.95, 0.27]);
  // shimenawa rope and paper zig-zags
  p.add('#d9c48a', tube([[-1.7, 3.0, 0.25], [-0.8, 2.75, 0.3], [0, 2.7, 0.3], [0.8, 2.75, 0.3], [1.7, 3.0, 0.25]], 0.08, 16), [0, 0, 0]);
  for (const x of [-1.1, -0.35, 0.35, 1.1]) p.add('#fbfaf2', box(0.16, 0.5, 0.02), [x, 2.45, 0.32], [0, 0, x * 0.1], 1, { double: true });
}

/** Coast: a sun-bleached giant conch lying on the sand, its pink lip toward the path. */
function giantConch(p) {
  const SHELL = '#f2ddc0', BAND = '#d6a074', LIP = '#f3b3a6';
  const prof = [[0, -2.0], [0.5, -1.6], [1.15, -0.6], [1.6, 0.25], [1.7, 0.7], [1.25, 1.35], [0.75, 1.95], [0.35, 2.55], [0.06, 3.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Group();
  const q = new Parts();
  q.add(SHELL, new THREE.LatheGeometry(prof, 14), [0, 0, 0]);
  for (const [y, r] of [[1.35, 1.27], [1.95, 0.78], [2.55, 0.38]]) q.add(BAND, ring(r, 0.09, PI * 2, 18), [0, y, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; q.add(SHELL, cone(0.22, 0.75, 6), [Math.sin(a) * 1.7, 0.75, Math.cos(a) * 1.7], [Math.cos(a) * 1.3, 0, -Math.sin(a) * 1.3]); }
  q.add(BAND, ring(1.45, 0.07, PI * 2, 18), [0, -0.1, 0], [PI / 2, 0, 0]);
  q.add(LIP, ball(1, 14, 10), [0.2, -0.1, 0.9], [0, 0, 0], [1.25, 1.9, 0.45]);
  q.add('#9c6a5c', ball(1, 12, 8), [0.2, -0.1, 1.15], [0, 0, 0], [0.75, 1.4, 0.2]);
  q.build(body);
  body.rotation.set(-PI / 2 + 0.25, 0, 0.35);
  body.position.set(0, 1.45, 0);
  // tide pebbles and a starfish beside it
  for (const [x, z, r] of [[2.2, 1.5, 0.22], [-2.3, 0.8, 0.3], [1.4, -1.9, 0.18], [-1.2, 2.4, 0.2]]) p.add('#e6d6b6', ball(r, 8, 5), [x, r * 0.2, z], [0, x, 0], [1.3, 0.45, 1]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; p.add('#e98c62', cone(0.12, 0.55, 5), [2.6 + Math.sin(a) * 0.25, 0.06, 2.2 + Math.cos(a) * 0.25], [PI / 2, 0, -a]); }
  return body;
}

/** Forest: a timber ranger lookout on four splayed legs, ladder, shingle roof and a pennant. */
function watchtower(p) {
  const WOOD = '#8b5f3d', DARK = '#61422b', ROOF = '#557f4b', FLAG = '#e7c45c';
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    p.add(WOOD, cyl(0.15, 0.2, 6.2, 8), [sx * 1.25, 3.0, sz * 1.25], [-sz * 0.06, 0, sx * 0.06]);
    p.add(DARK, cyl(0.12, 0.12, 1.7, 6), [sx * 1.15, 6.55, sz * 1.15]);
  }
  for (const s of [-1, 1]) for (const y of [1.6, 3.6]) {
    p.add(DARK, box(0.12, 0.12, 3.1), [s * 1.3, y, 0], [s * 0.55, 0, 0]);
    p.add(DARK, box(3.1, 0.12, 0.12), [0, y, s * 1.3], [0, 0, s * 0.55]);
  }
  p.add(WOOD, box(3.3, 0.22, 3.3), [0, 5.7, 0]);
  for (const s of [-1, 1]) { p.add(DARK, box(3.3, 0.1, 0.1), [0, 6.35, s * 1.6]); p.add(DARK, box(0.1, 0.1, 3.3), [s * 1.6, 6.35, 0]); }
  p.add(ROOF, cone(2.6, 1.9, 4), [0, 8.3, 0], [0, PI / 4, 0]);
  hips(p, DARK, 4, 2.6, 7.35, 9.25, PI / 4, 0.09);
  p.add(DARK, ball(0.16, 8, 6), [0, 9.3, 0]);
  p.add(DARK, cyl(0.05, 0.05, 1.6, 5), [0, 9.6, 0]);
  p.add(FLAG, box(0.03, 0.5, 0.9), [0, 10.05, 0.45], [0, 0, 0], 1, { double: true });
  // ladder up the front
  for (const s of [-0.35, 0.35]) p.add(WOOD, box(0.1, 6.0, 0.1), [s, 2.85, 1.85], [0.12, 0, 0]);
  for (let y = 0.5; y < 5.6; y += 0.55) p.add(DARK, box(0.8, 0.07, 0.07), [0, y, 1.85 - (y - 2.85) * 0.12]);
  // firewood and a lantern at the foot
  for (let i = 0; i < 4; i++) p.add(WOOD, cyl(0.13, 0.13, 1.1, 6), [2.3, 0.15 + (i > 1 ? 0.24 : 0), -0.6 + (i % 2) * 0.28 + (i > 1 ? 0.14 : 0)], [PI / 2, 0, 0]);
  p.add('#fff1c4', box(0.22, 0.28, 0.22), [-1.25, 1.9, 1.45], [0, 0, 0], 1, { glow: '#ffcf7a' });
}

/** Glade: a white hexagonal gazebo wreathed in climbing roses. */
function gardenGazebo(p, rng) {
  const WHITE = '#f4efe4', ROOF = '#d77f8b', LEAF = '#5d9b4c', ROSE = ['#e3566a', '#f3a1b2', '#f7d26b'];
  p.add('#d8cdb6', cyl(2.95, 3.05, 0.3, 6), [0, 0.15, 0], [0, PI / 6, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2, x = Math.sin(a) * 2.4, z = Math.cos(a) * 2.4;
    p.add(WHITE, cyl(0.12, 0.14, 2.7, 8), [x, 1.6, z]);
    const b = a + PI / 6, nx = Math.sin(b) * 2.08, nz = Math.cos(b) * 2.08;
    p.add(WHITE, box(2.35, 0.1, 0.08), [nx, 2.85, nz], [0, b + PI / 2, 0]);
    if (i !== 0) { p.add(WHITE, box(2.35, 0.08, 0.06), [nx, 0.95, nz], [0, b + PI / 2, 0]); for (let k = -2; k <= 2; k++) p.add(WHITE, box(0.05, 0.6, 0.05), [nx + Math.sin(b + PI / 2) * k * 0.42, 0.65, nz + Math.cos(b + PI / 2) * k * 0.42]); }
    // roses climbing each post
    for (let k = 0; k < 7; k++) {
      const y = 0.5 + k * 0.38, ang = a + k * 1.7;
      p.add(LEAF, ball(0.22, 7, 5), [x + Math.sin(ang) * 0.2, y, z + Math.cos(ang) * 0.2], [0, 0, 0], [1, 0.7, 1]);
      if (k % 2) p.add(rng.pick(ROSE), ball(0.12, 7, 5), [x + Math.sin(ang) * 0.3, y + 0.1, z + Math.cos(ang) * 0.3]);
    }
  }
  p.add(ROOF, cone(3.3, 2.3, 6), [0, 4.05, 0], [0, PI / 6, 0]);
  hips(p, WHITE, 6, 3.3, 2.9, 5.2, PI / 6, 0.09);
  p.add(WHITE, cyl(0.45, 0.5, 0.5, 6), [0, 5.2, 0], [0, PI / 6, 0]);
  p.add(ROOF, cone(0.65, 0.6, 6), [0, 5.75, 0], [0, PI / 6, 0]);
  p.add(WHITE, cyl(3.3, 3.3, 0.14, 6), [0, 2.95, 0], [0, PI / 6, 0]);
  p.add('#e6bd5a', ball(0.17, 8, 6), [0, 6.2, 0]);
  p.add('#e6bd5a', cyl(0.04, 0.04, 0.4, 5), [0, 6.0, 0]);
  // garland along the eaves
  for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; p.add(i % 3 ? LEAF : rng.pick(ROSE), ball(i % 3 ? 0.2 : 0.15, 7, 5), [Math.sin(a) * 3.1, 2.85, Math.cos(a) * 3.1]); }
  p.add('#9a6a44', box(1.6, 0.12, 0.5), [0, 0.75, -1.5]);
  for (const s of [-0.65, 0.65]) p.add('#9a6a44', box(0.1, 0.45, 0.4), [s, 0.5, -1.5]);
}

/** Highlands: a plastered stone windmill with turning sails. */
function windmill(p, g) {
  const PLASTER = '#ece2cc', STONE = '#a9a39a', ROOF = '#b1573f', WOOD = '#7a5236', SAIL = '#f4ead2';
  p.add(STONE, cyl(2.45, 2.6, 0.8, 14), [0, 0.4, 0]);
  p.add(PLASTER, cyl(1.65, 2.25, 6.4, 14), [0, 3.9, 0]);
  p.add(STONE, cyl(1.75, 1.75, 0.3, 14), [0, 7.15, 0]);
  p.add(ROOF, cone(2.15, 2.1, 14), [0, 8.3, 0]);
  p.add(WOOD, box(1.1, 1.8, 0.2), [0, 1.6, 2.15], [-0.07, 0, 0]);
  p.add('#5e3f29', box(1.3, 0.2, 0.3), [0, 2.6, 2.1]);
  for (const [y, a] of [[4.2, 0.6], [5.6, -0.7], [3.4, PI - 0.5]]) p.add('#5f7f97', box(0.5, 0.65, 0.12), [Math.sin(a) * 2.0, y, Math.cos(a) * 2.0], [0, a, 0]);
  p.add(WOOD, cyl(0.28, 0.32, 1.2, 8), [0, 6.6, 2.0], [PI / 2, 0, 0]);
  // flour sacks at the door
  for (const [x, z] of [[1.4, 2.6], [1.9, 2.2], [1.6, 2.4]]) p.add('#e8dcc0', ball(0.35, 8, 6), [x, 0.3, z], [0, 0, 0], [1, 1.1, 0.9]);
  const s = new Parts();
  s.add(WOOD, cyl(0.35, 0.35, 0.4, 10), [0, 0, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4, c = Math.cos(a), si = Math.sin(a);
    s.add(WOOD, box(0.2, 4.6, 0.14), [si * 2.4, c * 2.4, 0.1], [0, 0, -a]);
    s.add(SAIL, box(1.0, 3.5, 0.05), [si * 2.75 + c * 0.6, c * 2.75 - si * 0.6, 0.12], [0, 0, -a], 1, { double: true });
    for (let k = 0; k < 4; k++) { const d = 1.2 + k * 0.95; s.add(WOOD, box(1.1, 0.05, 0.06), [si * d + c * 0.6, c * d - si * 0.6, 0.15], [0, 0, -a]); }
  }
  const sails = s.build(new THREE.Group(), 0.03);
  sails.position.set(0, 6.6, 2.75);
  sails.rotation.z = 0.4;
  // static batching freezes scenery matrices: the sails move themselves just before drawing
  sails.traverse((o) => { if (o.isMesh) o.onBeforeRender = spin(sails, 0.55); });
  sails.name = 'landmark-spinner';
  g.add(sails);
}

function spin(pivot, speed) {
  return () => {
    pivot.rotation.z = 0.4 + (performance.now() / 1000) * speed;
    pivot.updateMatrix();
    pivot.updateMatrixWorld(true);
  };
}

/** Meadow: the old stone well under a little roof, a scarecrow and haystacks. */
function farmWell(p) {
  const STONE = '#b2aca0', WOOD = '#8a5d3b', ROOF = '#a24e3a', HAY = '#e3c165', CLOTH = '#c9503f';
  p.add(STONE, cyl(1.0, 1.08, 0.95, 14), [0, 0.48, 0]);
  p.add('#d2ccbe', ring(0.95, 0.12, PI * 2, 18), [0, 0.95, 0], [PI / 2, 0, 0]);
  p.add('#3d6a86', cyl(0.82, 0.82, 0.05, 14), [0, 0.8, 0], [0, 0, 0], 1, { bare: true });
  for (const s of [-1, 1]) p.add(WOOD, box(0.16, 2.1, 0.16), [s * 0.95, 1.6, 0]);
  p.add(WOOD, cyl(0.07, 0.07, 2.2, 6), [0, 2.1, 0], [0, 0, PI / 2]);
  for (const s of [-1, 1]) p.add(ROOF, box(2.6, 0.08, 1.05), [0, 2.95, s * 0.42], [s * 0.55, 0, 0]);
  p.add(WOOD, box(2.6, 0.12, 0.12), [0, 3.2, 0]);
  p.add(WOOD, cyl(0.02, 0.02, 0.9, 4), [0.2, 1.65, 0]);
  p.add('#8a7660', cyl(0.18, 0.15, 0.3, 8), [0.2, 1.1, 0]);
  p.add(WOOD, box(0.35, 0.06, 0.06), [1.15, 2.1, 0.15]);
  // scarecrow
  p.add(WOOD, cyl(0.06, 0.07, 2.4, 6), [3.2, 1.2, -1]);
  p.add(WOOD, cyl(0.05, 0.05, 1.7, 6), [3.2, 1.85, -1], [0, 0, PI / 2]);
  p.add(CLOTH, box(0.7, 0.75, 0.3), [3.2, 1.65, -1]);
  p.add('#e7d6a8', ball(0.25, 8, 6), [3.2, 2.3, -1]);
  p.add(HAY, cone(0.5, 0.35, 10), [3.2, 2.58, -1]);
  p.add(HAY, cyl(0.55, 0.55, 0.05, 10), [3.2, 2.45, -1]);
  for (const s of [-1, 1]) p.add(HAY, cone(0.09, 0.3, 5), [3.2 + s * 0.9, 1.8, -1], [0, 0, s * PI / 2]);
  // haystacks
  p.add(HAY, cyl(1.0, 1.1, 1.1, 12), [-3, 0.55, -1.6]);
  p.add(HAY, cone(1.05, 1.0, 12), [-3, 1.6, -1.6]);
  p.add(HAY, cyl(0.6, 0.65, 0.7, 10), [-1.9, 0.35, -2.6]);
  p.add(HAY, cone(0.62, 0.55, 10), [-1.9, 0.98, -2.6]);
  p.add(WOOD, box(0.06, 1.9, 0.06), [-2.4, 1.3, -1.0], [0.3, 0, -0.5]);
}

// ---------------- Greenhollow Frontier ----------------

/** Settlement: a timber bell tower on a stone footing with a red pyramid roof. */
function bellTower(p) {
  const STONE = '#aaa497', WOOD = '#7d5537', ROOF = '#b4513e', BRONZE = '#c8913c';
  p.add(STONE, box(2.6, 1.0, 2.6), [0, 0.5, 0]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(WOOD, box(0.24, 5.2, 0.24), [sx * 1.0, 3.6, sz * 1.0]);
  for (const y of [2.2, 4.4, 6.1]) for (const s of [-1, 1]) { p.add(WOOD, box(2.2, 0.14, 0.14), [0, y, s * 1.0]); p.add(WOOD, box(0.14, 0.14, 2.2), [s * 1.0, y, 0]); }
  for (const s of [-1, 1]) p.add(WOOD, box(0.1, 2.3, 0.1), [s * 0.55, 3.3, 1.02], [0, 0, s * 0.45]);
  p.add(ROOF, cone(1.95, 1.7, 4), [0, 7.05, 0], [0, PI / 4, 0]);
  p.add(BRONZE, cyl(0.04, 0.04, 0.7, 5), [0, 8.1, 0]);
  p.add(BRONZE, ball(0.12, 8, 6), [0, 8.5, 0]);
  const bell = [[0, 0], [0.62, 0], [0.55, 0.12], [0.42, 0.55], [0.38, 0.95], [0.25, 1.1], [0, 1.15]].map(([r, y]) => new THREE.Vector2(r, y));
  p.add(BRONZE, new THREE.LatheGeometry(bell, 14), [0, 4.85, 0]);
  p.add(WOOD, box(0.2, 0.2, 1.9), [0, 6.05, 0]);
  p.add('#6b4b2a', ball(0.12, 6, 5), [0, 4.85, 0]);
  p.add('#d7c89c', cyl(0.025, 0.025, 4.0, 4), [0.3, 3.2, 0.3]);
  p.add('#3f6fa3', box(0.04, 1.4, 0.8), [1.12, 4.0, 0.0], [0, 0, 0], 1, { double: true });
}

/** Forest: the elder mosstree, a vast trunk with buttress roots, moss and glowing caps. */
function elderMosstree(p, rng) {
  const BARK = '#79583d', MOSS = '#7fae5b', LEAF = ['#5f9b51', '#73ad5d', '#4f8a4a'], CAP = '#2d8f6c';
  p.add(BARK, cyl(1.5, 2.3, 7.5, 14), [0, 3.75, 0]);
  p.add(BARK, cyl(1.05, 1.5, 2.5, 12), [0, 8.6, 0]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + 0.3, l = 2.4 + rng.range(0, 1.4);
    p.add(BARK, tube([[Math.sin(a) * 1.6, 2.2, Math.cos(a) * 1.6], [Math.sin(a) * (1.9 + l * 0.4), 1.2, Math.cos(a) * (1.9 + l * 0.4)], [Math.sin(a) * (1.9 + l), 0.1, Math.cos(a) * (1.9 + l)]], 0.42, 12, 7), [0, 0, 0]);
  }
  for (const [y, a, l] of [[7.6, 0.4, 3.2], [8.4, 2.5, 3.0], [8.0, 4.4, 3.4], [9.2, 5.7, 2.4]]) p.add(BARK, tube([[0, y, 0], [Math.sin(a) * l * 0.5, y + 1.0, Math.cos(a) * l * 0.5], [Math.sin(a) * l, y + 1.5, Math.cos(a) * l]], 0.35, 10, 6), [0, 0, 0]);
  for (let i = 0; i < 11; i++) {
    const a = rng.range(0, PI * 2), r = rng.range(1.5, 4.2), y = rng.range(9.6, 12.2);
    p.add(rng.pick(LEAF), new THREE.IcosahedronGeometry(rng.range(1.9, 2.8), 1), [Math.sin(a) * r, y, Math.cos(a) * r], [0, a, 0], [1, 0.72, 1]);
  }
  for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2, y = rng.range(1.5, 6.5); p.add(MOSS, ball(0.55, 8, 6), [Math.sin(a) * (1.75 - y * 0.06), y, Math.cos(a) * (1.75 - y * 0.06)], [0, a, 0], [1.2, 0.8, 0.5]); }
  for (let i = 0; i < 12; i++) { const a = rng.range(0, PI * 2), r = rng.range(3.0, 4.6); p.add('#a8c98a', cone(0.07, rng.range(1.2, 2.4), 4), [Math.sin(a) * r, rng.range(8.0, 9.0), Math.cos(a) * r], [PI, 0, 0]); }
  for (let i = 0; i < 8; i++) {
    const a = rng.range(0, PI * 2), r = rng.range(2.4, 3.8), x = Math.sin(a) * r, z = Math.cos(a) * r;
    p.add('#efe6cf', cyl(0.06, 0.08, 0.3, 6), [x, 0.15, z]);
    p.add('#7fd9b4', ball(0.2, 8, 5), [x, 0.32, z], [0, 0, 0], [1, 0.5, 1], { glow: CAP });
  }
  p.add('#4a3322', ball(0.75, 10, 8), [0, 1.0, 1.95], [0, 0, 0], [0.9, 1.3, 0.35]); // hollow
}

/** Glade: an arch of twisted bramble with wild roses, thorns all along. */
function brambleArch(p, rng) {
  const VINE = '#5c5a31', DARK = '#47452a', LEAF = '#5e9a45', ROSE = ['#d63c4f', '#f08aa0', '#f5c2cf'];
  for (const [k, off] of [[0, 0], [1, 0.25], [2, -0.25]]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, a = PI * t;
      pts.push([-Math.cos(a) * (2.6 + 0.1 * k), Math.sin(a) * (4.0 - 0.15 * k) + 0.05, Math.sin(t * PI * 5 + k * 2) * 0.22 + off]);
    }
    p.add(k ? DARK : VINE, tube(pts, k ? 0.17 : 0.27, 40, 6), [0, 0, 0]);
  }
  for (let i = 0; i < 46; i++) {
    const t = rng.range(0.02, 0.98), a = PI * t, x = -Math.cos(a) * 2.65, y = Math.sin(a) * 4.0, z = rng.range(-0.35, 0.35);
    const r = rng.next();
    if (r < 0.35) p.add(DARK, cone(0.05, 0.3, 4), [x, y, z], [rng.range(-1.5, 1.5), 0, rng.range(-1.5, 1.5)]);
    else if (r < 0.75) p.add(LEAF, ball(0.2, 6, 4), [x, y, z], [0, 0, 0], [1, 0.55, 1]);
    else p.add(rng.pick(ROSE), ball(0.17, 7, 5), [x, y, z + 0.1]);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) p.add(LEAF, lump(0.45 + i * 0.05), [s * (2.6 + rng.range(-0.4, 0.6)), 0.3, rng.range(-0.8, 0.8)], [0, i, 0], [1, 0.7, 1]);
}

/** Wetland: a glowing crystal spire rising from a mossy stone mound with shards around it. */
function glimmerSpire(p, rng) {
  const STONE = '#8e958e', MOSS = '#6f9f63', CRY = '#a8ecff', GLOW = '#4fb8d8';
  p.add(STONE, lump(1.8, 0), [0, 0.3, 0], [0, 0.4, 0], [1.1, 0.5, 1.1]);
  p.add(MOSS, lump(1.5, 0), [0.3, 0.55, 0.2], [0, 1.1, 0], [1, 0.3, 1]);
  p.add(CRY, new THREE.OctahedronGeometry(1, 0), [0, 3.4, 0], [0, 0.3, 0.05], [0.75, 3.2, 0.75], { glow: GLOW });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + 0.4, l = rng.range(1.2, 2.2);
    p.add(CRY, new THREE.OctahedronGeometry(1, 0), [Math.sin(a) * 0.85, 1.4 + l * 0.4, Math.cos(a) * 0.85], [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45], [0.35, l, 0.35], { glow: GLOW });
  }
  for (const [x, z] of [[2.1, 1], [-1.9, 1.4], [0.6, -2.2]]) {
    p.add(STONE, lump(0.45), [x, 0.2, z], [0, x, 0], [1, 0.6, 1]);
    p.add(CRY, new THREE.OctahedronGeometry(1, 0), [x, 0.85, z], [0.2, x, 0.15], [0.25, 0.75, 0.25], { glow: GLOW });
  }
  // a ring of rune stones on the mound
  for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + PI / 4; p.add('#c9cfc6', box(0.35, 0.9, 0.2), [Math.sin(a) * 2.6, 0.4, Math.cos(a) * 2.6], [0, a, 0.05]); p.add('#e6fbff', box(0.12, 0.4, 0.03), [Math.sin(a) * 2.49, 0.5, Math.cos(a) * 2.49], [0, a, 0], 1, { glow: GLOW, bare: true }); }
}

/** Coast: a sandstone sea arch, banded rock, barnacles and kelp at its feet. */
function seaArch(p, rng) {
  const ROCK = '#c7a77f', BAND = '#a8865f', KELP = '#5a7d3e';
  for (const s of [-1, 1]) {
    p.add(ROCK, lump(1.6, 0), [s * 3.3, 1.4, 0], [0, s, 0], [0.95, 1.5, 0.9]);
    p.add(BAND, lump(1.25, 0), [s * 3.4, 3.2, 0.1], [0, s * 2, 0], [0.9, 0.9, 0.8]);
    for (let i = 0; i < 3; i++) p.add(ROCK, lump(rng.range(0.5, 0.9)), [s * (3.3 + rng.range(0.8, 1.8)), 0.3, rng.range(-1.2, 1.2)], [0, i, 0], [1, 0.6, 1]);
    for (let i = 0; i < 4; i++) p.add(KELP, cone(0.12, rng.range(0.6, 1.1), 4), [s * 3.3 + rng.range(-1, 1), 0.3, rng.range(0.9, 1.3)], [rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)]);
  }
  p.add(ROCK, ring(3.3, 1.05, PI, 14, 5), [0, 3.2, 0], [0, 0, 0], [1, 0.95, 0.9]);
  p.add(BAND, ring(3.3, 1.1, PI * 0.8, 10, 5), [0, 3.25, 0.05], [0, 0, PI * 0.1], [1, 0.95, 0.85]);
  for (let i = 0; i < 10; i++) { const a = rng.range(0.15, PI - 0.15); p.add('#efe6d2', cone(0.1, 0.12, 5), [Math.cos(a) * 3.3, 3.2 + Math.sin(a) * 4.35, rng.range(-0.3, 0.3)]); }
  // a lone gull perched on top
  p.add('#f5f5f0', ball(0.2, 8, 6), [0.4, 7.6, 0], [0, 0, 0], [1.4, 0.8, 0.8]);
  p.add('#f5f5f0', ball(0.11, 6, 5), [0.68, 7.75, 0]);
  p.add('#e7a43c', cone(0.04, 0.14, 4), [0.82, 7.75, 0], [0, 0, -PI / 2]);
  p.add('#9aa2aa', box(0.5, 0.04, 0.18), [0.35, 7.68, 0], [0, 0, 0.15]);
}

/** Meadow: a great stone sundial with hour stones and a bronze gnomon. */
function sundial(p) {
  const STONE = '#d9d0b8', EDGE = '#b6ab92', BRONZE = '#c99a46';
  p.add(EDGE, cyl(2.75, 2.95, 0.3, 28), [0, 0.15, 0]);
  p.add(STONE, cyl(2.55, 2.6, 0.2, 28), [0, 0.38, 0]);
  p.add('#cdb984', ring(2.1, 0.05, PI * 2, 36), [0, 0.49, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2, big = i % 3 === 0;
    p.add(big ? BRONZE : EDGE, box(big ? 0.2 : 0.12, 0.1, big ? 0.5 : 0.34), [Math.sin(a) * 2.25, 0.5, Math.cos(a) * 2.25], [0, a, 0]);
  }
  const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.0, 0), new THREE.Vector2(0, 2.4)]);
  const gnomon = new THREE.ExtrudeGeometry(tri, { depth: 0.16, bevelEnabled: false });
  gnomon.translate(-1.0, 0, -0.08);
  p.add(BRONZE, gnomon, [0, 0.48, 0], [0, PI / 2, 0]);
  p.add(BRONZE, ring(0.42, 0.06, PI * 2, 16), [0, 2.55, -0.9], [0, PI / 2, 0]);
  p.add('#f2cf63', ball(0.24, 10, 8), [0, 2.55, -0.9], [0, 0, 0], 1, { glow: '#d99a2c' });
  for (const s of [-1, 1]) for (const k of [-1, 1]) p.add(EDGE, box(0.6, 0.25, 0.9), [s * 3.25, 0.12, k * 0.9], [0, s * 0.2, 0]);
}

/** Highlands: a stone cairn tower with an iron brazier burning on top. */
function cragBeacon(p, rng) {
  const STONE = ['#9e9a93', '#aaa49a', '#8f8b85'], IRON = '#4a4a52', FIRE = '#ffb347';
  let y = 0;
  for (let i = 0; i < 6; i++) {
    const r = 1.7 - i * 0.16, h = 0.75;
    p.add(rng.pick(STONE), cyl(r * 0.92, r, h, 9), [rng.range(-0.06, 0.06), y + h / 2, rng.range(-0.06, 0.06)], [0, rng.range(0, 1), 0]);
    y += h;
  }
  p.add(IRON, cyl(0.85, 0.45, 0.6, 10), [0, y + 0.45, 0]);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; p.add(IRON, box(0.08, 0.8, 0.08), [Math.sin(a) * 0.55, y + 0.1, Math.cos(a) * 0.55], [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4]); }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; p.add(i % 2 ? FIRE : '#ffe28a', cone(0.28, rng.range(0.9, 1.4), 6), [Math.sin(a) * 0.35, y + 1.2, Math.cos(a) * 0.35], [Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2], 1, { glow: '#ff7a1a' }); }
  p.add('#fff2b0', cone(0.3, 1.8, 6), [0, y + 1.5, 0], [0, 0, 0], 1, { glow: '#ffb03a' });
  // a pennant pole and loose stones
  p.add('#6d4a30', cyl(0.06, 0.07, 3.4, 6), [1.5, 1.7, 0.9]);
  p.add('#3f6fa3', box(0.03, 0.55, 1.0), [1.5, 3.1, 1.4], [0, 0, 0], 1, { double: true });
  for (let i = 0; i < 6; i++) { const a = rng.range(0, PI * 2), r = rng.range(2.1, 3.2); p.add(rng.pick(STONE), lump(rng.range(0.25, 0.45)), [Math.sin(a) * r, 0.15, Math.cos(a) * r], [0, a, 0], [1, 0.7, 1]); }
}

// ---------------- Moonroot Grove ----------------

/** Camp: the pale moonstone monolith the camp is named for, a carved crescent glowing on it. */
function moonstone(p) {
  const STONE = '#dfe6f2', GLOW = '#8fc7ff';
  p.add(STONE, cyl(0.45, 0.8, 3.8, 6), [0, 1.9, 0], [0.04, 0.2, -0.05]);
  p.add(STONE, cone(0.45, 0.6, 6), [0.05, 4.1, -0.05], [0.04, 0.2, -0.05]);
  for (const s of [1, -1]) p.add('#eef7ff', ring(0.38, 0.07, PI * 1.25, 16), [0.02, 2.7, s * 0.56], [0, 0, PI * 0.4], 1, { glow: GLOW, bare: true });
  p.add('#9fa7b4', cyl(1.2, 1.3, 0.25, 12), [0, 0.12, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.3, x = Math.sin(a) * 1.0, z = Math.cos(a) * 1.0;
    if (i % 2) { p.add('#f3ead6', cyl(0.06, 0.06, 0.22, 6), [x, 0.36, z]); p.add('#ffe7a8', cone(0.04, 0.1, 5), [x, 0.53, z], [0, 0, 0], 1, { glow: '#ffbf4a', bare: true }); }
    else p.add('#c6d4e6', lump(0.12), [x, 0.3, z]);
  }
}

/** Stone ring: a crescent moon carved in pale stone on a round dais with a floating orb. */
function moonAltar(p) {
  const STONE = '#cfc9d9', DARK = '#a8a1b8', GLOW = '#b6c8ff';
  p.add(DARK, cyl(1.65, 1.85, 0.35, 12), [0, 0.18, 0]);
  p.add(STONE, cyl(1.3, 1.45, 0.3, 12), [0, 0.5, 0]);
  p.add(STONE, box(0.6, 0.9, 0.5), [0, 1.1, 0]);
  p.add('#ebe7f4', ring(1.0, 0.24, PI * 1.35, 24, 8), [0, 2.55, 0], [0, 0, -PI * 0.42], 1, { glow: '#6d7bb8' });
  p.add('#f5f8ff', ball(0.28, 12, 10), [0.05, 2.5, 0], [0, 0, 0], 1, { glow: GLOW });
  for (let i = 0; i < 3; i++) p.add(DARK, box(0.9, 0.15, 0.45), [0, 0.07, 1.95 + i * 0.01], [0, (i - 1) * 0.5, 0]);
}

/** Fern rise: giant fiddleheads curling up out of a bed of big fronds. */
function fiddleheads(p, rng) {
  const STEM = '#6aa54a', TIP = '#93c86a', FROND = ['#5e9b47', '#71ae55'];
  for (const [x, z, h, turn] of [[0, 0, 4.4, 0.3], [1.7, 0.8, 3.2, 2.1], [-1.5, 1.1, 3.6, 4.0]]) {
    const pts = [[x, 0, z]];
    for (let i = 1; i <= 6; i++) pts.push([x + Math.sin(turn) * i * 0.04, (h * i) / 6, z + Math.cos(turn) * i * 0.04]);
    // the curl: a shrinking spiral over the top
    for (let i = 1; i <= 14; i++) {
      const t = i / 14, a = t * PI * 2.4, r = 0.75 * (1 - t * 0.85);
      pts.push([x + Math.sin(turn) * (Math.sin(a) * r + 0.25), h + (1 - Math.cos(a)) * r * 0.9, z + Math.cos(turn) * (Math.sin(a) * r + 0.25)]);
    }
    p.add(STEM, tube(pts, 0.16, 60, 7), [0, 0, 0]);
    p.add(TIP, ball(0.22, 8, 6), pts[pts.length - 1]);
    for (let k = 0; k < 8; k++) { const t = 0.25 + k * 0.08; p.add(TIP, ball(0.09, 5, 4), [x + rng.range(-0.15, 0.15), h * t, z + rng.range(-0.15, 0.15)], [0, 0, 0], [1.6, 0.5, 1]); }
  }
  // unfurled fronds fanned around the base
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + rng.range(-0.2, 0.2), l = rng.range(1.8, 2.6);
    p.add(rng.pick(FROND), ball(1, 8, 6), [Math.sin(a) * l * 0.55, 0.55, Math.cos(a) * l * 0.55], [0.5 * Math.cos(a), a, -0.5 * Math.sin(a)], [0.45, 0.12, l * 0.6]);
  }
}

/** Mirror pond: a round stone frame holding a pale glowing mirror, moth wings carved on top. */
function moonMirror(p) {
  const STONE = '#cdc6d8', DARK = '#9f98ae', WING = '#e3e8f7', GLOW = '#2f6b9a';
  p.add(DARK, box(1.9, 0.35, 0.9), [0, 0.18, 0]);
  p.add(STONE, box(1.3, 0.45, 0.6), [0, 0.55, 0]);
  p.add(STONE, ring(1.3, 0.17, PI * 2, 32, 7), [0, 2.15, 0]);
  p.add('#b9dcf0', new THREE.CircleGeometry(1.16, 32), [0, 2.15, 0], [0, 0, 0], 1, { glow: GLOW, double: true });
  for (const z of [0.02, -0.02]) p.add('#f4fbff', box(0.16, 1.5, 0.01), [-0.35, 2.3, z], [0, 0, -0.6], 1, { bare: true });
  for (const s of [-1, 1]) {
    p.add(STONE, cyl(0.12, 0.15, 1.6, 8), [s * 1.25, 1.1, 0]);
    p.add(WING, ball(1, 12, 8), [s * 0.55, 3.6, 0], [0, 0, s * 0.5], [0.6, 0.28, 0.06]);
    p.add(WING, ball(1, 12, 8), [s * 0.42, 3.25, 0], [0, 0, -s * 0.4], [0.35, 0.2, 0.06]);
  }
  p.add(DARK, ball(0.13, 8, 6), [0, 3.45, 0], [0, 0, 0], [1, 1.8, 1]);
}

/** Root warren: a vast gnarled root arching out of the ground, burrow mounds at its feet. */
function rootArch(p, rng) {
  const BARK = '#6d4a32', DARK = '#553824', DIRT = '#8b6a49', HOLE = '#2f2219', CAP = '#6a3cb0';
  const arch = (r, h, z0, k) => {
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14, a = PI * t; pts.push([-Math.cos(a) * r, Math.sin(a) * h - 0.3, z0 + Math.sin(t * PI * 3 + k) * 0.35]); }
    return pts;
  };
  p.add(BARK, tube(arch(3.4, 4.4, 0, 0), 0.75, 40, 9), [0, 0, 0]);
  p.add(DARK, tube(arch(2.7, 3.2, 0.9, 2), 0.4, 32, 7), [0, 0, 0], [0, 0.35, 0]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = rng.range(-1.2, 1.2), l = rng.range(1.2, 2.2);
    p.add(DARK, tube([[s * 3.4, 0.6, 0], [s * (3.4 + l * 0.6), 0.2, Math.sin(a) * l * 0.6], [s * (3.4 + l), -0.1, Math.sin(a) * l]], 0.18, 8, 5), [0, 0, 0]);
  }
  for (let i = 0; i < 7; i++) { const t = rng.range(0.2, 0.8), a = PI * t; p.add('#7ea65a', ball(0.3, 7, 5), [-Math.cos(a) * 3.4, Math.sin(a) * 4.4 + 0.3, rng.range(-0.4, 0.4)], [0, 0, 0], [1.3, 0.5, 1]); }
  for (const [x, z, r] of [[-1.2, 2.4, 0.9], [1.9, -2.1, 0.75], [-2.4, -2.5, 0.6]]) {
    p.add(DIRT, new THREE.SphereGeometry(r, 10, 6, 0, PI * 2, 0, PI / 2), [x, -0.05, z], [0, 0, 0], [1.2, 0.55, 1.2]);
    p.add(HOLE, new THREE.CircleGeometry(r * 0.45, 12), [x, r * 0.5, z + r * 0.62], [-0.5, 0, 0], 1, { bare: true, double: true });
  }
  for (let i = 0; i < 6; i++) { const a = rng.range(0, PI * 2), r = rng.range(1.2, 3.0), x = Math.sin(a) * r, z = Math.cos(a) * r; p.add('#efe2ff', cyl(0.05, 0.06, 0.25, 5), [x, 0.12, z]); p.add('#b98be6', ball(0.16, 8, 5), [x, 0.27, z], [0, 0, 0], [1, 0.5, 1], { glow: CAP }); }
}

const BUILDERS = {
  cliff_shrine: cliffShrine, giant_conch: giantConch, watchtower, garden_gazebo: gardenGazebo, windmill, farm_well: farmWell,
  bell_tower: bellTower, elder_mosstree: elderMosstree, bramble_arch: brambleArch, glimmer_spire: glimmerSpire,
  sea_arch: seaArch, sundial, crag_beacon: cragBeacon,
  moonstone, moon_altar: moonAltar, fiddlehead_ferns: fiddleheads, moon_mirror: moonMirror, root_arch: rootArch,
};
export const LANDMARK_KINDS = Object.keys(BUILDERS);
const SCALE = { windmill: 0.8 };

/** One landmark's model, origin at its foot, +Z toward its `rot`. */
export function buildLandmark(kind, seed = 1) {
  const build = BUILDERS[kind];
  if (!build) return null;
  const g = new THREE.Group(), p = new Parts(), rng = createRng(seed);
  const pick = { next: () => rng.next(), range: (a, b) => a + (b - a) * rng.next(), pick: (list) => list[Math.floor(rng.next() * list.length)] };
  const extra = build(p, kind === 'windmill' ? g : pick);
  p.build(g);
  if (extra) g.add(extra);
  g.scale.setScalar(SCALE[kind] || 1);
  g.name = 'landmark-' + kind;
  return g;
}

/** Every drawn landmark of the map, standing on the ground (a slight sink hides the base seam). */
export function createLandmarks(world, groundY = (x, z) => world.groundY(x, z)) {
  const root = new THREE.Group();
  root.name = 'landmarks';
  for (const [i, lm] of (world.landmarks || []).entries()) {
    if (lm.builtin) continue;
    const g = buildLandmark(lm.kind, 101 + i * 17);
    if (!g) continue;
    let low = Infinity;
    for (const part of [{ x: lm.x, z: lm.z }, ...lm.parts]) low = Math.min(low, groundY(part.x, part.z));
    g.position.set(lm.x, low - 0.08, lm.z);
    g.rotation.y = lm.rot || 0;
    root.add(g);
  }
  return root;
}
