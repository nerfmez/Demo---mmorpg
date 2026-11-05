// Monsters with their own kits (behavior "kit", docs/MONSTER-ATTACKS.md): the attack is picked by its `use`
// band, and every attack keeps the contact safety rules - no damage before its authored time, never twice,
// misses outside its range or arc, and the monster's state is clean afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { updateMonster } from '../../src/core/ai.js';

const M = data.monsters.monsters;

function arena(type, level = 13, { realDamage = false, open = false } = {}) {
  const g = new Game(data, { seed: 5 });
  if (open) g.world.isFree = () => true; // open ground: the spot near the origin has a rock in the way
  const m = g.spawnMinion(type, level, 0, 0);
  g.monsters = [m];
  g.isSafe = () => false;
  g.moveEntity = (u, dx, dz) => { u.x += dx; u.z += dz; return {}; };
  Object.assign(m, { x: 0, z: 0, homeX: 0, homeZ: 0, facing: 0, state: 'chase', stateT: 0, aggro: true });
  for (const key in m.cd) m.cd[key] = 0;
  const hits = [];
  if (!realDamage) {
    m.damage = 1;
    g.damageUnit = (u, amount, src, opts) => hits.push({ id: u.id, amount, t: g.time, attack: opts?.attack });
  }
  const step = (seconds) => { for (let t = 0; t < seconds - 1e-8; t += 0.01) { g.time += 0.01; g.updateAreas(0.01); if (!m.dead) updateMonster(g, m, 0.01); } };
  const until = (cond, seconds = 20) => { for (let t = 0; t < seconds && !cond(); t += 0.01) step(0.01); assert.ok(cond(), `${type}: stuck in ${m.state}`); };
  // the hero `gap` metres in front of the monster (it faces +z), `side` metres to its side
  const place = (gap, side = 0) => Object.assign(g.player, { x: side, z: m.r + g.player.r + gap });
  const only = (name) => { for (const k in m.cd) m.cd[k] = k === name ? 0 : 99; };
  return { g, m, hits, step, until, place, only };
}

test('kit monsters pick each attack by its use band, in the data order', () => {
  for (const [type, def] of Object.entries(M)) {
    if (def.behavior !== 'kit') continue;
    const used = Object.entries(def.attacks).filter(([, a]) => a.use);
    assert.ok(used.length >= 2, `${type}: a kit has two attacks or more`);
    for (const [name, a] of used) assert.ok((a.use.max ?? a.range) > (a.use.min ?? 0), `${type}.${name}: a real band`);
  }
  const fox = arena('leaf_fox');
  for (const [gap, want] of [[0.8, 'snap'], [3, 'gust'], [6, 'pounce']]) {
    fox.m.state = 'chase'; fox.m.windup = null;
    for (const k in fox.m.cd) fox.m.cd[k] = 0;
    fox.place(gap);
    fox.step(0.02);
    assert.equal(fox.m.windup?.name, want, `a gap of ${gap} m starts ${want}`);
  }
});

test('leaf fox snap bites once at its hit time and misses out of reach or beside it', () => {
  const a = M.leaf_fox.attacks.snap;
  const { m, hits, step, until, place, only } = arena('leaf_fox');
  only('snap'); place(0.8);
  until(() => m.state === 'windup');
  step(a.windup - 0.02);
  assert.equal(hits.length, 0, 'nothing during the wind-up');
  until(() => m.state === 'act');
  step(a.hitTime - 0.03);
  assert.equal(hits.length, 0, 'nothing before the hit time');
  until(() => m.state === 'recover');
  assert.equal(hits.length, 1, 'one bite');
  // out of reach: the bite is taken at the edge of its band, the hero steps back during the wind-up
  const b = arena('leaf_fox');
  b.only('snap'); b.place(1.2);
  b.until(() => b.m.state === 'windup');
  b.place(a.range + 0.6);
  b.until(() => b.m.state === 'recover');
  assert.equal(b.hits.length, 0, 'out of reach');
  // beside it (outside the 100 degree arc, still in reach): the angle locks late in the wind-up
  const c = arena('leaf_fox');
  c.only('snap'); c.place(0.8);
  c.until(() => c.m.state === 'windup' && c.m.stateT > a.windup * 0.6);
  Object.assign(c.g.player, { x: 1.2, z: -0.6 });
  c.until(() => c.m.state === 'recover');
  assert.equal(c.hits.length, 0, 'outside the arc');
  c.until(() => c.m.state === 'chase');
  assert.equal(c.m.melee, null, 'the strike is cleared');
});

test('leaf fox gust: a 5 m cone of leaf blades at the end of the wind-up that bleeds, missing outside its 50 degrees', () => {
  const a = M.leaf_fox.attacks.gust;
  const { m, g, hits, step, until, place, only } = arena('leaf_fox');
  only('gust'); place(3);
  until(() => m.state === 'windup');
  assert.equal(m.windup.name, 'gust');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing during the wind-up');
  until(() => m.state === 'recover');
  assert.equal(hits.length, 1, 'one hit');
  assert.equal(hits[0].attack, 'gust');
  // 4.5 m away at 40 degrees off its facing: outside the cone
  const b = arena('leaf_fox');
  b.only('gust'); b.place(3);
  b.until(() => b.m.state === 'windup' && b.m.stateT > a.windup * 0.6);
  const r = b.m.r + b.g.player.r + 3;
  Object.assign(b.g.player, { x: Math.sin(0.7) * r, z: Math.cos(0.7) * r });
  b.until(() => b.m.state === 'recover');
  assert.equal(b.hits.length, 0, 'outside the cone');
  // with the real damage the hero bleeds
  const c = arena('leaf_fox', 13, { realDamage: true });
  c.only('gust'); c.place(3);
  c.until(() => c.m.state === 'recover');
  assert.ok(c.g.player.statuses.bleed, 'the leaves cut: bleed');
  void g;
});

test('leaf fox mousing pounce: marked spot, lands once after its air time, pins the hero; a miss leaves it stuck', () => {
  const a = M.leaf_fox.attacks.pounce;
  const { m, g, until, place, only } = arena('leaf_fox', 13, { realDamage: true });
  only('pounce'); place(6);
  until(() => m.state === 'windup');
  const area = g.areas.find((x) => x.attack === 'pounce');
  assert.ok(area, 'the landing spot is marked at the start of the wind-up');
  assert.ok(Math.abs(area.delay - (m.windup.total + a.air)) < 1e-6, 'it goes off as the leap lands');
  const hp0 = g.player.hp;
  until(() => m.state === 'act');
  assert.equal(g.player.hp, hp0, 'no damage during the wind-up');
  until(() => m.state !== 'act');
  assert.ok(g.player.hp < hp0, 'the landing hurts');
  assert.ok(g.player.statuses.root, 'and pins the hero');
  assert.equal(m.state, 'recover');
  // the hero steps out of the marked circle: it lands on nothing and is stuck nose-down
  const b = arena('leaf_fox');
  b.only('pounce'); b.place(6);
  b.until(() => b.m.state === 'windup');
  Object.assign(b.g.player, { x: 4, z: b.g.player.z });
  b.until(() => b.m.state !== 'windup' && b.m.state !== 'act');
  assert.equal(b.hits.length, 0, 'a miss');
  assert.equal(b.m.state, 'stunned');
  assert.ok(Math.abs(b.m.stateDur - a.missStun) < 1e-9, 'stuck for missStun');
  b.until(() => b.m.state === 'chase', 3);
  assert.equal(b.m.charge, null, 'the leap is cleared');
});

test('leaf tanuki drum: three rings run out after the wind-up, each hits once as it passes, the last knocks back', () => {
  const a = M.leaf_tanuki.attacks.drum;
  const { m, g, hits, step, until, place, only } = arena('leaf_tanuki', 15);
  only('drum'); place(1.5);
  until(() => m.state === 'windup');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing during the wind-up');
  const rings = () => g.areas.filter((x) => x.attack === 'drum');
  until(() => m.state === 'recover');
  assert.equal(rings().length, a.beats, 'one ring per beat');
  assert.ok(rings().every((r, i) => Math.abs(r.delay - i * a.beat) < 1e-9), 'a beat apart');
  assert.ok(rings().at(-1).knock > 0 && rings()[0].knock === 0, 'only the last knocks back');
  step(a.beats * a.beat + 1.2);
  assert.equal(hits.length, a.beats, 'each ring once');
  // out of the rings' reach: nothing
  const b = arena('leaf_tanuki', 15);
  b.only('drum'); b.place(1.5);
  b.until(() => b.m.state === 'recover');
  Object.assign(b.g.player, { x: 0, z: a.radius * a.lastScale + 2 });
  b.step(a.beats * a.beat + 1.5);
  assert.equal(b.hits.length, 0, 'out of reach');
  b.until(() => b.m.state === 'chase');
});

test('leaf tanuki boomerang: hits along its line going out and again coming back; beside the line it misses', () => {
  const { m, g, hits, until, step, place, only } = arena('leaf_tanuki', 15);
  only('boomerang'); place(4);
  until(() => m.state === 'recover');
  assert.equal(hits.length, 0, 'nothing before it is thrown');
  const leaf = g.projectiles.find((p) => p.boomerang);
  assert.ok(leaf, 'thrown');
  for (let t = 0; t < 4 && g.projectiles.includes(leaf); t += 0.01) { g.updateProjectiles(0.01); step(0.01); }
  assert.ok(!g.projectiles.includes(leaf), 'it comes back and is gone');
  assert.equal(hits.length, 2, 'once out, once back');
  const b = arena('leaf_tanuki', 15);
  b.only('boomerang'); b.place(4);
  b.until(() => b.m.state === 'windup' && b.m.stateT > b.m.windup.total * 0.6);
  Object.assign(b.g.player, { x: 2.5, z: b.g.player.z });
  b.until(() => b.m.state === 'recover');
  for (let t = 0; t < 4; t += 0.01) { b.g.updateProjectiles(0.01); b.step(0.01); }
  assert.equal(b.hits.length, 0, 'beside the line');
});

test('leaf tanuki doubles: once, when hurt; the copies never attack, pop at a touch for no reward, and fade', () => {
  const a = M.leaf_tanuki.attacks.doubles;
  const { m, g, until, step, place } = arena('leaf_tanuki', 15, { realDamage: true });
  for (const k in m.cd) m.cd[k] = k === 'doubles' ? 0 : 99;
  place(4);
  step(0.5);
  assert.notEqual(m.windup?.name, 'doubles', 'not while healthy');
  m.hp = m.maxHp * 0.5;
  until(() => m.state === 'windup' && m.windup.name === 'doubles');
  until(() => m.state === 'recover');
  const copies = g.monsters.filter((x) => x.illusion);
  assert.equal(copies.length, a.count);
  g.monsters.push(...copies.filter((c) => !g.monsters.includes(c)));
  const kills = g.stats.kills, exp = g.ch.exp;
  for (let t = 0; t < 3; t += 0.01) { for (const c of copies) if (!c.dead) updateMonster(g, c, 0.01); }
  assert.ok(copies.every((c) => c.state !== 'windup'), 'the copies never wind up');
  g.hitMonster(copies[0], 10, {});
  assert.ok(copies[0].dead, 'a touch pops it');
  assert.equal(g.stats.kills, kills, 'no kill counted');
  assert.equal(g.ch.exp, exp, 'no experience');
  for (let t = 0; t < a.life; t += 0.05) if (!copies[1].dead) updateMonster(g, copies[1], 0.05);
  assert.ok(copies[1].dead, 'the other fades');
  m.cd.doubles = 0; m.state = 'chase';
  step(1);
  assert.notEqual(m.windup?.name, 'doubles', 'only once');
});

test('stone pangolin rake: two claw hits at their own times, in its arc only', () => {
  const a = M.stone_pangolin.attacks.rake;
  const { m, hits, step, until, place, only } = arena('stone_pangolin', 17);
  only('rake'); place(1);
  until(() => m.state === 'act');
  step(a.hits[0].at - 0.03);
  assert.equal(hits.length, 0, 'nothing before the first hit');
  until(() => m.state === 'recover');
  assert.equal(hits.length, 2, 'two hits');
  const b = arena('stone_pangolin', 17);
  b.only('rake'); b.place(1);
  b.until(() => b.m.state === 'act');
  Object.assign(b.g.player, { x: 0, z: -3 }); // behind it
  b.until(() => b.m.state === 'recover');
  assert.equal(b.hits.length, 0, 'not behind it');
});

test('stone pangolin tail lash: only at what stands behind it, without turning, once, knocking back', () => {
  const { m, hits, until, step, place, only, g } = arena('stone_pangolin', 17);
  only('tail');
  place(1); // in front: no tail lash
  step(0.5);
  assert.notEqual(m.windup?.name, 'tail', 'not at what is in front');
  m.state = 'chase';
  Object.assign(g.player, { x: 0, z: -(m.r + g.player.r + 1) }); // behind
  until(() => m.state === 'windup' && m.windup.name === 'tail');
  assert.equal(m.facing, 0, 'it does not turn');
  until(() => m.state === 'recover');
  assert.equal(hits.length, 1, 'one lash');
  step(1);
  assert.equal(hits.length, 1);
});

test('stone pangolin rebound roll: down its lane, back along it (a unit can be hit once each way), then dizzy', () => {
  const a = M.stone_pangolin.attacks.roll;
  const { m, hits, until, place, only, g } = arena('stone_pangolin', 17);
  only('roll'); place(5);
  until(() => m.state === 'act');
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.charge?.back, 3);
  until(() => m.state === 'stunned', 3);
  assert.ok(hits.length >= 1 && hits.length <= 2, 'at most once each way');
  assert.ok(Math.abs(m.stateDur - a.dizzy) < 1e-9, 'dizzy after it');
  assert.equal(m.charge, null);
  // beside the lane: never hit
  const b = arena('stone_pangolin', 17);
  b.only('roll'); b.place(5);
  b.until(() => b.m.state === 'windup' && b.m.stateT > b.m.windup.total * 0.6);
  Object.assign(b.g.player, { x: 3, z: b.g.player.z });
  b.until(() => b.m.state === 'stunned', 4);
  assert.equal(b.hits.length, 0, 'beside the lane');
  void g;
});

test('pearl fish flop: three hops along a line marked at the start, hurting only as each lands', () => {
  const a = M.pearl_fish.attacks.flop;
  const { m, g, hits, until, step, place, only } = arena('pearl_fish', 23, { open: true });
  only('flop'); place(4);
  until(() => m.state === 'windup');
  const marks = g.areas.filter((x) => x.attack === 'flop');
  assert.equal(marks.length, a.hops, 'every landing marked at once');
  marks.forEach((x, i) => assert.ok(Math.abs(x.delay - (m.windup.total + (i + 1) * a.air + i * a.pause)) < 1e-9, `landing ${i + 1} on time`));
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  const x0 = m.z;
  until(() => m.state === 'recover', 4);
  assert.ok(Math.abs(m.z - x0 - a.hop * a.hops) < 0.05, 'it flopped to the last landing');
  step(0.4);
  assert.ok(hits.length >= 1 && hits.length <= a.hops, 'hurt only where it landed on the hero');
  assert.equal(m.charge, null);
});

test('pearl fish gulp: what stands in its cone is drawn toward its mouth, then the jaws snap once; beside the cone is untouched', () => {
  const a = M.pearl_fish.attacks.gulp;
  const { m, g, hits, until, step, place, only } = arena('pearl_fish', 23, { open: true });
  only('gulp'); place(2.8);
  until(() => m.state === 'act');
  const z0 = g.player.z;
  step(a.duration * 0.5);
  assert.ok(g.player.z < z0 - 0.5, 'drawn toward the mouth');
  assert.equal(hits.length, 0, 'nothing before the snap');
  until(() => m.state === 'recover', 3);
  assert.equal(hits.length, 1, 'one snap');
  assert.equal(m.suck, null);
  const b = arena('pearl_fish', 23, { open: true });
  b.only('gulp'); b.place(2.8);
  b.until(() => b.m.state === 'act');
  Object.assign(b.g.player, { x: 3.5, z: b.g.player.z - 1 }); // beside the cone once it locked
  const x0 = b.g.player.x;
  b.until(() => b.m.state === 'recover', 3);
  assert.equal(b.g.player.x, x0, 'outside the cone nothing pulls');
  assert.equal(b.hits.length, 0, 'and the snap misses');
});

test('pearl fish wave: a crest rolls out across its cone after the wind-up, hitting once as it passes; beside the cone it misses', () => {
  const a = M.pearl_fish.attacks.wave;
  const { m, g, hits, until, step, place, only } = arena('pearl_fish', 23, { open: true });
  only('wave'); place(5);
  until(() => m.state === 'windup');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.state === 'recover');
  const crest = g.areas.find((x) => x.attack === 'wave');
  assert.ok(crest && crest.kind === 'shockwave' && crest.arc === a.arc, 'a crest with an arc');
  step(0.4);
  assert.equal(hits.length, 0, 'it has not reached the hero yet');
  step(1.2);
  assert.equal(hits.length, 1, 'one hit as it passes');
  const b = arena('pearl_fish', 23, { open: true });
  b.only('wave'); b.place(4);
  b.until(() => b.m.state === 'windup' && b.m.stateT > b.m.windup.total * 0.6);
  Object.assign(b.g.player, { x: 4.5 }); // out of the cone after it locked
  b.until(() => b.m.state === 'recover');
  b.step(1.5);
  assert.equal(b.hits.length, 0, 'beside the cone the crest misses');
});

test('pearl slug stingers: three drift off at the end of the wind-up and follow the hero; a hero who keeps running is never caught', () => {
  const a = M.pearl_slug.attacks.stingers;
  const { m, g, hits, until, step, place, only } = arena('pearl_slug', 25, { open: true });
  only('stingers'); place(5);
  until(() => m.state === 'windup');
  step(a.windup - 0.03);
  assert.equal(g.projectiles.filter((p) => p.attack === 'stingers').length, 0, 'none before the release');
  until(() => m.state === 'recover');
  assert.equal(g.projectiles.filter((p) => p.attack === 'stingers').length, a.count);
  Object.assign(g.player, { x: 2.5 }); // a step aside: they turn after it
  for (let t = 0; t < 4 && hits.length < 1; t += 0.01) { g.updateProjectiles(0.01); step(0.01); }
  assert.ok(hits.length >= 1, 'they follow and sting');
  const b = arena('pearl_slug', 25, { open: true });
  b.only('stingers'); b.place(5);
  b.until(() => b.m.state === 'recover');
  for (let t = 0; t < 5; t += 0.01) { b.g.player.z += 6 * 0.01; b.g.updateProjectiles(0.01); b.step(0.01); }
  assert.equal(b.hits.length, 0, 'slower than a running hero');
  assert.equal(b.g.projectiles.filter((p) => p.attack === 'stingers').length, 0, 'and they fade at their range');
});

test('pearl slug acid skin: hit hard, it froths; then each blow from close by is answered by one squirt, none from afar or after', () => {
  const a = M.pearl_slug.attacks.acid;
  const { m, g, hits, step, place, only } = arena('pearl_slug', 25, { open: true });
  only('acid'); place(1);
  m.state = 'chase';
  for (let i = 0; i < a.hitsToTrigger; i++) g.hitMonster(m, 1, {});
  assert.ok(m.acidUntil > g.time, 'its skin froths');
  assert.equal(hits.length, 0, 'the blows that set it off are not answered');
  g.hitMonster(m, 1, {});
  assert.equal(hits.length, 0, 'not yet: the froth is still rising');
  step(a.windup + 0.05);
  g.hitMonster(m, 1, {}); g.hitMonster(m, 1, {});
  assert.equal(hits.length, 1, 'one squirt for the blow (at most one each `every` s)');
  step(a.every + 0.02);
  place(a.reach + 1);
  g.hitMonster(m, 1, {});
  assert.equal(hits.length, 1, 'out of reach: nothing');
  place(1);
  step(a.duration);
  g.hitMonster(m, 1, {});
  assert.equal(hits.length, 1, 'over: nothing');
});

test('eye clam gaze: the flash strikes and holds what faces it in its cone; a back turned to it, or out of the cone, is safe', () => {
  const a = M.eye_clam.attacks.gaze;
  for (const [facing, side, want] of [[Math.PI, 0, 1], [0, 0, 0], [Math.PI, 6, 0]]) {
    const { m, g, hits, until, step, place, only } = arena('eye_clam', 27, { open: true });
    only('gaze'); place(5, 0);
    until(() => m.state === 'windup' && m.stateT > m.windup.total * 0.6);
    Object.assign(g.player, { x: side, facing });
    step(a.windup * 0.3);
    assert.equal(hits.length, 0, 'nothing in the wind-up');
    until(() => m.state === 'recover');
    assert.equal(hits.length, want, `facing ${facing.toFixed(2)}, ${side} m aside`);
  }
  const r = arena('eye_clam', 27, { open: true, realDamage: true });
  r.only('gaze'); r.place(5); r.g.player.facing = Math.PI;
  r.until(() => r.m.state === 'recover');
  assert.ok(r.g.player.statuses.root, 'held fast');
});

test('eye clam nacre: hit hard, it coats itself; the coat takes the blows; broken, it cracks open stunned and bare, else what is left heals it', () => {
  const a = M.eye_clam.attacks.nacre;
  const { m, g, step, place, only } = arena('eye_clam', 27, { open: true });
  only('nacre'); place(2); m.state = 'chase';
  for (let i = 0; i < a.hitsToTrigger; i++) g.hitMonster(m, 1, {});
  assert.equal(m.state, 'shell');
  assert.ok(m.nacre && Math.abs(m.nacre.max - m.maxHp * a.shield) < 1e-6, 'a coat worth its share of health');
  const hp = m.hp;
  g.hitMonster(m, 200, {});
  assert.equal(m.hp, hp, 'the coat takes it');
  g.hitMonster(m, 1e6, {});
  assert.equal(m.nacre, null);
  assert.equal(m.state, 'stunned', 'broken: it cracks open');
  const bare = g.hitMonster(m, 5000, {});
  step(a.crackStun + 0.1);
  m.state = 'chase';
  const plain = g.hitMonster(m, 5000, {});
  assert.ok(Math.abs(bare / plain - a.exposedTaken) < 0.02, `bare it takes ${a.exposedTaken}x (${bare} vs ${plain})`);
  const b = arena('eye_clam', 27, { open: true });
  b.only('nacre'); b.place(2); b.m.state = 'chase';
  b.m.hp = b.m.maxHp * 0.5;
  for (let i = 0; i < a.hitsToTrigger; i++) b.g.hitMonster(b.m, 1, {});
  const before = b.m.hp;
  b.step(a.duration + 0.05);
  assert.ok(b.m.hp > before + b.m.maxHp * a.shield * 0.9, 'the coat held: it heals');
  assert.notEqual(b.m.state, 'shell');
});

test('pearl snail king grind: rasps along its lane in four passes at their own times; beside the lane it misses', () => {
  const a = M.pearl_snail_king.attacks.grind;
  const { m, hits, until, step, place, only } = arena('pearl_snail_king', 30, { open: true });
  only('grind'); place(1.5);
  until(() => m.state === 'act');
  step((0.5 / a.ticks) * a.duration - 0.03);
  assert.equal(hits.length, 0, 'nothing before the first pass');
  until(() => m.state === 'recover', 3);
  assert.equal(hits.length, a.ticks, 'one hit a pass');
  assert.equal(m.grind, null);
  const b = arena('pearl_snail_king', 30, { open: true });
  b.only('grind'); b.place(1.5);
  b.until(() => b.m.state === 'act');
  Object.assign(b.g.player, { x: 3.5 });
  b.until(() => b.m.state === 'recover', 3);
  assert.equal(b.hits.length, 0);
});

test('pearl snail king eggs: laid round the hero; one stepped on breaks harmlessly, the rest burst at the end of their fuse', () => {
  const a = M.pearl_snail_king.attacks.eggs;
  const { m, g, hits, until, step, place, only } = arena('pearl_snail_king', 30, { open: true });
  only('eggs'); place(5);
  until(() => m.state === 'recover');
  const eggs = g.areas.filter((x) => x.kind === 'pearl_egg');
  assert.equal(eggs.length, a.count, 'laid round the hero');
  for (const e of eggs) assert.ok(Math.hypot(e.x - g.player.x, e.z - g.player.z) > a.crush + g.player.r + 0.5, 'none on the hero itself');
  const crushed = [];
  g.events.length = 0;
  step(a.flight + 0.05);
  Object.assign(g.player, { x: eggs[0].x, z: eggs[0].z }); // stepped on
  step(0.02);
  for (const e of g.events) if (e.type === 'eggCrush') crushed.push(e);
  assert.equal(crushed.length, 1, 'broken');
  assert.equal(hits.length, 0, 'harmlessly');
  assert.ok(!g.areas.includes(eggs[0]));
  Object.assign(g.player, { x: eggs[1].x + 0.5 + g.player.r + a.crush, z: eggs[1].z }); // beside the next, within its burst
  step(a.fuse - 0.2);
  assert.equal(hits.length, 0, 'nothing before the fuse ends');
  step(0.3);
  assert.ok(hits.length >= 1, 'the eggs left alone burst');
});

test('pearl snail king: the beam sweeps once across; at 60% it withdraws, and its shell throws pearls out along spiral arms; its slime trails it', () => {
  const k = M.pearl_snail_king, sp = k.kit.withdraw.spiral;
  const { m, hits, until, place, only } = arena('pearl_snail_king', 30, { open: true });
  only('beam'); place(6);
  m.hp = m.maxHp * 0.55; m.withdrew = [true, false]; m.state = 'chase';
  until(() => m.state === 'windup' && m.windup.name === 'beam', 4);
  until(() => m.state === 'recover', 6);
  assert.equal(hits.filter((h) => h.attack === 'beam').length, 1, 'the sweep hits once');
  const w = arena('pearl_snail_king', 30, { open: true });
  w.only('grind'); w.place(6);
  w.m.hp = w.m.maxHp * 0.59; w.m.state = 'chase';
  w.step(0.05);
  assert.equal(w.m.state, 'shell', 'into its shell');
  assert.ok(w.m.shell, 'hits barely hurt');
  const pearls = w.g.areas.filter((a) => a.attack === 'withdraw');
  assert.equal(pearls.length, sp.arms * sp.rings * sp.waves.length, 'pearls along every arm, every wave');
  assert.ok(pearls.every((a) => a.kind === 'pearl_burst' && a.delay >= sp.waves[0] - 1e-9), 'each marked before it bursts');
  // the second wave turns the other way: its arms are not the first wave's
  const first = pearls.filter((a) => a.wave === 0), second = pearls.filter((a) => a.wave === 1);
  const same = second.filter((b) => first.some((a) => Math.hypot(a.x - b.x, a.z - b.z) < 0.3)).length;
  assert.ok(same <= sp.arms, `a new spiral (only where the two cross: ${same})`);
  w.until(() => w.m.state !== 'shell', 4);
  w.m.state = 'chase'; w.step(0.1);
  assert.notEqual(w.m.state, 'shell', 'only once at 60%');
  const s = arena('pearl_snail_king', 30, { open: true });
  s.only('none'); s.place(11);
  s.step(3);
  assert.ok(s.g.areas.some((a) => a.attack === 'slime' && a.kind === 'pearl_slime'), 'a trail of slime');
});

test('pearl slug surge: slides along its lane leaving a ribbon of mucus pools', () => {
  const a = M.pearl_slug.attacks.surge;
  const { m, g, until, place, only } = arena('pearl_slug', 25, { open: true });
  only('surge'); place(3);
  until(() => m.state === 'act');
  const z0 = m.z;
  until(() => m.state === 'recover', 3);
  assert.ok(m.z - z0 > a.speed * a.duration * 0.5, 'it slid forward');
  const pools = g.areas.filter((x) => x.attack === 'surge');
  assert.ok(pools.length >= 2 && pools.length <= 5, `a trail of pools (${pools.length})`);
  assert.equal(m.charge, null);
});

test('a circling monster does not flick between closing in, circling and backing off at its band edges', () => {
  // the tanuki circles at kit.circle [3, 5.5]; its prey wanders back and forth across the far edge
  const { g, m, step, only } = arena('leaf_tanuki', 15, { open: true });
  only('none');
  const [near, far] = M.leaf_tanuki.kit.circle;
  let flips = 0, last = null;
  for (let i = 0; i < 300; i++) {
    const d = far + Math.sin(i * 0.9) * 0.25; // within 0.25 m of the edge, changing side every few frames
    const a = Math.atan2(g.player.x - m.x, g.player.z - m.z) || 0;
    Object.assign(g.player, { x: m.x + Math.sin(a) * d, z: m.z + Math.cos(a) * d });
    step(0.016);
    if (m.strafeMode && m.strafeMode !== last) { if (last) flips++; last = m.strafeMode; }
  }
  assert.ok(flips <= 2, `it changed what it does ${flips} times in 5 s at the edge`);
  // well inside, it circles; well past the near edge it backs off
  Object.assign(g.player, { x: m.x, z: m.z + (near + far) / 2 }); step(0.1);
  assert.equal(m.strafeMode, 'circle');
  Object.assign(g.player, { x: m.x, z: m.z + near - 1 }); step(0.1);
  assert.equal(m.strafeMode, 'back');
});

test('rootdigger mole kit: the scoop hits its front arc once at the end of the wind-up; the dirt spray fans five clods at release', () => {
  const s = M.rootdigger_mole.attacks.swipe, a = M.rootdigger_mole.attacks.spray;
  const { m, hits, until, step, place, only } = arena('rootdigger_mole', 14, { open: true });
  only('swipe'); place(1);
  until(() => m.state === 'windup');
  step(s.windup - 0.03);
  assert.equal(hits.length, 0, 'no damage during the wind-up');
  until(() => m.state === 'recover');
  step(0.2);
  assert.equal(hits.length, 1, 'the scoop hits once');
  const b = arena('rootdigger_mole', 14, { open: true });
  b.only('spray'); b.place(5);
  b.until(() => b.m.state === 'windup');
  assert.equal(b.m.windup.name, 'spray');
  b.step(a.windup - 0.03);
  assert.equal(b.g.projectiles.filter((p) => p.attack === 'spray').length, 0, 'none before the release');
  b.until(() => b.m.state === 'recover');
  assert.equal(b.g.projectiles.filter((p) => p.attack === 'spray').length, a.count);
  for (let t = 0; t < 1.5; t += 0.01) { b.g.updateProjectiles(0.01); b.step(0.01); }
  assert.ok(b.hits.length >= 1 && b.hits.length <= 2, `the middle clods hit, the outer ones pass (${b.hits.length})`);
});
