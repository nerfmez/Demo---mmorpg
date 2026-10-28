// Cave dressing for floors whose zone has `style: "cave"` (data/dungeons/shell-grotto-trace.json),
// built from the Blender kit: worn paving slabs over a dirt floor (slabs missing and grimier
// toward the walls), a thick ring of stacked stones around every drop, columnar rock walls
// along the back, and rubble. A dungeon floor is old and dirty, not a clean plaza.
import * as THREE from 'three';
import { createRng } from '../../core/rng.js';
import { kitInstances } from './kit.js';

const TILE = 0.92;

/**
 * @param map    createDungeon(...) result
 * @param kit    loadGrottoKit() result
 * @param edge   rim points (rim.js rimPoints) {x, z, nx, nz, y, floor, style}
 * @param clear  [x, z, r] spots kept open (doors, falls)
 */
export function buildCaveDressing(map, kit, edge, { clear = [], seed = 1 } = {}) {
  const root = new THREE.Group();
  root.name = 'cave-dressing';
  const rng = createRng(seed);
  const cave = map.floors.filter((f) => f.style === 'cave');
  if (!cave.length) return { root };
  const ids = new Set(cave.map((f) => f.id));
  const isClear = (x, z, pad = 0) => clear.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r + pad) ** 2);
  // how close a point is to a wall: 0 in the open, 1 at the edge
  const wallness = (x, z, y) => {
    for (const r of [0.6, 1.2, 2.0]) {
      for (let a = 0; a < 8; a++) {
        const s = map.surfaceAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r);
        if (!s || Math.abs(s.y - y) > 0.3) return r === 0.6 ? 1 : r === 1.2 ? 0.6 : 0.3;
      }
    }
    return 0;
  };

  // ---- worn paving: slabs on a grid, some lifted, some gone, grimier by the walls ----
  const tiles = [[], [], [], []], pebbles = [[], [], [], []];
  const taken = new Set(); // cells a long slab already covers
  for (const f of cave) {
    const [x0, z0, x1, z1] = f.box;
    for (let gz = Math.floor(z0 / TILE); gz * TILE <= z1; gz++) {
      for (let gx = Math.floor(x0 / TILE); gx * TILE <= x1; gx++) {
        // every other row shifts half a slab, as laid stone does
        const x = (gx + 0.5 + (gz % 2 ? 0.5 : 0)) * TILE, z = (gz + 0.5) * TILE;
        const s = map.surfaceAt(x, z);
        if (!s || !ids.has(s.floor.id) || taken.has(`${gx},${gz}`)) continue;
        const w = wallness(x, z, s.y);
        if (rng.next() < 0.06 + w * 0.45) {
          // a missing slab: bare dirt and a stone or two
          if (rng.chance(0.6)) pebbles[rng.int(0, 3)].push({ x: x + rng.range(-0.3, 0.3), y: s.y, z: z + rng.range(-0.3, 0.3), ry: rng.range(0, 6.28), s: rng.range(0.8, 1.6) });
          continue;
        }
        // now and then a long slab over this cell and the next one along the row
        const next = map.surfaceAt(x + TILE, z);
        const long = rng.next() < 0.18 && next && ids.has(next.floor.id) && !taken.has(`${gx + 1},${gz}`) && wallness(x + TILE, z, s.y) < 0.5;
        if (long) taken.add(`${gx + 1},${gz}`);
        const k = long ? 3 : rng.int(0, 2);
        const grime = 1 - w * 0.4 - rng.range(0, 0.3);
        const tone = new THREE.Color(rng.range(0.92, 1.0), rng.range(0.9, 0.98), rng.range(0.85, 0.95)).multiplyScalar(grime);
        tiles[k].push({
          x: x + (long ? TILE / 2 : 0) + rng.range(-0.015, 0.015), y: s.y + 0.03 + rng.range(-0.012, 0.022), z: z + rng.range(-0.015, 0.015),
          ry: (long ? Math.round(rng.next()) * Math.PI : Math.round(rng.range(0, 3)) * (Math.PI / 2)) + rng.range(-0.03, 0.03),
          rx: rng.range(-0.02, 0.02), rz: rng.range(-0.02, 0.02), color: `#${tone.getHexString()}`,
        });
        if (w > 0 && rng.chance(0.25 * w)) pebbles[rng.int(0, 3)].push({ x: x + rng.range(-0.45, 0.45), y: s.y + 0.03, z: z + rng.range(-0.45, 0.45), ry: rng.range(0, 6.28), s: rng.range(0.7, 1.3) });
      }
    }
  }
  tiles.forEach((list, k) => list.length && root.add(kitInstances(kit, `tile_${k}`, list)));

  // ---- the stone ring: three rows of stacked blocks, taller toward the back ----
  const rocks = [[], [], [], [], [], []], walls = [[], [], []];
  let along = 0, lastWall = -9;
  for (const p of edge) {
    if (!ids.has(p.floor)) continue;
    along += 1;
    const back = THREE.MathUtils.clamp((-p.nz + 0.35) / 1.1, 0, 1);
    const open = isClear(p.x, p.z);
    for (let row = 0; row < 3; row++) {
      if (open && row === 0) continue;
      const off = 0.35 + row * 0.95 + rng.range(-0.15, 0.15), side = rng.range(-0.35, 0.35);
      const x = p.x + p.nx * off - p.nz * side, z = p.z + p.nz * off + p.nx * side;
      const base = row === 0 ? rng.range(0.55, 0.8) : rng.range(0.8, 1.25);
      const tall = row === 0 ? 0.7 : THREE.MathUtils.lerp(0.8, 1.6, back);
      const color = new THREE.Color().setScalar(rng.range(0.82, 1.1));
      rocks[rng.int(0, 5)].push({ x, y: p.y - 0.22 + (row === 0 ? 0 : 0.1), z, ry: rng.range(0, 6.28), rx: rng.range(-0.12, 0.12), s: [base, base * tall, base * rng.range(0.85, 1.15)], color: `#${color.getHexString()}` });
      // a second course on the outer rows: the ring reads as stacked stone, not a fence
      if (row > 0 && rng.chance(0.55 + back * 0.35)) {
        const b2 = base * rng.range(0.6, 0.85);
        rocks[rng.int(0, 5)].push({ x: x + rng.range(-0.2, 0.2), y: p.y - 0.22 + base * tall * 0.75, z: z + rng.range(-0.2, 0.2), ry: rng.range(0, 6.28), rz: rng.range(-0.15, 0.15), s: [b2, b2 * tall, b2], color: `#${color.multiplyScalar(1.08).getHexString()}` });
      }
    }
    // the cave's back: a columnar rock wall behind the ring, every couple of metres
    if (back > 0.6 && along - lastWall >= 3 && !open) {
      lastWall = along;
      const off = 2.3;
      walls[rng.int(0, 2)].push({ x: p.x + p.nx * off, y: p.y - 0.4, z: p.z + p.nz * off, ry: Math.atan2(-p.nx, -p.nz) + rng.range(-0.15, 0.15), s: [rng.range(0.85, 1.1), rng.range(0.6, 0.95), 1], color: `#${new THREE.Color().setScalar(rng.range(0.85, 1.05)).getHexString()}` });
    }
  }
  rocks.forEach((list, k) => list.length && root.add(kitInstances(kit, `rock_${k}`, list)));
  walls.forEach((list, k) => list.length && root.add(kitInstances(kit, `wall_${k}`, list)));
  pebbles.forEach((list, k) => list.length && root.add(kitInstances(kit, `pebble_${k}`, list)));
  return { root, count: tiles.flat().length };
}
