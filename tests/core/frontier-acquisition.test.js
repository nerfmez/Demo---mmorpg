import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,migrateCharacter,derive,CHARACTER_VERSION} from '../../src/core/character.js';
import {craft} from '../../src/core/crafting.js';
import {computeSkill,modFits,socketMod,socketMovementMod} from '../../src/core/skills.js';
import {modStatus} from '../../src/ui/buildmeta.js';
import {skillCraftGuide} from '../../src/core/craft-order.js';
import {writeSlot,loadSlot} from '../../src/save.js';
const skills=Object.entries(data.skills.combat).filter(([,d])=>d.prototype);
const mods=Object.entries(data.mods.mods).filter(([,d])=>d.prototype);
const recipes=Object.entries(data.recipes.recipes).filter(([,r])=>(r.type==='skill'?skills:r.type==='mod'?mods:[]).some(([id])=>id===r.result));
test('all 14 skills and 19 mods are crafted from real drops with exact atomic costs and durable ownership',()=>{
 assert.equal(skills.length,14);assert.equal(mods.length,19);assert.equal(recipes.length,33);
 const drops=new Set(Object.values(data.monsters.monsters).flatMap(m=>m.drops.map(d=>d.item)));
 for(const [id,r]of recipes){
  const ch=createCharacter(data);ch.gold=0;ch.materials={};
  for(const[k,n]of Object.entries(r.cost)){assert(n>0&&Number.isInteger(n));if(k==='gold')ch.gold=n;else{assert(drops.has(k),id+'/'+k);ch.materials[k]=n;}}
  for(const key of Object.keys(r.cost)){
   const poor=structuredClone(ch);if(key==='gold')poor.gold--;else poor.materials[key]--;
   const before=structuredClone(poor);assert.equal(craft(poor,data,id).reason,'materials',id+'/'+key);assert.deepEqual(poor,before);
  }
  const uid=ch.nextUid,result=craft(ch,data,id);assert(result.ok,id);assert.equal(ch.gold,0);assert(Object.values(ch.materials).every(n=>n===0));
  if(r.type==='skill'){assert.equal(ch.skills[r.result],1);assert.equal(ch.nextUid,uid);assert.equal(craft(ch,data,id).reason,'learned');}
  else {assert.deepEqual(ch.mods.at(-1),{uid,id:r.result,level:1,grade:r.grade});assert.equal(ch.nextUid,uid+1);assert.equal(craft(ch,data,id).reason,'materials');}
  const restored=migrateCharacter(JSON.parse(JSON.stringify(ch)),data);assert.deepEqual(restored.skills,ch.skills);assert.deepEqual(restored.mods,ch.mods);assert.equal(restored.nextUid,ch.nextUid);
 }
});
test('early roles do not require Moonroot; all three Moonroot parts have specialist recipes',()=>{
 const moon=['fern_ear_tuft','mirror_scale','rootdigger_claw'];
 for(const id of ['charged_shot','riposte','weakpoint','shield_bash','cleanse','arcane_shot'])assert(!Object.keys(data.recipes.recipes['learn_'+id].cost).some(k=>moon.includes(k)),id);
 for(const material of moon)assert(recipes.some(([,r])=>r.cost[material]));
 assert.equal(skillCraftGuide(data,data.recipes.recipes.learn_cleanse).role,'heal');
 assert.equal(skillCraftGuide(data,data.recipes.recipes.learn_battle_aura).role,'support');
 assert.equal(skillCraftGuide(data,data.recipes.recipes.learn_crystal_wall).role,'control');
 assert.match(skillCraftGuide(data,data.recipes.recipes.learn_charged_shot).condition,/กดค้าง/);
});
test('complete catalogue socket/UI/compiled compatibility agrees and every new mod has an active consumer',()=>{
 for(const [mid,md]of Object.entries(data.mods.mods)){
  let consumers=0;
  for(const[sid,sd]of Object.entries(data.skills.combat)){
   const ch=createCharacter(data);ch.stats={STR:99,DEX:99,INT:99,AGI:99,VIT:99};ch.skills[sid]=1;ch.slots[0]={skill:sid,mods:[]};ch.mods=[{id:mid,uid:100,level:1,grade:'C'}];
   const fit=modFits(sd,md).ok;assert.equal(modStatus(ch,data,0,ch.mods[0]).fit.ok,fit,mid+'/'+sid);
   assert.equal(socketMod(ch,data,0,100).ok,fit,mid+'/'+sid);
   if(fit){const s=computeSkill(ch,data,derive(ch,data),0);assert(s.mods[0].active,mid+'/'+sid);consumers++;}
  }
  if(md.prototype&&mid!=='short_stride')assert(consumers>0,mid);
 }
 const ch=createCharacter(data);ch.movementSkills=Object.keys(data.skills.movement);ch.stats.AGI=99;ch.mods=[{id:'short_stride',uid:100,level:1,grade:'C'}];
 for(const id of ch.movementSkills){ch.movement=id;ch.movementMods=[];assert(socketMovementMod(ch,data,100).ok,id);}
});
test('v9 prototype and v12 main saves retain IDs, loadouts and auto-potion settings through v13 storage',()=>{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 try{for(const version of [9,12,CHARACTER_VERSION]){
  const ch=createCharacter(data);ch.version=version;ch.skills.charged_shot=2;ch.slots[1]={skill:'charged_shot',mods:[800]};ch.mods=[{id:'returning_shot',uid:800,level:2,grade:'B'},{id:'short_stride',uid:801,level:1,grade:'C'}];ch.nextUid=802;ch.movementSkills=['roll'];ch.movement='roll';ch.movementMods=[801];
  ch.autoPotions.hp.enabled=true;ch.autoPotions.hp.threshold=37;
  assert(writeSlot(1,ch));const restored=migrateCharacter(loadSlot(1).character,data);
  for(const key of ['skills','slots','mods','movementMods','movementSkills','movement','nextUid','gear','equipped'])assert.deepEqual(restored[key],ch[key],version+'/'+key);
  if(version>=12)assert.deepEqual(restored.autoPotions,ch.autoPotions);
  assert.equal(restored.version,CHARACTER_VERSION);const again=structuredClone(restored);migrateCharacter(again,data);assert.deepEqual(again,restored);
 }
 const main=createCharacter(data);main.version=12;delete main.movementMods;assert.deepEqual(migrateCharacter(main,data).movementMods,[]);
 }finally{delete globalThis.localStorage;}
});
test('tree revision 3 selective refund and v13 movement migration coexist exactly once',()=>{
 for(const version of [9,12,13])for(const hasSocket of [false,true]){
  const ch=createCharacter(data);ch.version=version;ch.treeRevision=2;ch.jobPoints=7;
  ch.jobNodes=['origin','v1','vj','path.precision','advanced.flow','line.damage.mastery.10','bridge.physical-damage.2','removed-node','bridge.physical-damage.2'];
  ch.skills.charged_shot=2;ch.slots[0]={skill:'charged_shot',mods:[800]};ch.mods=[{uid:800,id:'returning_shot',level:2,grade:'B'},{uid:801,id:'short_stride',level:1,grade:'C'}];ch.nextUid=802;ch.movementSkills=['roll'];ch.movement='roll';
  if(hasSocket)ch.movementMods=[801];else delete ch.movementMods;
  ch.autoPotions.hp={enabled:true,threshold:37,potion:'hp_potion_s'};
  const before=structuredClone(ch),m=migrateCharacter(ch,data);
  assert.equal(m.version,13);assert.equal(m.treeRevision,3);assert.equal(m.jobPoints,9);assert.deepEqual(m.jobNodes,before.jobNodes.slice(0,6));assert.deepEqual(m.movementMods,hasSocket?[801]:[]);
  for(const key of ['skills','slots','mods','nextUid','movementSkills','movement','gear','equipped','gold','materials'])assert.deepEqual(m[key],before[key],version+'/'+key);
  if(version>=12)assert.deepEqual(m.autoPotions,before.autoPotions);
  const once=structuredClone(m);assert.deepEqual(migrateCharacter(JSON.parse(JSON.stringify(m)),data),once);
 }
});
