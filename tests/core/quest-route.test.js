import test from 'node:test';
import assert from 'node:assert/strict';
import {findQuestRoute,routeSegmentClear,searchQuestRoute,createQuestRouteCache} from '../../src/core/quest-route.js';
import {questNavigation} from '../../src/core/quest-navigation.js';
import {data} from './helpers.js';
import {Game} from '../../src/core/game.js';
import {createWorld} from '../../src/core/world.js';
const wallWorld=closed=>({bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},isFree(x,z,r){return !(Math.abs(x)<1+r&&Math.abs(z)<(closed?20:4)+r);},move(x,z,r,dx,dz){return {x:x+dx,z:z+dz};}});
test('route detours around blocked walking space; all compressed segments retain clearance',()=>{
 const world=wallWorld(false),start={x:-8,z:0},target={spatial:true,x:8,z:0},path=findQuestRoute(world,start,target);
 assert.ok(path.length>2);assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),{x:8,z:0});
 for(let i=1;i<path.length;i++)assert.ok(routeSegmentClear(world,path[i-1],path[i]));
 assert.deepEqual(findQuestRoute(wallWorld(true),start,target,{maxNodes:300}),[],'no straight fallback through wall');
 assert.deepEqual(findQuestRoute(world,start,{spatial:false}),[]);
});
test('route obeys slope movement rejection as well as free standing space',()=>{
 const w=wallWorld(false);w.isFree=()=>true;w.move=(x,z,r,dx,dz)=>x<0&&x+dx>=0?{x,z}:{x:x+dx,z:z+dz};
 assert.deepEqual(findQuestRoute(w,{x:-8,z:0},{spatial:true,x:8,z:0},{maxNodes:400}),[]);
});
test('real shore target is walkable; remote quest uses actual crossing rather than line to other map',()=>{
 const g=new Game(data,{seed:2});g.worlds=Object.fromEntries(Object.entries(data.maps).map(([id,map])=>[id,createWorld(map)]));
 const local=questNavigation(g,'h_slimes'),path=findQuestRoute(g.world,{x:g.player.x,z:g.player.z},local);
 assert.ok(path.length>1);for(let i=1;i<path.length;i++)assert.ok(routeSegmentClear(g.world,path[i-1],path[i]));
 g.ch.progress.quests.f_road={status:'active',objectives:{'origin-road':1},progress:0};
 const remote=questNavigation(g,'f_road');assert.ok(remote.remote);assert.equal(remote.world,'frontier-wilds-v1');
 assert.ok(data.world.atlas.seams.some(s=>s.to===remote.world&&s.gate[0]===remote.x&&s.gate[1]===remote.z));
 const route=findQuestRoute(g.world,{x:g.player.x,z:g.player.z},remote);
 assert.ok(route.length>1);assert.deepEqual(route.at(-1),{x:remote.x,z:remote.z});
});

test('route presentation plans cooperatively, reuses its path and frees both ribbons',async()=>{
 const {Scene}=await import('three'),{QuestRoute}=await import('../../src/render/quest-route.js');
 const g=new Game(data,{seed:2}),scene=new Scene(),attrs={},messages=[];
 const route=new QuestRoute(g,scene,{tracker:{setAttribute:(k,v)=>attrs[k]=v},toast:s=>messages.push(s)});
 let freed=0;
  const settle=()=>{for(let i=0;route.work&&i<20000;i++)route.update(1/60);assert.ok(!route.work,'bounded search finishes');};
 for(let i=0;i<4;i++) {
  route.toggle();settle();assert.ok(route.mesh);assert.equal(scene.children.length,2);
  for(const mesh of [route.mesh,route.lead]){mesh.geometry.addEventListener('dispose',()=>freed++);mesh.material.addEventListener('dispose',()=>freed++);}
  const builds=route.builds;route.update(3);assert.equal(route.builds,builds,'stationary route remains cached');
  route.toggle();assert.equal(scene.children.length,0);assert.equal(attrs['aria-pressed'],'false');
 }
 assert.equal(freed,16);assert.equal(route.builds,1,'toggle reuses bounded CPU route cache');
 route.toggle();settle();for(let i=0;i<3;i++)g.notify({type:'kill',target:'salt_slime'});route.update(0);assert.equal(route.mesh,null,'finished target clears immediately');
 g.ch.progress.quests.s_job={status:'active',objectives:{primary:0},progress:0};g.ch.progress.questJournal.trackedId='s_job';route.toggle();assert.equal(route.mesh,null);assert.ok(messages.length);assert.equal(attrs['aria-pressed'],'false');
 route.dispose();assert.equal(scene.children.length,0);
});

test('cooperative search matches safe blocking route; cancellation leaves character and world alone',()=>{
 const world=wallWorld(false),start={x:-8,z:0},target={spatial:true,x:8,z:0},cache=createQuestRouteCache(world);
 const search=searchQuestRoute(world,start,target,{cache});let step=search.next(),slices=0;
 assert.equal(step.done,false,'search yields before completion');
 while(!step.done){slices++;step=search.next();}
 assert.ok(slices>10);assert.deepEqual(step.value,findQuestRoute(world,start,target,{cache}));
 for(let i=1;i<step.value.length;i++)assert.ok(routeSegmentClear(world,step.value[i-1],step.value[i]));
 const cancelled=searchQuestRoute(world,start,target);cancelled.next();cancelled.return();assert.equal(cancelled.next().done,true);
 assert.deepEqual(start,{x:-8,z:0});
});

test('moving along a cached route updates its near endpoint every frame without pathfinding',async()=>{
 const {Scene}=await import('three'),{QuestRoute}=await import('../../src/render/quest-route.js');
 const g=new Game(data,{seed:2}),scene=new Scene(),route=new QuestRoute(g,scene,{tracker:{setAttribute(){}},toast(){}});
 route.toggle();for(let i=0;route.work&&i<20000;i++)route.update(1/60);
 const mesh=route.mesh,lead=route.lead,builds=route.builds;
 for(let frame=0;frame<300;frame++){
  const p=g.player,next=route.path.find((n,i)=>i>0&&Math.hypot(n.x-p.x,n.z-p.z)>.1);
  if(next){const len=Math.hypot(next.x-p.x,next.z-p.z),step=Math.min(.04,len),m=g.world.move(p.x,p.z,.45,(next.x-p.x)/len*step,(next.z-p.z)/len*step,{allowSeams:true});p.x=m.x;p.z=m.z;}
  route.update(1/60);assert.equal(route.mesh,mesh);assert.equal(route.lead,lead);
  assert.equal(route.path[0].x,p.x);assert.equal(route.path[0].z,p.z);
  const a=lead.geometry.getAttribute('position').array;
  assert.ok(Math.abs((a[0]+a[3])/2-p.x)<.00002);assert.ok(Math.abs((a[2]+a[5])/2-p.z)<.00002,'GPU lead starts at the current player');
 }
 assert.equal(route.builds,builds);route.dispose();assert.equal(scene.children.length,0);
});

test('hiding an unfinished search cancels it; a map change discards stale cache and geometry',async()=>{
 const {Scene}=await import('three'),{QuestRoute}=await import('../../src/render/quest-route.js');
 const g=new Game(data,{seed:2}),scene=new Scene(),route=new QuestRoute(g,scene,{tracker:{setAttribute(){}},toast(){}});
 route.toggle();assert.ok(route.work);route.hide();for(let i=0;i<10;i++)route.update(1);assert.equal(scene.children.length,0);
 route.toggle();for(let i=0;route.work&&i<20000;i++)route.update(1/60);const previous=route.cache;
 g.world=createWorld(data.world);route.update(.016);assert.notEqual(route.cache,previous);assert.equal(route.mesh,null);
 route.dispose();assert.equal(scene.children.length,0);
});

test('search can finish between render frames and disposing cancels its queued tasks',async()=>{
 const {Scene}=await import('three'),{QuestRoute}=await import('../../src/render/quest-route.js');
 const g=new Game(data,{seed:2}),scene=new Scene(),route=new QuestRoute(g,scene,{tracker:{setAttribute(){}},toast(){}});
 route.toggle();assert.ok(route.work);await new Promise(resolve=>setTimeout(resolve,50));
 assert.ok(route.mesh,'near route finishes without rendering');assert.equal(route.timer,null);
 route.dispose();route.toggle();route.dispose();await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(scene.children.length,0);assert.equal(route.work,null);assert.equal(route.timer,null);
});
