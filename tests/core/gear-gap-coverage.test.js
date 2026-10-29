import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,equip,gearRequirements,gearPower} from '../../src/core/character.js';
import {craft,gearDropCandidates} from '../../src/core/crafting.js';
import {createRng} from '../../src/core/rng.js';
const plan={sporeweave_vest:[6,'armor','INT'],sporeweave_gloves:[6,'gloves','INT'],moonleaf_slippers:[11,'boots','INT'],wardenstalker_coat:[21,'armor','AGI'],wardenstalker_hood:[21,'helm','AGI'],wardenstalker_gloves:[21,'gloves','AGI']};
test('targeted garment recipes craft real graded items and spend exactly their costs',()=>{
 for(const [id,[level,slot,stat]] of Object.entries(plan)){
  const base=data.items.gearBases[id],recipe=data.recipes.recipes[id];
  assert.equal(base.slot,slot);assert.equal(base.itemLevel,level);assert.equal(base.requirementStat,stat);assert.equal(base.starter,false);
  const ch=createCharacter(data);ch.gold=recipe.cost.gold;ch.materials=Object.fromEntries(Object.entries(recipe.cost).filter(([k])=>k!=='gold'));
  const result=craft(ch,data,id,createRng(12));assert.equal(result.ok,true,id);assert.equal(result.item.base,id);assert.equal(result.item.itemLevel,level);assert.equal(result.item.options.length,data.items.grades.optionCount[result.item.grade]);
  assert.equal(ch.gold,0);for(const k of Object.keys(ch.materials))assert.equal(ch.materials[k],0,k);
  assert.ok(result.item.options.every(o=>recipe.optionPool.includes(o.id)));
 }
});
test('new garments require their authored character level and their stats (owner, 2026-10-29: armour asks for stats like a weapon)',()=>{
 for(const [id,[level]] of Object.entries(plan)){
  const ch=createCharacter(data),item={uid:ch.nextUid++,base:id,itemLevel:level,grade:'C',upgrade:0,options:[]};ch.gear.push(item);
  const req=gearRequirements(item,data),b=data.items.gearBases[id];
  assert.deepEqual(Object.keys(req),['level',b.requirementStat,...(b.secondaryStat?[b.secondaryStat]:[])]);assert.equal(req.level,level);
  ch.level=level-1;for(const stat in ch.stats)ch.stats[stat]=999;
  assert.equal(equip(ch,data,item.uid).reason,'level');
  ch.level=level;assert.equal(equip(ch,data,item.uid).ok,true);
  for(const stat in ch.stats)ch.stats[stat]=0;assert.equal(equip(ch,data,item.uid).reason,'requires','the stats gate it too');
  assert.equal(gearRequirements({...item,upgrade:5,grade:'S'},data).level,level);
 }
});
test('additions follow their class against the slot budget (owner, 2026-10-29: plate toughest, leather quick, cloth spell shield and MP)',()=>{
 const share={armor:.45,helm:.2,gloves:.1,boots:.15},g=data.progression.balance.gear;
 for(const id of Object.keys(plan)){
  const b=data.items.gearBases[id],il=b.itemLevel;
  const W=data.items.requirements.weights,target=((g.defense[0]+g.defense[1]*(il-1))*W.defense+(g.maxHp[0]+g.maxHp[1]*(il-1))*W.maxHp)*share[b.slot];
  const ratio=gearPower(b.stats,data)/target;assert.ok(ratio>0.8&&ratio<1.6,id+' '+ratio.toFixed(2));
 }
 assert.equal(data.items.gearBases.moonleaf_slippers.stats.mpRegenPct,undefined);
 assert.ok(data.items.gearBases.wisp_slippers.stats.mpRegenPct>0);
 assert.ok(data.items.gearBases.wardenstalker_coat.stats.defense<data.items.gearBases.crag_plate.stats.defense);
 assert.ok(data.items.gearBases.wardenstalker_gloves.stats.maxHp<data.items.gearBases.crag_gauntlets.stats.maxHp);
 assert.ok(data.items.gearBases.sporeweave_vest.stats.maxShield>0&&!data.items.gearBases.sporeweave_vest.stats.maxHp,'cloth carries a spell shield, not HP');
});
test('new garments enter existing material-based gear drop candidates without new loot rules',()=>{
 for(const [id,[level]] of Object.entries(plan))assert.ok(Object.keys(data.monsters.monsters).some(monster=>gearDropCandidates(data,monster,level).includes(id)),id+' can drop through its recipe parts');
});
