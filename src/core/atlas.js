// One world for the player: maps are streaming regions (data.maps), but discovery,
// waypoints and the map read as a single world. World metres = a map's local metres
// + its atlas.offset. Discovery of the map being played lives in progress.zones /
// progress.waypoints; other maps' discovery in progress.maps[id] (maps.js).

export const offsetOf = (data, mapId) => data.maps?.[mapId]?.atlas?.offset || [0, 0];

/** A map-local point in world metres. */
export function toWorld(data, mapId, x, z) {
  const [ox, oz] = offsetOf(data, mapId);
  return [x + ox, z + oz];
}

/** A world point in a map's local metres. */
export function toLocal(data, mapId, x, z) {
  const [ox, oz] = offsetOf(data, mapId);
  return [x - ox, z - oz];
}

/** Discovered zone and waypoint ids per map id. */
export function discovery(ch, data) {
  const p = ch.progress, here = data.world.id, out = {};
  for (const id of Object.keys(data.maps || { [here]: data.world })) {
    const saved = id === here ? p : p.maps?.[id];
    out[id] = { zones: saved?.zones || [], waypoints: saved?.waypoints || [] };
  }
  return out;
}

export function waypointUnlocked(ch, data, mapId, id) {
  return discovery(ch, data)[mapId]?.waypoints.includes(id) || false;
}

/** Whole-world counts: discovered / total zones and waypoints over every map. */
export function worldTotals(ch, data) {
  const found = discovery(ch, data), maps = data.maps || { [data.world.id]: data.world };
  const t = { zones: [0, 0], waypoints: [0, 0] };
  for (const [id, map] of Object.entries(maps)) {
    t.zones[0] += found[id].zones.filter((z) => map.zones.some((q) => q.id === z)).length;
    t.zones[1] += map.zones.length;
    t.waypoints[0] += found[id].waypoints.filter((w) => map.waypoints.some((q) => q.id === w)).length;
    t.waypoints[1] += map.waypoints.length;
  }
  return t;
}

/** World-metre rectangle that holds every map: [minX, maxX, minZ, maxZ]. */
export function worldBounds(data) {
  const maps = Object.values(data.maps || { x: data.world });
  const r = [Infinity, -Infinity, Infinity, -Infinity];
  for (const m of maps) {
    const [ox, oz] = m.atlas?.offset || [0, 0], b = m.bounds;
    r[0] = Math.min(r[0], b.minX + ox);
    r[1] = Math.max(r[1], b.maxX + ox);
    r[2] = Math.min(r[2], b.minZ + oz);
    r[3] = Math.max(r[3], b.maxZ + oz);
  }
  return r;
}
