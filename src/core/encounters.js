// Authored encounter locations. Pure rules; no renderer, DOM, save fields or balance edits.
import { createRng } from './rng.js';

const layouts = new WeakMap();
const inside = (r, x, z) => x >= r[0] && x < r[1] && z >= r[2] && z < r[3];
const distance = (x, z, p) => Math.hypot(x - p[0], z - p[1]);
export const habitatKey = s => `${s.zone}:${s.monster}`;

export function encounterHabitat(data, mapId, spawn) {
  return data.encounters?.maps?.[mapId]?.habitats?.[habitatKey(spawn)] || null;
}

/** A full monster footprint, plus an aggro buffer, stays clear of safe services. */
export function encounterPointAllowed(world, data, spawn, x, z, occupied = []) {
  const def = data.monsters.monsters[spawn.monster], rules = data.encounters.placement;
  const r = Math.max(1, def.radius);
  const guard = (def.aggroRange || 0) + def.radius;
  const wander = rules.wanderMargin || 0;
  const h = encounterHabitat(data, world.data.id, spawn);
  if (!h || !h.rects.some(rect => inside(rect, x, z))) return false;
  if (world.zoneAt(x, z).id !== spawn.zone || world.isSafe(x, z)) return false;
  if (!world.isFree(x, z, r + 0.5) || world.isWater(x, z, (r + 0.5) * 0.3)) return false;
  if (world.slopeAt(x, z) > rules.slopeLimit || world.quietNearSeam(x, z)) return false;
  if (world.dockAt(x, z, r) || world.roadDist(x, z) < r + rules.roadMargin) return false;
  if (h.shoreMax !== undefined) {
    const coast = world.coastAt(x, z);
    if (coast.distance < 0 || coast.distance > h.shoreMax) return false;
    if (h.shoreKinds && !h.shoreKinds.includes(coast.kind)) return false;
  }
  const mapRules = data.encounters.maps[world.data.id];
  // Leave a genuinely quiet approach, including the full ordinary idle wander.
  // These are placement clearances, not invisible walls or combat immunity.
  for (const edge of mapRules.transitions || []) {
    if (edge.to !== spawn.zone) continue;
    const from = world.zoneById(edge.from);
    if (!from) throw new Error(`Unknown transition zone: ${edge.from}`);
    if (from.rects.some(rect => Math.hypot(
      Math.max(rect[0] - x, 0, x - rect[1]),
      Math.max(rect[2] - z, 0, z - rect[3])) < guard + wander + edge.clearance)) return false;
  }
  for (const road of world.roads) {
    if (!mapRules.quietRoads?.includes(road.id) || spawn.level[1] <= (mapRules.quietRoadMaxLevel || 0)) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
      const t = length2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2)) : 0;
      if (Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < road.width / 2 + guard + wander + rules.roadMargin) return false;
    }
  }
  // The geometry, rather than just a town centre, also protects irregular city floors.
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, pad = guard + rules.safeMargin;
    if (world.isSafe(x + Math.cos(a) * pad, z + Math.sin(a) * pad)) return false;
  }
  const wd = world.data;
  if ([wd.playerSpawn, wd.town.respawn].some(p => distance(x, z, p) < guard + Math.max(rules.spawnMargin, wander))) return false;
  if (world.waypoints.some(p => distance(x, z, [p.x, p.z]) < Math.max(9, guard + Math.max(rules.waypointMargin, wander)))) return false;
  if ((world.exits || []).some(p => distance(x, z, [p.x, p.z]) < guard + Math.max(rules.spawnMargin, wander))) return false;
  if ((wd.bosses || []).some(bs => distance(x, z, bs.pos) < bs.arena.r + rules.bossMargin)) return false;
  return !occupied.some(p => Math.hypot(x - p.x, z - p.z) < rules.spacing);
}

function rectangles(world, habitat) {
  const b = world.bounds;
  return habitat.rects.map(r => [Math.max(r[0], b.minX + 1), Math.min(r[1], b.maxX - 1),
    Math.max(r[2], b.minZ + 1), Math.min(r[3], b.maxZ - 1)])
    .filter(r => r[1] > r[0] && r[3] > r[2]);
}

/** Same immutable layout feeds the simulation, atlas and audit, including unloaded maps. */
export function encounterLayout(world, data) {
  const configuration = data.encounters;
  if (!configuration?.maps?.[world.data.id]) return null;
  const cached = layouts.get(world);
  if (cached?.configuration === configuration) return cached.result;
  const rules = configuration.placement, wd = world.data;
  const groups = wd.spawns.map((spawn, index) => {
    const habitat = encounterHabitat(data, wd.id, spawn);
    if (!habitat) throw new Error(`Missing encounter habitat: ${wd.id}/${habitatKey(spawn)}`);
    const rects = rectangles(world, habitat);
    const area = rects.reduce((sum, r) => sum + (r[1] - r[0]) * (r[3] - r[2]), 0);
    if (!area) throw new Error(`Empty encounter habitat: ${wd.id}/${habitatKey(spawn)}`);
    return { spawn, index, habitat, rects, area };
  });
  // Reserve tight habitats first; return original spawn order so entity allocation stays stable.
  const ordered = [...groups].sort((a, b) => a.area / a.spawn.count - b.area / b.spawn.count || a.index - b.index);
  let best = null;
  for (let attempt = 0; attempt < rules.retries; attempt++) {
    const rng = createRng((wd.seed ^ configuration.seed ^ attempt) >>> 0);
    const occupied = [], byGroup = groups.map(() => []), failures = [];
    for (const g of ordered) {
      for (let i = 0; i < g.spawn.count; i++) {
        let point = null;
        for (let tries = 0; tries < rules.attemptsPerPoint; tries++) {
          let pick = rng.next() * g.area;
          const rect = g.rects.find(r => (pick -= (r[1] - r[0]) * (r[3] - r[2])) <= 0) || g.rects.at(-1);
          const x = rng.range(rect[0], rect[1]), z = rng.range(rect[2], rect[3]);
          if (encounterPointAllowed(world, data, g.spawn, x, z, occupied)) { point = { x, z }; break; }
        }
        if (!point) { failures.push({ group: g.index, monster: g.spawn.monster, zone: g.spawn.zone, missing: g.spawn.count - i }); break; }
        occupied.push(point);
        byGroup[g.index].push({ ...point, monster: g.spawn.monster, zone: g.spawn.zone,
          level: [...g.spawn.level], group: g.index, habitat: g.habitat.label });
      }
    }
    const result = { mapId: wd.id, revision: configuration.revision,
      planned: wd.spawns.reduce((n, s) => n + s.count, 0), points: byGroup.flat(), failures };
    if (!best || result.points.length > best.points.length) best = result;
    if (!failures.length) break;
  }
  // Never invent an unsafe fallback. A deficit is visible to tests and the field guide.
  for (const point of best.points) { Object.freeze(point.level); Object.freeze(point); }
  Object.freeze(best.points); Object.freeze(best.failures); Object.freeze(best);
  layouts.set(world, { configuration, result: best });
  return best;
}

/** Population creation preserves existing respawn, level rolls, boss flags and ids. */
export function populateEncounters(game) {
  const w = game.data.world, layout = encounterLayout(game.world, game.data);
  if (!layout) return false;
  game.encounterAudit = layout;
  for (const p of layout.points) {
    const sp = { monster: p.monster, zone: p.zone, level: [...p.level], x: p.x, z: p.z,
      respawnAt: 0, entity: null, respawn: w.respawnSeconds };
    game.spawnPoints.push(sp);
    game.spawnAt(sp);
  }
  for (const bs of w.bosses || []) {
    const sp = { monster: bs.monster, bossId: bs.id, zone: game.world.zoneAt(...bs.pos).id,
      level: [bs.level, bs.level], x: bs.pos[0], z: bs.pos[1], respawnAt: 0, entity: null,
      respawn: bs.respawnSeconds, boss: true, final: !!bs.final };
    game.spawnPoints.push(sp);
    game.spawnAt(sp);
  }
  return true;
}

/** Field guide entries are derived from the locations actually used to populate the world. */
export function zoneEncounters(world, data, zoneId) {
  const layout = encounterLayout(world, data), entries = new Map();
  const add = (id, levels, kind, count, habitat) => {
    const key = `${kind}:${id}`;
    if (!entries.has(key)) entries.set(key, { id, kind, min: levels[0], max: levels[1], count: 0, habitats: [] });
    const entry = entries.get(key);
    entry.min = Math.min(entry.min, levels[0]); entry.max = Math.max(entry.max, levels[1]); entry.count += count;
    if (habitat && !entry.habitats.includes(habitat)) entry.habitats.push(habitat);
  };
  if (layout) {
    for (const p of layout.points) if (p.zone === zoneId) add(p.monster, p.level, data.monsters.monsters[p.monster].elite ? 'elite' : 'normal', 1, p.habitat);
  } else {
    for (const s of world.data.spawns) if (s.zone === zoneId) add(s.monster, s.level, 'normal', s.count, '');
  }
  for (const b of world.data.bosses || []) if (world.zoneAt(...b.pos).id === zoneId)
    add(b.monster, [b.level, b.level], data.monsters.monsters[b.monster].miniBoss ? 'miniboss' : 'boss', 1, 'ลานบอสแยก');
  return [...entries.values()].sort((a, b) => a.min - b.min || a.max - b.max || a.id.localeCompare(b.id));
}

export function encounterLevelLabel(entries) {
  if (!entries.length) return 'ไม่มีจุดเกิดมอน';
  const min = Math.min(...entries.map(e => e.min)), max = Math.max(...entries.map(e => e.max));
  return `Lv.${min}${max === min ? '' : '–' + max}`;
}
