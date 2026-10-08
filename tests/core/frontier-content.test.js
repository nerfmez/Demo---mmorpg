import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacyData as data} from './helpers.js';
import {Game} from '../../src/core/game.js';
import {createCharacter,migrateCharacter,derive,CHARACTER_VERSION,arrowsPerCast,arrowTotal} from '../../src/core/character.js';
import {computeSkill,movementSkill,socketMod,socketMovementMod,unsocketMod,modSlotOf,modFits} from '../../src/core/skills.js';
import {tickFrontier,manaLimit,executeFrontier,wallBlocked} from '../../src/core/frontier-content.js';
import {modUpgradeState} from '../../src/core/crafting.js';
const fixture=(id='charged_shot',mods=[])=>{
 const ch=createCharacter(data,{kit:'bow'});ch.movementSkills=Object.keys(data.skills.movement);ch.movement='roll';ch.stats={STR:50,DEX:50,INT:50,AGI:50,VIT:50};ch.skills[id]=1;ch.slots=[{skill:id,mods:[]},...ch.slots.slice(1).map(()=>({skill:null,mods:[]}))];
 ch.mods=mods.map((id,i)=>({id,uid:900+i,level:1,grade:'C'}));ch.slots[0].mods=ch.mods.map(m=>m.uid);
 const g=new Game(data,{seed:71,character:ch});g.player.x=0;g.player.z=0;g.player.facing=Math.PI/2;g.derived.weaponType=data.skills.combat[id].requiresWeapon?.[0]||'sword';g.derived.offhand='shield';g.skills=ch.slots.map((_,i)=>computeSkill(ch,data,g.derived,i));
 const m=g.monsters[0];m.x=2;m.z=0;m.hp=m.maxHp=100000;m.defense=0;m.facing=Math.PI;m.boss=false;m.state='chase';m.aggro=true;m.statuses={};g.monsters=[m];
 g.world={surfaceY:()=>0,isFree:()=>true,move:(x,z,r,dx,dz)=>({x:x+dx,z:z+dz,blocked:false}),seams:[],bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},safe:()=>false};g.isSafe=()=>false;g.nearby=()=>({inTown:false});g.derived.critChance=0;g.player.mp=g.player.maxMp;g.drainEvents();
 return {g,ch,m,s:g.skills[0]};
};
const advance=(g,t)=>{while(t>0){const dt=Math.min(.02,t);g.time+=dt;tickFrontier(g,dt);g.updatePlayer(dt);g.updateAreas(dt);t-=dt;}};
const aim={angle:Math.PI/2,x:2,z:0};
test('charged shot pays only on release, scales to cap and fires once after contact',()=>{
 for(const time of [0,.6,1.2,3]){const {g,ch,s}=fixture();const mp=g.player.mp,ammo=arrowTotal(ch);assert(g.castSlot(0));advance(g,time);assert.equal(g.player.mp,mp);assert.equal(arrowTotal(ch),ammo);assert.equal(g.projectiles.length,0);assert(g.releaseCharge(0));assert.equal(arrowTotal(ch),ammo-arrowsPerCast(data,s));assert.equal(g.player.mp,mp-s.cost);const expected=s.damage*(1+1.5*Math.min(time,1.2)/1.2);assert(Math.abs(g.player.cast.skill.damage-expected)<1e-6);advance(g,.19);assert.equal(g.projectiles.length,0);advance(g,.03);assert.equal(g.projectiles.length,1);advance(g,.3);assert.equal(g.projectiles.length,1);assert.equal(g.releaseCharge(0),false);}
});
test('cancel, movement, death, refresh and missing release resources never shoot a stale charge',()=>{
 for(const mode of ['cancel','movement','death','refresh','ammo','mp','weapon']){const {g,ch,s}=fixture();assert(g.castSlot(0));const ammo=arrowTotal(ch),mp=g.player.mp;advance(g,.5);
 if(mode==='cancel')g.cancelCharge();if(mode==='movement')g.useMovement();if(mode==='death')g.damagePlayer(1e9,null);if(mode==='refresh')g.refresh();if(mode==='ammo')ch.arrows.stock={};if(mode==='mp')g.player.mp=0;if(mode==='weapon')g.skills[0].requirementsMet=false;
 assert.equal(g.releaseCharge(0),false,mode);advance(g,.3);assert.equal(g.projectiles.length,0,mode);if(!['ammo'].includes(mode))assert.equal(arrowTotal(ch),ammo);if(['cancel','movement','refresh'].includes(mode))assert.equal(g.player.mp,mp);
 }
});
test('movement mod halves all four distances, adds one maximum charge and preserves other mechanics',()=>{
 const {ch}=fixture();ch.slots[0].mods=[];ch.mods=[{id:'short_stride',uid:901,level:1}];assert(socketMovementMod(ch,data,901).ok);assert.equal(modSlotOf(ch,901),-2);
 for(const id of Object.keys(data.skills.movement)){ch.movement=id;const before=movementSkill({...ch,movementMods:[]},data,derive(ch,data)),after=movementSkill(ch,data,derive(ch,data));assert.equal(after.distance,before.distance*.5,id);assert.equal(after.charges,before.charges+1,id);assert.equal(after.duration,before.duration,id);assert.equal(after.recharge,before.recharge,id);assert.equal(after.invulnerable,before.invulnerable,id);assert.deepEqual(after.landing,before.landing,id);}
 ch.stats.AGI=1;assert.equal(movementSkill(ch,data,derive(ch,data)).mods[0].active,false);assert.equal(ch.movementMods[0],901);ch.stats.AGI=50;assert(movementSkill(ch,data,derive(ch,data)).mods[0].active);assert.equal(modUpgradeState(ch,data,ch.mods[0]).reason,'max');unsocketMod(ch,901);assert.equal(modSlotOf(ch,901),-1);
});
test('v8 migration adds a separate empty movement socket and preserves ownership/loadout, repeat is idempotent',()=>{
 const {ch}=fixture('firebolt',['split']);ch.version=8;delete ch.movementMods;const before=structuredClone(ch);migrateCharacter(ch,data);assert.equal(ch.version,CHARACTER_VERSION);assert.deepEqual(ch.movementMods,[]);assert.deepEqual(ch.mods,before.mods);assert.deepEqual(ch.slots,before.slots);assert.deepEqual(ch.gear,before.gear);const once=structuredClone(ch);migrateCharacter(ch,data);assert.deepEqual(ch,once);
 ch.movementMods=[900,900,1234];migrateCharacter(ch,data);assert.deepEqual(ch.movementMods,[]);assert.equal(socketMovementMod(ch,data,900).ok,false);assert.equal(socketMod(ch,data,0,900).reason,'duplicate');
});
test('new mod conflicts reject symmetrically; shatter requires a live cold conversion',()=>{
 for(const pair of [['returning_shot','bounce'],['gathering_cut','knockback'],['following_aura','cast_on_dodge'],['cast_on_guard','cast_on_dodge']])for(const [a,b] of [pair,[...pair].reverse()]){const s=a==='gathering_cut'||b==='gathering_cut'?data.skills.combat.frost_nova:a==='following_aura'||b==='following_aura'?data.skills.combat.war_cry:data.skills.combat.firebolt;assert.equal(modFits(s,data.mods.mods[a],[data.mods.mods[b]]).ok,false,a+' '+b);}
 const {g,ch}=fixture('firebolt',['shatter','frost_shift']);assert(g.skills[0].mods.every(m=>m.active));ch.stats.INT=1;g.refresh();assert.equal(g.skills[0].mods.find(m=>m.id==='shatter').active,false);
});
test('each new skill has a working executor and the weapon/offhand gates enforce actual gear',()=>{
 for(const [id,d] of Object.entries(data.skills.combat).filter(([,d])=>d.prototype)){const {g,m,s}=fixture(id);g.executeSkill(s,id==='crystal_wall'?{...aim,x:8}:aim);assert(g.drainEvents().length||g.areas.length||g.allies.length||g.player.auras||g.player.riposte||g.player.channeling,id);if(d.requiresWeapon){assert.equal(computeSkill(g.ch,data,{...g.derived,weaponType:'none'},0).requirementsMet,false,id);}}
 const {g}=fixture('shield_bash');g.derived.offhand='none';g.skills[0]=computeSkill(g.ch,data,g.derived,0);assert.equal(g.skills[0].requirementsMet,false);assert.equal(g.castSlot(0),false);assert.equal(g.drainEvents().at(-1).reason,'offhand');
});
test('parry only accepts frontal direct hits in its window, opens one counter and uses no extra MP',()=>{
 const {g,m,s}=fixture('riposte');g.executeSkill(s,aim);const mp=g.player.mp;g.damagePlayer(30,m);assert(g.player.riposte.readyUntil>g.time);assert(g.castSlot(0));assert.equal(g.player.mp,mp);advance(g,.2);assert.equal(g.player.riposte,null);assert.equal(g.castSlot(0),false);
 for(const mode of ['rear','expired','dot']){const {g,m,s}=fixture('riposte');g.executeSkill(s,aim);if(mode==='rear')m.x=-2;if(mode==='expired')g.time+=1;g.damagePlayer(30,m,{dot:mode==='dot'});assert.equal(g.player.riposte.readyUntil,0,mode);}
});
test('flanking, exposure and explicit interruption change outcomes without permanently locking bosses',()=>{
 const a=fixture('weakpoint'),b=fixture('weakpoint');a.m.facing=-Math.PI/2;b.m.facing=Math.PI/2;a.g.executeSkill(a.s,aim);b.g.executeSkill(b.s,aim);assert(b.m.maxHp-b.m.hp>a.m.maxHp-a.m.hp);
 const {g,m,s}=fixture('armor_cleave');g.executeSkill(s,aim);assert.equal(m.statuses.exposure.fraction,.18);g.executeSkill(s,aim);assert.equal(m.statuses.exposure.fraction,.18);tickFrontier(g,6);assert.equal(m.statuses.exposure,undefined);
 for(const boss of [false,true]){const {g,m,s}=fixture('interrupt_slam');m.state='windup';m.windup={name:Object.keys(m.def.attacks)[0]};m.boss=boss;g.executeSkill(s,aim);assert.equal(m.state,boss?'windup':'stunned');}
});
test('line strike respects width/range and rain pays all three authored waves',()=>{
 for(const pos of [[3,0,true],[3,3,false],[8,0,false]]){const {g,m,s}=fixture('frontline_split');m.x=pos[0];m.z=pos[1];g.executeSkill(s,aim);assert.equal(m.hp<m.maxHp,pos[2]);}
 const {g,ch,s}=fixture('arrow_rain');assert.equal(arrowsPerCast(data,s),3);const ammo=arrowTotal(ch);g.castSlot(0,{x:2,z:0});advance(g,.3);assert.equal(arrowTotal(ch),ammo-3);assert.equal(g.areas.length,3);
});
test('channel requires windup, drains mana and stops on release or depleted MP',()=>{
 const {g,m,s}=fixture('flame_stream');const hp=m.hp;assert(g.castSlot(0));advance(g,.18);assert.equal(m.hp,hp);advance(g,.05);assert(m.hp<hp);const after=m.hp;g.cancelChannel();advance(g,.4);assert.equal(m.hp,after);assert.equal(g.player.channeling,null);
 const b=fixture('flame_stream');b.g.castSlot(0);b.g.player.mp=0;advance(b.g,.25);assert.equal(b.g.player.channeling,null);
});
test('cleanse heals and removes one allowed status, chain never loops and barrier is capped',()=>{
 const {g,s}=fixture('cleanse',['healing_chain','healing_barrier']);g.player.hp-=100;g.player.statuses={poison:{t:5},chill:{t:5},boss_mark:{t:5}};g.spawnAllies(fixture('stone_guardian').s,0,0);const a=g.allies[0];a.hp-=100;g.executeSkill(s,{...aim,targetId:g.player.id});assert.equal(g.player.statuses.poison,undefined);assert(g.player.statuses.chill);assert(g.player.statuses.boss_mark);assert(g.player.barrier>0&&g.player.barrier<=g.player.maxHp*.3);assert(a.hp>a.maxHp-100);const before=g.player.barrier;g.executeSkill(s,{...aim,targetId:g.player.id});assert.equal(g.player.barrier,before);
});
test('Aura reserves MP while active, follows range, toggles off and expires when unslotted',()=>{
 const {g,s,ch}=fixture('battle_aura');g.executeSkill(s,aim);assert.equal(manaLimit(g),g.player.maxMp*.8);assert(g.player.mp<=manaLimit(g));g.executeSkill(s,aim);assert.equal(manaLimit(g),g.player.maxMp);g.executeSkill(s,aim);ch.slots[0].skill=null;g.refresh();tickFrontier(g,.1);assert.equal(Object.keys(g.player.auras).length,0);
 const b=fixture('war_cry',['following_aura']);b.g.executeSkill(b.s,aim);tickFrontier(b.g,.1);assert(b.g.player.buffs.war_cry);assert.equal(manaLimit(b.g),b.g.player.maxMp*.75);b.ch.slots[0].mods=[];b.g.refresh();tickFrontier(b.g,.1);assert.equal(Object.keys(b.g.player.auras).length,0);assert.equal(manaLimit(b.g),b.g.player.maxMp);
});
test('wall refuses occupied/closed placements, blocks movement, and can be destroyed after windup',()=>{
 const {g,s,m}=fixture('crystal_wall');g.executeSkill(s,{angle:0,x:8,z:0});assert.equal(g.areas.length,3);const wall=g.areas[1];assert(wallBlocked(g,m,wall.x,wall.z));m.x=wall.x;m.z=wall.z-3;assert(wallBlocked(g,m,wall.x,wall.z+3),'swept move cannot tunnel through a wall');m.x=wall.x-1.5;m.z=wall.z;m.wallTarget=wall.id;m.damage=1e5;tickFrontier(g,s.wall.breakWindup-.01);assert(wall.wallHp>0);tickFrontier(g,.02);assert(wall.wallHp<=0);g.updateAreas(.02);assert.equal(g.areas.length,2);
 const b=fixture('crystal_wall');b.g.executeSkill(b.s,{angle:0,x:b.m.x,z:b.m.z});assert.equal(b.g.areas.length,0);b.g.world.isFree=()=>false;b.g.executeSkill(b.s,{angle:0,x:8,z:0});assert.equal(b.g.areas.length,0);
});
test('projectile return hits once per leg; terminal burst fires at final end without mod recursion',()=>{
 const {g,m,s}=fixture('arcane_shot',['returning_shot','terminal_burst']);g.executeSkill(s,aim);const pr=g.projectiles[0];pr.range=4;pr.speed=10;pr.vx=10;pr.vz=0;let hits=0;const original=g.hitMonster.bind(g);g.hitMonster=(m,a,o)=>{if(!o.secondary)hits++;return original(m,a,o);};for(let i=0;i<60;i++)g.updateProjectiles(.02);assert.equal(hits,2);assert.equal(g.projectiles.length,0);assert.equal(g.drainEvents().filter(e=>e.type==='burst'&&e.kind==='mod_burst').length,1);
});
test('chain return revisits only the first live target, and bleed does not crit or proc hits',()=>{
 const {g,m,s}=fixture('chain_spark',['chain_return']);g.player.targetId=m.id;g.executeSkill(s,aim);assert.equal(g.drainEvents().filter(e=>e.type==='hit').length,2);
 const a=fixture('slash',['laceration']);a.g.executeSkill(a.s,aim);assert(a.m.statuses.bleed);const t=a.m.statuses.bleed.t;a.g.tickStatuses(a.m,1.5);const events=a.g.drainEvents().filter(e=>e.type==='hit'&&e.dot);assert(events.length);assert(events.every(e=>!e.crit&&e.element==='physical'));assert(a.m.statuses.bleed.t<t);
});
test('status-consuming bursts consume once, and following fields remain one per slot with bounded slow',()=>{
 const a=fixture('firebolt',['ash_detonation']);a.m.statuses.burn={dps:5,t:3,owner:'player'};a.g.hitMonster(a.m,20,a.g.hitOpts(a.s));assert.equal(a.m.statuses.burn,undefined);assert.equal(a.g.drainEvents().filter(e=>e.type==='burst').length,1);
 const b=fixture('frost_nova',['shatter']);b.m.statuses.chill={slow:.55,t:3};b.g.hitMonster(b.m,20,b.g.hitOpts(b.s));assert.equal(b.g.drainEvents().filter(e=>e.type==='burst').length,1);
 const {g,s,m}=fixture('venom_mire',['following_field','binding_field']);g.executeSkill(s,aim);g.executeSkill(s,aim);assert.equal(g.areas.length,1);g.player.x=2;g.updateAreas(.5);assert.equal(g.areas[0].x,2);const slow=m.statuses.chill.slow;g.updateAreas(.5);assert(m.statuses.chill.slow>slow&&m.statuses.chill.slow<=.35);
});
test('curse spreads remaining time to one new target only; barrier break fires once',()=>{
 const {g,m,s}=fixture('hex',['spreading_hex']);g.executeSkill(s,aim);m.statuses.hex.t=2;const other={...m,id:999,x:3,statuses:{},hp:100};g.monsters.push(other);m.minion=true;g.killMonster(m);assert.equal(other.statuses.hex.t,2);g.killMonster(m);assert.equal(other.statuses.hex.t,2);
 const b=fixture('ward',['breaking_ward']);b.g.executeSkill(b.s,aim);const before=b.m.x;b.g.damagePlayer(1e4,null);assert(b.m.x>before);assert.equal(b.g.player.barrierBreak,null);
});
test('guardian summon shares one bounded hit, focus and commands change targeting without extra loadout slots',()=>{
 const {g,s,m}=fixture('stone_guardian',['guardian_bond','focused_pack']);g.spawnAllies(s,0,0);const a=g.allies[0],hp=a.hp;g.damagePlayer(40,null);assert(a.hp<hp);assert.equal(s.summon.damage,fixture('stone_guardian').s.summon.damage*.75);assert(g.commandAllies('attack',m.id));assert.equal(a.targetId,m.id);g.updateAllies(.02);assert.equal(a.targetId,m.id,'explicit command overrides automatic focus');assert.equal(g.commandAllies('attack',999),false);assert(g.commandAllies('follow'));assert.equal(a.targetId,null);assert(g.commandAllies('guard'));g.player.lastHitTarget=m.id;g.updateAllies(.1);assert.equal(a.targetId,null);g.time+=.7;g.updateAllies(.1);assert.equal(a.targetId,m.id);assert(g.commandAllies('guard'));assert.equal(g.ch.slots.length,4);
});
test('guard trigger consumes mana, respects weapon/requirements and cannot recurse',()=>{
 const {g,s}=fixture('arcane_shot',['cast_on_guard']);const mp=g.player.mp;g.fireTriggers('on_guard');assert.equal(g.projectiles.length,1);assert.equal(g.player.mp,mp-s.cost);g.fireTriggers('on_guard');assert.equal(g.projectiles.length,1);g.player.triggerCd[0]=0;g.skills[0].requirementsMet=false;g.fireTriggers('on_guard');assert.equal(g.projectiles.length,1);g.skills[0].requirementsMet=true;g.triggering=true;g.fireTriggers('on_guard');assert.equal(g.projectiles.length,1);
});

test('unsupported delivery mods cannot silently consume sockets; supported rain echo and bash knock work',()=>{
 for(const [skill,mods]of Object.entries({riposte:['multistrike','burning_ground','spiked_ward'],frontline_split:['multistrike','burning_ground','wide_arc','advancing_edge'],shield_bash:['spiked_ward'],stone_guardian:['spiked_ward'],crystal_wall:['echo','cast_on_dodge'],battle_aura:['cast_on_dodge'],armor_cleave:['echo']}))
  for(const id of mods)assert.equal(modFits(data.skills.combat[skill],data.mods.mods[id]).ok,false,skill+'/'+id);
 const rain=fixture('arrow_rain',['echo']);rain.g.executeSkill(rain.s,aim);assert.equal(rain.g.areas.length,6);assert.equal(rain.g.areas.filter(a=>a.echo).length,3);
 const base=fixture('shield_bash'),mod=fixture('shield_bash',['knockback']);assert(mod.s.knock>base.s.knock);assert.equal(mod.s.knock,data.mods.mods.knockback.effect.knock[0]);
});

test('guard-triggered Ward applies its advertised effect fraction and charges mana once',()=>{
 const {g,s}=fixture('ward',['cast_on_guard']);const mp=g.player.mp;
 g.fireTriggers('on_guard');assert.equal(g.player.mp,mp-s.cost);assert.equal(g.player.barrier,s.barrier*.6);
 g.fireTriggers('on_guard');assert.equal(g.player.mp,mp-s.cost);
 g.player.triggerCd[0]=0;g.player.mp=s.cost-1;g.player.barrier=0;g.fireTriggers('on_guard');assert.equal(g.player.barrier,0);assert.equal(g.player.mp,s.cost-1);
});
