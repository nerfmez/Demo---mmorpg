// MP economy (owner, 2026-10-26, after Path of Exile and Undecember): every skill costs MP; a rank
// raises the cost faster than the damage; every mod multiplies it; faster casting spends it faster.
// Attacks win MP back per enemy hit (gear options, the MP journal line, Mana Siphon); spells lean on
// regeneration, a bigger pool and cheaper casts. Pushing damage and speed with no MP investment
// leaves a build MP-bound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, derive } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { optionRange } from '../../src/core/crafting.js';
import { linePath, longFightDps } from '../../src/core/balance.js';

const C = data.skills.combat, M = data.mods.mods;
const strong = { STR: 60, DEX: 60, INT: 60, AGI: 60, VIT: 60, LUK: 5 };
const skillWith = (id, mods = [], rank = 1, extra = {}) => {
  const ch = createCharacter(data, { kit: 'sword' });
  ch.stats = { ...strong };
  ch.skills[id] = rank;
  ch.mods = mods.map((m, i) => ({ uid: 'u' + i, id: m, level: 1 }));
  ch.slots = [{ skill: id, mods: ch.mods.map((m) => m.uid) }];
  const d = { ...derive(ch, data), weaponType: C[id].requiresWeapon?.[0] || 'sword', ...extra };
  return computeSkill(ch, data, d, 0);
};

test('every combat skill costs MP; only an aura, which reserves MP instead, is free to switch on', () => {
  for (const [id, s] of Object.entries(C)) {
    if (s.aura) assert.ok(s.aura.reserve > 0, `${id} reserves MP`);
    else assert.ok(s.cost > 0, `${id} costs MP`);
  }
  // the quick main attacks are the cheap ones per second; physical ones are cheaper than the spell (costs
  // per cast grew with the base cooldowns on 2026-10-27 and 2026-10-31, MP per second unchanged)
  const perSec = (id) => C[id].cost / C[id].cooldown;
  for (const id of ['slash', 'weakpoint', 'hunter_shot', 'venom_mire', 'cross_cut']) assert.ok(perSec(id) <= 33 && perSec(id) < perSec('arcane_bolt') * 1.6, id);
  assert.ok(perSec('slash') < perSec('arcane_bolt'));
});

test('a rank raises the MP cost faster than the damage', () => {
  const up = data.progression.skillUpgrade;
  assert.ok(up.manaPerLevel > up.perLevel);
  const r1 = skillWith('slash', [], 1), r5 = skillWith('slash', [], 5);
  assert.ok(r5.cost / r1.cost > r5.damage / r1.damage);
});

test('every combat mod multiplies the cost, and the multipliers stack; movement mods have none', () => {
  for (const [id, m] of Object.entries(M)) {
    if (m.tags.includes('Movement')) assert.equal(m.effect.costMult, undefined, id);
    else assert.ok(m.effect.costMult >= 1 && m.effect.costMult <= 1.5, `${id} costMult ${m.effect.costMult}`);
  }
  const bare = skillWith('slash'), two = skillWith('slash', ['multistrike', 'wide_arc']);
  assert.ok(two.mods.every((m) => m.active));
  assert.ok(Math.abs(two.cost - bare.cost * M.multistrike.effect.costMult * M.wide_arc.effect.costMult) < 1e-9);
  // a channel's drain follows the same skill level and mod multipliers
  const ch1 = skillWith('flame_stream', [], 1), ch5 = skillWith('flame_stream', [], 25);
  assert.ok(ch5.channel.manaPerSecond / ch1.channel.manaPerSecond > 1.4);
  assert.equal(C.flame_stream.channel.manaPerSecond, 80, 'the data itself is never changed');
});

test('MP on hit is for attacks only: gear and Mana Siphon add to it, a spell never gains it', () => {
  assert.equal(skillWith('cross_cut', [], 1, { mpOnHit: 5 }).mpOnHit, 5);
  assert.equal(skillWith('firebolt', [], 1, { mpOnHit: 5 }).mpOnHit, 0);
  const siphon = skillWith('slash', ['mana_siphon'], 1, { mpOnHit: 3 });
  assert.equal(siphon.mpOnHit, 3 + M.mana_siphon.effect.mpOnHit[0]);
  assert.equal(siphon.cost, skillWith('slash').cost, 'Mana Siphon adds no cost');
  const recipe = Object.values(data.recipes.recipes).find((r) => r.type === 'mod' && r.result === 'mana_siphon');
  assert.ok(recipe, 'Mana Siphon is crafted at the workbench');
});

test('an attack wins MP back for every enemy each of its strikes hits', () => {
  const ch = createCharacter(data, { kit: 'sword' });
  ch.stats = { ...strong }; ch.skills.cross_cut = 1;
  ch.slots = [{ skill: 'cross_cut', mods: [] }, ...ch.slots.slice(1).map(() => ({ skill: null, mods: [] }))];
  const g = new Game(data, { seed: 7, character: ch });
  g.player.x = 0; g.player.z = 0; g.player.facing = Math.PI / 2;
  g.derived.weaponType = 'dagger'; g.derived.mpOnHit = 5; g.derived.critChance = 0;
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  const base = g.monsters[0];
  g.monsters = [0, 0.6].map((z, i) => Object.assign(Object.create(Object.getPrototypeOf(base)), base, { id: 900 + i, x: 1.6, z, hp: 1e6, maxHp: 1e6, defense: 0, boss: false, state: 'chase', aggro: true, statuses: {} }));
  g.world = { surfaceY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, safe: () => false };
  g.isSafe = () => false; g.player.mp = 100; g.drainEvents();
  g.executeSkill(g.skills[0], { angle: Math.PI / 2, x: 2, z: 0 });
  for (let t = 0; t < 0.5; t += 0.02) {
    g.time += 0.02;
    const due = []; g.pending = g.pending.filter((q) => ((q.t -= 0.02) > 0 ? true : (due.push(q.fn), false))); due.forEach((fn) => fn());
  }
  const hits = g.drainEvents().filter((e) => e.type === 'hit' && !e.dot).length;
  assert.equal(hits, 4, 'two strikes, two enemies each');
  assert.equal(g.player.mp, 100 + 4 * 5);
});

test('MP on hit options roll small, on attack gear only; spell gear rolls MP regeneration and cheaper casts', () => {
  const o = data.items.gearOptions;
  assert.equal(o.mp_on_hit.stat, 'mpOnHit');
  assert.ok(optionRange(data, 'mp_on_hit', 'S', 21).max <= 8, 'a top roll stays small next to skill costs');
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    const t = b.weaponType, caster = ['staff', 'wand'].includes(t) || (b.slot === 'weapon' && b.requirementStat === 'INT'); // a priest's mace is a caster's
    if (caster) assert.ok(!b.optionPool.includes('mp_on_hit') && b.optionPool.includes('mp_regen_pct'), id);
    else if (['sword', 'dagger', 'axe', 'mace', 'greatblade', 'bow'].includes(t)) assert.ok(b.optionPool.includes('mp_on_hit') && !b.optionPool.includes('mana_cost_pct'), id);
  }
});

test('pushing speed and mods without MP leaves an attacker MP-bound and weaker; taking MP fixes it', () => {
  const cap = data.progression.balance.monsterCap, speed = linePath(data, 'line.speed'), mana = linePath(data, 'line.mana');
  const mods = ['multistrike', 'wide_arc', 'fire_shift', 'life_leech'];
  const plain = longFightDps(data, 'sword', cap, speed.slice(0, 39));
  const greedy = longFightDps(data, 'sword', cap, speed.slice(0, 39), 90, mods);
  assert.equal(greedy.manaLimited, true, 'four mods and the speed line with no MP run dry in a long fight');
  assert.ok(greedy.dps < plain.dps, `greedy ${greedy.dps} falls below the bare skill ${plain.dps}`);
  const mixed = longFightDps(data, 'sword', cap, [...new Set([...speed.slice(0, 24), ...mana.filter((id) => !speed.includes(id)).slice(0, 15)])], 90, mods);
  assert.ok(mixed.dps > greedy.dps * 1.5, `taking MP (${mixed.dps}) pays off over ignoring it (${greedy.dps})`);
  // a bow with MP on hit from its gear and Mana Siphon keeps up where the MP line alone does not
  const bowMods = ['split', 'pierce', 'fire_shift'];
  const mix = [...new Set([...speed.slice(0, 24), ...mana.filter((id) => !speed.includes(id)).slice(0, 15)])];
  const bowMana = longFightDps(data, 'bow', cap, mix, 90, [...bowMods, 'life_leech']);
  const bowSiphon = longFightDps(data, 'bow', cap, mix, 90, [...bowMods, 'mana_siphon'], { mpOnHit: 8 });
  assert.equal(bowMana.manaLimited, true);
  assert.ok(bowSiphon.dps > bowMana.dps, 'MP on hit lifts the cap');
});
