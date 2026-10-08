// Opt-in rule preview for the new content; isolated, never saved, no recipes.
import {data} from '../data.js';
import {Game} from '../core/game.js';
import {createCharacter,equip} from '../core/character.js';
import {tickFrontier} from '../core/frontier-content.js';
import {modFits,modDef} from '../core/skills.js';
export function previewMods(id,selected=[]){
 const def=data.skills.combat[id];
 return Object.keys(data.mods.mods).filter(key=>modFits(def,modDef(data,key),selected.map(k=>modDef(data,k))).ok);
}
export function createRulesPreview(id,weapon,distance,mods=[]){
 const ch=createCharacter(data,{kit:'bow'});ch.stats={STR:50,AGI:50,VIT:50,INT:50,DEX:50};ch.skills[id]=1;
 ch.mods=mods.map(key=>({id:key,uid:ch.nextUid++,level:1,grade:'C'}));ch.slots=ch.slots.map((_,i)=>({skill:i===0?id:null,mods:i===0?ch.mods.map(m=>m.uid):[]}));
 ch.equipped.weapon=ch.equipped.offhand=null;
 for(const type of [weapon,...(id==='shield_bash'?['shield']:[])]){
  const entry=Object.entries(data.items.gearBases).find(([,d])=>(d.weaponType||d.offhandType)===type);
  if(entry){const it={uid:ch.nextUid++,base:entry[0],grade:'C',itemLevel:1,upgrade:0,options:[]};ch.gear.push(it);equip(ch,data,it.uid);}
 }
 const g=new Game(data,{character:ch,seed:71});
 Object.assign(g.player,{x:0,z:0,facing:-Math.PI/2,hp:g.player.maxHp*.65});
 const m=g.monsters[0];Object.assign(m,{x:-distance,z:0,hp:100000,maxHp:100000,defense:0,aggro:true,boss:false,dead:false,statuses:{},facing:Math.PI/2});g.monsters=[m];g.player.targetId=m.id;
 g.world={surfaceY:()=>0,groundY:()=>0,isFree:()=>true,move:(x,z,r,dx,dz)=>({x:x+dx,z:z+dz,blocked:false}),seams:[],bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40}};
 g.isSafe=()=>false;g.nearby=()=>({inTown:false});g.drainEvents();
 g.previewStep=dt=>{
  g.time+=dt;const due=[];g.pending=g.pending.filter(q=>{q.t-=dt;if(q.t<=0){due.push(q.fn);return false;}return true;});for(const fn of due)fn();
  tickFrontier(g,dt);g.updatePlayer(dt);g.updateAllies(dt);g.updateProjectiles(dt);g.updateAreas(dt);g.tickStatuses(m,dt);
 };
 return g;
}
