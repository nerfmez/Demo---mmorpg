// What each gear option is worth (owner, 2026-10-29, docs/STATS-TH.md): its top roll (grade S) at an item
// level, added to the build model's reference heroes (sword, bow, staff at item level + 4, mixed gear),
// as the best % gain on any axis. Options that need a skill the references lack (area, summon, block,
// healing, MP) read 0. node scripts/option-values.mjs [itemLevel=21]
import { data } from '../tests/core/helpers.js';
import { buildProfile } from '../src/core/build-rules.js';
import { optionRange } from '../src/core/crafting.js';
const IL = Number(process.argv[2] || 21), LV = IL + 4;
const AX = ['single', 'pack', 'survival', 'sustain', 'mobility', 'income'];
const withNode = (eff) => ({ ...data, jobtree: { ...data.jobtree, nodes: { ...data.jobtree.nodes, probe: { effects: eff } } } });
const base = {}, kits = ['sword', 'bow', 'staff'];
for (const kit of kits) base[kit] = buildProfile(withNode({}), { kit, level: LV, gear: 'mixed', jobNodes: ['probe'] }).axes;
const rows = [];
for (const [id, o] of Object.entries(data.items.gearOptions)) {
  if (!o.stat) continue;
  const v = optionRange(data, id, 'S', IL).max;
  const best = {};
  for (const kit of kits) {
    const p = buildProfile(withNode({ [o.stat]: v }), { kit, level: LV, gear: 'mixed', jobNodes: ['probe'] }).axes;
    for (const a of AX) { const g = base[kit][a] ? p[a] / base[kit][a] - 1 : 0; if (!(a in best) || g > best[a].g) best[a] = { g, kit }; }
  }
  const top = AX.map((a) => [a, best[a].g, best[a].kit]).sort((x, y) => y[1] - x[1])[0];
  rows.push([id, v, top]);
}
rows.sort((a, b) => b[2][1] - a[2][1]);
for (const [id, v, [a, g, kit]] of rows) console.log(id.padEnd(15), String(v).padEnd(6), a.padEnd(9), (g * 100).toFixed(1) + '%', kit);
