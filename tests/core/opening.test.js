import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, completeOpening, openingSkillChoices, migrateCharacter, CHARACTER_VERSION } from '../../src/core/character.js';
import { craft, recipeBlocker } from '../../src/core/crafting.js';
import { createRng } from '../../src/core/rng.js';

const O = data.progression.start.opening;

test('a new character wakes unarmed with no skills; Firebolt and Ward are not part of the start', () => {
  const ch = createCharacter(data, { opening: true, name: 'Castaway' });
  assert.equal(ch.opening.stage, 'wake');
  assert.deepEqual(ch.skills, {});
  assert.deepEqual(ch.movementSkills, []);
  assert.equal(ch.equipped.weapon, null);
  assert.ok(ch.slots.every((s) => s.skill === null));
  assert.ok(!O.skillPool.includes('firebolt') && !O.skillPool.includes('ward'), 'quest/workbench skills are not starter picks');
});

test('each of the three weapons brings its own basic attack, plus one skill and one movement skill', () => {
  assert.deepEqual(O.weapons, ['sword', 'bow', 'staff']);
  const basics = O.weapons.map((k) => data.progression.start.kits[k].basic);
  assert.equal(new Set(basics).size, 3);
  assert.deepEqual(basics, ['slash', 'hunter_shot', 'arcane_bolt']);
  for (const kit of O.weapons) {
    const ch = createCharacter(data, { opening: true });
    const skill = openingSkillChoices(data, kit)[0], movement = O.movementPool[1];
    assert.ok(skill, `${kit} has a starter skill to pick`);
    assert.deepEqual(completeOpening(ch, data, { kit, skill, movement }), { ok: true });
    const k = data.progression.start.kits[kit];
    assert.equal(ch.gear.find((g) => g.uid === ch.equipped.weapon).base, k.weapon);
    assert.deepEqual(Object.keys(ch.skills).sort(), [k.basic, skill].sort());
    assert.equal(ch.slots[0].skill, k.basic, 'the basic attack takes slot 1');
    assert.equal(ch.slots[1].skill, skill);
    assert.deepEqual(ch.movementSkills, [movement]);
    assert.equal(ch.movement, movement);
    assert.equal(ch.opening.stage, 'done');
    assert.equal(ch.skills.firebolt, undefined);
    assert.equal(ch.skills.ward, undefined);
  }
});

test('starter skill choices respect the weapon; bad or repeated choices are refused', () => {
  assert.ok(openingSkillChoices(data, 'sword').includes('whirl_blade'));
  assert.ok(!openingSkillChoices(data, 'staff').includes('whirl_blade'), 'a blade skill is not offered to a staff');
  const ch = createCharacter(data, { opening: true });
  assert.equal(completeOpening(ch, data, { kit: 'sword', skill: 'firebolt', movement: 'dash' }).reason, 'skill');
  assert.equal(completeOpening(ch, data, { kit: 'sword', skill: 'war_cry', movement: 'blink' }).reason, 'movement');
  assert.equal(completeOpening(ch, data, { kit: 'axe', skill: 'war_cry', movement: 'dash' }).reason, 'kit');
  assert.equal(ch.opening.stage, 'wake', 'nothing was applied');
  assert.ok(completeOpening(ch, data, { kit: 'sword', skill: 'war_cry', movement: 'dash' }).ok);
  assert.equal(completeOpening(ch, data, { kit: 'bow', skill: 'war_cry', movement: 'dash' }).reason, 'done');
});

test('the staff basic attack is free, needs a staff and has a projectile of its own', () => {
  const d = data.skills.combat.arcane_bolt;
  assert.equal(d.cost, 0);
  assert.deepEqual(d.requiresWeapon, ['staff']);
  assert.equal(d.kind, 'projectile');
  assert.ok(d.damage.base > 0);
});

test('Firebolt and Ward are taught by the first shore quests and can be crafted', () => {
  assert.deepEqual(data.quests.quests.h_slimes.reward.skills, ['firebolt']);
  assert.deepEqual(data.quests.quests.h_crabs.reward.skills, ['ward']);
  const ch = createCharacter(data, { opening: true });
  completeOpening(ch, data, { kit: 'staff', skill: 'frost_nova', movement: 'dash' });
  const g = new Game(data, { character: ch, seed: 3 });
  for (let i = 0; i < 3; i++) g.notify({ type: 'kill', target: 'salt_slime' });
  assert.equal(g.ch.skills.firebolt, 1);
  assert.ok(g.ch.slots.some((s) => s.skill === 'firebolt'), 'it lands in an empty slot');
  for (let i = 0; i < 3; i++) g.notify({ type: 'kill', target: 'reef_crab' });
  assert.equal(g.ch.skills.ward, 1);
  for (let i = 0; i < 3; i++) g.notify({ type: 'kill', target: 'salt_slime' }); // never pays a second time
  assert.equal(g.ch.slots.filter((s) => s.skill === 'firebolt').length, 1);

  // every skill the player lacks has a workbench recipe, movement skills included
  const c = createCharacter(data, { opening: true });
  completeOpening(c, data, { kit: 'sword', skill: 'war_cry', movement: 'dash' });
  const recipes = Object.values(data.recipes.recipes);
  for (const id of Object.keys(data.skills.combat)) assert.ok(recipes.some((r) => r.type === 'skill' && r.result === id), `a recipe teaches ${id}`);
  for (const id of Object.keys(data.skills.movement)) assert.ok(recipes.some((r) => r.type === 'movement' && r.result === id), `a recipe teaches ${id}`);
  c.gold = 500; c.materials = { glow_dust: 5, beetle_shell: 5, boar_hide: 5 };
  assert.equal(recipeBlocker(c, data, 'learn_firebolt'), null);
  assert.ok(craft(c, data, 'learn_firebolt', createRng(1)).ok);
  assert.equal(c.skills.firebolt, 1);
  assert.equal(recipeBlocker(c, data, 'learn_firebolt'), 'learned');
  assert.ok(craft(c, data, 'learn_roll', createRng(1)).ok);
  assert.deepEqual(c.movementSkills, ['dash', 'roll']);
});

test('v9 migration: older saves keep every skill and are not sent back to the wreck', () => {
  const old = createCharacter(data); // legacy full kit
  old.version = 8; delete old.opening;
  const before = JSON.stringify({ skills: old.skills, slots: old.slots, mv: old.movementSkills, kit: old.kit });
  const m = migrateCharacter(structuredClone(old), data);
  assert.equal(m.version, CHARACTER_VERSION);
  assert.equal(m.opening.stage, 'done');
  assert.equal(JSON.stringify({ skills: m.skills, slots: m.slots, mv: m.movementSkills, kit: m.kit }), before);
  // a character saved mid-opening stays in it
  const pending = createCharacter(data, { opening: true });
  const m2 = migrateCharacter(structuredClone(pending), data);
  assert.equal(m2.opening.stage, 'wake');
  assert.equal(m2.kit, null);
  assert.deepEqual(m2.skills, {});
  assert.equal(m2.movement, null);
});

test('the staff basic attack fires an arcane projectile without mana, and needs a staff', () => {
  const mk = (kit) => { const ch = createCharacter(data, { opening: true }); completeOpening(ch, data, { kit, skill: openingSkillChoices(data, kit)[0], movement: 'dash' }); return new Game(data, { character: ch, seed: 4 }); };
  const g = mk('staff');
  const mp = g.player.mp;
  g.player.facing = 0;
  g.castSlot(0, { x: g.player.x, z: g.player.z + 8 });
  for (let i = 0; i < 40 && !g.projectiles.length; i++) g.update(1 / 60);
  assert.equal(g.projectiles.length, 1, 'a projectile leaves the staff');
  assert.equal(g.projectiles[0].element, 'arcane');
  assert.equal(g.projectiles[0].owner, 'player');
  assert.ok(g.player.mp >= mp - 1e-6 - 0, 'no mana spent');
  const sword = mk('sword');
  sword.ch.slots[2].skill = 'arcane_bolt';
  sword.ch.skills.arcane_bolt = 1;
  assert.ok(data.skills.combat.arcane_bolt.requiresWeapon.includes('staff') && !sword.derived.weaponType.includes('staff'));
});
