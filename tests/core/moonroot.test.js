// Moonroot Grove: the strip north of Azure Coast and east of the Frontier's north (levels 6-10).
// Three monsters with their own readable patterns, their parts and the Moonroot accessories.
// Attack safety: no damage before the authored time, never twice, misses outside the marked shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createWorld } from '../../src/core/world.js';
import { updateMonster } from '../../src/core/ai.js';

const GROVE = 'moonroot-grove-v1', AZURE = 'azure-harbor-v1', FRONTIER = 'frontier-wilds-v1';
const NEW = ['fern_ear_hare', 'mirrorwing_moth', 'rootdigger_mole'];
const ACCESSORIES = ['fernstep_charm', 'mirrorwing_pendant', 'burrowguard_brooch', 'grove_union_ring'];
const PARTS = ['fern_ear_tuft', 'mirror_scale', 'rootdigger_claw'];
const M = data.monsters.monsters, grove = data.maps[GROVE];
const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, wd]) => [id, createWorld(wd)]));

function arena(type, level = 8) {
  const g = new Game(data, { seed: 9 });
  const m = g.spawnMinion(type, level, 0, 0);
  if (m.def.normal) g.makeElite(m); // a kit monster's whole kit (a normal one uses only its `normal` attack)
  g.monsters = [m];
  g.isSafe = () => false;
  g.moveEntity = (u, dx, dz) => { u.x += dx; u.z += dz; return {}; };
  g.freeSpotNear = (x, z) => ({ x, z });
  Object.assign(m, { x: 0, z: 0, homeX: 0, homeZ: 0, facing: 0, state: 'chase', stateT: 0, aggro: true, damage: 1 });
  for (const key in m.cd) m.cd[key] = 0;
  const hits = [];
  g.damageUnit = (u, amount) => hits.push({ id: u.id, amount, t: g.time });
  const step = (seconds) => { for (let t = 0; t < seconds - 1e-8; t += 0.01) { g.time += 0.01; g.updateAreas(0.01); updateMonster(g, m, 0.01); } };
  const until = (cond, seconds = 20) => { for (let t = 0; t < seconds && !cond(); t += 0.01) step(0.01); assert.ok(cond(), `${type}: stuck in ${m.state}`); };
  const place = (gap, side = 0) => Object.assign(g.player, { x: side, z: m.r + g.player.r + gap });
  return { g, m, hits, step, until, place };
}

test('Moonroot Grove fills the blank strip between Azure Coast and the Frontier north', () => {
  const g = (id, x, z) => [x + data.maps[id].atlas.offset[0], z + data.maps[id].atlas.offset[1]];
  const b = grove.bounds;
  assert.deepEqual(g(GROVE, b.minX, b.maxZ), [-160, -120], 'south-west corner is where Azure and the Frontier meet');
  assert.deepEqual(g(GROVE, b.maxX, b.maxZ), [data.maps[AZURE].bounds.maxX, data.maps[AZURE].bounds.minZ], 'its south edge is all of Azure\'s north edge');
  assert.equal(g(GROVE, b.minX, b.minZ)[1], g(FRONTIER, 0, data.maps[FRONTIER].bounds.minZ)[1], 'its north edge lines up with the Frontier\'s');
  const seams = Object.fromEntries(worlds[GROVE].seams.map((s) => [s.to, s]));
  assert.ok(seams[AZURE] && seams[FRONTIER]);
  // the camp is a safe town with a workbench, shop and waypoint, so the accessories are crafted on the spot
  const w = worlds[GROVE], t = grove.town;
  for (const p of [t.workbench, t.shop, t.respawn, grove.playerSpawn]) assert.ok(w.isSafe(...p), String(p));
  assert.ok(grove.waypoints.some((wp) => wp.unlocked));
  // the level band bridges Azure (to 12) and the Frontier forest (16-19), levels stretched to 1-40 (owner, 2026-10-29)
  const levels = grove.spawns.flatMap((s) => s.level);
  assert.equal(Math.min(...levels), 9);
  assert.equal(Math.max(...levels), 16);
  for (const s of grove.spawns) assert.ok(NEW.includes(s.monster), s.monster);
});

test('walking north out of Azure continues into the grove at the same world point', () => {
  const az = worlds[AZURE], seam = az.seams.find((s) => s.to === GROVE);
  const game = new Game({ ...data, world: data.maps[AZURE] }, { world: az, seed: 3 });
  game.worlds = worlds;
  [game.player.x, game.player.z] = [seam.gate[0], seam.gate[1] + 2];
  game.input.moveZ = -1;
  for (let i = 0; i < 120 && !game.travelled; i++) game.update(1 / 60);
  assert.equal(game.travelled, GROVE);
  const [gx, gz] = game.ch.pos;
  assert.deepEqual([gx + grove.atlas.offset[0], gz + grove.atlas.offset[1]].map((v) => Math.round(v)), [Math.round(game.player.x), Math.round(game.player.z)]);
});

test('three new monsters with their own patterns, a visible wind-up and their own part', () => {
  const signature = (m) => [m.behavior, ...Object.keys(m.attacks).sort()].join('|');
  const old = new Set(Object.entries(M).filter(([id]) => !NEW.includes(id)).map(([, m]) => signature(m)));
  for (const [i, id] of NEW.entries()) {
    const m = M[id];
    assert.ok(m && !old.has(signature(m)), id);
    for (const a of Object.values(m.attacks)) assert.ok(a.windup >= 0.4, `${id}: every attack has a visible wind-up`);
    assert.ok(m.drops.some((d) => d.item === PARTS[i]), `${id} drops ${PARTS[i]}`);
  }
});

test('hare boxing lands its two jabs once each at their authored times; its hop is marked before it lands and dodgeable', () => {
  const box = M.fern_ear_hare.attacks.box;
  const k = arena('fern_ear_hare');
  k.place(0.3); k.m.cd.hop = 99; k.m.cd.thump = 99;
  k.step(0.01);
  assert.equal(k.m.windup?.name, 'box');
  k.until(() => k.m.state === 'act');
  k.step(box.hits[0].at - 0.02);
  assert.equal(k.hits.length, 0, 'nothing before the first jab');
  k.until(() => k.m.state !== 'act');
  assert.equal(k.hits.length, 2, 'two jabs, each once');

  const h = arena('fern_ear_hare');
  h.place(5); h.m.cd.box = 99; h.m.cd.thump = 99;
  h.step(0.01);
  assert.equal(h.m.windup?.name, 'hop');
  const mark = h.g.areas.find((a) => a.kind === 'pounce');
  assert.ok(mark && mark.delay >= h.m.windup.total, 'the landing is marked for the whole wind-up');
  h.g.player.x = 3.5; // step out of the circle
  h.until(() => h.m.state === 'recover', 5);
  h.step(0.4);
  assert.equal(h.hits.length, 0, 'leaving the mark dodges the hop');

  // the thump: a ring round it, marked through the wind-up, hits once as the foot comes down; out of it, safe
  const t = arena('fern_ear_hare');
  t.place(1); t.m.cd.box = 99; t.m.cd.hop = 99;
  t.step(0.01);
  assert.equal(t.m.windup?.name, 'thump');
  t.step(M.fern_ear_hare.attacks.thump.windup - 0.05);
  assert.equal(t.hits.length, 0, 'nothing during the wind-up');
  t.until(() => t.m.state === 'recover');
  t.step(0.2);
  assert.equal(t.hits.length, 1, 'the thump hits once');
});

test('moth shard rain marks circles around the player that land one after another, only on their marks', () => {
  const rain = M.mirrorwing_moth.attacks.shard_rain;
  const a = arena('mirrorwing_moth');
  a.place(5); a.m.cd.decoy = 99;
  a.step(0.01);
  assert.equal(a.m.windup?.name, 'shard_rain');
  const marks = a.g.areas.filter((x) => x.kind === 'glass_shard');
  assert.equal(marks.length, rain.count, 'one mark per shard');
  assert.ok(marks.some((x) => Math.hypot(x.x - a.g.player.x, x.z - a.g.player.z) < 1e-9), 'the first lands on the player');
  marks.forEach((x, i) => assert.ok(Math.abs(x.delay - (a.m.windup.total + i * rain.step)) < 1e-9, 'one after another'));
  a.step(a.m.windup.total - 0.05);
  assert.equal(a.hits.length, 0, 'nothing before the first shard lands');
  a.step(0.1);
  assert.equal(a.hits.length, 1, 'the shard on the player hits once');
  // stepping clear of every mark dodges the rest
  Object.assign(a.g.player, { x: 30, z: 30 });
  a.step(1.5);
  assert.equal(a.hits.length, 1);
});

test('moth mirror decoy: it flies back and leaves a mirror image that goes off only after its fuse', () => {
  const dec = M.mirrorwing_moth.attacks.decoy;
  for (const [stay, expect] of [[true, 1], [false, 0]]) {
    const a = arena('mirrorwing_moth');
    a.m.cd.shard_rain = a.m.cd.glare = 99;
    a.place(1);
    a.step(0.01);
    assert.equal(a.m.windup?.name, 'decoy', 'too close: it leaves its decoy');
    a.until(() => a.m.state === 'act');
    const bomb = a.g.areas.find((x) => x.kind === 'mirror_bomb');
    assert.ok(bomb && Math.abs(bomb.delay - dec.fuse) < 1e-9 && bomb.radius === dec.radius, 'the decoy is marked where the moth hung');
    a.until(() => a.m.state === 'recover');
    assert.ok(Math.hypot(a.m.x - bomb.x, a.m.z - bomb.z) > dec.distance * 0.9, 'the moth flew back away from it');
    if (!stay) Object.assign(a.g.player, { x: bomb.x + dec.radius + 1.5, z: bomb.z });
    a.step(dec.fuse - dec.air - 0.15);
    assert.equal(a.hits.length, 0, 'nothing before the fuse runs out');
    a.step(0.6);
    assert.equal(a.hits.length, expect, stay ? 'staying by the decoy is hit once' : 'stepping out of its circle is safe');
  }
});

test('moth wing glare: a lane of reflected light that hits once at the end of its wind-up, not beside the lane', () => {
  const glare = M.mirrorwing_moth.attacks.glare;
  for (const [side, expect] of [[0, 1], [glare.width / 2 + 1.2, 0]]) {
    const a = arena('mirrorwing_moth');
    a.m.cd.decoy = a.m.cd.shard_rain = 99;
    a.place(6);
    a.step(0.01);
    assert.equal(a.m.windup?.name, 'glare', 'it turns its wings on the prey from range');
    a.step(a.m.windup.total * 0.6);
    Object.assign(a.g.player, { x: side });
    a.step(a.m.windup.total * 0.4 - 0.05);
    assert.equal(a.hits.length, 0, 'nothing before the glare');
    a.until(() => a.m.state === 'recover');
    a.step(0.5);
    assert.equal(a.hits.length, expect, `player ${side} m off the lane`);
  }
});

// Greyfang is a kit monster now (its takedown, hamstring and rally: monster-kits.test.js)

test('mole digs toward a marked spot and bursts out of it; leaving the mark dodges, never into a town', () => {
  const a = arena('rootdigger_mole');
  a.place(6); a.m.cd.swipe = 99;
  a.step(0.01);
  assert.equal(a.m.windup?.name, 'erupt');
  const mark = a.g.areas.find((x) => x.kind === 'erupt');
  assert.ok(mark && Math.abs(mark.delay - a.m.windup.total) < 1e-9);
  const target = { x: mark.x, z: mark.z };
  a.step(a.m.windup.total - 0.05);
  assert.equal(a.hits.length, 0, 'nothing during the dig');
  a.until(() => a.m.state === 'recover');
  a.step(0.05);
  assert.equal(a.hits.length, 1, 'the burst hits once');
  assert.deepEqual([a.m.x, a.m.z], [target.x, target.z], 'it surfaces where the ground burst');

  const b = arena('rootdigger_mole');
  b.place(6); b.m.cd.swipe = 99;
  b.step(0.01);
  b.g.player.x = 4;
  b.until(() => b.m.state === 'recover');
  b.step(0.4);
  assert.equal(b.hits.length, 0, 'stepping out of the mark dodges');

  const c = arena('rootdigger_mole');
  c.g.isSafe = (x, z) => z > 2; // the player stands in a safe town
  c.place(6); c.m.cd.swipe = 99;
  c.step(0.5);
  assert.notEqual(c.m.windup?.name, 'erupt', 'it never digs into a safe zone');
});

test('every grove part has a use; the Moonroot accessories need them and fit the gear tiers', () => {
  const G = data.items.gearBases, R = data.recipes.recipes;
  for (const id of PARTS) assert.ok(Object.values(R).some((r) => r.cost[id]), id);
  for (const id of ACCESSORIES) {
    assert.equal(G[id].slot, 'charm', id);
    assert.ok(R[id] && R[id].result === id && R[id].itemLevel === G[id].itemLevel, id);
    assert.ok(Object.keys(R[id].cost).some((k) => PARTS.includes(k)), `${id} is made from grove parts`);
  }
  assert.ok(PARTS.every((p) => R.grove_union_ring.cost[p]), 'the union ring binds all three');
  assert.ok(G.grove_union_ring.itemLevel > G.fernstep_charm.itemLevel);
});
