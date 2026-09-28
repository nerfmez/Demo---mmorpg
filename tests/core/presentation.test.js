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


test('imported models name real gear bases and ship small GLB files',async()=>{
 const {readFileSync}=await import('node:fs');
 const all=Object.entries(data.models).filter(([g])=>!g.startsWith('_')).flatMap(([g,e])=>Object.entries(e).map(([id,m])=>[g,id,m]));
 for(const [group,id,m] of all){
  if(group==='weapons')assert.equal(data.items.gearBases[id]?.slot,'weapon',id+' is a weapon base');
  if(group==='monsters'){
   assert.ok(data.monsters.monsters[id],id+' is a monster');
   for(const [b,seg] of Object.entries(m.segments))assert.ok(seg.length===2&&seg.every((p)=>p.length===3),id+'/'+b+' segment');
  }
  const buf=readFileSync(new URL('../../public/'+m.file,import.meta.url));
  assert.equal(buf.toString('latin1',0,4),'glTF',m.file+' is a binary glTF');
  assert.ok(buf.length<(group==='characters'?600:400)*1024,m.file+' stays small for iPad');
  assert.ok(m.tris<=({characters:8000,monsters:5000}[group]??4000),id+' triangle budget');
 }
});

test('baked gait tables are complete cycles for every driver bone',async()=>{
 const {readFileSync}=await import('node:fs');
 const gait=JSON.parse(readFileSync(new URL('../../data/gait.json',import.meta.url),'utf8'));
 for(const k of ['walk','run']){
  const g=gait[k],n=g.body.length;
  assert.ok(n>=12&&g.cycle>0.5&&g.speed>0.5,k+' cycle');
  for(const b of ['hips','torso','chest','head','legL','kneeL','footL','legR','kneeR','footR','armL','elbowL','handL','armR','elbowR','handR']){
   assert.equal(g.bones[b]?.length,n,k+'/'+b);
   for(const f of g.bones[b])assert.ok(f.length===3&&f.every((v)=>Math.abs(v)<Math.PI),k+'/'+b+' angles');
  }
 }
 assert.ok(gait.run.speed>gait.walk.speed);
});
