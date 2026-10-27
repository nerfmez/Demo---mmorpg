// Moonroot's woods (data look.roots / look.undergrowth): long root flares at every tree's foot,
// surface roots snaking over the ground, and each zone's own plants. All built once at load in the
// game trunk's faceted bark style (render/anime-study.js animeTrunk); no per-frame work.
import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { animeConfig } from './anime-study.js';

const SUN = new THREE.Vector3(-.6, .55, .55).normalize();
const SIDES = 6;
// the bark colours in use: a map's look.trunk ({light, mid, shadow, moss?}) or the game's trunk palette
let palette = null, moss = null;
export function setBark(look) {
  palette = look ? [look.light, look.mid, look.shadow].map((c) => new THREE.Color(c)) : null;
  moss = look?.moss ? new THREE.Color(look.moss) : null;
}
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
    // moss on the tops of the roots, in broken streaks along them
    if (moss) tone.lerp(moss, .6 * THREE.MathUtils.smoothstep(normal.y, .3, .75) * (j % 4 < 3 ? 1 : .3));
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

// The trunk's radius at height h (the anime trunk's spine), so a root is as thick as the bark it leaves.
function trunkRadius(h) {
  const sp = animeConfig.trunk.spine;
  for (let i = 1; i < sp.length; i++) if (h <= sp[i][1]) { const t = (h - sp[i - 1][1]) / (sp[i][1] - sp[i - 1][1]); return sp[i - 1][3] + (sp[i][3] - sp[i - 1][3]) * t; }
  return sp.at(-1)[3];
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// One root at scale 1, as Mirror Pond's approved rootTree: it leaves the bark at height hs inside the
// trunk, curves down onto the ground within a short flare and runs on half buried, tapering to a point.
function rootPath(a, hs, len, wobble) {
  const rt = trunkRadius(hs), r0 = trunkRadius(0), thick = rt * .66, path = [[Math.cos(a) * rt * .35, hs, Math.sin(a) * rt * .35, thick]];
  for (let j = 1; j <= 9; j++) {
    const t = j / 9, d = r0 * .85 + len * t, aa = a + Math.sin(t * 2.6 + wobble) * .3 * t;
    const rise = hs * .85 * Math.pow(1 - smooth(0, .28, t), 1.6), sink = .05 * smooth(.55, 1, t);
    path.push([Math.cos(aa) * d, rise + .02 - sink, Math.sin(aa) * d, thick * (1 - t * .88)]);
  }
  return path;
}
/** A tree's root flare at scale 1: 5-7 buttress roots that grow out of the trunk's foot and run
 *  over the ground (1.0-1.7 m), some with a thinner fork, one piece with the trunk. */
export function rootFlareGeometry(seed) {
  const r = createRng(seed), p = [], n = [], c = [], count = 5 + Math.floor(r.next() * 3), start = r.range(0, 6.28);
  for (let i = 0; i < count; i++) {
    const a = start + (i / count) * Math.PI * 2 + r.range(-.3, .3), path = rootPath(a, r.range(.22, .4), r.range(1.0, 1.7), r.range(0, 6));
    writeTube(path, p, n, c);
    if (r.next() < .5) {
      const i0 = 4 + Math.floor(r.next() * 3), o = path[i0], b = a + (r.next() < .5 ? -1 : 1) * r.range(.45, .9), bl = r.range(.35, .6), fork = [o];
      for (let j = 1; j <= 4; j++) { const t = j / 4; fork.push([o[0] + Math.cos(b) * bl * t, o[1] - .04 * t, o[2] + Math.sin(b) * bl * t, o[3] * .7 * (1 - t * .85)]); }
      writeTube(fork, p, n, c);
    }
  }
  return geometry(p, n, c);
}

/** Surface roots: each runs half buried over the ground (gy) and arches up out of it once or twice
 *  (root.arch [centre, height] per hump), thickest at the tree, its end sunk into the soil. */
export function groundRootGeometry(roots, gy) {
  const p = [], n = [], c = [];
  for (const root of roots) {
    const pts = root.points, path = [], m = (pts.length - 1) * 2;
    for (let i = 0; i <= m; i++) {
      const u = i / 2, i0 = Math.floor(u), f = u - i0, a = pts[i0], b = pts[Math.min(pts.length - 1, i0 + 1)];
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f, t = i / m, rad = root.r * (1 - t * .7);
      let lift = 0;
      for (const [at, h] of root.arch || []) lift += h * Math.pow(Math.max(0, Math.cos(((t - at) / .16) * Math.PI / 2)), 1.5) * (Math.abs(t - at) < .16 ? 1 : 0);
      path.push([x, gy(x, z) + rad * (.2 - .9 * smooth(.85, 1, t)) + lift, z, rad]);
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

/** A weathered boulder: a rounded, lumpy mass (a subdivided sphere pushed in and out by fixed
 *  noise, a flat bed, a little squashed) with moss settled over its top in a wavy-edged cap.
 *  Vertex colour is white on the stone (the instance colour gives its grey) and moss above. */
export function mossyStone(mossColor) {
  const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position;
  const bump = (x, y, z) => .16 * Math.sin(x * 2.3 + y * 1.7) * Math.cos(z * 2.1 - y) + .07 * Math.sin(x * 5.1 - z * 4.3 + y * 3.7) + .1 * Math.sin(z * 1.3 + x * .7);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + bump(x, y, z);
    x *= k * 1.1; z *= k * .95; y = Math.max(-.3, y * k * .95);
    // a squared-off top, as weathered stone
    if (y > .55) y = .55 + (y - .55) * .45;
    p.setXYZ(i, x, y, z);
  }
  const merged = mergeVertices(g); g.dispose(); merged.computeVertexNormals();
  const pos = merged.attributes.position, nor = merged.attributes.normal, col = [], moss = new THREE.Color(mossColor), tone = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), edge = .7 + .14 * Math.sin(x * 4.1 + z * 2.7) + .06 * Math.sin(z * 9 - x * 5);
    const m = THREE.MathUtils.smoothstep(nor.getY(i), edge - .05, edge + .05);
    tone.setRGB(1, 1, 1).lerp(moss, m * .9);
    col.push(tone.r, tone.g, tone.b);
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return merged;
}
