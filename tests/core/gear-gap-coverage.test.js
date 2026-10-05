import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,equip,gearRequirements,gearPower} from '../../src/core/character.js';
import {craft,gearDropCandidates} from '../../src/core/crafting.js';
import {createRng} from '../../src/core/rng.js';
const plan={sporeweave_vest:[6,'armor','INT'],sporeweave_gloves:[6,'gloves','INT'],moonleaf_slippers:[11,'boots','INT'],wardenstalker_coat:[21,'armor','VIT'],wardenstalker_hood:[21,'helm','AGI'],wardenstalker_gloves:[21,'gloves','DEX']};
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
test('new garments use actual trained-stat requirements with no character-level wear gate',()=>{
 for(const [id,[level,,stat]] of Object.entries(plan)){
  const ch=createCharacter(data),item={uid:ch.nextUid++,base:id,itemLevel:level,grade:'C',upgrade:0,options:[]};ch.gear.push(item);ch.level=1;
  const req=gearRequirements(item,data);assert.deepEqual(Object.keys(req),[stat]);
  ch.stats[stat]=req[stat]-1;assert.equal(equip(ch,data,item.uid).ok,false,id+' blocks insufficient stat');
  ch.stats[stat]=req[stat];assert.equal(equip(ch,data,item.uid).ok,true,id+' permits sufficient stat below item level');
  const raised=gearRequirements({...item,upgrade:5},data);assert.ok(raised[stat]>=req[stat],id+' enhancement never lowers wear requirement (small gains may fit the existing allowance)');
 }
});
test('additions remain inside existing slot budgets and retain deliberate tradeoffs',()=>{
 const share={armor:.45,helm:.2,gloves:.1,boots:.15},g=data.progression.balance.gear;
 for(const id of Object.keys(plan)){
  const b=data.items.gearBases[id],il=b.itemLevel;
  const target=(g.defense[0]+g.defense[1]*(il-1)+(g.maxHp[0]+g.maxHp[1]*(il-1))*data.items.requirements.weights.maxHp)*share[b.slot];
  assert.ok(Math.abs(gearPower(b.stats,data)-target)<.15,id+' follows existing formula after rounding');
 }
 assert.equal(data.items.gearBases.moonleaf_slippers.stats.mpRegenPct,undefined);
 assert.ok(data.items.gearBases.wisp_slippers.stats.mpRegenPct>0);
 assert.ok(data.items.gearBases.wardenstalker_coat.stats.defense<data.items.gearBases.crag_plate.stats.defense);
 assert.ok(data.items.gearBases.wardenstalker_hood.stats.maxHp<data.items.gearBases.ranger_hood.stats.maxHp);
 assert.equal(data.items.gearBases.wardenstalker_gloves.stats.maxHp,undefined);
 assert.ok(data.items.gearBases.crag_gauntlets.stats.maxHp>0);
});
test('new garments enter existing material-based gear drop candidates without new loot rules',()=>{
 for(const [id,[level]] of Object.entries(plan))assert.ok(Object.keys(data.monsters.monsters).some(monster=>gearDropCandidates(data,monster,level).includes(id)),id+' can drop through its recipe parts');
});
