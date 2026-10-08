import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,allocateJobNode,jobNodeState,jobTierProgress,migrateCharacter,respecJob,derive} from '../../src/core/character.js';
import {computeSkill,movementSkill} from '../../src/core/skills.js';
import {planJobRoute,allocateJobRoute} from '../../src/core/job-route.js';
const tree=data.jobtree;
const groups=tree.presentation.stages.flatMap(s=>s.nodes?[{id:'stage-1',nodes:s.nodes}]:s.paths);
const fresh=points=>Object.assign(createCharacter(data),{jobPoints:points,jobLevel:40,gold:10000});
test('every visible group and every descendant can be purchased using only its own points and parents',()=>{
 for(const group of groups){
  const roots=group.nodes.filter(id=>id!==tree.origin&&!tree.nodes[id].requires.length&&!tree.nodes[id].requiresAny?.length);
  if(group.id!=='stage-1')assert.ok(roots.length,group.id);
  for(const root of roots){const ch=fresh(1);assert.ok(allocateJobNode(ch,data,root).done,root);assert.equal(ch.jobPoints,0);assert.deepEqual(ch.jobNodes,['origin',root]);}
  for(const id of group.nodes.filter(id=>id!==tree.origin)){
   const ch=fresh(999),plan=planJobRoute(ch,data,id,{groupId:group.id});
   assert.ok(plan.can,id+': '+plan.reason);assert.ok(plan.nodes.every(k=>group.nodes.includes(k)),id);
   const zero=fresh(0),before=structuredClone(zero);assert.equal(allocateJobRoute(zero,data,id).reason,'no_points');assert.deepEqual(zero,before);
   const poor=fresh(plan.cost-1),saved=structuredClone(poor);assert.equal(allocateJobRoute(poor,data,id).done,false);assert.deepEqual(poor,saved);
   const exact=fresh(plan.cost);assert.ok(allocateJobRoute(exact,data,id).done,id);assert.equal(exact.jobPoints,0);
  }
 }
});
test('local investment ignores every other group; malformed cross-group prerequisites never auto-spend even when owned',()=>{
 const ch=fresh(99);ch.jobNodes.push(...groups.find(g=>g.id==='support').nodes);
 assert.equal(jobTierProgress(ch,data,'line.physical.2.join').spent,0);
 assert.equal(jobNodeState(ch,data,'line.physical.2.join').reason,'tier_points');
 const d=structuredClone(data);d.jobtree.nodes['path.impact'].requires=['path.support'];
 const before=structuredClone(ch);assert.equal(allocateJobNode(ch,d,'path.impact').reason,'outside_group');
 assert.equal(allocateJobRoute(ch,d,'path.precision').reason,'outside_group');assert.deepEqual(ch,before);
});
test('revision 2 saves retain every valid node, refund retired/missing IDs once, and preserve unrelated character fields',()=>{
 const ch=fresh(7);ch.treeRevision=2;ch.jobNodes=['origin','v1','vj','path.precision','advanced.flow','line.damage.mastery.10','bridge.physical-damage.2','removed-node'];
 ch.materials={wolf_fang:9};ch.skills.firebolt=3;ch.progress.quests.intro={done:true};
 const unrelated=({jobNodes,jobPoints,treeRevision,progress,...rest})=>({...rest,progress:{...progress,balanceMigration:undefined}});
 const before=structuredClone(ch);migrateCharacter(ch,data);
 assert.equal(ch.jobPoints,9);assert.deepEqual(ch.jobNodes,before.jobNodes.slice(0,-2));assert.deepEqual(unrelated(ch),unrelated(before));
 const once=structuredClone(ch);assert.deepEqual(migrateCharacter(ch,data),once);
 assert.ok(respecJob(ch,data));assert.equal(ch.jobPoints,14);assert.deepEqual(ch.jobNodes,['origin']);
 const after=structuredClone(ch);assert.deepEqual(migrateCharacter(ch,data),after);
});
test('neutral action roots improve physical, magic, healing, barrier and summon skill cadence through real formulas',()=>{
 for(const node of ['path.impact','advanced.power','line.damage.2.entry','line.physical.2.entry'])for(const skill of ['slash','firebolt','healing_spring','ward','spirit_wolf']){
  if(!data.skills.combat[skill])throw Error('unknown fixture '+skill);
  const ch=fresh(1);ch.skills[skill]=1;ch.slots[0]={skill,mods:[]};
  const before=computeSkill(ch,data,derive(ch,data),0);assert.ok(allocateJobNode(ch,data,node).done);
  const after=computeSkill(ch,data,derive(ch,data),0);assert.ok(after.cooldown<before.cooldown,node+' '+skill);
 }
});
test('mixed flow has movement-neutral roots; damage/element roots work for physical and magical damage',()=>{
 const ch=fresh(1),before=derive(ch,data);assert.ok(allocateJobNode(ch,data,'advanced.flow').done);assert.ok(derive(ch,data).moveSpeed>before.moveSpeed);
 for(const node of ['line.element.2.entry'])for(const skill of ['slash','firebolt']){
  const ch=fresh(1);ch.skills[skill]=1;ch.slots[0]={skill,mods:[]};const before=computeSkill(ch,data,derive(ch,data),0);
  assert.ok(allocateJobNode(ch,data,node).done);assert.ok(computeSkill(ch,data,derive(ch,data),0).damage>before.damage,node+' '+skill);
 }
 const guard=fresh(1),hp=derive(guard,data).maxHp;assert.ok(allocateJobNode(guard,data,'advanced.guard').done);assert.ok(derive(guard,data).maxHp>hp);
});

test('speed roots improve both combat cadence and movement recharge without pretending cast speed affects movement',()=>{
 const ch=fresh(1);ch.movement='dash';ch.movementSkills=['dash'];const before=movementSkill(ch,data,derive(ch,data));
 assert.ok(allocateJobNode(ch,data,'line.speed.2.entry').done);const after=movementSkill(ch,data,derive(ch,data));assert.ok(after.recharge<before.recharge);
});

test('rewired branches and ANY joins fit their declared canvas on desktop and phone',async()=>{
 const {createLayout}=await import('../../src/ui/skill-journal/layout.js');
 const {createPresentation}=await import('../../src/ui/skill-journal/presentation.js');
 const p=createPresentation(tree,tree.presentation),layout=createLayout(tree);
 for(const tier of p.tiers)for(const g of p.groups(tier))for(const phone of [false,true]){
  const result=layout.layout(g.ids,g.ids,tier,phone,false,{width:phone?358:1100,height:420},g.grid,g.lineId?g:null);
  for(const id of g.ids){const [x,y]=result.coords[id];assert.ok(x>=0&&x<=result.width&&y>=0&&y<=result.height,id+' fits '+(phone?'phone':'desktop'));}
  if(g.id==='flow')assert.ok(result.coords['advanced.continuum'][phone?1:0]>result.coords['advanced.resonance'][phone?1:0],'ANY endpoint follows both local alternatives');
 }
});
