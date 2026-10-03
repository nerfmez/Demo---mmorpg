// Loads data/*.json in Node (tests, tools). The browser build uses src/data.js instead.
import { readFileSync } from 'node:fs';

const FILES = ['skills', 'mods', 'monsters', 'items', 'recipes', 'progression', 'jobtree', 'world', 'quests', 'models'];

export function loadData(root = new URL('../../data/', import.meta.url)) {
  const out = {};
  for (const f of FILES) out[f] = JSON.parse(readFileSync(new URL(`${f}.json`, root), 'utf8'));
  if (out.world.city?.enabled) out.world.city = { ...JSON.parse(readFileSync(new URL('city-v3.json', root), 'utf8')), enabled: true };
  return out;
}
