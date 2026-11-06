import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { updateMonster } from '../../src/core/ai.js';

// Isolate AI/contact rules in an open arena. Real terrain/obstacle movement and
// input are covered by the harbor and browser suites, not these geometry cases.
function arena(type) {
  const g = new Game(data, { seed: 9 });
  const m = g.monsters.find(m => m.type === type);
  if (m.def.normal) g.makeElite(m); // a kit monster's whole kit (a normal one uses only its `normal` attack)
  g.monsters = [m];
  g.isSafe = () => false;
  g.moveEntity = (u, dx, dz) => { u.x += dx; u.z += dz; return {}; };
  Object.assign(m, { x: 0, z: 0, homeX: 0, homeZ: 0, facing: 0, state: 'chase', stateT: 0, aggro: true, damage: 1 });
  for (const key in m.cd) m.cd[key] = 0;
  Object.assign(g.player, { x: 0, z: m.r + g.player.r + .5 });
  const step = (seconds) => {
    for (let t = 0; t < seconds - 1e-8; t += .01) { g.time += .01; updateMonster(g, m, .01); }
  };
  const until = (condition, seconds = 20) => {
    for (let t = 0; t < seconds && !condition(); t += .01) step(.01);
    assert.ok(condition(), `${type}: state ${m.state} did not reach expected phase`);
  };
  return { g, m, step, until };
}

test('a late side-step or backing outside reach dodges the locked frontal pinch', () => {
  for (const escape of ['side', 'range']) {
    const { g, m, step, until } = arena('reef_crab');
    const hp = g.player.hp;
    step(.01);
    step(m.windup.total * .7);
    if (escape === 'side') Object.assign(g.player, { x: 1.7, z: 0 });
    else g.player.z = m.r + g.player.r + m.def.attacks.pinch.range + .1;
    until(() => m.state === 'recover');
    assert.equal(g.player.hp, hp, escape + ': locked strike misses');
  }
});

// the hermit crab is a kit monster now (claw guard, anemones, shell shed: monster-kits.test.js)

test('reef crab sweep: it scuttles side to side in front of its prey; a step aside is caught, a step back is not', () => {
  for (const [escape, expect] of [['none', 2], ['side', 1], ['back', 0]]) {
    const c = arena('reef_crab');
    c.m.cd.pinch = 99;
    Object.assign(c.g.player, { x: 0, z: c.m.r + c.g.player.r + 1.2 });
    const hits = [];
    c.g.damageUnit = (u, amount) => hits.push(amount);
    c.step(.01);
    assert.equal(c.m.windup?.name, 'sidestep', 'close, its pinch cooling: the sweep');
    c.until(() => c.m.state === 'act');
    assert.equal(hits.length, 0, 'nothing during the wind-up');
    if (escape === 'side') { c.step(.05); c.g.player.x = 1.8; }
    if (escape === 'back') c.g.player.z = c.m.def.attacks.sidestep.range + c.g.player.r + .3;
    c.until(() => c.m.state === 'recover');
    assert.equal(hits.length, expect, `${escape}: ${hits.length} clips`);
    assert.ok(Math.hypot(c.m.x, c.m.z) < 1e-6, 'it ends back where it started');
  }
});

test('reef crab bubble mines hang where it blew them and burst only on touch, once', () => {
  const c = arena('reef_crab');
  c.m.cd.sidestep = 99;
  const atk = c.m.def.attacks.bubbles;
  Object.assign(c.g.player, { x: 0, z: c.m.r + c.g.player.r + 4 });
  const hits = [];
  c.g.damageUnit = (u, amount) => hits.push(amount);
  const tick = (s) => { for (let t = 0; t < s - 1e-8; t += .01) { c.g.time += .01; c.g.updateAreas(.01); updateMonster(c.g, c.m, .01); } };
  tick(.01);
  assert.equal(c.m.windup?.name, 'bubbles');
  c.g.player.x = 6; // out of the way while they are blown
  c.until(() => c.g.areas.some((a) => a.kind === 'bubble_mine'));
  const mines = c.g.areas.filter((a) => a.kind === 'bubble_mine');
  assert.equal(mines.length, atk.count);
  c.m.cd.pinch = c.m.cd.bubbles = 99; c.m.state = 'idle'; c.m.aggro = false;
  tick(atk.drift + 1);
  assert.equal(hits.length, 0, 'they wait in the air');
  Object.assign(c.g.player, { x: mines[1].x, z: mines[1].z });
  tick(.05);
  assert.equal(hits.length, 1, 'walking into one bursts it');
  tick(.5);
  assert.equal(hits.length, 1, 'once');
  assert.equal(c.g.areas.filter((a) => a.kind === 'bubble_mine').length, atk.count - 1, 'the rest still hang');
  c.g.player.x = 30;
  tick(atk.life);
  assert.equal(c.g.areas.filter((a) => a.kind === 'bubble_mine').length, 0, 'and float off in the end');
});
