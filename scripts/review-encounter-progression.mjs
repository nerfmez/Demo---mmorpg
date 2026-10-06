// Read-only, reproducible progression review. Never changes authored content or saves.
// Initial positions/levels and finite preparation budgets are fixtures, NOT an end-to-end farming playthrough.
// Boss summons remain active; other standing spawns are isolated for DUELS (not proof against whole camps).
// First valid C-grade seed is recorded. No high grades, upgrades, free healing or infinite ammo.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadData} from '../src/core/data-node.js';
import {createWorld} from '../src/core/world.js';
import {Game} from '../src/core/game.js';
import {createRng} from '../src/core/rng.js';
import {createCharacter,jobNodeState,allocateJobNode,gearRequirements,gearEquipState,arrowTotal} from '../src/core/character.js';
import {craft,rollGear,rollDrops} from '../src/core/crafting.js';
import {buyConsumable} from '../src/core/consumables.js';
const data=loadData();
const worlds=Object.fromEntries(Object.entries(data.maps).map(([id,w])=>[id,createWorld(w)]));
const gearPlans={
  1:{},
  6:{weapon:{sword:'tusk_blade',bow:'hunter_bow',staff:'tide_staff'},armor:'hide_vest',helm:'crabshell_helm',gloves:'shell_mitts',boots:'salt_boots',charm:'pearl_pendant'},
  11:{weapon:{sword:'wolfbite_sword',bow:'fang_bow',staff:'spore_staff'},armor:'shell_guard',helm:'beetle_helm',gloves:'wolf_grips',boots:'wolf_boots',charm:'spore_amulet'},
  16:{weapon:{sword:'frontier_kris',bow:'dusk_longbow',staff:'tidecaller_staff'},armor:'ranger_coat',helm:'ranger_hood',gloves:'brigand_gloves',boots:'trail_boots',charm:'spore_amulet'},
  25:{weapon:{sword:'oathblade',bow:'skyrender_bow',staff:'wisp_staff'},armor:'crag_plate',helm:'feather_circlet',gloves:'crag_gauntlets',boots:'crag_greaves',charm:'golem_amulet'},
  21:{weapon:{sword:'stormglass_blade',bow:'storm_bow',staff:'wisp_staff'},armor:'storm_mantle',helm:'feather_circlet',gloves:'wisp_wraps',boots:'trail_boots',charm:'wisp_pendant'}
};
export function hero(level,kit){
 const ch=createCharacter(data,{kit,name:'audit-'+kit});ch.level=level;ch.statPoints=data.progression.character.startingStatPoints+(level-1)*data.progression.character.statPointsPerLevel;
 ch.movement='roll';ch.jobNodes=['origin'];ch.jobPoints=level-1;ch.jobLevel=level;
 const tier=level>=25?25:level>=21?21:level>=14?16:level; const plan=gearPlans[tier],recipeIds=[],bill={},rolls=[];
 for(const [slot,choice]of Object.entries(plan)){
  const recipeId=typeof choice==='string'?choice:choice[kit],rec=data.recipes.recipes[recipeId];if(!rec)throw Error(recipeId);
  ch.gold=rec.cost.gold||0;ch.materials={};for(const [m,n]of Object.entries(rec.cost))if(m!=='gold')ch.materials[m]=n;
  let rollSeed=1;while(rollGear(data,rec,createRng(rollSeed)).grade!=='C'&&rollSeed<1000)rollSeed++;
  const result=craft(ch,data,recipeId,createRng(rollSeed));if(!result.ok)throw Error('craft failed '+recipeId);
  const item=ch.gear.at(-1);if(item.grade!=='C')throw Error('non-C fixture');rolls.push({recipe:recipeId,seed:rollSeed,grade:item.grade,upgrade:item.upgrade,options:item.options});ch.equipped[slot]=item.uid;recipeIds.push(recipeId);for(const [m,n]of Object.entries(rec.cost))bill[m]=(bill[m]||0)+n;
 }
 const allowed=new Set(['lesson.prepare','lesson.strike','lesson.rhythm','lesson.care','lesson.shelter','f_hp','f_def','f_atk','f_mp','f_mag',...(kit==='sword'?['v1','v2','v5','v6']:kit==='bow'?['r1','r2','r5','r6']:['a1','a2','a5','a6'])]);
 while(ch.jobPoints>0){const id=[...allowed].find(id=>jobNodeState(ch,data,id).can);if(!id)break;allocateJobNode(ch,data,id);}
 const primary=kit==='staff'?'INT':kit==='bow'?'DEX':'STR';
 for(const item of ch.gear.filter(x=>Object.values(ch.equipped).includes(x.uid))){const req=gearRequirements(item,data);for(const [key,n]of Object.entries(req)){if(key==='level')continue;const need=Math.max(0,n-ch.stats[key]);ch.stats[key]+=need;ch.statPoints-=need;}}
 if(ch.statPoints<0)throw Error('unwearable '+kit+' '+level);
 for(let n=0;ch.statPoints>0;n++){const key=n%3===2?'VIT':primary;ch.stats[key]++;ch.statPoints--;}
 for(const item of ch.gear.filter(x=>Object.values(ch.equipped).includes(x.uid)))if(!gearEquipState(ch,data,item).ok)throw Error('bad wear '+item.base);
 if(level>=14&&kit==='staff'){for(const [slot,id] of [[2,'learn_healing_spring'],[3,'learn_frost_nova']]){const rec=data.recipes.recipes[id];ch.gold=rec.cost.gold;ch.materials={...rec.cost};delete ch.materials.gold;const result=craft(ch,data,id,createRng(7));if(!result.ok)throw Error('learn failed');ch.slots[slot]={skill:rec.result,mods:[]};recipeIds.push(id);for(const [key,n]of Object.entries(rec.cost))bill[key]=(bill[key]||0)+n;}}
 if(level>=14){ch.gold=240;buyConsumable(ch,data,'hp_potion_m',5);buyConsumable(ch,data,'mp_potion_m',3);ch.quickItems=['hp_potion_m','mp_potion_m',null,null];bill.gold=(bill.gold||0)+240;if(kit==='bow'){const rec=data.recipes.recipes.arrows_feather;while(arrowTotal(ch)<400){ch.gold=rec.cost.gold||0;for(const [key,n] of Object.entries(rec.cost))if(key!=='gold')ch.materials[key]=(ch.materials[key]||0)+n;const before=arrowTotal(ch);const res=craft(ch,data,'arrows_feather',createRng(7));if(!res.ok||arrowTotal(ch)<=before)throw Error('arrow refill '+JSON.stringify(res));for(const [k,n]of Object.entries(rec.cost))bill[k]=(bill[k]||0)+n;}}}
 return {ch,recipeIds,bill,rolls};
}
export function fight({kit,level,monster,map,zone,sourceLevel,seed=7,seconds=180}){
 const {ch,recipeIds,bill,rolls}=hero(level,kit),w=worlds[map],d={...data,world:w.data};
 const g=new Game(d,{world:w,character:ch,seed});
 const sp=g.spawnPoints.find(p=>p.monster===monster&&p.zone===zone);if(!sp)throw Error('no spawn '+monster+' '+zone);
 g.monsters=[];g.spawnPoints=[];g.spawnAt({...sp,level:[sourceLevel,sourceLevel],respawn:9999,entity:null});
 const m=g.monsters[0];g.spawnPoints=[];
 const attackSlot=g.ch.slots.findIndex(s=>s.skill==={sword:'slash',bow:'hunter_shot',staff:'firebolt'}[kit]);
 const wardSlot=g.ch.slots.findIndex(s=>s.skill==='ward');
 const distance=kit==='sword'?m.r+1.5:8;let pos=null;
 for(let i=0;i<24;i++){let a=i*Math.PI/12,x=m.x+Math.sin(a)*distance,z=m.z+Math.cos(a)*distance;if(w.isFree(x,z,.45)&&!w.isSafe(x,z)){pos={x,z};break;}}
 if(!pos)throw Error('no fight start '+monster);Object.assign(g.player,pos);g.refresh(true);
 const starting={jobNodes:[...g.ch.jobNodes],hp:g.player.maxHp,mp:g.player.maxMp,stats:{...g.ch.stats},gear:g.ch.gear.filter(x=>Object.values(g.ch.equipped).includes(x.uid)).map(x=>({base:x.base,grade:x.grade,upgrade:x.upgrade}))};
 let evadeUntil=0,evade={x:0,z:0},lastTell=null,hits=0,totalTaken=0,dodges=0,shots=0,lowest=g.player.hp,failed=0;
 const startArrows=arrowTotal(ch); // existing starter stock, never replenished during combat
 for(let i=0;i<seconds*30&&!m.dead&&!g.player.dead;i++){
  const p=g.player,enemy=g.monsters.filter(x=>!x.dead&&x.minion).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]||m,dx=enemy.x-p.x,dz=enemy.z-p.z,dist=Math.hypot(dx,dz),nx=dx/(dist||1),nz=dz/(dist||1);
  const tell=enemy.windup,attack=tell&&enemy.def.attacks[tell.name];
  if(p.hp<p.maxHp*.55)g.useQuickItem(0); if(p.mp<p.maxMp*.2)g.useQuickItem(1);
  if(tell&&tell!==lastTell&&enemy.stateT>=Math.max(.18,tell.total*.55)){
   lastTell=tell;const area=attack.radius||attack.r||0;
   if(area>2){evade={x:-nx,z:-nz};evadeUntil=g.time+Math.min(1.4,tell.total-enemy.stateT+.7);}
   else{const side=i%2?1:-1;evade={x:nz*side,z:-nx*side};evadeUntil=g.time+Math.max(.6,tell.total-enemy.stateT+.5);}
   const trial={x:p.x+evade.x*g.move.distance,z:p.z+evade.z*g.move.distance};
   if(Math.hypot(trial.x-m.homeX,trial.z-m.homeZ)>m.def.leashRange-4){const hx=p.x-m.homeX,hz=p.z-m.homeZ,h=Math.hypot(hx,hz)||1;evade={x:-hz/h,z:hx/h};}
   g.setMove(evade.x,evade.z);if(p.movement.charges>=1){g.useMovement();dodges++;}
  }
  if(g.time<evadeUntil)g.setMove(evade.x,evade.z);
  else{
   const desired=kit==='sword'?enemy.r+.65:6;
   if(dist>desired+(kit==='sword'?.15:1))g.setMove(nx,nz);else if(kit!=='sword'&&dist<4)g.setMove(-nx,-nz);else g.setMove(0,0);
   g.setAimPoint(enemy.x,enemy.z);
   if(!p.cast&&!p.dash){if(kit==='staff'&&level>=14&&p.hp<p.maxHp*.75&&p.cooldowns[2]<=0&&p.mp>=g.skills[2].cost)g.castSlot(2,{x:p.x,z:p.z});else if(kit==='staff'&&level>=14&&g.monsters.some(e=>!e.dead&&e.minion&&Math.hypot(e.x-p.x,e.z-p.z)<4)&&p.cooldowns[3]<=0&&p.mp>=g.skills[3].cost)g.castSlot(3);else if(wardSlot>=0&&p.barrier<8&&p.cooldowns[wardSlot]<=0&&p.mp>=g.skills[wardSlot].cost)g.castSlot(wardSlot);else if(dist < g.skills[attackSlot].range+enemy.r+.4 && g.castSlot(attackSlot,{x:enemy.x,z:enemy.z}))shots++;}
  }
  if(!p.dash&&Math.hypot(p.x-m.homeX,p.z-m.homeZ)>m.def.leashRange-6){g.setMove(m.homeX-p.x,m.homeZ-p.z);evadeUntil=0;}
  g.update(1/30);lowest=Math.min(lowest,p.hp);for(const e of g.drainEvents()){if(e.type==='playerHit'){hits++;totalTaken+=e.amount;}if(e.type==='fail')failed++;}
 }
 return {kit,level,monster,map,zone,sourceLevel,seed,won:m.dead&&!g.player.dead,dead:g.player.dead,time:+g.time.toFixed(2),hpRemaining:+g.player.hp.toFixed(1),lowestHp:+lowest.toFixed(1),enemyRemaining:Math.round(m.hp),totalTaken,hits,dodges,casts:shots,arrowsSpent:startArrows-arrowTotal(g.ch),remainingConsumables:g.ch.consumables,remainingMp:+g.player.mp.toFixed(1),failures:failed,pregear:recipeIds,pregearBill:bill,rolls,starting};
}

export function fixtureAccess(level,kit){
 const prepared=hero(level,kit),sources={};
 for(const [map,wd]of Object.entries(data.maps))for(const s of wd.spawns){
  const drops=[...data.monsters.monsters[s.monster].drops,...wd.zoneDrops?.[s.zone]||[],...data.items.upgradeMaterialDrops];
  for(const d of drops)if(d.chance>0&&d.max>0)(sources[d.item]||=[]).push({map,zone:s.zone,monster:s.monster,maxLevel:s.level[1]});
 }
 const ingredients=Object.entries(prepared.bill).filter(([id])=>id!=='gold').map(([id,quantity])=>({id,quantity,source:(sources[id]||[]).filter(s=>s.maxLevel<level).sort((a,b)=>a.maxLevel-b.maxLevel)[0]||null}));
 return {level,kit,recipes:prepared.recipeIds,bill:prepared.bill,rolls:prepared.rolls,ingredients,allSourcesEarlier:ingredients.every(x=>x.source)};
}
export function runReview(){
 const scenarios=[
  [1,'salt_slime','azure-harbor-v1','coast',1],[1,'reef_crab','azure-harbor-v1','coast',2],
  [1,'shore_gull','azure-harbor-v1','coast',2],[1,'tusk_boar','azure-harbor-v1','meadow',3],
  [1,'sporecap','azure-harbor-v1','glade',4],[6,'moss_beetle','azure-harbor-v1','forest',7],
  [6,'thornback_wolf','azure-harbor-v1','forest',7],[6,'hermit_crab','azure-harbor-v1','headland',8],
  [11,'thicket_mantis','frontier-wilds-v1','forest',12],[14,'greyfang','frontier-wilds-v1','wolf_den',14],
  [16,'ironhorn_ram','frontier-wilds-v1','highlands',21],[16,'crag_golem','frontier-wilds-v1','highlands',21],
  [16,'duskmane_stalker','frontier-wilds-v1','highlands',21],[21,'rune_sentinel','frontier-wilds-v1','ruins',24],
  [25,'horned_warden','frontier-wilds-v1','ruins',25]];
 const results=[];for(const [level,monster,map,zone,sourceLevel]of scenarios)for(const kit of ['sword','bow','staff'])for(const seed of [7,19,41])results.push(fight({kit,level,monster,map,zone,sourceLevel,seed,seconds:210}));
 return {method:'Actual simulation and map geometry. Three scripted representative starter-kit paths, three fixed seeds. All failures retained. DUELS isolate standing neighbours, not boss summons. These are not human win rates or full farming runs.',
  fixtureAccess:[1,6,11,14,16,21,25].flatMap(level=>['sword','bow','staff'].map(kit=>fixtureAccess(level,kit))),results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const out=process.argv[2]||'progression-review.json',report=runReview();fs.writeFileSync(out,JSON.stringify(report,null,2));
 console.log(JSON.stringify({out,cases:report.results.length,won:report.results.filter(r=>r.won).length,notWon:report.results.filter(r=>!r.won).length,allPreparationSourcesEarlier:report.fixtureAccess.every(r=>r.allSourcesEarlier)},null,2));
}
