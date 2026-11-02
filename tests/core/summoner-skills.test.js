// Summoner skills (owner, 2026-11-01: "the next group"; docs/SKILL-TREE-WHEEL-DRAFT-TH.md section 4, job 10): many
// summons that stay for a while and hit from our magic. Spirit Swarm brings three small fast frail wisps, Call
// Alpha a big spirit wolf whose aura makes the other summons hit harder, Assault sends every summon at a
// target (faster, a harder knocking first hit), Soul Swap (a movement skill) trades places with a summon and
// heals it. Rules: core/frontier-content.js (summonsOf, commandSummons), core/game-simulation.js (useSkill's
// checks, alphaBonus, useMovement's swap, swapPlayer), core/skills.js (the summon's aura).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';

const C = data.skills.combat, M = data.skills.movement, SUMMONER = ['spirit_swarm', 'call_alpha', 'summon_assault'];

const fixture = (ids) => {
  const ch = createCharacter(data, { kit: 'staff' });
  ch.stats = { STR: 5, DEX: 5, INT: 60, AGI: 40, VIT: 40, LUK: 5 };
  for (const id of ids) ch.skills[id] = 1;
  ch.slots = ch.slots.map((_, i) => ({ skill: ids[i] || null, mods: [] }));
  const g = new Game(data, { seed: 21, character: ch });
  g.player.x = 0; g.player.z = 0; g.player.facing = Math.PI / 2;
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  const m0 = g.monsters[0];
  const mk = (mid, x, z, extra = {}) => ({ ...m0, id: mid, x, z, hp: 1e6, maxHp: 1e6, defense: 0, boss: false, dead: false, state: 'idle', stateT: 0, aggro: true, statuses: {}, buffs: {}, cd: {}, r: 0.5, minion: false, ...extra });
  g.monsters = [];
  g.world = { surfaceY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, safe: () => false };
  g.isSafe = () => false; g.derived.critChance = 0; g.player.mp = g.player.maxMp; g.drainEvents();
  return { g, mk, ch };
};
const slotOf = (g, id) => g.skills.findIndex((s) => s?.id === id);
const run = (g, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 0.05) { g.time += 0.05; g.updateAllies(0.05); } };

test('the summoner\'s skills are spells of the job, learned at the workbench from real drops, waiting for pictures', () => {
  const drops = new Set(Object.values(data.monsters.monsters).flatMap((m) => m.drops.map((d) => d.item)));
  for (const [id, def] of [...SUMMONER.map((id) => [id, C[id]]), ['soul_swap', M.soul_swap]]) {
    assert.ok(def.job === 'summoner' && def.iconPending && def.nameTh, id);
    const r = data.recipes.recipes['learn_' + id];
    assert.ok(r && r.result === id, id + ' has a recipe');
    for (const item of Object.keys(r.cost)) if (item !== 'gold') assert.ok(drops.has(item), `${id}: ${item} drops somewhere`);
  }
  for (const id of ['spirit_swarm', 'call_alpha']) assert.ok(C[id].power === 'spell' && C[id].summon.life > 0 && !C[id].summon.permanent, id + ' stays for a while and hits from our magic');
});

test('Spirit Swarm brings three fast frail wisps; Call Alpha one big wolf whose aura makes the others hit harder', () => {
  const { g, mk } = fixture(['spirit_swarm', 'call_alpha']);
  g.executeSkill(g.skills[slotOf(g, 'spirit_swarm')], { angle: 0, x: 0, z: 0 });
  const wisps = g.allies.filter((a) => a.type === 'spirit_wisp');
  assert.equal(wisps.length, 3);
  assert.ok(wisps.every((w) => w.arriveT === C.spirit_swarm.summon.arrive), 'they hold still while they form');
  for (const w of wisps) w.arriveT = 0; // formed
  const W = C.spirit_swarm.summon, A = C.call_alpha.summon;
  assert.ok(W.speed > A.speed && W.attackCooldown < A.attackCooldown && W.hp.base < A.hp.base / 4, 'the wisps are quick and frail');
  // a wisp's bite, without and then with the alpha near
  const m = mk('m', 2, 0); g.monsters = [m];
  const bite = () => { const w = wisps[0]; w.x = 1.2; w.z = 0; w.cd = 0; w.state = 'windup'; w.stateT = 0.3; w.targetId = 'm'; const hp = m.hp; g.time += 0.05; g.updateAllies(0.05); return hp - m.hp; };
  const plain = bite();
  g.executeSkill(g.skills[slotOf(g, 'call_alpha')], { angle: 0, x: 0, z: 0 });
  const alpha = g.allies.find((a) => a.type === 'spirit_alpha');
  assert.ok(alpha && alpha.alphaAura.radius === A.aura.radius);
  alpha.x = 0.5; alpha.z = 0.5;
  const led = bite();
  assert.ok(Math.abs(led / plain - (1 + A.aura.damage)) < 0.06, `the alpha's aura: ${led} vs ${plain}`);
  alpha.x = 30; assert.ok(Math.abs(bite() / plain - 1) < 0.06, 'out of its reach, no aura');
  run(g, W.life + 0.5);
  assert.equal(g.allies.filter((a) => a.type === 'spirit_wisp').length, 0, 'the wisps go when their time is up');
});

test('Assault fails without summons or a target; with them every summon runs in and its next hit is harder and knocks back', () => {
  const { g, mk } = fixture(['summon_assault', 'spirit_swarm']);
  const slot = slotOf(g, 'summon_assault');
  g.monsters = [mk('m', 6, 0)];
  assert.equal(g.castSlot(slot), false);
  assert.ok(g.drainEvents().some((e) => e.type === 'fail' && e.reason === 'summon'), 'no summons yet');
  g.executeSkill(g.skills[slotOf(g, 'spirit_swarm')], { angle: 0, x: 0, z: 0 });
  g.monsters = [];
  assert.equal(g.castSlot(slot), false, 'no target in reach');
  const m = mk('m', 6, 0); g.monsters = [m]; g.drainEvents();
  g.executeSkill(g.skills[slot], { angle: 0, x: 6, z: 0 });
  const ev = g.drainEvents().find((e) => e.type === 'summonAssault');
  const wisps = g.allies.filter((a) => a.type === 'spirit_wisp'); for (const w of wisps) w.arriveT = 0; // formed
  assert.ok(ev && ev.ids.length === 3 && wisps.every((a) => a.sic && a.sic.targetId === 'm' && a.sic.knock === C.summon_assault.assault.knock));
  // the charged hit: mult x and a knock back
  const w = wisps[0]; w.x = 4.8; w.z = 0; w.cd = 0; w.state = 'windup'; w.stateT = 0.3; w.targetId = 'm';
  const hp = m.hp, x0 = m.x; g.time += 0.05; g.updateAllies(0.05);
  const hit = hp - m.hp;
  assert.ok(hit > 0 && m.x > x0, 'it hit and knocked the target back');
  assert.equal(w.sic, null, 'the order is spent on that hit');
  const plainHit = (() => { const v = wisps[1]; v.sic = null; v.x = m.x - 1.2; v.z = 0; v.cd = 0; v.state = 'windup'; v.stateT = 0.3; v.targetId = 'm'; const h = m.hp; g.time += 0.05; g.updateAllies(0.05); return h - m.hp; })();
  assert.ok(Math.abs(hit / plainHit - C.summon_assault.assault.mult) < 0.1, `${hit} vs ${plainHit}`);
});

test('Soul Swap trades places with a summon in reach and heals it; with none in reach nothing is spent', () => {
  const { g, ch } = fixture(['spirit_swarm']);
  ch.movementSkills = [...(ch.movementSkills || []), 'soul_swap']; ch.movement = 'soul_swap';
  g.move = { ...M.soul_swap, id: 'soul_swap' };
  g.player.movement = { charges: 1, rechargeT: 0 };
  assert.equal(g.useMovement({ x: 3, z: 0 }), false, 'no summon');
  assert.equal(g.player.movement.charges, 1, 'nothing spent');
  g.executeSkill(g.skills[0], { angle: 0, x: 0, z: 0 });
  const [a, b] = g.allies; a.x = 4; a.z = 0; b.x = -3; b.z = 0; g.allies[2].x = 20; g.allies[2].z = 0;
  a.hp = a.maxHp * 0.5;
  assert.equal(g.useMovement({ x: 4.5, z: 0.5 }), true);
  assert.ok(g.player.dash.inv, 'untouchable while it swaps');
  for (let i = 0; i < 6; i++) { g.time += 0.05; g.updatePlayer(0.05); }
  assert.ok(Math.abs(g.player.x - 4) < 1e-6 && Math.abs(a.x) < 1e-6, 'the hero and the summon nearest the aim traded places');
  assert.ok(Math.abs(a.hp - a.maxHp * (0.5 + M.soul_swap.heal)) < 1e-6, 'and it was healed');
});
