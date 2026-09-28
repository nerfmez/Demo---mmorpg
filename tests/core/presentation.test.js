// Presentation contracts that prevent missing/reused art when content is added.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {ART,art,hasArt} from '../../src/ui/art.js';
import {createCharacter,gearLook} from '../../src/core/character.js';

test('every named content entry has distinct authored artwork within its category',()=>{
 const catalogs={
  gear:Object.keys(data.items.gearBases),material:Object.keys(data.items.materials),
  skill:[...Object.keys(data.skills.combat),...Object.keys(data.skills.movement)],
  mod:Object.keys(data.mods.mods),monster:Object.keys(data.monsters.monsters),
  zone:data.world.zones.map(z=>z.id),job:Object.keys(data.jobtree.nodes)
 };
 for(const [kind,ids] of Object.entries(catalogs)){
  assert.deepEqual(Object.keys(ART[kind]).sort(),[...ids].sort(),kind+' artwork coverage');
  const seen=new Map();
  for(const id of ids){
   assert.ok(hasArt(kind,id),kind+'/'+id);
   assert.ok(!seen.has(ART[kind][id]),kind+'/'+id+' duplicates '+seen.get(ART[kind][id]));
   seen.set(ART[kind][id],id);
   assert.match(art(kind,id),/viewBox="0 0 128 128"/);
  }
 }
 assert.throws(()=>art('gear','missing'),/Missing authored artwork/);
});

test('gear presentation preserves base identity independently of grade and enhancement',()=>{
 const ch=createCharacter(data),before=gearLook(ch,data);
 for(const item of ch.gear){item.grade='S';item.upgrade=5;}
 assert.deepEqual(gearLook(ch,data),before,'grade/enhancement do not replace identity');
 const sword=ch.gear.find(i=>i.uid===ch.equipped.weapon);sword.base='tusk_blade';
 assert.equal(gearLook(ch,data).weapon,before.weapon,'same weapon family');
 assert.equal(gearLook(ch,data).bases.weapon,'tusk_blade','different base chooses different model');
 assert.equal(ch.version,2);
});

