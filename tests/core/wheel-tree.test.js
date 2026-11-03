// The wheel Job Tree in the game's own rules (owner, 2026-11-03: "ทำทรีวงล้อเข้าเกม"; built by
// scripts/wheel-build.mjs from the simulated draft). Until it replaces data/jobtree.json the game keeps the
// old tree; these tests read it as the tree in play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data as live } from './helpers.js';
import { createCharacter, allocateJobNode, jobNodeState, respecJob, jobPointsSpent, derive, currentJob, nodeCost } from '../../src/core/character.js';

const wheel = JSON.parse(readFileSync(new URL('../../data/wheeltree.json', import.meta.url), 'utf8'));
const data = { ...live, jobtree: wheel };
const N = wheel.nodes;
const hero = (jobLevel = 70, points = 70) => Object.assign(createCharacter(data), { jobLevel, jobPoints: points, gold: 1e6 });
const buy = (ch, ids) => { for (const id of ids) { const r = allocateJobNode(ch, data, id); assert.equal(r.done, true, `${id}: ${r.reason}`); } };
const chain = (prefix) => Object.keys(N).filter((id) => id.startsWith(prefix));

test('every node hangs on real parents, and every one can be reached from the origin', () => {
  for (const [id, n] of Object.entries(N)) for (const p of [...(n.requires || []), ...(n.requiresAny || [])]) assert.ok(N[p], `${id} -> ${p}`);
  const reach = new Set(['origin']);
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, n] of Object.entries(N)) {
      if (reach.has(id)) continue;
      const ok = (n.requires || []).every((p) => reach.has(p)) && (!n.requiresAny?.length || n.requiresAny.some((p) => reach.has(p)));
      if (ok) { reach.add(id); changed = true; }
    }
  }
  assert.equal(reach.size, Object.keys(N).length, 'unreachable: ' + Object.keys(N).filter((id) => !reach.has(id)).slice(0, 5));
});

test('the points fit the plan: 39 inner points fill a centre and a sector, a job line is 4 + 18 and leaves 9 spare of 31', () => {
  assert.equal(wheel.points.inner + wheel.points.job, 70);
  for (const job of Object.keys(wheel.jobs)) {
    assert.equal(nodeCost(N[`job.${job}`]), 0, job + ' entry is free');
    const trunk = chain(`job.${job}.trunk`).reduce((a, id) => a + nodeCost(N[id]), 0);
    assert.equal(trunk, 4, job + ' trunk');
    for (const bid of Object.keys(wheel.jobs[job].branches)) {
      const ids = chain(`job.${job}.${bid}.`), forks = new Set();
      let cost = 0;
      for (const id of ids) { const n = N[id]; if (n.forkGroup) { if (forks.has(n.forkGroup)) continue; forks.add(n.forkGroup); } cost += nodeCost(n); }
      assert.equal(cost, 18, `${job}/${bid} costs 18 with one fork each`);
    }
  }
});

test('a job is chosen at Job Lv 40, only one, and its nodes need it', () => {
  const ch = hero(39);
  assert.equal(jobNodeState(ch, data, 'job.heavy').reason, 'job_level');
  assert.equal(jobNodeState(ch, data, 'job.heavy.trunk0').reason, 'requires_job');
  ch.jobLevel = 40;
  buy(ch, ['job.heavy', 'job.heavy.trunk0']);
  assert.equal(currentJob(ch, data).branch, 'heavy');
  assert.equal(jobNodeState(ch, data, 'job.priest').reason, 'one_job');
  assert.equal(jobNodeState(ch, data, 'job.priest.trunk0').reason, 'requires_job');
});

test('keys cost 2 and capstones 3; a fork closes its siblings, and a forked capstone follows its fork', () => {
  const ch = hero();
  buy(ch, ['job.power', ...chain('job.power.trunk'), 'job.power.dps.t0p0', 'job.power.dps.t0p1', 'job.power.dps.t0p2']);
  const before = ch.jobPoints;
  buy(ch, ['job.power.dps.t0k.crit']);
  assert.equal(before - ch.jobPoints, 2);
  assert.equal(jobNodeState(ch, data, 'job.power.dps.t0k.power').reason, 'fork_taken');
  buy(ch, chain('job.power.dps.t1').concat(chain('job.power.dps.t2')));
  assert.equal(jobNodeState(ch, data, 'job.power.dps.cap.power').reason, 'prerequisite', 'the power capstone needs the power fork');
  const left = ch.jobPoints;
  buy(ch, ['job.power.dps.cap.crit']);
  assert.equal(left - ch.jobPoints, 3);
});

test('a respec refunds what the nodes cost, and the effects count on the character', () => {
  const ch = hero();
  buy(ch, ['in.center.c1', 'in.center.c2', 'job.heavy', ...chain('job.heavy.trunk')]);
  const spent = jobPointsSpent(ch, data);
  assert.equal(spent, 2 + 0 + 4);
  const d = derive(ch, data);
  assert.ok(d.damagePct >= N['in.center.c1'].effects.damagePct && d.meleeDamagePct > 0);
  const points = ch.jobPoints;
  assert.ok(respecJob(ch, data));
  assert.equal(ch.jobPoints, points + spent);
  assert.deepEqual(ch.jobNodes, ['origin']);
});

test('the heavy weapon line and the dual wield line hang off their sectors, and count only with that weapon', async () => {
  const { foldWeaponStats } = await import('../../src/core/character.js');
  assert.deepEqual(N['in.heavy.h1'].requires, ['in.str.s4']);
  assert.deepEqual(N['in.dual.d1'].requires, ['in.strdex.sd4']);
  const base = { meleeDamagePct: 10, maxHp: 1000, penetrationPct: 0, hastePct: 10, critChancePct: 5, critChance: 0.05, heavyDamagePct: 20, heavyHpPct: 10, heavyPenetrationPct: 10, dualDamagePct: 15, dualHastePct: 6, dualCritPct: 4 };
  const fold = (extra) => { const d = { ...base, ...extra }; foldWeaponStats(d, data); return d; };
  const plain = fold({ weaponType: 'sword', dualWield: false });
  assert.equal(plain.meleeDamagePct, 10, 'a sword in one hand gets neither');
  for (const w of data.progression.combat.wheel.heavyWeapons) {
    const d = fold({ weaponType: w, dualWield: false });
    assert.equal(d.meleeDamagePct, 30, w); assert.equal(d.maxHp, 1100); assert.equal(d.penetrationPct, 10);
  }
  const dual = fold({ weaponType: 'dagger', dualWield: true });
  assert.equal(dual.meleeDamagePct, 25); assert.equal(dual.hastePct, 16); assert.equal(dual.critChancePct, 9); assert.ok(Math.abs(dual.critChance - 0.09) < 1e-9);
  assert.equal(fold({ weaponType: 'staff', dualWield: false }).maxHp, 1000, 'a staff is no heavy weapon');
});

test('a route is bought in one go along the line, never picks a fork, and needs the points for all of it', async () => {
  const { jobRoute, allocateJobRoute } = await import('../../src/core/character.js');
  const ch = hero(70, 10);
  // c1 + s1..s4 = 5 points
  const r = jobRoute(ch, data, 'in.str.s4');
  assert.deepEqual(r.path, ['in.center.c1', 'in.str.s1', 'in.str.s2', 'in.str.s3', 'in.str.s4']);
  assert.equal(r.cost, 5);
  assert.equal(allocateJobRoute(ch, data, 'in.str.s4').done, true);
  assert.equal(ch.jobPoints, 5);
  // not enough points for the rest of the line: nothing is bought
  const far = allocateJobRoute(ch, data, 'in.str.s12');
  assert.equal(far.can, false); assert.equal(far.reason, 'no_points');
  assert.equal(ch.jobPoints, 5); assert.ok(!ch.jobNodes.includes('in.str.s5'));
  // past an open fork the route stops and asks for the fork itself; the fork key as target is fine
  const job = hero(70, 70);
  buy(job, ['job.heavy']);
  const past = jobRoute(job, data, 'job.heavy.crusher.t1p0');
  assert.equal(past.reason, 'fork_choice');
  assert.equal(allocateJobRoute(job, data, 'job.heavy.crusher.t0k.debuff').done, true);
  assert.equal(allocateJobRoute(job, data, 'job.heavy.crusher.t1p0').done, true);
  assert.equal(jobNodeState(job, data, 'job.heavy.crusher.t0k.charge').reason, 'fork_taken');
  // a job's line before the job is chosen
  assert.equal(jobRoute(hero(70, 70), data, 'job.heavy.trunk0').reason, 'job_choice');
});
