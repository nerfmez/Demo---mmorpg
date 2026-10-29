// The cave's rocky rim: faceted boulders crowd every floor edge that meets the void. Edges facing
// away from the camera (north) rise into tall cave walls; edges facing it stay low so the
// camera always sees the floor (AGENTS.md: change the camera, not the style). Instanced: three
// boulder shapes, one draw each.
import * as THREE from 'three';
import { createRng } from '../../core/rng.js';
import { outlineMaterial } from '../toon.js';
import { gamePaint } from './game-paint.js';
import { floorRings, area } from './floors.js';

function boulder(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const rng = createRng(seed), p = g.attributes.position, v = new THREE.Vector3();
  const bumps = new Map(); // shared corners move together so the facets stay closed
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!bumps.has(key)) bumps.set(key, rng.range(0.78, 1.18));
    v.multiplyScalar(bumps.get(key));
    if (v.y < -0.2) v.y *= 1.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const flat = g.index ? g.toNonIndexed() : g; // separate corners per face: flat facets
  if (flat !== g) g.dispose();
  flat.computeVertexNormals();
  // lighter tops (worn, lit), darker undersides
  const col = new Float32Array(flat.attributes.position.count * 3), q = flat.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const k = THREE.MathUtils.clamp((q.getY(i) + 0.4) / 1.3, 0, 1);
    const c = 0.55 + k * 0.45;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return flat;
}

/** Points just outside each floor edge that are over the void, with their outward normal. */
export function rimPoints(map, step = 1.25) {
  const pts = [];
  for (const f of map.floors) {
    let rings;
    if (f.shape !== 'stairs') rings = floorRings(f, step).map((r) => r.pts);
    else {
      const ux = (f.b[0] - f.a[0]) / f.length, uz = (f.b[1] - f.a[1]) / f.length, h = f.w / 2, poly = [];
      for (let t = 0; t <= f.length; t += step) {
        poly.push([f.a[0] + ux * t - uz * h, f.a[1] + uz * t + ux * h]);
        poly.push([f.a[0] + ux * t + uz * h, f.a[1] + uz * t - ux * h]);
      }
      rings = [poly];
    }
    for (const poly of rings) {
      // resample evenly along the outline (paths and stairs come in uneven spacing)
      const even = [];
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
        const l = Math.hypot(bx - ax, bz - az);
        if (f.shape === 'stairs' || l > step * 4) { even.push([ax, az]); continue; }
        for (let t = 0; t < l; t += step) even.push([ax + ((bx - ax) * t) / l, az + ((bz - az) * t) / l]);
      }
      for (const [x, z] of even) {
        // outward: away from the floor, found by probing the four sides
        let nx = 0, nz = 0;
        for (let a = 0; a < 8; a++) {
          const dx = Math.cos((a / 8) * Math.PI * 2), dz = Math.sin((a / 8) * Math.PI * 2);
          if (!map.surfaceAt(x + dx * 0.9, z + dz * 0.9)) { nx += dx; nz += dz; }
        }
        const l = Math.hypot(nx, nz);
        if (l < 0.5) continue;
        nx /= l; nz /= l;
        if (map.surfaceAt(x + nx * 0.7, z + nz * 0.7)) continue;
        const y = f.waterY ?? f.y; // rocks stand out of the water, not the pool floor
        // paths and stairs are walked between walls on both sides: keep those low so the camera sees in
        pts.push({ x, z, nx, nz, y, narrow: f.shape === 'path' || f.shape === 'stairs', stairs: f.shape === 'stairs', floor: f.id, style: f.style });
      }
    }
  }
  return pts;
}

const hash = (n) => { const h = Math.sin(n * 127.1 + 311.7) * 43758.5453; return h - Math.floor(h); };

/**
 * The crust of rock around every edge that drops into the void: one continuous wall, as the
 * concept draws it, rising toward the back (north) and low toward the camera. Built per run of
 * void-facing edge as faceted inner face, top and outer face; flat-shaded, coloured per vertex.
 */
function rimWalls(map, look, keepClear, tall, modelled) {
  const pos = [], col = [];
  const rock = new THREE.Color(look.rock), top = new THREE.Color(look.rockTop), dark = new THREE.Color(look.void);
  const v = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tri = (a, b, c, ca, cb, cc, expect) => {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    v.crossVectors(e1, e2);
    if (v.x * expect[0] + v.y * expect[1] + v.z * expect[2] < 0) { [b, c] = [c, b]; [cb, cc] = [cc, cb]; }
    pos.push(...a, ...b, ...c);
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  };
  const clear = (x, z) => keepClear.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);
  let seq = 0;
  for (const f of map.floors) {
    if (f.shape === 'stairs' || f.style === 'cave' || modelled.has(f.id)) continue; // these have modelled walls (cave.js)
    const y = f.waterY ?? f.y;
    for (const ring of floorRings(f, 1)) {
      // walk the ring so that (-dz, dx) points away from the floor, sampled about every metre
      let pts = ring.pts;
      if ((area(pts) > 0) === ring.hole) pts = [...pts].reverse();
      const even = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], l = Math.hypot(bx - ax, bz - az);
        for (let t = 0; t < l; t += 1) even.push([ax + ((bx - ax) * t) / l, az + ((bz - az) * t) / l]);
      }
      const n = even.length;
      if (n < 3) continue;
      const S = even.map(([x, z], i) => {
        const [px, pz] = even[(i - 1 + n) % n], [qx, qz] = even[(i + 1) % n];
        let nx = -(qz - pz), nz = qx - px;
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        const open = !map.surfaceAt(x + nx * 0.8, z + nz * 0.8);
        const back = THREE.MathUtils.clamp((-nz + 0.35) / 1.1, 0, 1);
        const k = seq++;
        let h = THREE.MathUtils.lerp(0.55, 3.4 * tall, back * back) * (0.7 + 0.6 * hash(k));
        if (back < 0.6 && clear(x, z)) h = 0.12; // a waterfall's lip or a door stays open
        return { x, z, nx, nz, open, h, j: hash(k + 0.5) - 0.5, thick: 1.8 + hash(k + 0.25) * 1.2 };
      });
      for (let i = 0; i < n; i++) {
        const A = S[i], B = S[(i + 1) % n];
        if (!A.open || !B.open) continue;
        const I0 = (p) => [p.x + p.nx * 0.1, y - 0.4, p.z + p.nz * 0.1];
        const I1 = (p) => [p.x + p.nx * (0.2 + p.j * 0.3), y + p.h, p.z + p.nz * (0.2 + p.j * 0.3)];
        const O1 = (p) => [p.x + p.nx * p.thick * 0.75, y + p.h * 0.7, p.z + p.nz * p.thick * 0.75];
        const O0 = (p) => [p.x + p.nx * p.thick, -14, p.z + p.nz * p.thick];
        const mx = (A.nx + B.nx) / 2, mz = (A.nz + B.nz) / 2;
        const shadeA = rock.clone().multiplyScalar(0.85 + A.j * 0.4), shadeB = rock.clone().multiplyScalar(0.85 + B.j * 0.4);
        const topA = top.clone().multiplyScalar(0.9 + A.j * 0.3), topB = top.clone().multiplyScalar(0.9 + B.j * 0.3);
        // inner face, toward the floor
        tri(I0(A), I0(B), I1(B), shadeA, shadeB, topB, [-mx, 0, -mz]);
        tri(I0(A), I1(B), I1(A), shadeA, topB, topA, [-mx, 0, -mz]);
        // the broken top
        tri(I1(A), I1(B), O1(B), topA, topB, shadeB, [0, 1, 0]);
        tri(I1(A), O1(B), O1(A), topA, shadeB, shadeA, [0, 1, 0]);
        // outer face, falling into the dark
        tri(O1(A), O1(B), O0(B), shadeA, shadeB, dark, [mx, 0, mz]);
        tri(O1(A), O0(B), O0(A), shadeA, dark, dark, [mx, 0, mz]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); // non-indexed: one normal per facet, the faceted cel look
  const m = new THREE.Mesh(g, gamePaint(look, 'rock'));
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = 'rim-walls';
  return m;
}

/**
 * Build the rim: the continuous rock walls plus loose boulders on and before them.
 * `look.rock`/`look.rockTop` tint it; `keepClear` lists [x, z, r] spots (waterfalls, doors)
 * where the front rocks stay away.
 */
export function buildRim(map, look, { seed = 1, keepClear = [], tall = 1, points = rimPoints(map, 1.25), modelled = new Set() } = {}) {
  const rng = createRng(seed);
  const shapes = [boulder(seed + 1), boulder(seed + 2), boulder(seed + 3, 0)];
  const mat = gamePaint(look, 'rock'), line = outlineMaterial(look.paint?.ink || '#4a4652', 0.05);
  const lists = shapes.map(() => []);
  const base = new THREE.Color(look.rock), top = new THREE.Color(look.rockTop);
  const clear = (x, z, pad) => keepClear.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r + pad) ** 2);
  for (const [n, p] of points.entries()) {
    if (n % 4 || p.style === 'cave' || modelled.has(p.floor)) continue; // loose boulders here and there; the wall carries the rim
    // 0 = faces the camera (south, +z), 1 = faces away (north): the cave's back wall
    const back = Math.min(p.narrow ? 0.45 : 1, THREE.MathUtils.clamp((-p.nz + 0.35) / 1.1, 0, 1));
    const rows = 1;
    for (let r = 0; r < rows; r++) {
      const off = 1.0 + r * 1.5 + rng.range(-0.2, 0.2);
      const x = p.x + p.nx * off + rng.range(-0.4, 0.4), z = p.z + p.nz * off + rng.range(-0.4, 0.4);
      if (clear(x, z, r === 0 ? 1.2 : 0.4) && back < 0.6) continue;
      const lowH = rng.range(0.3, 0.7);
      const highH = rng.range(1.0, 2.0) * tall;
      const h = THREE.MathUtils.lerp(lowH, highH, back * back);
      const wdt = rng.range(0.5, 0.8);
      const depth = 1.5; // sunk into the wall top so it reads as a loose stone on the crust
      const k = rng.int(0, shapes.length - 1);
      const c = base.clone().lerp(top, rng.range(0, 0.6)).multiplyScalar(rng.range(0.85, 1.12));
      lists[k].push({ x, z, y: p.y + (h - depth) / 2, sx: wdt, sy: (h + depth) / 2, sz: wdt * rng.range(0.8, 1.2), ry: rng.range(0, Math.PI * 2), tilt: rng.range(-0.15, 0.15), c });
    }
  }
  const root = new THREE.Group();
  root.name = 'grotto-rim';
  root.add(rimWalls(map, look, keepClear, tall, modelled));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), t = new THREE.Vector3();
  lists.forEach((list, k) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(shapes[k], mat, list.length);
    list.forEach((r, i) => {
      e.set(r.tilt, r.ry, r.tilt * 0.5);
      q.setFromEuler(e);
      m4.compose(t.set(r.x, r.y, r.z), q, s.set(r.sx, r.sy, r.sz));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, r.c);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    root.add(inst);
    // the game's stones carry a soft same-hue outline
    const hull = new THREE.InstancedMesh(shapes[k], line, list.length);
    hull.instanceMatrix = inst.instanceMatrix;
    hull.computeBoundingSphere();
    root.add(hull);
  });
  return { root, count: lists.reduce((n, l) => n + l.length, 0) };
}
