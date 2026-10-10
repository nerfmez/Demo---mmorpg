// One fixed-coordinate rules world. Authored regions remain immutable sources;
// region edges are bookkeeping boundaries, never scene changes or collision walls.
import { dist, pointInBox } from './math.js';

const GRID = 8;
const EPS = 1e-7;

export function createUnifiedWorld(worlds, originId) {
  const origin = [...(worlds[originId].data.atlas?.offset || [0, 0])];
  const entries = Object.entries(worlds).map(([id, world]) => {
    const offset = world.data.atlas?.offset || [0, 0], dx = offset[0] - origin[0], dz = offset[1] - origin[1];
    const b = world.bounds;
    return { id, world, dx, dz, bounds: { minX: b.minX + dx, maxX: b.maxX + dx, minZ: b.minZ + dz, maxZ: b.maxZ + dz } };
  });
  const byId = new Map(entries.map(e => [e.id, e]));
  let active = byId.get(originId);
  const contains = (e, x, z) => x >= e.bounds.minX - EPS && x <= e.bounds.maxX + EPS && z >= e.bounds.minZ - EPS && z <= e.bounds.maxZ + EPS;
  function regionAt(x, z) {
    // Half-open ownership gives the same result independently of active metadata.
    for (const e of entries) if (x >= e.bounds.minX && x < e.bounds.maxX && z >= e.bounds.minZ && z < e.bounds.maxZ) return e;
    return entries.find(e => contains(e, x, z)) || null;
  }
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const circles = [], boxes = [], grid = new Map(), waypoints = [], exits = [], zones = [], roads = [], landmarks = [], docks = [], bridges = [];
  const shiftedObjects = new Map();
  let decor = null;
  const addCollider = (o, r) => {
    for (let cx = Math.floor((o.x - r) / GRID); cx <= Math.floor((o.x + r) / GRID); cx++)
      for (let cz = Math.floor((o.z - r) / GRID); cz <= Math.floor((o.z + r) / GRID); cz++) {
        const k = cx * 4096 + cz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(o);
      }
  };
  for (const e of entries) {
    for (const name of ['minX', 'minZ']) bounds[name] = Math.min(bounds[name], e.bounds[name]);
    for (const name of ['maxX', 'maxZ']) bounds[name] = Math.max(bounds[name], e.bounds[name]);
    for (const o of e.world.circles) { const c = { ...o, x: o.x + e.dx, z: o.z + e.dz, worldId: e.id }; circles.push(c); addCollider(c, c.r); }
    for (const o of e.world.boxes) { const c = { ...o, x: o.x + e.dx, z: o.z + e.dz, worldId: e.id }; boxes.push(c); addCollider(c, Math.hypot(c.hx, c.hz)); }
    for (const w of e.world.waypoints) waypoints.push({ ...w, x: w.x + e.dx, z: w.z + e.dz, worldId: e.id });
    for (const w of e.world.exits) exits.push({ ...w, x: w.x + e.dx, z: w.z + e.dz, worldId: e.id });
    for (const z of e.world.zones) {
      const shifted = { ...z, worldId: e.id, rects: z.rects.map(r => [r[0] + e.dx, r[1] + e.dx, r[2] + e.dz, r[3] + e.dz]) };
      zones.push(shifted); shiftedObjects.set(z, shifted);
    }
    for (const r of e.world.roads) roads.push({ ...r, worldId: e.id, points: r.points.map(p => [p[0] + e.dx, p[1] + e.dz]) });
    for (const l of e.world.landmarks) landmarks.push({ ...l, worldId: e.id, x: l.x + e.dx, z: l.z + e.dz });
    for (const d of e.world.docks) {
      const shifted = { ...d, worldId: e.id, x: d.x + e.dx, z: d.z + e.dz };
      docks.push(shifted); shiftedObjects.set(d, shifted);
    }
    for (const b of e.world.bridges) {
      const shifted = { ...b, worldId: e.id, x: b.x + e.dx, z: b.z + e.dz };
      bridges.push(shifted); shiftedObjects.set(b, shifted);
    }
  }
  const shiftedData = new Map();
  function presentationData(e) {
    if (shiftedData.has(e.id)) return shiftedData.get(e.id);
    const d = e.world.data, at = p => p && [p[0] + e.dx, p[1] + e.dz, ...p.slice(2)];
    const town = { ...d.town };
    for (const k of ['centre', 'workbench', 'trainer', 'shop', 'shopkeeper', 'respawn', 'well']) if (town[k]) town[k] = at(town[k]);
    if (town.skillUpgradeStations) town.skillUpgradeStations = town.skillUpgradeStations.map(at);
    const wreck = d.wreck && { ...d.wreck, at: at(d.wreck.at), weapons: Object.fromEntries(Object.entries(d.wreck.weapons || {}).map(([k, p]) => [k, at(p)])) };
    const result = { ...d, bounds: e.bounds, atlas: { ...d.atlas, offset: origin, seams: [] }, town, wreck, playerSpawn: at(d.playerSpawn) };
    shiftedData.set(e.id, result);
    return result;
  }
  function query(method, x, z, ...args) {
    const e = regionAt(x, z) || active;
    return e.world[method](x - e.dx, z - e.dz, ...args);
  }
  function objectQuery(method, x, z, ...args) {
    const value = query(method, x, z, ...args);
    return shiftedObjects.get(value) || value;
  }
  function footprintFits(x, z, r) {
    const e = regionAt(x, z);
    if (!e) return false;
    const b = e.bounds;
    if (x - r >= b.minX && x + r <= b.maxX && z - r >= b.minZ && z + r <= b.maxZ) return true;
    // The union of authored rectangles, rather than the enclosing bounding box,
    // excludes the exterior notch while allowing an entire actor over an old edge.
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      if (!regionAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
    }
    return true;
  }
  function blocksWater(x, z, pad = 0) {
    const owner = regionAt(x, z);
    if (!owner) return query('blocksWater', x, z, pad);
    const b = owner.bounds;
    if (x - pad >= b.minX && x + pad <= b.maxX && z - pad >= b.minZ && z + pad <= b.maxZ)
      return owner.world.blocksWater(x - owner.dx, z - owner.dz, pad);
    // Water clearance is the same as in a native map, but its footprint can
    // touch both sides of an old boundary even while its centre is still dry.
    for (const e of entries) {
      const dx = Math.max(e.bounds.minX - x, 0, x - e.bounds.maxX);
      const dz = Math.max(e.bounds.minZ - z, 0, z - e.bounds.maxZ);
      if (dx * dx + dz * dz <= pad * pad && e.world.blocksWater(x - e.dx, z - e.dz, pad)) return true;
    }
    return false;
  }
  function isFree(x, z, r, { ignoreWater = false } = {}) {
    if (!footprintFits(x, z, r)) return false;
    if (!ignoreWater && blocksWater(x, z, r * .3)) return false;
    // Collider bounds occupy their own cells. The actor radius must also
    // search adjacent cells; its centre alone misses an overlap at a gridline.
    // Repeated read-only checks avoid a Set/array allocation in this hot path.
    for (let cx = Math.floor((x - r) / GRID); cx <= Math.floor((x + r) / GRID); cx++)
      for (let cz = Math.floor((z - r) / GRID); cz <= Math.floor((z + r) / GRID); cz++) {
        const list = grid.get(cx * 4096 + cz);
        if (!list) continue;
        for (const o of list) if (o.hx !== undefined ? pointInBox(o, x, z, r) : dist(x, z, o.x, o.z) < o.r + r) return false;
      }
    return true;
  }
  function tooSteep(x0, z0, x1, z1) {
    const a = regionAt(x0, z0), b = regionAt(x1, z1);
    if (a && a === b) return a.world.tooSteep(x0 - a.dx, z0 - a.dz, x1 - a.dx, z1 - a.dz);
    const length = Math.hypot(x1 - x0, z1 - z0);
    const maxSlope = b?.world.data.terrain?.maxWalkSlope ?? 1;
    return length > 1e-5 && query('groundY', x1, z1) - query('groundY', x0, z0) > maxSlope * length + .04;
  }
  function move(x, z, r, dx, dz, opts = {}) {
    const a = regionAt(x, z), b = regionAt(x + dx, z + dz);
    if (a && a === b) {
      const bounds = a.bounds, margin = r + Math.hypot(dx, dz);
      if (x > bounds.minX + margin && x < bounds.maxX - margin && z > bounds.minZ + margin && z < bounds.maxZ - margin) {
        const result = a.world.move(x - a.dx, z - a.dz, r, dx, dz, opts);
        const nx = result.x + a.dx, nz = result.z + a.dz;
        if (isFree(nx, nz, r, opts)) return { ...result, x: nx, z: nz };
      }
    }
    // Movements near an old edge or missed by the native centre-cell lookup
    // use bounded union substeps so an actor cannot overlap a nearby collider.
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.max(.2, r * .5)));
    const sx = dx / count, sz = dz / count;
    let nx = x, nz = z, blocked = false;
    const allowed = (tx, tz) => isFree(tx, tz, r, opts) && (opts.ignoreSlope || !tooSteep(nx, nz, tx, tz));
    for (let i = 0; i < count; i++) {
      if (allowed(nx + sx, nz + sz)) { nx += sx; nz += sz; }
      else if (allowed(nx + sx, nz)) { nx += sx; blocked = true; }
      else if (allowed(nx, nz + sz)) { nz += sz; blocked = true; }
      else blocked = true;
    }
    return { x: nx, z: nz, blocked };
  }
  const result = {
    unified: true, coordinateOrigin: origin, nativeWorlds: worlds, bounds, circles, boxes, waypoints, exits, zones, roads, landmarks, docks, bridges,
    // Runtime scenery uses immutable native data. Build the combined debug/export
    // collection only on demand, avoiding thousands of duplicate decoration objects.
    get decor() {
      if (!decor) {
        decor = {};
        for (const e of entries) for (const [name, points] of Object.entries(e.world.decor)) {
          decor[name] ||= [];
          for (const p of points) decor[name].push({ ...p, worldId: e.id, x: p.x + e.dx, z: p.z + e.dz });
        }
      }
      return decor;
    },
    seams: [], seamAt: () => null,
    get data() { return presentationData(active); },
    get regionWorld() { return active.world; },
    get waterLevel() { return active.world.waterLevel; },
    setRegion(id) { const next = byId.get(id); if (!next) throw new Error('Unknown region: ' + id); active = next; },
    regionAt,
    scenePoint(id, x, z) { const e = byId.get(id); return [x + e.dx, z + e.dz]; },
    localPoint(id, x, z) { const e = byId.get(id); return [x - e.dx, z - e.dz]; },
    worldPoint(x, z) { return [x + origin[0], z + origin[1]]; },
    zoneAt(x, z) { return objectQuery('zoneAt', x, z); },
    zoneById(id, worldId = active.id) { return shiftedObjects.get(worlds[worldId]?.zoneById(id)); },
    bridgeAt(x, z, pad = 0) { return objectQuery('bridgeAt', x, z, pad); },
    dockAt(x, z, pad = 0) { return objectQuery('dockAt', x, z, pad); },
    shoreZ(x, z = 0) { const e = regionAt(x, z) || active; return e.world.shoreZ(x - e.dx) + e.dz; },
    deckY(bridge, localX) { return worlds[bridge.worldId || active.id].deckY(bridge, localX); },
    isFree, move, tooSteep, blocksWater,
    randomPointInZone(id, r, rng, avoid = []) {
      const localAvoid = avoid.map(p => ({ ...p, x: p.x - active.dx, z: p.z - active.dz }));
      const p = active.world.randomPointInZone(id, r, rng, localAvoid);
      return p && { ...p, x: p.x + active.dx, z: p.z + active.dz };
    },
  };
  for (const method of ['isSafe', 'terrainY', 'groundY', 'surfaceY', 'slopeAt', 'isWater', 'isBeach', 'coastAt', 'inSea', 'onBridge', 'inRiver', 'inPond', 'roadDist', 'pathDist', 'quietNearSeam'])
    result[method] = (x, z, ...args) => query(method, x, z, ...args);
  return result;
}
