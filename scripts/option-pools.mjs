// Content pass (owner, 2026-10-29, docs/STATS-TH.md): every gear base and its recipe roll options from
// items.optionPools (its class's pool plus its slot's extras). Writes data/items.json and
// data/recipes.json; re-running gives the same pools. node scripts/option-pools.mjs
import fs from 'node:fs';
import { optionClass } from '../src/core/item-metadata.js';
const read = (f) => fs.readFileSync(f, 'utf8');
let items = read('data/items.json'), recipes = read('data/recipes.json');
const I = JSON.parse(items), R = JSON.parse(recipes).recipes, P = I.optionPools;
const poolOf = (b) => { const c = optionClass(b); return [...new Set([...P.classes[c], ...(P.slotExtras[`${c}.${b.slot}`] || [])])]; };
const put = (text, section, id, pool) => {
  const i = text.indexOf(`"${id}": {`, text.indexOf(`"${section}": {`)), a = text.indexOf('"optionPool": [', i), b = text.indexOf(']', a) + 1;
  return text.slice(0, a) + '"optionPool": [' + pool.map((o) => `"${o}"`).join(', ') + ']' + text.slice(b);
};
for (const [id, b] of Object.entries(I.gearBases)) items = put(items, 'gearBases', id, poolOf(b));
for (const [id, r] of Object.entries(R)) if (r.optionPool) recipes = put(recipes, 'recipes', id, poolOf(I.gearBases[r.result]));
JSON.parse(items); JSON.parse(recipes);
fs.writeFileSync('data/items.json', items); fs.writeFileSync('data/recipes.json', recipes);
