// Trapper skills (owner, 2026-10-31; the tactical bow, docs/SKILL-TREE-WHEEL-DRAFT-TH.md section 4.7): traps
// set ahead that wait for a monster to walk in, a net that roots, and a straw dummy that draws monsters.
// Rules: core/frontier-content.js placeTraps, core/game-simulation.js updateAreas (springing), spawnAllies
// (a summon set at the aim point, static), core/ai.js (root); numbers in data/skills.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { craft } from '../../src/core/crafting.js';
import { updateMonster } from '../../src/core/ai.js';
import { tickFrontier } from '../../src/core/frontier-content.js';

const C = data.skills.combat, TRAPS = ['spike_trap', 'net_trap', 'blast_trap', 'lure_dummy', 'trap_field'];

const fixture = (id) => {
  const ch = createCharacter(data, { kit: 'bow' });
  ch.stats = { STR: 60, DEX: 60, INT: 60, AGI: 60, VIT: 60, LUK: 5 };
  ch.skills[id] = 1;
  ch.slots = [{ skill: id, mods: [] }, ...ch.slots.slice(1).map(() => ({ skill: null, mods: [] }))];
  const g = new Game(data, { seed: 11, character: ch });
  g.player.x = 0; g.player.z = 0; g.player.facing = Math.PI / 2;
  g.derived.weaponType = 'bow';
  g.skills = ch.slots.map((_, i) => computeSkill(ch, data, g.derived, i));
  const m0 = g.monsters[0];
  const mk = (mid, x, z, extra = {}) => ({ ...m0, id: mid, x, z, hp: 1e6, maxHp: 1e6, defense: 0, boss: false, dead: false, state: 'chase', stateT: 0, aggro: true, statuses: {}, buffs: {}, cd: {}, r: 0.5, ...extra });
  g.monsters = [];
  g.world = { surfaceY: () => 0, isFree: () => true, move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false }), seams: [], bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, safe: () => false };
  g.isSafe = () => false; g.derived.critChance = 0; g.player.mp = g.player.maxMp; g.drainEvents();
  return { g, mk, s: g.skills[0] };
};
const aim = { angle: Math.PI / 2, x: 6, z: 0 };
const step = (g, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 0.02) { g.time += 0.02; g.updateAreas(0.02); } };
const traps = (g, id) => g.areas.filter((a) => a.trap && !a.sprung && a.skill?.id === id); // still set, waiting

test('the five are the trapper\'s bow skills, learned at the workbench from real drops, waiting for pictures', () => {
  const drops = new Set(Object.values(data.monsters.monsters).flatMap((m) => m.drops.map((d) => d.item)));
  for (const id of TRAPS) {
    const def = C[id];
    assert.ok(def.job === 'trapper' && def.requiresWeapon.includes('bow') && def.iconPending && def.nameTh && def.tags.includes('Trap'), id);
    const r = data.recipes.recipes['learn_' + id];
    assert.ok(r?.result === id && Object.keys(r.cost).every((k) => k === 'gold' || drops.has(k)), `${id}: learned from real drops`);
    const ch = createCharacter(data); ch.gold = r.cost.gold; ch.materials = Object.fromEntries(Object.entries(r.cost).filter(([k]) => k !== 'gold'));
    assert.ok(craft(ch, data, 'learn_' + id).ok, id);
    assert.ok(fixture(id).s.requirementsMet, `${id}: castable with a bow`);
  }
});

test('a trap waits armed for a monster to walk in, springs once over its radius, and is gone; unsprung it ends with its life', () => {
  const D = C.spike_trap;
  const { g, mk, s } = fixture('spike_trap');
  const m = mk('m', aim.x, aim.z); g.monsters = [m];
  g.executeSkill(s, aim);
  assert.equal(traps(g, 'spike_trap').length, 1);
  step(g, D.trap.arm * 0.5);
  assert.equal(m.hp, 1e6, 'not armed yet: a monster standing on it is safe');
  step(g, D.trap.arm);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'trapSprung' && e.skill === 'spike_trap'), 'armed, it springs on the monster');
  assert.ok(m.hp < 1e6 && m.statuses.bleed?.t > 0, 'the spikes strike and the wound bleeds');
  assert.ok(Math.abs(m.statuses.bleed.dps * D.bleed.duration - (1e6 - m.hp) * D.bleed.fraction) < 1, 'the bleed is its share of the hit');
  step(g, 1);
  assert.equal(traps(g, 'spike_trap').length, 0, 'sprung once, it is gone');
  // set where nothing comes: it waits its life, then it is gone
  const f = fixture('spike_trap'); f.g.monsters = [f.mk('far', 30, 30)];
  f.g.executeSkill(f.s, aim); step(f.g, D.trap.life - 0.5);
  assert.equal(traps(f.g, 'spike_trap').length, 1, 'still waiting');
  step(f.g, 1);
  assert.equal(traps(f.g, 'spike_trap').length, 0, 'its life is over');
});

test('a skill keeps at most its max traps set: one more takes the oldest away', () => {
  const D = C.spike_trap, { g, s } = fixture('spike_trap');
  const first = [];
  for (let i = 0; i <= D.trap.max; i++) { g.executeSkill(s, { ...aim, x: 4 + i }); if (i === 0) first.push(traps(g, 'spike_trap')[0].id); }
  const set = traps(g, 'spike_trap');
  assert.equal(set.length, D.trap.max);
  assert.ok(!set.some((a) => a.id === first[0]), 'the oldest went');
});

test('Net Trap roots: the monster walks nowhere for its length (a boss briefly) but is not stunned', () => {
  const D = C.net_trap;
  const { g, mk, s } = fixture('net_trap');
  const m = mk('m', aim.x, aim.z, { state: 'chase' }), boss = mk('b', aim.x + 0.5, aim.z + 0.5, { boss: true });
  g.monsters = [m, boss];
  g.executeSkill(s, aim); step(g, D.trap.arm + 0.1);
  assert.ok(Math.abs(m.statuses.root?.t - D.root.duration) < 0.1, 'rooted for its length');
  assert.ok(Math.abs(boss.statuses.root?.t - D.root.bossDuration) < 0.1, 'a boss only briefly');
  assert.notEqual(m.state, 'stunned', 'a root is not a stun: it can still strike');
  const x0 = m.x, z0 = m.z;
  g.player.x = 0; g.player.z = 0;
  for (let i = 0; i < 20; i++) updateMonster(g, m, 0.05);
  assert.ok(Math.hypot(m.x - x0, m.z - z0) < 1e-6, 'a rooted monster does not walk');
  for (let i = 0; i < 80; i++) g.tickStatuses(m, 0.05);
  assert.ok(!m.statuses.root, 'it wears off');
});

test('Blast Trap hits harder than a Spike Trap; Trap Field scatters its traps over the circle, each springing on its own', () => {
  const spike = fixture('spike_trap').s, blast = fixture('blast_trap').s;
  assert.ok(blast.damage > spike.damage * 1.5 && C.blast_trap.radius > C.spike_trap.radius, 'the blast is the big hit');
  const D = C.trap_field, { g, mk, s } = fixture('trap_field');
  g.executeSkill(s, aim);
  const set = traps(g, 'trap_field');
  assert.equal(set.length, D.trap.count);
  assert.ok(set.every((a) => Math.hypot(a.x - aim.x, a.z - aim.z) <= D.trap.spread + 1e-9), 'all within the circle');
  const far = set.reduce((b, a) => (Math.hypot(a.x - aim.x, a.z - aim.z) > Math.hypot(b.x - aim.x, b.z - aim.z) ? a : b));
  g.monsters = [mk('m', far.x, far.z)];
  step(g, D.trap.arm + 0.1);
  assert.equal(traps(g, 'trap_field').length, D.trap.count - 1, 'only the trap it walked into sprang');
});

test('Trap Field throws the trapper\'s traps at random, learned or not: each works as its own trap at its share of the damage', () => {
  const D = C.trap_field, kinds = Object.keys(D.trap.pool), seen = new Set();
  for (let seed = 1; seed <= 12 && seen.size < kinds.length; seed++) {
    const { g, mk, s } = fixture('trap_field');
    g.rng = (g.rng.state = seed, g.rng);
    assert.ok(kinds.every((k) => !g.ch.skills[k]), 'none of the pool learned');
    g.executeSkill(s, aim);
    const ev = g.drainEvents().filter((e) => e.type === 'trapSet');
    for (const a of traps(g, 'trap_field')) {
      const def = C[a.look];
      assert.ok(kinds.includes(a.look), 'one of the pool');
      seen.add(a.look);
      assert.equal(a.radius, def.radius, `${a.look}: its own circle`);
      assert.equal(a.trap.trigger, def.trap.trigger);
      assert.ok(Math.abs(a.damage - s.damage * D.trap.pool[a.look] * g.playerDamageMult()) < 1e-6, `${a.look}: its share of the damage`);
      assert.ok(ev.some((e) => e.id === a.id && e.look === a.look), 'the effects are told which trap it is');
    }
    // walk a monster onto each trap: a net roots, spikes bleed, a blast burns hardest
    for (const a of traps(g, 'trap_field')) {
      const m = mk('m' + a.id, a.x, a.z); g.monsters = [m];
      a.t = D.trap.arm; step(g, 0.1);
      if (a.look === 'net_trap') assert.ok(m.statuses.root, 'the net roots');
      if (a.look === 'spike_trap') assert.ok(m.statuses.bleed && !m.statuses.root, 'the spikes bleed');
      if (a.look === 'blast_trap') assert.ok(!m.statuses.root && !m.statuses.bleed, 'the blast just hits');
    }
  }
  assert.equal(seen.size, kinds.length, 'every kind comes up');
});

test('Lure Dummy stands where it is set, never moves or strikes, draws the monsters near it, and is gone with its life', () => {
  const D = C.lure_dummy, { g, mk, s } = fixture('lure_dummy');
  const near = mk('n', aim.x + 2, aim.z), far = mk('f', aim.x + D.summon.tauntRadius + 4, aim.z);
  g.monsters = [near, far];
  const at = g.resolveAim(s, { x: aim.x, z: aim.z });
  assert.ok(Math.abs(at.x - aim.x) < 1e-9 && Math.abs(at.z - aim.z) < 1e-9, 'it is aimed at a point on the ground, like a trap');
  g.executeSkill(s, at);
  const d = g.allies.find((a) => a.type === 'lure_dummy');
  assert.ok(d && d.static, 'set as a static summon');
  assert.ok(Math.hypot(d.x - aim.x, d.z - aim.z) < 1e-6 || Math.hypot(d.x, d.z) <= D.range + 1e-6, 'at the aim point, within its range');
  const x0 = d.x, z0 = d.z;
  for (let i = 0; i < 20; i++) { g.updateAllies(0.05); tickFrontier(g, 0.05); }
  assert.ok(d.x === x0 && d.z === z0, 'it does not move');
  assert.equal(near.forcedTargetId, d.id, 'a monster near it turns on it');
  assert.notEqual(far.forcedTargetId, d.id, 'one out of reach does not');
  assert.equal(near.hp, 1e6, 'it never strikes');
  for (let i = 0; i < D.summon.life * 20 + 5; i++) g.updateAllies(0.05);
  assert.ok(!g.allies.some((a) => a.id === d.id), 'gone after its life');
});
