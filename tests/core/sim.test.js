// Simulation rules from the design doc, checked headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyData as data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { softTarget } from '../../src/core/targeting.js';
import { distToPolyline } from '../../src/core/math.js';

const step = (g, seconds) => {
  for (let i = 0; i < seconds * 60; i++) g.update(1 / 60);
};

test('soft target: automatic mode prioritizes distance while explicit aim remains directional', () => {
  const p = { x: 0, z: 0, targetId: null };
  const near = { id: 1, x: -2, z: 0, r: 0.5 };
  const aimed = { id: 2, x: 0, z: 5, r: 0.5 };
  assert.equal(softTarget(p, [near, aimed], 0, 1), null, 'out of range: no lock');
  assert.equal(softTarget(p, [near, aimed], 0, 6, { preferNearest: true }), 1, 'automatic targeting ignores facing and chooses the nearest enemy');
  p.targetId = 1;
  assert.equal(softTarget(p, [near, aimed], 0, 6), 2, 'explicit aim can override the nearer enemy');
  aimed.z = 20;
  p.targetId = 2;
  assert.equal(softTarget(p, [near, aimed], 0, 6), 1, 'manual target leaving range re-acquires an in-range enemy');
});

test('quick attack snaps to the nearest enemy in that skill range even while moving the other way', () => {
  const g = new Game(data, { seed: 41 });
  const [near, far] = g.monsters.filter((m) => !m.boss).slice(0, 2);
  const p = g.player;
  p.x = 0; p.z = 0; p.facing = Math.PI;
  near.x = 1.25; near.z = 0; near.r = 0.35;
  far.x = 1.85; far.z = 0; far.r = 0.35;
  g.setMove(-1, 0);
  g.setAimAngle(Math.PI, false);
  p.targetId = far.id;
  assert.ok(g.castSlot(0));
  assert.equal(p.targetId, near.id, 'tap/quick cast reselects nearest valid target');
  const auto = g.drainEvents().find((e) => e.type === 'castStart');
  assert.ok(Math.abs(auto.angle - Math.PI / 2) < 0.01, 'cast turns toward the nearest target, not movement/facing');

  p.cast = null; p.cooldowns[0] = 0; p.mp = p.maxMp;
  p.targetId = far.id;
  g.setAimAngle(Math.PI / 2, true);
  assert.ok(g.castSlot(0));
  assert.equal(p.targetId, far.id, 'explicit manual aim keeps the manually selected target');
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

test('every road is walkable, bridges included, and the river retains its water mask', () => {
  const g = new Game(data, { seed: 1 });
  for (const road of g.world.roads) {
    const pts = road.points;
    for (let i = 0; i < pts.length - 1; i++)
      for (let t = 0; t <= 1; t += 0.05) {
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
        const z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
        const b = data.world.bounds;
        if (x < b.minX + 1 || x > b.maxX - 1 || z < b.minZ + 1 || z > b.maxZ - 1) continue;
        assert.ok(!g.world.isWater(x, z, 0.13), `water on ${road.id} at ${x.toFixed(1)},${z.toFixed(1)}`);
        assert.ok(g.world.isFree(x, z, 0.45), `blocked ${road.id} at ${x.toFixed(1)},${z.toFixed(1)}`);
      }
  }
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
  const rock = g.world.circles.find((c) => c.type === 'rock' && !g.isSafe(c.x, c.z) && g.world.zoneAt(c.x, c.z).id === 'meadow' && g.world.isFree(c.x - c.r - 3, c.z, 1) && g.world.isFree(c.x - c.r - 1.5, c.z, 1));
  assert.ok(rock, 'a free-standing rock in the meadow');
  boar.x = rock.x - rock.r - boar.r - 2;
  boar.z = rock.z;
  boar.aggro = true;
  boar.state = 'act';
  boar.stateT = 0;
  boar.windup = { name: 'charge', total: 0.7, angle: Math.PI / 2 };
  boar.charge = { t: 0, dur: 1, speed: 13, angle: Math.PI / 2, hit: new Set(), dmg: 1 };
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
  g.ch.slots[g.ch.slots.findIndex((s) => s.skill === 'firebolt')].mods.push(999);
  g.refresh();
  const spot = g.freeSpotNear(-70, 10);
  g.player.x = spot.x;
  g.player.z = spot.z;
  g.useMovement();
  step(g, 0.5);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'trigger' && e.skill === 'firebolt'));
});

test('the boss must be defeated for the demo climax and gives rare materials', () => {
  const g = new Game(data, { seed: 5 });
  const boss = g.monsters.find((m) => m.boss && m.spawn.final);
  assert.equal(boss.type, 'horned_warden');
  g.hitMonster(boss, 1e6);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'bossDefeated' && e.final && e.first));
  assert.equal(g.ch.bossKills, 1);
  const items = g.drops.map((d) => d.item);
  assert.ok(items.includes('warden_horn') && items.includes('ancient_core'));
});

test('a long headless session stays stable and progresses', () => {
  const g = new Game(data, { seed: 6 });
  const p = g.player;
  p.x = -98;
  p.z = 3; // at the settlement gate
  for (let i = 0; i < 60 * 120; i++) {
    const t = g.target;
    if (t) {
      // close in to melee range, then use every skill (the player never auto-walks)
      if (Math.hypot(t.x - p.x, t.z - p.z) > 2.5) g.setMove(t.x - p.x, t.z - p.z);
      else g.setMove(0, 0);
      g.setAimPoint(t.x, t.z);
      for (let k = 0; k < 3; k++) g.castSlot(k);
    } else {
      const near = g.monsters.filter((m) => !m.dead && !m.boss && Math.abs(m.x - p.x) < 25).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (near && p.x > -95) g.setMove(near.x - p.x, near.z - p.z);
      else g.setMove(1, 0);
    }
    g.update(1 / 60);
    g.drainEvents();
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.hp));
  }
  assert.ok(g.stats.kills >= 5, `kills ${g.stats.kills}`);
  assert.ok(g.ch.level >= 2);
});
