import {createLearnedCharacter as createCharacter} from './helpers.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {migrateCharacter,gearStats,gearRequirements,gearEquipState,derive} from '../../src/core/character.js';
import {craft,upgradeGear,upgradeMod} from '../../src/core/crafting.js';
import {computeSkill,socketMod} from '../../src/core/skills.js';
import {createRng} from '../../src/core/rng.js';
import {normalizeItemMetadata} from '../../src/core/item-metadata.js';

const funded=()=>{const ch=createCharacter(data);ch.level=data.progression.character.maxLevel;ch.gold=100000;for(const id in data.items.materials)ch.materials[id]=10000;for(const stat in ch.stats)ch.stats[stat]=100;return ch;};

test('every gear base/recipe and mod recipe has valid authored metadata',()=>{
  for(const base of Object.values(data.items.gearBases))assert.ok(Number.isSafeInteger(base.itemLevel)&&base.itemLevel>0);
  for(const recipe of Object.values(data.recipes.recipes)){
    if(recipe.type==='gear')assert.ok(Number.isSafeInteger(recipe.itemLevel)&&recipe.itemLevel>0);
    if(recipe.type==='mod')assert.ok(data.items.grades.order.includes(recipe.grade));
  }
  for(const kit of ['sword','bow','staff'])assert.ok(createCharacter(data,{kit}).gear.every(i=>i.itemLevel===1));
});

// gear levels (owner, 2026-10-29, items.gearLevels): a crafted piece takes the crafter's level inside its base's range
test('crafting sets the piece level from the crafter inside the base range, and copies the mod grade, independent of enhancement/rank',()=>{
  const ch=funded();
  for(const [id,recipe]of Object.entries(data.recipes.recipes)){
    if(!['gear','mod'].includes(recipe.type))continue;
    const result=craft(ch,data,id,createRng(7));assert.ok(result.ok,id);
    if(recipe.type==='gear'){assert.equal(result.item.itemLevel,data.items.gearBases[recipe.result].maxItemLevel,'a top-level crafter makes the top of the range');assert.equal(result.item.upgrade,0);}
    else{assert.equal(result.item.grade,recipe.grade);assert.equal(result.item.level,1);}
  }
  // Gear tiers: every recipe makes items at its base's tier (scripts/gear-tiers.mjs).
  for(const r of Object.values(data.recipes.recipes))if(r.type==='gear')assert.equal(r.itemLevel,data.items.gearBases[r.result].itemLevel,r.result);
});

test('missing/invalid metadata gains deterministic defaults while valid values and ownership survive repeat migration',()=>{
  const ch=funded();const gear=craft(ch,data,'hermit_guard',createRng(3)).item;gear.itemLevel=77;gear.upgrade=2;
  const first=craft(ch,data,'mod_echo',createRng(3)).item;first.grade='S';first.level=3;
  const missing=craft(ch,data,'mod_concentrated',createRng(3)).item;delete missing.grade;
  const invalid=craft(ch,data,'mod_split',createRng(3)).item;invalid.grade='X';ch.gear[0].itemLevel=-2;
  const before=structuredClone(ch);migrateCharacter(ch,data);
  assert.equal(gear.itemLevel,77);assert.equal(first.grade,'S');assert.equal(missing.grade,'C');assert.equal(invalid.grade,'C');assert.equal(ch.gear[0].itemLevel,1);
  const expected=structuredClone(before);expected.mods.find(m=>m.uid===missing.uid).grade='C';expected.mods.find(m=>m.uid===invalid.uid).grade='C';expected.gear[0].itemLevel=1;
  assert.deepEqual(ch,expected,'all other save fields remain unchanged');
  const once=JSON.stringify(ch);migrateCharacter(ch,data);assert.equal(JSON.stringify(ch),once);
  const reloaded=JSON.parse(once);migrateCharacter(reloaded,data);assert.deepEqual(reloaded,ch);
});

test('metadata normalization preserves v5 map records, active map, position and all instance identity',()=>{
  const ch=funded();ch.version=5;ch.progress.maps={coast:{waypoints:['town'],zones:['coast'],marker:'retain'},frontier:{waypoints:['ruins']}};
  ch.worldId='frontier-wilds-v1';ch.pos=[88,42];delete ch.gear[0].itemLevel;
  ch.mods=[{uid:900,id:'echo',level:4,grade:'A'},{uid:901,id:'wide_arc',level:1}];ch.slots[0].mods=[901];
  const expected=structuredClone(ch);expected.gear[0].itemLevel=1;expected.mods[1].grade='C';
  normalizeItemMetadata(ch,data);assert.deepEqual(ch,expected);normalizeItemMetadata(ch,data);assert.deepEqual(ch,expected);
});

test('a weapon\'s item level grows its power and stat gate inside the base range, and never past it',()=>{
  const ch=funded();const item=craft(ch,data,'horn_greatblade',createRng(5)).item,b=data.items.gearBases.horn_greatblade;
  const low={...item,itemLevel:b.itemLevel},high={...item,itemLevel:b.maxItemLevel},over={...item,itemLevel:999};
  assert.ok(gearStats(high,data).attack>gearStats(low,data).attack);assert.deepEqual(gearStats(over,data),gearStats(high,data),'capped at the range end');
  assert.ok(gearRequirements(high,data).STR>gearRequirements(low,data).STR,'a stronger piece asks for more');
  ch.level=1;assert.ok(gearEquipState(ch,data,high).ok,'raw stats meet requirements at character level 1');
  ch.level=40;ch.stats.STR=0;assert.equal(gearEquipState(ch,data,low).ok,false,'high character level does not replace stat requirements');
});

test('mod grade has no effect on compilation, compatibility or upgrade costs and never follows mod rank',()=>{
  const ch=funded(),mod=craft(ch,data,'mod_split',createRng(4)).item;const slot=ch.slots.findIndex(s=>s.skill==='firebolt');
  assert.ok(socketMod(ch,data,slot,mod.uid).ok);const compiled=computeSkill(ch,data,derive(ch,data),slot);
  for(const grade of data.items.grades.order){mod.grade=grade;assert.deepEqual(computeSkill(ch,data,derive(ch,data),slot),compiled);}
  const before={grade:mod.grade,uid:mod.uid};assert.ok(upgradeMod(ch,data,mod.uid).ok);assert.equal(mod.level,2);assert.equal(mod.grade,before.grade);assert.equal(mod.uid,before.uid);
  const gear=ch.gear[0],level=gear.itemLevel;assert.ok(upgradeGear(ch,data,gear.uid).ok);assert.equal(gear.itemLevel,level);assert.equal(gear.upgrade,1);
});

// item level sizes option values since the owner's 2026-10-25 change (crafting.js optionRange): the grade,
// the options rolled and the RNG used stay the same, only the values follow the level
test('metadata keeps the grade and options rolled and consumes no extra RNG',()=>{
  const oldData=structuredClone(data);for(const base of Object.values(oldData.items.gearBases))delete base.itemLevel;for(const r of Object.values(oldData.recipes.recipes)){delete r.itemLevel;delete r.grade;}
  const fresh=funded(),old=structuredClone(fresh),a=createRng(531),b=createRng(531);
  const current=craft(fresh,data,'crag_axe',a).item,legacy=craft(old,oldData,'crag_axe',b).item;
  const shape=({itemLevel,options,...rest})=>({...rest,options:options.map(o=>o.id)});assert.deepEqual(shape(current),shape(legacy));assert.equal(a.next(),b.next());
});
