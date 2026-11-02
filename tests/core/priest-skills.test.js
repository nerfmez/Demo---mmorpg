// Priest skills (owner, 2026-11-02: "the priest group"; docs/SKILL-TREE-WHEEL-DRAFT-TH.md section 4, job 11).
// Blessing of Light, Holy Bell and Chain of Light were built before; the group's new one is Revive (ชุบชีวิต,
// half HP, 180 s cooldown in the draft). The demo has no party yet, so Revive is cast before the danger: a
// guardian light on the hero and the allies round them; whoever takes a lethal hit while they carry it rises
// at once with half their HP and is untouchable a moment; the light is spent. Rules: core/game-simulation.js
// (the buff's `revive`, reviveFrom in damagePlayer and damageAlly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';

const C = data.skills.combat;
const fixture = (ids) => {
  const ch = createCharacter(data, { kit: 'staff' });
  ch.stats = { STR: 5, DEX: 5, INT: 40, AGI: 10, VIT: 40, LUK: 5 };
  for (const id of ids) ch.skills[id] = 1;
  ch.slots = ch.slots.map((_, i) => ({ skill: ids[i] || null, mods: [] }));
  const g = new Game(data, { seed: 5, character: ch });
  g.player.x = 0; g.player.z = 0;
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  g.monsters = []; g.derived.dodgeChancePct = 0; g.derived.perks = null; g.drainEvents();
  return { g };
};

test('the priest\'s skills are the job\'s, and Revive is learned at the workbench from real drops', () => {
  for (const id of ['revive', 'blessing', 'holy_bell', 'light_chain']) assert.equal(C[id].job, 'priest', id);
  const drops = new Set(Object.values(data.monsters.monsters).flatMap((m) => m.drops.map((d) => d.item)));
  const r = data.recipes.recipes.learn_revive;
  assert.ok(r && r.result === 'revive');
  for (const item of Object.keys(r.cost)) if (item !== 'gold') assert.ok(drops.has(item), item);
  assert.ok(C.revive.cooldown >= 120 && C.revive.revive.hp === 0.5, 'a long cooldown, half HP (the draft)');
});

test('Revive: a lethal hit while the light is on leaves the hero at half HP and untouchable a moment; the light is spent', () => {
  const { g } = fixture(['revive']);
  const p = g.player, s = g.skills[0];
  g.executeSkill(s, { angle: 0, x: 0, z: 0 });
  assert.ok(p.buffs.revive?.revive, 'the guardian light is on');
  g.damagePlayer(p.maxHp * 50, null, { unblockable: true });
  assert.equal(p.dead, false, 'risen');
  assert.ok(Math.abs(p.hp - Math.round(p.maxHp * C.revive.revive.hp)) <= 1, `half HP (${p.hp}/${p.maxHp})`);
  assert.ok(!p.buffs.revive, 'the light is spent');
  assert.ok(g.drainEvents().some((e) => e.type === 'revive' && e.id === 'player'));
  assert.equal(g.damagePlayer(p.maxHp * 50, null, { unblockable: true }), 0, 'untouchable a moment');
  g.time += C.revive.revive.invulnerable + 0.01;
  g.damagePlayer(p.maxHp * 50, null, { unblockable: true });
  assert.equal(p.dead, true, 'no light, no second chance');
});

test('Revive covers the allies round the hero too, and a light that runs out saves no one', () => {
  const { g } = fixture(['revive', 'spirit_wolf']);
  g.executeSkill(g.skills[1], { angle: 0, x: 0, z: 0 });
  const a = g.allies[0]; a.x = 2; a.z = 0;
  g.executeSkill(g.skills[0], { angle: 0, x: 0, z: 0 });
  g.damageAlly(a, a.maxHp * 50, null);
  assert.ok(a.hp > 0 && a.life > 0, 'the summon rose');
  const { g: g2 } = fixture(['revive']);
  g2.executeSkill(g2.skills[0], { angle: 0, x: 0, z: 0 });
  g2.player.buffs.revive.t = 0; delete g2.player.buffs.revive; // the light ran out
  g2.damagePlayer(g2.player.maxHp * 50, null, { unblockable: true });
  assert.equal(g2.player.dead, true);
});
