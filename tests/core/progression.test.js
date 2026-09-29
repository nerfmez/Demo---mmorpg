import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, addExp, allocateStat, jobNodeState, allocateJobNode, respecStats, respecJob, derive, expToNext, currentJob } from '../../src/core/character.js';

test('character level gives stat points; job level gives job points, separately', () => {
  const ch = createCharacter(data);
  const sp = ch.statPoints;
  addExp(ch, data, expToNext(data, 1), 0);
  assert.equal(ch.level, 2);
  assert.equal(ch.statPoints, sp + data.progression.character.statPointsPerLevel);
  assert.equal(ch.jobLevel, 1);
  assert.equal(ch.jobPoints, 0);
  addExp(ch, data, 0, 1000);
  assert.ok(ch.jobLevel > 1);
  assert.equal(ch.jobPoints, ch.jobLevel - 1);
  assert.equal(ch.level, 2);
});

test('stats raise derived values', () => {
  const ch = createCharacter(data);
  const before = derive(ch, data);
  allocateStat(ch, 'VIT', 2);
  allocateStat(ch, 'INT', 2);
  const after = derive(ch, data);
  assert.ok(after.maxHp > before.maxHp);
  assert.ok(after.maxMp > before.maxMp);
  assert.ok(after.magic > before.magic);
});

test('job tree: deeper tiers require points in earlier tiers; Job choice still uses level and one-Job rules', () => {
  const ch = createCharacter(data);
  ch.jobPoints = 10;
  assert.ok(jobNodeState(ch, data, 'v1').can);
  assert.ok(jobNodeState(ch, data, 'v2').can);
  let gate = jobNodeState(ch, data, 'v5');
  assert.equal(gate.reason, 'tier_points');
  assert.deepEqual({ have: gate.have, need: gate.need, tier: gate.tier }, { have: 0, need: 2, tier: 2 });
  assert.ok(allocateJobNode(ch, data, 'v1').done);
  assert.equal(jobNodeState(ch, data, 'v5').reason, 'tier_points');
  assert.ok(allocateJobNode(ch, data, 'v2').done);
  assert.ok(jobNodeState(ch, data, 'v5').can, 'any two earlier-tier notes unlock stage II; no exact branch is forced');
  assert.equal(jobNodeState(ch, data, 'vj').reason, 'job_level');
  ch.jobLevel = data.progression.job.jobChoiceLevel;
  assert.ok(allocateJobNode(ch, data, 'vj').done);
  assert.equal(currentJob(ch, data).name, 'Vanguard');
  assert.equal(jobNodeState(ch, data, 'aj').reason, 'one_job');
});

test('respec costs gold only and refunds every point', () => {
  const ch = createCharacter(data);
  ch.gold = 10000;
  ch.statPoints = 6;
  allocateStat(ch, 'STR', 6);
  assert.ok(respecStats(ch, data));
  assert.equal(ch.statPoints, 6);
  assert.equal(ch.stats.STR, data.progression.character.startingStats.STR);
  ch.jobPoints = 2;
  allocateJobNode(ch, data, 'r1');
  allocateJobNode(ch, data, 'r2');
  assert.ok(respecJob(ch, data));
  assert.equal(ch.jobPoints, 2);
  assert.deepEqual(ch.jobNodes, ['origin']);
  const poor = createCharacter(data);
  poor.gold = 0;
  poor.level = 5;
  assert.equal(respecStats(poor, data), false);
});

test('hybrid chapters use point stages without forcing one exact route or a second Job', () => {
  const ch=createCharacter(data);ch.jobLevel=20;ch.jobPoints=19;
  for(const id of ['v1','v2','vj','va1','va2','a1','a2','a6']) assert.ok(allocateJobNode(ch,data,id).done,id);
  assert.equal(currentJob(ch,data).branch,'vanguard');
  assert.equal(jobNodeState(ch,data,'aj').reason,'one_job');
  assert.equal(jobNodeState(ch,data,'a9').reason,'requires_job','specialist node from another Job stays blocked');
  const before=ch.jobPoints;
  const gate=jobNodeState(ch,data,'va4');
  assert.equal(gate.reason,'tier_points');
  assert.deepEqual({have:gate.have,need:gate.need,tier:gate.tier},{have:2,need:3,tier:3});
  assert.ok(allocateJobNode(ch,data,'cc_time').done,'a different stage-II branch can satisfy the stage requirement');
  assert.ok(allocateJobNode(ch,data,'va4').done,'stage III unlocks without forcing va3 specifically');
  assert.equal(ch.jobPoints,before-2);
});

test('every profession oath advances by invested stages and still refunds all points', () => {
  for(const group of data.jobtree.groups){
    const ch=createCharacter(data);ch.jobLevel=20;ch.jobPoints=100;ch.gold=10000;
    assert.ok(allocateJobNode(ch,data,group.job).done,group.job);
    const own=Object.entries(data.jobtree.nodes).filter(([,n])=>n.category==='specialist'&&n.group===group.id);
    const tier2=own.find(([,n])=>n.tier===2)?.[0];
    const tier3=own.find(([,n])=>n.tier===3)?.[0];
    const tier4=own.find(([,n])=>n.tier===4)?.[0];
    assert.ok(tier2&&tier3&&tier4,group.id+' has four stages');
    assert.ok(allocateJobNode(ch,data,tier2).done,tier2);
    assert.ok(allocateJobNode(ch,data,tier3).done,tier3);
    assert.ok(allocateJobNode(ch,data,tier4).done,tier4);
    for(const [id,n] of Object.entries(data.jobtree.nodes)){
      if(n.requiresJob&&n.requiresJob!==group.id)assert.equal(jobNodeState(ch,data,id).reason,'requires_job',id);
    }
    const granted=ch.jobPoints+ch.jobNodes.length-1;
    assert.ok(respecJob(ch,data));assert.equal(ch.jobPoints,granted);assert.equal(ch.version,2);
  }
});
