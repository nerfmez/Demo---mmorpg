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
