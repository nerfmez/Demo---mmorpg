import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,allocateJobNode,jobNodeState,jobPath,migrateCharacter,derive,respecJob} from '../../src/core/character.js';
const funded=()=>Object.assign(createCharacter(data),{jobLevel:20,jobPoints:39,gold:10000});
const first=['lesson.prepare','lesson.strike','lesson.rhythm'];
const buy=(ch,ids)=>{for(const id of ids)assert.equal(allocateJobNode(ch,data,id).done,true,id);};
test('reviewed path counts, optional 15/17 point selections and no trial points',()=>{
 assert.equal(createCharacter(data).jobPoints,0);
 const stages=data.jobtree.presentation.stages;
 assert.deepEqual(stages.map(s=>s.gate),[0,0,0,0,0]);
 // The reviewed paths are unchanged; the build lines (scripts/journal-lines.mjs) follow them.
 const reviewed=s=>s.nodes?.length||s.paths.filter(p=>!p.line).map(p=>p.nodes.length);
 assert.deepEqual(stages.slice(0,3).map(reviewed),[6,[6,6],[6,6,6]]);
 for(const [i,chain] of [[0,first],[1,['lesson.prepare','lesson.care','lesson.shelter']]]){
  const ch=funded();buy(ch,chain);buy(ch,stages[1].paths[i].nodes);buy(ch,stages[2].paths[i].nodes);
  assert.equal(39-ch.jobPoints,15);
  buy(ch,i===0?['lesson.care','lesson.shelter']:['lesson.strike','lesson.rhythm']);assert.equal(39-ch.jobPoints,17);
 }
});
test('local prerequisites cannot be reversed or replaced by adjacency; groups start independently',()=>{
 const ch=funded();buy(ch,first);buy(ch,['path.impact','path.reach','path.precision','path.horizon']);
 assert.equal(jobNodeState(ch,data,'advanced.power').can,true);
 assert.equal(39-ch.jobPoints,7);assert.equal(allocateJobNode(ch,data,'advanced.power').done,true);assert.equal(39-ch.jobPoints,8);
 ch.jobNodes.push('advanced.flow');
 const before=structuredClone(ch);assert.equal(allocateJobNode(ch,data,'path.step').reason,'prerequisite');assert.deepEqual(ch,before);
 const mix=funded();buy(mix,[...first,'lesson.care','lesson.shelter','path.impact','path.burst','path.support']);
 assert.equal(jobNodeState(mix,data,'advanced.flow').can,true);
 assert.deepEqual(jobPath(mix,data,'advanced.flow'),['advanced.flow']);
 buy(mix,['path.step','advanced.flow']);assert.equal(39-mix.jobPoints,10);
 const owned=structuredClone(mix);assert.equal(allocateJobNode(mix,data,'advanced.flow').done,undefined);assert.deepEqual(mix,owned);
 const empty=funded();empty.jobPoints=0;assert.equal(allocateJobNode(empty,data,'lesson.prepare').reason,'no_points');assert.deepEqual(empty.jobNodes,['origin']);
});
test('additive tree preserves old/new ownership, points, profession, effects and save data without a reset',()=>{
 const ch=funded();buy(ch,['v1','v2','m_atk','vj']);buy(ch,['lesson.prepare']);
 ch.materials={wolf_fang:4};ch.progress.quests.intro={done:true};
 const before=structuredClone(ch),stats=derive(ch,data);
 assert.deepEqual(migrateCharacter(ch,data),before);assert.deepEqual(derive(ch,data),stats);
 assert.deepEqual(migrateCharacter(ch,data),before,'repeat load is idempotent');
 const poor=structuredClone(ch);poor.gold=0;assert.equal(respecJob(poor,data),false);assert.deepEqual(poor.jobNodes,ch.jobNodes);
 assert.equal(respecJob(ch,data),true);assert.deepEqual(ch.jobNodes,['origin']);assert.equal(ch.jobPoints,39);
});
