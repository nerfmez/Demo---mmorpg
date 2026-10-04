import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createRng } from '../../src/core/rng.js';
import { gearPower } from '../../src/core/character.js';
import { gearDropCandidates, rollGearDrop } from '../../src/core/crafting.js';

const TIERS = data.progression.balance.gearTiers, G = data.items.gearBases;
const gearRecipes = Object.values(data.recipes.recipes).filter((r) => r.type === 'gear');
const tierOf = (il) => TIERS.indexOf(il);

test('every gear tier has each weapon kind, a shield and every armour slot', () => {
  for (const il of TIERS) {
    const bases = Object.values(G).filter((b) => b.itemLevel === il && !b.starter);
    const kinds = new Set(bases.map((b) => b.weaponType || b.offhandType || b.slot));
    for (const k of ['sword', 'dagger', 'wand', 'greatblade', 'staff', 'bow', 'shield', 'armor', 'helm', 'gloves', 'boots', 'charm']) assert.ok(kinds.has(k), `item level ${il} has a ${k}`);
    assert.ok(kinds.has('mace') || kinds.has('axe'), `item level ${il} has a heavy one-hand weapon`);
  }
  for (const b of Object.values(G)) assert.ok(TIERS.includes(b.itemLevel), b.nameTh);
});

test('armour pieces above the first tier follow the set reference for their slot', () => {
  const W = data.items.requirements.weights, g = data.progression.balance.gear;
  const SHARE = { armor: 0.45, helm: 0.2, gloves: 0.1, boots: 0.15, offhand: 0.3 };
  for (const [id, b] of Object.entries(G)) {
    if (b.itemLevel === 1 || !SHARE[b.slot]) continue;
    const set = g.defense[0] + g.defense[1] * (b.itemLevel - 1) + (g.maxHp[0] + g.maxHp[1] * (b.itemLevel - 1)) * W.maxHp;
    const ratio = gearPower(b.stats, data) / (set * SHARE[b.slot]);
    assert.ok(ratio > 0.8 && ratio < 1.6, `${id} ${ratio.toFixed(2)}`);
  }
});

test('recipes cost more with each tier and higher tiers ask for bulk lower-tier parts', () => {
  const total = (r) => Object.entries(r.cost).reduce((a, [k, n]) => a + (k === 'gold' ? 0 : n), 0);
  const avg = (il) => { const list = gearRecipes.filter((r) => r.itemLevel === il); return list.reduce((a, r) => a + total(r), 0) / list.length; };
  for (let i = 1; i < TIERS.length; i++) assert.ok(avg(TIERS[i]) > avg(TIERS[i - 1]) * 1.2, `tier ${TIERS[i]} needs more parts`);
  const firstTierParts = new Set(gearRecipes.filter((r) => r.itemLevel === 1).flatMap((r) => Object.keys(r.cost)));
  for (const r of gearRecipes.filter((r) => r.itemLevel >= TIERS[1])) {
    assert.ok(Object.entries(r.cost).some(([k, n]) => k !== 'gold' && firstTierParts.has(k) && n >= 10), `${r.result} asks for a bulk first-tier part`);
    assert.equal(r.itemLevel, G[r.result].itemLevel, r.result);
  }
});

test('every spawn can drop gear of its own parts, mostly of its level band', () => {
  let exact = 0, all = 0;
  for (const map of Object.values(data.maps)) for (const s of [...map.spawns, ...(map.bosses || []).map((b) => ({ monster: b.monster, level: [b.level, b.level] }))]) {
    const parts = new Set(data.monsters.monsters[s.monster].drops.map((d) => d.item));
    for (let level = s.level[0]; level <= s.level[1]; level++) {
      const list = gearDropCandidates(data, s.monster, level);
      assert.ok(list.length, `${s.monster} Lv${level}`);
      for (const id of list) assert.ok(gearRecipes.some((r) => r.result === id && Object.keys(r.cost).some((k) => parts.has(k))), `${id} is made from ${s.monster} parts`);
      const band = TIERS.filter((t) => t <= level).pop();
      all++;
      if (list.every((id) => G[id].itemLevel === band)) exact++;
    }
  }
  assert.ok(exact / all >= 0.75, `${exact}/${all} spawn levels drop their own band`);
});

test('gear drops are rare, graded best-first, and bosses always drop one', () => {
  const rng = createRng(11), counts = { C: 0, B: 0, A: 0, S: 0 }, n = 40000;
  for (let i = 0; i < n; i++) { const d = rollGearDrop(data, 'thornback_wolf', 12, false, rng); if (d) counts[d.grade]++; }
  const rates = data.items.gearDrops.normal, sum = Object.values(rates).reduce((a, b) => a + b, 0);
  const got = Object.values(counts).reduce((a, b) => a + b, 0) / n;
  assert.ok(Math.abs(got - sum) < sum * 0.25, `drop rate ${got} vs ${sum}`);
  assert.ok(counts.C > counts.B && counts.B > counts.A, JSON.stringify(counts));
  const mats = data.monsters.monsters.thornback_wolf.drops.filter((d) => d.item !== 'gold');
  assert.ok(sum < 0.1 * Math.min(...mats.map((d) => d.chance)), 'far rarer than the monster parts');
  for (let i = 0; i < 50; i++) {
    const d = rollGearDrop(data, 'greyfang', 14, true, rng);
    assert.ok(d && G[d.base].itemLevel === 11);
    assert.equal(d.options.length, data.items.grades.optionCount[d.grade]);
  }
});

test('a dropped item lands, is picked up into the bag with a new uid, and is announced', () => {
  const g = new Game(data, { seed: 21 });
  g.rng = { ...g.rng, next: () => 0, chance: () => false, int: (a) => a, range: (a) => a, weighted: (w) => Object.keys(w)[0] };
  const wolf = g.spawnAt({ monster: 'thornback_wolf', zone: 'forest', level: [12, 12], x: g.player.x + 3, z: g.player.z }, { x: g.player.x + 3, z: g.player.z });
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
