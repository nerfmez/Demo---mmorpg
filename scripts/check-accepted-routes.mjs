import {loadData} from '../src/core/data-node.js';
import {createWorld} from '../src/core/world.js';
import {Game} from '../src/core/game.js';
const data=loadData(),world=createWorld(data.world);let samples=0,failures=[];
for(const road of world.roads.filter(r=>r.acceptedScene))for(let i=0;i<road.points.length-1;i++){
 const a=road.points[i],b=road.points[i+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(d/.25));
 for(let k=0;k<=n;k++){
  const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n;
  const next=k===n?[x,z]:[a[0]+(b[0]-a[0])*(k+1)/n,a[1]+(b[1]-a[1])*(k+1)/n];
  if(!world.isFree(x,z,.45)||world.tooSteep(x,z,...next)||world.tooSteep(...next,x,z))failures.push({road:road.id,x,z,water:world.isWater(x,z,.15),solid:world.circles.filter(c=>Math.hypot(c.x-x,c.z-z)<c.r+.45).map(c=>({type:c.type,scene:c.sceneId,r:c.r,x:c.x,z:c.z})),dy:world.groundY(...next)-world.groundY(x,z)});
  samples++;
 }
}
console.log(JSON.stringify({samples,failures:failures.length,byRoad:failures.reduce((o,f)=>(o[f.road]=(o[f.road]||0)+1,o),{})},null,2));
import {writeFileSync} from 'node:fs';writeFileSync(new URL('../route-failures.json',import.meta.url),JSON.stringify(failures,null,2));
for(const p of[data.world.playerSpawn,...Object.values(data.world.wreck.weapons),...data.world.waypoints.map(w=>[w.pos[0],w.pos[1]+2.2])])console.log('service',p,{free:world.isFree(...p,.45),y:world.groundY(...p),water:world.isWater(...p)});
