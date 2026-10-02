import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,derive,allocateJobNode,jobNodeState,jobTierProgress,migrateCharacter,gearStats} from '../../src/core/character.js';
import {computeSkill,modFits} from '../../src/core/skills.js';
import {Game} from '../../src/core/game.js';
import {jobView,clusterNodes} from '../../src/ui/jobview.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);
const manaRoute=['mana_pool_1','mana_flow_1','mana_pool_2','mana_flow_2','mana_efficiency','mana_reservoir','mana_cycling'];

test('a focused elemental build can buy connected mana choices before its major unlock',()=>{
 const ch=createCharacter(data);ch.jobLevel=40;ch.jobPoints=39;const before=derive(ch,data);for(const id of ['f_hp','f_mp','f_mag'])assert.ok(allocateJobNode(ch,data,id).done);
 assert.equal(jobNodeState(ch,data,'element_fire_2').reason,'not_linked');
 for(const id of ['element_fire_1','element_fire_2'])assert.ok(allocateJobNode(ch,data,id).done,id);
 assert.equal(jobNodeState(ch,data,'element_fire_3').reason,'tier_points');
 assert.equal(jobNodeState(ch,data,'mana_master').reason,'tier_points');
 assert.equal(jobTierProgress(ch,data,'mana_pool_2').requires,3);
 for(const id of manaRoute)assert.ok(allocateJobNode(ch,data,id).done,id);
 assert.equal(jobTierProgress(ch,data,'element_fire_3').spent,12);
 assert.ok(jobNodeState(ch,data,'element_fire_3').can);assert.ok(jobNodeState(ch,data,'mana_master').can);
 const after=derive(ch,data);assert.ok(after.maxMp>before.maxMp);assert.ok(after.mpRegen>before.mpRegen);assert.equal(after.manaCostPct,3);
 const saved=JSON.stringify(ch);migrateCharacter(ch,data);assert.equal(JSON.stringify(ch),saved,'content update preserves existing version-4 ownership and rolls');
});
test('gear resource choices compete for grade slots and bounded cost reduction applies once',()=>{
 const ch=createCharacter(data);for(const k in ch.stats)ch.stats[k]=100;const item=ch.gear[0];
 item.options=[{id:'mp_pct',value:8},{id:'mp_regen_pct',value:10},{id:'mana_cost_pct',value:5}];
 const stats=gearStats(item,data);assert.equal(stats.maxMpPct,8);assert.equal(stats.mpRegenPct,10);assert.equal(stats.manaCostPct,5);
 assert.deepEqual(['C','B','A','S'].map(k=>data.items.grades.optionCount[k]),[2,3,4,5]);
 const fb=ch.slots.findIndex(s=>s.skill==='firebolt');ch.skills.firebolt=3;const d=derive(ch,data);
 near(computeSkill(ch,data,d,fb).cost,data.skills.combat.firebolt.cost*1.1*.95);
 item.options=[{id:'mana_cost_pct',value:100}];assert.equal(derive(ch,data).manaCostPct,35);
 near(computeSkill(ch,data,derive(ch,data),fb).cost,data.skills.combat.firebolt.cost*1.1*.65);
 assert.equal(computeSkill(ch,data,derive(ch,data),0).cost,0,'basic attack remains free');
});
test('mana siphon fits direct damage skills, preserves inactive sockets and denies non-hit roles',()=>{
 const mod=data.mods.mods.mana_siphon;
 for(const id of ['slash','whirl_blade','hunter_shot','firebolt','frost_nova','chain_spark'])assert.ok(modFits(data.skills.combat[id],mod).ok,id);
 for(const id of ['venom_mire','spirit_wolf','ward','healing_spring'])if(data.skills.combat[id])assert.ok(!modFits(data.skills.combat[id],mod).ok,id);
 const ch=createCharacter(data);ch.mods=[{uid:700,id:'mana_siphon',level:3}];ch.slots[0].mods=[700];
 assert.equal(computeSkill(ch,data,derive(ch,data),0).manaOnHit,0);
 ch.stats.INT=6;const s=computeSkill(ch,data,derive(ch,data),0);assert.equal(s.manaOnHit,2);assert.equal(s.manaOnHitCooldown,1);
});
test('on-hit recovery shares a cooldown across targets, skills and repeat hits',()=>{
 const g=new Game(data,{seed:8});g.ch.stats.INT=6;g.ch.mods=[{uid:700,id:'mana_siphon',level:3}];g.ch.slots[0].mods=[700];g.refresh();
 const m=g.monsters[0];m.hp=10000;const second=g.monsters[1];second.hp=10000;g.player.mp=10;
 const opts=g.hitOpts(g.skills[0]);g.hitMonster(m,10,opts);assert.equal(g.player.mp,12);
 g.hitMonster(second,10,opts);g.hitMonster(m,10,{...opts,skill:'firebolt'});assert.equal(g.player.mp,12);
 g.time=.999;g.hitMonster(m,10,opts);assert.equal(g.player.mp,12);
 g.time=1;g.hitMonster(m,10,opts);assert.equal(g.player.mp,14);
 g.time=2;g.player.mp=g.player.maxMp-.5;g.hitMonster(m,10,opts);assert.equal(g.player.mp,g.player.maxMp);
});
test('misses, damage over time, allies, death and already dead targets cannot refund mana',()=>{
 const g=new Game(data,{seed:8}),m=g.monsters[0],opts={manaOnHit:2,manaOnHitCooldown:1};m.hp=10000;g.player.mp=10;
 for(const extra of [{dot:true},{byAlly:true}])g.hitMonster(m,10,{...opts,...extra});
 assert.equal(g.player.mp,10);assert.equal(g.player.nextManaGainT,0);
 g.player.dead=true;g.hitMonster(m,10,opts);assert.equal(g.player.mp,10);
 g.player.dead=false;m.dead=true;assert.equal(g.hitMonster(m,10,opts),0);assert.equal(g.player.mp,10);
});
test('journal pages share area gates while preserving authored positions and path inspection',()=>{
 const t=data.jobtree;
 for(const [id,n]of Object.entries(t.nodes)){const section=t.sections[n.section];assert.equal(section.requiresSpent,t.stages.find(s=>s.tier===section.tier).requiresSpent);assert.ok(n.clusterPos[0]>0&&n.clusterPos[0]<t.layout.pageWidth,id);if(section.tier===1)assert.equal(n.category,'foundation');}
 const ch=createCharacter(data);ch.jobPoints=39;for(const id of ['f_hp','f_mp','f_mag'])assert.ok(allocateJobNode(ch,data,id).done);
 const ui={game:{ch,data},sel:{journalStage:2,constellation:'foundation',node:'mana_pool_2'}};
 const before=JSON.stringify(ch),html=jobView(ui,{effectText:(k,v)=>k+' '+v});assert.ok(html.includes('แต้มคงเหลือ'));assert.ok(html.includes('นับรวมตลอดการเดินทาง'));assert.ok(html.includes('data-act="journal-stage"'));assert.ok(html.includes('data-act="jump-node" data-id="mana_pool_1"'));assert.equal(JSON.stringify(ch),before);
});
