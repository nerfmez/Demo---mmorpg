import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {acceptedSceneLayout,sceneWeight,sceneSample} from '../../src/core/accepted-scenes.js';
import {acceptedGroundEdit} from '../../src/core/accepted-shift.js';
import {createCharacter,migrateCharacter} from '../../src/core/character.js';
import {OpenWorldGame} from '../../src/core/open-world-game.js';
import {encounterLayout} from '../../src/core/encounters.js';
const data=loadData(),world=createWorld(data.world);
test('all approved areas share real roads, collision and continuous edge heights',()=>{
 assert.equal(acceptedSceneLayout.scenes.length,6);
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){const a=acceptedSceneLayout.scenes[i].bounds,b=acceptedSceneLayout.scenes[j].bounds;assert.ok(Math.min(a[1],b[1])<=Math.max(a[0],b[0])||Math.min(a[3],b[3])<=Math.max(a[2],b[2]),'scene footprints must not overlap');}
 for(const road of world.roads)assert.ok(Number.isFinite(road.width)&&road.width>0,'finite road width '+road.id);
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
 assert.ok(samples>0);assert.equal(new Set(world.roads.filter(r=>r.acceptedScene&&!['connector','arrival'].includes(r.acceptedScene)).map(r=>r.acceptedScene)).size,6);
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
test('the owner\'s conch ships light: one reduced mesh and one 1024 colour map',async()=>{
 const {readFileSync}=await import('node:fs');
 const bytes=readFileSync(new URL('../../public/models/accepted-scenes/singing-conch.glb',import.meta.url));
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const prim=json.meshes.flatMap(m=>m.primitives);assert.equal(prim.length,1);
 assert.ok(json.accessors[prim[0].indices].count/3<=7000,'triangles');
 assert.ok(prim[0].attributes.NORMAL!==undefined,'keeps its smooth normals');
 const mat=json.materials[prim[0].material];
 assert.equal(json.images.length,1);assert.ok(mat.pbrMetallicRoughness.baseColorTexture);
 assert.ok(!mat.normalTexture&&!mat.emissiveTexture&&!mat.pbrMetallicRoughness.metallicRoughnessTexture);
 const bv=json.bufferViews[json.images[0].bufferView],bin=28+bytes.readUInt32LE(12),jpg=bytes.subarray(bin+(bv.byteOffset||0),bin+(bv.byteOffset||0)+bv.byteLength);
 let at=2;while(at<jpg.length&&!(jpg[at+1]>=0xc0&&jpg[at+1]<=0xc2))at+=2+jpg.readUInt16BE(at+2);
 assert.deepEqual([jpg.readUInt16BE(at+7),jpg.readUInt16BE(at+5)],[1024,1024],'colour map size');
 assert.ok(bytes.length<600*1024,'file size');
});
test('render can follow every height edit inside a scene (connectors, seams, shore)',async()=>{
 const {acceptedGroundEdit}=await import('../../src/core/accepted-shift.js');
 const hf=world.heightfield,data2=data.world;let checked=0,edited=0;
 for(const scene of acceptedSceneLayout.scenes){
  const b=scene.bounds;
  for(let z=Math.ceil(b[2]);z<=b[3];z+=1)for(let x=Math.ceil(b[0]);x<=b[1];x+=1){
   const i=Math.round((x-hf.ox)/hf.res),j=Math.round((z-hf.oz)/hf.res),gx=hf.ox+i*hf.res,gz=hf.oz+j*hf.res;
   if(sceneWeight(scene,gx,gz)<.999||(data2.acceptedScenes.connectors||[]).some(r=>r.repair&&Math.hypot(...r.points.reduce((m,p)=>Math.hypot(gx-p[0],gz-p[1])<Math.hypot(gx-m[0],gz-m[1])?p:m).map((v,k)=>v-[gx,gz][k]))<r.width/2+12))continue;
   const e=acceptedGroundEdit(data2,scene,gx,gz,hf.acceptedConnectors);checked++;if(Math.abs(e.shift)>.05)edited++;
   assert.ok(Math.abs(e.height-hf.data[j*hf.w+i])<1e-3,`${scene.id} ${gx},${gz}: ${e.height} vs ${hf.data[j*hf.w+i]}`);
  }
 }
 assert.ok(checked>10000&&edited>500,`checked ${checked}, edited ${edited}`);
});

test('a ring of trees and shrubs carries each scene\'s woodland past its bounds without touching routes',()=>{
 const plant=data.world.acceptedScenes.surround.plant,trees=world.circles.filter(c=>c.type==='scene-tree'),shrubs=world.decor.sceneShrubs;
 const outside=(b,x,z)=>Math.hypot(Math.max(b[0]-x,0,x-b[1]),Math.max(b[2]-z,0,z-b[3]));
 for(const s of acceptedSceneLayout.scenes){
  assert.ok(trees.filter(t=>outside(s.bounds,t.x,t.z)<=plant.trees.outer+1).length>=plant.trees.perScene/2,s.id+' ring trees');
  assert.ok(shrubs.filter(t=>outside(s.bounds,t.x,t.z)<=plant.shrubs.outer+1).length>=plant.shrubs.perScene/2,s.id+' ring shrubs');
 }
 for(const t of trees){
  assert.ok(acceptedSceneLayout.scenes.every(s=>sceneWeight(s,t.x,t.z)===0),'ring trees stay outside every scene');
  assert.ok(!world.isWater(t.x,t.z,t.r)&&world.heightfield.slopeAt(t.x,t.z)<=plant.trees.slope,'dry, gentle ground');
  for(const r of world.roads)for(let i=1;i<r.points.length;i++){
   const [ax,az]=r.points[i-1],[bx,bz]=r.points[i],l=Math.hypot(bx-ax,bz-az)||1,u=Math.max(0,Math.min(1,((t.x-ax)*(bx-ax)+(t.z-az)*(bz-az))/l/l));
   assert.ok(Math.hypot(t.x-ax-(bx-ax)*u,t.z-az-(bz-az)*u)>r.width/2+t.r,r.id+' clear of ring tree '+[t.x,t.z]);
  }
 }
 const stones=world.circles.filter(c=>c.type==='waypoint');assert.equal(stones.length,data.world.waypoints.length);
 for(const w of stones)assert.ok(trees.every(t=>Math.hypot(t.x-w.x,t.z-w.z)>t.r+3),w.id+' waypoint stays open');
});
test('a lifted scene keeps its own forms: same relief higher, its outer ground continued, its hill carried over the seam',()=>{
 const scene=acceptedSceneLayout.scenes.find(s=>s.id==='hill-windmill'),lift=data.world.acceptedScenes.lift['hill-windmill'];
 assert.ok(lift>0);
 // inside, away from connectors and the seam, the ground is the scene's own surface plus the lift
 for(const [x,z] of [[126,-80],[140,-78],[118,-90]]){
  const edit=acceptedGroundEdit(data.world,scene,x,z,world.heightfield.acceptedConnectors);
  if(edit.keep<.999)continue;
  assert.ok(Math.abs(world.terrainY(x,z)-(sceneSample(scene,'heights',x,z)+lift))<.6,'lifted surface at '+[x,z]);
 }
 // outside the west, east and south sides the scene's own outer ground runs on: no sheer step
 // (a rock face only exists inside the bounds) and no drop straight back to the map
 const b=scene.bounds;let steep=0,n=0;
 for(let t=0;t<=1;t+=.05)for(const [x,z] of [[b[0]-6,b[2]+(b[3]-b[2])*t],[b[1]+6,b[2]+(b[3]-b[2])*t],[b[0]+(b[1]-b[0])*t,b[3]+6]]){
  n++;if(world.slopeAt(x,z)>1.2)steep++;
 }
 assert.ok(steep/n<.05,`sheer ground outside the scene at ${steep}/${n} samples`);
 assert.ok(world.terrainY(b[0]-6,-92)>world.terrainY(b[0]-40,-92)+2,'the west side slopes down from the scene, not cut at its bound');
 // both maps list the same seam rise, so the hill meets itself across the border
 const moon=data.maps['moonroot-grove-v1'],dx=moon.atlas.offset[0];
 const mine=data.world.atlas.seams.find(s=>s.to===moon.id).rises,theirs=moon.atlas.seams.find(s=>s.to===data.world.id).rises;
 assert.deepEqual(mine.map(r=>[r.span[0],r.span[1],r.height,r.ease]),theirs.map(r=>[r.span[0]+dx,r.span[1]+dx,r.height,r.ease]));
 const other=createWorld(moon);
 for(const x of [100,126,150])assert.ok(Math.abs(world.terrainY(x,data.world.bounds.minZ)-other.terrainY(x-dx,moon.bounds.maxZ))<.3,'seam heights meet at x '+x);
});
test('connectors from a lifted scene start on its lifted ground',()=>{
 const scene=acceptedSceneLayout.scenes.find(s=>s.id==='hill-windmill'),lift=data.world.acceptedScenes.lift['hill-windmill'];
 const raw=data.world.acceptedScenes.connectors.filter(c=>c.from?.startsWith('hill-windmill/')),applied=world.heightfield.acceptedConnectors;
 assert.ok(raw.length);
 for(const road of raw){
  const now=applied.find(c=>c.id===road.id),p=road.points,k=sceneWeight(scene,...p[0])>sceneWeight(scene,...p.at(-1))?0:p.length-1;
  assert.ok(Math.abs(now.heights[k]-(road.heights[k]+lift*sceneWeight(scene,...p[k])))<.05,road.id+' scene end follows the lift');
 }
});
