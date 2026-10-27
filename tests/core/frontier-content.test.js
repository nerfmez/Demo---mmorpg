import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacyData,withField} from './helpers.js';
const data=withField(legacyData);
import {Game} from '../../src/core/game.js';
import {createCharacter,migrateCharacter,derive,CHARACTER_VERSION,arrowsPerCast,arrowTotal} from '../../src/core/character.js';
import {computeSkill,movementSkill,socketMod,socketMovementMod,unsocketMod,modSlotOf,modFits} from '../../src/core/skills.js';
import {tickFrontier,manaLimit,executeFrontier,wallBlocked,compileFrontier} from '../../src/core/frontier-content.js';
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
 for(const time of [0,.6,1.2,3]){const {g,ch,s}=fixture();const mp=g.player.mp,ammo=arrowTotal(ch);assert(g.castSlot(0));advance(g,time);assert.equal(g.player.mp,mp);assert.equal(arrowTotal(ch),ammo);assert.equal(g.projectiles.length,0);assert(g.releaseCharge(0));assert.equal(arrowTotal(ch),ammo-arrowsPerCast(data,s));assert.equal(g.player.mp,mp-s.cost);const expected=s.damage*(1+1.5*Math.min(time,1.2)/1.2);assert(Math.abs(g.player.cast.skill.damage-expected)<1e-6);advance(g,g.player.cast.total-.01);assert.equal(g.projectiles.length,0);advance(g,.03);assert.equal(g.projectiles.length,1);advance(g,.3);assert.equal(g.projectiles.length,1);assert.equal(g.releaseCharge(0),false);}
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
test('mods of one family reject each other symmetrically; status burst on a non-fire skill needs a live cold conversion',()=>{
 for(const pair of [['returning_shot','bounce'],['gathering_cut','knockback'],['cast_on_guard','cast_on_dodge']])for(const [a,b] of [pair,[...pair].reverse()]){const s=a==='gathering_cut'||b==='gathering_cut'?data.skills.combat.frost_nova:data.skills.combat.firebolt;const fit=modFits(s,data.mods.mods[a],[data.mods.mods[b]]);assert.equal(fit.ok,false,a+' '+b);assert.equal(fit.reason,'family');}
 assert.equal(modFits(data.skills.combat.hunter_shot,data.mods.mods.status_burst).ok,false);
 const {g,ch}=fixture('hunter_shot',['status_burst','frost_shift']);assert(g.skills[0].mods.every(m=>m.active));ch.stats.INT=1;g.refresh();assert.equal(g.skills[0].mods.find(m=>m.id==='status_burst').active,false);
});
test('each new skill has a working executor and the weapon/offhand gates enforce actual gear',()=>{
 for(const [id,d] of Object.entries(data.skills.combat).filter(([,d])=>d.prototype)){const {g,m,s}=fixture(id);g.executeSkill(s,id==='crystal_wall'?{...aim,x:8}:aim);assert(g.drainEvents().length||g.areas.length||g.allies.length||g.player.auras||g.player.riposte||g.player.channeling,id);if(d.requiresWeapon){assert.equal(computeSkill(g.ch,data,{...g.derived,weaponType:'none'},0).requirementsMet,false,id);}}
 const {g}=fixture('shield_bash');g.derived.offhand='none';g.skills[0]=computeSkill(g.ch,data,g.derived,0);assert.equal(g.skills[0].requirementsMet,false);assert.equal(g.castSlot(0),false);assert.equal(g.drainEvents().at(-1).reason,'offhand');
});
test('parry only accepts frontal direct hits in its window, opens one counter and uses no extra MP',()=>{
 const {g,m,s}=fixture('riposte');g.executeSkill(s,aim);const mp=g.player.mp;g.damagePlayer(30,m);assert(g.player.riposte.readyUntil>g.time);assert(g.castSlot(0));assert.equal(g.player.mp,mp);advance(g,.2);assert.equal(g.player.riposte,null);assert.equal(g.castSlot(0),false);
 for(const mode of ['rear','expired','dot']){const {g,m,s}=fixture('riposte');g.executeSkill(s,aim);if(mode==='rear')m.x=-2;if(mode==='expired')g.time+=1;g.damagePlayer(30,m,{dot:mode==='dot'});assert.equal(g.player.riposte.readyUntil,0,mode);}
});
test('flanking, the front penalty, exposure and the slam stun change outcomes without permanently locking bosses',()=>{
 const a=fixture('weakpoint'),b=fixture('weakpoint');a.m.facing=-Math.PI/2;b.m.facing=Math.PI/2;a.g.executeSkill(a.s,aim);b.g.executeSkill(b.s,aim);const front=a.m.maxHp-a.m.hp,back=b.m.maxHp-b.m.hp;assert(Math.abs(back/front-1.6/0.7)<0.1,`behind ${back} vs front ${front}`);
 const {g,m,s}=fixture('armor_cleave');g.executeSkill(s,aim);assert.equal(m.statuses.exposure.fraction,.18);g.executeSkill(s,aim);assert.equal(m.statuses.exposure.fraction,.18);tickFrontier(g,6);assert.equal(m.statuses.exposure,undefined);
 for(const boss of [false,true])for(const state of ['chase','windup']){const {g,m,s}=fixture('interrupt_slam');m.state=state;m.windup=state==='windup'?{name:Object.keys(m.def.attacks)[0]}:null;m.boss=boss;g.executeSkill(s,aim);assert.equal(m.state,'stunned');assert.equal(m.windup,null);assert.equal(m.stateDur,boss?.4:1.2);assert.equal(g.drainEvents().find(e=>e.type==='stunned').duration,m.stateDur);}
});
test('line strike respects width/range and rain pays all three authored waves',()=>{
 for(const pos of [[3,0,true],[3,3,false],[8,0,false]]){const {g,m,s}=fixture('frontline_split');m.x=pos[0];m.z=pos[1];g.executeSkill(s,aim);assert.equal(m.hp<m.maxHp,pos[2]);}
 const {g,ch,s}=fixture('arrow_rain');assert.equal(arrowsPerCast(data,s),3);const ammo=arrowTotal(ch);g.castSlot(0,{x:2,z:0});advance(g,.3);assert.equal(arrowTotal(ch),ammo-3);assert.equal(g.areas.length,3);
});
test('channel requires windup, drains mana and stops on release or depleted MP',()=>{
 const {g,m,s}=fixture('flame_stream');const hp=m.hp;assert(g.castSlot(0));advance(g,s.castTime-.02);assert.equal(m.hp,hp);advance(g,.05);assert(m.hp<hp);const after=m.hp;g.cancelChannel();advance(g,.4);assert.equal(m.hp,after);assert.equal(g.player.channeling,null);
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
 const {g,m,s}=fixture('arcane_bolt',['returning_shot','terminal_burst']);g.executeSkill(s,aim);const pr=g.projectiles[0];pr.range=4;pr.speed=10;pr.vx=10;pr.vz=0;let hits=0;const original=g.hitMonster.bind(g);g.hitMonster=(m,a,o)=>{if(!o.secondary)hits++;return original(m,a,o);};for(let i=0;i<60;i++)g.updateProjectiles(.02);assert.equal(hits,2);assert.equal(g.projectiles.length,0);assert.equal(g.drainEvents().filter(e=>e.type==='burst'&&e.kind==='mod_burst').length,1);
});
test('chain return revisits only the first live target, and bleed does not crit or proc hits',()=>{
 const {g,m,s}=fixture('chain_spark',['chain_return']);g.player.targetId=m.id;g.executeSkill(s,aim);assert.equal(g.drainEvents().filter(e=>e.type==='hit').length,2);
 const a=fixture('slash',['laceration']);a.g.executeSkill(a.s,aim);assert(a.m.statuses.bleed);const t=a.m.statuses.bleed.t;a.g.tickStatuses(a.m,1.5);const events=a.g.drainEvents().filter(e=>e.type==='hit'&&e.dot);assert(events.length);assert(events.every(e=>!e.crit&&e.element==='physical'));assert(a.m.statuses.bleed.t<t);
});
test('status-consuming bursts consume once, and following fields remain one per slot with bounded slow',()=>{
 const a=fixture('firebolt',['status_burst']);a.m.statuses.burn={dps:5,t:3,owner:'player'};a.g.hitMonster(a.m,20,a.g.hitOpts(a.s));assert.equal(a.m.statuses.burn,undefined);assert.equal(a.g.drainEvents().filter(e=>e.type==='burst').length,1);
 const b=fixture('frost_nova',['status_burst']);b.m.statuses.chill={slow:.55,t:3};b.g.hitMonster(b.m,20,b.g.hitOpts(b.s));assert.equal(b.g.drainEvents().filter(e=>e.type==='burst').length,1);
 const {g,s,m}=fixture('test_mire',['following_field','binding_field']);g.executeSkill(s,aim);g.executeSkill(s,aim);assert.equal(g.areas.length,1);g.player.x=2;g.updateAreas(.5);assert.equal(g.areas[0].x,2);const slow=m.statuses.chill.slow;g.updateAreas(.5);assert(m.statuses.chill.slow>slow&&m.statuses.chill.slow<=.35);
});
test('curse spreads remaining time to one new target only; barrier break fires once',()=>{
 const {g,m,s}=fixture('hex',['spreading_hex']);g.executeSkill(s,aim);m.statuses.hex.t=2;const other={...m,id:999,x:3,statuses:{},hp:100};g.monsters.push(other);m.minion=true;g.killMonster(m);assert.equal(other.statuses.hex.t,2);g.killMonster(m);assert.equal(other.statuses.hex.t,2);
 const b=fixture('ward',['breaking_ward']);b.g.executeSkill(b.s,aim);const before=b.m.x;b.g.damagePlayer(1e4,null);assert(b.m.x>before);assert.equal(b.g.player.barrierBreak,null);
});
test('guardian summon shares one bounded hit, focus and commands change targeting without extra loadout slots',()=>{
 const {g,s,m}=fixture('stone_guardian',['guardian_bond','focused_pack']);g.spawnAllies(s,0,0);const a=g.allies[0],hp=a.hp;g.damagePlayer(40,null);assert(a.hp<hp);assert.equal(s.summon.damage,fixture('stone_guardian').s.summon.damage*.75);assert(g.commandAllies('attack',m.id));assert.equal(a.targetId,m.id);g.updateAllies(.02);assert.equal(a.targetId,m.id,'explicit command overrides automatic focus');assert.equal(g.commandAllies('attack',999),false);assert(g.commandAllies('follow'));assert.equal(a.targetId,null);assert(g.commandAllies('guard'));g.player.lastHitTarget=m.id;g.updateAllies(.1);assert.equal(a.targetId,null);g.time+=.7;g.updateAllies(.1);assert.equal(a.targetId,m.id);assert(g.commandAllies('guard'));assert.equal(g.ch.slots.length,4);
});
test('guard trigger consumes mana, respects weapon/requirements and cannot recurse',()=>{
 const {g,s}=fixture('arcane_bolt',['cast_on_guard']);const mp=g.player.mp;g.fireTriggers('on_guard');assert.equal(g.projectiles.length,1);assert.equal(g.player.mp,mp-s.cost);g.fireTriggers('on_guard');assert.equal(g.projectiles.length,1);g.player.triggerCd[0]=0;g.skills[0].requirementsMet=false;g.fireTriggers('on_guard');assert.equal(g.projectiles.length,1);g.skills[0].requirementsMet=true;g.triggering=true;g.fireTriggers('on_guard');assert.equal(g.projectiles.length,1);
});

test('unsupported delivery mods cannot silently consume sockets; supported rain echo and bash knock work',()=>{
 for(const [skill,mods]of Object.entries({riposte:['multistrike'],frontline_split:['multistrike','wide_arc','advancing_edge'],shield_bash:['spiked_ward'],stone_guardian:['spiked_ward'],crystal_wall:['echo','cast_on_dodge'],battle_aura:['cast_on_dodge'],armor_cleave:['echo']}))
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

test('widened single-skill mods work on their new skills, not just fit',()=>{
 // Spiked Ward + Breaking Ward on a riposte stance: taunt on stance, reflect the blocked part and push the crowd on a guard.
 {const {g,m,s}=fixture('riposte',['spiked_ward','breaking_ward']);const other=structuredClone(m);other.id=m.id+'b';other.x=1.5;other.z=1;other.statuses={};g.monsters.push(other);
  g.executeSkill(s,aim);assert.equal(m.forcedTargetId,g.player.id,'stance taunts nearby');
  const hp=m.hp,ox=other.x;g.damagePlayer(40,m);assert.ok(m.hp<hp,'blocked damage is reflected');assert.ok(other.x>ox,'guard pushes nearby monsters');}
 {const {g,m,s}=fixture('riposte');g.executeSkill(s,aim);const hp=m.hp;g.damagePlayer(40,m);assert.equal(m.hp,hp,'no reflect without the mod');}
 // Spreading Hex passes Armor Cleave's exposure to the nearest monster when the target dies.
 {const {g,m,s}=fixture('armor_cleave',['spreading_hex']);const other=structuredClone(m);other.id=m.id+'c';other.x=3;other.z=0.5;other.statuses={};g.monsters.push(other);
  g.executeSkill(s,aim);advance(g,s.castTime+.1);assert.ok(m.statuses.exposure?.spread>0,'exposure remembers the spread');m.hp=1;g.hitMonster(m,50,{element:'physical'});
  assert.ok(m.dead);assert.ok(other.statuses.exposure,'exposure spreads');assert.equal(other.statuses.exposure.t,m.statuses.exposure.t,'remaining time, not a refresh');}
 // Mending Chain on Healing Spring heals an injured ally standing just outside the field.
 {const {g,s}=fixture('healing_spring',['healing_chain']);g.spawnAllies(fixture('stone_guardian').s,0,0);const ally=g.allies[0];ally.x=s.radius+2;ally.z=0;ally.hp=ally.maxHp-80;
  g.executeSkill(s,aim);const spring=g.areas.find(a=>a.heal);spring.x=g.player.x;spring.z=g.player.z;const before=ally.hp;g.updateAreas(s.tick+.01);assert.ok(ally.hp>before,'chain reaches outside the field');}
 {const {g,s}=fixture('healing_spring');g.spawnAllies(fixture('stone_guardian').s,0,0);const ally=g.allies[0];ally.x=s.radius+2;ally.z=0;ally.hp=ally.maxHp-80;
  g.executeSkill(s,aim);const spring=g.areas.find(a=>a.heal);spring.x=g.player.x;spring.z=g.player.z;const before=ally.hp;g.updateAreas(s.tick+.01);assert.equal(ally.hp,before,'no chain without the mod');}
});

test('Fire Shift burns the target and leaves nothing on the ground',()=>{
 const {g,m,s}=fixture('hunter_shot',['fire_shift']);assert.equal(s.element,'fire');assert.ok(s.burnChance>0);assert.equal(s.chill,null);
 g.rng.chance=()=>true;g.hitMonster(m,20,g.hitOpts(s));assert.equal(m.statuses.burn?.owner,'player');
 g.executeSkill(s,aim);for(let i=0;i<40;i++)g.updateProjectiles(.02);assert.equal(g.areas.length,0,'no field is spawned');
 const both=fixture('slash',['frost_shift']);assert.ok(both.s.chill);const fire=fixture('slash',['fire_shift']);assert.equal(fire.s.chill,null,'fire brings no chill');assert.equal(fire.s.element,'fire');
 assert.equal(modFits(data.skills.combat.frost_nova,data.mods.mods.fire_shift).reason,'not','spells keep their own element');
 assert.equal(modFits(data.skills.combat.slash,data.mods.mods.fire_shift,[data.mods.mods.frost_shift]).reason,'family');
});

test('phase 2c mods: poison shift, wide field, building power and momentum change behaviour',()=>{
 const S=data.skills.combat,M=data.mods.mods;
 // Poison Shift: element family, converts part of the hit to the target's poison and keeps the total.
 {const {g,m,s}=fixture('hunter_shot',['poison_shift']);assert.equal(s.element,'poison');assert.equal(s.chill,null);assert.equal(s.burnChance,0);
  const plain=fixture('hunter_shot').s;assert.ok(Math.abs(s.damage/plain.damage-0.8)<1e-9);
  g.hitMonster(m,40,g.hitOpts(s));assert.equal(m.statuses.poison?.owner,'player');assert.ok(Math.abs(m.statuses.poison.dps*3-40/0.8*0.2)<1e-9,'converted part over 3 s');
  assert.equal(modFits(S.slash,M.poison_shift,[M.frost_shift]).reason,'family');}
 // Wide Field: wider circle, weaker effect, and never with Concentrated Effect.
 {const base=fixture('frost_nova').s,wide=fixture('frost_nova',['wide_field']).s;assert.ok(Math.abs(wide.radius/base.radius-1.3)<1e-9);assert.ok(Math.abs(wide.damage/base.damage-0.9)<1e-9);
  const cry=fixture('war_cry',['wide_field']).s,cry0=fixture('war_cry').s;assert.ok(Math.abs(cry.damageBuff/cry0.damageBuff-0.9)<1e-9);assert.ok(cry.radius>cry0.radius);
  const aura=fixture('battle_aura',['wide_field']).s,aura0=fixture('battle_aura').s;assert.ok(aura.aura.mpRegen<aura0.aura.mpRegen);assert.equal(fixture('battle_aura').s.aura.mpRegen,S.battle_aura.aura.mpRegen,'data is not mutated');
  assert.equal(modFits(S.frost_nova,M.wide_field,[M.concentrated]).reason,'family');assert.equal(modFits(S.slash,M.wide_field).ok,false);}
 // Building Power: a stronger but slower full charge; a channel that grows while held.
 {const {s}=fixture('charged_shot',['ramp_cast']),plain=fixture('charged_shot').s;assert.ok(s.charge.maxDamageMult>plain.charge.maxDamageMult);assert.ok(s.charge.duration>plain.charge.duration);
  assert.equal(data.skills.combat.charged_shot.charge.duration,1.2,'data is not mutated');
  const pulse=(mods,held)=>{const {g,m,s}=fixture('flame_stream',mods);g.executeSkill(s,aim);const c=g.player.channeling;c.t=held;c.next=held;const hp=m.hp;tickFrontier(g,0);return hp-m.hp;};
  const early=pulse(['ramp_cast'],0),late=pulse(['ramp_cast'],3),plainHit=pulse([],0);assert.ok(early<plainHit,'starts weaker');assert.ok(late>plainHit,'grows past the plain channel');}
 // Momentum: the next cast within the window is quicker, once.
 {const {g,ch}=fixture('slash');ch.mods.push({id:'momentum',uid:950,level:1,grade:'C'});ch.movementMods=[950];g.refresh();g.player.movement.charges=2;
  assert.ok(g.move.momentum);const normal=g.skills[0].castTime;assert.ok(g.useMovement());g.player.dash=null;
  assert.ok(g.castSlot(0));assert.ok(Math.abs(g.player.cast.total-normal/1.2)<1e-9);g.player.cast=null;g.player.cooldowns[0]=0;
  assert.ok(g.castSlot(0));assert.equal(g.player.cast.total,normal,'only the next cast');}
});
test('the slam stun knocks a shelled monster out of its shell; passive poison never wipes Venom Arrow stacks',()=>{
 const {g,m,s}=fixture('interrupt_slam');m.state='shell';m.shell=true;g.executeSkill(s,aim);assert.equal(m.state,'stunned');assert.equal(m.shell,false,'no shell damage reduction after the stun');
 const v=fixture('venom_mire');v.g.derived.poisonChancePct=100;
 for(let i=0;i<5;i++)v.g.hitMonster(v.m,20,v.g.hitOpts(v.s));
 assert.equal(v.m.statuses.poison.stacks,5,'a guaranteed passive proc keeps the five stacks');
});
test('a released charged shot announces its charge on castStart',()=>{
 const {g}=fixture();assert(g.castSlot(0));advance(g,.6);g.drainEvents();assert(g.releaseCharge(0));
 const start=g.drainEvents().find(e=>e.type==='castStart');assert(Math.abs(start.charge-.5)<.02,String(start.charge));
});

// Specialist mods for the stream, the lane and the chain (owner, 2026-10-27: at least three per skill type).
const more=(g,m,list)=>list.map(([x,z],i)=>{const o=structuredClone(m);o.id=m.id+'_'+i;o.x=x;o.z=z;o.statuses={};g.monsters.push(o);return o;});
const hits=(g)=>g.drainEvents().filter(e=>e.type==='hit');
test('channel mods fit any channel by its type tag, reshape whatever shape it has, and Release Burst pays for a held channel only',()=>{
 const beam={tags:['Spell','Channel','Lightning','Damage']};
 for(const id of ['wide_stream','long_stream','release_burst'])assert(modFits(beam,data.mods.mods[id]).ok,'a beam channel takes '+id);
 const lane={width:2,range:6};compileFrontier(lane,{},[{mod:data.mods.mods.wide_stream,level:1}]);assert.equal(lane.width,3);assert.equal(lane.range,6*.85);
 const base=fixture('flame_stream').s,wide=fixture('flame_stream',['wide_stream']).s,long=fixture('flame_stream',['long_stream']).s;
 assert(wide.arc>base.arc&&wide.range<base.range&&long.arc<base.arc&&long.range>base.range&&long.damage>base.damage);
 assert.equal(modFits(data.skills.combat.flame_stream,data.mods.mods.wide_stream,[data.mods.mods.long_stream]).reason,'family');
 for(const [held,bursts] of [[1.2,1],[0.3,0]]){
  const {g,s}=fixture('flame_stream',['release_burst']);g.castSlot(0);advance(g,s.castTime+held);g.drainEvents();g.cancelChannel();
  assert.equal(g.drainEvents().filter(e=>e.type==='burst'&&e.kind==='release_burst').length,bursts,'held '+held);
 }
});
test('lane mods: Long Rend reaches farther, Far End hits hardest at the end, Staggering Line stuns',()=>{
 {const a=fixture('frontline_split'),b=fixture('frontline_split',['long_rend']);for(const f of [a,b]){f.m.x=6;f.g.executeSkill(f.s,aim);}
  assert.equal(a.m.hp,a.m.maxHp);assert(b.m.hp<b.m.maxHp);assert(b.s.width<a.s.width);}
 {const {g,m,s}=fixture('frontline_split',['tip_strike']);m.x=1.5;const far=more(g,m,[[4.5,0]])[0];g.executeSkill(s,aim);const h=hits(g);
  const near=h.find(e=>e.id===m.id).amount,end=h.find(e=>e.id===far.id).amount;assert(Math.abs(end/near-data.mods.mods.tip_strike.effect.tipMult[0])<0.01,'hits are rounded');}
 for(const boss of [false,true]){const {g,m,s}=fixture('frontline_split',['quake_line']);m.boss=boss;g.executeSkill(s,aim);assert.equal(m.state,'stunned');assert.equal(m.stateDur,boss?data.mods.mods.quake_line.effect.lineStunBoss:data.mods.mods.quake_line.effect.lineStun[0]);}
});
test('chain mods: Conductive Arc keeps its strength over shorter jumps, Forking Arc branches once per hop, Arresting Arc stuns the last',()=>{
 {const {g,m,s}=fixture('chain_spark',['conductive']);g.player.targetId=m.id;more(g,m,[[4,0],[6,0],[10,0]]);g.executeSkill(s,aim);const h=hits(g);
  assert.equal(h.length,3,'the 4 m gap is too far for a conductive jump');assert(h.every(e=>Math.abs(e.amount-h[0].amount)<1e-6));}
 {const {g,m,s}=fixture('chain_spark',['fork_chain']);g.player.targetId=m.id;more(g,m,[[3,0],[2,2]]);g.executeSkill(s,aim);const ev=g.drainEvents();
  assert.equal(ev.filter(e=>e.type==='hit').length,3);assert.equal(ev.filter(e=>e.type==='chain'&&e.from).length,1);}
 {const {g,m,s}=fixture('chain_spark',['stun_arc']);g.player.targetId=m.id;const [b]=more(g,m,[[4,0]]);g.executeSkill(s,aim);assert.notEqual(m.state,'stunned');assert.equal(b.state,'stunned');}
 {const {g,m,s}=fixture('chain_spark',['stun_arc']);g.player.targetId=m.id;g.executeSkill(s,aim);assert.equal(m.state,'stunned','a lone target is the last one');}
});
