import fs from 'node:fs';import {loadData} from '../src/core/data-node.js';
import {createWorld} from '../src/core/world.js';
import {Game} from '../src/core/game.js';
import {hero} from './review-encounter-progression.mjs';
const data=loadData(),reports=[];
const scenarios=[['azure-harbor-v1','headland','hermit_crab'],['azure-harbor-v1','forest','sporecap'],['frontier-wilds-v1','coast','reef_crab'],['frontier-wilds-v1','wetland','sporecap'],['frontier-wilds-v1','highlands','ironhorn_ram']];
for(const [map,zone,type]of scenarios){
 const wd=data.maps[map],w=createWorld(wd),g=new Game({...data,world:wd},{world:w,seed:19,character:hero(25,'sword').ch});
 function line(a,b){let [x,z]=a;const n=Math.ceil(Math.hypot(b[0]-x,b[1]-z)/.3),dx=(b[0]-x)/n,dz=(b[1]-z)/n;for(let i=0;i<n;i++){const p=w.move(x,z,.45,dx,dz);if(Math.hypot(p.x-x-dx,p.z-z-dz)>.1)return false;x=p.x;z=p.z;}return true;}
 let selected=null;
 for(const m of g.monsters.filter(m=>m.type===type&&m.zone===zone)){
  for(let i=0;i<32;i++){const a=i*Math.PI/16,dx=Math.cos(a),dz=Math.sin(a),far=m.def.leashRange+m.def.aggroRange+6;
   const start=[m.x+dx*3,m.z+dz*3],goal=[m.x+dx*far,m.z+dz*far];
   if(!w.isFree(...start,.45)||w.isSafe(...start)||!w.isFree(...goal,.45)||!line(start,goal))continue;selected={m,start,goal};break;
  }if(selected)break;
 }
 if(!selected){reports.push({map,zone,type,ok:false,reason:'No clear straight test corridor found; not a gameplay failure'});continue;}
 const {m,start,goal}=selected;Object.assign(g.player,{x:start[0],z:start[1]});g.refresh(true);g.drainEvents();
 let aggro=false,returnStarted=false,returned=false,reachedGoal=false,hits=0,damage=0,maxHomeDistance=0,trail=[];
 for(let i=0;i<1200&&!g.player.dead&&!returned;i++){
  const p=g.player,dist=Math.hypot(goal[0]-p.x,goal[1]-p.z);
  if(dist>.4)g.setMove(goal[0]-p.x,goal[1]-p.z);else{g.setMove(0,0);reachedGoal=true;}
  g.update(.05);for(const e of g.drainEvents())if(e.type==='playerHit'){hits++;damage+=e.amount;}
  if(m.aggro)aggro=true;if(m.state==='return')returnStarted=true;
  const dh=Math.hypot(m.x-m.homeX,m.z-m.homeZ);maxHomeDistance=Math.max(maxHomeDistance,dh);
  if(returnStarted&&dh<1)returned=true;
  if(i%10===0)trail.push({t:+g.time.toFixed(2),player:[+p.x.toFixed(2),+p.z.toFixed(2)],monster:[+m.x.toFixed(2),+m.z.toFixed(2)],state:m.state});
 }
 reports.push({map,zone,type,ok:aggro&&returnStarted&&returned&&!g.player.dead,aggro,returnStarted,returned,reachedGoal,dead:g.player.dead,start,goal,home:[m.homeX,m.homeZ],leashRange:m.def.leashRange,maxHomeDistance:+maxHomeDistance.toFixed(2),hits,damage,elapsed:+g.time.toFixed(2),trail});
}
fs.writeFileSync(process.argv[2] || 'pursuit-review.json',JSON.stringify({method:'Actual full-population simulation. Only the initial fixture position is set; retreat then uses normal setMove/update and a prechecked straight walkable route. Legal Lv25 C/+0 sword fixture is used to observe AI, NOT to prove low-level material accessibility. No invulnerability or mid-fight position teleport. Damage and every failure are retained.',results:reports},null,2));
console.log(reports.map(({trail,...r})=>r));
