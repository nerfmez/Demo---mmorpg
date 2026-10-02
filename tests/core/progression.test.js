import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, addExp, allocateStat, jobNodeState, allocateJobNode, respecStats, respecJob, derive, expToNext, currentJob, jobTierProgress, jobPath } from '../../src/core/character.js';

test('character level gives Stat Points; Job Level gives separate Job Points through 40', () => {
 const ch=createCharacter(data),sp=ch.statPoints;
 addExp(ch,data,expToNext(data,1),0);assert.equal(ch.level,2);assert.equal(ch.statPoints,sp+3);assert.equal(ch.jobLevel,1);
 addExp(ch,data,0,1e9);assert.equal(ch.jobLevel,40);assert.equal(ch.jobPoints,39);assert.equal(ch.level,2);assert.equal(ch.jobExp,0);
});
test('allocated stats improve their actual combat values',()=>{
 const ch=createCharacter(data),before=derive(ch,data);allocateStat(ch,'VIT',2);allocateStat(ch,'INT',2);const after=derive(ch,data);
 assert.ok(after.maxHp>before.maxHp);assert.ok(after.maxMp>before.maxMp);assert.ok(after.magic>before.magic);
});
test('section gates and small-node links are independent, including unlocked sections',()=>{
 const ch=createCharacter(data);ch.jobPoints=39;ch.jobLevel=40;
 assert.equal(jobNodeState(ch,data,'v2').reason,'not_linked');
 assert.equal(jobNodeState(ch,data,'v5').reason,'not_linked');
 assert.equal(jobTierProgress(ch,data,'v5').requires,0,'small nodes never have an independent investment gate');
 assert.equal(jobNodeState(ch,data,'aoe_master').reason,'tier_points');
 for(const id of ['v1','m_atk','f_hp'])assert.ok(allocateJobNode(ch,data,id).done,id);
 assert.equal(jobTierProgress(ch,data,'v5').spent,3,'all invested points count toward the major section');
 assert.equal(jobNodeState(ch,data,'v5').reason,'not_linked','section unlock cannot bypass a predecessor');
 assert.deepEqual(jobPath(ch,data,'v5'),['v2','v5']);
 assert.ok(allocateJobNode(ch,data,'v2').done);assert.ok(allocateJobNode(ch,data,'v5').done);
});
test('a profession needs its actual connected entrance, later choice and one oath only',()=>{
 const ch=createCharacter(data);ch.jobPoints=20;
 assert.equal(jobNodeState(ch,data,'vj').reason,'job_level');
 ch.jobLevel=5;for(const id of ['a1','a2','f_hp'])assert.ok(allocateJobNode(ch,data,id).done);
 assert.equal(jobNodeState(ch,data,'vj').reason,'not_linked');
 assert.ok(allocateJobNode(ch,data,'aj').done);assert.equal(currentJob(ch,data).branch,'arcanist');
 assert.equal(jobNodeState(ch,data,'vj').reason,'one_job');assert.equal(jobNodeState(ch,data,'v3').reason,'requires_job');
});
test('each single profession can spend all 39 points without buying unrelated chapters',()=>{
 for(const group of data.jobtree.groups){
  const ch=createCharacter(data);ch.jobLevel=40;ch.jobPoints=39;ch.gold=10000;
  const category=data.jobtree.nodes[group.root].category;
  const candidates=Object.entries(data.jobtree.nodes).filter(([,n])=>n.category===category||(n.category==='specialist'&&(n.branch||n.requiresJob)===group.id));
  while(ch.jobPoints){
   const route=currentJob(ch,data)?jobPath(ch,data,group.id+'_t6_6'):[];
   const next=route.find(id=>jobNodeState(ch,data,id).can)||
     (jobNodeState(ch,data,group.job).can?group.job:null)||candidates.find(([id])=>jobNodeState(ch,data,id).can)?.[0];
   assert.ok(next,group.id+' reachable point '+(40-ch.jobPoints));assert.ok(allocateJobNode(ch,data,next).done);
  }
  assert.equal(ch.jobNodes.length,40);assert.equal(currentJob(ch,data).branch,group.id);
  assert.ok(ch.jobNodes.some(id=>data.jobtree.sections[data.jobtree.nodes[id].section].tier===6),group.id+' reaches the final group');
  assert.ok(respecJob(ch,data));assert.equal(ch.jobPoints,39);assert.deepEqual(ch.jobNodes,['origin']);
 }
});
test('hybrid networks stay optional and cannot jump across unowned bridges',()=>{
 const ch=createCharacter(data);ch.jobPoints=39;ch.jobLevel=40;
 for(const id of ['v1','v2','m_atk','vj','va1'])assert.ok(allocateJobNode(ch,data,id).done,id);
 assert.equal(jobNodeState(ch,data,'va4').reason,'tier_points');
 for(const id of ['v5','v6','v3','v4'])assert.ok(allocateJobNode(ch,data,id).done,id);
 assert.ok(jobNodeState(ch,data,'va4').can,'v6 is a real cross-chapter bridge');
 assert.equal(jobNodeState(ch,data,'cc_time2').reason,'not_linked','an unlocked hybrid group still requires its path');
});
test('gold respec refunds all investment, never consumes materials or other progression',()=>{
 const ch=createCharacter(data);ch.gold=10000;ch.statPoints=6;allocateStat(ch,'STR',6);assert.ok(respecStats(ch,data));assert.equal(ch.statPoints,6);
 ch.jobPoints=2;allocateJobNode(ch,data,'r1');allocateJobNode(ch,data,'r2');assert.ok(respecJob(ch,data));assert.equal(ch.jobPoints,2);
 const poor=createCharacter(data);poor.gold=0;assert.equal(respecStats(poor,data),false);
});
