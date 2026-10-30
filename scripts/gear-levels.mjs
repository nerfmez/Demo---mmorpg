// Content pass (owner, 2026-10-29, docs/STATS-TH.md "เลเวลอุปกรณ์"): every gear base covers a range of item
// levels (items.gearLevels). Lines alternate between two groups whose new bases come 5 levels apart while
// levelling; from alignedFrom every line gets its next base together. A base's position in its line (the old
// tier order 1/6/11/16/21) picks its range. Writes itemLevel/maxItemLevel on bases and itemLevel on recipes.
// Re-running gives the same result. node scripts/gear-levels.mjs
import fs from 'node:fs';
import { optionClass } from '../src/core/item-metadata.js';
let items = fs.readFileSync('data/items.json', 'utf8'), recipes = fs.readFileSync('data/recipes.json', 'utf8');
const I = JSON.parse(items), R = JSON.parse(recipes).recipes, GL = I.gearLevels;
const OLD = [1, 6, 11, 16, 21];
export function rangeOf(b) {
  const starts = GL.starts[GL.group[optionClass(b)]];
  // the base's place in its line: the old tier, or (once rewritten) its start in the group
  let i = starts.indexOf(b.itemLevel);
  if (b.maxItemLevel === undefined || i < 0) i = OLD.indexOf(b.itemLevel);
  if (i < 0) throw new Error(`${b.name}: item level ${b.itemLevel} has no place`);
  return [starts[i], i + 1 < starts.length ? starts[i + 1] - 1 : GL.alignedFrom - 1];
}
const sec = items.indexOf('"gearBases": {');
for (const [id, b] of Object.entries(I.gearBases)) {
  const [lo, hi] = rangeOf(b);
  const at = items.indexOf(`"${id}": {`, sec), k = items.indexOf('"itemLevel": ', at);
  const line = items.lastIndexOf('\n', k), indent = items.slice(line + 1, k);
  const end = items.slice(k).search(/[,\n]/) + k;
  let rest = items.slice(end);
  rest = rest.replace(new RegExp(`^,\\n${indent}"maxItemLevel": \\d+`), ''); // a re-run replaces the old range
  items = items.slice(0, k) + `"itemLevel": ${lo},\n${indent}"maxItemLevel": ${hi}` + rest;
}
for (const [rid, r] of Object.entries(R)) if (r.type === 'gear') {
  const lo = JSON.parse(items).gearBases[r.result].itemLevel;
  const at = recipes.indexOf(`"${rid}": {`), k = recipes.indexOf('"itemLevel": ', at), end = recipes.slice(k).search(/[,\n}]/) + k;
  recipes = recipes.slice(0, k) + `"itemLevel": ${lo}` + recipes.slice(end);
}
JSON.parse(items); JSON.parse(recipes);
fs.writeFileSync('data/items.json', items); fs.writeFileSync('data/recipes.json', recipes);
