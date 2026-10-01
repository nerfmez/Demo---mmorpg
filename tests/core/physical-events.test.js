import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyData as data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { computeSkill } from '../../src/core/skills.js';

function arena(id) {
  const g = new Game(data, { seed: 43 });
  const m = g.monsters.find(m => m.type === 'crag_golem'); g.monsters = [m];
  Object.assign(g.player, { x: 0, z: 0 }); Object.assign(m, { x: 3, z: 0 });
  g.world = { surfaceY: () => 0, isFree: () => true };
  g.ch.skills[id] = 1; g.ch.slots[1] = { skill: id, mods: [] };
  g.drainEvents();
  return { g, m, s: computeSkill(g.ch, data, g.derived, 1) };
}

test('arrow contact retains direction metadata and never repeats its damage', () => {
  const { g, m, s } = arena('hunter_shot'); const hp = m.hp;
  g.executeSkill(s, { angle: Math.PI / 2, x: 0, z: 0 });
  g.updateProjectiles(.1); assert(m.hp < hp);
  const ev = g.drainEvents(), impact = ev.find(e => e.type === 'impact');
  assert.equal(impact.kind, 'hunter_shot'); assert.equal(impact.vx, s.speed); assert(Math.abs(impact.vz) < 1e-6);
  assert.equal(ev.filter(e => e.type === 'hit' && e.id === m.id).length, 1);
  const after = m.hp; g.updateProjectiles(.2); assert.equal(m.hp, after);
});

test('earth damage waits for its delay, happens once and respects area misses', () => {
  for (const miss of [false, true]) {
    const { g, m, s } = arena('stone_burst'); const hp = m.hp;
    g.executeSkill(s, { x: m.x, z: m.z, angle: 0 });
    g.updateAreas(s.delay - .01); assert.equal(m.hp, hp);
    if (miss) m.x += s.radius + m.r + .1;
    g.updateAreas(.02); const after = m.hp; g.updateAreas(.2); assert.equal(m.hp, after);
    const hits = g.drainEvents().filter(e => e.type === 'hit' && e.id === m.id);
    assert.equal(hits.length, miss ? 0 : 1);
    if (!miss) assert.equal(hits[0].skill, 'stone_burst');
  }
});

test('summon bite presentation occurs once at actual contact and uses the wolf origin', () => {
  for (const mode of ['hit', 'miss', 'expired']) {
    const { g, m, s } = arena('spirit_wolf'); g.spawnAllies(s, 0, 0);
    const a = g.allies[0]; Object.assign(a, { x: 2, z: 0, state: 'windup', stateT: 0, targetId: m.id });
    g.drainEvents(); const hp = m.hp;
    g.updateAllies(.24); assert.equal(m.hp, hp);
    if (mode === 'miss') m.x = 20;
    if (mode === 'expired') a.life = 0;
    g.updateAllies(.02); const after = m.hp; g.updateAllies(.2); assert.equal(m.hp, after);
    const ev = g.drainEvents(), strikes = ev.filter(e => e.type === 'allyStrike');
    assert.equal(strikes.length, mode === 'hit' ? 1 : 0);
    if (mode === 'hit') {
      const hit = ev.find(e => e.type === 'hit');
      assert.equal(hit.skill, 'spirit_wolf'); assert.equal(hit.fromX, a.x); assert.equal(hit.fromZ, a.z);
      assert.equal(strikes[0].fromX, a.x); assert.equal(strikes[0].skill, 'spirit_wolf');
    } else assert.equal(m.hp, hp);
  }
});
