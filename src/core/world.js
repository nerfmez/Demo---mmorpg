// Builds the deterministic map from data/world.json: heightfield, zones, roads, water,
// bridges, colliders and decoration. The simulation uses it for movement, collision and
// spawns; the renderer draws exactly the same layout.
// Godot port: run `npm run export:layout` and load data/generated/*.json instead.

import { createRng } from './rng.js';
import { clamp, dist, distToPolyline, distToSegment, pointInBox, toBoxLocal, fromBoxLocal, polylineZAtX, coastSample, seaContains } from './math.js';
import { buildHeightfield, valueNoise } from './terrain.js';

const CELL = 8;

export function createWorld(worldData) {
  const rng = createRng(worldData.seed);
  const b = worldData.bounds;
  const water = worldData.waterLevel ?? -0.4;
  const maxSlope = worldData.terrain?.maxWalkSlope ?? 1.0;

  // ---------- zones ----------
  const zones = worldData.zones;
  const fallback = zones[zones.length - 1];
  const zoneAt = (x, z = 0) => {
    for (const zn of zones) for (const r of zn.rects) if (x >= r[0] && x < r[1] && z >= r[2] && z < r[3]) return zn;
    return fallback;
  };
  const zoneById = (id) => zones.find((q) => q.id === id);
  const isSafe = (x, z) => !!zoneAt(x, z).safe || (worldData.safeRoutes || []).some(route => distToPolyline(x, z, route.points) < route.width / 2);

  // ---------- roads / water ----------
  const roads = worldData.roads || [];
  /** Distance from the edge of the nearest road (negative = on the road). */
  const roadDist = (x, z) => {
    let best = Infinity;
    for (const r of roads) {
      const d = distToPolyline(x, z, r.points) - r.width / 2;
      if (d < best) best = d;
    }
    return best;
  };
  const river = worldData.river;
  const bridges = (river?.bridges || []).map((br) => ({ ...br, hx: br.halfLength, hz: br.halfWidth }));
  const bridgeAt = (x, z, pad = 0) => bridges.find((br) => pointInBox(br, x, z, pad)) || null;
  const onBridge = (x, z, pad = 0) => !!bridgeAt(x, z, pad);
  const docks = (worldData.docks || []).map(d => ({ ...d }));
  // Adjacent decks support the whole actor across their shared seam. Outer edges
  // still reject any footprint extending over water; dry shore can support a ramp join.
  const dockAt = (x, z, pad = 0) => {
    const deck = docks.find(d => pointInBox(d, x, z));
    if (!deck || pad <= 0) return deck || null;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, px = x + Math.sin(a) * pad, pz = z + Math.cos(a) * pad;
      if ((inSea(px, pz) || inPond(px, pz) || inRiver(px, pz)) && !docks.some(d => pointInBox(d, px, pz))) return null;
    }
    return deck;
  };
  const inRiver = (x, z, pad = 0) => !!river && distToPolyline(x, z, river.points) < river.width / 2 + pad;
  const inPond = (x, z, pad = 0) => (worldData.ponds || []).some(([px, pz, r]) => dist(x, z, px, pz) < r + pad);
  // Single-valued shores keep their original contract. Concave port capes may
  // opt into an authored contour shared with terrain, painting and water.
  const shore = worldData.sea?.shore || null;
  const shoreZ = (x) => (shore ? polylineZAtX(shore, x) : Infinity);
  const inSea = (x, z, pad = 0) => !!shore && (pad === 0 ? seaContains(worldData.sea, x, z) : coastSample(worldData.sea, x, z).distance < pad);
  const isWater = (x, z, pad = 0) => (inRiver(x, z, pad) || inPond(x, z, pad) || inSea(x, z, pad)) && !onBridge(x, z, 0.2) && !dockAt(x, z, pad);
  // One coastal mask for ground paint, plants and shells. Positive pad extends inland.
  const coastAt = (x, z) => shore ? coastSample(worldData.sea, x, z) : { distance: Infinity, kind: 'beach' };
  const isBeach = (x, z, pad = 0) => {
    const c = coastAt(x, z);
    return !!shore && c.kind === 'beach' && c.distance < (worldData.sea.beach || 14) + pad;
  };
  const blocksWater = (x, z, pad = 0) => !onBridge(x, z, 0.2) && !dockAt(x, z, pad) &&
    (inSea(x, z, pad) || inPond(x, z, pad) || (!river?.walkable && inRiver(x, z, pad)));

  // ---------- terrain ----------
  const hf = buildHeightfield(worldData, zoneAt);
  const terrainY = hf.heightAt;
  for (const dock of docks) if (dock.rampFromTerrain) {
    const start = fromBoxLocal(dock, 0, -dock.hz);
    dock.startY = terrainY(start.x, start.z);
  }
  for (const br of bridges) {
    const c = Math.cos(br.angle);
    const s = Math.sin(br.angle);
    // bridge local +X is (cos a, -sin a) in world XZ
    br.yA = terrainY(br.x - br.hx * c, br.z + br.hx * s);
    br.yB = terrainY(br.x + br.hx * c, br.z - br.hx * s);
  }
  /** Deck height at bridge-local x (continuous with both banks, gently arched). */
  const deckY = (br, lx) => {
    const t = clamp((lx + br.hx) / (2 * br.hx), 0, 1);
    return br.yA + (br.yB - br.yA) * t + 0.35 * Math.sin(Math.PI * t);
  };
  /** Height you stand on: the bridge deck when on a bridge, else the terrain. */
  const groundY = (x, z) => {
    const dock = dockAt(x, z);
    if (dock) return dock.rampFromTerrain ? dock.startY + (dock.height - dock.startY) * clamp((toBoxLocal(dock, x, z).lz + dock.hz) / (2 * dock.hz), 0, 1) : dock.height;
    const br = bridgeAt(x, z);
    if (br) return Math.max(deckY(br, toBoxLocal(br, x, z).lx), terrainY(x, z));
    return terrainY(x, z);
  };
  /** Height for things that float (wisps, loot over water). */
  const surfaceY = (x, z) => Math.max(groundY(x, z), water);

  // ---------- placement bookkeeping ----------
  const circles = []; // colliders {x,z,r,type,scale,rot}
  const boxes = []; // colliders {x,z,hx,hz,angle,type}
  const decor = {
    flowers: [], grass: [], bushes: [], ferns: [], mushrooms: [], reeds: [], lilies: [], lanterns: [], fences: [],
    crates: [], bones: [], pebbles: [], shells: [], arches: [], banners: [], edgeTrees: [], logsDecor: [],
  };
  const PCELL = 4;
  const placed = new Map();
  const pkey = (cx, cz) => cx * 4096 + cz;
  const addPlaced = (o, r) => {
    for (let cx = Math.floor((o.x - r) / PCELL); cx <= Math.floor((o.x + r) / PCELL); cx++)
      for (let cz = Math.floor((o.z - r) / PCELL); cz <= Math.floor((o.z + r) / PCELL); cz++) {
        const k = pkey(cx, cz);
        if (!placed.has(k)) placed.set(k, []);
        placed.get(k).push(o);
      }
  };
  const overlaps = (x, z, r) => {
    for (let cx = Math.floor((x - r - 4) / PCELL); cx <= Math.floor((x + r + 4) / PCELL); cx++)
      for (let cz = Math.floor((z - r - 4) / PCELL); cz <= Math.floor((z + r + 4) / PCELL); cz++) {
        const list = placed.get(pkey(cx, cz));
        if (!list) continue;
        for (const o of list) {
          if (o.hx !== undefined) {
            if (pointInBox(o, x, z, r + 0.6)) return true;
          } else if (dist(x, z, o.x, o.z) < o.r + r + 0.6) return true;
        }
      }
    return false;
  };
  const addCircle = (o) => {
    circles.push(o);
    addPlaced(o, o.r);
    return o;
  };
  const addBox = (o) => {
    boxes.push(o);
    addPlaced(o, Math.hypot(o.hx, o.hz));
    return o;
  };

  const town = worldData.town;
  const bossList = worldData.bosses || [];
  const clearAreas = [
    { x: worldData.playerSpawn[0], z: worldData.playerSpawn[1], r: 8 },
    { x: town.workbench[0], z: town.workbench[1], r: 4 },
    { x: town.trainer[0], z: town.trainer[1], r: 4 },
    { x: town.respawn[0], z: town.respawn[1], r: 5 },
    { x: town.centre[0], z: town.centre[1], r: town.plazaRadius + 1 },
    ...bossList.map((bs) => ({ x: bs.arena.x, z: bs.arena.z, r: bs.arena.r - 2.5 })),
    ...(worldData.waypoints || []).map((wp) => ({ x: wp.pos[0], z: wp.pos[1], r: 3.5 })),
  ];
  if (worldData.den) clearAreas.push({ x: worldData.den.centre[0], z: worldData.den.centre[1], r: worldData.den.radius - 1 });
  if (worldData.camp) clearAreas.push({ x: worldData.camp.fire[0], z: worldData.camp.fire[1], r: 5 });
  if (worldData.harbor) {
    const [x, z] = worldData.harbor.lighthouse;
    clearAreas.push({ x, z, r: 6 });
    addCircle({ x, z, r: 2, type: 'lighthouse', scale: 1, rot: 0 });
  }

  const inBounds = (x, z, m = 1) => x > b.minX + m && x < b.maxX - m && z > b.minZ + m && z < b.maxZ - m;
  const blockedForProp = (x, z, r, { roadPad = 1.2, slope = 0.9 } = {}) =>
    !inBounds(x, z) ||
    isWater(x, z, r + 0.8) ||
    docks.some(d => pointInBox(d, x, z, r + 0.8)) ||
    onBridge(x, z, r + 2) ||
    roadDist(x, z) < r + roadPad ||
    clearAreas.some((c) => dist(x, z, c.x, c.z) < c.r + r) ||
    hf.slopeAt(x, z) > slope ||
    overlaps(x, z, r);

  // ---------- town ----------
  for (const entry of town.buildings) {
    const building = Array.isArray(entry) ? { x: entry[0], z: entry[1], angle: entry[2], hx: 3.4, hz: 2.8 } : entry;
    addBox({ ...building, type: 'house' });
  }
  for (const tree of town.trees || []) {
    addCircle({ ...tree, type: tree.species });
  }
  for (const rock of town.rocks || []) {
    addCircle({ ...rock, type: 'boulder' });
  }
  addBox({ x: town.workbench[0], z: town.workbench[1] - 1.6, hx: 1.3, hz: 0.6, angle: 0, type: 'workbench' });
  addCircle({ x: town.well[0], z: town.well[1], r: 1.3, type: 'well', scale: 1, rot: 0 });
  for (const entry of town.stalls || []) {
    const stall = Array.isArray(entry) ? { x: entry[0], z: entry[1], angle: entry[2], hx: 1.6, hz: 1.1 } : entry;
    addBox({ ...stall, type: 'stall' });
  }
  for (const resident of town.residents || []) addCircle({ ...resident, type: 'citizen', scale: 1, rot: resident.angle });
  const tr = zoneById('settlement').rects[0];
  const walls = town.walls;
  const gateZ = walls ? roadZAt(roads[0].points, walls.east) : town.centre[1];
  const fenceRun = (x0, z0, x1, z1, gates = []) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 4);
    const angle = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (gates.some((g) => dist(x, z, g.x, g.z) < walls.gateHalf + 2)) continue;
      decor.fences.push({ x, z, angle, len: len / n });
      addBox({ x, z, hx: 0.25, hz: len / n / 2, angle: angle, type: 'fence' });
    }
  };
  if (walls) {
  fenceRun(walls.east, tr[2], walls.east, tr[3], [{ x: walls.east, z: gateZ }]);
  fenceRun(tr[0] + 1, walls.north, walls.east, walls.north);
  fenceRun(tr[0] + 1, walls.south, walls.east, walls.south);
  decor.lanterns.push({ x: walls.east + 1.5, z: gateZ - 5 }, { x: walls.east + 1.5, z: gateZ + 5 });
  }
  decor.lanterns.push({ x: town.workbench[0] + 3, z: town.workbench[1] + 1 }, { x: town.trainer[0] + 3, z: town.trainer[1] - 1 });
  for (const a of [0.8, 2.4, 3.9, 5.5]) decor.lanterns.push({ x: town.centre[0] + Math.sin(a) * (town.plazaRadius + 0.5), z: town.centre[1] + Math.cos(a) * (town.plazaRadius + 0.5) });
  for (const entry of town.stalls || []) {
    if (!Array.isArray(entry)) continue; // Authored counters contain their own storage.
    const [x, z, a] = entry;
    decor.crates.push({ x: x + Math.cos(a) * 2.4, z: z - Math.sin(a) * 2.4, s: 0.8, rot: a, kind: 'crate' });
    decor.crates.push({ x: x - Math.cos(a) * 2.2, z: z + Math.sin(a) * 2.2, s: 0.7, rot: a + 0.4, kind: 'barrel' });
  }
  decor.crates.push({ x: town.workbench[0] + 2.2, z: town.workbench[1] - 1.2, s: 0.8, rot: 0.3, kind: 'crate' });
  decor.crates.push({ x: town.workbench[0] - 2.4, z: town.workbench[1] - 1.4, s: 0.75, rot: 0, kind: 'barrel' });
  if (walls) decor.banners.push({ x: walls.east - 0.6, z: gateZ - walls.gateHalf - 0.5, color: '#c9302c' }, { x: walls.east - 0.6, z: gateZ + walls.gateHalf + 0.5, color: '#c9302c' });
  for (const [x, z] of worldData.harbor?.crates || []) {
    decor.crates.push({ x, z, s: .8, rot: .2, kind: 'crate' });
    addBox({ x, z, hx: .4, hz: .4, angle: .2, type: 'harbor_crate' });
  }
  for (const cargo of worldData.harbor?.dockCargo || []) addBox({ ...cargo, type: 'dock_cargo' });
  for (const prop of worldData.harbor?.workProps || []) addBox({ ...prop, type: 'harbor_work' });

  // ---------- waypoints ----------
  const waypoints = (worldData.waypoints || []).map((wp) => ({ ...wp, x: wp.pos[0], z: wp.pos[1] }));
  for (const wp of waypoints) addCircle({ x: wp.x, z: wp.z, r: 0.7, type: 'waypoint', id: wp.id, scale: 1, rot: 0 });

  // ---------- ruins ----------
  const ruins = worldData.ruins;
  if (ruins) {
    const [rcx, rcz] = ruins.centre;
    for (let i = 0; i < ruins.pillars; i++) {
      const a = (i / ruins.pillars) * Math.PI * 2;
      const x = rcx + Math.sin(a) * ruins.ringRadius;
      const z = rcz + Math.cos(a) * ruins.ringRadius;
      if (roadDist(x, z) < 1.5) continue; // keep entrances open
      addCircle({ x, z, r: 0.9, type: rng.chance(0.4) ? 'pillar_broken' : 'pillar', scale: rng.range(0.9, 1.15), rot: rng.range(0, 6.28) });
    }
    const rz = zoneById('ruins');
    const rr = rz.rects[0];
    for (let i = 0; i < 90; i++) {
      const x = rng.range(rr[0] + 2, rr[1] - 2);
      const z = rng.range(rr[2] + 2, rr[3] - 2);
      const kind = rng.next();
      if (kind < 0.35) {
        const len = rng.range(2.5, 5.5);
        const angle = rng.range(0, Math.PI);
        if (blockedForProp(x, z, len / 2 + 0.3, { roadPad: 1.5 })) continue;
        addBox({ x, z, hx: 0.45, hz: len / 2, angle, type: 'ruin_wall', height: rng.range(0.8, 2.2) });
      } else if (kind < 0.8) {
        const r = rng.range(0.8, 1.5);
        if (blockedForProp(x, z, r)) continue;
        addCircle({ x, z, r, type: 'ruin_block', scale: r, rot: rng.range(0, 6.28) });
      } else if (kind < 0.9) {
        if (blockedForProp(x, z, 1.0, { roadPad: 1.5 })) continue;
        addCircle({ x, z, r: 0.9, type: 'statue', scale: rng.range(0.9, 1.1), rot: rng.range(0, 6.28) });
      }
    }
  }
  // stone arches where roads climb onto the ruins plateau
  for (const road of roads) {
    const pts = road.points;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s];
      const [bx, bz] = pts[s + 1];
      const za = zoneAt(ax, az).id;
      const zb = zoneAt(bx, bz).id;
      if (za !== 'ruins' && zb === 'ruins') {
        // find where the segment enters the ruins rect, put an arch a little inside
        const t = 0.8;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const angle = Math.atan2(bx - ax, bz - az);
        const span = road.width / 2 + 1.1;
        const px = Math.cos(angle);
        const pz = -Math.sin(angle);
        decor.arches.push({ x, z, angle, span });
        addCircle({ x: x + px * span, z: z + pz * span, r: 0.6, type: 'arch_pillar', scale: 1, rot: angle });
        addCircle({ x: x - px * span, z: z - pz * span, r: 0.6, type: 'arch_pillar', scale: 1, rot: angle });
      }
    }
  }

  // ---------- highland camp, wolf den ----------
  if (worldData.camp) {
    for (const [x, z, a] of worldData.camp.tents) addBox({ x, z, hx: 1.7, hz: 1.4, angle: a, type: 'tent' });
    const [fx, fz] = worldData.camp.fire;
    addCircle({ x: fx, z: fz, r: 0.7, type: 'campfire', scale: 1, rot: 0 });
    decor.logsDecor.push({ x: fx + 1.8, z: fz + 0.3, angle: 1.2 }, { x: fx - 1.7, z: fz - 0.4, angle: 1.9 });
  }
  if (worldData.den) {
    const [dx, dz] = worldData.den.centre;
    const R = worldData.den.radius + 2.5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = dx + Math.sin(a) * R * rng.range(0.95, 1.1);
      const z = dz + Math.cos(a) * R * rng.range(0.95, 1.1);
      if (roadDist(x, z) < 2) continue;
      const r = rng.range(1.2, 2.0);
      addCircle({ x, z, r, type: 'boulder', scale: r, rot: rng.range(0, 6.28) });
    }
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(1, worldData.den.radius - 1);
      decor.bones.push({ x: dx + Math.sin(a) * r, z: dz + Math.cos(a) * r, rot: rng.range(0, 6.28), s: rng.range(0.7, 1.2) });
    }
  }

  // ---------- trees, rocks, crystals, logs by zone ----------
  for (let x = b.minX - 30; x < b.maxX + 30; x += 3.2) {
    for (let z = b.minZ - 30; z < b.maxZ + 30; z += 3.2) {
      const jx = x + rng.range(-1.4, 1.4);
      const jz = z + rng.range(-1.4, 1.4);
      if (!inBounds(jx, jz, -0.5)) {
        // forest band on the mountains around the map: looks enclosed, never reachable
        if (inSea(jx, jz, 2) || isBeach(jx, jz, 2)) continue; // open coast to the horizon
        if (rng.next() < 0.55) decor.edgeTrees.push({ x: jx, z: jz, type: rng.chance(0.25) ? 'birch' : 'tree', scale: rng.range(0.9, 1.5), rot: rng.range(0, 6.28) });
        continue;
      }
      const zn = zoneAt(jx, jz);
      if (isBeach(jx, jz, 1.5)) continue;
      const edge = Math.min(jx - b.minX, b.maxX - jx, jz - b.minZ) < 10 ? 0.45 : 0;
      // trees gather in groves with open clearings between them
      const grove = smooth01((valueNoise(jx * 0.035, jz * 0.035, 17) - 0.42) / 0.3) * 1.8;
      const density = (zn.treeDensity || 0) * 0.3 * grove + edge + (zn.safe ? -0.3 : 0);
      const roll = rng.next();
      if (roll < density) {
        const scale = rng.range(0.85, 1.35);
        const type = rng.pick(zn.trees || ['tree']);
        const trunk = type === 'pine' ? 0.6 : type === 'palm' ? 0.4 : 0.75;
        if (!blockedForProp(jx, jz, 0.8)) addCircle({ x: jx, z: jz, r: trunk * scale, type, scale, rot: rng.range(0, 6.28) });
      } else if (!zn.safe) {
        const r2 = rng.next();
        const rockChance = zn.id === 'highlands' ? 0.03 : zn.id === 'wolf_den' ? 0.03 : 0.012;
        if (r2 < rockChance) {
          const r = rng.range(0.7, 1.6);
          if (!blockedForProp(jx, jz, r, { slope: 1.5 })) addCircle({ x: jx, z: jz, r, type: r > 1.3 ? 'boulder' : 'rock', scale: r, rot: rng.range(0, 6.28) });
        } else if (r2 < rockChance + (zn.id === 'highlands' || zn.id === 'ruins' ? 0.012 : 0)) {
          const r = rng.range(0.6, 1.0);
          if (!blockedForProp(jx, jz, r)) addCircle({ x: jx, z: jz, r, type: 'crystal', scale: r, rot: rng.range(0, 6.28), hue: rng.pick([0, 0, 1]) });
        } else if (r2 < rockChance + 0.02 && (zn.id === 'forest' || zn.id === 'glade' || zn.id === 'wolf_den')) {
          if (rng.chance(0.5)) {
            const len = rng.range(2.4, 4);
            const angle = rng.range(0, Math.PI);
            if (!blockedForProp(jx, jz, len / 2)) addBox({ x: jx, z: jz, hx: 0.4, hz: len / 2, angle, type: 'log' });
          } else if (!blockedForProp(jx, jz, 0.5)) addCircle({ x: jx, z: jz, r: 0.5, type: 'stump', scale: rng.range(0.8, 1.2), rot: rng.range(0, 6.28) });
        }
      }
    }
  }

  // ---------- small decoration (no collision) ----------
  const area = (b.maxX - b.minX) * (b.maxZ - b.minZ);
  const samples = Math.round(area * 0.16);
  const nearCollider = (x, z, pad) => overlaps(x, z, pad - 0.6);
  for (let i = 0; i < samples; i++) {
    const x = rng.range(b.minX, b.maxX);
    const z = rng.range(b.minZ, b.maxZ);
    const zn = zoneAt(x, z);
    if (isWater(x, z, 0.6)) {
      if (inPond(x, z, -0.8) && rng.chance(0.3)) decor.lilies.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.6, 1.1) });
      continue;
    }
    if (isBeach(x, z, 2.5)) {
      // Sparse, recognisable shore objects; never replace sand with meadow vegetation.
      if (nearCollider(x, z, 0.5) || onBridge(x, z, 1) || dockAt(x, z)) continue;
      const scatter = rng.next();
      if (scatter < (worldData.sea.shellDensity ?? 0.17)) decor.shells.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.36, 0.7), kind: rng.chance(0.65) ? 'fan' : 'spiral' });
      else if (scatter < 0.24) decor.pebbles.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.6, 1.1) });
      continue;
    }
    if (worldData.town.blockout && (zn.safe || dockAt(x, z))) continue;
    if (roadDist(x, z) < -0.3) {
      if (rng.chance(0.08)) decor.pebbles.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.6, 1.2) });
      continue;
    }
    if (isWater(x, z, 2.2) && !inSea(x, z, 12)) {
      decor.reeds.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.7, 1.3) });
      continue;
    }
    if (zn.safe && dist(x, z, town.centre[0], town.centre[1]) < town.plazaRadius) continue;
    const r = rng.next();
    const flowerSet = zn.id === 'glade' ? [2, 2, 3, 0] : zn.id === 'ruins' ? [3, 2] : zn.id === 'highlands' ? [1, 0, 4] : zn.id === 'wetland' ? [0, 3, 4] : [0, 0, 1, 2];
    if (r < 0.3) decor.flowers.push({ x, z, color: rng.pick(flowerSet), s: rng.range(0.7, 1.2) });
    else if (r < 0.82) decor.grass.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.7, 1.4) });
    else if (r < 0.88) {
      if ((zn.id === 'forest' || zn.id === 'wolf_den' || zn.id === 'glade') && !nearCollider(x, z, 0.5)) decor.ferns.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.7, 1.3) });
      else if (!zn.safe && !nearCollider(x, z, 1)) decor.bushes.push({ x, z, s: rng.range(0.6, 1.1), berries: zn.id === 'glade' && rng.chance(0.5) });
    } else if (r < 0.91) {
      if (zn.id === 'forest' || zn.id === 'wetland' || zn.id === 'glade' || zn.id === 'wolf_den') decor.mushrooms.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.6, 1.3), red: rng.chance(0.4) });
    } else if (r < 0.93 && !zn.safe) decor.pebbles.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.8, 1.6) });
  }

  // ---------- collision grid ----------
  const grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
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
    if (!ignoreWater && blocksWater(x, z, r * 0.3)) return false;
    for (const o of nearby(x, z)) {
      if (o.hx !== undefined) {
        if (pointInBox(o, x, z, r)) return false;
      } else if (dist(x, z, o.x, o.z) < o.r + r) return false;
    }
    return true;
  }

  /** Uphill steeper than maxWalkSlope is a wall (cliffs); walking down is always allowed. */
  const tooSteep = (x0, z0, x1, z1) => {
    const s = Math.hypot(x1 - x0, z1 - z0);
    if (s < 1e-5) return false;
    return groundY(x1, z1) - groundY(x0, z0) > maxSlope * s + 0.04;
  };

  /** Move a circle by (dx,dz), sliding along obstacles, water and cliffs. */
  function move(x, z, r, dx, dz, opts = {}) {
    let nx = clamp(x + dx, b.minX + r, b.maxX - r);
    let nz = clamp(z + dz, b.minZ + r, b.maxZ - r);
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
            if (d < 1e-4) nx = o.x + min;
            else {
              const k = (min - d) / d;
              nx += (nx - o.x) * k;
              nz += (nz - o.z) * k;
            }
          }
        }
      }
    }
    let blocked = false;
    const bad = (px, pz) => (!opts.ignoreWater && blocksWater(px, pz, r * 0.3)) || (!opts.ignoreSlope && tooSteep(x, z, px, pz));
    if (bad(nx, nz)) {
      // slide: try each axis alone
      if (!bad(x + dx, z)) {
        nx = x + dx;
        nz = z;
      } else if (!bad(x, z + dz)) {
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

  /** A random free, walkable point inside a zone (for spawns). */
  function randomPointInZone(zoneId, r, rand, avoid = []) {
    const zn = zoneById(zoneId);
    for (let i = 0; i < 300; i++) {
      const rect = zn.rects[Math.floor(rand.next() * zn.rects.length)];
      const x = rand.range(Math.max(rect[0], b.minX) + 3, Math.min(rect[1], b.maxX) - 3);
      const z = rand.range(Math.max(rect[2], b.minZ) + 3, Math.min(rect[3], b.maxZ) - 3);
      if (zoneAt(x, z).id !== zoneId) continue;
      if (isSafe(x, z) || roadDist(x, z) < r + 2 || docks.some(d => pointInBox(d, x, z, r))) continue;
      // A walkable stream is still water: land spawns stay on dry ground.
      if (isWater(x, z, (r + 0.5) * 0.3) || !isFree(x, z, r + 0.5)) continue;
      if (hf.slopeAt(x, z) > 0.6) continue;
      if (avoid.some((a) => dist(x, z, a.x, a.z) < a.r)) continue;
      return { x, z };
    }
    // Exhaustion is explicit: never place a monster in water or in a safe area.
    return null;
  }

  return {
    data: worldData,
    bounds: b,
    zones,
    zoneAt,
    zoneById,
    isSafe,
    docks,
    dockAt,
    waterLevel: water,
    heightfield: hf,
    terrainY,
    groundY,
    surfaceY,
    deckY,
    slopeAt: hf.slopeAt,
    isWater,
    isBeach,
    coastAt,
    blocksWater,
    inSea,
    shoreZ,
    onBridge,
    bridgeAt,
    bridges,
    inRiver,
    inPond,
    roads,
    roadDist,
    pathDist: roadDist,
    circles,
    boxes,
    decor,
    waypoints,
    isFree,
    tooSteep,
    move,
    randomPointInZone,
    gateZ,
  };
}

/** z of a road at a given x (first segment spanning x). */
function roadZAt(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if ((x >= ax && x <= bx) || (x <= ax && x >= bx)) return az + ((bz - az) * (x - ax)) / (bx - ax || 1);
  }
  return 0;
}

function smooth01(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

export { distToSegment };
