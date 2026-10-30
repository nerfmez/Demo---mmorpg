// Job skills, batch 1 (owner, 2026-10-26): new skills built on the existing kinds. Every one can be
// learned at the workbench from real drops, casts and lands; buffs from different skills stack;
// damage-reduction and no-knockback buffs work; a skill can repeat on its own (volleys, double cuts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill, modFits } from '../../src/core/skills.js';
import { fusionCheck } from '../../src/fxtest/fusion.js';
import { readFileSync } from 'node:fs';
import { craft } from '../../src/core/crafting.js';

const BATCH = ['sky_shatter', 'earth_rend', 'iron_body', 'cross_cut', 'blade_storm', 'backstab', 'rally', 'frenzy_roar', 'stand_firm', 'team_stand', 'blessing', 'rapid_volley', 'killing_arrow', 'meteor', 'blizzard', 'thunderstorm', 'holy_bell', 'light_chain', 'spell_wave'];

const fixture = (id) => {
  const ch = createCharacter(data, { kit: 'bow' });
  ch.stats = { STR: 60, DEX: 60, INT: 60, AGI: 60, VIT: 60, LUK: 5 };
  ch.skills[id] = 1;
  ch.slots = [{ skill: id, mods: [] }, ...ch.slots.slice(1).map(() => ({ skill: null, mods: [] }))];
  const g = new Game(data, { seed: 7, character: ch });
  g.player.x = 0; g.player.z = 0; g.player.facing = Math.PI / 2;
  g.derived.weaponType = data.skills.combat[id].requiresWeapon?.[0] || 'sword';
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  const m = g.monsters[0];
  Object.assign(m, { x: 2, z: 0, hp: 1e6, maxHp: 1e6, defense: 0, facing: Math.PI, boss: false, state: 'chase', aggro: true, statuses: {} });
  g.monsters = [m];
  g.world = { surfaceY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, safe: () => false };
  g.isSafe = () => false; g.derived.critChance = 0; g.player.mp = g.player.maxMp; g.drainEvents();
  return { g, m, s: g.skills[0] };
};
const run = (g, seconds) => {
  for (let t = 0; t < seconds; t += 0.02) {
    g.time += 0.02;
    const due = []; g.pending = g.pending.filter((q) => ((q.t -= 0.02) > 0 ? true : (due.push(q.fn), false))); due.forEach((fn) => fn());
    g.updateProjectiles(0.02); g.updateAreas(0.02);
  }
};
const aim = { angle: Math.PI / 2, x: 2, z: 0 };

test('every batch skill is learned at the workbench from real drops and is tagged as waiting for its picture', () => {
  const drops = new Set(Object.values(data.monsters.monsters).flatMap((m) => m.drops.map((d) => d.item)));
  for (const id of BATCH) {
    const def = data.skills.combat[id];
    assert.ok(def && def.iconPending && def.job, id);
    const r = data.recipes.recipes['learn_' + id];
    assert.ok(r && r.type === 'skill' && r.result === id, id);
    for (const k of Object.keys(r.cost)) assert.ok(k === 'gold' || drops.has(k), `${id}: ${k} drops somewhere`);
    const ch = createCharacter(data); ch.gold = r.cost.gold; ch.materials = Object.fromEntries(Object.entries(r.cost).filter(([k]) => k !== 'gold'));
    assert.ok(craft(ch, data, 'learn_' + id).ok, id);
    assert.equal(ch.skills[id], 1);
  }
});

test('every damaging batch skill lands on a monster in front; buffs land on the hero', () => {
  for (const id of BATCH) {
    const { g, m, s } = fixture(id);
    g.executeSkill(s, aim);
    run(g, 3);
    if (s.def.damage) assert.ok(m.hp < 1e6, `${id} hits`);
    else assert.ok(g.player.buffs[id], `${id} buffs the hero`);
  }
});

test('base repeats: a volley fires five arrows and a cross cut strikes twice from one cast', () => {
  const v = fixture('rapid_volley');
  v.g.executeSkill(v.s, aim); run(v.g, 1.5);
  assert.equal(v.g.drainEvents().filter((e) => e.type === 'hit').length, 5);
  const c = fixture('cross_cut');
  c.g.executeSkill(c.s, aim); run(c.g, 0.5);
  assert.equal(c.g.drainEvents().filter((e) => e.type === 'slash').length, 2);
});

test('different buffs stack and each shows by name; reduction buffs cut damage taken; a steady buff stops knockback', () => {
  const { g } = fixture('rally');
  const rally = computeSkill({ ...g.ch, slots: [{ skill: 'rally', mods: [] }], skills: { rally: 1 } }, data, g.derived, 0);
  const firm = computeSkill({ ...g.ch, slots: [{ skill: 'stand_firm', mods: [] }], skills: { stand_firm: 1 } }, data, g.derived, 0);
  const iron = computeSkill({ ...g.ch, slots: [{ skill: 'iron_body', mods: [] }], skills: { iron_body: 1 } }, data, g.derived, 0);
  g.player.hp = g.player.maxHp = 1e6; g.player.shield = g.player.maxShield = 0;
  const hit = () => { const before = g.player.hp; g.damagePlayer(1000, null); const d = before - g.player.hp; g.player.hp = 1e6; return d; };
  const plain = hit();
  g.executeSkill(rally, aim); g.executeSkill(firm, aim);
  assert.ok(g.player.buffs.rally && g.player.buffs.stand_firm, 'both buffs are kept');
  assert.ok(Math.abs(g.playerDamageMult() - (1 + rally.damageBuff)) < 1e-9);
  const reduced = hit();
  assert.ok(Math.abs(reduced - plain * 0.85) <= 1, `15% less: ${plain} -> ${reduced}`);
  const x0 = g.player.x;
  g.damagePlayer(10, { kind: 'monster', x: g.player.x - 1, z: g.player.z }, { knock: { angle: Math.PI / 2, force: 10 } });
  assert.notEqual(g.player.x, x0, 'knocked back without a steady buff');
  g.player.x = x0; g.executeSkill(iron, aim);
  g.damagePlayer(10, { kind: 'monster', x: g.player.x - 1, z: g.player.z }, { knock: { angle: Math.PI / 2, force: 10 } });
  assert.equal(g.player.x, x0, 'iron body: no knockback');
});

test('Backstab steps behind its target and stabs; with no target in reach it fails and spends nothing', () => {
  const { g, m } = fixture('backstab');
  Object.assign(m, { x: 5, z: 0, facing: -Math.PI / 2 }); // 5 m away, facing back toward the hero
  g.input = { ...g.input, manualAim: false, aimFromPointer: false };
  g.player.cooldowns = g.player.cooldowns.map(() => 0); g.player.cast = null; g.player.dash = null;
  const mp = g.player.mp;
  assert.equal(g.castSlot(0), true);
  const step = g.drainEvents().find((e) => e.type === 'shadowStep');
  assert.ok(step, 'a shadow step');
  // behind it: on the far side from the way it faces, a body's width off
  assert.ok(g.player.x > m.x + m.r, `behind (${g.player.x.toFixed(2)} vs ${m.x})`);
  assert.equal(g.player.targetId, m.id);
  assert.ok(g.player.mp < mp, 'MP spent on a real cast');
  const c = g.player.cast; g.player.cast = null; g.executeSkill(c.skill, c.aim); // the cast completes
  assert.ok(m.hp < 1e6, 'the stab lands');
  // nothing in reach: no cast, no MP, no cooldown
  const far = fixture('backstab');
  Object.assign(far.m, { x: 20, z: 0 });
  far.g.player.cooldowns = far.g.player.cooldowns.map(() => 0); far.g.player.cast = null; far.g.player.dash = null;
  const mp2 = far.g.player.mp, x2 = far.g.player.x;
  assert.equal(far.g.castSlot(0), false);
  assert.equal(far.g.player.mp, mp2); assert.equal(far.g.player.x, x2); assert.equal(far.g.player.cooldowns[0], 0);
  assert.ok(far.g.drainEvents().some((e) => e.type === 'fail' && e.reason === 'target'));
});

test('Backstab aimed by a drag steps behind the target it picked, not the nearest; a drag at nothing fails', () => {
  const { g, m } = fixture('backstab');
  const near = { ...m, id: 'near', x: 2, z: 0, statuses: {} };
  Object.assign(m, { x: 0, z: 6, facing: Math.PI }); // the picked one: 6 m off, facing the hero
  g.monsters = [m, near];
  g.player.cooldowns = g.player.cooldowns.map(() => 0); g.player.cast = null; g.player.dash = null;
  // the button's drag: a one-press manual aim with the picked target locked
  g.setAimAngle(0, true); g.player.targetId = m.id;
  assert.equal(g.castSlot(0), true);
  assert.equal(g.drainEvents().find((e) => e.type === 'shadowStep')?.id, m.id);
  assert.ok(g.player.z > m.z + m.r, `behind the picked one (z ${g.player.z.toFixed(2)})`);
  assert.equal(g.input.manualAim, false, 'the drag aim lasts one press');
  // a drag that points at nothing (no lock) does not fall back to the nearest
  const b = fixture('backstab');
  b.g.player.cooldowns = b.g.player.cooldowns.map(() => 0); b.g.player.cast = null; b.g.player.dash = null;
  const mp = b.g.player.mp;
  b.g.setAimAngle(Math.PI, true); b.g.player.targetId = null;
  assert.equal(b.g.castSlot(0), false);
  assert.equal(b.g.player.mp, mp); assert.equal(b.g.player.cooldowns[0], 0);
  assert.equal(b.g.input.manualAim, false);
  // the backstab's reach is the auto-lock range while it is equipped
  assert.ok(b.g.acquireRange >= data.skills.combat.backstab.shadowStep.range);
});

test('Spell Wave stops at the first monster on its line; the pierce mod lets it cut through more', () => {
  const line = (s) => {
    const { g, m } = fixture('spell_wave');
    const mid = { ...m, id: 'mid', x: 5, z: 0, statuses: {}, hp: 1e6 }, far = { ...m, id: 'far', x: 7, z: 0, statuses: {}, hp: 1e6 }, beside = { ...m, id: 'beside', x: 4, z: 1.6, statuses: {}, hp: 1e6 };
    Object.assign(m, { x: 3, z: 0 });
    g.monsters = [m, mid, far, beside];
    g.executeSkill(s(g), aim);
    const hits = [];
    for (let i = 0; i < 120 && g.projectiles.length; i++) { g.updateProjectiles(1 / 60); for (const e of g.drainEvents()) if (e.type === 'hit') hits.push(e.id); }
    return { hits, m, mid, far };
  };
  const base = line((g) => g.skills[0]);
  assert.equal(base.hits[0], base.m.id, 'no pierce of its own: the first one only');
  assert.equal(base.hits.length, 1);
  const modded = line((g) => computeSkill({ ...g.ch, mods: [{ id: 'pierce', uid: 900, level: 1, grade: 'C' }], slots: [{ skill: 'spell_wave', mods: [900] }], skills: { spell_wave: 1 } }, data, g.derived, 0));
  assert.deepEqual(modded.hits, [modded.m.id, modded.mid.id, modded.far.id], 'the pierce mod (+2) carries it through two more, once each; the one beside the line is missed');
});

test('Spell Wave is the spellblade main skill: a short cooldown and cost like the other main attacks', () => {
  const sw = data.skills.combat.spell_wave;
  for (const id of ['slash', 'hunter_shot', 'cross_cut']) {
    const main = data.skills.combat[id];
    assert.ok(sw.cooldown <= 1.6 && Math.abs(sw.cooldown - main.cooldown) <= 0.56, `cooldown near ${id}`);
    assert.ok(sw.cost <= 2 * main.cost, `cost near ${id}`);
  }
});

test('Spell Wave is already magic: it cannot carry a fused spell, but (plain Arcane) it takes an element shift', () => {
  const fusion = JSON.parse(readFileSync(new URL('../../data/fusion.json', import.meta.url)));
  const combat = data.skills.combat;
  assert.equal(fusionCheck(fusion, combat.spell_wave, combat.firebolt).ok, false, 'no spell on a spell');
  assert.equal(fusionCheck(fusion, combat.slash, combat.firebolt).ok, true, 'a plain attack still carries one');
  for (const [id, el] of [['fire_shift', 'fire'], ['frost_shift', 'cold'], ['poison_shift', 'poison']]) {
    const mod = data.mods.mods[id];
    assert.ok(modFits(combat.spell_wave, mod).ok, `${id}: Arcane has no effect of its own, so it may change`);
    assert.equal(modFits(combat.firebolt, mod).ok, false, `${id}: not on a spell`);
    assert.equal(modFits({ ...combat.slash, tags: [...combat.slash.tags, 'Fire'] }, mod).ok, false, `${id}: not on an attack that already has an element with an effect`);
    const { g } = fixture('spell_wave');
    const s = computeSkill({ ...g.ch, mods: [{ id, uid: 901, level: 1, grade: 'C' }], slots: [{ skill: 'spell_wave', mods: [901] }], skills: { spell_wave: 1 } }, data, g.derived, 0);
    assert.equal(s.element, el);
    g.executeSkill(s, aim);
    assert.equal(g.projectiles.find((pr) => pr.kind === 'spell_wave')?.element, el, 'the wave carries the element (the view recolours it)');
  }
  // only attacks with no element, or plain Arcane, take an element shift
  const EFFECT_ELEMENTS = ['Fire', 'Cold', 'Lightning', 'Poison', 'Earth'];
  for (const [sid, s] of Object.entries(combat)) {
    if (modFits(s, data.mods.mods.fire_shift).ok) assert.ok(s.tags.includes('Attack') && !s.tags.some((t) => EFFECT_ELEMENTS.includes(t)), sid);
  }
});

// Blink Draw (owner, 2026-10-27): the spellblade's dash cut. A short wind-up, a dash of range m
// along the aim, and every monster in the lane it crossed cut once when it arrives.
test('Blink Draw dashes along the aim and cuts the lane it crossed, once each', () => {
  const def = data.skills.combat.draw_cut, r = data.recipes.recipes.learn_draw_cut;
  assert.ok(def.iconPending && def.job === 'spellblade' && r?.result === 'draw_cut');
  const drops = new Set(Object.values(data.monsters.monsters).flatMap((m) => m.drops.map((d) => d.item)));
  for (const k of Object.keys(r.cost)) assert.ok(k === 'gold' || drops.has(k), k);
  const setup = (wallAt = null) => {
    const { g, m } = fixture('draw_cut');
    const mk = (id, x, z) => ({ ...m, id, x, z, statuses: {}, hp: 1e6 });
    g.monsters = [mk('a', 2.5, 0.2), mk('b', 4.6, -0.4), mk('c', 6.2, 0.3), mk('beside', 4, 2.4), mk('past', 9.5, 0), mk('behind', -3.5, 0)];
    if (wallAt !== null) g.world.move = (x, z, rr, dx, dz) => (x + dx > wallAt ? { x: wallAt, z, blocked: true } : { x: x + dx, z: z + dz, blocked: false });
    g.input.manualAim = true; g.input.aimAngle = Math.PI / 2; g.player.targetId = 'a'; g.player.facing = Math.PI / 2; // aimed through the first one
    assert.ok(g.castSlot(0));
    const hits = []; let arrived = null, firstHit = null;
    for (let t = 0; t < 1; t += 1 / 60) {
      g.updatePlayer(1 / 60); g.time += 1 / 60;
      const due = []; g.pending = g.pending.filter((q) => ((q.t -= 1 / 60) > 0 ? true : (due.push(q.fn), false))); due.forEach((fn) => fn());
      for (const e of g.drainEvents()) { if (e.type === 'dashArrive') arrived = t; if (e.type === 'hit') { hits.push(e.id); firstHit ??= t; } }
    }
    if (hits.length) assert.ok(firstHit - arrived >= def.cutDelay - 1 / 60, 'the cut falls a beat after the hero arrives');
    return { g, hits };
  };
  const { g, hits } = setup();
  assert.ok(Math.abs(Math.hypot(g.player.x, g.player.z) - def.range) < 0.05, 'the hero lands at the end of the dash: ' + g.player.x + ',' + g.player.z);
  assert.deepEqual(hits.sort(), ['a', 'b', 'c'], 'the three in the lane, once each, after the cut delay; not beside, past or behind it');
  const walled = setup(4);
  assert.ok(Math.abs(walled.g.player.x - 4) < 1e-9, 'a wall stops the dash');
  assert.deepEqual(walled.hits.sort(), ['a', 'b'], 'the lane is only as long as the dash went');
});

test('Blink Draw is no dodge, takes the lane mods and its element can change', () => {
  const { g, s } = fixture('draw_cut');
  g.executeSkill(s, { angle: Math.PI / 2, x: 0, z: 0 });
  assert.equal(g.player.dash.inv, false, 'not invulnerable while dashing');
  let triggered = 0; g.fireTriggers = () => triggered++;
  for (let t = 0; t < 0.5; t += 1 / 60) g.updatePlayer(1 / 60);
  assert.equal(triggered, 0, 'a skill dash fires no on-dodge triggers');
  const combat = data.skills.combat, M = data.mods.mods;
  for (const id of ['long_rend', 'tip_strike', 'pierce_line', 'fire_shift', 'heavy_blow']) assert.ok(modFits(combat.draw_cut, M[id]).ok, id);
  assert.ok(!combat.draw_cut.tags.includes('Signature'));
  const long = computeSkill({ ...g.ch, mods: [{ id: 'long_rend', uid: 900, level: 1, grade: 'C' }], slots: [{ skill: 'draw_cut', mods: [900] }], skills: { draw_cut: 1 } }, data, g.derived, 0);
  assert.ok(long.range > s.range, 'Long Rend dashes farther');
});
