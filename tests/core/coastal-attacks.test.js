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

test('coastal contacts stay planted and hit once at the authored contact time', () => {
  for (const type of ['salt_slime', 'shore_gull', 'reef_crab', 'hermit_crab']) {
    const { g, m, step, until } = arena(type);
    const hits = [];
    g.damageUnit = (u, amount) => hits.push({ id: u.id, amount });
    step(.01);
    const origin = [m.x, m.z], atk = m.def.attacks[m.def.primaryAttack];
    assert.equal(m.state, 'windup');
    until(() => m.state === 'act');
    assert.equal(hits.length, 0, type + ': no damage during anticipation');
    step(atk.hitTime - .02);
    assert.equal(hits.length, 0, type + ': no damage before contact');
    step(.03);
    assert.equal(hits.length, 1, type + ': contact lands once');
    until(() => m.state === 'recover');
    assert.equal(hits.length, 1, type + ': follow-through never repeats damage');
    assert.deepEqual([m.x, m.z], origin, type + ': attack never charges forward');
    assert.equal(m.charge, null);
  }
});

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

test('salt slime spits a slow non-poison projectile at a locked aim, never a lunge', () => {
  const { g, m, step, until } = arena('salt_slime');
  g.player.z = m.r + g.player.r + 3;
  step(.01);
  assert.equal(m.windup.name, 'salt_spit');
  step(m.windup.total * .7);
  g.player.x = 3;
  until(() => g.projectiles.length > 0);
  const pr = g.projectiles[0];
  assert.equal(pr.angle, 0, 'aim cannot follow a late dodge');
  assert.equal(pr.element, 'salt');
  assert.equal(pr.poison, null);
  assert.equal(pr.speed, m.def.attacks.salt_spit.speed);
  assert.deepEqual([m.x, m.z], [0, 0]);
  assert.equal(m.charge, null);
});

test('gull pecks then walks away without contact damage, even when its retreat is blocked', () => {
  for (const blocked of [false, true]) {
    const { g, m, step, until } = arena('shore_gull');
    step(.01);
    until(() => m.state === 'retreat');
    const gap = Math.hypot(g.player.x - m.x, g.player.z - m.z), hp = g.player.hp;
    if (blocked) g.moveEntity = () => ({ blockedHard: true });
    step(.5);
    if (!blocked) assert.ok(Math.hypot(g.player.x - m.x, g.player.z - m.z) > gap + 1);
    assert.equal(g.player.hp, hp, 'retreat does not use charge collision damage');
    until(() => m.state === 'recover', 2);
    until(() => m.state === 'chase', 1);
  }
});

test('hermit guards between pinches and has an unguarded vulnerable emergence', () => {
  const { g, m, step, until } = arena('hermit_crab');
  step(.01);
  until(() => m.state === 'shell');
  assert.equal(m.guardAttacks, 0);
  assert.equal(m.shell, true);
  assert.equal(g.hitMonster(m, 10, { dot: true }), 4, 'shell reduces damage');
  until(() => m.state === 'emerge');
  assert.equal(m.shell, false);
  const pos = [m.x, m.z];
  assert.equal(g.hitMonster(m, 10, { dot: true }), 14, 'emergence is a punish window');
  step(.5);
  assert.deepEqual([m.x, m.z], pos);
  assert.equal(m.state, 'emerge');
  until(() => m.state === 'chase');
  assert.equal(g.hitMonster(m, 10, { dot: true }), 10, 'vulnerability ends with emergence');
});

test('leashing during shell clears its damage reduction and temporary attack state', () => {
  const { g, m, step, until } = arena('hermit_crab');
  step(.01); until(() => m.state === 'shell');
  m.homeX = -100;
  step(.01);
  assert.equal(m.state, 'return');
  assert.equal(m.shell, false);
  assert.equal(g.hitMonster(m, 10, { dot: true }), 10);
});

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
