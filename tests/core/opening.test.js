import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, completeOpening, wakeOpening, migrateCharacter, CHARACTER_VERSION } from '../../src/core/character.js';
import { craft } from '../../src/core/crafting.js';
import { createRng } from '../../src/core/rng.js';
const kits = data.progression.start.opening.weapons;
test('all creation paths and reloads grant only the selected weapon normal attack', () => {
  for(const kit of kits)for(const opening of [true,false]) {
    const ch=createCharacter(data,{opening,kit});
    if(opening){assert.deepEqual(ch.skills,{});assert.equal(ch.equipped.weapon,null);wakeOpening(ch);assert.ok(completeOpening(ch,data,{kit,skill:'firebolt',movement:'dash'}).ok);}
    const basic=data.progression.start.kits[kit].basic;
    assert.deepEqual(ch.skills,{[basic]:1});assert.deepEqual(ch.slots.map(s=>s.skill),[basic,null,null,null]);
    assert.deepEqual(ch.movementSkills,[]);assert.equal(ch.movement,null);
    for(let i=0;i<2;i++) {
      const g=new Game(data,{character:JSON.parse(JSON.stringify(ch)),seed:4});
      g.refresh();for(let j=0;j<180;j++)g.update(1/60);
      assert.deepEqual(g.ch.skills,ch.skills);assert.equal(g.useMovement(),false);assert.equal(g.player.movement.charges,0);
      assert.equal(g.ch.skills.firebolt,undefined);assert.equal(g.ch.skills.ward,undefined);
    }
    assert.equal(completeOpening(ch,data,{kit:'bow'}).reason,'done');
  }
});
test('invalid weapon has no side effects; wake cannot restart a completed opening',()=>{
 const ch=createCharacter(data,{opening:true}),before=structuredClone(ch);
 assert.equal(completeOpening(ch,data,{kit:'axe'}).reason,'kit');assert.deepEqual(ch,before);
 assert.ok(wakeOpening(ch).ok);assert.equal(wakeOpening(ch).ok,false);
 completeOpening(ch,data,{kit:'sword'});assert.equal(wakeOpening(ch).ok,false);
});
test('legacy learned ranks, slots, movement, inventory and gold survive v11',()=>{
 for(const version of [7,8,9,10]) {
  const ch=createCharacter(data,{kit:'staff'});ch.version=version;delete ch.opening;
  ch.skills={arcane_bolt:2,firebolt:3,ward:4,frost_nova:2};ch.slots=[{skill:'ward',mods:[]},{skill:'firebolt',mods:[]},{skill:null,mods:[]},{skill:'frost_nova',mods:[]}];
  ch.movementSkills=['dash','roll'];ch.movement='roll';ch.movementMods=[501];ch.gold=777;ch.materials={glow_dust:8};
  const m=migrateCharacter(structuredClone(ch),data);
  for(const key of ['skills','slots','movementSkills','movement','movementMods','gear','equipped','gold','materials'])assert.deepEqual(m[key],ch[key],`${version} ${key}`);
  assert.equal(m.version,CHARACTER_VERSION);assert.equal(m.opening.stage,'done');assert.equal(m.skills.hunter_shot,undefined);
 }
});
test('missing legacy fields never invent combat or movement ownership; pending old choices return to weapon',()=>{
 const old=createCharacter(data);old.version=10;delete old.opening;delete old.skills;delete old.movementSkills;old.movement='dash';
 const m=migrateCharacter(old,data);assert.deepEqual(m.skills,{});assert.deepEqual(m.movementSkills,[]);assert.equal(m.movement,null);
 for(const stage of ['wake','weapon','skills']) {
  const pending=createCharacter(data,{opening:true});pending.version=10;pending.opening={stage,kit:'staff',skill:'frost_nova',movement:'roll'};
  const resumed=migrateCharacter(pending,data);assert.equal(resumed.opening.stage,stage==='skills'?'weapon':stage);
  assert.deepEqual(resumed.skills,{});assert.deepEqual(resumed.movementSkills,[]);
  completeOpening(resumed,data,{kit:'staff'});assert.deepEqual(resumed.skills,{arcane_bolt:1});
 }
});
test('later shore rewards and crafting still teach usable combat and movement skills',()=>{
 const ch=createCharacter(data,{kit:'staff'}),g=new Game(data,{character:ch,seed:3});
 for(let i=0;i<3;i++)g.notify({type:'kill',target:'salt_slime'});
 assert.equal(g.ch.skills.firebolt,1);assert.equal(g.skills[1].id,'firebolt');assert.ok(g.castSlot(1));g.player.cast=null;
 for(let i=0;i<3;i++)g.notify({type:'kill',target:'reef_crab'});
 assert.equal(g.ch.skills.ward,1);assert.equal(g.skills[2].id,'ward');assert.ok(g.castSlot(2));
 const c=createCharacter(data);c.gold=500;c.materials={glow_dust:5,beetle_shell:5,boar_hide:5};
 assert.ok(craft(c,data,'learn_firebolt',createRng(1)).ok);assert.equal(c.skills.firebolt,1);
 assert.ok(craft(c,data,'learn_roll',createRng(1)).ok);assert.deepEqual(c.movementSkills,['roll']);
});
test('staff normal attack fires arcane projectile without mana',()=>{
 const g=new Game(data,{character:createCharacter(data,{kit:'staff'}),seed:4}),mp=g.player.mp;
 assert.ok(g.castSlot(0,{x:g.player.x,z:g.player.z+8}));for(let i=0;i<40&&!g.projectiles.length;i++)g.update(1/60);
 assert.equal(g.projectiles.length,1);assert.equal(g.projectiles[0].element,'arcane');assert.ok(g.player.mp>=mp);
});

test('finishing an interrupted opening keeps legitimate previously learned slots and ranks',()=>{
 const ch=createCharacter(data,{opening:true});ch.skills={firebolt:3};ch.slots[0]={skill:'firebolt',mods:[]};ch.movementSkills=['roll'];ch.movement='roll';
 completeOpening(ch,data,{kit:'staff'});assert.deepEqual(ch.skills,{firebolt:3,arcane_bolt:1});assert.deepEqual(ch.slots.map(s=>s.skill),['firebolt','arcane_bolt',null,null]);assert.deepEqual(ch.movementSkills,['roll']);
});
