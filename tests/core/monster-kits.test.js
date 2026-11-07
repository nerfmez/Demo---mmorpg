// Monsters with their own kits (behavior "kit", docs/MONSTER-ATTACKS.md): the attack is picked by its `use`
// band, and every attack keeps the contact safety rules - no damage before its authored time, never twice,
// misses outside its range or arc, and the monster's state is clean afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { updateMonster } from '../../src/core/ai.js';

const M = data.monsters.monsters;

function arena(type, level = 13, { realDamage = false, open = false, normal = false } = {}) {
  const g = new Game(data, { seed: 5 });
  if (open) g.world.isFree = () => true; // open ground: the spot near the origin has a rock in the way
  const m = g.spawnMinion(type, level, 0, 0);
  if (!normal) g.makeElite(m); // the whole kit (a normal one uses only its `normal` attack)
  if (realDamage) g.player.hp = g.player.maxHp = 1e6; // a level-1 hero would fall to a level-27 elite's first blow
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

test('elites: a normal kit monster uses only its one attack; an elite (rolled now and then, never a boss) its whole kit, tougher', () => {
  const E = data.monsters.elite;
  for (const [type, def] of Object.entries(M)) {
    if (def.behavior !== 'kit' || def.boss) continue;
    assert.ok(def.normal && def.attacks[def.normal]?.use, `${type}: a normal attack it can take on its own`);
    const used = Object.values(def.attacks).filter((a) => a.use || a.hitsToTrigger || a.at);
    assert.ok(used.length >= 3, `${type}: three attacks (owner, 2026-11-06)`);
  }
  // a normal fox only pounces, whatever the gap
  const n = arena('leaf_fox', 13, { normal: true });
  for (const gap of [0.8, 3, 6]) {
    n.m.state = 'chase'; n.m.windup = null;
    for (const k in n.m.cd) n.m.cd[k] = 0;
    n.place(gap); n.step(0.05);
    assert.ok(!n.m.windup || n.m.windup.name === 'pounce', `a gap of ${gap} m: ${n.m.windup?.name}`);
  }
  // elites are rolled at spawn, about `chance` of the kit monsters, with their stats raised
  const g = new Game(data, { seed: 3 });
  let kit = 0, elite = 0;
  for (let i = 0; i < 400; i++) {
    const m = g.spawnAt({ monster: 'reef_crab', zone: 'meadow', level: [2, 2], x: 0, z: 0, respawn: 5 });
    kit++; if (m.elite) elite++;
  }
  assert.ok(Math.abs(elite / kit - E.chance) < 0.06, `about ${E.chance} elite (${elite}/${kit})`);
  const a = g.spawnMinion('reef_crab', 2, 0, 0), b = g.spawnMinion('reef_crab', 2, 0, 0);
  assert.ok(!a.elite, 'a minion is never an elite');
  g.makeElite(b);
  assert.equal(b.maxHp, Math.round(a.maxHp * E.hp));
  assert.ok(Math.abs(b.damage / a.damage - E.damage) < 1e-9 && b.size === E.size);
  // and drops more
  g.drops = [];
  b.minion = false; g.killMonster(b);
  const many = g.drops.length;
  g.drops = []; a.minion = false; g.killMonster(a);
  assert.ok(many > g.drops.length, 'an elite drops more');
});

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

test('wolf circling lunge: a lap round the hero, a crouch with its lane locking, then one bite on the lunge', () => {
  const a = M.thornback_wolf.attacks.circle_lunge;
  const { m, g, hits, until, step, place, only } = arena('thornback_wolf', 10, { open: true });
  only('circle_lunge'); place(3);
  until(() => m.lap);
  const a0 = Math.atan2(m.x - g.player.x, m.z - g.player.z);
  until(() => m.lap?.phase === 'aim', 3);
  const a1 = Math.atan2(m.x - g.player.x, m.z - g.player.z), turned = Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)));
  assert.ok(turned > 1, `it ran round the hero (${turned.toFixed(2)} rad)`);
  assert.equal(hits.length, 0, 'nothing while circling');
  step(a.aim - 0.02);
  assert.equal(hits.length, 0, 'nothing in the crouch');
  until(() => m.state === 'recover', 2);
  assert.equal(hits.length, 1, 'one bite on the lunge');
  const b = arena('thornback_wolf', 10, { open: true });
  b.only('circle_lunge'); b.place(3);
  b.until(() => b.m.lap?.phase === 'aim', 4);
  b.step(a.aim * 0.7); // locked
  b.g.player.x += 3; // a step aside
  b.until(() => b.m.state === 'recover', 2);
  assert.equal(b.hits.length, 0, 'a late step aside dodges the locked lunge');
});

test('wolf shadow pincer: two shadow wolves cross where the hero stood; moving off the crossing is safe', () => {
  const a = M.thornback_wolf.attacks.pincer;
  const { m, g, hits, until, step, place, only } = arena('thornback_wolf', 10, { open: true });
  only('pincer'); place(5);
  until(() => m.state === 'windup');
  assert.equal(m.windup.lanes.length, 2, 'two lanes marked');
  until(() => m.state === 'recover');
  assert.equal(g.projectiles.filter((p) => p.kind === 'shadow_wolf').length, 2);
  for (let t = 0; t < 1.5; t += 0.01) { g.updateProjectiles(0.01); step(0.01); }
  assert.equal(hits.length, 2, 'standing on the crossing, both run over the hero');
  const b = arena('thornback_wolf', 10, { open: true });
  b.only('pincer'); b.place(5);
  b.until(() => b.m.state === 'windup');
  Object.assign(b.g.player, { z: b.g.player.z + 3 }); // walked off the crossing, along the wolf's line
  b.until(() => b.m.state === 'recover');
  for (let t = 0; t < 1.5; t += 0.01) { b.g.updateProjectiles(0.01); b.step(0.01); }
  assert.equal(b.hits.length, 0, 'off the crossing: safe');
  void a;
});

test('wolf drag bite: it bites and backs away dragging the hero; a dodge tears free', () => {
  const a = M.thornback_wolf.attacks.drag;
  const { m, g, hits, until, step, place, only } = arena('thornback_wolf', 10, { open: true });
  only('drag'); place(0.8);
  until(() => m.state === 'windup');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.drag, 1);
  const z0 = g.player.z;
  until(() => m.state === 'recover', 2);
  assert.equal(hits.length, 1, 'one bite');
  assert.ok(z0 - g.player.z > a.back * 0.8, 'dragged back with it');
  const b = arena('thornback_wolf', 10, { open: true });
  b.only('drag'); b.place(0.8);
  b.until(() => b.m.drag, 2);
  const z1 = b.g.player.z;
  b.g.player.dash = { t: 0, dur: 0.3 };
  b.step(0.05);
  assert.equal(b.m.drag, null, 'torn free');
  assert.ok(Math.abs(b.g.player.z - z1) < 0.2, 'not dragged on');
});

test('moss beetle bombard: it turns its back and sprays three bursts down the lane behind it; beside the lane is safe', () => {
  const a = M.moss_beetle.attacks.bombard;
  const { m, g, hits, until, step, place, only } = arena('moss_beetle', 10, { open: true });
  only('bombard'); place(2);
  until(() => m.state === 'windup');
  assert.ok(Math.abs(Math.cos(m.facing - Math.atan2(g.player.x - m.x, g.player.z - m.z)) + 1) < 0.05, 'its back to the hero');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.state === 'recover', 3);
  assert.ok(hits.length >= 2 && hits.length <= a.pulses, `a hit a burst (${hits.length})`);
  const b = arena('moss_beetle', 10, { open: true });
  b.only('bombard'); b.place(2);
  b.until(() => b.m.state === 'windup' && b.m.stateT > b.m.windup.total * 0.6);
  Object.assign(b.g.player, { x: 3 });
  b.until(() => b.m.state === 'recover', 3);
  assert.equal(b.hits.length, 0);
});

test('moss beetle moss ball: rolls along its lane growing, flattens the hero once, and leaves a slowing moss patch where it stops', () => {
  const a = M.moss_beetle.attacks.mossball;
  const { m, g, hits, until, step, place, only } = arena('moss_beetle', 10, { open: true });
  only('mossball'); place(4);
  until(() => m.state === 'recover');
  const ball = g.projectiles.find((p) => p.kind === 'mossball');
  assert.ok(ball && ball.radius === a.radius);
  for (let t = 0; t < 3 && g.projectiles.includes(ball); t += 0.01) { g.updateProjectiles(0.01); step(0.01); }
  assert.equal(hits.length, 1, 'rolled over the hero once');
  assert.ok(ball.radius > a.radius * 1.5, 'it grew');
  assert.ok(g.areas.some((x) => x.kind === 'moss_patch'), 'a moss patch where it stopped');
});

test('moss beetle play dead: hit hard it flips over; the spot under the hero is marked, then it springs onto it', () => {
  const a = M.moss_beetle.attacks.click;
  const { m, g, hits, until, step, place } = arena('moss_beetle', 10, { open: true });
  place(2); m.state = 'chase';
  for (const k in m.cd) m.cd[k] = k === 'click' ? 0 : 99;
  for (let i = 0; i < a.hitsToTrigger; i++) g.hitMonster(m, 1, {});
  assert.equal(m.state, 'feign', 'on its back');
  const mark = g.areas.find((x) => x.attack === 'click');
  assert.ok(mark && Math.hypot(mark.x - g.player.x, mark.z - g.player.z) < 1e-6, 'the spot under the hero');
  step(a.feign + a.air - 0.05);
  assert.equal(hits.length, 0, 'nothing before it lands');
  step(0.2);
  assert.equal(hits.length, 1, 'it lands on the hero');
  until(() => m.state === 'recover' || m.state === 'chase', 2);
  assert.ok(Math.hypot(m.x - mark.x, m.z - mark.z) < 1e-6, 'it sprang onto the mark');
});

test('sporecap fairy ring: a ring round the hero goes off after it grows; the band hurts, the middle and outside are safe', () => {
  const a = M.sporecap.attacks.fairy_ring;
  for (const [off, want] of [[0, 0], [(a.inner + a.radius) / 2, 1], [a.radius + 1.2, 0]]) {
    const { m, g, hits, until, step, place, only } = arena('sporecap', 7, { open: true });
    only('fairy_ring'); place(4);
    until(() => m.state === 'windup');
    const ring = g.areas.find((x) => x.kind === 'fairy_ring');
    assert.ok(ring && ring.inner === a.inner, 'a ring with a safe middle');
    Object.assign(g.player, { x: ring.x + off, z: ring.z });
    step(m.windup.total + a.grow - 0.05);
    assert.equal(hits.length, 0, 'nothing while it grows');
    step(0.1);
    assert.equal(hits.length, want, `${off} m from the middle`);
  }
});

test('sporecap sprouts: two rooted sprouts that puff small clouds, then wilt without a reward', () => {
  const a = M.sporecap.attacks.sprouts;
  const { m, g, until, place, only } = arena('sporecap', 7, { open: true });
  only('sprouts'); place(5);
  until(() => m.state === 'recover');
  const sprouts = g.monsters.filter((q) => q.sprout);
  assert.equal(sprouts.length, a.count);
  const at = sprouts.map((q) => [q.x, q.z]);
  const all = (sec) => { for (let t = 0; t < sec; t += 0.01) { g.time += 0.01; g.updateAreas(0.01); for (const q of [...g.monsters]) if (!q.dead) updateMonster(g, q, 0.01); } };
  all(a.every + 0.2);
  assert.ok(g.areas.some((x) => x.kind === 'spore_cloud' && x.attack === 'sprouts'), 'they puff');
  sprouts.forEach((q, i) => assert.deepEqual([q.x, q.z], at[i], 'rooted'));
  g.drops = [];
  all(a.life);
  assert.ok(sprouts.every((q) => q.dead), 'wilted');
  assert.equal(g.drops.length, 0, 'no reward for a wilted sprout');
});

test('sporecap sleep cloud: drifts along its aim; staying in it puts the hero to sleep, walking out in time does not', () => {
  const a = M.sporecap.attacks.sleep_cloud;
  const { m, g, until, step, place, only } = arena('sporecap', 7, { open: true, realDamage: true });
  only('sleep_cloud'); place(2.5);
  until(() => m.state === 'recover');
  const cloud = g.areas.find((x) => x.kind === 'sleep_cloud');
  const z0 = cloud.z;
  Object.assign(g.player, { x: cloud.x, z: cloud.z });
  const asleep = () => !!g.player.statuses.root;
  for (let t = 0; t < a.build + 0.3 && !asleep(); t += 0.01) { Object.assign(g.player, { x: cloud.x, z: cloud.z }); step(0.01); }
  assert.ok(asleep(), 'asleep after staying in it');
  assert.ok(cloud.z > z0 + 0.5, 'it drifted along its aim');
  const b = arena('sporecap', 7, { open: true, realDamage: true });
  b.only('sleep_cloud'); b.place(2.5);
  b.until(() => b.m.state === 'recover');
  const c2 = b.g.areas.find((x) => x.kind === 'sleep_cloud');
  for (let t = 0; t < a.build * 0.6; t += 0.01) { Object.assign(b.g.player, { x: c2.x, z: c2.z }); b.step(0.01); }
  Object.assign(b.g.player, { x: c2.x + 6 }); // walks out
  b.step(a.duration);
  assert.ok(!b.g.player.statuses.root, 'out in time: awake');
});

test('tusk boar rampage: three legs, each hitting a unit once, skidding and turning to its prey between legs; a rock stops it stunned', () => {
  const a = M.tusk_boar.attacks.rampage;
  const { m, g, hits, until, step, place, only } = arena('tusk_boar', 5, { open: true });
  only('rampage'); place(3);
  until(() => m.state === 'windup');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.state === 'act');
  const legs = [];
  for (let t = 0; t < 4 && m.state === 'act'; t += 0.01) {
    if (m.rampage && m.rampage.phase === 'skid' && legs.at(-1) !== m.rampage.leg) {
      legs.push(m.rampage.leg);
      Object.assign(g.player, { x: m.x + 3, z: m.z }); // the hero dodges aside; it turns after them
    }
    step(0.01);
  }
  assert.deepEqual(legs, [1, 2], 'two skids between three legs');
  assert.ok(hits.length >= 1 && hits.length <= a.legs, 'at most a hit a leg');
  assert.equal(m.rampage, null);
  const b = arena('tusk_boar', 5, { open: true });
  b.only('rampage'); b.place(3);
  b.g.moveEntity = (u, dx, dz) => { if (u === b.m && b.m.state === 'act') return { blockedHard: true }; u.x += dx; u.z += dz; return {}; };
  b.until(() => b.m.state === 'stunned', 4);
  assert.equal(b.m.rampage, null, 'a crash ends it');
});

test('tusk boar stampede: three piglets down three lanes, a gap apart, each trampling a unit once; the gap between lanes is safe', () => {
  const a = M.tusk_boar.attacks.stampede;
  const { m, g, hits, until, step, place, only } = arena('tusk_boar', 5, { open: true });
  only('stampede'); place(5);
  until(() => m.state === 'windup');
  step(a.windup - 0.03);
  assert.equal(g.projectiles.length, 0, 'none before the squeal ends');
  until(() => m.state === 'recover', 3);
  const piglets = g.projectiles.filter((p) => p.kind === 'piglet');
  assert.equal(piglets.length, a.count);
  const lanes = piglets.map((p) => Math.round(p.x * 10) / 10).sort((x, y) => x - y);
  assert.ok(lanes[1] - lanes[0] > 1 && lanes[2] - lanes[1] > 1, 'three lanes apart');
  for (let t = 0; t < 2; t += 0.01) { g.updateProjectiles(0.01); step(0.01); }
  assert.equal(hits.length, 1, 'the middle piglet tramples the hero once, the others pass beside');
  const b = arena('tusk_boar', 5, { open: true });
  b.only('stampede'); b.place(5);
  b.until(() => b.m.state === 'windup' && b.m.stateT > b.m.windup.total * 0.6);
  Object.assign(b.g.player, { x: a.spacing / 2 }); // between two lanes
  b.until(() => b.m.state === 'recover', 3);
  for (let t = 0; t < 2; t += 0.01) { b.g.updateProjectiles(0.01); b.step(0.01); }
  assert.equal(b.hits.length, 0, 'in the gap: safe');
});

test('shore gull perch: hops onto the hero\'s head and pecks while riding; a dodge shakes it off dazed', () => {
  const a = M.shore_gull.attacks.perch;
  const { m, g, hits, until, step, place, only } = arena('shore_gull', 3, { open: true });
  only('perch'); place(0.8);
  until(() => m.state === 'windup');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.perch, 2);
  g.player.x += 1.5; // it rides along
  until(() => m.state === 'recover', 4);
  assert.equal(hits.length, a.ticks, 'one peck a beat');
  assert.ok(Math.abs(m.x - g.player.x) < 1.5, 'it rode along with the hero');
  const b = arena('shore_gull', 3, { open: true });
  b.only('perch'); b.place(0.8);
  b.until(() => b.m.perch, 3);
  b.g.player.dash = { t: 0, dur: 0.3 }; // a dodge
  b.step(0.02);
  assert.equal(b.m.state, 'stunned', 'shaken off, dazed');
  assert.ok(b.hits.length < a.ticks);
});

test('tusk boar toss: scoops the hero in its arc and flings them over its back to land behind it', () => {
  const a = M.tusk_boar.attacks.toss;
  const { m, g, hits, until, step, place, only } = arena('tusk_boar', 5, { open: true, realDamage: true });
  only('toss'); place(0.6);
  until(() => m.state === 'windup');
  const hp = g.player.hp;
  step(a.windup - 0.03);
  assert.equal(g.player.hp, hp, 'nothing in the wind-up');
  until(() => g.player.tossed, 2);
  void hits;
  for (let t = 0; t < a.air + 0.1; t += 0.01) { g.time += 0.01; g.updatePlayer(0.01); }
  assert.equal(g.player.tossed, null, 'landed');
  const along = (g.player.x - m.x) * Math.sin(m.facing) + (g.player.z - m.z) * Math.cos(m.facing);
  assert.ok(along < -a.throw * 0.8, 'behind it');
  assert.ok(g.player.statuses.root, 'dazed where it lands');
  const b = arena('tusk_boar', 5, { open: true });
  b.only('toss'); b.place(0.6);
  b.until(() => b.m.state === 'windup' && b.m.stateT > b.m.windup.total * 0.6);
  Object.assign(b.g.player, { x: 2.5 }); // out of its arc
  b.until(() => b.m.state === 'recover', 2);
  assert.equal(b.hits.length, 0);
  assert.ok(!b.g.player.tossed);
});

test('shore gull snatch: swoops along a curve through the hero, clipping once and stealing gold it drops again when it dies', () => {
  const a = M.shore_gull.attacks.snatch;
  const { m, g, hits, until, step, place, only } = arena('shore_gull', 3, { open: true });
  only('snatch'); place(2.5);
  g.ch.gold = 50;
  until(() => m.state === 'windup');
  const [p0, p1, p2] = m.windup.path, mid = [(p0[0] + 2 * p1[0] + p2[0]) / 4, (p0[1] + 2 * p1[1] + p2[1]) / 4];
  assert.ok(Math.hypot(mid[0] - g.player.x, mid[1] - g.player.z) < 1e-6, 'the curve passes through the hero');
  assert.ok(Math.hypot(mid[0] - (p0[0] + p2[0]) / 2, mid[1] - (p0[1] + p2[1]) / 2) > 0.5, 'a curve, not a straight dash');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.state === 'recover', 3);
  assert.equal(hits.length, 1, 'clipped once');
  assert.equal(g.ch.gold, 50 - a.steal, 'gold taken');
  assert.equal(m.loot, a.steal);
  assert.ok(Math.hypot(m.x - p2[0], m.z - p2[1]) < 1e-6, 'it ends past the hero');
  g.drops = [];
  g.killMonster(m);
  assert.ok(g.drops.some((d) => d.item === 'gold' && d.qty === a.steal), 'the snatched gold falls back out');
  const b = arena('shore_gull', 3, { open: true });
  b.only('snatch'); b.place(2.5);
  b.until(() => b.m.state === 'windup' && b.m.stateT > b.m.windup.total * 0.6);
  Object.assign(b.g.player, { x: b.g.player.x + 3 }); // well off the curve
  b.until(() => b.m.state === 'recover', 3);
  assert.equal(b.hits.length, 0, 'off its curve: missed');
});

test('shore gull shell drop: the clam lands on the marked spot after the climb, then it glides down and eats, open to blows', () => {
  const a = M.shore_gull.attacks.shell_drop;
  const { m, g, hits, until, step, place, only } = arena('shore_gull', 3, { open: true });
  only('shell_drop'); place(5);
  until(() => m.state === 'windup');
  const mark = g.areas.find((x) => x.attack === 'shell_drop');
  assert.ok(mark && Math.abs(mark.delay - (m.windup.total + a.air)) < 1e-9, 'marked to land as it reaches the top');
  step(m.windup.total + a.air - 0.05);
  assert.equal(hits.length, 0, 'nothing before the clam lands');
  step(0.1);
  assert.equal(hits.length, 1, 'the clam lands on the hero');
  until(() => m.state === 'stunned', 2);
  assert.ok(Math.hypot(m.x - mark.x, m.z - mark.z) < 1e-6, 'it came down on the shell');
  m.hp = m.maxHp = 1e7;
  const bare = g.hitMonster(m, 5000, {});
  step(a.feast + 0.1);
  m.state = 'chase';
  const plain = g.hitMonster(m, 5000, {});
  assert.ok(Math.abs(bare / plain - a.exposedTaken) < 0.02, 'eating, it takes more');
});

test('salt slime engulf: hops onto the marked spot; landing on the hero it holds and squeezes it, then spits it out; a miss splats it', () => {
  const a = M.salt_slime.attacks.engulf;
  const { m, g, hits, until, step, place, only } = arena('salt_slime', 2, { open: true });
  only('engulf'); place(1.2);
  until(() => m.state === 'windup');
  const mark = g.areas.find((x) => x.attack === 'engulf');
  assert.ok(mark && !mark.damage, 'the spot is marked, the mark does no harm');
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.hold, 2);
  assert.equal(hits.length, 1, 'the first squeeze as it lands');
  until(() => m.state === 'recover', 3);
  assert.equal(hits.length, a.ticks, 'one squeeze a beat');
  assert.equal(m.hold, null);
  assert.ok(Math.hypot(g.player.x - m.x, g.player.z - m.z) > a.spit * 0.9, 'spat out');
  const r = arena('salt_slime', 2, { open: true, realDamage: true });
  r.only('engulf'); r.place(1.2);
  r.until(() => r.m.hold, 3);
  assert.ok(r.g.player.statuses.root, 'held fast inside');
  const b = arena('salt_slime', 2, { open: true });
  b.only('engulf'); b.place(1.2);
  b.until(() => b.m.state === 'windup');
  Object.assign(b.g.player, { x: 2.5 }); // off the mark
  b.until(() => b.m.state !== 'windup' && b.m.state !== 'act', 3);
  assert.equal(b.m.state, 'stunned', 'a miss splats it flat');
  assert.equal(b.hits.length, 0);
});

test('salt slime brine: a puddle where the hero stood sets into salt after its flight and set time, holding only who is still in it', () => {
  const a = M.salt_slime.attacks.brine;
  const { m, g, hits, until, step, place, only } = arena('salt_slime', 2, { open: true });
  only('brine'); place(4);
  until(() => m.state === 'recover');
  const pool = g.areas.find((x) => x.kind === 'brine');
  assert.ok(pool && Math.abs(pool.delay - (a.flight + a.set)) < 1e-9);
  step(a.flight + a.set - 0.05);
  assert.equal(hits.length, 0, 'nothing before it sets');
  step(0.1);
  assert.equal(hits.length, 1, 'it sets on who stands in it');
  const b = arena('salt_slime', 2, { open: true });
  b.only('brine'); b.place(4);
  b.until(() => b.m.state === 'recover');
  b.step(a.flight + 0.2);
  Object.assign(b.g.player, { x: a.radius + 1.2 }); // stepped out of the puddle
  b.step(a.set);
  assert.equal(b.hits.length, 0, 'out of the puddle: safe');
});

test('salt slime split: under half health, once, a smaller bud pinches off; buds never split and give only gold', () => {
  const sp = M.salt_slime.attacks.split;
  const { m, g, step, place } = arena('salt_slime', 2, { open: true });
  place(5);
  for (const k in m.cd) m.cd[k] = 99;
  m.hp = m.maxHp * sp.at * 0.9;
  step(0.05);
  const buds = g.monsters.filter((q) => q.bud);
  assert.equal(buds.length, 1, 'one bud');
  const b = buds[0];
  assert.ok(b.minion && b.size === sp.size && b.maxHp === Math.round(m.maxHp * sp.share), 'small, weaker, a minion');
  m.state = 'chase'; step(0.5);
  assert.equal(g.monsters.filter((q) => q.bud).length, 1, 'only once');
  b.hp = 1; b.state = 'chase';
  updateMonster(g, b, 0.01);
  assert.equal(g.monsters.filter((q) => q.bud).length, 1, 'a bud never splits');
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

test('hermit crab claw guard: blows from in front glance off its raised claw through the wind-up, its sides do not; then one snap', () => {
  const a = M.hermit_crab.attacks.claw_guard;
  const { m, g, hits, until, step, place, only } = arena('hermit_crab', 11, { open: true });
  only('claw_guard'); place(1);
  until(() => m.state === 'windup');
  const blow = (fx, fz) => { const hp = m.hp; g.hitMonster(m, 400, { fromX: fx, fromZ: fz }); return hp - m.hp; };
  const front = blow(0, 3), side = blow(3, 0);
  assert.ok(front < side * (a.guardTaken + 0.05), `the guard takes the front blow (${front} vs ${side})`);
  assert.ok(g.events.some((e) => e.type === 'clawGuard'), 'the clank is told');
  step(a.windup - m.stateT - 0.02);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.state === 'recover', 2);
  assert.equal(hits.length, 1, 'one snap');
  // out of its arc to the side: a miss; and out of the wind-up its front is soft again
  const b = arena('hermit_crab', 11, { open: true });
  b.only('claw_guard'); b.place(1);
  b.until(() => b.m.state === 'windup');
  b.step(a.windup * 0.6); // locked
  Object.assign(b.g.player, { x: 2.2, z: 0 });
  b.until(() => b.m.state === 'recover', 3);
  assert.equal(b.hits.length, 0, 'beside it: missed');
  const hp = b.m.hp; b.g.hitMonster(b.m, 400, { fromX: 0, fromZ: 3 });
  assert.ok(hp - b.m.hp > front * 2, 'no guard outside the wind-up');
});

test('hermit crab anemones: only at a hero behind it, a rear sting without turning round; in front is safe', () => {
  const a = M.hermit_crab.attacks.anemone;
  const { m, g, hits, until, step, only } = arena('hermit_crab', 11, { open: true });
  only('anemone');
  Object.assign(g.player, { x: 0, z: m.r + g.player.r + 1 }); // in front: never
  step(1);
  assert.notEqual(m.windup?.name, 'anemone', 'not at a hero in front');
  Object.assign(g.player, { x: 0.3, z: -(m.r + g.player.r + 1) }); m.facing = 0; m.state = 'chase';
  until(() => m.windup?.name === 'anemone', 1);
  const f0 = m.facing;
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.state === 'recover', 1);
  assert.equal(hits.length, 1, 'stung behind it');
  assert.ok(Math.abs(m.facing - f0) < 1e-6, 'it never turned');
  const b = arena('hermit_crab', 11, { open: true });
  b.only('anemone'); Object.assign(b.g.player, { x: 0, z: -(b.m.r + b.g.player.r + 1) });
  b.until(() => b.m.windup?.name === 'anemone', 1);
  Object.assign(b.g.player, { x: 0, z: b.m.r + 1.5 }); // ran round to its front
  b.until(() => b.m.state === 'recover', 1);
  assert.equal(b.hits.length, 0, 'in front: safe');
});

test('hermit crab shell shed: a coral burst round it, then it runs bare (fast, soft) and climbs back into the shell it left', () => {
  const a = M.hermit_crab.attacks.shell_shed;
  const { m, g, hits, until, step, place, only } = arena('hermit_crab', 11, { open: true });
  only('shell_shed'); place(1);
  until(() => m.state === 'windup');
  assert.ok(g.areas.some((ar) => ar.kind === 'coral_burst' && ar.radius === a.radius), 'the burst is marked round it');
  step(a.windup - 0.05);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.naked, 1);
  step(0.1);
  assert.equal(hits.length, 1, 'the burst hits once');
  const shell = { x: m.naked.x, z: m.naked.z };
  // bare: softer and faster
  const hp = m.hp; g.hitMonster(m, 400, { fromX: 3, fromZ: 0 });
  const soft = hp - m.hp;
  m.naked = null; const hp2 = m.hp; g.hitMonster(m, 400, { fromX: 3, fromZ: 0 }); const hard = hp2 - m.hp;
  assert.ok(soft > hard * (a.nakedTaken - 0.2), `bare it takes more (${soft} vs ${hard})`);
  m.naked = { name: 'shell_shed', x: shell.x, z: shell.z, facing: 0, until: g.time + a.loose, phase: 'loose' };
  for (const k in m.cd) m.cd[k] = 0; // everything ready: its anemones and shell went with the shell
  Object.assign(g.player, { x: 0, z: -(m.r + g.player.r + 1) });
  step(0.5);
  assert.ok(!['anemone', 'shell_shed'].includes(m.windup?.name), 'no anemones or shed while bare');
  // it wanders off chasing, then goes home and climbs in
  m.state = 'chase'; m.windup = null; m.melee = null; m.x = 4; m.z = 0;
  until(() => m.naked?.phase === 'home', a.loose + 2);
  const x0 = m.x, z0 = m.z; step(0.2);
  const v = Math.hypot(m.x - x0, m.z - z0) / 0.2;
  assert.ok(v > M.hermit_crab.speed * 2, `it hurries home (${v.toFixed(2)} m/s)`);
  until(() => g.events.some((e) => e.type === 'reshell'), 6);
  assert.ok(Math.hypot(m.x - shell.x, m.z - shell.z) < 0.5, 'back in the shell where it left it');
  assert.equal(m.naked, null);
  // giving up the fight while out (its prey gone) does not put it back in a shell: it goes to the one it left first
  const b = arena('hermit_crab', 11, { open: true });
  b.only('shell_shed'); b.place(1);
  b.until(() => b.m.naked, 4);
  const at = { x: b.m.naked.x, z: b.m.naked.z };
  b.m.x += 5; b.m.homeX = b.m.x + 3; // run off a way, its home elsewhere
  Object.assign(b.g.player, { x: 200, z: 200 }); // the hero gone: it gives up
  b.step(0.3);
  assert.ok(b.m.naked, 'still out of its shell, not snapped back into one');
  b.until(() => b.g.events.some((e) => e.type === 'reshell'), 16);
  const ev = b.g.events.find((e) => e.type === 'reshell');
  assert.ok(Math.hypot(ev.x - at.x, ev.z - at.z) < 0.5, 'climbed into the shell where it left it');
});

test('mantis peer strike: it sways to judge the gap, then its forelegs shoot down the locked lane; its body never moves', () => {
  const a = M.thicket_mantis.attacks.peer_strike;
  const { m, g, hits, until, step, place, only } = arena('thicket_mantis', 19, { open: true });
  only('peer_strike'); place(2.8);
  until(() => m.windup?.name === 'peer_strike');
  const x0 = m.x, z0 = m.z;
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the sway');
  until(() => m.state === 'recover', 1);
  assert.equal(hits.length, 1, 'caught at the end of the lane');
  assert.ok(Math.hypot(m.x - x0, m.z - z0) < 1e-6, 'only its forelegs move');
  assert.ok(g.events.some((e) => e.type === 'mantisStrike' && e.hit));
  const b = arena('thicket_mantis', 19, { open: true });
  b.only('peer_strike'); b.place(2.8);
  b.until(() => b.m.windup?.name === 'peer_strike');
  b.step(a.windup * 0.7); // locked
  b.g.player.x += 1.6; // a step aside
  b.until(() => b.m.state === 'recover', 1);
  assert.equal(b.hits.length, 0, 'a step out of the lane after it locks: missed');
});

test('mantis startle: wings spread in the cone before it freeze the hero in fright, and its strike follows at once', () => {
  const { m, g, until, place, only } = arena('thicket_mantis', 19, { open: true, realDamage: true });
  only('startle'); place(1.2);
  until(() => m.windup?.name === 'startle');
  until(() => m.state === 'recover', 2);
  assert.ok(g.player.statuses.root, 'frozen in fright');
  assert.equal(m.cd.peer_strike, 0, 'its strike is ready at once');
  const b = arena('thicket_mantis', 19, { open: true, realDamage: true });
  b.only('startle'); b.place(1.2);
  b.until(() => b.m.windup?.name === 'startle');
  Object.assign(b.g.player, { x: 0, z: -3 }); // behind it
  b.until(() => b.m.state === 'recover', 2);
  assert.ok(!b.g.player.statuses.root, 'out of the cone: not frozen');
});

test('mantis wing leap: it flies over the hero and lands behind them facing round; stepping toward where it came from is safe', () => {
  const a = M.thicket_mantis.attacks.wing_leap;
  const { m, g, hits, until, step, place, only } = arena('thicket_mantis', 19, { open: true });
  only('wing_leap'); place(4);
  until(() => m.windup?.name === 'wing_leap');
  const ar = g.areas.find((x) => x.kind === 'mantis_land'), hz = g.player.z;
  assert.ok(ar && ar.z > hz + a.past - 0.01, 'its landing is marked beyond the hero');
  step(a.windup + a.air - 0.05);
  assert.equal(hits.length, 0, 'nothing before it lands');
  until(() => m.state === 'recover', 1);
  step(0.1);
  assert.equal(hits.length, 1, 'standing still: caught');
  assert.ok(Math.abs(Math.atan2(Math.sin(m.facing - Math.PI), Math.cos(m.facing - Math.PI))) < 0.3, 'turned round to face the hero');
  const b = arena('thicket_mantis', 19, { open: true });
  b.only('wing_leap'); b.place(4);
  b.until(() => b.m.windup?.name === 'wing_leap');
  b.g.player.z -= 1.4; // toward where it came from
  b.until(() => b.m.state === 'recover', 2); b.step(0.1);
  assert.equal(b.hits.length, 0, 'stepped toward its take-off: safe');
});

test('Greyfang hamstring: it darts past the hero, skids round and passes back (three passes once enraged), snapping once a pass; the hero limps', () => {
  const a = M.greyfang.attacks.hamstring;
  const { m, g, until, step, place, only } = arena('greyfang', 22, { open: true, normal: true, realDamage: true });
  only('hamstring'); place(4);
  until(() => m.windup?.name === 'hamstring');
  const hp = g.player.hp;
  step(a.windup - 0.03);
  assert.equal(g.player.hp, hp, 'nothing in the wind-up');
  until(() => m.swoop?.skid > 0, 1);
  assert.ok(g.player.hp < hp, 'snapped at as it passed');
  assert.ok(g.player.statuses.hobble?.slow > 0 && g.player.statuses.hobble.slow < 1, 'hamstrung');
  assert.ok(m.z > g.player.z, 'it ended up past the hero');
  assert.deepEqual(m.windup.path, m.swoop.path, 'the way back is marked through the skid');
  // each pass snaps once, nothing while it skids
  for (const [enraged, passes] of [[false, a.passes], [true, a.enragedPasses]]) {
    const b = arena('greyfang', 22, { open: true, normal: true });
    if (enraged) b.m.hp = b.m.maxHp * 0.4;
    b.only('hamstring'); b.place(4);
    b.until(() => b.m.windup?.name === 'hamstring', 4); // (enraged: after its phase roar)
    b.until(() => b.m.swoop?.skid > 0, 2);
    assert.equal(b.hits.length, 1, 'the first pass: one snap');
    b.step(a.skid - 0.05);
    assert.equal(b.hits.length, 1, 'nothing while it skids');
    b.until(() => b.m.state === 'recover', 4);
    assert.equal(b.hits.length, passes, `${passes} passes, a snap each`);
    assert.equal(b.m.swoop, null);
  }
});

test('Greyfang moon orbit: it runs round the hero (how far is drawn each time), plants, then cuts straight through and on, hitting once', () => {
  const a = M.greyfang.attacks.moon_orbit;
  const { m, g, hits, until, step, place, only } = arena('greyfang', 22, { open: true, normal: true });
  const sweeps = new Set();
  for (let i = 0; i < 2; i++) {
    only('moon_orbit'); place(3); m.state = 'chase';
    until(() => m.lap?.phase === 'run', 2);
    sweeps.add(m.lap.sweep);
    assert.ok(m.lap.sweep >= a.sweepRange[0] && m.lap.sweep <= a.sweepRange[1]);
    until(() => m.lap?.phase === 'aim', 3);
    assert.equal(hits.length, i, 'nothing while it runs round');
    const d = Math.hypot(m.x - g.player.x, m.z - g.player.z), sx = m.x - g.player.x, sz = m.z - g.player.z;
    assert.ok(d >= a.near - 0.1 && d <= a.far + 0.1, 'at its distance');
    step(a.aim - 0.02);
    assert.equal(hits.length, i, 'nothing while it plants');
    until(() => m.state === 'recover', 1);
    assert.equal(hits.length, i + 1, 'one cut, one hit');
    assert.ok((m.x - g.player.x) * sx + (m.z - g.player.z) * sz < 0, 'it ran on through to the far side');
  }
  assert.equal(sweeps.size, 2, 'how far it runs differs each time');
});

test('Greyfang phase two: at half health it stops once to roar, and only then do its moon leap and phantom rush come', () => {
  const G = M.greyfang;
  const { m, g, step, place } = arena('greyfang', 22, { open: true, normal: true });
  assert.equal(Object.keys(G.attacks).length, 5, 'a boss has five skills (owner, 2026-11-06)');
  assert.ok(G.attacks.moon_leap.use.hpBelow === 0.5 && G.attacks.phantom_rush.use.hpBelow === 0.5 && G.enrageAt === 0.5);
  for (const k in m.cd) m.cd[k] = k === 'moon_leap' || k === 'phantom_rush' ? 0 : 99;
  place(3); step(0.5);
  assert.ok(!['moon_leap', 'phantom_rush'].includes(m.windup?.name), 'not while above half');
  m.hp = m.maxHp * 0.45;
  step(0.05);
  assert.ok(m.roaring && m.state === 'recover', 'it roars');
  assert.equal(g.events.filter((e) => e.type === 'phaseRoar').length, 1);
  step(G.kit.phaseRoar - 0.1);
  assert.equal(m.windup, null, 'nothing while it roars');
  for (let t = 0; t < 1 && !m.windup; t += 0.01) step(0.01);
  assert.ok(['moon_leap', 'phantom_rush'].includes(m.windup?.name), 'then the second phase');
  m.state = 'chase'; m.windup = null; m.hp = m.maxHp * 0.3; step(0.5);
  assert.equal(g.events.filter((e) => e.type === 'phaseRoar').length, 1, 'only once');
});

test('Greyfang moon leap: out of reach in the air, its shadow follows the hero, the spot locks, then it crashes: hit and thrown inside, safe outside', () => {
  const a = M.greyfang.attacks.moon_leap;
  for (const out of [false, true]) {
    const { m, g, hits, until, step, place, only } = arena('greyfang', 22, { open: true, normal: true });
    m.hp = m.maxHp * 0.4; m.roared = true; m.enraged = true;
    only('moon_leap'); place(3);
    until(() => m.windup?.name === 'moon_leap', 1);
    until(() => m.leap?.phase === 'track', 2);
    const hp = m.hp;
    assert.equal(m.targetable, false);
    assert.equal(g.hitMonster(m, 500), 0, 'out of reach');
    assert.equal(m.hp, hp);
    g.player.x += 3; // the hero runs: its shadow follows
    until(() => m.leap?.phase === 'lock', 2);
    assert.ok(Math.hypot(m.x - g.player.x, m.z - g.player.z) < 0.3, 'its shadow caught up');
    const lx = m.x, lz = m.z;
    if (out) g.player.x += a.radius + 1.5; // out of the circle
    step(a.lock * 0.5);
    assert.ok(m.x === lx && m.z === lz, 'the spot is locked');
    assert.equal(hits.length, 0, 'nothing before it lands');
    until(() => m.state === 'recover', 2);
    assert.equal(hits.length, out ? 0 : 1, out ? 'outside: safe' : 'inside: hit once');
    assert.equal(m.targetable, true, 'back in reach');
    assert.equal(g.events.filter((e) => e.type === 'moonCrash').length, 1);
  }
});

test('Greyfang phantom rush: three lanes cross at the hero; two shadow wolves, then Greyfang itself, run them a gap apart, each hitting once', () => {
  const a = M.greyfang.attacks.phantom_rush;
  for (const out of [false, true]) {
    const { m, g, hits, until, step, place, only } = arena('greyfang', 22, { open: true, normal: true });
    const run = (sec) => { for (let t = 0; t < sec - 1e-8; t += 0.01) { g.time += 0.01; g.updateProjectiles(0.01); if (!m.dead) updateMonster(g, m, 0.01); } };
    m.hp = m.maxHp * 0.4; m.roared = true; m.enraged = true;
    only('phantom_rush'); place(3);
    until(() => m.windup?.name === 'phantom_rush', 1);
    const { lanes, tx, tz } = m.windup;
    assert.equal(lanes.length, 3);
    for (const [x, z, ang] of lanes) assert.ok(Math.abs((tx - x) * Math.cos(ang) - (tz - z) * Math.sin(ang)) < 0.01, 'each lane runs through the hero');
    if (out) {
      // a spot clear of all three lanes, 4 m out
      let best = null, bestD = 0;
      for (let i = 0; i < 72; i++) {
        const q = (i / 72) * Math.PI * 2, px = tx + Math.sin(q) * 4, pz = tz + Math.cos(q) * 4;
        const d = Math.min(...lanes.map(([x, z, ang]) => Math.abs((px - x) * Math.cos(ang) - (pz - z) * Math.sin(ang))));
        if (d > bestD) { bestD = d; best = [px, pz]; }
      }
      Object.assign(g.player, { x: best[0], z: best[1] });
    }
    run(m.windup.total - 0.03);
    assert.equal(hits.length, 0, 'nothing in the wind-up');
    assert.equal(g.projectiles.filter((p) => p.kind === 'phantom_wolf').length, 0);
    run(0.05);
    assert.equal(g.projectiles.filter((p) => p.kind === 'phantom_wolf').length, 1, 'the first shadow runs');
    run(a.gap);
    assert.equal(g.projectiles.filter((p) => p.kind === 'phantom_wolf').length, 2, 'then the second');
    for (let t = 0; t < 3 && m.state !== 'recover'; t += 0.01) run(0.01);
    assert.equal(m.state, 'recover');
    run(1);
    assert.equal(hits.length, out ? 0 : 3, out ? 'between the lanes: safe' : 'each run hits once');
    assert.equal(m.rush, null);
  }
});

test('Greyfang rally: it howls, spots light round the hero, and its pack comes in there; never more than its cap', () => {
  const a = M.greyfang.attacks.rally;
  const { m, g, until, step, place, only } = arena('greyfang', 22, { open: true, normal: true });
  only('rally'); place(4);
  until(() => m.windup?.name === 'rally');
  const spots = m.windup.spots;
  assert.equal(spots.length, a.summon, 'a spot for each wolf');
  for (const [x, z] of spots) assert.ok(Math.abs(Math.hypot(x - g.player.x, z - g.player.z) - a.ring) < 0.05, 'round the hero');
  assert.equal(g.monsters.filter((o) => o.packOf === m.id).length, 0, 'nobody yet');
  until(() => m.state === 'recover', 3);
  const pack = g.monsters.filter((o) => o.packOf === m.id);
  assert.equal(pack.length, a.summon, 'its pack came');
  for (const w of pack) assert.ok(spots.some(([x, z]) => Math.hypot(w.x - x, w.z - z) < 0.01) && w.aggro, 'each at its spot, on the hero');
  // with its pack full it does not rally again
  for (let i = 0; i < a.cap; i++) { const w = g.spawnMinion(a.pack, 20, 9, 9); w.packOf = m.id; }
  m.state = 'chase'; m.cd.rally = 0;
  for (let t = 0; t < 0.3 && !m.windup; t += 0.01) step(0.01);
  assert.notEqual(m.windup?.name, 'rally', 'its pack is round the hero already');
});

test('reed viper strike: two strikes from its S-coil, the second re-aimed, each biting the first in its lane once; always poison', () => {
  const a = M.reed_viper.attacks.fang_strike;
  const { m, g, hits, until, step, place, only } = arena('reed_viper', 22, { open: true, normal: true });
  assert.equal(M.reed_viper.normal, 'fang_strike');
  only('fang_strike'); place(1.5);
  until(() => m.windup?.name === 'fang_strike', 1);
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  step(0.05);
  assert.equal(hits.length, 1, 'the first strike');
  g.player.x += 1.2; // the hero moves: the second strike follows
  step(a.gap - 0.05);
  assert.equal(hits.length, 1, 'nothing between the strikes');
  until(() => m.state === 'recover', 0.3);
  assert.equal(hits.length, a.strikes, 'the second strike, re-aimed');
  // stepping aside late (after the second one locks) dodges it
  const b = arena('reed_viper', 22, { open: true, normal: true });
  b.only('fang_strike'); b.place(1.5);
  b.until(() => b.m.windup?.name === 'fang_strike', 1);
  b.until(() => b.m.fangs, 1);
  b.step(a.gap * 0.7);
  b.g.player.x += 3;
  b.until(() => b.m.state === 'recover', 1);
  assert.equal(b.hits.length, 1);
  // the venom always takes
  const c = arena('reed_viper', 22, { open: true, normal: true, realDamage: true });
  c.only('fang_strike'); c.place(1.5);
  c.until(() => c.m.state === 'recover', 3);
  assert.ok(c.g.player.statuses.poison, 'poisoned');
});

test('reed viper constrict: it rushes down its lane and wraps round the hero, squeezing; a dodge or hurting it frees them; a miss ends it', () => {
  const a = M.reed_viper.attacks.constrict;
  const { m, g, hits, until, step, place, only } = arena('reed_viper', 22, { open: true });
  only('constrict'); place(4);
  until(() => m.windup?.name === 'constrict', 1);
  step(a.windup - 0.03);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.coil?.phase === 'hold', 1);
  assert.equal(hits.length, 1, 'caught');
  assert.ok(g.player.statuses.root, 'held fast');
  step(a.tick * 2 + 0.05);
  assert.equal(hits.length, 3, 'squeezed every tick');
  until(() => m.state === 'recover', a.hold);
  assert.ok(hits.length <= 1 + Math.floor(a.hold / a.tick) + 1);
  assert.ok(!g.player.statuses.root, 'let go');
  // a dodge tears free
  const b = arena('reed_viper', 22, { open: true });
  b.only('constrict'); b.place(4);
  b.until(() => b.m.coil?.phase === 'hold', 3);
  b.g.player.x += 2; // the dodge
  b.step(0.05);
  assert.equal(b.m.coil, null); assert.equal(b.m.state, 'recover');
  assert.ok(!b.g.player.statuses.root);
  // hurting it frees them too
  const c = arena('reed_viper', 22, { open: true });
  c.only('constrict'); c.place(4);
  c.until(() => c.m.coil?.phase === 'hold', 3);
  c.m.hp -= c.m.maxHp * a.breakShare;
  c.step(0.05);
  assert.equal(c.m.coil, null);
  // out of the lane: it rushes past and lets it go
  const d = arena('reed_viper', 22, { open: true });
  d.only('constrict'); d.place(4);
  d.until(() => d.m.windup?.name === 'constrict', 1);
  d.step(d.m.windup.total * 0.7);
  d.g.player.x += 3;
  d.until(() => d.m.state === 'recover', 2);
  assert.equal(d.hits.length, 0);
});

test('reed viper tail lash: taken on what is behind it; the arc round its back is cut once, its front is safe', () => {
  const a = M.reed_viper.attacks.tail_lash;
  for (const [x, z, expect] of [[0, -2, 1], [-2.2, -0.6, 1], [0, 2, 0]]) {
    const { m, g, hits, until, step, only } = arena('reed_viper', 22, { open: true });
    only('tail_lash'); Object.assign(g.player, { x: 0, z: -2 }); // behind it: it lashes
    until(() => m.windup?.name === 'tail_lash', 1);
    Object.assign(g.player, { x, z });
    step(a.windup - 0.03);
    assert.equal(hits.length, 0, 'nothing in the wind-up');
    until(() => m.state === 'recover', 0.2);
    assert.equal(hits.length, expect, `hero at ${x}, ${z}`);
  }
  // in front of it, it never lashes
  const f = arena('reed_viper', 22, { open: true });
  f.only('tail_lash'); f.place(0.8); f.step(0.5);
  assert.notEqual(f.m.windup?.name, 'tail_lash');
});

test('marsh wisp lost lights: two flames weave either side of their line to the hero, each hitting once; burn', () => {
  const a = M.marsh_wisp.attacks.wisp_orb;
  const { m, g, hits, until, step, place, only } = arena('marsh_wisp', 25, { open: true, normal: true });
  const run = (sec) => { for (let t = 0; t < sec - 1e-8; t += 0.01) { g.time += 0.01; g.updateProjectiles(0.01); if (!m.dead) updateMonster(g, m, 0.01); } };
  assert.equal(M.marsh_wisp.normal, 'wisp_orb');
  only('wisp_orb'); place(6);
  until(() => m.windup?.name === 'wisp_orb', 1);
  run(a.windup - 0.03);
  assert.equal(g.projectiles.length, 0, 'nothing in the wind-up');
  run(0.05);
  const orbs = g.projectiles.filter((p) => p.kind === 'wisp_orb');
  assert.equal(orbs.length, a.count);
  // they weave: off the straight line by up to amp, on opposite sides
  run((a.wavelength / 4) / a.speed);
  assert.ok(orbs[0].x * orbs[1].x < 0, 'on either side');
  for (const o of orbs) assert.ok(Math.abs(o.x) > a.amp * 0.8 && Math.abs(o.x) <= a.amp + 0.01, 'a swing off the line');
  for (let t = 0; t < 3 && g.projectiles.length; t += 0.01) run(0.01);
  assert.equal(hits.length, a.count, 'both hit the hero standing on the line');
});

test('marsh wisp marsh gas: spots from it to past the hero, each bubbling through the wind-up, catching fire in turn', () => {
  const a = M.marsh_wisp.attacks.marsh_gas;
  const { m, g, hits, until, step, place, only } = arena('marsh_wisp', 25, { open: true });
  only('marsh_gas'); place(5);
  until(() => m.windup?.name === 'marsh_gas', 1);
  const gas = g.areas.filter((x) => x.kind === 'marsh_gas');
  assert.ok(gas.length >= 4 && gas.length <= a.count);
  for (let i = 1; i < gas.length; i++) assert.ok(Math.abs(gas[i].delay - gas[i - 1].delay - a.step) < 1e-9, 'one after another');
  assert.ok(gas[gas.length - 1].z > g.player.z, 'on past the hero');
  step(gas[0].delay - 0.05);
  assert.equal(hits.length, 0, 'nothing before the first catches');
  step(gas[gas.length - 1].delay + 0.4 - gas[0].delay + 0.05);
  assert.equal(hits.length, 1, 'caught once by the run');
  // standing off the line: safe
  const b = arena('marsh_wisp', 25, { open: true });
  b.only('marsh_gas'); b.place(5);
  b.until(() => b.m.windup?.name === 'marsh_gas', 1);
  b.g.player.x += 3;
  b.step(3);
  assert.equal(b.hits.length, 0);
});

test('marsh wisp bog lure: the bog is marked toward it; the hero is drawn into it, walking away fights it, a dodge breaks out', () => {
  const a = M.marsh_wisp.attacks.bog_lure;
  const { m, g, until, step, place, only } = arena('marsh_wisp', 25, { open: true, realDamage: true });
  only('bog_lure'); place(7);
  until(() => m.windup?.name === 'bog_lure', 1);
  const pool = g.areas.find((x) => x.kind === 'bog_pool');
  assert.ok(pool && Math.abs(Math.hypot(pool.x - g.player.x, pool.z - g.player.z) - a.poolDist) < 0.05, 'marked toward the wisp');
  assert.ok(Math.hypot(pool.x - m.x, pool.z - m.z) < Math.hypot(g.player.x - m.x, g.player.z - m.z));
  until(() => m.state === 'recover', 2);
  assert.ok(g.player.statuses.lure, 'lured');
  const d0 = Math.hypot(g.player.x - pool.x, g.player.z - pool.z);
  for (let i = 0; i < 30; i++) { g.time += 0.02; g.updatePlayer(0.02); }
  const d1 = Math.hypot(g.player.x - pool.x, g.player.z - pool.z);
  assert.ok(d1 < d0 - 0.8, 'drawn toward the bog');
  // a dodge breaks out
  g.player.dash = { t: 0, dur: 0.2, vx: 0, vz: 0 }; g.tickPlayerStatuses(0.01); g.player.dash = null;
  assert.ok(!g.player.statuses.lure, 'a dodge breaks out');
});

test('marsh wisp: come close and it scatters and gathers again further off', () => {
  const bl = M.marsh_wisp.kit.blink;
  const { m, g, step, place } = arena('marsh_wisp', 25, { open: true });
  for (const k in m.cd) m.cd[k] = 99;
  place(0.5);
  const d0 = Math.hypot(m.x - g.player.x, m.z - g.player.z);
  step(0.05);
  assert.ok(Math.hypot(m.x - g.player.x, m.z - g.player.z) > d0 + bl.distance * 0.8, 'gone off');
  assert.equal(g.events.filter((e) => e.type === 'blink').length, 1);
});

test('gale hawk stoop: hovers high watching the spot, locks, stoops down its line and rakes only the last stretch, once', () => {
  const a = M.gale_hawk.attacks.stoop;
  assert.equal(M.gale_hawk.normal, 'stoop');
  const { m, g, hits, until, step, place } = arena('gale_hawk', 28, { open: true, normal: true });
  place(7);
  until(() => m.windup?.name === 'stoop', 1);
  assert.equal(m.altTo, a.hover, 'climbs into its hover');
  // followed through the first part of the wind-up, then held
  g.player.x = 1; step(m.windup.total * 0.3);
  assert.ok(Math.abs(m.windup.tx - 1) < 1e-9, 'follows the hero');
  step(m.windup.total * (a.lock - 0.3) + 0.02);
  const tx = m.windup.tx, tz = m.windup.tz;
  g.player.x = 0.3; step(0.05);
  assert.equal(m.windup.tx, tx, 'locked');
  assert.equal(hits.length, 0);
  until(() => m.state === 'act', 1);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  until(() => m.state === 'recover', 2);
  assert.equal(hits.length, 1, 'raked once');
  assert.ok(Math.hypot(m.x - tx, m.z - tz) > a.past - 0.3, 'on past the spot');
  assert.ok(!m.stoop && !m.altTo, 'clean afterwards');
  // stepped aside after the lock: missed
  const b = arena('gale_hawk', 28, { open: true, normal: true });
  b.place(7);
  b.until(() => b.m.windup?.name === 'stoop', 1);
  b.step(b.m.windup.total * 0.95);
  assert.ok(Math.hypot(b.m.x - b.m.windup.tx, b.m.z - b.m.windup.tz) > a.standoff * 0.8, 'draws off for a long stoop');
  b.g.player.x += a.width / 2 + b.g.player.r + 0.6;
  b.until(() => b.m.state === 'recover', 3);
  assert.equal(b.hits.length, 0, 'a step aside after the lock');
  // nothing near its take-off: only the low stretch strikes
  const c = arena('gale_hawk', 28, { open: true, normal: true });
  c.place(9);
  c.until(() => c.m.windup?.name === 'stoop', 1);
  c.step(c.m.windup.total * a.lock + 0.05);
  Object.assign(c.g.player, { x: 0, z: 1.5 });
  c.until(() => c.m.state === 'recover', 3);
  assert.equal(c.hits.length, 0, 'high over the first part of its line');
});

test('gale hawk thunder wings: up in the air, each downstroke calls a bolt onto where the hero stands then, struck after its delay', () => {
  const a = M.gale_hawk.attacks.thunder_wings;
  const { m, g, hits, until, step, place, only } = arena('gale_hawk', 28, { open: true });
  only('thunder_wings'); place(5);
  until(() => m.windup?.name === 'thunder_wings', 1);
  assert.equal(m.altTo, a.hover, 'climbs');
  until(() => m.state === 'act', 2);
  step(0.02);
  const first = g.areas.filter((x) => x.kind === 'storm_bolt');
  assert.equal(first.length, 1, 'one bolt marked on the first beat');
  assert.ok(Math.hypot(first[0].x - g.player.x, first[0].z - g.player.z) < 1e-9, 'where the hero stands');
  // the hero keeps walking: each bolt lands where they stood a beat before, so a moving hero is never struck
  for (let t = 0; t < a.every * a.strikes + a.delay + 0.5; t += 0.01) { g.player.x += 3 * 0.01; step(0.01); }
  assert.equal(hits.length, 0, 'a moving hero outruns every bolt');
  assert.equal(g.events.filter((e) => e.type === 'stormBeat').length, a.strikes);
  assert.ok(m.state !== 'act' && !m.storm, 'clean afterwards');
  // standing still: every bolt lands, each once
  const b = arena('gale_hawk', 28, { open: true });
  b.only('thunder_wings'); b.place(5);
  b.until(() => b.m.state === 'act', 3);
  b.step(a.delay - 0.05);
  assert.equal(b.hits.length, 0, 'nothing before the first bolt strikes');
  b.step(a.every * (a.strikes - 1) + 0.4);
  assert.equal(b.hits.length, a.strikes);
});

test('gale hawk storm feathers: a zigzag of feathers across its line through the hero; the strands crackle in pulses after a charge', () => {
  const a = M.gale_hawk.attacks.storm_feathers;
  const { m, g, hits, until, step, place, only } = arena('gale_hawk', 28, { open: true });
  only('storm_feathers'); place(6);
  until(() => m.windup?.name === 'storm_feathers', 1);
  const fence = g.areas.find((x) => x.kind === 'storm_fence'), pts = fence.fence.pts;
  assert.equal(pts.length, a.count);
  assert.ok(Math.abs(Math.hypot(pts[0][0] - pts[a.count - 1][0], pts[0][1] - pts[a.count - 1][1]) - a.span) < 1, 'its span across the line');
  // the hero on a strand
  Object.assign(g.player, { x: (pts[1][0] + pts[2][0]) / 2, z: (pts[1][1] + pts[2][1]) / 2 });
  step(fence.delay - 0.05);
  assert.equal(hits.length, 0, 'nothing before the charge is spent');
  step(0.1);
  assert.equal(hits.length, 1, 'the first pulse');
  step(a.every * (a.pulses - 1) + 0.1);
  assert.equal(hits.length, a.pulses, 'once a pulse');
  step(1);
  assert.equal(hits.length, a.pulses);
  assert.ok(!g.areas.includes(fence), 'gone after its pulses');
  // off the fence: safe
  const b = arena('gale_hawk', 28, { open: true });
  b.only('storm_feathers'); b.place(6);
  b.until(() => b.m.windup?.name === 'storm_feathers', 1);
  b.g.player.z += 3;
  b.step(4);
  assert.equal(b.hits.length, 0);
});

test('ironhorn ram rearing clash: rears through the wind-up, drops forward onto the blow, a frontal cone with knockback, once', () => {
  const a = M.ironhorn_ram.attacks.rear_clash;
  assert.equal(M.ironhorn_ram.normal, 'rear_clash');
  const { m, g, until, step, place } = arena('ironhorn_ram', 29, { open: true, normal: true });
  const hits = [];
  g.damageUnit = (u, amount, src, opts) => hits.push({ t: g.time, opts });
  place(1.2);
  until(() => m.windup?.name === 'rear_clash', 1);
  const z0 = m.z, start = g.time;
  until(() => m.state === 'recover', 2);
  assert.equal(hits.length, 1, 'struck once');
  assert.ok(hits[0].t - start >= m.def.attacks.rear_clash.windup - 0.02, 'not before the wind-up ends');
  assert.equal(hits[0].opts.knock.force, a.knock, 'knocked back');
  assert.ok(Math.abs(m.z - z0 - a.lunge) < 1e-6, 'dropped forward onto it');
  step(a.recover + 0.1);
  // off to the side: outside the cone
  const b = arena('ironhorn_ram', 29, { open: true, normal: true });
  b.place(1.2);
  b.until(() => b.m.windup?.name === 'rear_clash', 1);
  b.step(b.m.windup.total * 0.7);
  Object.assign(b.g.player, { x: 3, z: 0 });
  b.until(() => b.m.state === 'recover', 2);
  assert.equal(b.hits.length, 0);
});

test('ironhorn ram run-up charge: backs off facing its prey, charges the locked lane, pulls up on what it strikes; a miss leaves it reeling', () => {
  const a = M.ironhorn_ram.attacks.run_charge;
  const { m, g, until, only, place } = arena('ironhorn_ram', 29, { open: true });
  const hits = [];
  g.damageUnit = (u, amount, src, opts) => { hits.push({ opts }); return amount; };
  only('run_charge'); place(6);
  until(() => m.windup?.name === 'run_charge', 1);
  const z0 = m.z;
  until(() => m.state === 'act', 3);
  assert.ok(z0 - m.z > a.backoff * 0.9, 'backed off for its run-up');
  until(() => m.state !== 'act', 3);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].opts.knock.force, a.knock, 'flung');
  assert.equal(m.state, 'recover', 'pulled up on its prey');
  assert.equal(g.events.filter((e) => e.type === 'clash').length, 1);
  // stepped out of the lane: it runs on and is left reeling
  const b = arena('ironhorn_ram', 29, { open: true });
  b.only('run_charge'); b.place(6);
  b.until(() => b.m.state === 'act', 3);
  b.g.player.x = 4;
  b.until(() => b.m.state !== 'act', 3);
  assert.equal(b.hits.length, 0);
  assert.equal(b.m.state, 'stunned', 'off balance');
});

test('ironhorn ram horn hook: taken on a flank, its horns hook out to that side without turning, flinging the hero sideways', () => {
  const a = M.ironhorn_ram.attacks.horn_hook;
  const { m, g, until, only } = arena('ironhorn_ram', 29, { open: true });
  const hits = [];
  g.damageUnit = (u, amount, src, opts) => hits.push({ opts });
  only('horn_hook');
  // in front: no hook
  Object.assign(g.player, { x: 0, z: m.r + g.player.r + 1 });
  for (let i = 0; i < 5; i++) { g.time += 0.01; updateMonster(g, m, 0.01); }
  assert.ok(m.windup?.name !== 'horn_hook', 'not for one in front');
  m.state = 'chase'; m.windup = null; m.facing = 0;
  // on its left flank (+x)
  Object.assign(g.player, { x: m.r + g.player.r + 0.8, z: 0.3 });
  until(() => m.windup?.name === 'horn_hook', 1);
  assert.ok(Math.abs(m.facing) < 1e-9, 'keeps its facing');
  until(() => m.state === 'recover', 2);
  assert.equal(hits.length, 1);
  assert.ok(Math.abs(Math.abs(angleOf(hits[0].opts.knock.angle)) - Math.PI / 2) < 1e-6, 'flung out sideways');
  assert.ok(Math.sin(hits[0].opts.knock.angle) > 0, 'to the side it was on');
  assert.equal(hits[0].opts.knock.force, a.knock);
});
const angleOf = (a) => Math.atan2(Math.sin(a), Math.cos(a));

test('duskmane stalker twin swat: two paw strikes at their own times, stepping in; behind it is safe', () => {
  const a = M.duskmane_stalker.attacks.dusk_swat;
  assert.equal(M.duskmane_stalker.normal, 'dusk_swat');
  const { m, g, hits, until, step, place } = arena('duskmane_stalker', 31, { open: true, normal: true });
  place(0.6);
  until(() => m.windup?.name === 'dusk_swat', 1);
  until(() => m.state === 'act', 2);
  assert.equal(hits.length, 0, 'nothing in the wind-up');
  step(a.hits[0].at + 0.02);
  assert.equal(hits.length, 1, 'the first paw');
  step(a.hits[1].at - a.hits[0].at);
  assert.equal(hits.length, 2, 'the second paw');
  until(() => m.state !== 'act', 2);
  assert.equal(hits.length, 2, 'never a third');
  const b = arena('duskmane_stalker', 31, { open: true, normal: true });
  b.place(0.6);
  b.until(() => b.m.windup?.name === 'dusk_swat', 1);
  b.step(b.m.windup.total * 0.7);
  Object.assign(b.g.player, { x: 0, z: -(b.m.r + b.g.player.r + 0.5) });
  b.until(() => b.m.state !== 'act' && b.m.state !== 'windup', 3);
  assert.equal(b.hits.length, 0);
});

test('duskmane stalker dusk stalk: unseen and out of reach it creeps round to the hero\'s back leaving paw prints, shows itself, then lunges', () => {
  const a = M.duskmane_stalker.attacks.dusk_stalk;
  const { m, g, hits, until, step, only, place } = arena('duskmane_stalker', 31, { open: true });
  only('dusk_stalk'); place(5);
  g.player.facing = Math.PI; // the hero faces the stalker (toward -z): its back is at +z
  until(() => m.windup?.name === 'dusk_stalk', 1);
  until(() => m.state === 'act', 2);
  assert.ok(m.stealth && m.targetable === false, 'gone into the dusk, out of reach');
  assert.equal(g.hitMonster(m, 100, {}), 0, 'cannot be struck unseen');
  until(() => m.stalk?.phase === 'aim', a.creep + 0.5);
  assert.ok(g.events.filter((e) => e.type === 'pawPrint').length >= 5, 'paw prints left along the way');
  assert.ok(m.z > g.player.z, 'round at the hero\'s back');
  assert.ok(!m.stealth && m.targetable !== false, 'shown again to strike');
  assert.equal(hits.length, 0, 'nothing before the lunge');
  until(() => m.state === 'recover', 2);
  assert.equal(hits.length, 1, 'raked once');
  assert.ok(!m.stalk && !m.stealth && m.targetable !== false, 'clean afterwards');
  // stepped out of the locked lane while it showed itself: missed
  const b = arena('duskmane_stalker', 31, { open: true });
  b.only('dusk_stalk'); b.place(5); b.g.player.facing = Math.PI;
  b.until(() => b.m.stalk?.phase === 'aim', 5);
  b.g.player.x += 2.5;
  b.until(() => b.m.state === 'recover', 2);
  assert.equal(b.hits.length, 0);
});

test('duskmane stalker sprint chase: it bends after the hero but turns slowly: standing still is bowled over, a late side-step makes it overrun', () => {
  const a = M.duskmane_stalker.attacks.sprint_chase;
  const { m, g, hits, until, only, place } = arena('duskmane_stalker', 31, { open: true });
  only('sprint_chase'); place(8);
  until(() => m.state === 'act', 2);
  until(() => m.state !== 'act', a.duration + 0.5);
  assert.equal(hits.length, 1, 'bowled over');
  assert.equal(g.events.filter((e) => e.type === 'sprintHit').length, 1);
  // a late step aside (2.5 m to the side when it is close): it cannot turn in time
  const b = arena('duskmane_stalker', 31, { open: true });
  b.only('sprint_chase'); b.place(8);
  b.until(() => b.m.state === 'act', 2);
  b.until(() => Math.hypot(b.m.x - b.g.player.x, b.m.z - b.g.player.z) < 3, 2);
  b.g.player.x += 2.5;
  b.until(() => b.m.state !== 'act', a.duration + 0.5);
  assert.equal(b.hits.length, 0, 'overran');
  assert.equal(b.m.state, 'recover');
  assert.equal(b.g.events.filter((e) => e.type === 'sprintSkid').length, 1);
});

test('crag golem hammer fists: a slam before it, then the aftershock through the band around it; standing just outside the slam is caught later', () => {
  const a = M.crag_golem.attacks.hammer_fists;
  assert.equal(M.crag_golem.normal, 'hammer_fists');
  const { m, g, hits, until, step, place } = arena('crag_golem', 33, { open: true, normal: true });
  place(1.5);
  until(() => m.windup?.name === 'hammer_fists', 1);
  const slam = g.areas.find((x) => x.kind === 'golem_slam'), after = g.areas.find((x) => x.kind === 'golem_aftershock');
  assert.ok(slam && after && after.inner === a.radius && after.radius === a.ring, 'both marked at once');
  assert.ok(Math.abs(after.delay - slam.delay - a.after) < 1e-9);
  step(slam.delay - 0.05);
  assert.equal(hits.length, 0);
  step(0.1);
  assert.equal(hits.length, 1, 'the slam');
  step(a.after + 0.1);
  assert.equal(hits.length, 1, 'inside the slam the aftershock passes over');
  // stepped back out of the slam into the band: the aftershock catches it
  const b = arena('crag_golem', 33, { open: true, normal: true });
  b.place(1.5);
  b.until(() => b.m.windup?.name === 'hammer_fists', 1);
  const c = b.g.areas.find((x) => x.kind === 'golem_slam');
  Object.assign(b.g.player, { x: c.x, z: c.z + (a.radius + a.ring) / 2 + 0.2 });
  b.step(c.delay + a.after + 0.2);
  assert.equal(b.hits.length, 1, 'the aftershock');
});

test('crag golem boulder hurl: the landing marked where the hero stood, then fragments skid out along the marked lanes', () => {
  const a = M.crag_golem.attacks.boulder_hurl;
  const { m, g, hits, until, step, only, place } = arena('crag_golem', 33, { open: true });
  only('boulder_hurl'); place(7);
  until(() => m.windup?.name === 'boulder_hurl', 1);
  const land = g.areas.find((x) => x.kind === 'boulder');
  assert.ok(Math.hypot(land.x - g.player.x, land.z - g.player.z) < 1e-9, 'where the hero stands');
  assert.equal(land.shards.angles.length, a.shards);
  // out of the landing but on a lane: a fragment
  const ang = land.shards.angles[0];
  Object.assign(g.player, { x: land.x + Math.sin(ang) * (a.radius + 1.2), z: land.z + Math.cos(ang) * (a.radius + 1.2) });
  step(land.delay - 0.05);
  assert.equal(hits.length, 0);
  step(0.1);
  assert.equal(hits.length, 0, 'out of the landing');
  assert.equal(g.projectiles.filter((p) => p.kind === 'rock_shard').length, a.shards, 'shattered');
  for (let t = 0; t < 1; t += 0.01) { g.time += 0.01; g.updateProjectiles(0.01); }
  assert.equal(hits.length, 1, 'a fragment on its lane');
});

test('crag golem rock orbit: rubble swings round it striking what it passes, each rock once, then is flung straight out', () => {
  assert.ok(M.crag_golem.attacks.rock_orbit.ring - M.crag_golem.attacks.rock_orbit.rockRadius - 0.4 > M.crag_golem.radius + 0.5, 'room to hug it inside the ring');
  const a = M.crag_golem.attacks.rock_orbit;
  const { m, g, hits, until, step, only, place } = arena('crag_golem', 33, { open: true });
  only('rock_orbit');
  // standing in the orbit's band
  Object.assign(g.player, { x: 0, z: a.ring });
  until(() => m.windup?.name === 'rock_orbit', 1);
  until(() => m.state === 'act', 2);
  step(a.spin - 0.05);
  const turns = (a.turnSpeed * a.spin) / (Math.PI * 2);
  assert.ok(hits.length >= a.rocks - 1 && hits.length <= a.rocks, `each rock passes once (${hits.length})`);
  assert.ok(turns > 0.75, 'swung most of the way round');
  step(0.1);
  assert.equal(g.projectiles.filter((p) => p.kind === 'rock_shard').length, a.rocks, 'flung out');
  assert.ok(!m.orbit && m.state === 'recover');
  // hugging it, inside the ring: safe from the swing
  const b = arena('crag_golem', 33, { open: true });
  b.only('rock_orbit'); Object.assign(b.g.player, { x: 0, z: b.m.r + b.g.player.r + 0.1 });
  b.until(() => b.m.state === 'act', 3);
  b.step(a.spin + 1);
  assert.equal(b.hits.length, 0, 'inside the ring');
});

test('rune sentinel shard volley: its ring shards fly at the hero one after another, each aimed as it goes', () => {
  const a = M.rune_sentinel.attacks.shard_volley;
  assert.equal(M.rune_sentinel.normal, 'shard_volley');
  const { m, g, until, step, place } = arena('rune_sentinel', 35, { open: true, normal: true });
  place(6);
  until(() => m.state === 'act', 2);
  step(0.01);
  assert.equal(g.projectiles.filter((p) => p.kind === 'rune_shard').length, 1, 'one at a time');
  g.player.x = 3; // moving: the later shards follow
  step(a.every * (a.count - 1) + 0.05);
  const shards = g.projectiles.filter((p) => p.kind === 'rune_shard');
  assert.equal(g.events.filter((e) => e.type === 'shardLaunch').length, a.count);
  assert.ok(shards.some((p) => p.vx > 1), 'later shards aimed at where the hero went');
  until(() => m.state !== 'act', 2);
  assert.ok(!m.volley);
});

test('rune sentinel rune seal: a circle round the hero closes after its glyphs light; still inside, struck and held', () => {
  const a = M.rune_sentinel.attacks.rune_seal;
  const { m, g, until, step, only, place } = arena('rune_sentinel', 35, { open: true, realDamage: true });
  only('rune_seal'); place(5);
  until(() => m.windup?.name === 'rune_seal', 1);
  const seal = g.areas.find((x) => x.kind === 'rune_seal');
  assert.ok(Math.hypot(seal.x - g.player.x, seal.z - g.player.z) < 1e-9 && seal.radius === a.radius);
  step(seal.delay - 0.05);
  assert.ok(!g.player.statuses.root, 'not before it closes');
  step(0.1);
  assert.ok(g.player.statuses.root, 'sealed in');
  const b = arena('rune_sentinel', 35, { open: true, realDamage: true });
  b.only('rune_seal'); b.place(5);
  b.until(() => b.m.windup?.name === 'rune_seal', 1);
  b.g.player.x += a.radius + 1;
  b.step(a.windup + 0.2);
  assert.ok(!b.g.player.statuses.root, 'stepped out before it closed');
});

test('rune sentinel searchlight: a cone of light follows the hero slowly; held in it long enough, a bolt strikes; out of it, nothing', () => {
  const a = M.rune_sentinel.attacks.searchlight;
  const { m, g, hits, until, step, only, place } = arena('rune_sentinel', 35, { open: true });
  only('searchlight'); place(6);
  until(() => m.state === 'act', 2);
  step(a.build - 0.05);
  assert.equal(hits.length, 0, 'not yet spotted');
  step(0.1);
  assert.equal(hits.length, 1, 'spotted and struck');
  step(a.build - 0.1);
  assert.equal(hits.length, 1, 'spotted afresh before the next');
  // out of the light, and staying ahead of its slow turn: never struck
  const b = arena('rune_sentinel', 35, { open: true });
  b.only('searchlight'); b.place(6);
  b.until(() => b.m.state === 'act', 2);
  for (let t = 0; t < a.duration; t += 0.01) {
    const ang = Math.atan2(b.g.player.x - b.m.x, b.g.player.z - b.m.z) + 1.2 * 0.01; // circling it faster than it turns
    const d = Math.hypot(b.g.player.x - b.m.x, b.g.player.z - b.m.z);
    b.g.player.x = b.m.x + Math.sin(ang) * d; b.g.player.z = b.m.z + Math.cos(ang) * d;
    b.step(0.01);
  }
  assert.equal(b.hits.length, 0, 'outran the light');
  b.until(() => b.m.state !== 'act', 2);
  assert.ok(!b.m.search);
});
