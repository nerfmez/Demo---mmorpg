import { LearnedGame as Game, legacyData as data } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Online guests mirror the room host's monsters: no local AI, no local respawns.
test('remote monsters skip local AI and guests do not respawn', () => {
  const g = new Game(data, { seed: 31 });
  const m = g.monsters.find(x => !x.dead);
  assert.ok(m);
  Object.assign(m, { remote: true, aggro: true });
  const x = m.x, z = m.z, state = m.state;
  g.player.x = m.x + 1.5; g.player.z = m.z; // well inside attack range
  for (let i = 0; i < 120; i++) g.update(1 / 30);
  assert.equal(m.x, x); assert.equal(m.z, z); assert.equal(m.state, state);

  g.mirrorMonsters = true;
  g.monsters = [];
  for (const sp of g.spawnPoints) { sp.entity = null; sp.respawnAt = 0; }
  g.player.x += 500;
  g.update(1 / 30);
  assert.equal(g.monsters.length, 0);
  g.mirrorMonsters = false;
  g.update(1 / 30);
  assert.ok(g.monsters.length > 0);
});
