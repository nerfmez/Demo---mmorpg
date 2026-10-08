// Writes the shared height profile of every open seam (data atlas.seams) so both
// maps meet on the same ground. Each map is built with its seam blend off, the two
// edge heights are averaged every `step` metres along the seam, and the same global
// profile is stored in each map's local coordinates. Run after changing terrain,
// roads, offsets or spans near a seam: node scripts/atlas-seams.mjs
// --missing fills only seams whose profile is still empty, editing just those
// arrays in place (the other seams and the rest of each file stay byte-identical).
import { readFileSync, writeFileSync } from 'node:fs';
import { loadData } from '../src/core/data-node.js';
import { createWorld } from '../src/core/world.js';

const step = 4;
const files = { 'azure-harbor-v1': 'data/world.json', 'frontier-wilds-v1': 'data/maps/frontier-wilds.json', 'moonroot-grove-v1': 'data/maps/moonroot-grove.json' };
const onlyMissing = process.argv.includes('--missing');
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
const alongX2 = (seam) => seam.edge === 'minZ' || seam.edge === 'maxZ';
const mixHex = (a, b) => '#' + [1, 3, 5].map((i) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0')).join('');
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
      // Ground tint: both maps' zone palettes averaged, so the paint meets as well.
      const [ox2, oz2] = alongX2(back) ? [a + shift, raw[seam.to].bounds[back.edge]] : [raw[seam.to].bounds[back.edge], a + shift];
      const mineZone = raw[id].zoneAt(x, z), theirZone = raw[seam.to].zoneAt(ox2, oz2);
      const [L, D] = [0, 1].map((k) => mixHex(mineZone.palette?.[k] || '#9ccf5a', theirZone.palette?.[k] || '#78b046'));
      out.push([a, Math.round(Math.max(floor, (mine + theirs) / 2) * 100) / 100, L, D]);
    }
    profiles[id] = (profiles[id] || []).concat([{ seam, profile: out }]);
  }
}
for (const [id, list] of Object.entries(profiles)) {
  if (onlyMissing) {
    let text = readFileSync(files[id], 'utf8');
    const filled = [];
    for (const { seam, profile } of list) {
      if (seam.profile?.length) continue;
      // the seam object's own "profile": [] (located after its "to" and "edge" keys)
      const at = text.search(new RegExp(`"edge": "${seam.edge}",\\s*"to": "${seam.to}"`));
      const hole = text.indexOf('"profile": []', at);
      if (at < 0 || hole < 0) throw new Error(`seam ${id} ${seam.edge} -> ${seam.to} not found`);
      text = text.slice(0, hole) + '"profile": ' + JSON.stringify(profile) + text.slice(hole + '"profile": []'.length);
      filled.push(`${seam.edge}->${seam.to}: ${profile.length} points`);
    }
    writeFileSync(files[id], text);
    if (filled.length) console.log(id, filled.join(', '));
    continue;
  }
  const file = files[id], json = JSON.parse(readFileSync(file, 'utf8'));
  for (const { seam, profile } of list) json.atlas.seams.find((s) => s.edge === seam.edge && s.to === seam.to).profile = profile;
  writeFileSync(file, JSON.stringify(json, null, 2).replace(/[\u007f-￿]/g, (c) => (id === 'azure-harbor-v1' ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)) + '\n');
  console.log(id, list.map((l) => `${l.seam.edge}: ${l.profile.length} points`).join(', '));
}
