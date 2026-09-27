// Simulation rules from the design doc, checked headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { softTarget } from '../../src/core/targeting.js';
import { distToPolyline } from '../../src/core/math.js';

const step = (g, seconds) => {
  for (let i = 0; i < seconds * 60; i++) g.update(1 / 60);
};

test('soft target: none out of range, auto-lock in range, switch by aim, release when out', () => {
  const p = { x: 0, z: 0, targetId: null };
  const a = { id: 1, x: 0, z: 5, r: 0.5 }; // straight ahead (+Z, angle 0)
  const b = { id: 2, x: 5, z: 0, r: 0.5 }; // to the right (+X, angle PI/2)
  assert.equal(softTarget(p, [a, b], 0, 3), null, 'out of range: no lock');
  p.targetId = softTarget(p, [a, b], 0, 6);
  assert.equal(p.targetId, 1, 'locks the enemy you aim at');
  p.targetId = softTarget(p, [a, b], 0.3, 6);
  assert.equal(p.targetId, 1, 'small aim change keeps the lock');
  p.targetId = softTarget(p, [a, b], Math.PI / 2, 6);
  assert.equal(p.targetId, 2, 'aiming at another enemy switches');
  b.x = 20;
  p.targetId = softTarget(p, [a, b], Math.PI / 2, 6);
  assert.equal(p.targetId, 1, 'target left range: released (re-acquires the one in range)');
});

test('the player never walks toward the target by itself', () => {
  const g = new Game(data, { seed: 1 });
  const p = g.player;
  const m = g.monsters.find((q) => !q.boss);
  p.x = m.x - 5;
  p.z = m.z;
  m.def = { ...m.def, aggroRange: 0 }; // keep it still
  const x0 = p.x;
  g.setMove(0, 0);
  step(g, 1);
  assert.ok(g.player.targetId !== null);
  assert.ok(Math.abs(p.x - x0) < 0.01);
});

test('the road from the settlement to the ruins is walkable, including the bridge', () => {
  const g = new Game(data, { seed: 1 });
  const pts = data.world.path.points;
  for (let i = 0; i < pts.length - 1; i++)
    for (let t = 0; t <= 1; t += 0.05) {
      const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
      const z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
      if (x < data.world.bounds.minX + 1 || x > data.world.bounds.maxX - 1) continue;
      assert.ok(!g.world.isWater(x, z, 0.13), `water on road at ${x.toFixed(1)},${z.toFixed(1)}`);
      assert.ok(g.world.isFree(x, z, 0.45), `blocked road at ${x.toFixed(1)},${z.toFixed(1)}`);
    }
  // and the river really blocks away from the bridge
  const rv = data.world.river.points;
  assert.ok(g.world.isWater(rv[1][0], rv[1][1]));
  assert.ok(distToPolyline(rv[1][0], rv[1][1], rv) < 0.01);
});

test('killing a monster drops its materials and gives both exp types', () => {
  const g = new Game(data, { seed: 2 });
  const m = g.monsters.find((q) => q.type === 'tusk_boar');
  const exp0 = g.ch.exp;
  g.hitMonster(m, 99999);
  assert.ok(m.dead);
  assert.ok(g.drops.length > 0);
  assert.ok(g.ch.exp > exp0 || g.ch.level > 1);
  assert.ok(g.ch.jobExp > 0 || g.ch.jobLevel > 1);
  // walk onto the loot
  const d = g.drops[0];
  g.player.x = d.x;
  g.player.z = d.z;
  step(g, 1);
  assert.ok(Object.keys(g.ch.materials).length > 0 || g.ch.gold > data.progression.start.gold);
});

test('roll gives invulnerability; a charging boar that hits a rock is stunned', () => {
  const g = new Game(data, { seed: 3 });
  g.ch.movement = 'roll';
  g.refresh();
  g.player.movement.charges = 1;
  g.useMovement();
  assert.equal(g.damagePlayer(50, null), 0);
  const boar = g.monsters.find((q) => q.type === 'tusk_boar');
  const rock = g.world.circles.find((c) => c.type === 'rock' && !g.isSafe(c.x, c.z) && Math.abs(c.z) < 30 && g.world.isFree(c.x - c.r - 3, c.z, 1));
  boar.x = rock.x - rock.r - boar.r - 2;
  boar.z = rock.z;
  boar.aggro = true;
  boar.state = 'act';
  boar.stateT = 0;
  boar.windup = { name: 'charge', total: 0.7, angle: Math.PI / 2 };
  boar.charge = { t: 0, dur: 1, speed: 13, angle: Math.PI / 2, hit: true, dmg: 1 };
  g.player.x = boar.x - 20; // far away
  let stunned = false;
  for (let i = 0; i < 60 && !stunned; i++) {
    g.update(1 / 60);
    stunned = g.drainEvents().some((e) => e.type === 'stunned');
  }
  assert.ok(stunned);
});

test('cast on dodge fires the linked spell when a movement skill ends', () => {
  const g = new Game(data, { seed: 4 });
  g.ch.stats.AGI = 10;
  g.ch.mods.push({ uid: 999, id: 'cast_on_dodge', level: 1 });
  g.ch.slots[1].mods.push(999);
  g.refresh();
  g.player.x = -50;
  g.player.z = 5;
  g.useMovement();
  step(g, 0.5);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'trigger' && e.skill === 'firebolt'));
});

test('the boss must be defeated for the demo climax and gives rare materials', () => {
  const g = new Game(data, { seed: 5 });
  const boss = g.monsters.find((m) => m.boss);
  g.hitMonster(boss, 1e6);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'bossDefeated'));
  const items = g.drops.map((d) => d.item);
  assert.ok(items.includes('warden_horn') && items.includes('ancient_core'));
});

test('a long headless session stays stable and progresses', () => {
  const g = new Game(data, { seed: 6 });
  const p = g.player;
  for (let i = 0; i < 60 * 120; i++) {
    const t = g.target;
    if (t) {
      g.setMove(0, 0);
      g.setAimPoint(t.x, t.z);
      g.castSlot(1);
      g.castSlot(0);
      if (p.hp < p.maxHp * 0.5) g.castSlot(2);
    } else {
      const near = g.monsters.filter((m) => !m.dead && !m.boss && Math.abs(m.x - p.x) < 25).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (near && p.x > -66) g.setMove(near.x - p.x, near.z - p.z);
      else g.setMove(1, 0);
    }
    g.update(1 / 60);
    g.drainEvents();
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.hp));
  }
  assert.ok(g.stats.kills >= 5, `kills ${g.stats.kills}`);
  assert.ok(g.ch.level >= 2);
});
