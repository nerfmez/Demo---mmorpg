import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, addExp, allocateStat, allocateJobNode, respecStats, respecJob, derive, expToNext } from '../../src/core/character.js';

test('character level gives Stat Points; Job Level gives separate Job Points through 70 (the wheel tree)', () => {
 const ch=createCharacter(data),sp=ch.statPoints;
 addExp(ch,data,expToNext(data,1),0);assert.equal(ch.level,2);assert.equal(ch.statPoints,sp+3);assert.equal(ch.jobLevel,1);
 assert.equal(ch.jobPoints,1,'Job Lv 1 brings its point');addExp(ch,data,0,1e12);assert.equal(ch.jobLevel,70);assert.equal(ch.jobPoints,70,'the wheel tree has 39 + 31');assert.equal(ch.level,2);assert.equal(ch.jobExp,0);
});
test('allocated stats improve their actual combat values',()=>{
 const ch=createCharacter(data),before=derive(ch,data);allocateStat(ch,'VIT',2);allocateStat(ch,'INT',2);const after=derive(ch,data);
 assert.ok(after.maxHp>before.maxHp);assert.ok(after.maxMp>before.maxMp);assert.ok(after.magic>before.magic);
});
// the wheel's structure (one job at Job Lv 40, forks, routes, respec by cost): tests/core/wheel-tree.test.js
test('gold respec refunds all investment, never consumes materials or other progression',()=>{
 const ch=createCharacter(data);ch.gold=10000;ch.statPoints=6;allocateStat(ch,'STR',6);assert.ok(respecStats(ch,data));assert.equal(ch.statPoints,6);
 ch.jobPoints=2;assert.ok(allocateJobNode(ch,data,'in.center.c1').done);assert.ok(allocateJobNode(ch,data,'in.center.c2').done);assert.equal(ch.jobPoints,0);assert.ok(respecJob(ch,data));assert.equal(ch.jobPoints,2);
 const poor=createCharacter(data);poor.gold=0;assert.equal(respecStats(poor,data),false);
});
