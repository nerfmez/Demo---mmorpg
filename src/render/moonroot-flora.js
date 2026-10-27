// Moonroot's woods (data look.roots / look.undergrowth): long root flares at every tree's foot,
// surface roots snaking over the ground, and each zone's own plants. All built once at load in the
// game trunk's faceted bark style (render/anime-study.js animeTrunk); no per-frame work.
import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { animeConfig } from './anime-study.js';

const SUN = new THREE.Vector3(-.6, .55, .55).normalize();
const SIDES = 6;
let palette = null;
const bark = () => palette ??= ['trunkLight', 'trunkMid', 'trunkShadow'].map((k) => new THREE.Color(animeConfig.palette[k]));

// One faceted tube along points [x, y, z, radius], toned light, mid or shadow by the sun.
function writeTube(path, p, n, c) {
  const [light, mid, shadow] = bark(), tone = new THREE.Color();
  const rings = path.map(([x, y, z, r], i) => {
    const prev = new THREE.Vector3(...path[Math.max(0, i - 1)].slice(0, 3)), next = new THREE.Vector3(...path[Math.min(path.length - 1, i + 1)].slice(0, 3));
    const t = next.sub(prev).normalize(), up = Math.abs(t.y) > .95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const across = up.clone().cross(t).normalize(), along = t.clone().cross(across).normalize(), centre = new THREE.Vector3(x, y, z);
    return Array.from({ length: SIDES }, (_, k) => {
      const a = (k / SIDES) * Math.PI * 2, no = across.clone().multiplyScalar(Math.cos(a)).addScaledVector(along, Math.sin(a));
      return { v: centre.clone().addScaledVector(no, r), no };
    });
  });
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < SIDES; k++) {
    const kk = (k + 1) % SIDES, q = [rings[j][k], rings[j][kk], rings[j + 1][kk], rings[j + 1][k]];
    const normal = q[0].no.clone().add(q[1].no).normalize(), lit = normal.dot(SUN);
    if (lit > .33) tone.copy(mid).lerp(light, THREE.MathUtils.smoothstep(lit, .33, .9));
    else tone.copy(shadow).lerp(mid, THREE.MathUtils.smoothstep(lit, -.65, .33));
    for (const id of [0, 1, 2, 0, 2, 3]) { p.push(...q[id].v.toArray()); n.push(...normal.toArray()); c.push(tone.r, tone.g, tone.b); }
  }
}
const geometry = (p, n, c) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
};

/** A tree's root flare at scale 1 (the trunk's foot is radius ~0.48): 5-7 thick roots leaving the
 *  trunk above the ground, arching down and running out 1.4-2.6 m, their tips sunk into the soil. */
export function rootFlareGeometry(seed) {
  const r = createRng(seed), p = [], n = [], c = [], count = 5 + Math.floor(r.next() * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r.range(-.35, .35), len = r.range(1.4, 2.6), bend = r.range(-.35, .35);
    const path = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, aa = a + bend * t * t, d = .2 + len * t;
      const y = .62 * Math.pow(1 - t, 1.8) + .02 - .1 * t * t;
      path.push([Math.cos(aa) * d, y, Math.sin(aa) * d, .3 * Math.pow(1 - t, 1.25) + .025]);
    }
    writeTube(path, p, n, c);
  }
  return geometry(p, n, c);
}

/** Surface roots: each a meandering tube lying on the ground (gy), thickest at the tree. */
export function groundRootGeometry(roots, gy) {
  const p = [], n = [], c = [];
  for (const root of roots) {
    const pts = root.points, path = [];
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1), [x, z] = pts[i], rad = root.r * (1 - t * .75);
      // half sunk: the ground shows round both sides, the top stands proud
      path.push([x, gy(x, z) + rad * .35, z, rad]);
    }
    writeTube(path, p, n, c);
  }
  return p.length ? geometry(p, n, c) : null;
}

// Zone plants. 'curl': a clump of pale moon-curls (the concept's white fiddlehead sprouts);
// 'glow': teal-glowing bulbs on thin stems. Each returns [body, glow] geometries with vertex colour.
function spiral(p, n, c, ox, oz, h, turn, col) {
  const pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(ox + Math.sin(t * 2) * .03, h * .62 * t, oz)); }
  const C = pts.at(-1), cr = h * .2, ax = Math.cos(turn), az = Math.sin(turn);
  for (let i = 1; i <= 10; i++) { const t = i / 10, th = Math.PI - t * Math.PI * 3.2, rr = cr * (1 - t * .75); pts.push(new THREE.Vector3(C.x + ax * cr + Math.cos(th) * rr * ax, C.y + Math.sin(th) * rr, C.z + az * cr + Math.cos(th) * rr * az)); }
  const curve = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(curve, 18, h * .065, 5, false), color = new THREE.Color(col), stem = new THREE.Color('#9fcf86');
  const pos = g.attributes.position, no = g.attributes.normal, ix = g.index;
  for (let k = 0; k < ix.count; k++) { const v = ix.getX(k), y = pos.getY(v); p.push(pos.getX(v), y, pos.getZ(v)); n.push(no.getX(v), no.getY(v), no.getZ(v)); const t = Math.min(1, y / (h * .45)), sh = .9 + .1 * Math.max(0, no.getY(v)); c.push((stem.r + (color.r - stem.r) * t) * sh, (stem.g + (color.g - stem.g) * t) * sh, (stem.b + (color.b - stem.b) * t) * sh); }
  g.dispose();
}
export function curlGeometry() {
  const p = [], n = [], c = [], r = createRng(41);
  for (let i = 0; i < 4; i++) {
    const a = i * 2.2 + r.range(-.3, .3), d = i ? r.range(.08, .2) : 0;
    spiral(p, n, c, Math.cos(a) * d, Math.sin(a) * d, r.range(.32, .5), a + r.range(-.6, .6), i % 2 ? '#f1f8dc' : '#fbfcf0');
  }
  return geometry(p, n, c);
}
export function glowGeometry() {
  const stems = [], bulbs = [], r = createRng(43), green = new THREE.Color('#4f8a5e'), teal = new THREE.Color('#8ff2e4'), pale = new THREE.Color('#e8fff6');
  const push = (list, g, color) => { const pos = g.attributes.position, no = g.attributes.normal, ix = g.index, count = ix ? ix.count : pos.count; for (let k = 0; k < count; k++) { const v = ix ? ix.getX(k) : k; list.p.push(pos.getX(v), pos.getY(v), pos.getZ(v)); list.n.push(no.getX(v), no.getY(v), no.getZ(v)); list.c.push(color.r, color.g, color.b); } g.dispose(); };
  const S = { p: [], n: [], c: [] }, B = { p: [], n: [], c: [] };
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + r.range(-.3, .3), d = i ? r.range(.06, .22) : 0, h = r.range(.18, .38), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const stem = new THREE.CylinderGeometry(.012, .018, h, 3); stem.translate(x, h / 2, z); push(S, stem, green);
    const bulb = new THREE.IcosahedronGeometry(r.range(.05, .085), 0); bulb.translate(x, h + .03, z); push(B, bulb, i % 3 ? teal : pale);
  }
  return [geometry(S.p, S.n, S.c), geometry(B.p, B.n, B.c)];
}
