import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,gearRequirements,gearEquipState,equip,enforceEquipment,migrateCharacter,respecStats,respecJob,derive,gearStats} from '../../src/core/character.js';
import {craft,upgradeGear,promoteGear,gearGradePreview} from '../../src/core/crafting.js';
import {createRng} from '../../src/core/rng.js';
const slots=['armor','helm','gloves','boots','charm'];
const bases=Object.entries(data.items.gearBases).filter(([,b])=>slots.includes(b.slot));
const item=(ch,base,extra={})=>{const it={uid:ch.nextUid++,base,grade:'C',upgrade:0,options:[],...extra};ch.gear.push(it);return it;};
const fund=ch=>{ch.gold=100000;for(const id in data.items.materials)ch.materials[id]=10000;return ch;};

test('all 41 wearable bases block below level and allow exact/above level without trained stats',()=>{
 assert.equal(bases.length,41);
 for(const [id,b] of bases){
  const ch=createCharacter(data),it=item(ch,id,{itemLevel:b.itemLevel});
  assert.deepEqual(gearRequirements(it,data),{level:b.itemLevel},id);
  ch.level=b.itemLevel-1;for(const stat in ch.stats)ch.stats[stat]=999;
  const before=JSON.stringify(ch);assert.equal(equip(ch,data,it.uid).reason,'level',id);assert.equal(JSON.stringify(ch),before,'blocked equip is atomic');
  for(const level of [b.itemLevel,b.itemLevel+1]){ch.level=level;for(const stat in ch.stats)ch.stats[stat]=0;assert.ok(equip(ch,data,it.uid).ok,id);}
 }
});

test('level gate uses character level only; invalid worn item contributes no power before enforcement',()=>{
 const ch=createCharacter(data);ch.jobLevel=99;ch.level=5;
 const it=item(ch,'sporeweave_vest',{itemLevel:6,options:[{id:'hp_flat',value:999}]});
 ch.equipped.armor=null;const before=derive(ch,data);ch.equipped.armor=it.uid;assert.deepEqual(derive(ch,data),before);
 assert.equal(gearEquipState(ch,data,it).current,5);assert.equal(gearEquipState(ch,data,it).ok,false);
 ch.level=6;assert.ok(derive(ch,data).maxHp>before.maxHp);
});

test('underlevel crafting, upgrading and grading keep costs/rolls and fixed wearable level',()=>{
 const ch=fund(createCharacter(data)),r=data.recipes.recipes.sporeweave_vest,before=structuredClone(ch);
 const made=craft(ch,data,'sporeweave_vest',createRng(17));assert.ok(made.ok);const it=made.item;
 assert.equal(ch.gold,before.gold-r.cost.gold);for(const [k,v]of Object.entries(r.cost))if(k!=='gold')assert.equal(ch.materials[k],before.materials[k]-v);
 assert.equal(equip(ch,data,it.uid).reason,'level');const level=it.itemLevel,options=structuredClone(it.options);
 for(let i=0;i<data.items.upgrade.max;i++)assert.ok(upgradeGear(ch,data,it.uid).ok);
 while(it.grade!=='S'){const p=gearGradePreview(data,it);assert.deepEqual(p.minRequires,{level});assert.deepEqual(p.maxRequires,{level});assert.ok(promoteGear(ch,data,it.uid,createRng(29)).ok);}
 assert.deepEqual(it.options.slice(0,options.length),options);assert.equal(it.itemLevel,level);assert.deepEqual(gearRequirements(it,data),{level});
 ch.level=level;assert.ok(equip(ch,data,it.uid).ok);assert.ok(respecStats(ch,data));assert.ok(respecJob(ch,data));assert.equal(ch.equipped.armor,it.uid);
 const saved=JSON.parse(JSON.stringify(ch));migrateCharacter(saved,data);assert.equal(saved.equipped.armor,it.uid);assert.deepEqual(saved.gear,ch.gear);
});

test('legacy load returns all underlevel wearables to an already large inventory without loss or duplicates',()=>{
 const ch=fund(createCharacter(data));ch.level=1;ch.version=5;
 const affected=[];for(const slot of slots){const [id]=bases.find(([,b])=>b.slot===slot&&b.itemLevel===21);const it=item(ch,id);ch.equipped[slot]=it.uid;affected.push(it.uid);}
 for(let n=0;n<300;n++)item(ch,'tide_boots',{itemLevel:1});
 const ownership=ch.gear.map(i=>({uid:i.uid,base:i.base,grade:i.grade,upgrade:i.upgrade,options:i.options})),next=ch.nextUid;
 migrateCharacter(ch,data);for(const slot of slots)assert.equal(ch.equipped[slot],null);
 assert.deepEqual(ch.gear.map(({itemLevel,...i})=>i),ownership);assert.equal(ch.nextUid,next);assert.match(ch.progress.equipmentNotice,/กระเป๋าครบ/);
 for(const uid of affected)assert.equal(ch.gear.filter(i=>i.uid===uid).length,1);
 const saved=JSON.stringify(ch);migrateCharacter(ch,data);assert.equal(JSON.stringify(ch),saved);const loaded=JSON.parse(saved);migrateCharacter(loaded,data);assert.deepEqual(loaded,ch);
});

test('missing metadata uses existing base fallback; valid custom level remains authoritative and cap migration enforces last',()=>{
 const ch=createCharacter(data),it=item(ch,'sporeweave_vest');assert.deepEqual(gearRequirements(it,data),{level:6});
 it.itemLevel=21;ch.level=20;assert.equal(gearEquipState(ch,data,it).ok,false);ch.level=21;assert.ok(gearEquipState(ch,data,it).ok);
 const original=gearStats(it,data);it.itemLevel=31;assert.deepEqual(gearStats(it,data),original);ch.level=40;ch.statPoints=100;ch.equipped.armor=it.uid;
 migrateCharacter(ch,data);assert.equal(ch.level,30);assert.equal(ch.equipped.armor,null);assert.equal(it.itemLevel,31);assert.ok(ch.gear.includes(it));assert.match(ch.progress.equipmentNotice,/กระเป๋าครบ/);
});

test('all 38 weapons and 5 shields retain stat gates, grade/upgrade scaling and ignore level metadata',()=>{
 const held=Object.entries(data.items.gearBases).filter(([,b])=>['weapon','offhand'].includes(b.slot));assert.equal(held.length,43);
 for(const [id]of held){const ch=createCharacter(data),it=item(ch,id,{itemLevel:999});ch.level=1;const req=gearRequirements(it,data);assert.equal(req.level,undefined,id);
  for(const stat in req)ch.stats[stat]=req[stat];assert.ok(gearEquipState(ch,data,it).ok,id);
  ch.level=99;for(const stat in req)ch.stats[stat]=0;assert.equal(gearEquipState(ch,data,it).ok,false,id);
  assert.deepEqual(gearRequirements({...it,itemLevel:1},data),req);const raised=gearRequirements({...it,grade:'S',upgrade:5},data);for(const stat in req)assert.ok(raised[stat]>=req[stat],id);
 }
});
