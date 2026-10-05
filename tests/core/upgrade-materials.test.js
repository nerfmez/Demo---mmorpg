import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,migrateCharacter,CHARACTER_VERSION} from '../../src/core/character.js';
import {upgradeGear,upgradeSkill,upgradeMod,gearUpgradeCost,skillUpgradeCost,modUpgradeCost,salvageReturn,salvageGear,salvageMany,rollDrops,addItem,craft} from '../../src/core/crafting.js';
import {writeSlot,loadSlot} from '../../src/save.js';
import {createRng} from '../../src/core/rng.js';
const funded=()=>{const ch=createCharacter(data);ch.gold=10000;ch.level=30;for(const k in ch.stats)ch.stats[k]=100;return ch;};
const mod=(ch)=>{const m={uid:ch.nextUid++,id:'split',level:1,grade:'B'};ch.mods.push(m);return m;};
test('equipment, skills and mods spend only their dedicated material and gold at every step',()=>{
 const ch=funded(),g=ch.gear[0],m=mod(ch);ch.materials={enhancement_stone:16,skill_crystal:15,boar_hide:9,boar_tusk:7,glow_dust:6,ruin_shard:5,ancient_core:2};
 const parts={...ch.materials};const grade=g.grade,options=structuredClone(g.options),gold=ch.gold;
 for(const n of [1,2,3,4,6]){assert.equal(gearUpgradeCost(data,g).enhancement_stone,n);assert.ok(upgradeGear(ch,data,g.uid).ok);}
 for(const n of [1,2,3,4]){assert.equal(skillUpgradeCost(data,'slash',ch.skills.slash).skill_crystal,n);assert.ok(upgradeSkill(ch,data,'slash').ok);}
 for(const n of [2,3]){assert.equal(modUpgradeCost(data,m).skill_crystal,n);assert.ok(upgradeMod(ch,data,m.uid).ok);}
 assert.equal(ch.materials.enhancement_stone,0);assert.equal(ch.materials.skill_crystal,0);assert.equal(g.grade,grade);assert.deepEqual(g.options,options);assert.equal(m.grade,'B');
 for(const k of Object.keys(parts).filter(k=>!['enhancement_stone','skill_crystal'].includes(k)))assert.equal(ch.materials[k],parts[k],k);
 assert.equal(ch.gold,gold-870-625-120);
 const before=JSON.stringify(ch);for(const r of [upgradeGear(ch,data,g.uid),upgradeSkill(ch,data,'slash'),upgradeMod(ch,data,m.uid)])assert.equal(r.reason,'max');assert.equal(JSON.stringify(ch),before);
});
test('missing keys, wrong material, too few crystals and insufficient gold reject atomically',()=>{
 for(const kind of ['gear','skill','mod'])for(const failure of ['absent','wrong','short','gold']){
  const ch=funded(),g=ch.gear[0],m=mod(ch);g.upgrade=1;ch.skills.slash=2;
  const key=kind==='gear'?'enhancement_stone':'skill_crystal';
  ch.materials={boar_hide:999,boar_tusk:999,glow_dust:999,ruin_shard:999};
  if(failure==='wrong')ch.materials[key==='skill_crystal'?'enhancement_stone':'skill_crystal']=999;
  if(failure==='short')ch.materials[key]=1;
  if(failure==='gold'){ch.materials[key]=100;ch.gold=0;}
  const before=JSON.stringify(ch),result=kind==='gear'?upgradeGear(ch,data,g.uid):kind==='skill'?upgradeSkill(ch,data,'slash'):upgradeMod(ch,data,m.uid);
  assert.equal(result.reason,'materials',kind+'/'+failure);assert.equal(JSON.stringify(ch),before);
 }
});
test('new material costs do not bypass the existing skill/mod level and stat gates',()=>{
 const ch=funded(),m=mod(ch);ch.materials={skill_crystal:100};
 for(const kind of ['skill','mod'])for(const failure of ['level','requires']){
  ch.level=failure==='level'?1:30;for(const k in ch.stats)ch.stats[k]=failure==='requires'?0:100;
  const before=JSON.stringify(ch),r=kind==='skill'?upgradeSkill(ch,data,'slash'):upgradeMod(ch,data,m.uid);
  assert.equal(r.reason,failure);assert.equal(JSON.stringify(ch),before);
 }
});
test('old sparse saves preserve parts, gold, existing +N, grades, skill/mod ranks and new drops on round trip',()=>{
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const serializeCharacter=ch=>{assert.ok(writeSlot(1,ch));return loadSlot(1).character;};
 const ch=funded(),m=mod(ch);ch.materials={boar_tusk:47,glow_dust:29,ruin_shard:11};ch.gear[0].upgrade=3;ch.skills.slash=4;m.level=2;
 const old=serializeCharacter(ch),saved=structuredClone(old),loaded=migrateCharacter(structuredClone(old),data);
 assert.equal(loaded.version,CHARACTER_VERSION);assert.deepEqual(loaded.materials,saved.materials);assert.deepEqual(loaded.gear,saved.gear);assert.deepEqual(loaded.mods,saved.mods);assert.deepEqual(loaded.skills,saved.skills);assert.equal(loaded.gold,saved.gold);
 addItem(loaded,'enhancement_stone',4);addItem(loaded,'skill_crystal',4);const copy=migrateCharacter(serializeCharacter(loaded),data);
 assert.equal(copy.materials.enhancement_stone,4);assert.equal(copy.materials.skill_crystal,4);assert.ok(upgradeGear(copy,data,copy.gear[0].uid).ok);assert.ok(upgradeSkill(copy,data,'slash').ok);assert.deepEqual(Object.fromEntries(Object.keys(saved.materials).map(k=>[k,copy.materials[k]])),saved.materials);
});
test('salvage retains recipe parts and gives modest upgrade materials, protects worn/locked gear and excludes starter bonus',()=>{
 const ch=funded();const starter=ch.gear[0];assert.equal(salvageReturn(data,starter).skill_crystal,undefined);assert.equal(salvageReturn(data,starter).enhancement_stone,undefined);
 const gear={uid:ch.nextUid++,base:'tusk_blade',grade:'C',upgrade:0,options:[]};ch.gear.push(gear);
 const plain=salvageReturn(data,gear);assert.equal(plain.enhancement_stone,1);assert.equal(plain.skill_crystal,1);assert.ok(plain.boar_tusk>0);
 gear.upgrade=5;const upgraded=salvageReturn(data,gear);assert.equal(upgraded.enhancement_stone,8);assert.equal(upgraded.skill_crystal,1);assert.equal(upgraded.boar_tusk,plain.boar_tusk);
 gear.locked=true;let before=JSON.stringify(ch);assert.equal(salvageGear(ch,data,gear.uid).reason,'locked');assert.equal(salvageGear(ch,data,starter.uid).reason,'equipped');assert.equal(JSON.stringify(ch),before);
 gear.locked=false;assert.ok(salvageGear(ch,data,gear.uid).ok);assert.equal(ch.materials.enhancement_stone,8);assert.equal(ch.materials.skill_crystal,1);assert.ok(!ch.gear.includes(gear));
 const a={...gear,uid:ch.nextUid++,upgrade:0},b={...a,uid:ch.nextUid++,locked:true};ch.gear.push(a,b);assert.equal(salvageMany(ch,data,['C']).count,1);assert.ok(ch.gear.includes(b));
});
test('shared drops append without replacing monster/zone loot and obey material-find',()=>{
 for(const [id,m] of Object.entries(data.monsters.monsters)){
  const probabilities=[],r={chance:p=>{probabilities.push(p);return true;},int:(a)=>a};const drops=rollDrops(data,id,'highlands',r,{materialFindPct:50,goldFindPct:20});
  assert.deepEqual(drops.map(d=>d.item),[...m.drops,...data.world.zoneDrops.highlands,...data.items.upgradeMaterialDrops].map(d=>d.item));
  assert.ok(Math.abs(probabilities.at(-2)-.3)<1e-9);assert.ok(Math.abs(probabilities.at(-1)-.225)<1e-9);assert.equal(drops.at(-2).qty,1);assert.equal(drops.at(-1).qty,1);
 }
 const tally={enhancement_stone:0,skill_crystal:0},rng=createRng(912);for(let i=0;i<10000;i++)for(const d of rollDrops(data,'tusk_boar','meadow',rng))if(d.item in tally)tally[d.item]+=d.qty;
 assert.ok(tally.enhancement_stone>1850&&tally.enhancement_stone<2150);assert.ok(tally.skill_crystal>1350&&tally.skill_crystal<1650);
});
test('base crafting still uses monster parts and never requires the two upgrade materials',()=>{
 for(const recipe of Object.values(data.recipes.recipes)){assert.equal(recipe.cost.enhancement_stone,undefined);assert.equal(recipe.cost.skill_crystal,undefined);}
 const ch=funded();ch.materials={...data.recipes.recipes.tusk_blade.cost};delete ch.materials.gold;assert.ok(craft(ch,data,'tusk_blade',createRng(1)).ok);
 for(const d of data.items.upgradeMaterialDrops){assert.ok(data.items.materials[d.item]);assert.ok(d.chance>0&&d.chance<=1);assert.equal(d.min,1);assert.equal(d.max,1);}
});
test('every starter base has no free stone/crystal salvage, and every +N refund is strictly less than its paid stone cost',()=>{
 for(const [base,def] of Object.entries(data.items.gearBases).filter(([,d])=>d.starter)){
  assert.ok(!Object.values(data.recipes.recipes).some(r=>r.type==='gear'&&r.result===base),'starter gear has no repeatable free crafting recipe');
  let paid=0;
  for(let upgrade=0;upgrade<=data.items.upgrade.max;upgrade++){
   if(upgrade)paid+=data.items.upgrade.cost[upgrade-1].enhancement_stone;
   const back=salvageReturn(data,{base,grade:'C',upgrade,options:[]});
   assert.equal(back.skill_crystal,undefined,base+' cannot create crystals');
   assert.ok(upgrade?(back.enhancement_stone||0)<paid:!back.enhancement_stone,base+'/'+upgrade+' cannot refund more than paid');
   assert.equal(back.gold,undefined);
  }
 }
 for(const [id,r] of Object.entries(data.recipes.recipes).filter(([,r])=>r.type==='gear'))for(const grade of data.items.grades.order){
  const back=salvageReturn(data,{base:r.result,grade,upgrade:0,options:[]});
  assert.ok(r.cost.gold>0,id+' consumes gold');assert.equal(back.gold,undefined,id+' cannot recover crafting gold');
  assert.ok(Object.entries(r.cost).some(([k,n])=>k!=='gold'&&(back[k]||0)<n),id+' always consumes at least one base part');
 }
});
test('migrated legacy +N salvage adds the documented current-value refund without converting old inventory or repeating',()=>{
 const ch=funded();ch.materials={boar_tusk:47,boar_hide:23,ruin_shard:11,ancient_core:2};
 const item={uid:ch.nextUid++,base:'tusk_blade',grade:'A',upgrade:5,itemLevel:1,options:[]};ch.gear.push(item);
 const loaded=migrateCharacter(JSON.parse(JSON.stringify(ch)),data),oldParts={...loaded.materials},gold=loaded.gold;
 const back=salvageReturn(data,loaded.gear.find(i=>i.uid===item.uid));
 assert.equal(back.enhancement_stone,8,'one base stone plus seven from current +1..+5 refund');assert.equal(back.skill_crystal,1);
 const result=salvageGear(loaded,data,item.uid);assert.ok(result.ok);assert.equal(loaded.gold,gold);
 for(const [id,count] of Object.entries(oldParts))assert.equal(loaded.materials[id],count+(back[id]||0));
 assert.equal(loaded.materials.enhancement_stone,8);assert.equal(loaded.materials.skill_crystal,1);
 const once=JSON.stringify(loaded);assert.equal(salvageGear(loaded,data,item.uid).reason,'unknown');assert.equal(JSON.stringify(loaded),once);
});
