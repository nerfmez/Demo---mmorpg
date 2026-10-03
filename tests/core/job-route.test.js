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
test('stage gates cannot be funded by the batch itself and missing parents never cross groups/stages',()=>{
 const gated=funded(30);buy(gated,['lesson.prepare','lesson.strike']);const before=structuredClone(gated),locked=allocateJobRoute(gated,data,'path.precision');assert.equal(locked.reason,'tier_points');assert.deepEqual(gated,before);
 const cross=prepared(20);buy(cross,['lesson.care','lesson.shelter','path.support','path.ward']);const crossBefore=structuredClone(cross);const p=allocateJobRoute(cross,data,'advanced.power');assert.equal(p.reason,'outside_group');assert.deepEqual(p.missing,['path.horizon']);assert.deepEqual(cross,crossBefore);
 assert.equal(allocateJobRoute(cross,data,'path.precision',{groupId:'support',tier:2}).reason,'outside_group');assert.deepEqual(cross,crossBefore);
});
test('both-parent join has one explicit ALL route, not an arbitrary branch choice',()=>{
 const ch=prepared(25);buy(ch,['lesson.care','lesson.shelter','path.impact','path.burst','path.support','path.step']);
 const p=planJobRoute(ch,data,'advanced.continuum');assert.equal(p.requiresAllFork,true);assert.deepEqual(p.nodes,['advanced.flow','advanced.echo','advanced.resonance','advanced.dash','advanced.momentum','advanced.continuum']);assert.equal(p.cost,6);
 assert.equal(allocateJobRoute(ch,data,'advanced.continuum').done,true);assert.ok(p.nodes.every(id=>ch.jobNodes.includes(id)));assert.ok(!ch.jobNodes.includes('advanced.power'));
});
test('invalid late prerequisite leaves no partial allocation, and profession/Job requirements stay canonical',()=>{
 const d=structuredClone(data);d.jobtree.nodes['path.precision'].requiresJob='warden';const ch=prepared(10),before=structuredClone(ch);
 assert.equal(allocateJobRoute(ch,d,'path.precision').reason,'requires_job');assert.deepEqual(ch,before);
 d.jobtree.nodes['path.precision'].requiresJob=undefined;d.jobtree.nodes['path.precision'].requires=['path.reach','missing-node'];assert.equal(allocateJobRoute(ch,d,'path.precision').done,false);assert.deepEqual(ch,before);
 d.jobtree.nodes['path.precision'].requires=['path.reach'];d.jobtree.nodes['path.precision'].type='job';ch.jobLevel=1;const low=structuredClone(ch);assert.equal(allocateJobRoute(ch,d,'path.precision').reason,'job_level');assert.deepEqual(ch,low);
});
test('cycles and genuinely ambiguous legacy adjacency require explicit selection instead of invented routes',()=>{
 const d=structuredClone(data),ch=prepared(10),before=structuredClone(ch);d.jobtree.nodes['path.impact'].requires=['path.precision'];assert.equal(allocateJobRoute(ch,d,'path.precision').reason,'invalid_graph');assert.deepEqual(ch,before);
 d.jobtree.nodes['path.impact'].requires=['lesson.rhythm'];delete d.jobtree.nodes['path.precision'].requires;
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
