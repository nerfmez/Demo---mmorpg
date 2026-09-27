// Builds the deterministic map layout from data/world.json.
// The simulation uses it for collision and spawns; the renderer draws the same layout.
// Godot port: run `npm run export:layout` and load data/generated/layout.json instead.

import { createRng } from './rng.js';
import { clamp, dist, distToPolyline, pointInBox, toBoxLocal, fromBoxLocal } from './math.js';

const CELL = 8;

export function createWorld(worldData) {
  const rng = createRng(worldData.seed);
  const b = worldData.bounds;
  const path = worldData.path.points;
  const pathHalf = worldData.path.width / 2;
  const river = worldData.river;
  const bridgeBox = {
    x: river.bridge.x,
    z: river.bridge.z,
    hx: river.bridge.halfLength,
    hz: river.bridge.halfWidth,
    angle: river.bridge.angle,
  };

  const zones = worldData.zones;
  const zoneAt = (x) => zones.find((zn) => x >= zn.minX && x < zn.maxX) || zones[zones.length - 1];

  const onBridge = (x, z, pad = 0) => pointInBox(bridgeBox, x, z, pad);
  const inRiver = (x, z, pad = 0) => distToPolyline(x, z, river.points) < river.width / 2 + pad;
  const inPond = (x, z, pad = 0) => worldData.ponds.some(([px, pz, r]) => dist(x, z, px, pz) < r + pad);
  const isWater = (x, z, pad = 0) => (inRiver(x, z, pad) || inPond(x, z, pad)) && !onBridge(x, z, 0.2);
  const pathDist = (x, z) => distToPolyline(x, z, path);

  const circles = []; // colliding round things {x,z,r,type,scale,rot}
  const boxes = []; // colliding boxes {x,z,hx,hz,angle,type}
  const decor = { flowers: [], grass: [], bushes: [], lanterns: [], fences: [], reeds: [], lilies: [] };

  const town = worldData.town;
  const boss = worldData.boss;
  const clearAreas = [
    { x: town.workbench[0], z: town.workbench[1], r: 4 },
    { x: town.trainer[0], z: town.trainer[1], r: 4 },
    { x: town.respawn[0], z: town.respawn[1], r: 5 },
    { x: boss.arena.x, z: boss.arena.z, r: boss.arena.r - 2 },
  ];

  const blockedForProp = (x, z, r) =>
    x < b.minX + 1 ||
    x > b.maxX - 1 ||
    z < b.minZ + 1 ||
    z > b.maxZ - 1 ||
    isWater(x, z, r + 0.8) ||
    onBridge(x, z, r + 2) ||
    pathDist(x, z) < pathHalf + r + 1.2 ||
    clearAreas.some((c) => dist(x, z, c.x, c.z) < c.r + r) ||
    circles.some((c) => dist(x, z, c.x, c.z) < c.r + r + 0.6) ||
    boxes.some((bx) => pointInBox(bx, x, z, r + 0.6));

  // Town buildings (boxes) and wall with a gate on the road.
  for (const [x, z, a] of town.buildings) {
    boxes.push({ x, z, hx: 3.4, hz: 2.8, angle: a, type: 'house' });
  }
  boxes.push({ x: town.workbench[0], z: town.workbench[1] - 1.6, hx: 1.3, hz: 0.6, angle: 0, type: 'workbench' });
  const gateZ = path.length > 3 ? pathDistZ(path, town.wallX) : 0;
  for (let z = b.minZ + 2; z < b.maxZ - 2; z += 4) {
    if (Math.abs(z + 2 - gateZ) < 5) continue;
    decor.fences.push({ x: town.wallX, z: z + 2, angle: Math.PI / 2, len: 4 });
    boxes.push({ x: town.wallX, z: z + 2, hx: 2, hz: 0.25, angle: Math.PI / 2, type: 'fence' });
  }
  decor.lanterns.push({ x: town.wallX + 1.5, z: gateZ - 4 }, { x: town.wallX + 1.5, z: gateZ + 4 });
  decor.lanterns.push({ x: town.workbench[0] + 3, z: town.workbench[1] + 1 }, { x: town.trainer[0] + 3, z: town.trainer[1] - 1 });

  // Ruins: a broken ring of pillars around the boss arena plus fallen blocks.
  const rc = worldData.ruins.centre;
  const pillars = worldData.ruins.pillars;
  for (let i = 0; i < pillars; i++) {
    const a = (i / pillars) * Math.PI * 2;
    const x = rc[0] + Math.sin(a) * 13.5;
    const z = rc[1] + Math.cos(a) * 13.5;
    if (pathDist(x, z) < pathHalf + 1) continue; // keep the entrance open
    const broken = rng.chance(0.4);
    circles.push({ x, z, r: 0.9, type: broken ? 'pillar_broken' : 'pillar', scale: rng.range(0.9, 1.15), rot: rng.range(0, 6.28) });
  }
  for (let i = 0; i < 14; i++) {
    const x = rng.range(56, 98);
    const z = rng.range(b.minZ + 4, b.maxZ - 4);
    const r = rng.range(0.9, 1.6);
    if (!blockedForProp(x, z, r)) circles.push({ x, z, r, type: 'ruin_block', scale: r, rot: rng.range(0, 6.28) });
  }

  // Trees and rocks by zone density.
  for (let x = b.minX + 2; x < b.maxX - 2; x += 3.2) {
    for (let z = b.minZ + 2; z < b.maxZ - 2; z += 3.2) {
      const jx = x + rng.range(-1.4, 1.4);
      const jz = z + rng.range(-1.4, 1.4);
      const zn = zoneAt(jx);
      const edge = Math.abs(jz) > b.maxZ - 10 ? 0.55 : 0; // denser near map edges so it reads as a valley
      const density = (zn.treeDensity || 0) * 0.28 + edge + (zn.safe ? -1 : 0);
      if (zn.safe && Math.abs(jz) > b.maxZ - 6) {
        if (rng.chance(0.5) && !blockedForProp(jx, jz, 0.8)) circles.push({ x: jx, z: jz, r: 0.8, type: 'tree', scale: rng.range(0.9, 1.3), rot: rng.range(0, 6.28) });
        continue;
      }
      if (rng.next() < density) {
        const scale = rng.range(0.85, 1.35);
        if (!blockedForProp(jx, jz, 0.8)) circles.push({ x: jx, z: jz, r: 0.75 * scale, type: zn.id === 'wetland' && rng.chance(0.4) ? 'willow' : 'tree', scale, rot: rng.range(0, 6.28) });
      } else if (rng.next() < 0.035 && !zn.safe) {
        const r = rng.range(0.7, 1.5);
        if (!blockedForProp(jx, jz, r)) circles.push({ x: jx, z: jz, r, type: 'rock', scale: r, rot: rng.range(0, 6.28) });
      }
    }
  }

  // Non-colliding decoration.
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(b.minX, b.maxX);
    const z = rng.range(b.minZ, b.maxZ);
    if (isWater(x, z, 0.3) || pathDist(x, z) < pathHalf - 0.3) {
      if (inPond(x, z, -0.5) && rng.chance(0.25)) decor.lilies.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.6, 1.1) });
      continue;
    }
    if (isWater(x, z, 1.4)) {
      decor.reeds.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.7, 1.3) });
      continue;
    }
    const zn = zoneAt(x);
    const r = rng.next();
    if (r < 0.34) decor.flowers.push({ x, z, color: rng.pick(zn.id === 'ruins' ? [2, 3] : [0, 0, 1, 2]), s: rng.range(0.7, 1.2) });
    else if (r < 0.9) decor.grass.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.7, 1.4) });
    else if (!zn.safe && !circles.some((c) => dist(x, z, c.x, c.z) < c.r + 1)) decor.bushes.push({ x, z, s: rng.range(0.6, 1.1) });
  }

  // Spatial grid for collision lookups.
  const grid = new Map();
  const key = (cx, cz) => cx * 1000 + cz;
  const addToGrid = (item, x, z, r) => {
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const k = key(cx, cz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(item);
      }
  };
  for (const c of circles) addToGrid(c, c.x, c.z, c.r);
  for (const bx of boxes) addToGrid(bx, bx.x, bx.z, Math.hypot(bx.hx, bx.hz));
  const nearby = (x, z) => grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];

  /** True when a circle of radius r at (x,z) may stand there. */
  function isFree(x, z, r, { ignoreWater = false } = {}) {
    if (x < b.minX + r || x > b.maxX - r || z < b.minZ + r || z > b.maxZ - r) return false;
    if (!ignoreWater && isWater(x, z, r * 0.3)) return false;
    for (const o of nearby(x, z)) {
      if (o.hx !== undefined) {
        if (pointInBox(o, x, z, r)) return false;
      } else if (dist(x, z, o.x, o.z) < o.r + r) return false;
    }
    return true;
  }

  /** Move a circle by (dx,dz), sliding along obstacles. Returns the new position and whether it was blocked. */
  function move(x, z, r, dx, dz, opts = {}) {
    let nx = clamp(x + dx, b.minX + r, b.maxX - r);
    let nz = clamp(z + dz, b.minZ + r, b.maxZ - r);
    // push out of solids
    for (let iter = 0; iter < 2; iter++) {
      for (const o of nearby(nx, nz)) {
        if (o.hx !== undefined) {
          const { lx, lz } = toBoxLocal(o, nx, nz);
          const ox = o.hx + r - Math.abs(lx);
          const oz = o.hz + r - Math.abs(lz);
          if (ox > 0 && oz > 0) {
            const p = ox < oz ? fromBoxLocal(o, lx + Math.sign(lx || 1) * ox, lz) : fromBoxLocal(o, lx, lz + Math.sign(lz || 1) * oz);
            nx = p.x;
            nz = p.z;
          }
        } else {
          const d = dist(nx, nz, o.x, o.z);
          const min = o.r + r;
          if (d < min) {
            if (d < 1e-4) {
              nx = o.x + min;
            } else {
              const k = (min - d) / d;
              nx += (nx - o.x) * k;
              nz += (nz - o.z) * k;
            }
          }
        }
      }
    }
    let blocked = false;
    if (!opts.ignoreWater && isWater(nx, nz, r * 0.3)) {
      // slide: try each axis alone
      if (!isWater(x + dx, z, r * 0.3)) {
        nx = x + dx;
        nz = z;
      } else if (!isWater(x, z + dz, r * 0.3)) {
        nx = x;
        nz = z + dz;
      } else {
        nx = x;
        nz = z;
      }
      blocked = true;
    }
    if (Math.abs(nx - (x + dx)) > 1e-3 || Math.abs(nz - (z + dz)) > 1e-3) blocked = true;
    return { x: nx, z: nz, blocked };
  }

  /** Pick a random free point inside a zone (for spawns). */
  function randomPointInZone(zoneId, r, rand, avoid = []) {
    const zn = zones.find((q) => q.id === zoneId);
    for (let i = 0; i < 200; i++) {
      const x = rand.range(zn.minX + 3, zn.maxX - 3);
      const z = rand.range(b.minZ + 5, b.maxZ - 5);
      if (!isFree(x, z, r + 0.5)) continue;
      if (avoid.some((a) => dist(x, z, a.x, a.z) < a.r)) continue;
      return { x, z };
    }
    return { x: (zn.minX + zn.maxX) / 2, z: 0 };
  }

  return {
    data: worldData,
    bounds: b,
    zones,
    zoneAt,
    isWater,
    onBridge,
    inRiver,
    inPond,
    pathDist,
    bridgeBox,
    circles,
    boxes,
    decor,
    isFree,
    move,
    randomPointInZone,
    gateZ,
  };
}

function pathDistZ(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if (x >= ax && x <= bx) return az + ((bz - az) * (x - ax)) / (bx - ax || 1);
  }
  return 0;
}
