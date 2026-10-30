// The grotto's monsters walk about their homes (src/core/dungeon-monsters.js): every walker moves, keeps
// its body on ground it can stand on (one step at a time), stays near home (the fish in the shallows,
// the boss in its arena), never walks into the hero or another prop, carries its collision circles,
// the hoppers move only while in the air, and the boss does not stir until it is woken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDungeon } from '../../src/core/dungeon.js';
import { createDungeonMonsters } from '../../src/core/dungeon-monsters.js';

const FILE = JSON.parse(readFileSync(new URL('../../data/dungeons/shell-grotto.json', import.meta.url), 'utf8'));
const fresh = () => {
  const map = createDungeon(structuredClone(FILE.inside), FILE);
  return { map, sim: createDungeonMonsters(map, FILE, 7) };
};

function run(sim, map, seconds, hero, each) {
  const dt = 1 / 30;
  for (let i = 0; i < seconds / dt; i++) {
    const before = sim.list.map((m) => ({ x: m.x, z: m.z, y: m.y, air: m.air }));
    sim.update(dt, hero);
    sim.list.forEach((m, k) => each?.(m, before[k]));
  }
}

test('every walking monster wanders, on ground its body fits, one step at a time, near its home', () => {
  const { map, sim } = fresh();
  const kinds = new Set(sim.list.map((m) => m.type));
  for (const k of ['pearlFish', 'pearlSlug', 'eyeClam', 'bossSnail']) assert.ok(kinds.has(k), `${k} walks`);
  run(sim, map, 90, { x: 0, z: 0 }, (m, b) => {
    const s = map.surfaceAt(m.x, m.z);
    assert.ok(s?.walkable, `${m.type} on a floor at ${m.x.toFixed(1)},${m.z.toFixed(1)}`);
    assert.ok(Math.abs(m.y - b.y) <= FILE.maxStep + 1e-9, `${m.type} steps at most maxStep`);
    assert.ok(Number.isFinite(map.standY(m.x, m.z, b.y, m.body)), `${m.type}'s body fits where it stands`);
    if (m.walk.stay) assert.equal(s.floor.kind, m.walk.stay, `${m.type} keeps to the ${m.walk.stay}`);
    if (!m.walk.arena) assert.ok(Math.hypot(m.x - m.home[0], m.z - m.home[1]) <= m.walk.wander + 1, `${m.type} stays near home`);
    // a hopper moves only while it is in the air
    if (m.walk.gait === 'hop' && Math.hypot(m.x - b.x, m.z - b.z) > 1e-9) assert.ok(m.air >= 0, `${m.type} moves in the air only`);
  });
  for (const m of sim.list.filter((q) => !q.asleep)) assert.ok(m.travelled > 3, `${m.type} at ${m.home} walked ${m.travelled.toFixed(1)} m`);
});

test('a monster never walks into the hero, and carries its collision circles so the hero bumps into it', () => {
  const { map, sim } = fresh();
  const clam = sim.list.find((m) => m.type === 'eyeClam');
  // the hero stands right where the clam would like to go: one metre off its side
  const hero = { x: clam.x + 1.6, z: clam.z };
  run(sim, map, 60, hero, (m, b) => {
    if (Math.hypot(m.x - b.x, m.z - b.z) > 1e-9) assert.ok(Math.hypot(m.x - hero.x, m.z - hero.z) >= m.body + FILE.heroRadius - 1e-6, `${m.type} keeps off the hero`);
  });
  for (const m of sim.list) for (const b of m.own) {
    const local = Math.hypot(...b.local);
    assert.ok(Math.abs(Math.hypot(b.x - m.x, b.z - m.z) - local) < 1e-6, `${m.type}'s circle moves with it`);
  }
  // the hero walks into a monster's circle and stops at its edge
  const slug = sim.list.find((m) => m.type === 'pearlSlug');
  const pos = { x: slug.x + 4, z: slug.z, y: map.landY(slug.x + 4, slug.z) };
  if (Number.isFinite(pos.y)) {
    for (let i = 0; i < 60; i++) map.move(pos, -0.1, 0);
    assert.ok(Math.hypot(pos.x - slug.x, pos.z - slug.z) >= slug.own[0].r + FILE.heroRadius - 0.05, 'the hero is stopped by the slug');
  }
});

test('the boss sleeps until woken at the pearl, then crawls about its arena', () => {
  const { map, sim } = fresh();
  const boss = sim.list.find((m) => m.type === 'bossSnail'), a = FILE.inside.arena;
  run(sim, map, 30, null);
  assert.equal(boss.travelled, 0, 'asleep, it does not stir');
  sim.wake('bossSnail');
  run(sim, map, 2, null);
  assert.equal(boss.travelled, 0, 'it comes out of its shell before it moves');
  run(sim, map, 90, null, (m) => {
    if (m === boss) assert.ok(Math.hypot(m.x - a.at[0], m.z - a.at[1]) <= a.clear - m.body + 1e-6, 'the boss keeps to its arena');
  });
  assert.ok(boss.travelled > 5, `the boss crawled ${boss.travelled.toFixed(1)} m`);
});

test('the same seed walks the same way', () => {
  const a = fresh(), b = fresh();
  run(a.sim, a.map, 20, null);
  run(b.sim, b.map, 20, null);
  assert.deepEqual(a.sim.list.map((m) => [m.x, m.z, m.facing]), b.sim.list.map((m) => [m.x, m.z, m.facing]));
});
