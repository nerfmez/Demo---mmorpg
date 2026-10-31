// Elemental job skills (owner, 2026-10-31): plain skills, one per element, for the spell archer (bow) and
// the spellblade (sword). Skills stay easy to understand; harder rules belong in the Job Tree or PvP
// skills. Rules: core/frontier-content.js (melee_line afterShock, melee_arc discharge, endProjectile
// shatter), core/game-simulation.js (zone ticks stack a skill's poison); numbers in data/skills.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { craft } from '../../src/core/crafting.js';

const SKILLS = {
  fire_arrow_rain: ['spellarcher', 'fire'], frost_shatter_arrow: ['spellarcher', 'cold'], thunder_lance: ['spellarcher', 'lightning'], poison_mist_arrow: ['spellarcher', 'poison'],
  flame_slash: ['spellblade', 'fire'], ice_spikes: ['spellblade', 'cold'], thunder_slash: ['spellblade', 'lightning'],
};
const C = data.skills.combat;

const fixture = (id) => {
  const ch = createCharacter(data, { kit: 'bow' });
  ch.stats = { STR: 60, DEX: 60, INT: 60, AGI: 60, VIT: 60, LUK: 5 };
  ch.skills[id] = 1;
  ch.slots = [{ skill: id, mods: [] }, ...ch.slots.slice(1).map(() => ({ skill: null, mods: [] }))];
  const g = new Game(data, { seed: 7, character: ch });
  g.player.x = 0; g.player.z = 0; g.player.facing = Math.PI / 2;
  g.derived.weaponType = C[id].requiresWeapon[0];
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  const m0 = g.monsters[0];
  const mk = (mid, x, z, extra = {}) => ({ ...m0, id: mid, x, z, hp: 1e6, maxHp: 1e6, defense: 0, boss: false, dead: false, state: 'chase', aggro: true, statuses: {}, r: 0.5, ...extra });
  g.monsters = [];
  g.world = { surfaceY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, safe: () => false };
  g.isSafe = () => false; g.derived.critChance = 0; g.player.mp = g.player.maxMp; g.drainEvents();
  return { g, mk, s: g.skills[0] };
};
// the hero aims along +X (facing PI/2); the ground point is for area skills
const aim = { angle: Math.PI / 2, x: 5, z: 0 };
const run = (g, seconds, onStep) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.02) {
    g.time += 0.02;
    const due = []; g.pending = g.pending.filter((q) => ((q.t -= 0.02) > 0 ? true : (due.push(q.fn), false))); due.forEach((fn) => fn());
    g.updateProjectiles(0.02); g.updateAreas(0.02);
    onStep?.(t + 0.02);
  }
};
const hitsOn = (g) => { const by = {}; for (const e of g.drainEvents()) if (e.type === 'hit') by[e.id] = (by[e.id] || 0) + 1; return by; };

test('the seven are their jobs\' skills of one element each, learned at the workbench from real drops, waiting for pictures', () => {
  const drops = new Set(Object.values(data.monsters.monsters).flatMap((m) => m.drops.map((d) => d.item)));
  for (const [id, [job, element]] of Object.entries(SKILLS)) {
    const def = C[id];
    assert.ok(def.job === job && def.element === element && def.iconPending && def.nameTh, id);
    assert.deepEqual(def.requiresWeapon.includes(job === 'spellarcher' ? 'bow' : 'sword'), true, id);
    const r = data.recipes.recipes['learn_' + id];
    assert.ok(r?.type === 'skill' && r.result === id, id);
    for (const k of Object.keys(r.cost)) assert.ok(k === 'gold' || drops.has(k), `${id}: ${k} drops somewhere`);
    const ch = createCharacter(data); ch.gold = r.cost.gold; ch.materials = Object.fromEntries(Object.entries(r.cost).filter(([k]) => k !== 'gold'));
    assert.ok(craft(ch, data, 'learn_' + id).ok, id);
    assert.ok(fixture(id).s.requirementsMet, `${id}: castable with its weapon`);
  }
});

test('Flame Arrow Rain: its waves fall on the circle, in fire, and set some of what they hit burning', () => {
  const { g, mk, s } = fixture('fire_arrow_rain');
  const D = C.fire_arrow_rain;
  const ms = Array.from({ length: 8 }, (_, i) => mk('in' + i, aim.x + 1.5 * Math.cos(i), 1.5 * Math.sin(i)));
  g.monsters = [...ms, mk('out', aim.x + D.radius + 2, 0)];
  g.executeSkill(s, aim);
  run(g, D.delay + D.waves * D.waveInterval + 0.5);
  const by = {}, els = new Set();
  for (const e of g.drainEvents()) if (e.type === 'hit' && !e.dot) { by[e.id] = (by[e.id] || 0) + 1; els.add(e.element); }
  for (const m of ms) assert.equal(by[m.id], D.waves, `${m.id} takes every wave`);
  assert.ok(!by.out, 'outside the circle is safe');
  assert.deepEqual([...els], ['fire']);
  assert.ok(ms.some((m) => m.statuses.burn), 'some of them burn');
});

test('Shatter Arrow: stopped by a monster it breaks into a fan of shards that fly on and chill; the struck one is not hit again; a miss never breaks', () => {
  const D = C.frost_shatter_arrow;
  {
    const { g, mk, s } = fixture('frost_shatter_arrow');
    const first = mk('first', 3, 0), behind = mk('behind', 3 + D.shatter.range * 0.6, 0.3), side = mk('side', 3 + 1.5, -1.0), aside = mk('aside', 3, 6);
    g.monsters = [first, behind, side, aside];
    g.executeSkill(s, aim);
    run(g, 1.5);
    const ev = g.drainEvents(), by = {};
    for (const e of ev) if (e.type === 'hit') by[e.id] = (by[e.id] || 0) + 1;
    assert.equal(ev.filter((e) => e.type === 'shatter').length, 1, 'it breaks once');
    assert.equal(by.first, 1, 'the struck one takes the arrow only');
    assert.ok(by.behind >= 1 && by.side >= 1, 'the shards fly on into the ones behind it');
    assert.ok(!by.aside, 'the fan points along the arrow, not sideways');
    for (const m of [first, behind, side]) assert.ok(m.statuses.chill?.slow === D.chill.slow, `${m.id} chilled`);
    assert.ok(first.hp - behind.hp < 0 && Math.abs((1e6 - behind.hp) / (1e6 - first.hp) - D.shatter.mult) < 0.02, 'a shard is the arrow times its share');
    assert.equal(g.projectiles.length, 0, 'the shards fly their range and are gone, never breaking again');
  }
  {
    const { g, s } = fixture('frost_shatter_arrow');
    g.executeSkill(s, aim);
    run(g, 1.5);
    assert.ok(!g.drainEvents().some((e) => e.type === 'shatter'), 'flying its range out breaks nothing');
  }
});

test('Thunder Lance strikes the whole lane at once, then the lane strikes again a beat later, weaker, stunning all but bosses', () => {
  const { g, mk, s } = fixture('thunder_lance');
  const D = C.thunder_lance, A = D.afterShock;
  const near = mk('near', 2, 0.2), far = mk('far', D.range - 0.5, -0.3), boss = mk('boss', 6, 0, { boss: true }), beside = mk('beside', 5, D.width / 2 + 1.5), behind = mk('behind', -2, 0);
  g.monsters = [near, far, boss, beside, behind];
  g.executeSkill(s, aim);
  const first = hitsOn(g);
  assert.deepEqual(Object.keys(first).sort(), ['boss', 'far', 'near'], 'every one in the lane, at once; not beside or behind');
  const after1 = 1e6 - near.hp;
  run(g, A.delay - 0.06);
  assert.deepEqual(hitsOn(g), {}, 'nothing more before the after-shock');
  g.player.x = 20; // the hero moving away does not move the lane
  run(g, 0.12);
  const second = hitsOn(g);
  assert.deepEqual(Object.keys(second).sort(), ['boss', 'far', 'near'], 'the same lane again');
  assert.ok(Math.abs((1e6 - near.hp - after1) / after1 - A.mult) < 0.02, 'weaker by its share');
  assert.equal(near.state, 'stunned'); assert.equal(far.state, 'stunned');
  assert.notEqual(boss.state, 'stunned', 'a boss is not stunned');
});

test('Miasma Arrow: the mist poisons on each tick and its poison stacks up to the most stacks', () => {
  const { g, mk, s } = fixture('poison_mist_arrow');
  const D = C.poison_mist_arrow;
  const m = mk('in', aim.x + 1, 0), out = mk('out', aim.x + D.radius + 2, 0);
  g.monsters = [m, out];
  g.executeSkill(s, aim);
  let most = 0;
  run(g, D.duration + 0.1, () => { most = Math.max(most, m.statuses.poison?.stacks || 0); });
  assert.equal(most, D.poison.maxStacks, 'stacks up to the most');
  assert.ok(m.hp < 1e6 && !out.statuses.poison && out.hp === 1e6, 'outside the mist is safe');
  assert.ok(g.drainEvents().some((e) => e.type === 'hit' && e.element === 'poison'));
});

test('Flame Slash cuts a wide arc in front and burns; Ice Spikes runs a lane and chills', () => {
  {
    const { g, mk, s } = fixture('flame_slash');
    const D = C.flame_slash, half = D.arc / 2 - 8, r = D.range - 0.6;
    const at = (deg) => [r * Math.sin(Math.PI / 2 + deg * Math.PI / 180), r * Math.cos(Math.PI / 2 + deg * Math.PI / 180)];
    g.monsters = [mk('front', 2, 0), mk('wide', ...at(half)), mk('wideR', ...at(-half)), mk('behind', -2, 0), mk('past', D.range + 1.5, 0)];
    g.executeSkill(s, aim);
    assert.deepEqual(Object.keys(hitsOn(g)).sort(), ['front', 'wide', 'wideR'], 'the whole wide arc, nothing behind or past it');
  }
  {
    const { g, mk, s } = fixture('ice_spikes');
    const D = C.ice_spikes;
    const a = mk('a', 1.5, 0), b = mk('b', D.range - 0.4, 0.3);
    g.monsters = [a, b, mk('past', D.range + 1.5, 0), mk('beside', 3, D.width / 2 + 1.5)];
    g.executeSkill(s, aim);
    assert.deepEqual(Object.keys(hitsOn(g)).sort(), ['a', 'b']);
    for (const m of [a, b]) assert.equal(m.statuses.chill?.slow, D.chill.slow);
  }
});

test('Thunder Slash: the cut, then its charge bursts ahead a beat later and reaches past the blade', () => {
  const { g, mk, s } = fixture('thunder_slash');
  const D = C.thunder_slash, X = D.discharge;
  const front = mk('front', 1.5, 0), reach = mk('reach', X.ahead + X.radius - 0.3, 0), behind = mk('behind', -3.5, 0);
  g.monsters = [front, reach, behind];
  g.executeSkill(s, aim);
  assert.deepEqual(Object.keys(hitsOn(g)), ['front'], 'the cut reaches only its own range');
  run(g, X.delay - 0.04);
  assert.deepEqual(hitsOn(g), {}, 'the charge waits its beat');
  run(g, 0.08);
  const ev = g.drainEvents();
  assert.deepEqual(ev.filter((e) => e.type === 'hit').map((e) => e.id).sort(), ['front', 'reach'], 'the burst ahead, not behind');
  assert.ok(ev.some((e) => e.type === 'burst' && e.kind === 'discharge' && e.element === 'lightning'));
});
