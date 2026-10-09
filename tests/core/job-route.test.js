import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,allocateJobNode,respecJob,migrateCharacter} from '../../src/core/character.js';
import {planJobRoute,allocateJobRoute} from '../../src/core/job-route.js';
const funded=points=>Object.assign(createCharacter(data),{jobLevel:20,jobPoints:points,gold:10000});
const buy=(ch,ids)=>{for(const id of ids)assert.equal(allocateJobNode(ch,data,id).done,true,id);};
const prepared=points=>{const ch=funded(points+3);buy(ch,['lesson.prepare','lesson.strike','lesson.rhythm']);return ch;};
test('later subnode previews exactly its named route, without buying siblings or mutating state',()=>{
 const ch=prepared(10),before=structuredClone(ch),plan=planJobRoute(ch,data,'path.precision');
 assert.deepEqual(plan.nodes,['path.impact','path.reach','path.precision']);assert.equal(plan.cost,3);assert.equal(plan.can,true);assert.deepEqual(ch,before);
 assert.equal(allocateJobRoute(ch,data,'path.precision',{expectedNodes:plan.nodes,expectedCost:plan.cost}).done,true);
 assert.equal(ch.jobPoints,7);assert.ok(!ch.jobNodes.includes('path.burst'));assert.ok(!ch.jobNodes.includes('path.horizon'));
});
test('exact points succeed, insufficient points buy nothing and report the full total',()=>{
 const exact=prepared(3);assert.equal(allocateJobRoute(exact,data,'path.precision').done,true);assert.equal(exact.jobPoints,0);
 const poor=prepared(2),before=structuredClone(poor),result=allocateJobRoute(poor,data,'path.precision');
 assert.equal(result.done,false);assert.equal(result.reason,'no_points');assert.equal(result.need,3);assert.equal(result.cost,3);assert.deepEqual(poor,before);
});
test('already owned nodes are excluded from the price; repeated calls cannot spend again',()=>{
 const ch=prepared(4);buy(ch,['path.impact']);const plan=planJobRoute(ch,data,'path.precision');assert.deepEqual(plan.nodes,['path.reach','path.precision']);assert.equal(plan.cost,2);
 assert.equal(allocateJobRoute(ch,data,'path.precision').done,true);const before=structuredClone(ch);assert.equal(allocateJobRoute(ch,data,'path.precision').reason,'taken');assert.deepEqual(ch,before);
});
test('every group starts independently and a wrong purchase scope cannot spend',()=>{
 const ch=funded(30);assert.equal(allocateJobRoute(ch,data,'path.precision').done,true);
 assert.equal(allocateJobRoute(ch,data,'advanced.power').done,true);
 const before=structuredClone(ch);
 assert.equal(allocateJobRoute(ch,data,'path.burst',{groupId:'support',tier:2}).reason,'outside_group');assert.deepEqual(ch,before);
});
test('flow join chooses one complete internal branch without forcing the other',()=>{
 const ch=funded(4),p=planJobRoute(ch,data,'advanced.continuum');
 assert.equal(p.requiresAllFork,false);assert.equal(p.cost,4);
 assert.deepEqual(p.nodes,['advanced.flow','advanced.echo','advanced.resonance','advanced.continuum']);
 assert.equal(allocateJobRoute(ch,data,'advanced.continuum').done,true);assert.equal(ch.jobPoints,0);assert.ok(!ch.jobNodes.includes('advanced.dash'));
});
test('invalid late prerequisite leaves no partial allocation, and profession/Job requirements stay canonical',()=>{
 const d=structuredClone(data);d.jobtree.nodes['path.precision'].requiresJob='warden';const ch=prepared(10),before=structuredClone(ch);
 assert.equal(allocateJobRoute(ch,d,'path.precision').reason,'requires_job');assert.deepEqual(ch,before);
 d.jobtree.nodes['path.precision'].requiresJob=undefined;d.jobtree.nodes['path.precision'].requires=['path.reach','missing-node'];assert.equal(allocateJobRoute(ch,d,'path.precision').done,false);assert.deepEqual(ch,before);
 d.jobtree.nodes['path.precision'].requires=['path.reach'];d.jobtree.nodes['path.precision'].type='job';ch.jobLevel=1;const low=structuredClone(ch);assert.equal(allocateJobRoute(ch,d,'path.precision').reason,'job_level');assert.deepEqual(ch,low);
});
test('cycles and genuinely ambiguous legacy adjacency require explicit selection instead of invented routes',()=>{
 const d=structuredClone(data),ch=prepared(10),before=structuredClone(ch);d.jobtree.nodes['path.impact'].requires=['path.precision'];assert.equal(allocateJobRoute(ch,d,'path.precision').reason,'invalid_graph');assert.deepEqual(ch,before);
 d.jobtree.nodes['path.impact'].requires=[];delete d.jobtree.nodes['path.precision'].requires;
 assert.equal(allocateJobRoute(ch,d,'path.precision').reason,'ambiguous_route');assert.deepEqual(ch,before);
 d.jobtree.presentation.stages[1].paths.push({...d.jobtree.presentation.stages[1].paths[0],id:'alternate'});
 assert.equal(allocateJobRoute(ch,d,'path.impact').reason,'ambiguous_group');assert.deepEqual(ch,before);
 assert.equal(allocateJobRoute(ch,d,'path.impact',{groupId:'impact'}).done,true);
});
test('stale approval rejects a changed preview; reload and gold respec preserve canonical accounting',()=>{
 const ch=prepared(10),p=planJobRoute(ch,data,'path.precision');buy(ch,['path.impact']);const before=structuredClone(ch);
 assert.equal(allocateJobRoute(ch,data,'path.precision',{expectedNodes:p.nodes,expectedCost:p.cost}).reason,'stale_preview');assert.deepEqual(ch,before);
 assert.equal(allocateJobRoute(ch,data,'path.precision').done,true);const saved=JSON.parse(JSON.stringify(ch));assert.deepEqual(migrateCharacter(saved,data),ch);
 assert.equal(respecJob(saved,data),true);assert.deepEqual(saved.jobNodes,['origin']);assert.equal(saved.jobPoints,13);
});
