// Gear option values (owner, 2026-10-25): a higher item level rolls bigger options, a better grade rolls
// better ones, percentages stay modest; drop-find options exist and hunter arrows give only a little.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createRng } from '../../src/core/rng.js';
import { optionRange, rollGear, rollGearDrop } from '../../src/core/crafting.js';

const G = data.items.grades, OPTIONS = Object.keys(data.items.gearOptions).filter((k) => !k.startsWith('_'));
const LEVELS = [1, 6, 11, 16, 21];

test('a better grade never rolls lower, and no grade passes the top of its item level\'s range', () => {
  for (const id of OPTIONS) for (const il of LEVELS) {
    let prev = null;
    const top = optionRange(data, id, G.order.at(-1), il).max;
    for (const g of G.order) {
      const r = optionRange(data, id, g, il);
      assert.ok(r.min <= r.max && r.max <= top, `${id} ${g} L${il}`);
      if (prev) assert.ok(r.min >= prev.min && r.max >= prev.max, `${id}: ${g} is not lower than the grade below at L${il}`);
      prev = r;
    }
  }
});

test('flat options grow with item level like weapon base stats; percentages grow gently', () => {
  const ref = data.items.handRules.reference, weapon = (il) => ref.base + ref.perItemLevel * (il - 1);
  const top = (id, il) => optionRange(data, id, 'S', il).max;
  const flat = top('attack_flat', 21) / top('attack_flat', 1), w = weapon(21) / weapon(1);
  assert.ok(Math.abs(flat - w) / w < 0.1, `attack option grows ${flat.toFixed(2)}x, the weapon ${w.toFixed(2)}x`);
  for (const id of OPTIONS.filter((k) => data.items.gearOptions[k].stat.endsWith('Pct'))) {
    const g = top(id, 21) / top(id, 1);
    assert.ok(g >= 1 && g <= 1.75, `${id} grows ${g.toFixed(2)}x`);
  }
  assert.equal(optionRange(data, 'attack_flat', 'C', 1).min, data.items.gearOptions.attack_flat.min, 'a level 1 C roll starts at the option\'s own minimum');
});

test('crafted and dropped options stay in their item\'s grade and level range; S rolls higher than C', () => {
  const recipe = data.recipes.recipes.tusk_blade, rng = createRng(5), by = { C: [], S: [] };
  for (let i = 0; i < 3000; i++) {
    const it = rollGear(data, recipe, rng);
    for (const o of it.options) {
      const r = optionRange(data, o.id, it.grade, it.itemLevel);
      assert.ok(o.value >= r.min && o.value <= r.max, `${o.id} ${it.grade} ${o.value}`);
      const full = [optionRange(data, o.id, 'C', it.itemLevel).min, optionRange(data, o.id, 'S', it.itemLevel).max];
      if (by[it.grade] && full[1] > full[0]) by[it.grade].push((o.value - full[0]) / (full[1] - full[0]));
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(by.S) > mean(by.C) + 0.3, `S ${mean(by.S).toFixed(2)} vs C ${mean(by.C).toFixed(2)}`);
  const drng = createRng(3), monster = Object.keys(data.monsters.monsters)[0];
  for (let i = 0; i < 500; i++) {
    const it = rollGearDrop(data, monster, 5, true, drng);
    if (it) for (const o of it.options) { const r = optionRange(data, o.id, it.grade, it.itemLevel); assert.ok(o.value >= r.min && o.value <= r.max); }
  }
});

test('drop-find options roll on charms and boots; hunter arrows give a small find', () => {
  for (const id of ['gear_find', 'material_find', 'gold_find']) assert.ok(data.items.gearOptions[id], id);
  for (const [id, b] of Object.entries(data.items.gearBases)) {
    if (b.slot === 'charm') assert.ok(b.optionPool.includes('gear_find') && b.optionPool.includes('gold_find'), id);
    if (b.slot === 'boots') assert.ok(b.optionPool.includes('material_find'), id);
  }
  const arrow = data.items.arrows.types.hunter_arrow.stats;
  assert.ok(arrow.gearFindPct <= 5 && arrow.materialFindPct <= 5, 'the owner found 10% too much');
});

test('a v13 save\'s flat option rolls move to the tenfold scale once; percentages and new-scale values stay', async () => {
  const { createCharacter, migrateCharacter, CHARACTER_VERSION } = await import('../../src/core/character.js');
  const ch = createCharacter(data);
  ch.version = 13;
  ch.gear[0].options = [{ id: 'attack_flat', value: 2 }, { id: 'hp_flat', value: 15 }, { id: 'melee_pct', value: 7 }, { id: 'defense_flat', value: 12 }];
  migrateCharacter(ch, data);
  assert.equal(ch.version, CHARACTER_VERSION);
  assert.deepEqual(ch.gear[0].options.map((o) => o.value), [20, 150, 7, 12], 'old flat rolls x10; a percentage and a value already on the new scale are kept');
  const once = JSON.stringify(ch); migrateCharacter(ch, data);
  assert.equal(JSON.stringify(ch), once, 'a second load changes nothing');
});
