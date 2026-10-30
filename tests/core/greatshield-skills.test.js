// Greatshield skills (owner, 2026-10-27; levels moved with the greatshields on 2026-10-30): Line Breaker
// (Lv1, a shield charge), Shield Fortress (Lv10, a held front guard) and Wall of Faith (Lv30, a wall of
// light). Rules in core/frontier-content.js, numbers in data/skills.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { craft } from '../../src/core/crafting.js';
import { tickFrontier, cancelChannel } from '../../src/core/frontier-content.js';

const C = data.skills.combat, IDS = { shield_rush: 1, shield_fort: 10, faith_wall: 30 };
const firstLevel = (item) => Math.min(...Object.values(data.monsters.monsters).filter((m) => m.levels && m.drops.some((d) => d.item === item)).map((m) => m.levels[0]));

const fixture = (id) => {
  const ch = createCharacter(data, { kit: 'sword' });
  ch.stats = { STR: 60, DEX: 5, INT: 60, AGI: 5, VIT: 60, LUK: 5 };
  ch.skills[id] = 1;
  ch.slots = [{ skill: id, mods: [] }, ...ch.slots.slice(1).map(() => ({ skill: null, mods: [] }))];
  const g = new Game(data, { seed: 7, character: ch });
  g.player.x = 0; g.player.z = 0; g.player.facing = Math.PI / 2;
  g.derived.weaponType = 'greatshield';
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  const m0 = g.monsters[0];
  const mk = (id, x, z, extra = {}) => Object.assign(Object.create(Object.getPrototypeOf(m0)), m0, { id, x, z, hp: 1e6, maxHp: 1e6, defense: 0, facing: -Math.PI / 2, boss: false, dead: false, state: 'chase', aggro: true, statuses: {}, buffs: {}, r: 0.5 }, extra);
  g.monsters = [];
  g.world = { surfaceY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, safe: () => false };
  g.isSafe = () => false; g.derived.critChance = 0; g.derived.dodgeChancePct = 0; g.derived.blockChance = 0;
  g.player.shield = 0; g.player.maxShield = 0; // the spell shield would hide the hits measured here
  g.player.mp = g.player.maxMp; g.input.manualAim = true; g.input.aimAngle = Math.PI / 2; g.drainEvents();
  return { g, mk, s: g.skills[0] };
};
const step = (g, dt = 1 / 60) => { g.time += dt; g.updatePlayer(dt); tickFrontier(g, dt); g.updateProjectiles(dt); g.updateAreas(dt); };

test('the three greatshield skills need a greatshield, are learned from drops at their level bands and wait for pictures', () => {
  for (const [id, band] of Object.entries(IDS)) {
    const def = C[id], r = data.recipes.recipes['learn_' + id];
    assert.ok(def.iconPending && def.job === 'guardian' && def.requiresWeapon.join() === 'greatshield', id);
    assert.ok(r?.type === 'skill' && r.result === id, id);
    const lv = Math.max(...Object.keys(r.cost).filter((k) => k !== 'gold').map(firstLevel));
    assert.ok(lv <= Math.max(band, 3) && lv >= band - 9, `${id}: learned from Lv${lv} drops (band Lv${band}; the first crabs are Lv3)`);
    const ch = createCharacter(data); ch.gold = r.cost.gold; ch.materials = Object.fromEntries(Object.entries(r.cost).filter(([k]) => k !== 'gold'));
    assert.ok(craft(ch, data, 'learn_' + id).ok, id);
  }
  // a sword is not a greatshield
  const { g, s } = fixture('shield_rush');
  g.derived.weaponType = 'sword';
  assert.equal(computeSkill(g.ch, data, g.derived, 0).requirementsMet, false);
  assert.ok(s.requirementsMet);
});

test('Line Breaker ends at a wall instead of sliding along it', () => {
  const { g } = fixture('shield_rush');
  // a wall 2 m ahead, struck at an angle: the world slides the hero along it (z only), blocked
  g.world.move = (x, z, r, dx, dz) => (x + dx > 2 ? { x, z: z + dz, blocked: true } : { x: x + dx, z: z + dz, blocked: false });
  g.input.aimAngle = Math.atan2(1, 0.4); g.player.facing = g.input.aimAngle;
  assert.ok(g.castSlot(0));
  let arrived = null;
  for (let t = 0; t < 1.2; t += 1 / 60) { step(g); for (const e of g.drainEvents()) if (e.type === 'dashArrive') arrived = e; }
  assert.ok(arrived, 'the charge ends with its arrival');
  assert.ok(g.player.x <= 2 && g.player.z < 1.2, `stopped at the wall, not slid along it (${g.player.x.toFixed(2)}, ${g.player.z.toFixed(2)})`);
  assert.equal(g.player.dash, null);
});

test('Line Breaker charges along the aim, hits each monster in the lane once and throws it aside', () => {
  const { g, mk, s } = fixture('shield_rush');
  g.monsters = [mk('a', 2, 0), mk('b', 4, -0.4), mk('beside', 3, 2.5), mk('behind', -2, 0), mk('past', 9, 0)];
  g.player.targetId = 'a'; // aimed through the first one
  assert.ok(g.castSlot(0));
  const hits = [];
  for (let t = 0; t < 1.2; t += 1 / 60) { step(g); for (const e of g.drainEvents()) if (e.type === 'hit') hits.push(e.id); }
  assert.deepEqual(hits.sort(), ['a', 'b'], 'once each, only the lane');
  assert.ok(Math.abs(g.player.x - s.range) < 0.05, 'the hero runs the whole way: ' + g.player.x);
  const [a, b] = g.monsters;
  assert.ok(Math.abs(a.z) > s.rush.knockSide - 0.01 && b.z < -0.4 - s.rush.knockSide + 0.01, 'thrown out to their own side');
  assert.equal(g.player.dash, null);
});

test('Line Breaker stops at a boss or a big monster and stuns it; its damage grows with defense', () => {
  const { g, mk, s } = fixture('shield_rush');
  g.monsters = [mk('small', 1.5, 0), mk('boss', 3.5, 0, { boss: true }), mk('after', 5, 0)];
  assert.ok(g.castSlot(0));
  const hits = []; let stopped = false;
  for (let t = 0; t < 1.2; t += 1 / 60) { step(g); for (const e of g.drainEvents()) { if (e.type === 'hit') hits.push(e.id); if (e.type === 'rushStop') stopped = true; } }
  assert.ok(stopped);
  assert.deepEqual(hits.sort(), ['boss', 'small'], 'the charge ends at the boss');
  const boss = g.monsters[1];
  assert.equal(boss.state, 'stunned');
  assert.ok(Math.abs(boss.stateDur - s.rush.stun) < 1e-9);
  assert.ok(Math.abs(g.player.x - (3.5 - boss.r - g.player.r)) < 0.05, 'the hero stops in front of it: ' + g.player.x);
  assert.ok(Math.abs(boss.z) < 1e-9, 'a boss is not thrown aside');
  const big = fixture('shield_rush');
  big.g.monsters = [big.mk('big', 2.5, 0, { r: s.rush.bigRadius })];
  big.g.castSlot(0);
  for (let t = 0; t < 1; t += 1 / 60) step(big.g);
  assert.ok(big.g.player.x < 2.5 - s.rush.bigRadius + 0.01 && big.g.monsters[0].state === 'stunned', 'a big monster stops it too');
  const tough = computeSkill(g.ch, data, { ...g.derived, defense: g.derived.defense + 200 }, 0);
  // damage.defenseScale per point of defense, before the skill's own level and increases
  const bare = computeSkill(g.ch, data, { ...g.derived, defense: 0 }, 0);
  const perDefense = (tough.damage - s.damage) / 200;
  assert.ok(perDefense > 0 && Math.abs(perDefense / ((s.damage - bare.damage) / g.derived.defense) - 1) < 1e-9, 'more defense, more damage, in proportion');
});

test('Shield Fortress held: the front takes nothing and pushes the attacker back; the back is open; it drops by itself', () => {
  const { g, mk, s } = fixture('shield_fort');
  const front = mk('front', 1.5, 0), back = mk('back', -1.5, 0);
  g.monsters = [front, back];
  g.player.targetId = 'front'; // the shield faces the locked target
  assert.ok(g.castSlot(0));
  assert.equal(g.player.mp, g.player.maxMp - s.cost);
  for (let t = 0; t < s.castTime + 0.05; t += 1 / 60) step(g);
  const hp = g.player.hp;
  assert.equal(g.damageUnit(g.player, 400, front), 0, 'a hit from the front is taken on the shield');
  assert.equal(g.player.hp, hp);
  assert.ok(front.x > 1.5 + s.guard.push - 0.01, 'and the attacker is pushed back');
  assert.ok(g.damageUnit(g.player, 400, back) > 0, 'a hit from behind lands');
  // an ally behind the hero within guard.coverRange takes less; one in front does not
  const ally = { kind: 'ally', id: 'al', x: -1.2, z: 0, r: 0.4, hp: 1e4, maxHp: 1e4, buffs: {}, barrier: 0, life: 1 };
  const plain = Math.max(1, Math.round(400 * 0.85));
  assert.equal(g.damageAlly(ally, 400, back), plain);
  assert.equal(g.damageUnit(ally, 400, back), Math.round(400 * s.guard.coverTaken * 0.85));
  ally.x = 1.2;
  assert.equal(g.damageUnit(ally, 400, back), plain);
  // walking slowly; the stance ends on its own and the cooldown starts then
  assert.equal(g.player.channeling.skill.channel.moveMult, 0.3);
  let ended = null;
  for (let t = 0; t < s.channel.maxDuration && !ended; t += 1 / 60) { step(g); if (!g.player.channeling) ended = t; }
  assert.ok(ended !== null && Math.abs(ended + s.castTime + 0.05 - s.castTime - s.channel.maxDuration) < 0.1, 'held for channel.maxDuration at most');
  assert.ok(Math.abs(g.player.cooldowns[0] - s.cooldown) < 0.05, 'the cooldown starts when it drops');
  assert.ok(g.damageUnit(g.player, 400, front) > 0, 'lowered, the front is open again');
});

test('Shield Fortress lets go early on release and blocks shots from the front too', () => {
  const { g, mk, s } = fixture('shield_fort');
  const archer = mk('archer', 6, 0);
  g.monsters = [archer];
  g.castSlot(0);
  for (let t = 0; t < s.castTime + 0.05; t += 1 / 60) step(g);
  const hp = g.player.hp;
  g.projectiles.push({ id: 'shot', owner: 'monster', kind: 'spit', x: 4, z: 0, vx: -10, vz: 0, speed: 10, range: 8, travelled: 0, radius: 0.3, damage: 300, sourceId: 'archer', ground: 0, hit: new Set() });
  for (let t = 0; t < 0.5; t += 1 / 60) step(g);
  assert.equal(g.player.hp, hp, 'the shot hits the shield');
  // aimed by the player, the shield keeps facing the aim even with a target locked behind
  g.player.targetId = 'archer'; g.input.aimFromPointer = true; g.input.aimAngle = -Math.PI / 2;
  step(g);
  assert.ok(Math.abs(g.player.facing + Math.PI / 2) < 1e-9);
  cancelChannel(g);
  assert.equal(g.player.channeling, null);
  assert.equal(g.player.cooldowns[0], s.cooldown);
});

test('Wall of Faith stands across the aim ahead, stops monster shots, slows monsters in it and covers the caster side', () => {
  const { g, mk, s } = fixture('faith_wall');
  const L = s.lightWall;
  const far = mk('far', 7, 0);
  g.monsters = [far];
  g.executeSkill(s, { angle: Math.PI / 2, x: 0, z: 0 });
  const wall = g.areas.find((a) => a.kind === 'faith_wall');
  assert.ok(wall && Math.abs(wall.x - L.offset) < 1e-9 && Math.abs(wall.z) < 1e-9, 'offset ahead along the aim');
  // a shot from the far side stops at the wall
  const hp = g.player.hp;
  g.projectiles.push({ id: 'shot', owner: 'monster', kind: 'spit', x: 6, z: 1, vx: -10, vz: 0, speed: 10, range: 10, travelled: 0, radius: 0.3, damage: 300, sourceId: 'far', ground: 0, hit: new Set() });
  let blocked = false;
  for (let t = 0; t < 0.8; t += 1 / 60) { step(g); for (const e of g.drainEvents()) if (e.type === 'lightWallBlock') blocked = true; }
  assert.ok(blocked && g.player.hp === hp && g.projectiles.length === 0, 'the shot stops at the wall');
  // the hero behind the wall takes less from the far side; a monster on the near side hits in full
  const near = mk('near', -1, 0);
  const covered = g.damageUnit(g.player, 400, far), open = g.damageUnit(g.player, 400, near);
  assert.ok(Math.abs(covered / open - L.taken) < 0.02, `${covered} vs ${open}`);
  // a monster walking through is slowed while inside, not elsewhere
  const walker = mk('walker', L.offset, 1);
  g.monsters = [walker, far];
  step(g);
  assert.ok(Math.abs(walker.statuses.chill.slow - L.slow) < 1e-9);
  assert.equal(far.statuses.chill, undefined);
  // monsters can still cross: the wall is no obstacle
  assert.equal(g.areas.find((a) => a.kind === 'faith_wall').wallHp, undefined);
  for (let t = 0; t < s.duration; t += 1 / 60) step(g);
  assert.equal(g.areas.find((a) => a.kind === 'faith_wall'), undefined, 'gone after its duration');
});
