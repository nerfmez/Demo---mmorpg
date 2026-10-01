// Combat feel rules: 1-2-3 melee combo with a finisher, and short flinches that never cancel a wind-up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyData as data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { computeSkill } from '../../src/core/skills.js';

test('starter Firebolt travels at the lower base speed and speed bonuses preserve reach', () => {
  const g = new Game(data, { seed: 31 });
  // Isolate free flight from terrain and targets.
  g.world = { surfaceY: () => 0, isFree: () => true };
  g.monsters = [];
  const slot = g.ch.slots.findIndex(s => s.skill === 'firebolt');
  const base = computeSkill(g.ch, data, { ...g.derived, projectileSpeedPct: 0 }, slot);
  const faster = computeSkill(g.ch, data, { ...g.derived, projectileSpeedPct: 100 }, slot);
  assert.equal(base.speed, 9);
  assert.equal(faster.speed, 18);
  for (const s of [base, faster]) {
    g.executeSkill(s, { angle: Math.PI / 2, x: g.player.x, z: g.player.z });
  }
  const [plain, boosted] = g.projectiles;
  const startX = plain.x;
  g.updateProjectiles(0.25);
  assert.equal(g.projectiles.length, 2);
  assert.ok(Math.abs(plain.x - startX - 2.25) < 1e-8);
  assert.ok(Math.abs(boosted.x - startX - 4.5) < 1e-8);
  assert.equal(boosted.range, plain.range);
  assert.equal(boosted.radius, plain.radius);
});

const setup = (seed) => {
  const g = new Game(data, { seed });
  const m = g.monsters.find((q) => q.type === 'crag_golem'); // tanky: survives three swings
  const s = g.freeSpotNear(m.x - 1.8, m.z);
  g.player.x = s.x;
  g.player.z = s.z;
  m.x = s.x + 1.8;
  m.z = s.z;
  g.derived.critChance = 0;
  return { g, m };
};
const swing = (g, m) => {
  const hp = m.hp;
  g.executeSkill(g.skills[0], { angle: Math.atan2(m.x - g.player.x, m.z - g.player.z), x: g.player.x, z: g.player.z });
  g.time += 0.4;
  return hp - m.hp;
};

test('the third swing in a row is a finisher that hits harder and knocks back', () => {
  const { g, m } = setup(21);
  m.def = { ...m.def, defense: 0 };
  const a = swing(g, m);
  const b = swing(g, m);
  const x0 = m.x;
  const c = swing(g, m);
  assert.ok(c > a * 1.3 && c > b * 1.3, `finisher ${c} vs ${a}, ${b}`);
  assert.ok(m.x > x0, 'knocked away from the player');
  const ev = g.drainEvents().filter((e) => e.type === 'slash');
  assert.deepEqual(ev.map((e) => e.finisher), [false, false, true]);
  g.time += 2; // combo resets after a pause
  swing(g, m);
  assert.equal(g.player.comboStep, 0);
});

test('castStart announces the combo step the swing will land as', () => {
  const { g, m } = setup(23);
  const steps = [];
  for (let i = 0; i < 4; i++) {
    g.player.cooldowns[0] = 0;
    g.player.mp = g.player.maxMp;
    assert.ok(g.castSlot(0, { x: m.x, z: m.z }));
    steps.push(g.drainEvents().find((e) => e.type === 'castStart').step);
    for (let k = 0; k < 12; k++) g.update(0.05);
    assert.equal(g.player.comboStep, steps[i], 'predicted step ' + i);
  }
  assert.deepEqual(steps, [0, 1, 2, 0]);
  // a swing announced just inside the combo window keeps its step even if it lands a frame late
  const window = data.progression.combat?.comboWindow ?? 1.1;
  g.player.cooldowns[0] = 0;
  g.player.lastSwingT = g.time - window + g.skills[0].castTime + 0.01;
  assert.ok(g.castSlot(0, { x: m.x, z: m.z }));
  const late = g.drainEvents().find((e) => e.type === 'castStart').step;
  assert.equal(late, 1);
  for (let k = 0; k < 12; k++) g.update(0.05);
  assert.equal(g.player.comboStep, late);
});

test('hits make regular monsters flinch, but never cancel a started wind-up; bosses do not flinch', () => {
  const { g, m } = setup(22);
  m.aggro = true;
  m.state = 'chase';
  g.hitMonster(m, 5);
  assert.ok(m.staggerT > 0);
  const x0 = m.x;
  g.update(1 / 60);
  assert.equal(m.x, x0, 'stands still while flinching');
  m.state = 'windup';
  m.stateT = 0;
  m.windup = { name: 'pound', total: 1, angle: 0 };
  g.hitMonster(m, 5);
  g.update(0.05);
  assert.equal(m.state, 'windup', 'wind-up keeps going');
  const boss = g.monsters.find((q) => q.boss);
  g.hitMonster(boss, 5);
  assert.ok(!(boss.staggerT > 0));
});
