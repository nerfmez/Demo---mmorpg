// Loads data/*.json in Node (tests, tools). The browser build uses src/data.js instead.
import { readFileSync } from 'node:fs';

const FILES = ['skills', 'mods', 'monsters', 'items', 'recipes', 'progression', 'jobtree', 'world'];

export function loadData(root = new URL('../../data/', import.meta.url)) {
  const out = {};
  for (const f of FILES) out[f] = JSON.parse(readFileSync(new URL(`${f}.json`, root), 'utf8'));
  return out;
}
