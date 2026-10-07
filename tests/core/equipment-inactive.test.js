import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,equip,gearRequirements,gearEquipState,inactiveEquipment,derive,gearLook,respecStats,migrateCharacter,unequip,equipmentNotice} from '../../src/core/character.js';
import {upgradeGear,promoteGear} from '../../src/core/crafting.js';
import {createRng} from '../../src/core/rng.js';
const fund=()=>{const ch=createCharacter(data);ch.gold=100000;for(const k in data.items.materials)ch.materials[k]=10000;for(const k in ch.stats)ch.stats[k]=999;return ch;};
const give=(ch,base)=>{const it={uid:ch.nextUid++,base,itemLevel:data.items.gearBases[base].itemLevel,grade:'C',upgrade:0,options:[]};ch.gear.push(it);return it;};
test('respec retains slot, visible identity and ownership; recovery activates without re-equipping',()=>{
 const ch=fund(),it=give(ch,'tusk_blade');assert.ok(equip(ch,data,it.uid).ok);
 const worn={...ch.equipped},look=gearLook(ch,data),valid=derive(ch,data),before=structuredClone(ch.gear);
 assert.ok(respecStats(ch,data));assert.deepEqual(ch.equipped,worn);assert.deepEqual(ch.gear,before);assert.deepEqual(gearLook(ch,data),look);
 const state=gearEquipState(ch,data,it);assert.equal(state.ok,false);assert.ok(state.rows.every(r=>r.deficit===Math.max(0,r.need-r.current)));assert.match(state.missing.join(),/ขาด/);
 assert.ok(inactiveEquipment(ch,data).some(i=>i.uid===it.uid));assert.equal(derive(ch,data).weaponType,'none');
 const naked=structuredClone(ch);naked.equipped.weapon=null;assert.deepEqual(derive(ch,data),derive(naked,data));
 const loaded=JSON.parse(JSON.stringify(ch));migrateCharacter(loaded,data);assert.deepEqual(loaded.equipped,worn);assert.deepEqual(loaded.gear,ch.gear);
 for(const [stat,n] of Object.entries(state.requires))ch.stats[stat]=n;
 assert.ok(gearEquipState(ch,data,it).ok);assert.equal(derive(ch,data).weaponType,'sword');assert.ok(derive(ch,data).attack>derive(naked,data).attack);assert.ok(valid.attack>0);
});
test('dual wield displays the sum, disables both and recovers when the partner is removed',()=>{
 const ch=fund(),a=give(ch,'rusty_sword'),b=give(ch,'rusty_sword');assert.ok(equip(ch,data,a.uid).ok);assert.ok(equip(ch,data,b.uid,'offhand').ok);
 const own=gearRequirements(a,data);for(const [k,n] of Object.entries(own))ch.stats[k]=n;
 const s=gearEquipState(ch,data,a);for(const [k,n] of Object.entries(own)){assert.equal(s.requires[k],n*2);assert.equal(s.rows.find(r=>r.stat===k).deficit,n);}
 assert.equal(inactiveEquipment(ch,data).length,2);assert.equal(derive(ch,data).dualWield,false);assert.ok(unequip(ch,data,'offhand').ok);assert.ok(gearEquipState(ch,data,a).ok);
});
test('enhancement and promotion keep now-invalid equipment slotted and report inactivity',()=>{
 const ch=fund(),it=give(ch,'tusk_blade');assert.ok(equip(ch,data,it.uid).ok);for(let n=0;n<3;n++)assert.ok(promoteGear(ch,data,it.uid,createRng(n+50)).ok);
 for(const [k,n] of Object.entries(gearRequirements(it,data)))ch.stats[k]=n;
 let r;do{r=upgradeGear(ch,data,it.uid);assert.ok(r.ok);}while(!r.inactive.length&&it.upgrade<data.items.upgrade.max);assert.equal(ch.equipped.weapon,it.uid);assert.deepEqual(r.unequipped,[]);assert.ok(r.inactive.some(x=>x.uid===it.uid));assert.equal(derive(ch,data).weaponType,'none');
});
test('promotion crossing the stat gate reports the exact deficit without changing the slot',()=>{
 const ch=fund(),it=give(ch,'tusk_blade');for(const [k,n] of Object.entries(gearRequirements(it,data)))ch.stats[k]=n;assert.ok(equip(ch,data,it.uid).ok);
 const result=promoteGear(ch,data,it.uid,createRng(1));assert.ok(result.ok);assert.deepEqual(result.unequipped,[]);assert.equal(ch.equipped.weapon,it.uid);
 const state=result.inactive.find(i=>i.uid===it.uid);assert.ok(state);assert.ok(state.rows.some(r=>r.deficit>0));assert.equal(derive(ch,data).weaponType,'none');
});

for(const staysValid of [true,false])test(`cap stat-reset notice survives migration with ${staysValid?'active':'inactive'} equipment`,()=>{
 const ch=createCharacter(data);ch.level=data.progression.character.maxLevel+1;ch.statPoints=0;ch.stats.STR=20;
 if(!staysValid){const it=give(ch,'tusk_blade');assert.ok(equip(ch,data,it.uid).ok);}
 const beforeGear=structuredClone(ch.gear),slots={...ch.equipped};
 migrateCharacter(ch,data);assert.deepEqual(ch.stats,data.progression.character.startingStats);assert.deepEqual(ch.gear,beforeGear);assert.deepEqual(ch.equipped,slots);
 assert.match(ch.progress.equipmentNotice,/คืนแต้มสเตตัสให้จัดใหม่ฟรี/);assert.equal(equipmentNotice(ch,data),ch.progress.equipmentNotice);
 assert.equal(ch.progress.equipmentNotice.includes('สถานะไม่ได้ใช้'),!staysValid);
 const first=JSON.stringify(ch);migrateCharacter(ch,data);assert.equal(JSON.stringify(ch),first,'repeat load neither deletes nor duplicates the explanation');
 if(!staysValid){ch.stats.STR=100;const message=equipmentNotice(ch,data);assert.match(message,/คืนแต้มสเตตัส/);assert.equal(message.includes('สถานะไม่ได้ใช้'),false,'recovery removes stale inactivity but keeps reset explanation');}
});
