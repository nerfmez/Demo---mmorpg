import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createPresentation} from '../../src/ui/skill-journal/presentation.js';
import {createLayout} from '../../src/ui/skill-journal/layout.js';
import {createCharacter,allocateJobNode,migrateCharacter} from '../../src/core/character.js';
import {planJobRoute,allocateJobRoute} from '../../src/core/job-route.js';
const tree=data.jobtree,p=createPresentation(tree,tree.presentation);
const active=tree.presentation.stages.flatMap(s=>s.nodes||s.paths.flatMap(g=>g.nodes));
const fresh=()=>Object.assign(createCharacter(data),{jobLevel:100,jobPoints:999});
const prepared=()=>{const ch=fresh();for(const id of ['lesson.prepare','lesson.strike','lesson.rhythm'])assert.ok(allocateJobNode(ch,data,id).done);return ch;};
test('every active choice remains reachable, with nine independent line hubs rather than family hubs',()=>{
 const before=JSON.stringify(tree),seen=[];
 assert.deepEqual(p.tiers.map(t=>t===1?0:p.hubs(t).length),[0,11,12,9,9]);
 assert.deepEqual(p.tiers.map(t=>t===1?1:p.groups(t).length),[1,11,12,9,18]);
 for(const tier of p.tiers){if(tier===1){seen.push(...p.stage(tier));continue;}
  for(const g of p.groups(tier)){seen.push(...g.ids,...g.bridges||[]);assert.ok(!g.id.startsWith('fam.'));if(g.lineId)assert.ok(g.ids.every(id=>tree.nodes[id].line===g.lineId));}
 }
 assert.deepEqual([...new Set(seen)].sort(),[...new Set(active)].sort());
 for(const id of active)if(p.tierOf(id)>1){const g=p.groups(p.tierOf(id)).find(g=>g.id===p.groupOf(id));assert.ok(g&&(g.ids.includes(id)||g.bridges?.includes(id)),id);}
 assert.equal(JSON.stringify(tree),before,'display indexing never rewrites canonical data or saves');
});
test('no active display or purchase scope contains a retired bridge',()=>{
 assert.ok(Object.values(tree.nodes).some(n=>n.retired));
 for(const tier of p.tiers)for(const g of p.groups(tier))assert.deepEqual(g.bridges||[],[]);
 assert.ok(active.every(id=>!tree.nodes[id].retired));
});
test('display scopes retain exact canonical plans/costs across partial builds, mastery and no points',()=>{
 const states=[fresh(),prepared()],working=prepared();
 // Grow a legitimate character through the full catalog; capture each chapter boundary.
 for(const tier of [1,2,3,4,5]){
  const ids=p.stage(tier),pending=new Set(ids);let changed=true;
  states.push(structuredClone(working));
  while(changed&&pending.size){changed=false;for(const id of pending)if(working.jobNodes.includes(id)||allocateJobNode(working,data,id).done){pending.delete(id);changed=true;}}
  assert.equal(pending.size,0,'all original choices remain purchasable at tier '+tier);
  states.push(structuredClone(working));
 }
 states.push({...prepared(),jobPoints:0});
 for(const tier of [2,3,4,5])for(const display of p.groups(tier))for(const id of [...display.ids,...display.bridges||[]]){
  const owner=tree.presentation.stages.find(s=>s.id===tier).paths.find(g=>g.nodes.includes(id));
  for(const ch of states){const before=structuredClone(ch),old=planJobRoute(ch,data,id,{tier,groupId:owner.id}),next=planJobRoute(ch,data,id,{tier,groupId:p.routeScope(id,display.id)});assert.deepEqual(next,old,id+' via '+display.id);assert.deepEqual(ch,before);}
 }
});
test('local auto route spends only its own group and round-trips existing saved IDs',()=>{
 const a=prepared(),b=structuredClone(a),id='line.physical.2.join';
 const old=planJobRoute(a,data,id,{tier:2,groupId:'view.physical.2'}),next=planJobRoute(b,data,id,{tier:2,groupId:p.routeScope(id,'view.physical.2')});
 assert.equal(next.can,true);assert.equal(next.cost,4);assert.ok(next.nodes.every(id=>tree.nodes[id].line==='line.physical'));
 const opts=plan=>({tier:2,groupId:plan.groupId,expectedNodes:plan.nodes,expectedCost:plan.cost});
 assert.deepEqual(allocateJobRoute(b,data,id,opts(next)),allocateJobRoute(a,data,id,opts(old)));assert.deepEqual(b,a);
 assert.deepEqual(migrateCharacter(JSON.parse(JSON.stringify(b)),data),a);
 assert.deepEqual(planJobRoute(b,data,id,{tier:2,groupId:p.routeScope(id,'view.physical.2')}),planJobRoute(a,data,id,{tier:2,groupId:'view.physical.2'}));
});
test('every independent line fits readable phone columns, including mastery',()=>{
 const layout=createLayout(tree);
 for(const tier of [2,3,4,5])for(const g of p.groups(tier).filter(g=>g.lineId)){
  const parents=g.ids.flatMap(id=>tree.nodes[id].requires||[]).filter(id=>!g.ids.includes(id)&&!tree.nodes[id].bridge);
  const ids=[...new Set([...g.ids,...g.bridges,...parents])],l=layout.layout(ids,g.ids,tier,true,false,{width:358,height:340},g.grid,g);
  assert.ok(l.zoom>=1);assert.ok(ids.every(id=>l.coords[id]),g.id);
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=l.coords[ids[i]],b=l.coords[ids[j]];assert.ok(Math.abs(a[0]-b[0])>=170||Math.abs(a[1]-b[1])>=140,g.id+' '+ids[i]+' '+ids[j]);}
 }
});
