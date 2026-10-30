// Job skills, batch 2, group 1 (owner, 2026-10-30): the guardian's Provoke and the duelist's Boiling
// Blood, Fighting Spirit and Berserk, all buffs (kind 'buff'). Rules in core/game-simulation.js
// (executeSkill 'buff', playerDamageMult, hitMonster), numbers in data/skills.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { craft } from '../../src/core/crafting.js';
import { tickFrontier } from '../../src/core/frontier-content.js';
import { updateMonster } from '../../src/core/ai.js';

const GROUP = { provoke: 'guardian', blood_boil: 'duelist', fighting_spirit: 'duelist', berserk: 'duelist', stealth: 'blade', steal: 'blade', decoy: 'blade' };

const fixture = (id, level = 1) => {
  const ch = createCharacter(data, { kit: 'sword' });
  ch.stats = { STR: 60, DEX: 5, INT: 5, AGI: 5, VIT: 60, LUK: 5 };
  ch.skills[id] = level;
  ch.slots = [{ skill: id, mods: [] }, ...ch.slots.slice(1).map(() => ({ skill: null, mods: [] }))];
  const g = new Game(data, { seed: 7, character: ch });
  g.player.x = 0; g.player.z = 0; g.player.facing = Math.PI / 2;
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  const m0 = g.monsters[0];
  const mk = (mid, x, z) => Object.assign(Object.create(Object.getPrototypeOf(m0)), m0, { id: mid, x, z, hp: 1e6, maxHp: 1e6, defense: 0, boss: false, dead: false, state: 'idle', aggro: false, statuses: {}, buffs: {}, r: 0.5, tauntT: 0, forcedTargetId: null });
  g.monsters = [];
  g.world = { surfaceY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, safe: () => false };
  g.isSafe = () => false; g.derived.critChance = 0;
  g.player.shield = g.player.maxShield = 0; g.player.mp = g.player.maxMp; g.drainEvents();
  return { g, mk, s: g.skills[0] };
};
const aim = { angle: Math.PI / 2, x: 2, z: 0 };

test('the four skills are their jobs\' buffs, learned at the workbench from real drops, waiting for pictures', () => {
  const drops = new Set(Object.values(data.monsters.monsters).flatMap((m) => m.drops.map((d) => d.item)));
  for (const [id, job] of Object.entries(GROUP)) {
    const def = data.skills.combat[id];
    assert.ok((def.kind === 'buff' || job === 'blade') && def.job === job && def.iconPending && def.nameTh, id);
    const r = data.recipes.recipes['learn_' + id];
    assert.ok(r?.type === 'skill' && r.result === id, id);
    for (const k of Object.keys(r.cost)) assert.ok(k === 'gold' || drops.has(k), `${id}: ${k} drops somewhere`);
    const ch = createCharacter(data); ch.gold = r.cost.gold; ch.materials = Object.fromEntries(Object.entries(r.cost).filter(([k]) => k !== 'gold'));
    assert.ok(craft(ch, data, 'learn_' + id).ok, id);
  }
});

test('Provoke turns every monster within its radius on the hero for its duration and cuts the hero\'s damage taken', () => {
  const { g, mk, s } = fixture('provoke');
  const T = data.skills.combat.provoke.taunt;
  g.monsters = [mk('near', 3, 0), mk('edge', 0, T.radius + 0.4), mk('far', T.radius + 3, 0)];
  g.player.hp = g.player.maxHp = 1e6;
  const hit = () => { const before = g.player.hp; g.damagePlayer(1000, null); const d = before - g.player.hp; g.player.hp = 1e6; return d; };
  const plain = hit();
  g.executeSkill(s, aim);
  for (const id of ['near', 'edge']) {
    const m = g.monsters.find((q) => q.id === id);
    assert.equal(m.forcedTargetId, g.player.id, id); assert.equal(m.tauntT, T.duration, id);
  }
  assert.ok(!g.monsters.find((q) => q.id === 'far').tauntT, 'out of reach');
  assert.ok(Math.abs(hit() - plain * s.takenMult) <= 1 && s.takenMult < 1, 'less damage taken while it lasts');
  assert.ok(g.drainEvents().some((e) => e.type === 'buff' && e.kind === 'provoke'));
});

test('Boiling Blood: no bonus at full HP, the full bonus at its HP mark or below, linear between', () => {
  const { g, s } = fixture('blood_boil');
  const R = data.skills.combat.blood_boil.rage;
  g.executeSkill(s, aim);
  g.player.hp = g.player.maxHp; assert.ok(Math.abs(g.playerDamageMult() - 1) < 1e-9);
  g.player.hp = g.player.maxHp * R.atHp; assert.ok(Math.abs(g.playerDamageMult() - (1 + R.max)) < 1e-9);
  g.player.hp = g.player.maxHp * 0.1; assert.ok(Math.abs(g.playerDamageMult() - (1 + R.max)) < 1e-9, 'capped');
  g.player.hp = g.player.maxHp * (1 + R.atHp) / 2; assert.ok(Math.abs(g.playerDamageMult() - (1 + R.max / 2)) < 1e-9, 'half way');
  g.player.buffs = {}; g.player.hp = 1; assert.equal(g.playerDamageMult(), 1, 'nothing without the buff');
});

test('Fighting Spirit: hits give back HP (a share of the damage) and MP, for the hero and the allies it reached', () => {
  const { g, mk, s } = fixture('fighting_spirit');
  const S = data.skills.combat.fighting_spirit.spirit;
  const m = mk('m', 2, 0); g.monsters = [m];
  const ally = { id: 'wolf', kind: 'ally', x: 1, z: 1, hp: 10, maxHp: 1000, dead: false, buffs: {} };
  const away = { id: 'far', kind: 'ally', x: 30, z: 0, hp: 10, maxHp: 1000, dead: false, buffs: {} };
  g.allies = [ally, away];
  g.executeSkill(s, aim);
  assert.ok(g.player.buffs.fighting_spirit && ally.buffs.fighting_spirit && !away.buffs.fighting_spirit);
  g.player.hp = 1; g.player.mp = 0;
  const dmg = g.hitMonster(m, 1000, { element: 'physical' });
  assert.ok(Math.abs(g.player.hp - 1 - dmg * S.leech / 100) < 1e-6, `healed ${S.leech}% of ${dmg}`);
  assert.equal(g.player.mp, S.mp);
  const adm = g.hitMonster(m, 500, { element: 'physical', by: ally, byAlly: true });
  assert.ok(Math.abs(ally.hp - 10 - adm * S.leech / 100) < 1e-6, 'the ally heals itself');
  assert.equal(g.player.mp, S.mp, 'an ally\'s hit gives the hero no MP');
});

test('Berserk: more damage and speed, no knockback, but more damage taken, a price that does not grow with its level', () => {
  for (const level of [1, 10]) {
    const { g, s } = fixture('berserk', level);
    const def = data.skills.combat.berserk;
    assert.equal(s.takenMult, def.takenMult, `level ${level}: the price stays`);
    g.player.hp = g.player.maxHp = 1e6;
    const hit = () => { const before = g.player.hp; g.damagePlayer(1000, null); const d = before - g.player.hp; g.player.hp = 1e6; return d; };
    const plain = hit();
    g.executeSkill(s, aim);
    assert.ok(Math.abs(g.playerDamageMult() - (1 + s.damageBuff)) < 1e-9 && s.damageBuff >= def.damageBuff);
    assert.ok(Math.abs(hit() - plain * def.takenMult) <= 1, 'more damage taken');
    const x0 = g.player.x;
    g.damagePlayer(10, { kind: 'monster', x: g.player.x - 1, z: g.player.z }, { knock: { angle: Math.PI / 2, force: 10 } });
    assert.equal(g.player.x, x0, 'no knockback (nothing breaks a cast or channel)');
  }
});

// ---- group 3, the blade job's trickery (owner, 2026-10-30: Stealth and Decoy are player-versus-player skills) ----
const blade = (id) => { const f = fixture(id); f.g.derived.weaponType = 'dagger'; f.s = computeSkill(f.g.ch, data, f.g.derived, 0); return f; };
const tick = (g, t) => { for (let s = 0; s < t; s += 0.05) { g.time += 0.05; tickFrontier(g, 0.05); for (const m of g.monsters) updateMonster(g, m, 0.05); } };

test('Stealth hides the hero: monsters chasing it lose it, idle ones never notice it; the first hit out of it is a sure critical and ends it; a blow ends it', () => {
  const { g, mk, s } = blade('stealth');
  assert.ok(s.requirementsMet);
  const chaser = mk('chaser', 3, 0), idle = mk('idle', -4, 0);
  Object.assign(chaser, { aggro: true, state: 'chase', targetUnit: g.player, homeX: 3, homeZ: 0 }); Object.assign(idle, { homeX: -4, homeZ: 0 });
  g.monsters = [chaser, idle];
  g.executeSkill(s, aim);
  assert.ok(g.player.stealthT > 0 && g.drainEvents().some((e) => e.type === 'stealth' && e.on));
  tick(g, 1);
  assert.equal(chaser.aggro, false, 'lost the hero'); assert.equal(idle.aggro, false, 'never noticed it');
  // the first hit out of hiding: a critical, and the hero shows again
  const before = chaser.hp;
  g.hitMonster(chaser, 1000, { element: 'physical', crit: false });
  const critHit = before - chaser.hp;
  assert.equal(g.player.stealthT, 0); assert.ok(g.drainEvents().some((e) => e.type === 'stealth' && !e.on && e.why === 'attack'));
  const plain = chaser.hp; g.hitMonster(chaser, 1000, { element: 'physical', crit: false });
  assert.ok(critHit > plain - chaser.hp, 'the hit from hiding was a critical');
  // a blow taken ends it too
  g.executeSkill(s, aim); g.player.hp = g.player.maxHp = 1e6;
  g.damagePlayer(100, null); assert.equal(g.player.stealthT, 0);
  // and it runs out on its own
  g.executeSkill(s, aim); tick(g, s.duration + 0.2); assert.equal(g.player.stealthT, 0);
});

test('Decoy leaves a copy of the hero that draws nothing, hides the hero a moment, and goes when its time is up', () => {
  const { g, mk, s } = blade('decoy');
  const m = mk('m', 4, 0); Object.assign(m, { homeX: 4, homeZ: 0 }); g.monsters = [m];
  g.executeSkill(s, aim);
  const d = g.decoys[0];
  assert.ok(d && d.x === g.player.x && d.z === g.player.z, 'where the hero stood');
  assert.ok(g.drainEvents().some((e) => e.type === 'decoy'));
  assert.equal(g.player.stealthT, data.skills.combat.decoy.stealth);
  assert.ok(!g.units().some((u) => u.id === d.id), 'not a unit: nothing targets it');
  tick(g, s.duration + 0.2);
  assert.equal(g.decoys.length, 0); assert.ok(g.drainEvents().some((e) => e.type === 'decoyEnd'));
  assert.equal(m.forcedTargetId, null);
});

test('Steal takes gold and maybe one of the monster\'s own materials, once per monster, landing at the hero\'s feet', () => {
  const { g, mk, s } = blade('steal');
  const S = data.skills.combat.steal.steal;
  const boar = mk('boar', 1.5, 0); boar.level = 10; boar.def = data.monsters.monsters.tusk_boar; g.monsters = [boar];
  g.executeSkill(s, aim);
  const res = g.drainEvents().find((e) => e.type === 'stealResult');
  assert.ok(res && !res.empty && res.gold >= Math.floor((S.gold + S.goldPerLevel * 10) * 0.8) && res.gold <= Math.ceil((S.gold + S.goldPerLevel * 10) * 1.2));
  assert.ok(boar.hp < 1e6, 'a light hit');
  const own = new Set(boar.def.drops.map((d) => d.item));
  assert.ok(res.item === null || own.has(res.item), 'only its own materials');
  assert.ok(g.drops.some((d) => d.item === 'gold' && d.qty === res.gold && d.x === g.player.x), 'the gold at the hero\'s feet');
  g.executeSkill(s, aim);
  assert.ok(g.drainEvents().find((e) => e.type === 'stealResult')?.empty, 'once per monster');
  // over many monsters the item comes about as often as itemChance says
  let items = 0;
  for (let i = 0; i < 400; i++) { const m = mk('m' + i, 1.5, 0); m.level = 5; m.def = boar.def; g.monsters = [m]; g.executeSkill(s, aim); if (g.drainEvents().find((e) => e.type === 'stealResult')?.item) items++; }
  assert.ok(Math.abs(items / 400 - S.itemChance) < 0.08, `items ${items}/400`);
  // nothing in front: a swipe at the air
  g.monsters = [mk('behind', -2, 0)]; g.executeSkill(s, aim);
  assert.equal(g.drainEvents().find((e) => e.type === 'steal')?.id, null);
});
