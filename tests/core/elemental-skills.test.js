// Elemental job skills (owner, 2026-10-31): plain skills, one per element, for the spell archer (bow) and
// the spellblade (sword). Skills stay easy to understand; harder rules belong in the Job Tree or PvP
// skills. Rules: core/frontier-content.js (melee_line afterShock, a hit's shockCharge and chargeShock, endProjectile
// shatter), core/game-simulation.js (zone ticks stack a skill's poison); numbers in data/skills.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { craft } from '../../src/core/crafting.js';
import { updateMonster } from '../../src/core/ai.js';
import { statusList } from '../../src/core/statuses.js';

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
  g.derived.weaponType = C[id].requiresWeapon?.[0] || 'staff';
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

test('Flame Arrow Rain: its arrows pin across the circle together, then each bursts on its own fuse, in fire, never before it lands', () => {
  const { g, mk, s } = fixture('fire_arrow_rain');
  const D = C.fire_arrow_rain, A = D.arrows;
  g.monsters = [mk('mid', aim.x, 0), mk('out', aim.x + D.radius + A.blast + 1.5, 0)];
  g.executeSkill(s, aim);
  const pins = g.drainEvents().filter((e) => e.type === 'arrowPin');
  assert.equal(pins.length, A.count);
  const times = pins.map((e) => e.delay);
  for (const e of pins) {
    assert.ok(Math.hypot(e.x - aim.x, e.z - aim.z) <= D.radius + 1e-9, 'inside the circle');
    assert.ok(e.land === A.land && e.delay >= A.land + A.fuseMin - 1e-9 && e.delay <= A.land + A.fuseMax + 1e-9, 'a fuse after it lands');
  }
  assert.ok(new Set(times.map((x) => x.toFixed(3))).size === A.count, 'no two burst at the same time');
  const bursts = []; let first = Infinity;
  run(g, A.land + A.fuseMax + 0.3, (t) => { for (const e of g.drainEvents()) { if (e.type === 'burst' && e.kind === 'fire_arrow_rain') bursts.push(t); if (e.type === 'hit' && !e.dot) { first = Math.min(first, t); assert.equal(e.element, 'fire'); assert.notEqual(e.id, 'out', 'outside every blast'); } } });
  assert.equal(bursts.length, A.count, 'every arrow bursts once');
  assert.ok(Math.max(...bursts) - Math.min(...bursts) > 0.4, 'spread over time');
  assert.ok(first >= A.land + A.fuseMin - 0.03, 'nothing is hit before the first fuse burns down');
  assert.ok(g.monsters[0].hp < 1e6, 'the arrow near the middle catches what stands there');
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

test('Thunder Lance strikes the whole lane at once, then the lane strikes again a beat later, weaker, and shocks it', () => {
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
  for (const m of [near, far, boss]) assert.equal(m.statuses.shock?.t, A.shock, `${m.id} shocked`);
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

test('Thunder Slash leaves a charge on what it cuts: each main-skill hit on it shocks once more, until the shocks or the time run out', () => {
  const D = C.thunder_slash, Q = D.shockCharge, mainCd = data.progression.combat.mainSkillCooldown;
  assert.ok(D.cooldown > mainCd && C.slash.cooldown <= mainCd && C.flame_slash.cooldown > mainCd);
  for (const id of ['slash', 'whirl_blade', 'chain_spark', 'hunter_shot', 'firebolt']) assert.ok(C[id].cooldown <= mainCd, `${id} is a main skill`);
  const { g, mk, s } = fixture('thunder_slash');
  const cut = mk('cut', 1.5, 0), away = mk('away', 6, 0);
  g.monsters = [cut, away];
  g.executeSkill(s, aim);
  const cutDmg = 1e6 - cut.hp;
  assert.ok(cut.statuses.charged && !away.statuses.charged, 'only what the cut reached');
  g.drainEvents();
  const hit = (m, skill) => { g.hitMonster(m, 100, { skill, element: 'physical' }); return g.drainEvents(); };
  // a cooldown skill's hit does not spend it; an ally's hit or a damage-over-time tick does not either
  assert.ok(!hit(cut, 'flame_slash').some((e) => e.type === 'chargeShock'));
  g.hitMonster(cut, 100, { skill: 'slash', byAlly: true }); g.hitMonster(cut, 100, { dot: true, element: 'fire' });
  assert.ok(!g.drainEvents().some((e) => e.type === 'chargeShock'));
  for (let k = 0; k < Q.shocks; k++) {
    const before = cut.hp, ev = hit(cut, k === 1 ? 'whirl_blade' : 'slash');
    const shock = ev.find((e) => e.type === 'hit' && e.element === 'lightning');
    assert.ok(ev.some((e) => e.type === 'chargeShock') && shock, `shock ${k + 1}`);
    assert.ok(Math.abs(shock.amount - cutDmg * Q.mult) <= 1, 'each shock is its share of the cut');
    assert.ok(before - cut.hp > 100, 'on top of the main hit');
  }
  assert.ok(!cut.statuses.charged && !hit(cut, 'slash').some((e) => e.type === 'chargeShock'), 'spent after its shocks');
  // the charge runs out with time
  const f = fixture('thunder_slash'), m = f.mk('m', 1.5, 0); f.g.monsters = [m];
  f.g.executeSkill(f.s, aim);
  f.g.tickStatuses(m, Q.duration + 0.1);
  f.g.drainEvents(); f.g.hitMonster(m, 100, { skill: 'slash', element: 'physical' });
  assert.ok(!f.g.drainEvents().some((e) => e.type === 'chargeShock'), 'gone after its time');
});

test('every one of the seven is worth pressing over the main attack: several main hits per target, or control, or a lasting effect', () => {
  const per = (id) => { const d = C[id], A = d.arrows; return d.damage.base * (A ? A.count * (A.blast / d.radius) ** 2 : 1) * (1 + (d.afterShock?.mult || 0)) * (1 + (d.shockCharge ? d.shockCharge.mult * d.shockCharge.shocks : 0)); };
  // worth at least 2.5 s of the main attack on each target (the main attack per second: its hit over its
  // cooldown; since 2026-10-31 a main attack is slow enough that a cast fits between two swings)
  const main = { bow: C.hunter_shot.damage.base / C.hunter_shot.cooldown, sword: C.slash.damage.base / C.slash.cooldown };
  for (const id of ['fire_arrow_rain', 'thunder_lance', 'flame_slash', 'thunder_slash']) {
    const w = C[id].requiresWeapon[0];
    assert.ok(per(id) >= 2.5 * main[w], `${id}: ${(per(id) / main[w]).toFixed(1)} s of the main attack per target`);
  }
  for (const id of ['frost_shatter_arrow', 'ice_spikes']) assert.ok(C[id].chill.slow >= 0.45 && C[id].chill.duration >= 2.5, `${id} controls`);
  assert.ok(C.thunder_lance.afterShock.shock >= 1.5, 'Thunder Lance shocks long enough to twitch a few times');
  assert.ok(C.poison_mist_arrow.duration >= 3, 'Miasma Arrow keeps working while the hero shoots');
  for (const id of Object.keys(SKILLS)) assert.ok(C[id].cooldown >= 6, `${id}: a cooldown skill`);
});

// The rule looked back at older skills (owner, 2026-10-31): Stone Burst had no reason to be pressed over
// Firebolt, so its rocks now knock what they hit up into a short stun that breaks a wind-up.
test('Stone Burst stuns what its rocks hit (not a boss), a control skill on a cooldown', () => {
  const { g, mk } = fixture('stone_burst');
  const D = C.stone_burst;
  g.derived.weaponType = 'staff';
  const s = computeSkill(g.ch, data, g.derived, 0);
  const m = mk('m', aim.x, 0), boss = mk('boss', aim.x + 0.8, 0.4, { boss: true });
  g.monsters = [m, boss];
  g.executeSkill(s, aim);
  run(g, D.delay - 0.05);
  assert.notEqual(m.state, 'stunned', 'not before the rocks rise');
  run(g, 0.15);
  assert.equal(m.state, 'stunned'); assert.equal(m.stateDur, D.stun.duration);
  assert.notEqual(boss.state, 'stunned');
  assert.ok(D.cooldown > data.progression.combat.mainSkillCooldown && D.tags.includes('Control'));
});

// Main attacks at an MMORPG pace (owner, 2026-10-31): a 0.8 s basic swing was too fast. Heavy weapons
// swing their main attacks slower and harder (weapon weight), the same per second.
test('main attacks start slow, the dagger quickest and heavy weapons slowest; weight keeps the damage per second', () => {
  assert.ok(C.weakpoint.cooldown < C.slash.cooldown && C.slash.cooldown < C.hunter_shot.cooldown);
  assert.ok(C.slash.cooldown >= 1.2 && C.whirl_blade.cooldown < C.chain_spark.cooldown && C.chain_spark.cooldown <= data.progression.combat.mainSkillCooldown);
  const W = data.progression.combat.weaponTempo;
  const with_ = (weapon) => { const f = fixture('slash'); f.g.derived.weaponType = weapon; return computeSkill(f.g.ch, data, f.g.derived, 0); };
  const sword = with_('sword'), axe = with_('axe');
  assert.ok(Math.abs(axe.cooldown / sword.cooldown - W.axe) < 1e-9 && W.axe > 1);
  assert.ok(Math.abs(axe.damage / axe.cooldown - sword.damage / sword.cooldown) < 1e-6, 'the same damage per second');
  assert.ok(Math.abs(axe.cost / axe.cooldown - sword.cost / sword.cooldown) < 1e-6, 'the same MP per second');
  const f = fixture('flame_slash'), cd = (w) => { f.g.derived.weaponType = w; return computeSkill(f.g.ch, data, f.g.derived, 0).cooldown; };
  assert.equal(cd('greatblade'), cd('sword'), 'a cooldown skill keeps its own cooldown');
});

// Shock (ชา, owner 2026-10-31): lightning's status is a twitch, a mini-stun every so often, not a stun.
test('Shock: the monster twitches to a stop every interval (a boss more briefly); a wind-up is only delayed; it ends with its time', () => {
  const S = data.progression.combat.shock;
  const { g, mk } = fixture('thunder_lance');
  const m = mk('m', 3, 0), boss = mk('b', 6, 0, { boss: true });
  g.monsters = [m, boss];
  for (const q of [m, boss]) g.hitMonster(q, 10, { element: 'lightning', shock: { duration: 2 } });
  assert.ok(g.drainEvents().some((e) => e.type === 'shocked'));
  Object.assign(m, { state: 'windup', stateT: 0, stateDur: 1, windup: { attack: 'x' } });
  // the first tick twitches it at once
  g.tickStatuses(m, 0.01); g.tickStatuses(boss, 0.01);
  assert.equal(m.twitchT, S.twitch); assert.equal(boss.twitchT, S.bossTwitch, 'a boss twitches more briefly');
  const t0 = m.stateT;
  updateMonster(g, m, S.twitch * 0.5);
  assert.equal(m.stateT, t0, 'everything pauses during the twitch');
  assert.equal(m.state, 'windup', 'the wind-up is still there, only delayed');
  // over its whole length it twitches about duration / interval times, then it is gone
  let twitches = 0; // the first twitch's event is still queued and counted below
  for (let t = 0; t < 2.2; t += 0.05) { g.tickStatuses(m, 0.05); twitches += g.drainEvents().filter((e) => e.type === 'twitch' && e.id === 'm').length; }
  assert.ok(twitches >= 2 / S.interval && twitches <= 2 / S.interval + 1, `${twitches} twitches`);
  assert.ok(!m.statuses.shock, 'gone after its time');
});

test('the HUD status list: what a monster has now, in the display order, with time left and stacks', () => {
  const { g, mk } = fixture('thunder_lance');
  const m = mk('m', 3, 0);
  m.statuses = { poison: { t: 3, dps: 1, acc: 0, stacks: 4 }, shock: { t: 1.5, next: 0.2 }, chill: { slow: 0.3, t: 2 } };
  Object.assign(m, { state: 'stunned', stateT: 0.2, stateDur: 1, tauntT: 2, forcedTargetId: g.player.id });
  const L = statusList(data, m, g.player.id);
  const order = Object.keys(data.progression.combat.statusDisplay);
  assert.deepEqual(L.map((s) => s.id), order.filter((id) => ['stun', 'shock', 'chill', 'poison', 'taunt'].includes(id)));
  assert.equal(L.find((s) => s.id === 'poison').stacks, 4);
  assert.ok(Math.abs(L.find((s) => s.id === 'stun').left - 0.8) < 1e-9);
  for (const [id, d] of Object.entries(data.progression.combat.statusDisplay)) assert.ok(d.nameTh && /^#[0-9a-f]{6}$/i.test(d.color) && d.icon, id);
});
