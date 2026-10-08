// Loads data/*.json in Node (tests, tools). The browser build uses src/data.js instead.
import { readFileSync } from 'node:fs';
import { mapRegistry } from './maps.js';
const MAPS = ['frontier-wilds', 'moonroot-grove'];
const FILES = ['skills', 'mods', 'monsters', 'items', 'recipes', 'progression', 'jobtree', 'world', 'quests', 'models', 'encounters'];
export function loadData(root = new URL('../../data/', import.meta.url)) {
  const out = {};
  for (const f of FILES) out[f] = JSON.parse(readFileSync(new URL(`${f}.json`, root), 'utf8'));
  if (out.world.city?.enabled) {
    const city=JSON.parse(readFileSync(new URL('city-v3.json', root), 'utf8'));
    out.world.city = { ...city, ...out.world.city, docks: [...city.docks,...out.world.city.joins||[]] };
  }
  out.maps = mapRegistry(out.world, MAPS.map(name => JSON.parse(readFileSync(new URL(`maps/${name}.json`, root), 'utf8'))));
  return out;
}
