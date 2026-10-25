// Spell shield (owner, 2026-10-25): a white pool over HP from INT and gear. Damage takes it before HP,
// it never heals, and it refills on its own after a few seconds without being hit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, LearnedGame } from './helpers.js';
import { createCharacter, derive } from '../../src/core/character.js';
import { effectiveHp } from '../../src/core/power.js';

const rules = data.progression.combat.spellShield;
const hero = (shield) => {
  const g = new LearnedGame(data, { seed: 5 });
  g.ch.stats.INT = 3; g.refresh(true);
  g.player.maxShield = shield; g.player.shield = shield;
  return g;
};
const runFor = (g, seconds) => { for (let t = 0; t < seconds; t += 0.05) g.updatePlayer(0.05); };

test('INT and gear give the shield; percentages multiply it; it adds to effective HP', () => {
  const per = data.progression.character.perStat.INT.maxShield;
  assert.ok(per > 0 && per < data.progression.character.base.hpPerVit / 2, 'INT gives a little; the bulk comes from gear');
  const a = createCharacter(data), b = createCharacter(data);
  b.stats.INT += 10;
  assert.equal(derive(b, data).maxShield - derive(a, data).maxShield, per * 10);
  for (const id of ['shield_flat', 'shield_pct']) assert.ok(data.items.gearOptions[id], id);
  assert.equal(data.items.gearOptions.shield_flat.stat, 'maxShield');
  assert.equal(data.items.gearOptions.shield_pct.stat, 'maxShieldPct');
  const pools = Object.values(data.items.gearBases).filter((x) => x.optionPool?.includes('shield_flat'));
  assert.ok(['armor', 'helm', 'charm', 'offhand'].every((slot) => pools.some((x) => x.slot === slot)), 'chest, helm, charm and shield can roll it');
  const d = derive(a, data), plain = effectiveHp({ ...d, maxShield: 0 }, data);
  assert.ok(effectiveHp(d, data) > plain, 'the power score counts the shield');
});

test('a hit takes the shield before HP, and the overflow reaches HP', () => {
  const g = hero(100), p = g.player, hp = p.hp;
  g.drainEvents();
  const first = g.damagePlayer(60, null);
  assert.equal(first, 0, 'all of it went into the shield');
  assert.equal(p.hp, hp);
  assert.ok(p.shield > 0 && p.shield < 100);
  const left = p.shield;
  g.damagePlayer(500, null);
  assert.equal(p.shield, 0);
  assert.ok(p.hp < hp, 'the rest hits HP');
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'playerHit' && e.shielded > 0));
  assert.equal(ev.filter((e) => e.type === 'shieldBreak').length, 1, 'one break event');
  assert.ok(left > 0);
});

test('a skill barrier absorbs first, then the shield', () => {
  const g = hero(100), p = g.player;
  p.barrier = 50; p.barrierT = 5;
  g.damagePlayer(500, null);
  assert.equal(p.barrier, 0);
  assert.equal(p.shield, 0);
});

test('the shield waits rechargeDelay without damage, then refills at its rate; healing never fills it', () => {
  const g = hero(200), p = g.player;
  g.damagePlayer(150, null);
  const low = p.shield;
  g.healPlayer(1000, true);
  assert.equal(p.shield, low, 'heals do not touch the shield');
  runFor(g, rules.rechargeDelay - 0.2);
  assert.equal(p.shield, low, 'no recharge before the delay');
  runFor(g, 1);
  const gain = p.shield - low;
  assert.ok(gain > 0 && gain <= 200 * rules.rechargePctPerSecond / 100 + 1, `refills about ${rules.rechargePctPerSecond}%/s: ${gain}`);
  g.damagePlayer(1, null);
  const hit = p.shield;
  runFor(g, rules.rechargeDelay - 0.2);
  assert.equal(p.shield, hit, 'a new hit restarts the wait');
  runFor(g, 100 / rules.rechargePctPerSecond + 1);
  assert.equal(p.shield, p.maxShield, 'it fills to the maximum and stops');
});

test('poison ticks drain the shield first and still never kill', () => {
  const g = hero(30), p = g.player, hp = p.hp;
  p.statuses.poison = { dps: 120, t: 0.5, acc: 0 }; // 60 damage against a 30 shield
  runFor(g, 0.5);
  assert.equal(p.shield, 0);
  assert.ok(p.hp < hp && p.hp >= 1);
});

test('respawn and level up refill it; new gear shield starts empty and recharges', () => {
  const g = hero(0), p = g.player;
  g.ch.stats.INT = 50; g.refresh();
  assert.ok(p.maxShield > 0);
  assert.equal(p.shield, 0, 'a newly gained shield starts empty');
  g.damagePlayer(1e9, null);
  assert.ok(p.dead);
  runFor(g, 5);
  assert.ok(!p.dead);
  assert.equal(p.shield, p.maxShield, 'respawn refills it');
  p.shield = 1; g.onLevelUp();
  assert.equal(p.shield, p.maxShield, 'a level up refills it');
});
