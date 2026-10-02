import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, addExp, allocateStat, jobNodeState, allocateJobNode, respecStats, respecJob, derive, expToNext, currentJob, jobTierProgress, jobPath, jobJourneyProgress } from '../../src/core/character.js';

test('character level gives Stat Points; Job Level gives separate Job Points through 40', () => {
 const ch=createCharacter(data),sp=ch.statPoints;
 addExp(ch,data,expToNext(data,1),0);assert.equal(ch.level,2);assert.equal(ch.statPoints,sp+3);assert.equal(ch.jobLevel,1);
 addExp(ch,data,0,1e9);assert.equal(ch.jobLevel,40);assert.equal(ch.jobPoints,39);assert.equal(ch.level,2);assert.equal(ch.jobExp,0);
});
test('allocated stats improve their actual combat values',()=>{
 const ch=createCharacter(data),before=derive(ch,data);allocateStat(ch,'VIT',2);allocateStat(ch,'INT',2);const after=derive(ch,data);
 assert.ok(after.maxHp>before.maxHp);assert.ok(after.maxMp>before.maxMp);assert.ok(after.magic>before.magic);
});
test('everyone starts in the shared foundation and whole areas open sequentially',()=>{
 const ch=createCharacter(data);ch.jobPoints=39;ch.jobLevel=40;
 for(const id of data.jobtree.nodes.origin.links){assert.equal(data.jobtree.nodes[id].category,'foundation');assert.equal(data.jobtree.sections[data.jobtree.nodes[id].section].tier,1);}
 for(const id of ['v1','a1','r1','w1','element_fire_1','mana_pool_2'])assert.equal(jobNodeState(ch,data,id).reason,'tier_points',id);
 for(const id of ['f_hp','f_def'])assert.ok(allocateJobNode(ch,data,id).done);
 assert.equal(jobJourneyProgress(ch,data).current.tier,1);
 assert.equal(jobNodeState(ch,data,'v1').reason,'tier_points');
 assert.ok(allocateJobNode(ch,data,'f_atk').done);
 assert.equal(jobJourneyProgress(ch,data).current.tier,2);
 assert.ok(jobNodeState(ch,data,'v1').can);
 assert.equal(jobNodeState(ch,data,'a1').reason,'not_linked','opening an area never buys its connected entry');
 assert.equal(jobNodeState(ch,data,'v2').reason,'not_linked');
 assert.deepEqual(jobPath(ch,data,'v5'),['v1','v2','v5']);
 for(const id of ['v1','v2','v5'])assert.ok(allocateJobNode(ch,data,id).done);
 assert.equal(jobTierProgress(ch,data,'v5').requires,3,'all nodes reference the same area gate, without individual thresholds');
 assert.equal(jobNodeState(ch,data,'aoe_master').reason,'tier_points');
});
test('a profession needs its actual connected entrance, later choice and one oath only',()=>{
 const ch=createCharacter(data);ch.jobPoints=20;
 assert.equal(jobNodeState(ch,data,'vj').reason,'job_level');
 ch.jobLevel=5;for(const id of ['f_hp','f_mp','f_mag','a1','a2'])assert.ok(allocateJobNode(ch,data,id).done);
 assert.equal(jobNodeState(ch,data,'vj').reason,'not_linked');
 assert.ok(allocateJobNode(ch,data,'aj').done);assert.equal(currentJob(ch,data).branch,'arcanist');
 assert.equal(jobNodeState(ch,data,'vj').reason,'one_job');assert.equal(jobNodeState(ch,data,'v3').reason,'requires_job');
});
test('each single profession can spend all 39 points without buying unrelated chapters',()=>{
 for(const group of data.jobtree.groups){
  const ch=createCharacter(data);ch.jobLevel=40;ch.jobPoints=39;ch.gold=10000;
  const category=data.jobtree.nodes[group.root].category;
  const candidates=Object.entries(data.jobtree.nodes).filter(([,n])=>n.category==='foundation'||n.category===category||(n.category==='specialist'&&(n.branch||n.requiresJob)===group.id));
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
 for(const id of ['f_hp','f_def','f_atk','v1','v2','m_atk','vj','va1'])assert.ok(allocateJobNode(ch,data,id).done,id);
 assert.equal(jobNodeState(ch,data,'va4').reason,'tier_points');
 for(const id of ['v5','v6','v3','v4'])assert.ok(allocateJobNode(ch,data,id).done,id);
 assert.ok(jobNodeState(ch,data,'va4').can,'v6 is a real cross-chapter bridge');
 assert.equal(jobNodeState(ch,data,'cc_time2').reason,'not_linked','an unlocked hybrid group still requires its path');
});
test('gold respec refunds all investment, never consumes materials or other progression',()=>{
 const ch=createCharacter(data);ch.gold=10000;ch.statPoints=6;allocateStat(ch,'STR',6);assert.ok(respecStats(ch,data));assert.equal(ch.statPoints,6);
 ch.jobPoints=2;allocateJobNode(ch,data,'f_hp');allocateJobNode(ch,data,'f_def');assert.ok(respecJob(ch,data));assert.equal(ch.jobPoints,2);
 const poor=createCharacter(data);poor.gold=0;assert.equal(respecStats(poor,data),false);
});
