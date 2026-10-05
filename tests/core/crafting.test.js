import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter } from '../../src/core/character.js';
import { craft, rollDrops, upgradeGear, upgradeSkill, sellMaterial, craftBatch, promoteGear, gearUpgradeCost, skillUpgradeCost, gearGradeState } from '../../src/core/crafting.js';
import { createRng } from '../../src/core/rng.js';

test('crafting gear rolls a grade with the right number of options from the recipe pool', () => {
  const rng = createRng(42);
  const grades = new Set();
  for (let i = 0; i < 200; i++) {
    const ch = createCharacter(data);
    ch.gold = 999;
    ch.materials = { boar_tusk: 10, boar_hide: 10 };
    const r = craft(ch, data, 'tusk_blade', rng);
    assert.ok(r.ok);
    grades.add(r.item.grade);
    assert.equal(r.item.options.length, data.items.grades.optionCount[r.item.grade]);
    for (const o of r.item.options) assert.ok(data.recipes.recipes.tusk_blade.optionPool.includes(o.id));
    assert.equal(ch.materials.boar_tusk, 10 - data.recipes.recipes.tusk_blade.cost.boar_tusk);
  }
  assert.ok(grades.size >= 3, 'grades vary');
});

test('crafting fails without materials and takes nothing', () => {
  const ch = createCharacter(data);
  ch.materials = { boar_tusk: 1 };
  const r = craft(ch, data, 'tusk_blade', createRng(1));
  assert.equal(r.ok, false);
  assert.equal(ch.materials.boar_tusk, 1);
});

test('upgrade (+N) is separate from grade and consumes enhancement stones', () => {
  const ch = createCharacter(data);
  ch.gold = 999;
  ch.materials = { enhancement_stone: 1 };
  const item = ch.gear[0];
  const grade = item.grade;
  assert.ok(upgradeGear(ch, data, item.uid).ok);
  assert.equal(item.upgrade, 1);
  assert.equal(item.grade, grade);
});

test('skills level up with skill crystals', () => {
  const ch = createCharacter(data);
  ch.gold = 999;
  ch.level = 5; ch.stats.STR = 5;
  ch.materials = { skill_crystal: 1 };
  assert.ok(upgradeSkill(ch, data, 'slash').ok);
  assert.equal(ch.skills.slash, 2);
  assert.equal(ch.materials.skill_crystal, 0);
});

test("drops retain the monster's own parts plus gold and shared upgrade materials", () => {
  const rng = createRng(3);
  const seen = new Set();
  for (let i = 0; i < 100; i++) for (const d of rollDrops(data, 'tusk_boar', 'meadow', rng)) seen.add(d.item);
  assert.deepEqual([...seen].sort(), ['boar_hide', 'boar_tusk', 'enhancement_stone', 'gold', 'skill_crystal']);
  const ch = createCharacter(data);
  ch.materials.boar_hide = 2;
  assert.equal(sellMaterial(ch, data, 'boar_hide', 5), 2 * data.items.materials.boar_hide.value);
});


function funded(){const ch=createCharacter(data);ch.level=40;ch.gold=100000;for(const id in data.items.materials)ch.materials[id]=10000;return ch;}
test('every recipe can provide the exact number of unique affixes for every grade',()=>{
 for(const recipe of Object.values(data.recipes.recipes).filter(r=>r.type==='gear'))for(const grade of data.items.grades.order){
  const ch=funded();const rng={weighted:()=>grade,next:()=>.2,int:(a)=>a};
  const id=Object.keys(data.recipes.recipes).find(id=>data.recipes.recipes[id]===recipe),result=craft(ch,data,id,rng);
  assert.equal(result.item.options.length,data.items.grades.optionCount[grade],id+'/'+grade);
  assert.equal(new Set(result.item.options.map(o=>o.id)).size,result.item.options.length);
 }
});
test('batch crafting keeps every UID, accounts for actual spend and stops immediately at target',()=>{
 const ch=funded(),before=ch.gold;let rolls=0;
 const rng={weighted:()=>++rolls<3?'B':'A',next:()=>.2,int:a=>a};
 const r=craftBatch(ch,data,'tusk_blade',rng,{attempts:10,grade:'A'});
 assert.ok(r.matched);assert.equal(r.attempts,3);assert.equal(r.items.length,3);
 assert.equal(ch.gold,before-r.spent.gold);assert.equal(r.spent.gold,3*data.recipes.recipes.tusk_blade.cost.gold);
 assert.equal(new Set(ch.gear.map(i=>i.uid)).size,ch.gear.length);
});
test('batch crafting respects material exhaustion, bounds and requested affix roll quality',()=>{
 const ch=funded(),recipe=data.recipes.recipes.tusk_blade;ch.materials.boar_tusk=recipe.cost.boar_tusk*2;
 const r=craftBatch(ch,data,'tusk_blade',createRng(2),{attempts:10,grade:'S'});assert.equal(r.attempts,2);assert.equal(r.reason,'materials');assert.equal(ch.materials.boar_tusk,0);
 const before=JSON.stringify(ch);for(const args of [{attempts:11},{attempts:-1},{attempts:NaN},{grade:'X'},{option:'fake'},{quality:1.1}])assert.equal(craftBatch(ch,data,'tusk_blade',createRng(3),args).reason,'invalid');assert.equal(JSON.stringify(ch),before);
 const option=recipe.optionPool[0],def=data.items.gearOptions[option],rich=funded();let n=0;
 const rng={weighted:()=>{n++;return 'B';},next:()=>0,int:()=>n===1?def.min:def.max};
 const quality=craftBatch(rich,data,'tusk_blade',rng,{attempts:5,option,quality:.8});assert.equal(quality.attempts,2);assert.ok(quality.matched);
});
test('promotion adds an affix without rerolling good options, changing +N or replacing the item',()=>{
 const ch=funded(),item=ch.gear[0],uid=item.uid;item.upgrade=3;
 assert.ok(promoteGear(ch,data,uid,createRng(4)).ok);const first=structuredClone(item.options[0]);
 assert.ok(promoteGear(ch,data,uid,createRng(5)).ok);assert.deepEqual(item.options[0],first);assert.equal(item.options.length,4);assert.equal(item.upgrade,3);assert.equal(item.uid,uid);
 assert.ok(promoteGear(ch,data,uid,createRng(6)).ok);assert.equal(item.options.length,5);assert.equal(gearGradeState(ch,data,item).reason,'max');
});
test('upgrades never require character level; the skill stat gate stays atomic',()=>{
 const ch=funded();ch.level=1;const item=ch.gear[0];item.upgrade=1;
 assert.ok(upgradeGear(ch,data,item.uid).ok);assert.ok(promoteGear(ch,data,item.uid,createRng(1)).ok);
 let before=JSON.stringify(ch);assert.equal(upgradeSkill(ch,data,'slash').reason,'requires','Lv1 is not refused for its level, only for the stat');assert.equal(JSON.stringify(ch),before);
 ch.stats.STR=5;const cost=skillUpgradeCost(data,'slash',1);assert.ok(upgradeSkill(ch,data,'slash').ok);assert.equal(ch.skills.slash,2);assert.equal(cost.skill_crystal,1);
 assert.equal(gearUpgradeCost(data,item).enhancement_stone,3);
});

test('Lv1 can enhance and promote to the maximum, but wearing follows the resulting stats',async()=>{
 const {equip,gearRequirements,gearEquipState,derive}=await import('../../src/core/character.js');
 const ch=funded();ch.level=1;const item=ch.gear[0],owned=structuredClone(item.options),uid=item.uid;
 for(let n=0;n<data.items.upgrade.max;n++)assert.ok(upgradeGear(ch,data,uid).ok);
 for(let n=0;n<3;n++)assert.ok(promoteGear(ch,data,uid,createRng(n+50)).ok);
 assert.equal(item.upgrade,5);assert.equal(item.grade,'S');assert.equal(item.options.length,5);
 assert.deepEqual(item.options.slice(0,owned.length),owned);assert.equal(item.uid,uid);
 assert.equal(ch.equipped.weapon,null,'insufficient stats keep the upgraded weapon safely in the bag');
 assert.equal(equip(ch,data,uid).reason,'requires');assert.equal(derive(ch,data).weaponType,'none');
 const requires=gearRequirements(item,data);for(const [stat,n] of Object.entries(requires))ch.stats[stat]=n;
 assert.ok(gearEquipState(ch,data,item).ok);assert.ok(equip(ch,data,uid).ok);assert.equal(ch.equipped.weapon,uid);
 const valid=derive(ch,data);for(const stat in requires)ch.stats[stat]=requires[stat]-1;
 assert.equal(derive(ch,data).weaponType,'none');assert.ok(derive(ch,data).attack<valid.attack,'invalid equipment cannot keep giving its power');
});
test('wear requirements increase with actual affix power and enhancement, not character level',async()=>{
 const {gearRequirements}=await import('../../src/core/character.js');
 const low={base:'tusk_blade',grade:'C',upgrade:0,options:[{id:'attack_flat',value:1},{id:'crit_pct',value:1}]};
 const high={...low,options:[{id:'attack_flat',value:3},{id:'crit_pct',value:4}]};
 assert.ok(gearRequirements(high,data).STR>gearRequirements(low,data).STR);
 assert.ok(gearRequirements({...high,upgrade:5},data).STR>gearRequirements(high,data).STR);
 assert.ok(gearRequirements({...high,grade:'S'},data).STR>=gearRequirements(high,data).STR);
});
test('grade preview bounds every possible new affix without consuming RNG or resources',async()=>{
 const {gearGradePreview}=await import('../../src/core/crafting.js');const {gearRequirements}=await import('../../src/core/character.js');
 const ch=funded(),item=ch.gear[0],before=JSON.stringify(ch),preview=gearGradePreview(data,item);
 assert.equal(JSON.stringify(ch),before);
 for(let seed=0;seed<50;seed++){
  const copy=structuredClone(ch),result=promoteGear(copy,data,item.uid,createRng(seed)),req=gearRequirements(result.item,data);
  for(const stat in req)assert.ok(req[stat]>=preview.minRequires[stat]&&req[stat]<=preview.maxRequires[stat]);
 }
});
