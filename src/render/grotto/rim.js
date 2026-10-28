// The cave's rocky rim: faceted boulders crowd every floor edge that meets the void. Edges facing
// away from the camera (north) rise into tall cave walls; edges facing it stay low so the
// camera always sees the floor (AGENTS.md: change the camera, not the style). Instanced: three
// boulder shapes, one draw each.
import * as THREE from 'three';
import { createRng } from '../../core/rng.js';
import { toonRamp } from '../toon.js';
import { ellipseOutline, pathOutline } from './floors.js';

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
function rimPoints(map, step) {
  const pts = [];
  for (const f of map.floors) {
    let poly;
    if (f.shape === 'circle' || f.shape === 'ellipse') poly = ellipseOutline(f, step);
    else if (f.shape === 'path') poly = pathOutline(f, 10);
    else {
      const ux = (f.b[0] - f.a[0]) / f.length, uz = (f.b[1] - f.a[1]) / f.length, h = f.w / 2;
      poly = [];
      for (let t = 0; t <= f.length; t += step) {
        poly.push([f.a[0] + ux * t - uz * h, f.a[1] + uz * t + ux * h]);
        poly.push([f.a[0] + ux * t + uz * h, f.a[1] + uz * t - ux * h]);
      }
    }
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
      const y = f.waterY != null && f.kind === 'deep' ? f.waterY : f.y;
      // paths and stairs are walked between walls on both sides: keep those low so the camera sees in
      pts.push({ x, z, nx, nz, y, narrow: f.shape === 'path' || f.shape === 'stairs' });
    }
  }
  return pts;
}

/**
 * Build the rim. `look.rock`/`look.rockTop` tint it; `keepClear` lists [x, z, r] spots
 * (waterfalls, doors) where the front rocks stay away.
 */
export function buildRim(map, look, { seed = 1, keepClear = [], tall = 1 } = {}) {
  const rng = createRng(seed);
  const shapes = [boulder(seed + 1), boulder(seed + 2), boulder(seed + 3, 0)];
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonRamp(), vertexColors: true });
  const lists = shapes.map(() => []);
  const base = new THREE.Color(look.rock), top = new THREE.Color(look.rockTop);
  const clear = (x, z, pad) => keepClear.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r + pad) ** 2);
  for (const p of rimPoints(map, 1.25)) {
    // 0 = faces the camera (south, +z), 1 = faces away (north): the cave's back wall
    const back = Math.min(p.narrow ? 0.45 : 1, THREE.MathUtils.clamp((-p.nz + 0.35) / 1.1, 0, 1));
    const rows = back > 0.4 ? 3 : 2;
    for (let r = 0; r < rows; r++) {
      const off = 0.95 + r * 1.7 + rng.range(-0.25, 0.25);
      const x = p.x + p.nx * off + rng.range(-0.4, 0.4), z = p.z + p.nz * off + rng.range(-0.4, 0.4);
      if (clear(x, z, r === 0 ? 1.2 : 0.4) && back < 0.6) continue;
      const lowH = rng.range(0.4, 1.1) + r * 0.3;
      const highH = (rng.range(1.8, 3.6) + r * rng.range(1.0, 2.2)) * tall;
      const h = THREE.MathUtils.lerp(lowH, highH, back * back);
      const wdt = r === 0 ? rng.range(0.7, 1.0) : rng.range(0.8, 1.3) + r * 0.2;
      const depth = 4; // reaches down past the cliff top so the rim looks rooted
      const k = rng.int(0, shapes.length - 1);
      const c = base.clone().lerp(top, rng.range(0, 0.6)).multiplyScalar(rng.range(0.85, 1.12));
      lists[k].push({ x, z, y: p.y + (h - depth) / 2, sx: wdt, sy: (h + depth) / 2, sz: wdt * rng.range(0.8, 1.2), ry: rng.range(0, Math.PI * 2), tilt: rng.range(-0.15, 0.15), c });
    }
  }
  const root = new THREE.Group();
  root.name = 'grotto-rim';
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
  });
  return { root, count: lists.reduce((n, l) => n + l.length, 0) };
}
