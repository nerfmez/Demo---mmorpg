// Map-qualified quest destinations. Uses authored/seeded spawn locations, never an arbitrary exit.
import { questProgress, objectiveWorlds } from './quests.js';
import { encounterLayout } from './encounters.js';
const coordinates = (map, x, z) => [x + (map.atlas?.offset?.[0] || 0), z + (map.atlas?.offset?.[1] || 0)];
const point = (world, pos, extra = {}) => ({ world, x: pos[0], z: pos[1], ...extra });
const mapsFor = data => data.maps?.[data.world.id] ? data.maps : { ...(data.maps || {}), [data.world.id]: data.world };
const destinationCache = new WeakMap();
const hasDrop = (drops, item) => (drops || []).some(d => d.item === item && d.chance > 0 && d.max > 0);

function locations(game, objective) {
  const { data } = game, maps = mapsFor(data), result = [];
  for (const worldId of objectiveWorlds(data, objective)) {
    const map = maps[worldId];
    if (!map) continue;
    const world = game.worlds?.[worldId] || (game.world?.data.id === worldId ? game.world : null);
    const add = (pos, extra) => result.push(point(worldId, pos, extra));
    if (objective.type === 'waypoint') {
      const wp = map.waypoints.find(w => w.id === objective.target);
      if (wp) add(wp.pos || [wp.x, wp.z], { label: wp.nameTh, level: [0, 0] });
    } else if (objective.type === 'zone') {
      const zone = map.zones.find(z => z.id === objective.target);
      if (zone) {
        // Prefer a waypoint in that zone; otherwise its authored label is an exploration anchor.
        const wp = world?.waypoints.find(p => world.zoneAt(p.x, p.z).id === zone.id);
        const r = zone.rects?.[0];
        const pos = wp ? [wp.x, wp.z] : zone.label || (r && [(r[0] + r[1]) / 2, (r[2] + r[3]) / 2]);
        if (pos) add(pos, { label: zone.nameTh, approximate: !wp, level: [0, 0] });
      }
    } else if (objective.type === 'craft') {
      if (map.town?.workbench) add(map.town.workbench, { label: 'โต๊ะคราฟต์', level: [0, 0] });
    } else if (objective.type === 'kill' || objective.type === 'collect') {
      const matches = (id, zone) => objective.type === 'kill' ? id === objective.target :
        hasDrop(data.monsters.monsters[id]?.drops, objective.target) || hasDrop(map.zoneDrops?.[zone], objective.target) || hasDrop(data.items.upgradeMaterialDrops, objective.target);
      // Already-built rule worlds share the same cached placement used by Game and Atlas.
      const layout = world && data.encounters?.maps?.[worldId] ? encounterLayout(world, data) : null;
      if (layout) {
        for (const p of layout.points) if (matches(p.monster, p.zone)) add([p.x, p.z], { label: p.habitat, level: p.level });
      } else if (worldId === data.world.id && game.spawnPoints) {
        for (const p of game.spawnPoints) if (!p.boss && matches(p.monster, p.zone)) add([p.x, p.z], { label: data.monsters.monsters[p.monster]?.nameTh, level: p.level });
      } else {
        // No render/rule world is constructed merely to open the journal.
        for (const s of map.spawns || []) if (matches(s.monster, s.zone)) {
          const zone = map.zones.find(z => z.id === s.zone), r = zone?.rects?.[0];
          const pos = zone?.label || (r && [(r[0] + r[1]) / 2, (r[2] + r[3]) / 2]);
          if (pos) add(pos, { label: zone.nameTh, approximate: true, level: s.level });
        }
      }
      for (const b of map.bosses || []) {
        const zone = world?.zoneAt(...b.pos).id;
        if (matches(b.monster, zone)) add(b.pos, { label: data.monsters.monsters[b.monster]?.nameTh, level: [b.level, b.level] });
      }
    }
  }
  return result;
}
// Definitions and rule worlds are immutable during a session. Cache addresses, not player-dependent choices.
function cachedLocations(game, id, objective) {
  const data = game.data;
  let cache = destinationCache.get(game);
  if (!cache || cache.data !== data || cache.maps !== data.maps || cache.quests !== data.quests || cache.worlds !== game.worlds || cache.world !== game.world || cache.encounters !== data.encounters) {
    cache = { data, maps: data.maps, quests: data.quests, worlds: game.worlds, world: game.world, encounters: data.encounters, goals: new Map() };
    destinationCache.set(game, cache);
  }
  const key = id + ':' + objective.id;
  if (!cache.goals.has(key)) cache.goals.set(key, locations(game, objective));
  return cache.goals.get(key);
}
function connections(map) {
  return [...(map.atlas?.seams || []).filter(s => s.gate).map(s => ({ to: s.to, pos: s.gate })), ...(map.exits || []).map(e => ({ to: e.to, pos: e.pos || [e.x, e.z] }))];
}
/** Breadth-first map route; avoids wrong first-exit fallbacks and cycles. */
export function questMapRoute(maps, from, to) {
  const queue = [{ id: from, path: [] }], seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (n.id === to) return n.path;
    for (const edge of connections(maps[n.id] || {})) if (maps[edge.to] && !seen.has(edge.to)) {
      seen.add(edge.to); queue.push({ id: edge.to, path: [...n.path, { ...edge, from: n.id }] });
    }
  }
  return null;
}
export function questNavigation(game, id) {
  const progress = questProgress(game.ch, game.data, id);
  if (!progress || progress.status !== 'active' || !progress.next) return null;
  const objective = progress.next, { data, player } = game, maps = mapsFor(data);
  if (['socket', 'job'].includes(objective.type)) return { menu: objective.menu || (objective.type === 'job' ? 'job' : 'skills'), label: objective.labelTh, spatial: false };
  const here = data.world.id, [px, pz] = coordinates(maps[here], player.x, player.z);
  const routes = new Map(), recommended = Math.max(game.ch.level || 1, data.quests.quests[id].level || 1);
  let goal = null, bestRisk = Infinity, bestDistance = Infinity;
  for (const candidate of cachedLocations(game, id, objective)) {
    if (!routes.has(candidate.world)) routes.set(candidate.world, questMapRoute(maps, here, candidate.world));
    const route = routes.get(candidate.world);
    if (route === null) continue;
    const [gx, gz] = coordinates(maps[candidate.world], candidate.x, candidate.z);
    const distance = Math.hypot(gx - px, gz - pz), risk = Math.max(0, (candidate.level?.[0] || 0) - recommended);
    if (risk > bestRisk || (risk === bestRisk && distance >= bestDistance)) continue;
    goal = { ...candidate, gx, gz, route, distance }; bestRisk = risk; bestDistance = distance;
  }
  if (!goal) return { spatial: false, unavailable: true, label: 'ยังไม่มีเส้นทางไปยังเป้าหมายนี้' };
  const gate = goal.route[0];
  return {
    spatial: true, x: gate ? gate.pos[0] : goal.x, z: gate ? gate.pos[1] : goal.z,
    world: goal.world, goal: { world: goal.world, x: goal.x, z: goal.z, worldX: goal.gx, worldZ: goal.gz },
    // Remaining distance is to the stable world-space goal, NOT a gate that changes at handover.
    distance: goal.distance, via: gate ? maps[gate.to].nameTh : null, remote: goal.world !== here,
    label: goal.label, approximate: !!goal.approximate, level: goal.level, menu: objective.menu,
  };
}
