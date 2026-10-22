// Grey faceted stones in the approved beach scene's style (docs/reference beach scene): chamfered
// blocks with flat-shaded faces, each face a slightly different grey, moss on the upward faces.
// The same stones are laid as ledges along the map's cliffs (plateau edges, coastal drops),
// found from the heightfield at load time, and stand in for the old round rocks.
// Shapes and colour come from a few shared variants; placement is per-instance (InstancedMesh).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../core/rng.js';
import art from '../../data/art.json' with {type:'json'};

const S = art.stones;

/**
 * One stone variant, w x h x d metres with its base at y=0 (or centred when `centred`):
 * the 26 points of a chamfered box, jittered, plus a few extra points on its faces; per-face
 * grey with moss on the faces that look up. Non-indexed (flat facets) with a vertex colour.
 */
export function stoneGeometry(rng, { w = 2, h = 2, d = 2, chamfer = 0.24, jitter = 0.09, extra = 8, moss = 0, centred = false } = {}) {
  const pts = [], r = () => rng.range(-jitter, jitter);
  for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) {
    if (!ix && !iy && !iz) continue;
    const k = Math.abs(ix) + Math.abs(iy) + Math.abs(iz);
    const c = k === 3 ? 1 - chamfer : k === 2 ? 1 - chamfer * 0.42 : 1;
    pts.push(new THREE.Vector3(ix * w / 2 * c * (1 + r()), iy * h / 2 * c * (1 + r()), iz * d / 2 * c * (1 + r())));
  }
  for (let i = 0; i < extra; i++) {
    const v = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
    v.divideScalar(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z))).multiplyScalar(1 - chamfer * 0.25);
    pts.push(new THREE.Vector3(v.x * w / 2, v.y * h / 2, v.z * d / 2));
  }
  const g = new ConvexGeometry(pts);
  if (!centred) g.translate(0, h / 2, 0);
  const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(rng.pick(S.palette)), c = new THREE.Color(), mossy = new THREE.Color();
  for (let t = 0; t < pos.count; t += 3) {
    const ny = nor.getY(t);
    c.copy(base).multiplyScalar(1 + rng.range(-0.09, 0.07));
    if (ny > 0.78 && rng.next() < moss) c.lerp(mossy.set(rng.pick(S.moss)), rng.range(0.55, 0.8));
    else if (ny > 0.45 && rng.next() < moss * 0.3) c.lerp(mossy.set(rng.pick(S.moss)), 0.3);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** The outline hull of a faceted stone: the same shape with smooth normals, so the push along
 * the normals keeps the hull closed at the corners. */
function hullOf(geo) {
  const g = mergeVertices(new THREE.BufferGeometry().setAttribute('position', geo.attributes.position.clone()), 1e-4);
  g.computeVertexNormals();
  return g;
}

let shared = null;
/** Shared stone variants: blocks for ledges (unit size, base at 0) and round boulders (unit
 * radius, centred, like the old facetedStone). Built once; marked shared for disposal. */
export function stoneVariants() {
  if (shared) return shared;
  const rng = createRng(4127);
  const block = S.block, round = S.round;
  const blocks = [], boulders = [];
  for (let i = 0; i < S.variants; i++) blocks.push(stoneGeometry(rng, { w: 1, h: 1, d: 1, ...block, moss: block.moss[i % block.moss.length] }));
  for (let i = 0; i < S.variants; i++) boulders.push(stoneGeometry(rng, { w: 2, h: 1.56, d: 2, centred: true, ...round, moss: round.moss[i % round.moss.length] }));
  shared = { blocks: blocks.map(g => ({ geo: g, hull: hullOf(g) })), boulders: boulders.map(g => ({ geo: g, hull: hullOf(g) })) };
  for (const list of [shared.blocks, shared.boulders]) for (const v of list) v.geo.userData.shared = v.hull.userData.shared = true;
  return shared;
}

/**
 * Stone ledges along the cliffs of a map: every steep spot (gradient over ledge.minSlope) is
 * followed up to the cliff's lip and down to its foot; where the wall is tall enough, a block
 * stands at the foot covering the face (two courses, the upper one set back, on tall walls).
 * Spots in safe/town zones, on docks, roads and deep water are left alone.
 * Returns {stones: [{x, y, z, sx, sy, sz, ry, v}], lips: [{x, y, z, nx, nz, foot: [x, z, y]}]} in map metres.
 */
export function* ledgeSteps(world, gy) {
  const L = S.ledge, b = world.bounds, rng = createRng((world.data.seed || 1) * 31 + 7);
  const water = world.waterLevel ?? -0.4;
  const stones = [], lips = [], taken = new Map();
  const key = (x, z) => `${Math.floor(x)},${Math.floor(z)}`;
  const near = (x, z, r) => {
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++)
      for (const s of taken.get(`${i},${j}`) || []) if (Math.hypot(s.x - x, s.z - z) < r) return true;
    return false;
  };
  const mark = (s) => { const k = key(s.x, s.z); if (!taken.has(k)) taken.set(k, []); taken.get(k).push(s); };
  const grad = (x, z) => [(gy(x + 0.4, z) - gy(x - 0.4, z)) / 0.8, (gy(x, z + 0.4) - gy(x, z - 0.4)) / 0.8];
  const blocked = (x, z) => world.isSafe?.(x, z) || world.dockAt?.(x, z) || (world.roadDist?.(x, z) ?? 99) < L.roadClear || world.onBridge?.(x, z);
  let visited = 0;
  for (let z = b.minZ + 1; z < b.maxZ - 1; z += L.step) {
    if (visited++ % 4 === 0) yield;
    for (let x = b.minX + 1; x < b.maxX - 1; x += L.step) {
      const [gx, gz] = grad(x, z), g = Math.hypot(gx, gz);
      if (g < L.minSlope) continue;
      // walk up to the lip and down to the foot, following the local slope at every step and
      // stopping where the ground levels out or stops rising/falling (a gully, a ridge)
      const dx = -gx / g, dz = -gz / g;
      const walk = (sign) => {
        let px = x, pz = z, py = gy(x, z);
        for (let i = 0; i < 12; i++) {
          const [ax, az] = grad(px, pz), a = Math.hypot(ax, az);
          if (a < L.flat) break;
          const nx = px + sign * ax / a * 0.4, nz = pz + sign * az / a * 0.4, ny = gy(nx, nz);
          if (sign * (ny - py) <= 0) break;
          px = nx; pz = nz; py = ny;
        }
        return [px, pz, py];
      };
      const [tx, tz, top] = walk(1), [bx, bz, base] = walk(-1), wall = top - base;
      if (wall < L.minWall || base < water - L.maxUnderwater) continue;
      const w = rng.range(L.width[0], L.width[1]);
      const cx = (tx + bx) / 2 + dx * rng.range(0.1, 0.3), cz = (tz + bz) / 2 + dz * rng.range(0.1, 0.3);
      if (near(cx, cz, w * L.overlap) || blocked(cx, cz) || blocked(bx, bz)) continue;
      const run = Math.hypot(bx - tx, bz - tz), depth = Math.max(L.depth[0], Math.min(L.depth[1], run + 0.5));
      const ry = Math.atan2(dx, dz);
      const v = () => rng.int(0, S.variants - 1);
      if (wall < L.twoCourses) {
        const s = { x: cx, z: cz, y: base - 0.12, sx: w, sy: wall + rng.range(-0.15, 0.22) + 0.12, sz: depth, ry: ry + rng.range(-0.12, 0.12), v: v() };
        stones.push(s); mark(s);
      } else {
        const low = rng.range(1.3, Math.min(2.1, wall - 0.9));
        const s = { x: cx + dx * 0.2, z: cz + dz * 0.2, y: base - 0.12, sx: w, sy: low + 0.12, sz: depth * 0.8, ry: ry + rng.range(-0.12, 0.12), v: v() };
        stones.push(s); mark(s);
        const y2 = base + low - 0.4, back = rng.range(0.45, 0.75);
        stones.push({ x: cx - dx * back + rng.range(-0.2, 0.2), z: cz - dz * back, y: y2, sx: rng.range(0.95, 1.55), sy: Math.max(0.9, top - y2 + rng.range(-0.1, 0.2)), sz: depth * 0.8, ry: ry + rng.range(-0.1, 0.1), v: v() });
      }
      lips.push({ x: tx - dx * 0.4, y: top, z: tz - dz * 0.4, nx: dx, nz: dz, foot: [bx, bz, base] });
      // now and then a stone that broke away lies at the foot
      if (rng.next() < L.fallen) {
        const s = rng.range(0.45, 1.0), fx = bx + dx * rng.range(0.8, 2.2), fz = bz + dz * rng.range(0.8, 2.2);
        if (!blocked(fx, fz) && !world.isWater?.(fx, fz)) stones.push({ x: fx, z: fz, y: gy(fx, fz) - 0.06, sx: s, sy: s * rng.range(0.6, 0.9), sz: s * rng.range(0.9, 1.15), ry: rng.range(-3, 3), v: v() });
      }
    }
  }
  return { stones, lips };
}
