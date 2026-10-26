// Job skills, batch 1 (owner, 2026-10-26): new skills built on the existing kinds. Every one can be
// learned at the workbench from real drops, casts and lands; buffs from different skills stack;
// damage-reduction and no-knockback buffs work; a skill can repeat on its own (volleys, double cuts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
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
