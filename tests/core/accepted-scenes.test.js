import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {acceptedSceneLayout,sceneWeight} from '../../src/core/accepted-scenes.js';
import {createCharacter,migrateCharacter} from '../../src/core/character.js';
import {OpenWorldGame} from '../../src/core/open-world-game.js';
import {encounterLayout} from '../../src/core/encounters.js';
const data=loadData(),world=createWorld(data.world);
test('all approved areas share real roads, collision and continuous edge heights',()=>{
 assert.equal(acceptedSceneLayout.scenes.length,6);
 let samples=0;
 for(const road of world.roads.filter(r=>r.acceptedScene))for(let i=0;i<road.points.length-1;i++){
  const a=road.points[i],b=road.points[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(length/.2));
  for(let k=0;k<n;k++){
   const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,dx=(b[0]-a[0])/n,dz=(b[1]-a[1])/n;
   assert.ok(world.isFree(x,z,.45),road.id+' solid at '+[x,z]);
   for(const sign of[1,-1]){const start=sign===1?[x,z]:[x+dx,z+dz],m=world.move(...start,.45,dx*sign,dz*sign);assert.ok(Math.hypot(m.x-(start[0]+dx*sign),m.z-(start[1]+dz*sign))<.025,road.id+' walking '+sign);}
   samples++;
  }
 }
 assert.ok(samples>0);assert.equal(new Set(world.roads.filter(r=>r.acceptedScene&&r.acceptedScene!=='connector').map(r=>r.acceptedScene)).size,6);
 for(const s of acceptedSceneLayout.scenes){
  const b=s.bounds;
  for(let i=0;i<=20;i++)for(const p of[[b[0],b[2]+(b[3]-b[2])*i/20],[b[1],b[2]+(b[3]-b[2])*i/20],[b[0]+(b[1]-b[0])*i/20,b[2]],[b[0]+(b[1]-b[0])*i/20,b[3]]]){
   assert.equal(sceneWeight(s,...p),0);assert.ok(Number.isFinite(world.groundY(...p)));
  }
 }
});
test('opening weapons, waypoint arrivals and all existing populations stay usable',()=>{
 for(const p of[data.world.playerSpawn,...Object.values(data.world.wreck.weapons),...data.world.waypoints.map(w=>[w.pos[0],w.pos[1]+2.2])])assert.ok(world.isFree(...p,.45),'service '+p);
 assert.deepEqual(encounterLayout(world,data).failures,[]);
 const source=JSON.stringify(data.world.city);const bare=structuredClone(data.world);bare.acceptedScenes.enabled=false;const old=createWorld(bare);
 for(const p of[data.world.town.centre,data.world.town.respawn,data.world.town.workbench,data.world.town.trainer,data.world.town.shop])assert.equal(world.groundY(...p),old.groundY(...p));
 assert.equal(JSON.stringify(data.world.city),source);
});
test('new stone uses the saved landing waypoint ID and real teleport logic',()=>{
 const ch=createCharacter(data);ch.gold=777;ch.progress.waypoints.push('town');
 const g=new OpenWorldGame(structuredClone(data),{character:migrateCharacter(structuredClone(ch),data),seed:9});
 assert.equal(g.teleportTo('forest').reason,'locked');
 const home=g.teleportTo('landing');assert.equal(home.ok,true);assert.ok(g.world.isFree(g.player.x,g.player.z,g.player.r));
 assert.ok(Math.hypot(g.player.x+139,g.player.z-74)<4);assert.equal(g.ch.gold,777);
 assert.ok(g.ch.progress.waypoints.includes('town'));assert.ok(g.ch.progress.waypoints.includes('landing'));
});
