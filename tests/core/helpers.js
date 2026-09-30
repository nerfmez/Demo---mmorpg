import { loadData } from '../../src/core/data-node.js';
import { readFileSync } from 'node:fs';
export const data = loadData();
// Historical scenarios remain regression coverage; harbor.test exercises the
// active map separately, including the new onboarding and migration.
export const legacyData = { ...data, ...Object.fromEntries(['world', 'quests', 'monsters'].map(name => [name, JSON.parse(readFileSync(new URL(`../fixtures/frontier/${name}.json`, import.meta.url), 'utf8'))])) };
