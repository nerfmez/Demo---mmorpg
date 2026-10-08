// Mid/high monsters (levels 11-24): each has its own readable pattern, gives experience at the
// pace of its zone and is the main source of the parts its gear tier needs, so high gear does not
// hang on repeated boss kills. Attack safety: no damage before the authored time, never twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { updateMonster } from '../../src/core/ai.js';
import { monsterExpPerMin, recipeFarming, bossOnlyMaterials, balanceAt } from '../../src/core/balance.js';

const NEW = ['thicket_mantis', 'reed_viper', 'ironhorn_ram', 'duskmane_stalker', 'rune_sentinel'];
const M = data.monsters.monsters, spawns = Object.values(data.maps).flatMap((m) => m.spawns);
const gear = Object.values(data.recipes.recipes).filter((r) => r.type === 'gear');

function arena(type, level = 15) {
  const g = new Game(data, { seed: 9 });
  const m = g.spawnMinion(type, level, 0, 0);
  g.monsters = [m];
  g.isSafe = () => false;
  g.moveEntity = (u, dx, dz) => { u.x += dx; u.z += dz; return {}; };
  Object.assign(m, { x: 0, z: 0, homeX: 0, homeZ: 0, facing: 0, state: 'chase', stateT: 0, aggro: true, damage: 1 });
  for (const key in m.cd) m.cd[key] = 0;
  const hits = [];
  g.damageUnit = (u, amount) => hits.push({ id: u.id, amount, t: g.time });
  const step = (seconds) => { for (let t = 0; t < seconds - 1e-8; t += 0.01) { g.time += 0.01; g.updateAreas(0.01); if (!m.dead) updateMonster(g, m, 0.01); } };
  const until = (cond, seconds = 20) => { for (let t = 0; t < seconds && !cond(); t += 0.01) step(0.01); assert.ok(cond(), `${type}: stuck in ${m.state}`); };
  const place = (gap, side = 0) => Object.assign(g.player, { x: side, z: m.r + g.player.r + gap });
  return { g, m, hits, step, until, place };
}

test('five new monsters fill levels 11-24 with patterns of their own', () => {
  const signature = (m) => [m.behavior, ...Object.keys(m.attacks).sort()].join('|');
  const old = new Set(Object.entries(M).filter(([id]) => !NEW.includes(id)).map(([, m]) => signature(m)));
  for (const id of NEW) {
    const m = M[id];
    assert.ok(m && !m.boss, id);
    assert.ok(!old.has(signature(m)), `${id} is not a copy of an older monster's pattern`);
    for (const a of Object.values(m.attacks)) assert.ok(a.windup >= 0.4, `${id}: every attack has a visible wind-up`);
    const where = spawns.filter((s) => s.monster === id);
    assert.ok(where.length && where.every((s) => s.level[0] >= 11), `${id} lives in the mid/high zones`);
  }
  // the gap is filled: every level band from 11 to 24 has a new monster
  for (let level = 11; level <= 24; level++) assert.ok(spawns.some((s) => NEW.includes(s.monster) && s.level[0] <= level && s.level[1] >= level), `level ${level}`);
});

test('new monsters give experience at the pace of their zone, never above its fastest', () => {
  for (const id of NEW) for (const s of spawns.filter((x) => x.monster === id)) {
    const level = Math.round((s.level[0] + s.level[1]) / 2);
    const peers = spawns.filter((x) => x.zone === s.zone && !NEW.includes(x.monster) && x.level[0] <= level + 2 && x.level[1] >= level - 2);
    assert.ok(peers.length, `${id} has zone peers`);
    const rates = peers.map((p) => monsterExpPerMin(data, 'sword', p.monster, level));
    const own = monsterExpPerMin(data, 'sword', id, level);
    assert.ok(own <= Math.max(...rates) * 1.0001 && own >= Math.min(...rates) * 0.8, `${id} @${s.zone} ${own.toFixed(0)} exp/min vs ${rates.map((r) => r.toFixed(0))}`);
  }
});

test('high gear is crafted from monsters of its band; boss parts are a small key, not the bulk', () => {
  const boss = bossOnlyMaterials(data);
  for (const item of ['greyfang_mane', 'warden_horn', 'ancient_core']) assert.ok(boss.has(item), item + ' stays a boss part');
  const band = (tier) => { let m = 0; for (let l = tier; l < tier + 5; l++) m += balanceAt(data, 'sword', l).minutes; return m; };
  const avg = {};
  for (const r of gear.filter((x) => x.itemLevel >= 11)) {
    for (const [item, n] of Object.entries(r.cost)) if (boss.has(item)) assert.ok(n <= 2, `${r.result}: ${item} ×${n}`);
    const f = recipeFarming(data, r);
    assert.ok(f.bossKills <= 2, `${r.result} needs ${f.bossKills} boss kills`);
    // at least three pieces of a tier can be farmed while levelling through its band
    assert.ok(f.minutes * 3 <= band(r.itemLevel), `${r.result}: ${f.minutes.toFixed(0)} min vs band ${band(r.itemLevel).toFixed(0)} min`);
    (avg[r.itemLevel] ||= []).push(f.minutes);
  }
  const mean = (t) => avg[t].reduce((a, b) => a + b, 0) / avg[t].length;
  assert.ok(mean(11) < mean(16) && mean(16) < mean(21), 'each tier takes longer to farm');
  // the main part of each new monster feeds several recipes of its band
  for (const [id, part] of [['thicket_mantis', 'mantis_scythe'], ['reed_viper', 'viper_scale'], ['ironhorn_ram', 'ram_horn'], ['duskmane_stalker', 'dusk_pelt'], ['rune_sentinel', 'rune_core']]) {
    assert.ok(M[id].drops.some((d) => d.item === part), id);
    assert.ok(gear.filter((r) => r.cost[part]).length >= 4, `${part} is used by several recipes`);
  }
  // Wardenstalker: the stalker's pelt is the bulk, the Greyfang mane a small key
  for (const id of ['wardenstalker_coat', 'wardenstalker_hood', 'wardenstalker_gloves']) {
    const r = gear.find((x) => x.result === id), f = recipeFarming(data, r);
    assert.equal(f.parts.dusk_pelt.monster, 'duskmane_stalker');
    assert.ok(r.cost.dusk_pelt >= 6 * r.cost.greyfang_mane, id);
  }
});

test('melee strikes (mantis scythe, stalker claw) land once at the authored time, miss outside the arc', () => {
  for (const [type, name] of [['thicket_mantis', 'scythe'], ['duskmane_stalker', 'claw']]) {
    const { m, hits, step, until, place } = arena(type);
    const atk = m.def.attacks[name];
    place(0.4);
    m.cd.whirl = m.cd.pounce = 99;
    step(0.01);
    assert.equal(m.windup?.name, name);
    until(() => m.state === 'act');
    assert.equal(hits.length, 0, `${type}: nothing during the wind-up`);
    step(atk.hitTime - 0.02);
    assert.equal(hits.length, 0, `${type}: nothing before contact`);
    step(0.03);
    assert.equal(hits.length, 1, `${type}: contact lands once`);
    until(() => m.state !== 'act');
    assert.equal(hits.length, 1, `${type}: never twice`);
    // a late step behind the monster dodges the locked arc
    const b = arena(type);
    b.place(0.4); b.m.cd.whirl = b.m.cd.pounce = 99;
    b.step(0.01); b.step(b.m.windup.total * 0.7);
    Object.assign(b.g.player, { x: 0, z: -(b.m.r + b.g.player.r + 0.3) });
    b.until(() => b.m.state !== 'act' && b.m.state !== 'windup');
    assert.equal(b.hits.length, 0, `${type}: behind the arc is safe`);
  }
});

test('viper lash is an instant short line; the ram shoves in a cone and knocks back', () => {
  const v = arena('reed_viper');
  v.place(3); v.m.cd.venom = 99;
  v.step(0.01);
  assert.equal(v.m.windup?.name, 'lash');
  v.step(v.m.windup.total * 0.7);
  v.until(() => v.m.state === 'recover');
  assert.equal(v.hits.length, 1, 'the lash lands once');
  const w = arena('reed_viper');
  w.place(3); w.m.cd.venom = 99;
  w.step(0.01);
  w.step(w.m.windup.total * 0.7);
  w.g.player.x = 2.5; // a late side-step leaves the locked line
  w.until(() => w.m.state === 'recover');
  assert.equal(w.hits.length, 0, 'dodged');

  const r = arena('ironhorn_ram');
  r.place(2); r.m.cd.stomp = 99;
  r.step(0.01);
  assert.equal(r.m.windup?.name, 'shove');
  r.until(() => r.m.state === 'recover');
  assert.equal(r.hits.length, 1, 'one shove');
  assert.equal(r.m.charge, null, 'a shove is not a rush');
});

test('marked areas (venom pool, pounce, stomp, shards) hurt only when they land, inside their circle', () => {
  const v = arena('reed_viper');
  v.place(6); v.m.cd.lash = 99;
  v.step(0.01);
  assert.equal(v.m.windup?.name, 'venom');
  const pool = v.g.areas.find((a) => a.kind === 'venom_pool');
  assert.ok(pool && pool.delay >= v.m.windup.total, 'the pool is marked before it lands');
  v.step(pool.delay - 0.05);
  assert.equal(v.hits.length, 0, 'nothing before it lands');
  v.step(pool.duration + 0.2);
  assert.ok(v.hits.length >= 3 && v.hits.length <= Math.ceil(pool.duration / pool.tick) + 1, 'ticks while standing in it');

  const s = arena('duskmane_stalker');
  s.place(5); s.m.cd.claw = 99;
  s.step(0.01);
  assert.equal(s.m.windup?.name, 'pounce');
  s.g.player.x = 4; // stepped out of the marked landing
  s.until(() => s.m.state === 'recover', 5);
  assert.equal(s.hits.length, 0, 'leaving the mark dodges the pounce');

  for (const [type, name] of [['ironhorn_ram', 'stomp'], ['rune_sentinel', 'shards']]) {
    const a = arena(type);
    a.place(0.3);
    a.m.cd.shove = a.m.cd.beam = 99;
    a.step(0.01);
    assert.equal(a.m.windup?.name, name);
    a.step(a.m.windup.total - 0.03);
    assert.equal(a.hits.length, 0, `${name}: nothing during the wind-up`);
    a.until(() => a.m.state === 'recover');
    a.step(0.05);
    assert.equal(a.hits.length, 1, `${name}: one hit`);
  }
});

test('sentinel beam hits along its line once and misses beside it; the stalker shows itself to attack', () => {
  for (const [side, expect] of [[0, 1], [2.2, 0]]) {
    const a = arena('rune_sentinel');
    a.place(6); a.m.cd.shards = 99;
    a.step(0.01);
    assert.equal(a.m.windup?.name, 'beam');
    a.step(a.m.windup.total * 0.7);
    a.g.player.x = side;
    a.until(() => a.m.state === 'recover');
    assert.equal(a.hits.length, expect, `beam at side ${side}`);
  }
  const s = arena('duskmane_stalker');
  s.place(5.5); s.m.cd.pounce = s.m.cd.claw = 3;
  s.step(0.5);
  assert.equal(s.m.stealth, true, 'circles half-seen');
  s.until(() => s.m.state === 'windup', 6);
  assert.equal(s.m.stealth, false, 'every wind-up is shown in full');
});

test('killing a monster during its wind-up cancels the area it marked; a launched attack still lands', () => {
  for (const [type, gap, block] of [['reed_viper', 6, 'lash'], ['duskmane_stalker', 5, 'claw']]) {
    const a = arena(type);
    a.place(gap); a.m.cd[block] = 99;
    a.step(0.01);
    assert.equal(a.m.state, 'windup');
    assert.equal(a.g.areas.length, 1, `${type} marked its landing`);
    a.g.killMonster(a.m);
    assert.equal(a.g.areas.length, 0, `${type}: nothing lands after it died mid wind-up`);
    for (let t = 0; t < 3; t += 0.01) a.g.updateAreas(0.01); // the game no longer drives a dead monster
    assert.equal(a.hits.length, 0);
  }
  const v = arena('reed_viper');
  v.place(6); v.m.cd.lash = 99;
  v.step(0.01);
  v.until(() => v.m.state === 'recover');
  v.g.killMonster(v.m);
  assert.equal(v.g.areas.length, 1, 'venom already in the air still lands');
});

test('wolf rend and Greyfang rake are multi-hit combos; the warden quake is a line of delayed eruptions', () => {
  for (const [type, name, n] of [['thornback_wolf', 'rend', 2], ['greyfang', 'rake', 3]]) {
    const a = arena(type);
    const atk = a.m.def.attacks[name];
    a.place(1.2); a.m.cd.bite = 99;
    if (type === 'greyfang') a.m.hp = a.m.maxHp; // no howl
    a.step(0.01);
    assert.equal(a.m.windup?.name, name, type);
    a.until(() => a.m.state === 'act');
    assert.equal(a.hits.length, 0, `${name}: nothing during the wind-up`);
    for (let i = 0; i < atk.hits.length; i++) {
      a.until(() => a.m.stateT >= atk.hits[i].at - 0.015);
      assert.equal(a.hits.length, i, `${name}: no damage before hit ${i + 1}`);
      a.step(0.02);
      assert.equal(a.hits.length, i + 1, `${name}: hit ${i + 1} lands once`);
    }
    a.until(() => a.m.state !== 'act');
    assert.equal(a.hits.length, n, `${name}: exactly ${n} contacts`);
    assert.equal(a.m.melee, null, `${name}: strike state clears after recovery`);
    assert.equal(a.m.charge, null, `${name} is not a rush`);
    assert.ok(atk.hits.length === n);
  }
  const w = arena('horned_warden');
  w.place(7); w.m.cd.slam = w.m.cd.sweep = 99;
  w.step(0.01);
  assert.equal(w.m.windup?.name, 'quake');
  const quakes = w.g.areas.filter((x) => x.kind === 'quake');
  assert.equal(quakes.length, w.m.def.attacks.quake.steps, 'marked along the line at wind-up start');
  assert.ok(quakes.every((x, i) => i === 0 || x.delay > quakes[i - 1].delay), 'they go off one after another');
  assert.equal(w.hits.length, 0);
});

test('new contact attacks miss out of range/arc and death cancels remaining combo contacts', () => {
  for (const [type, name, gap] of [['thornback_wolf', 'rend', 1.2], ['greyfang', 'rake', 1.2], ['thicket_mantis', 'whirl', 0.6], ['ironhorn_ram', 'shove', 1.5]]) {
    for (const miss of ['range', 'arc']) {
      if (name === 'whirl' && miss === 'arc') continue; // authored 360 degree ring
      const a = arena(type);
      a.place(gap);
      for (const key in a.m.cd) a.m.cd[key] = key === name ? 0 : 99;
      a.step(0.01); a.step(a.m.windup.total * 0.7);
      Object.assign(a.g.player, { x: 0, z: miss === 'range' ? 30 : -(a.m.r + a.g.player.r + gap) });
      a.until(() => a.m.state === 'recover');
      assert.equal(a.hits.length, 0, `${name}: ${miss} miss`);
    }
    if (!['rend', 'rake'].includes(name)) continue;
    const a = arena(type);
    a.place(gap); a.m.cd.bite = 99;
    a.step(0.01); a.until(() => a.m.state === 'act');
    a.until(() => a.hits.length === 1);
    a.g.killMonster(a.m); a.step(2);
    assert.equal(a.hits.length, 1, `${name}: no post-death contact`);
    assert.equal(a.m.melee, null);
  }
});
