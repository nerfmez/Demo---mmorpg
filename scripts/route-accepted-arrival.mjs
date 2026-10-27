// Offline authoring on the final terrain. Reuse the game's physical path search;
// never keep the old diagonal road through the newly accepted beach cliffs.
import {readFileSync,writeFileSync} from 'node:fs';
import {loadData} from '../src/core/data-node.js';
import {createWorld} from '../src/core/world.js';
import {findQuestRoute,routeSegmentClear} from '../src/core/quest-route.js';
const path=new URL('../data/world.json',import.meta.url),raw=JSON.parse(readFileSync(path)),w=createWorld(loadData().world),start={x:raw.playerSpawn[0],z:raw.playerSpawn[1]},destination=raw.roads.find(r=>r.id==='arrival').points.at(-1),goal={spatial:true,x:destination[0],z:destination[1]};
const navigation={...w,isFree(x,z,r,opts){return w.isFree(x,z,Math.max(r,.70),opts);},move(x,z,r,dx,dz,opts){r=Math.max(r,.70);const back=w.move(x+dx,z+dz,r,-dx,-dz,opts);if(Math.hypot(back.x-x,back.z-z)>.01)return{x,z,blocked:true};return w.move(x,z,r,dx,dz,opts);}};
const guide=findQuestRoute(navigation,start,goal,{cell:1,maxNodes:80000});
if(guide.length<2)throw Error('No physical arrival-to-town route');
for(let i=1;i<guide.length;i++)if(!routeSegmentClear(w,guide[i-1],guide[i])||!routeSegmentClear(w,guide[i],guide[i-1]))throw Error('Arrival route fails bidirectional walking');
const points=guide.map(p=>[Math.round(p.x*1000)/1000,Math.round(p.z*1000)/1000]),road={id:'arrival',width:4.5,points,acceptedScene:'arrival'};
for(const r of raw.roads)if(r.id==='arrival')r.id='arrival/retained';raw.roads=raw.roads.filter(r=>r.acceptedScene!=='arrival');raw.roads.unshift(road);
raw.acceptedScenes.clearanceRoads=[{...road,points:road.points.filter(p=>p[0]<-10)}];raw.safeRoutes=(raw.safeRoutes||[]).filter(r=>r.id!=='accepted-arrival');raw.safeRoutes.push({...road,id:'accepted-arrival',width:6});
writeFileSync(path,JSON.stringify(raw,null,2)+'\n');console.log({arrivalGuidePoints:points.length,from:points[0],to:points.at(-1)});
