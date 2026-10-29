// Stat thresholds (owner, 2026-10-29, docs/STATS-TH.md): 50/100/150/200 total points in a stat unlock a
// perk that changes behaviour. Data in progression.statPerks, rules in core/stat-perks.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LearnedGame as Game, legacyData as data } from './helpers.js';
import { activePerks, perkList, PERK_STATS } from '../../src/core/stat-perks.js';
import { computeSkill } from '../../src/core/skills.js';

const withStats = (g, stats) => {
  Object.assign(g.ch.stats, stats);
  g.refresh();
  return g;
};
const setup = (stats, seed = 21) => {
  const g = withStats(new Game(data, { seed }), stats);
  const m = g.monsters.find((q) => q.type === 'crag_golem');
  const s = g.freeSpotNear(m.x - 1.8, m.z);
  g.player.x = s.x;
  g.player.z = s.z;
  m.x = s.x + 1.8;
  m.z = s.z;
  m.def = { ...m.def, defense: 0 };
  m.defense = 0;
  m.hp = m.maxHp = 1e7;
  g.derived.critChance = 0;
  for (const o of g.monsters) if (o !== m) o.dead = true;
  return { g, m };
};
const aimAt = (g, m) => ({ angle: Math.atan2(m.x - g.player.x, m.z - g.player.z), x: g.player.x, z: g.player.z });
const swing = (g, m) => {
  const hp = m.hp;
  m.staggerT = 0;
  g.executeSkill(g.skills[0], aimAt(g, m));
  g.time += 0.4;
  return hp - m.hp;
};

test('every stat has four perks at 50/100/150/200, named and described, and the totals unlock them', () => {
  const all = data.progression.statPerks;
  const ids = new Set();
  for (const s of PERK_STATS) {
    assert.deepEqual(all[s].map((p) => p.at), [50, 100, 150, 200], s);
    for (const p of all[s]) {
      assert.ok(p.id && p.nameTh && p.descTh, `${s} ${p.id}`);
      assert.ok(!ids.has(p.id), p.id);
      ids.add(p.id);
    }
  }
  const stats = { STR: 149, AGI: 0, DEX: 50, LUK: 0, INT: 200, VIT: 0 };
  assert.deepEqual(Object.keys(activePerks(data, stats)).sort(), ['dex_armor', 'int_free', 'int_flow', 'int_focus', 'int_return', 'str_crush', 'str_heavy'].sort());
  const list = perkList(data, stats);
  assert.equal(list.length, 6);
  assert.deepEqual(list.find((r) => r.stat === 'STR').perks.map((p) => p.active), [true, true, false, false]);
  // a new hero has none; gear and the tree count toward the totals like trained points
  const g = new Game(data, { seed: 1 });
  assert.equal(g.derived.perks, null);
});

test('STR: every 4th attack of any kind is heavy (+40%, staggers), every 3rd at 200; a staggered enemy takes +25% at 100', () => {
  const { g, m } = setup({ STR: 50 });
  const hits = [swing(g, m), swing(g, m), swing(g, m), swing(g, m), swing(g, m)];
  assert.ok(Math.abs(hits[3] / hits[0] - 1.4) < 0.02, hits.join());
  assert.ok(Math.abs(hits[4] / hits[0] - 1) < 0.02, hits.join());
  g.player.perk.swings = 3;
  m.staggerT = 0;
  g.executeSkill(g.skills[0], aimAt(g, m));
  assert.ok(m.staggerT >= 0.4 - 1e-9, 'the heavy blow staggers');
  // not only melee: the 4th cast is a heavy arrow or spell too, and the mark rides on its projectile
  const fb = g.skills[g.ch.slots.findIndex((q) => q.skill === 'firebolt')];
  g.player.perk.swings = 0;
  for (let i = 0; i < 3; i++) g.executeSkill(fb, aimAt(g, m));
  g.projectiles.length = 0;
  g.executeSkill(fb, aimAt(g, m));
  assert.equal(g.projectiles.at(-1).skill.perkHeavy, true);
  assert.equal(g.hitOpts(g.projectiles.at(-1).skill).heavy, true);

  const t = setup({ STR: 200 });
  const h = [swing(t.g, t.m), swing(t.g, t.m), swing(t.g, t.m)];
  assert.ok(Math.abs(h[2] / h[0] - 1.4) < 0.02, h.join());
  // a boss is staggered by the heavy blow only at 200
  t.m.boss = true;
  swing(t.g, t.m); swing(t.g, t.m);
  t.m.staggerT = 0;
  t.g.executeSkill(t.g.skills[0], aimAt(t.g, t.m));
  assert.ok(t.m.staggerT >= 0.25 - 1e-9);

  const c = setup({ STR: 100 });
  const plain = swing(c.g, c.m);
  c.g.player.perk.swings = 0;
  const hp = c.m.hp;
  c.m.staggerT = 0.5;
  c.g.executeSkill(c.g.skills[0], aimAt(c.g, c.m));
  assert.ok(Math.abs((hp - c.m.hp) / plain - 1.25) < 0.02);
});

test('STR 150: a crit sends a shockwave to the enemies around the target', () => {
  const { g, m } = setup({ STR: 150 });
  const o = g.monsters.find((q) => q !== m && q.dead);
  Object.assign(o, { dead: false, x: m.x + 1.5, z: m.z + 1.8, hp: 1e6, maxHp: 1e6 });
  g.derived.critChance = 1;
  g.drainEvents();
  g.executeSkill(g.skills[0], aimAt(g, m));
  assert.ok(o.hp < 1e6, 'the neighbour outside the swing is hit by the shockwave');
  assert.ok(g.drainEvents().some((e) => e.type === 'perk' && e.id === 'str_quake'));
});

test('AGI: a quick cast after moving, a dodge refunds a charge, +1 charge, a doubled hit after a dodge', () => {
  const { g, m } = setup({ AGI: 200 });
  assert.equal(g.move.charges, data.skills.movement[g.ch.movement].charges + 1 + (g.derived.extraMovementCharges - 1));
  const before = g.move.charges;
  withStats(g, { AGI: 140 });
  assert.equal(g.move.charges, before - 1);
  withStats(g, { AGI: 200 });
  g.player.movement.charges = g.move.charges;
  g.player.momentum = null;
  assert.ok(g.useMovement());
  assert.ok(g.player.momentum && g.player.momentum.speed >= 0.3);
  // a dodge inside the movement skill's invulnerability gives the charge back once per 4 s
  g.player.dash.inv = true;
  const left = g.player.movement.charges;
  g.damagePlayer(50, m);
  assert.equal(g.player.movement.charges, left + 1);
  g.damagePlayer(50, m);
  assert.equal(g.player.movement.charges, left + 1);
  // and the next hit within 2 s does double
  g.player.dash = null;
  g.player.perk.swings = -99;
  const base = (() => { const s = g.player.perk.shadowUntil; g.player.perk.shadowUntil = -1; const d = swing(g, m); g.player.perk.shadowUntil = s; return d; })();
  g.time -= 0.4;
  const doubled = swing(g, m);
  assert.ok(Math.abs(doubled / base - 2) < 0.03, `${doubled} ${base}`);
});

test('DEX: hits ignore part of the armour, every skill reaches further, the same target takes more, crits mark it', () => {
  const { g, m } = setup({ DEX: 200 });
  // armour: 15% of the monster's defense is ignored by the hero's own skills
  m.defense = 200;
  const pierced = g.hitMonster(m, 1000, { skill: 'slash', crit: false });
  const plain = g.hitMonster(m, 1000, { element: 'physical' });
  assert.ok(pierced > plain * 1.01, `${pierced} ${plain}`);
  m.defense = 0;
  // reach: +10% range on a dagger cut and an arrow alike
  for (const id of ['slash', 'firebolt']) {
    const i = g.ch.slots.findIndex((q) => q.skill === id);
    const far = computeSkill(g.ch, data, g.derived, i), near = computeSkill(g.ch, data, { ...g.derived, perks: null }, i);
    assert.ok(Math.abs(far.range / near.range - 1.1) < 1e-9, id);
  }
  // the same target: +3% a hit up to +15%, a new target starts again
  g.player.targetId = m.id;
  const hits = [];
  for (let i = 0; i < 7; i++) hits.push(g.hitMonster(m, 1000, { skill: 'slash', crit: false }));
  assert.ok(Math.abs(hits[1] / hits[0] - 1.03) < 0.01 && Math.abs(hits[6] / hits[0] - 1.15) < 0.01, hits.join());
  g.player.targetId = 'other';
  assert.ok(Math.abs(g.hitMonster(m, 1000, { skill: 'slash', crit: false }) / hits[0] - 1) < 0.01, 'not the target: no bonus');
  g.player.targetId = m.id;
  g.player.perk.focusId = 'other';
  assert.ok(Math.abs(g.hitMonster(m, 1000, { skill: 'slash', crit: false }) / hits[0] - 1) < 0.01, 'a new target starts again');
  g.player.targetId = null;
  // each crit on the same target adds crit damage, up to five stacks
  m.perkMarks = 0;
  const c0 = g.hitMonster(m, 1000, { skill: 'slash', crit: true });
  for (let i = 0; i < 6; i++) g.hitMonster(m, 1000, { skill: 'slash', crit: true });
  assert.equal(m.perkMarks, 5);
  const c5 = g.hitMonster(m, 1000, { skill: 'slash', crit: true });
  assert.ok(Math.abs(c5 / c0 - 1.3) < 0.01, `${c5} ${c0}`);
});

test('LUK: a lethal hit is survived once per 90 s, a cast may reset its cooldown, a jackpot crit, a crystal find', () => {
  const { g, m } = setup({ LUK: 200 });
  g.derived.dodgeChancePct = 0;
  g.player.hp = 5;
  g.damagePlayer(1e5, m);
  assert.equal(g.player.dead, false);
  assert.equal(g.player.hp, 1);
  assert.equal(g.damagePlayer(1e5, m), 0, 'a moment of invulnerability');
  g.time += 2;
  g.damagePlayer(1e5, m);
  assert.equal(g.player.dead, true, 'once per 90 s');

  const t = setup({ LUK: 200 });
  t.g.perkRng = { chance: () => true };
  t.g.player.mp = 999;
  assert.ok(t.g.castSlot(0, null));
  assert.equal(t.g.player.cooldowns[0], 0);
  const plain = t.g.hitMonster(t.m, 1000, { skill: 'slash', crit: true });
  t.g.perkRng = { chance: () => false };
  const normal = t.g.hitMonster(t.m, 1000, { skill: 'slash', crit: true });
  assert.ok(Math.abs(plain / normal - 2) < 0.01);
  t.g.perkRng = { chance: () => true };
  t.m.hp = 1;
  const drops = t.g.drops.length;
  t.g.hitMonster(t.m, 10, { element: 'physical' });
  assert.ok(t.g.drops.slice(drops).some((d) => d.item === 'skill_crystal'));
});

test('INT: a skill that lands returns MP once, the shield recharges sooner and faster, every 5th cast is free, full MP hits harder', () => {
  const { g, m } = setup({ INT: 200 });
  const fb = g.ch.slots.findIndex((s) => s.skill === 'firebolt');
  const s = g.skills[fb];
  g.player.perk = undefined;
  g.player.mp = 100;
  g.player.cooldowns[fb] = 0;
  g.castSlot(fb, null);
  const after = g.player.mp;
  g.hitMonster(m, 100, g.hitOpts(s, { crit: false }));
  assert.ok(Math.abs(g.player.mp - after - s.cost * 0.15) < 1e-6);
  g.hitMonster(m, 100, g.hitOpts(s, { crit: false }));
  assert.ok(Math.abs(g.player.mp - after - s.cost * 0.15) < 1e-6, 'once per cast');
  // MP at 80% or more: every skill +20% (a melee one too)
  const slash = g.skills[0];
  g.player.mp = g.player.maxMp;
  const full = g.hitMonster(m, 1000, g.hitOpts(slash, { crit: false }));
  g.player.mp = 0;
  const low = g.hitMonster(m, 1000, g.hitOpts(slash, { crit: false }));
  assert.ok(Math.abs(full / low - 1.2) < 0.01);
  // every 5th paid cast gives its MP back
  g.player.perk.casts = 0;
  const spent = [];
  for (let i = 0; i < 5; i++) {
    g.player.cast = null;
    g.player.cooldowns[0] = 0;
    g.player.mp = 500;
    g.castSlot(0, null);
    spent.push(500 - g.player.mp);
  }
  assert.ok(spent.slice(0, 4).every((x) => x > 0) && spent[4] === 0, spent.join());
  // shield: half the delay, twice the rate
  const ss = data.progression.combat.spellShield;
  g.player.maxShield = 100;
  g.player.shield = 0;
  g.player.shieldIdle = ss.rechargeDelay * 0.5;
  g.updatePlayer(0.1);
  assert.ok(Math.abs(g.player.shield - 100 * ss.rechargePctPerSecond / 100 * 2 * 0.1) < 1e-6);
});

test('VIT: low HP regenerates faster, no knockback and a barrier on hit, less damage while healthy, a lethal hit survived', () => {
  const { g, m } = setup({ VIT: 200 });
  g.derived.dodgeChancePct = 0;
  g.derived.blockChance = 0;
  g.player.shield = g.player.maxShield = 0;
  const regen = (hp) => { g.player.hp = hp; g.player.statuses = {}; g.updatePlayer(0.1); return g.player.hp - hp; };
  const low = regen(g.player.maxHp * 0.2), high = regen(g.player.maxHp * 0.5);
  assert.ok(Math.abs(low / high - 3) < 0.01);
  g.player.hp = g.player.maxHp;
  g.player.barrier = 0;
  const x = g.player.x;
  const full = g.damagePlayer(100, m, { knock: { angle: 0, force: 10 } });
  assert.equal(g.player.x, x, 'not knocked back');
  assert.ok(g.player.barrier > 0, 'a barrier from the hit');
  g.player.barrier = 0;
  g.player.hp = g.player.maxHp * 0.5;
  g.time += 3;
  const hurt = g.damagePlayer(100, m);
  assert.ok(Math.abs(full / hurt - 0.9) < 0.03, `${full} ${hurt}`);
  g.player.barrier = 0;
  g.damagePlayer(1e6, m);
  assert.equal(g.player.dead, false);
  assert.ok(Math.abs(g.player.hp - g.player.maxHp * 0.3) < 1);
});
