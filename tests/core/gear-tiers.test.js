import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createRng } from '../../src/core/rng.js';
import { gearPower, gearStats } from '../../src/core/character.js';
import { optionClass } from '../../src/core/item-metadata.js';
import { gearDropCandidates, rollGearDrop, pieceLevel } from '../../src/core/crafting.js';

// Gear levels (owner, 2026-10-29, items.gearLevels): a base covers an item-level range about 10 wide; lines
// alternate between two groups 5 levels apart while levelling and line up from alignedFrom.
const GL = data.items.gearLevels, G = data.items.gearBases;
const gearRecipes = Object.values(data.recipes.recipes).filter((r) => r.type === 'gear');
const startsOf = (b) => GL.starts[GL.group[optionClass(b)]];
const tierOf = (b) => startsOf(b).indexOf(b.itemLevel);
const line = (b) => b.slot === 'weapon' ? b.weaponType : b.slot === 'offhand' ? 'shield' : b.slot === 'charm' ? 'charm' : `${optionClass(b)}.${b.slot}`;
const cap = data.progression.balance.monsterCap;

test('every base covers its group\'s range; each line covers today\'s levels except the listed gaps', () => {
  for (const [id, b] of Object.entries(G)) {
    const s = startsOf(b), i = tierOf(b);
    assert.ok(i >= 0, `${id} starts on its group's schedule (${b.itemLevel})`);
    assert.equal(b.maxItemLevel, i + 1 < s.length ? s[i + 1] - 1 : GL.alignedFrom - 1, `${id} range end`);
  }
  // the two groups are 5 levels apart while levelling, and every line is new about every 10 levels
  const [a, b] = Object.values(GL.starts);
  for (let i = 2; i < a.length; i++) assert.equal(Math.abs(a[i] - b[i]), 5);
  const lines = {};
  for (const b of Object.values(G)) (lines[line(b)] ||= []).push(b);
  const gaps = {};
  for (const [k, list] of Object.entries(lines)) {
    const miss = [];
    for (let lv = 1; lv <= cap; lv++) if (!list.some((b) => b.itemLevel <= lv && lv <= b.maxItemLevel)) miss.push(lv);
    if (miss.length) gaps[k] = miss.reduce((r, m, j) => (j && m === miss[j - 1] + 1 ? (r[r.length - 1][1] = m, r) : [...r, [m, m]]), []).map(([x, y]) => (x === y ? `${x}` : `${x}-${y}`)).join(',');
  }
  assert.deepEqual(gaps, GL.knownGaps, 'items.gearLevels.knownGaps lists the lines still missing a base');
});

test('a piece\'s power stats and requirement grow with its own item level inside the base\'s range', () => {
  const b = G.greyfang_sabre, lo = { uid: 1, base: 'greyfang_sabre', grade: 'C', upgrade: 0, options: [], itemLevel: b.itemLevel }, hi = { ...lo, itemLevel: b.maxItemLevel };
  assert.ok(gearStats(hi, data).attack > gearStats(lo, data).attack * 1.2);
  assert.equal(gearStats(hi, data).hastePct, gearStats(lo, data).hastePct, 'percentages stay the base\'s own');
  assert.equal(pieceLevel(data, 'greyfang_sabre', 5), b.itemLevel);
  assert.equal(pieceLevel(data, 'greyfang_sabre', 99), b.maxItemLevel);
  assert.equal(pieceLevel(data, 'greyfang_sabre', b.itemLevel + 3), b.itemLevel + 3);
});

test('armour pieces above the first tier follow the set reference for their slot', () => {
  const W = data.items.requirements.weights, g = data.progression.balance.gear;
  const SHARE = { armor: 0.45, helm: 0.2, gloves: 0.1, boots: 0.15, offhand: 0.3 };
  for (const [id, b] of Object.entries(G)) {
    if (b.itemLevel === 1 || !SHARE[b.slot]) continue;
    const set = (g.defense[0] + g.defense[1] * (b.itemLevel - 1)) * W.defense + (g.maxHp[0] + g.maxHp[1] * (b.itemLevel - 1)) * W.maxHp;
    const ratio = gearPower(b.stats, data) / (set * SHARE[b.slot]);
    assert.ok(ratio > 0.8 && ratio < 1.6, `${id} ${ratio.toFixed(2)}`);
  }
});

test('recipes cost more with each tier and higher tiers ask for bulk lower-tier parts', () => {
  const total = (r) => Object.entries(r.cost).reduce((a, [k, n]) => a + (k === 'gold' ? 0 : n), 0);
  const avg = (t) => { const list = gearRecipes.filter((r) => tierOf(G[r.result]) === t); return list.reduce((a, r) => a + total(r), 0) / list.length; };
  for (let t = 1; t < 5; t++) assert.ok(avg(t) > avg(t - 1) * 1.2, `tier ${t + 1} needs more parts`);
  const firstTierParts = new Set(gearRecipes.filter((r) => tierOf(G[r.result]) === 0).flatMap((r) => Object.keys(r.cost)));
  for (const r of gearRecipes.filter((r) => tierOf(G[r.result]) >= 1)) {
    assert.ok(Object.entries(r.cost).some(([k, n]) => k !== 'gold' && firstTierParts.has(k) && n >= 10), `${r.result} asks for a bulk first-tier part`);
    assert.equal(r.itemLevel, G[r.result].itemLevel, r.result);
  }
});

test('every spawn can drop gear of its own parts, mostly bases whose range holds its level', () => {
  let exact = 0, all = 0;
  for (const map of Object.values(data.maps)) for (const s of [...map.spawns, ...(map.bosses || []).map((b) => ({ monster: b.monster, level: [b.level, b.level] }))]) {
    const parts = new Set(data.monsters.monsters[s.monster].drops.map((d) => d.item));
    for (let level = s.level[0]; level <= s.level[1]; level++) {
      const list = gearDropCandidates(data, s.monster, level);
      assert.ok(list.length, `${s.monster} Lv${level}`);
      for (const id of list) assert.ok(gearRecipes.some((r) => r.result === id && Object.keys(r.cost).some((k) => parts.has(k))), `${id} is made from ${s.monster} parts`);
      all++;
      if (list.every((id) => G[id].itemLevel <= level && level <= G[id].maxItemLevel)) exact++;
    }
  }
  assert.ok(exact / all >= 0.75, `${exact}/${all} spawn levels drop bases of their own range`);
});

test('gear drops are rare, graded best-first, take the monster\'s level, and bosses always drop one', () => {
  const rng = createRng(11), counts = { C: 0, B: 0, A: 0, S: 0 }, n = 40000;
  for (let i = 0; i < n; i++) { const d = rollGearDrop(data, 'thornback_wolf', 20, false, rng); if (d) { counts[d.grade]++; assert.equal(d.itemLevel, pieceLevel(data, d.base, 20)); } }
  const rates = data.items.gearDrops.normal, sum = Object.values(rates).reduce((a, b) => a + b, 0);
  const got = Object.values(counts).reduce((a, b) => a + b, 0) / n;
  assert.ok(Math.abs(got - sum) < sum * 0.25, `drop rate ${got} vs ${sum}`);
  assert.ok(counts.C > counts.B && counts.B > counts.A, JSON.stringify(counts));
  const mats = data.monsters.monsters.thornback_wolf.drops.filter((d) => d.item !== 'gold');
  assert.ok(sum < 0.1 * Math.min(...mats.map((d) => d.chance)), 'far rarer than the monster parts');
  for (let i = 0; i < 50; i++) {
    const d = rollGearDrop(data, 'greyfang', 22, true, rng);
    assert.ok(d && G[d.base].itemLevel <= 22 && 22 <= G[d.base].maxItemLevel && d.itemLevel === 22);
    assert.equal(d.options.length, data.items.grades.optionCount[d.grade]);
  }
});

test('a dropped item lands, is picked up into the bag with a new uid, and is announced', () => {
  const g = new Game(data, { seed: 21 });
  g.rng = { ...g.rng, next: () => 0, chance: () => false, int: (a) => a, range: (a) => a, weighted: (w) => Object.keys(w)[0] };
  const wolf = g.spawnAt({ monster: 'thornback_wolf', zone: 'forest', level: [20, 20], x: g.player.x + 3, z: g.player.z }, { x: g.player.x + 3, z: g.player.z });
  g.monsters.push(wolf);
  const before = g.ch.gear.length;
  g.killMonster(wolf);
  const drop = g.drops.find((d) => d.item === 'gear');
  assert.ok(drop, 'gear dropped');
  assert.ok(g.drainEvents().some((e) => e.type === 'drop' && e.item === 'gear' && e.base === drop.gear.base));
  for (let i = 0; i < 120 && g.drops.includes(drop); i++) { g.player.x = drop.x; g.player.z = drop.z; g.update(1 / 30); }
  assert.equal(g.ch.gear.length, before + 1);
  const item = g.ch.gear.at(-1);
  assert.equal(item.base, drop.gear.base);
  assert.ok(g.ch.gear.filter((i) => i.uid === item.uid).length === 1);
  assert.ok(g.drainEvents().some((e) => e.type === 'pickup' && e.item === 'gear' && e.uid === item.uid));
});
