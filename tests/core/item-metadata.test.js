import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,migrateCharacter,gearStats,gearRequirements,gearEquipState,derive} from '../../src/core/character.js';
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

test('crafting copies the specific recipe level and mod grade, independent of enhancement/rank',()=>{
  const ch=funded();
  for(const [id,recipe]of Object.entries(data.recipes.recipes)){
    if(!['gear','mod'].includes(recipe.type))continue;
    const result=craft(ch,data,id,createRng(7));assert.ok(result.ok,id);
    if(recipe.type==='gear'){assert.equal(result.item.itemLevel,recipe.itemLevel);assert.equal(result.item.upgrade,0);}
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

test('weapon item level remains metadata and does not change stats or trained-stat gates',()=>{
  const ch=funded();const item=craft(ch,data,'horn_greatblade',createRng(5)).item;
  const low={...item,itemLevel:1},high={...item,itemLevel:999};
  assert.deepEqual(gearStats(low,data),gearStats(high,data));assert.deepEqual(gearRequirements(low,data),gearRequirements(high,data));
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

test('metadata neither changes gear rolls nor consumes extra RNG',()=>{
  const oldData=structuredClone(data);for(const base of Object.values(oldData.items.gearBases))delete base.itemLevel;for(const r of Object.values(oldData.recipes.recipes)){delete r.itemLevel;delete r.grade;}
  const fresh=funded(),old=structuredClone(fresh),a=createRng(531),b=createRng(531);
  const current=craft(fresh,data,'crag_axe',a).item,legacy=craft(old,oldData,'crag_axe',b).item;
  const withoutLevel=({itemLevel,...rest})=>rest;assert.deepEqual(withoutLevel(current),withoutLevel(legacy));assert.equal(a.next(),b.next());
});
