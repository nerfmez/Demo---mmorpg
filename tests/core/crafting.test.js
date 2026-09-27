import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter } from '../../src/core/character.js';
import { craft, rollDrops, upgradeGear, upgradeSkill, sellMaterial } from '../../src/core/crafting.js';
import { createRng } from '../../src/core/rng.js';

test('crafting gear rolls a grade with the right number of options from the recipe pool', () => {
  const rng = createRng(42);
  const grades = new Set();
  for (let i = 0; i < 200; i++) {
    const ch = createCharacter(data);
    ch.gold = 999;
    ch.materials = { boar_tusk: 10, boar_hide: 10 };
    const r = craft(ch, data, 'tusk_blade', rng);
    assert.ok(r.ok);
    grades.add(r.item.grade);
    assert.equal(r.item.options.length, data.items.grades.optionCount[r.item.grade]);
    for (const o of r.item.options) assert.ok(data.recipes.recipes.tusk_blade.optionPool.includes(o.id));
    assert.equal(ch.materials.boar_tusk, 6);
  }
  assert.ok(grades.size >= 3, 'grades vary');
});

test('crafting fails without materials and takes nothing', () => {
  const ch = createCharacter(data);
  ch.materials = { boar_tusk: 1 };
  const r = craft(ch, data, 'tusk_blade', createRng(1));
  assert.equal(r.ok, false);
  assert.equal(ch.materials.boar_tusk, 1);
});

test('upgrade (+N) is separate from grade and uses ruin shards', () => {
  const ch = createCharacter(data);
  ch.gold = 999;
  ch.materials = { ruin_shard: 5 };
  const item = ch.gear[0];
  const grade = item.grade;
  assert.ok(upgradeGear(ch, data, item.uid).ok);
  assert.equal(item.upgrade, 1);
  assert.equal(item.grade, grade);
});

test('skills level up with materials from the world', () => {
  const ch = createCharacter(data);
  ch.gold = 999;
  ch.materials = { boar_tusk: 2 };
  assert.ok(upgradeSkill(ch, data, 'slash').ok);
  assert.equal(ch.skills.slash, 2);
  assert.equal(ch.materials.boar_tusk, 0);
});

test("drops are the monster's own parts plus gold", () => {
  const rng = createRng(3);
  const seen = new Set();
  for (let i = 0; i < 100; i++) for (const d of rollDrops(data, 'tusk_boar', 'meadow', rng)) seen.add(d.item);
  assert.deepEqual([...seen].sort(), ['boar_hide', 'boar_tusk', 'gold']);
  const ch = createCharacter(data);
  ch.materials.boar_hide = 2;
  assert.equal(sellMaterial(ch, data, 'boar_hide', 5), 2 * data.items.materials.boar_hide.value);
});
