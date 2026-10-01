import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,migrateCharacter,derive} from '../../src/core/character.js';
import {computeSkill} from '../../src/core/skills.js';
import {gearUpgradePreview} from '../../src/core/crafting.js';

test('v2 migration refunds network points once, retains ownership and roll quality',()=>{
 const ch=createCharacter(data);ch.version=2;delete ch.treeRevision;ch.jobLevel=12;ch.jobNodes=['origin','v1','v2','vj','v4'];ch.jobPoints=7;ch.skills.slash=5;
 ch.gear.push({uid:99,base:'tusk_blade',grade:'A',upgrade:4,options:[{id:'attack_flat',value:6}]});
 const before={gold:ch.gold,materials:structuredClone(ch.materials),equipped:structuredClone(ch.equipped),skills:structuredClone(ch.skills),stats:structuredClone(ch.stats),nextUid:ch.nextUid};
 const def=data.items.gearOptions.attack_flat;
 migrateCharacter(ch,data);assert.equal(ch.version,3);assert.equal(ch.jobPoints,11);assert.deepEqual(ch.jobNodes,['origin']);
 assert.deepEqual({gold:ch.gold,materials:ch.materials,equipped:ch.equipped,skills:ch.skills,stats:ch.stats,nextUid:ch.nextUid},before);
 const item=ch.gear.find(g=>g.uid===99);assert.equal(item.upgrade,4);assert.equal(item.grade,'A');assert.equal(item.options[0].value,def.max);assert.ok(ch.progress.balanceMigration);
 const once=JSON.stringify(ch);migrateCharacter(ch,data);assert.equal(JSON.stringify(ch),once);
});
test('legacy small affix pools gain missing grade slots once without rerolling',()=>{
 const ch=createCharacter(data);ch.version=2;const base=data.recipes.recipes.salt_boots.result;
 const original=[{id:'move_pct',value:4},{id:'cdr_pct',value:3}];
 ch.gear.push({uid:88,base,grade:'S',upgrade:3,options:structuredClone(original)});
 migrateCharacter(ch,data);const item=ch.gear.find(g=>g.uid===88);
 assert.equal(item.grade,'S');assert.equal(item.upgrade,3);assert.equal(item.options.length,3);
 assert.deepEqual(item.options.slice(0,2).map(o=>o.id),original.map(o=>o.id));
 assert.equal(item.options[2].id,'defense_flat');assert.equal(item.options[2].value,data.items.gearOptions.defense_flat.min);
 const once=JSON.stringify(ch);migrateCharacter(ch,data);assert.equal(JSON.stringify(ch),once);
});
test('power growth is bounded across independent sources; tank and speed caps are authoritative',()=>{
 const ch=createCharacter(data);ch.level=40;for(const stat in ch.stats)ch.stats[stat]=1000;
 ch.jobNodes=Object.keys(data.jobtree.nodes);const d=derive(ch,data),caps=data.progression.character.caps;
 for(const [stat,cap]of Object.entries(caps))assert.ok(cap<0?d[stat]>=cap:d[stat]<=cap,stat);
 const low=createCharacter(data);low.skills.slash=1;const before=computeSkill(low,data,derive(low,data),0);low.skills.slash=5;const after=computeSkill(low,data,derive(low,data),0);
 assert.ok(Math.abs(after.damage/before.damage-1.24)<1e-8);
});
test('upgrade previews describe real stats without spending, rolling or modifying gear',()=>{
 const ch=createCharacter(data),item=ch.gear[0],before=JSON.stringify(ch),preview=gearUpgradePreview(data,item);
 assert.equal(JSON.stringify(ch),before);assert.ok(preview.after.attack>preview.before.attack,'the first enhancement has a visible benefit');
});

test('leech includes mod bonuses in its cap and never pays for overkill damage',async()=>{
 const {Game}=await import('../../src/core/game.js');const g=new Game(data,{seed:7});
 g.ch.stats.VIT=10;g.ch.mods=[{uid:999,id:'life_leech',level:3}];g.ch.slots[0].mods=[999];g.ch.jobNodes.push('v8');
 g.ch.gear[0].options=[{id:'leech_pct',value:20}];g.refresh();assert.equal(g.skills[0].leech,data.progression.character.caps.leechPct);
 const target=g.monsters[0];target.hp=1;g.player.hp=20;g.killMonster=m=>{m.dead=true;};
 g.hitMonster(target,10000,{leech:100});assert.equal(g.player.hp,21,'recovery uses one remaining monster HP, not 10000 overkill');
});
