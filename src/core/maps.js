// Map registry: the starting map (data/world.json) plus linked maps (data/maps/*.json),
// keyed by map id. Only one map is built at a time; exits travel between them.
// Per-map discovery (zones, waypoints) is swapped in and out of character.progress.

export function mapRegistry(start, others = []) {
  const maps = { [start.id]: start };
  for (const m of others) maps[m.id] = m;
  return maps;
}

/** Play `id` (when known): data.world becomes that map. Returns the selected world data. */
export function selectMap(data, id) {
  if (id && data.maps?.[id]) data.world = data.maps[id];
  return data.world;
}

/** The map a saved character belongs on: its own map when known, else the start map. */
export function characterMap(data, ch) {
  return ch?.worldId && data.maps?.[ch.worldId] ? ch.worldId : Object.keys(data.maps || {})[0] || data.world.id;
}

/**
 * Move a character to another map. The current map's discovery is stored under
 * progress.maps[current]; the destination's is restored (plus its free waypoints).
 */
export function enterMap(ch, data, toId, pos = null) {
  const to = data.maps[toId];
  if (!to) throw new Error('Unknown map: ' + toId);
  const p = ch.progress;
  p.maps = p.maps || {};
  if (ch.worldId && ch.worldId !== toId) p.maps[ch.worldId] = { zones: p.zones || [], waypoints: p.waypoints || [] };
  const saved = ch.worldId === toId ? { zones: p.zones, waypoints: p.waypoints } : p.maps[toId] || { zones: [], waypoints: [] };
  delete p.maps[toId];
  p.zones = [...saved.zones];
  p.waypoints = [...new Set([...saved.waypoints, ...to.waypoints.filter(w => w.unlocked).map(w => w.id)])];
  ch.worldId = toId;
  ch.worldLayoutRevision = to.layoutRevision || null;
  ch.pos = pos ? [...pos] : null;
  return ch;
}
