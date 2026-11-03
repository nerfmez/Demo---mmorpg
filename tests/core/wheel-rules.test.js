// The wheel Job Tree's situational stats as rules on a real fight (core/wheel-rules.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';

const arena = () => {
  const g = new Game(data, { seed: 7 });
  const m0 = g.monsters[0];
  const mk = (id, x, z, extra = {}) => ({ ...m0, id, x, z, hp: 1e6, maxHp: 1e6, defense: 0, boss: false, dead: false, state: 'idle', stateT: 0, statuses: {}, buffs: {}, cd: {}, shell: false, ...extra });
  g.monsters = [];
  Object.assign(g.derived, { critChance: 0, perks: null, dodgeChancePct: 0, blockChance: 0 });
  g.player.x = 0; g.player.z = 0; g.player.hp = g.player.maxHp = 1e6; g.player.shield = g.player.maxShield = 0;
  return { g, mk };
};
const hit = (g, m, opts = {}) => { const before = m.hp; g.hitMonster(m, 1000, { element: 'physical', ...opts }); return before - m.hp; };

test('single-target damage counts on a lone monster or a boss, pack damage in a crowd, per-target by its size', () => {
  const { g, mk } = arena();
  const lone = mk('lone', 10, 0), base = hit(g, lone);
  g.derived.singleDamagePct = 30;
  assert.equal(hit(g, lone), Math.round(base * 1.3));
  const a = mk('a', 30, 0), b = mk('b', 31, 0), c = mk('c', 30, 1);
  g.monsters = [lone, a, b, c];
  assert.equal(hit(g, a), base, 'a monster in a crowd is not a lone target');
  const boss = mk('boss', 31.5, 0.5, { boss: true }); g.monsters.push(boss);
  assert.equal(hit(g, boss), Math.round(base * 1.3), 'a boss always is');
  g.derived.singleDamagePct = 0; g.derived.packDamagePct = 20;
  assert.equal(hit(g, lone), base);
  assert.equal(hit(g, a), Math.round(base * 1.2), 'two or more others round it: a pack');
  g.derived.packDamagePct = 0; g.derived.perTargetDamagePct = 6; g.derived.perTargetCap = 15;
  g.monsters = [lone, a, b];
  assert.equal(hit(g, a), Math.round(base * 1.12), 'itself and one other: +12%');
  g.monsters = [lone, a, b, c, boss];
  assert.equal(hit(g, a), Math.round(base * 1.15), 'capped');
  assert.equal(hit(g, a, { byAlly: true }), base, 'an ally\'s hit takes none of the hero\'s situational damage');
});

test('team damage marks what the hero hits for the allies; the mark runs out', () => {
  const { g, mk } = arena();
  const m = mk('m', 5, 0); g.monsters = [m];
  const plain = hit(g, m, { byAlly: true });
  g.derived.teamDamagePct = 25;
  hit(g, m);
  assert.ok(m.statuses.mark);
  assert.equal(hit(g, m, { byAlly: true }), Math.round(plain * 1.25));
  g.tickStatuses(m, data.progression.combat.wheel.markTime + 0.1);
  assert.equal(m.statuses.mark, undefined);
  assert.equal(hit(g, m, { byAlly: true }), plain);
});

test('the hero takes less with selfTakenPct (capped); allies near the hero take less with teamTakenPct', () => {
  const { g } = arena();
  const foe = { kind: 'monster', id: 9, type: 'tusk_boar', def: data.monsters.monsters.tusk_boar, x: 3, z: 0, statuses: {}, buffs: {}, dead: false };
  const base = g.damagePlayer(1000, foe, { attack: 'bite' });
  g.derived.selfTakenPct = 30;
  assert.ok(Math.abs(g.damagePlayer(1000, foe, { attack: 'bite' }) - base * 0.7) <= 1);
  g.derived.selfTakenPct = 500;
  assert.ok(Math.abs(g.damagePlayer(1000, foe, { attack: 'bite' }) - base * (1 - data.progression.character.caps.selfTakenPct / 100)) <= 1);
  const ally = { kind: 'ally', id: 'al', x: 2, z: 0, hp: 1e6, maxHp: 1e6, buffs: {}, dead: false, life: 99 };
  const near = g.damageAlly(ally, 1000, foe);
  g.derived.teamTakenPct = 20;
  assert.ok(Math.abs(g.damageAlly(ally, 1000, foe) - near * 0.8) <= 1);
  ally.x = 40;
  assert.equal(g.damageAlly(ally, 1000, foe), near, 'too far from the hero');
});
