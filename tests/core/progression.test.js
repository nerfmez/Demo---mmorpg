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

test('job tree: walk from origin, the Job node needs job level and only one Job', () => {
  const ch = createCharacter(data);
  ch.jobPoints = 10;
  assert.equal(jobNodeState(ch, data, 'v2').reason, 'not_linked');
  assert.ok(allocateJobNode(ch, data, 'v1').done);
  assert.ok(allocateJobNode(ch, data, 'v2').done);
  assert.equal(jobNodeState(ch, data, 'vj').reason, 'job_level');
  ch.jobLevel = data.progression.job.jobChoiceLevel;
  assert.ok(allocateJobNode(ch, data, 'vj').done);
  assert.equal(currentJob(ch, data).name, 'Vanguard');
  allocateJobNode(ch, data, 'a1');
  allocateJobNode(ch, data, 'a2');
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
