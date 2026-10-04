// Writes the shared height profile of every open seam (data atlas.seams) so both
// maps meet on the same ground. Each map is built with its seam blend off, the two
// edge heights are averaged every `step` metres along the seam, and the same global
// profile is stored in each map's local coordinates. Run after changing terrain,
// roads, offsets or spans near a seam: node scripts/atlas-seams.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { loadData } from '../src/core/data-node.js';
import { createWorld } from '../src/core/world.js';

const step = 4;
const files = { 'azure-harbor-v1': 'data/world.json', 'frontier-wilds-v1': 'data/maps/frontier-wilds.json' };
const data = loadData();
const raw = Object.fromEntries(Object.entries(data.maps).map(([id, map]) => {
  const flat = { ...map, atlas: { ...map.atlas, seams: (map.atlas?.seams || []).map((s) => ({ ...s, profile: [] })) } };
  return [id, createWorld(flat)];
}));
const global = (map, along, seam) => along + (seam.edge === 'minZ' || seam.edge === 'maxZ' ? map.atlas.offset[0] : map.atlas.offset[1]);
const edgeHeight = (world, seam, along) => {
  const b = world.bounds, alongX = seam.edge === 'minZ' || seam.edge === 'maxZ';
  return alongX ? world.terrainY(along, b[seam.edge]) : world.terrainY(b[seam.edge], along);
};
const profiles = {};
for (const [id, map] of Object.entries(data.maps)) {
  for (const seam of map.atlas?.seams || []) {
    const other = data.maps[seam.to], back = other.atlas.seams.find((s) => s.to === id);
    const shift = global(map, 0, seam) - global(other, 0, back); // this local along -> other local along
    const out = [];
    for (let a = seam.span[0]; a <= seam.span[1] + 1e-6; a += step) {
      const mine = edgeHeight(raw[id], seam, a), theirs = edgeHeight(raw[seam.to], back, a + shift);
      const b = raw[id].bounds, alongX = seam.edge === 'minZ' || seam.edge === 'maxZ';
      const [x, z] = alongX ? [a, b[seam.edge]] : [b[seam.edge], a];
      // Dry land stays clear of the water level; the sea keeps its own depth.
      const floor = raw[id].inSea(x, z, 2) ? -Infinity : raw[id].waterLevel + 0.35;
      out.push([a, Math.round(Math.max(floor, (mine + theirs) / 2) * 100) / 100]);
    }
    profiles[id] = (profiles[id] || []).concat([{ seam, profile: out }]);
  }
}
for (const [id, list] of Object.entries(profiles)) {
  const file = files[id], json = JSON.parse(readFileSync(file, 'utf8'));
  for (const { seam, profile } of list) json.atlas.seams.find((s) => s.edge === seam.edge && s.to === seam.to).profile = profile;
  writeFileSync(file, JSON.stringify(json, null, 2).replace(/[\u007f-￿]/g, (c) => (id === 'azure-harbor-v1' ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)) + '\n');
  console.log(id, list.map((l) => `${l.seam.edge}: ${l.profile.length} points`).join(', '));
}
