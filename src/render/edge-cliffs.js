// Rock faces for the edge cliffs (core/edge-cliffs.js, data acceptedScenes.edgeCliffs),
// in the accepted scenes' column style (scenes/ruins/scene.js columnCliffs): the face is
// split by vertical cracks into columns of stacked block courses, each course set back,
// a dark backing behind the cracks and a mossy lip over the top. Foot and top follow the
// game's ground, so the face spans the plateau's real drop. Cosmetic randomness only.
import * as THREE from 'three';
import {edgeCliffAt,edgeCliffRuns,edgeCliffTop} from '../core/edge-cliffs.js';

const STONE = ['#cbc6c2', '#bfbab8', '#d2ccc6', '#b6b1b2', '#c7c1bc'];
const MOSS = ['#a2c64a', '#b4d152', '#8fb843'];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** One merged geometry (position, colour) for every cliff stretch of every edge cliff. */
const MIN_FACE = 1.8;
function tallParts(S) {
  const parts = [];let run = [];
  for (const q of S) { if (q.top - q.base >= MIN_FACE) run.push(q); else { if (run.length > 2) parts.push(run); run = []; } }
  if (run.length > 2) parts.push(run);
  return parts;
}
function insideParts(S, b) {
  const inside = q => q.x >= b.minX && q.x <= b.maxX && q.z >= b.minZ && q.z <= b.maxZ, parts = [];
  let a = -1;
  for (let i = 0; i <= S.length; i++) {
    const on = i < S.length && inside(S[i]);
    if (on && a < 0) a = i;
    if (!on && a >= 0) { parts.push(S.slice(Math.max(0, a - 1), Math.min(S.length, i + 1))); a = -1; }
  }
  return parts.filter(p => p.length > 1);
}
export function edgeCliffGeometry(world) {
  const pos = [], col = [], tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), nn = new THREE.Vector3(), shade = new THREE.Color();
  // each triangle faces `out` on its own: a quad bent over the bank must not show a culled half
  const tri = (a, b, c, out, color) => {
    tmpA.subVectors(b, a); tmpB.subVectors(c, a); nn.crossVectors(tmpA, tmpB);
    for (const v of nn.dot(out) >= 0 ? [a, b, c] : [a, c, b]) { pos.push(v.x, v.y, v.z); col.push(color.r, color.g, color.b); }
  };
  const quad = (a, b, c, d, out, color) => { tri(a, b, c, out, color); tri(a, c, d, out, color); };
  const stone = STONE.map(h => new THREE.Color(h)), moss = MOSS.map(h => new THREE.Color(h)), F = [0, .32, .66, 1];
  const ground = (x, z) => world.groundY(x, z);
  // the drawn ground: the heightfield split into the triangles the ground mesh draws
  // (render/ground.js), which on a steep bank stands up to a metre off the bilinear groundY
  const hf = world.heightfield, drawn = (x, z) => {
    const fx = Math.min(Math.max((x - hf.ox) / hf.res, 0), hf.w - 1.0001), fz = Math.min(Math.max((z - hf.oz) / hf.res, 0), hf.h - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * hf.w + i, D = hf.data;
    return u + v <= 1 ? D[k] + (D[k + 1] - D[k]) * u + (D[k + hf.w] - D[k]) * v : D[k + hf.w + 1] + (D[k + hf.w] - D[k + hf.w + 1]) * (1 - u) + (D[k + 1] - D[k + hf.w + 1]) * (1 - v);
  };
  const bank = (q, o) => Math.max(drawn(q.x + q.nx * o, q.z + q.nz * o), drawn(q.x + q.nx * o + q.nz * .25, q.z + q.nz * o - q.nx * .25), drawn(q.x + q.nx * o - q.nz * .25, q.z + q.nz * o + q.nx * .25));
  for (const cliff of world.data.acceptedScenes?.edgeCliffs || []) {
    const random = rng([...cliff.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)), R = (a, b) => a + (b - a) * random(), pick = l => l[Math.floor(random() * l.length)];
    const lean = cliff.lean;
    for (const run of edgeCliffRuns(cliff)) {
      // samples every 0.45 m along the foot, each with its outward normal, foot and top
      const S = [];
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i], b = run[i + 1], k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / .45));
        for (let j = 0; j < k; j++) S.push({ x: a[0] + (b[0] - a[0]) * j / k, z: a[1] + (b[1] - a[1]) * j / k });
      }
      S.push({ x: run.at(-1)[0], z: run.at(-1)[1] });
      let s = 0;
      S.forEach((q, i) => {
        const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
        q.nx = tz / l; q.nz = -tx / l;
        if (edgeCliffAt(cliff, q.x + q.nx * .8, q.z + q.nz * .8) > -Infinity) { q.nx = -q.nx; q.nz = -q.nz; }
        if (i) s += Math.hypot(q.x - S[i - 1].x, q.z - S[i - 1].z); q.s = s;
        q.base = Math.min(ground(q.x + q.nx * 1.4, q.z + q.nz * 1.4), ground(q.x + q.nx * 2.4, q.z + q.nz * 2.4)) - .3;
        q.top = Math.min(edgeCliffTop(cliff, q.x, q.z), ground(q.x - q.nx * (lean + .4), q.z - q.nz * (lean + .4)) + .08);
      });
      // a cliff crossing into a neighbouring map is drawn by each map up to its own bound
      // (one sample over, so the two halves meet)
      // where the ground in front stands almost as high, a short face would read as a loose
      // slab: below MIN_FACE metres the plateau meets it as a grass bank, no columns
      for (const part of insideParts(S, world.data.bounds)) for (const face of tallParts(part)) columns(face);
    }
    function columns(S) {
      const cols = []; let i0 = 0;
      while (i0 < S.length - 1) {
        const w = random() < .22 ? R(2.4, 3.6) : R(1.0, 1.9); let i1 = i0 + 1;
        while (i1 < S.length - 1 && S[i1].s - S[i0].s < w) i1++;
        cols.push({ i0, i1, s0: S[i0].s, s1: S[i1].s, off: R(-.08, .45), slope: R(-.12, .12), ridge: R(.12, .4), peak: R(.3, .7), rise: R(.04, .35), cap: R(.7, 1.25), moss: random(), rows: F.map(() => R(-.2, .2)), lean: R(-.15, .28), c: pick(stone).clone().multiplyScalar(R(.82, .92)), mid: (S[i0].s + S[i1].s) / 2 });
        i0 = i1;
      }
      const top = (C, q) => q.top + C.rise;
      const raw = (C, i, c, f) => {
        const q = S[i], u = (q.s - C.s0) / Math.max(.01, C.s1 - C.s0);
        const ridge = C.ridge * (u < C.peak ? u / C.peak : (1 - u) / (1 - C.peak));
        return .12 + C.off + C.slope * (q.s - C.mid) + ridge + C.rows[c] + (c === 0 ? .2 : 0) - (lean + C.lean) * f;
      };
      // the bank behind is steepest half way up: a course set back that far would sink
      // into the grass and leave a green hole in the face, so it stands out on the bank
      // (checked at the course's middle too, where the bank curves over a straight course)
      const pushed = (C, i, c, f) => {
        const q = S[i], h = top(C, q) - q.base, y = q.base + h * f;
        let o = raw(C, i, c, f);
        if (f <= 0) return o; // the foot is sunk on purpose
        const fl = F[F.indexOf(f) - 1] ?? 0, ol = fl > 0 ? pushed(C, i, c, fl) : raw(C, i, c, fl), ym = q.base + h * (f + fl) / 2;
        for (let k = 0; k < 14 && (bank(q, o) > y - .12 || bank(q, (o + ol) / 2) > ym - .12); k++) o += .1;
        return o;
      };
      const vtx = (C, i, r, f = F[r]) => {
        const q = S[i], c = Math.min(r, F.length - 2);
        let o = pushed(C, i, c, f);
        // ...and the courses below it come out as far, so the face never overhangs (an
        // overhang shows its culled underside to the camera above)
        for (let m = 1; m < F.length; m++) if (F[m] > f + 1e-6) for (const cc of [m - 1, Math.min(m, F.length - 2)]) {
          const p = pushed(C, i, cc, F[m]);
          if (p > raw(C, i, cc, F[m]) + 1e-6) o = Math.max(o, p);
        }
        return new THREE.Vector3(q.x + q.nx * o, q.base + (top(C, q) - q.base) * f, q.z + q.nz * o);
      };
      // a dark backing behind the columns, so cracks show shadowed stone
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1], out = new THREE.Vector3((a.nx + b.nx) / 2, 0, (a.nz + b.nz) / 2);
        if (a.top - a.base < .15 && b.top - b.base < .15) continue;
        const p = (q, f) => new THREE.Vector3(q.x + q.nx * (-.25 - lean * f), q.base + (q.top - q.base) * f, q.z + q.nz * (-.25 - lean * f));
        quad(p(a, 0), p(b, 0), p(b, 1), p(a, 1), out, shade.copy(stone[0]).multiplyScalar(.42));
      }
      cols.forEach((C, ci) => {
        for (let i = C.i0; i < C.i1; i++) {
          const out = new THREE.Vector3((S[i].nx + S[i + 1].nx) / 2, 0, (S[i].nz + S[i + 1].nz) / 2);
          if (top(C, S[i]) - S[i].base < .15) continue;
          for (let r = 0; r < F.length - 1; r++) {
            shade.copy(C.c).multiplyScalar(r === 0 ? .9 : 1 + R(-.03, .03));
            if (r === F.length - 2 && (i - C.i0) % 3 !== 0 && random() < .5) shade.lerp(pick(moss), R(.12, .3));
            quad(vtx(C, i, r, F[r]), vtx(C, i + 1, r, F[r]), vtx(C, i + 1, r, F[r + 1]), vtx(C, i, r, F[r + 1]), out, shade);
            // the seam to the next course: a narrow ledge in shadow, mossy in places
            if (r < F.length - 2) { shade.copy(C.c).multiplyScalar(.6); if (random() < .3) shade.lerp(pick(moss), .4); quad(vtx(C, i, r, F[r + 1]), vtx(C, i + 1, r, F[r + 1]), vtx(C, i + 1, r + 1, F[r + 1]), vtx(C, i, r + 1, F[r + 1]), new THREE.Vector3(0, 1, 0), shade); }
          }
          // the lip: the top course rolls back onto the plateau, mossy where the noise says
          const t0 = vtx(C, i, F.length - 1), t1 = vtx(C, i + 1, F.length - 1);
          const edge = k => { const q = S[k], o = vtx(C, k, F.length - 1); return new THREE.Vector3(o.x - q.nx * .17, o.y + .1, o.z - q.nz * .17); };
          const back = k => { const q = S[k]; return new THREE.Vector3(q.x - q.nx * C.cap, top(C, q) + .1, q.z - q.nz * C.cap); };
          const e0 = edge(i), e1 = edge(i + 1), b0 = back(i), b1 = back(i + 1);
          shade.copy(C.c).multiplyScalar(1.04); if (Math.sin(S[i].x * .9 + 4) * Math.sin(S[i].z * .9) * .5 + .5 < .35 + C.moss * .4) shade.lerp(pick(moss), R(.5, .75));
          quad(t0, t1, e1, e0, out, shade.clone().multiplyScalar(.97));
          quad(e0, e1, b1, b0, new THREE.Vector3(0, 1, 0), shade);
          quad(b0, b1, new THREE.Vector3(b1.x, b1.y - .35, b1.z), new THREE.Vector3(b0.x, b0.y - .35, b0.z), new THREE.Vector3(-out.x, 0, -out.z), shade.copy(C.c).multiplyScalar(.8));
        }
        // a run's open ends are closed with a side face
        for (const k of (ci === 0 ? [C.i0] : []).concat(ci === cols.length - 1 ? [C.i1] : [])) {
          const q = S[k], side = new THREE.Vector3(q.nz, 0, -q.nx).multiplyScalar(k === C.i0 ? -1 : 1);
          for (let r = 0; r < F.length - 1; r++) {
            const a0 = vtx(C, k, r, F[r]), a1 = vtx(C, k, r, F[r + 1]);
            quad(a0, a1, new THREE.Vector3(q.x - q.nx * C.cap, a1.y, q.z - q.nz * C.cap), new THREE.Vector3(q.x - q.nx * C.cap, a0.y, q.z - q.nz * C.cap), side, shade.copy(C.c).multiplyScalar(.75));
          }
        }
        // the crack between two columns, in shadow
        const D = cols[ci + 1];
        if (D) {
          const out = new THREE.Vector3(S[C.i1].nz, 0, -S[C.i1].nx);
          for (let r = 0; r < F.length - 1; r++) quad(vtx(C, C.i1, r, F[r]), vtx(D, C.i1, r, F[r]), vtx(D, C.i1, r, F[r + 1]), vtx(C, C.i1, r, F[r + 1]), out, shade.copy(C.c).multiplyScalar(.55));
        }
      });
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
