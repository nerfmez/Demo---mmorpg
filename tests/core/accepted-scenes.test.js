import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {acceptedSceneLayout,sceneWeight,sceneSample} from '../../src/core/accepted-scenes.js';
import {acceptedGroundEdit} from '../../src/core/accepted-shift.js';
import {distToPolyline,polylineZAtX as polylineZ} from '../../src/core/math.js';
import {createCharacter,migrateCharacter} from '../../src/core/character.js';
import {OpenWorldGame} from '../../src/core/open-world-game.js';
import {encounterLayout} from '../../src/core/encounters.js';
const data=loadData(),world=createWorld(data.world);
// scenes lie in their own region (scene.region, Azure Coast when unset)
const frontier=data.maps['frontier-wilds-v1'],worlds={[data.world.id]:world,[frontier.id]:createWorld(frontier)};
const regionOf=s=>s.region||data.world.id,home=s=>worlds[regionOf(s)],homeData=s=>data.maps[regionOf(s)];
test('all approved areas share real roads, collision and continuous edge heights',()=>{
 assert.equal(acceptedSceneLayout.scenes.length,6);
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){const a=acceptedSceneLayout.scenes[i].bounds,b=acceptedSceneLayout.scenes[j].bounds;assert.ok(Math.min(a[1],b[1])<=Math.max(a[0],b[0])||Math.min(a[3],b[3])<=Math.max(a[2],b[2]),'scene footprints must not overlap');}
 let samples=0;
 for(const world of Object.values(worlds)){
 for(const road of world.roads)assert.ok(Number.isFinite(road.width)&&road.width>0,'finite road width '+road.id);
 for(const road of world.roads.filter(r=>r.acceptedScene))for(let i=0;i<road.points.length-1;i++){
  const a=road.points[i],b=road.points[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(length/.2));
  for(let k=0;k<n;k++){
   const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,dx=(b[0]-a[0])/n,dz=(b[1]-a[1])/n;
   assert.ok(world.isFree(x,z,.45),road.id+' solid at '+[x,z]);
   for(const sign of[1,-1]){const start=sign===1?[x,z]:[x+dx,z+dz],m=world.move(...start,.45,dx*sign,dz*sign);assert.ok(Math.hypot(m.x-(start[0]+dx*sign),m.z-(start[1]+dz*sign))<.025,road.id+' walking '+sign);}
   samples++;
  }
 }
 }
 assert.ok(samples>0);assert.equal(new Set(Object.values(worlds).flatMap(w=>w.roads).filter(r=>r.acceptedScene&&!['connector','arrival'].includes(r.acceptedScene)).map(r=>r.acceptedScene)).size,6);
 for(const s of acceptedSceneLayout.scenes){
  const b=s.bounds,world=home(s);
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
 let checked=0,edited=0;
 for(const scene of acceptedSceneLayout.scenes){
  const b=scene.bounds,hf=home(scene).heightfield,data2=homeData(scene);
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
 const outside=(b,x,z)=>Math.hypot(Math.max(b[0]-x,0,x-b[1]),Math.max(b[2]-z,0,z-b[3]));
 for(const [id,world] of Object.entries(worlds)){
 const plant=data.maps[id].acceptedScenes.surround.plant,trees=world.circles.filter(c=>c.type==='scene-tree'),shrubs=world.decor.sceneShrubs,mine=acceptedSceneLayout.scenes.filter(s=>regionOf(s)===id);
 const own=(s,k)=>({...plant[k],...plant.scene?.[s.id]?.[k]});
 for(const s of mine){
  const t=own(s,'trees'),sh=own(s,'shrubs');
  assert.ok(trees.filter(c=>outside(s.bounds,c.x,c.z)<=t.outer+1).length>=t.perScene/2,s.id+' ring trees');
  assert.ok(shrubs.filter(c=>outside(s.bounds,c.x,c.z)<=sh.outer+1).length>=sh.perScene/2,s.id+' ring shrubs');
 }
 for(const t of trees){
  const slope=Math.max(...mine.filter(s=>outside(s.bounds,t.x,t.z)<=own(s,'trees').outer+1).map(s=>own(s,'trees').slope));
  assert.ok(mine.every(s=>sceneWeight(s,t.x,t.z)===0),'ring trees stay outside every scene');
  assert.ok(!world.isWater(t.x,t.z,t.r)&&world.heightfield.slopeAt(t.x,t.z)<=slope,'dry, gentle ground');
  for(const r of world.roads)for(let i=1;i<r.points.length;i++){
   const [ax,az]=r.points[i-1],[bx,bz]=r.points[i],l=Math.hypot(bx-ax,bz-az)||1,u=Math.max(0,Math.min(1,((t.x-ax)*(bx-ax)+(t.z-az)*(bz-az))/l/l));
   assert.ok(Math.hypot(t.x-ax-(bx-ax)*u,t.z-az-(bz-az)*u)>r.width/2+t.r,r.id+' clear of ring tree '+[t.x,t.z]);
  }
 }
 const stones=world.circles.filter(c=>c.type==='waypoint');assert.equal(stones.length,data.maps[id].waypoints.length);
 for(const w of stones)assert.ok(trees.every(t=>Math.hypot(t.x-w.x,t.z-w.z)>t.r+3),w.id+' waypoint stays open');
 }
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
test('a final connector keeps the heights it was given, and its ground meets them',()=>{
 const raw=data.world.acceptedScenes.connectors.filter(c=>c.final),applied=world.heightfield.acceptedConnectors;
 assert.ok(raw.length);
 for(const road of raw){
  const now=applied.find(c=>c.id===road.id);
  assert.deepEqual(now.heights,road.heights,road.id+' is not lifted again');
  road.points.forEach((p,i)=>{if(world.isFree(...p,.45))assert.ok(Math.abs(world.groundY(...p)-road.heights[i])<.15,road.id+' ground at '+p);});
  assert.ok(world.roads.some(r=>r.id===road.id||road.points.every(p=>distToPolyline(...p,r.points)<r.width/2)),road.id+' is painted as a road');
 }
});
test('connectors run on the ground beside them: none digs a trench through a scene',()=>{
 // a straight connector once cut 2.5 m deep through the rose garden's west terrace
 for(const w of Object.values(worlds))for(const c of w.heightfield.acceptedConnectors||[]){
  let deep=0,worst=0;
  for(let i=1;i<c.points.length;i++){const [ax,az]=c.points[i-1],[bx,bz]=c.points[i],L=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/L,nz=(bx-ax)/L,o=c.width/2+2.5;
   for(let t=0;t<1;t+=1/L){const x=ax+(bx-ax)*t,z=az+(bz-az)*t,trench=Math.min(w.terrainY(x+nx*o,z+nz*o),w.terrainY(x-nx*o,z-nz*o))-w.terrainY(x,z);
    worst=Math.max(worst,trench);if(trench>.6)deep++;}}
  assert.ok(worst<2&&deep<20,`${c.id}: trench ${worst.toFixed(2)} m deep over ${deep} m`);
 }
});
test('the Conch Coast lies west of the arrival beach on the Frontier coast, as authored',async()=>{
 const scene=acceptedSceneLayout.scenes.find(s=>s.id==='shell-beach'),fw=worlds[frontier.id],[ox,oz]=frontier.atlas.offset;
 assert.equal(scene.region,frontier.id);
 // in world metres: left of the arrival beach, a little way off, inside the Frontier map
 const beach=acceptedSceneLayout.scenes.find(s=>s.id==='beach').bounds,b=scene.bounds;
 assert.ok(b[1]+ox<beach[0]-25&&b[0]>=frontier.bounds.minX&&b[1]<=frontier.bounds.maxX&&b[3]<=frontier.bounds.maxZ);
 // the ground is the scene's own surface away from its trails and edges
 // (away from the west headland's plateau, which closes the slot behind its cove)
 const {edgeCliffsAt}=await import('../../src/core/edge-cliffs.js');
 let n=0,close=0;
 for(let x=b[0]+6;x<b[1]-6;x+=3)for(let z=b[2]+6;z<b[3]-6;z+=3){if(edgeCliffsAt(frontier,x,z)>-Infinity)continue;n++;if(Math.abs(fw.groundY(x,z)-sceneSample(scene,'heights',x,z))<.3)close++;}
 assert.ok(close/n>.97,`seated ${close}/${n}`);
 // its roads and landmark moved with it; nothing of it is left at the old place
 assert.ok(fw.roads.some(r=>r.acceptedScene==='shell-beach')&&!world.roads.some(r=>r.acceptedScene==='shell-beach'));
 // the cove trail up the slot is closed by the headland's rock (owner, 26 October 2026)
 assert.ok(!fw.roads.some(r=>r.id==='shell-beach/trail-1'));
 assert.ok(frontier.landmarks.some(l=>l.id==='giant_conch')&&!data.world.landmarks.some(l=>l.id==='giant_conch'));
 // the Frontier shore follows the scene's own shore inside its bounds
 for(const [x,z] of scene.shore.filter(p=>p[0]>b[0]+4&&p[0]<b[1]-4))assert.ok(Math.abs(polylineZ(frontier.sea.shore,x)-z)<.01,'shore at '+x);
});
test('the Conch Coast is a hidden cove: one ramp is the only way in',()=>{
 // owner, 26 October 2026: rock all round, one entrance (the conch-ring ramp above the stair gully)
 const fw=worlds[frontier.id],[ox,oz]=frontier.atlas.offset,ring=frontier.acceptedScenes.edgeCliffs.find(c=>c.id==='conch-ring');
 assert.equal(ring.points.filter(p=>p[2]==='ramp').length,1);
 assert.ok(!frontier.acceptedScenes.edgeCliffs.some(c=>c.points.some(p=>p[2]==='ramp'&&c!==ring)));
 // walk in metre steps (only where the game's move succeeds) from the land and beaches outside
 const reach=blocked=>{const key=(i,j)=>i+','+j,starts=[[-306,68],[-270,10],[-300,20],[-200,20],[-175,30]],seen=new Set(starts.map(s=>key(...s))),q=[...starts];
  while(q.length){const [i,j]=q.shift();for(const [di,dj] of[[1,0],[-1,0],[0,1],[0,-1]]){const ni=i+di,nj=j+dj,k=key(ni,nj);if(seen.has(k)||ni<-320||ni>-150||nj<0||nj>100||blocked(ni,nj))continue;
   const m=fw.move(i-ox,j-oz,.45,di,dj);if(Math.hypot(m.x-(ni-ox),m.z-(nj-oz))>.03)continue;seen.add(k);q.push([ni,nj]);if(Math.hypot(ni+232,nj-82)<3)return true;}}
  return false;};
 assert.ok(reach(()=>false),'the cove cannot be reached at all');
 const [rx,rz]=ring.points.find(p=>p[2]==='ramp').map((v,i)=>i===0?v+ox:i===1?v+oz:v);
 assert.ok(!reach((x,z)=>Math.abs(x-rx-6)<16&&Math.abs(z-rz-2)<12),'a second way into the cove');
});
test('the arrival beach ends on the left in a high headland joined to the Conch Coast, open to the right',async()=>{
 const {edgeCliffAt}=await import('../../src/core/edge-cliffs.js');
 const fw=worlds[frontier.id],[ox,oz]=frontier.atlas.offset,ground=(x,z)=>x<data.world.bounds.minX?fw.groundY(x-ox,z-oz):world.groundY(x,z);
 const mine=data.world.acceptedScenes.edgeCliffs.find(c=>c.id==='west-headland'),theirs=frontier.acceptedScenes.edgeCliffs.find(c=>c.id==='west-headland');
 // one outline in world metres, kept by both maps
 assert.deepEqual(theirs.points.map(([x,z,k])=>[Math.round((x+ox)*100)/100,Math.round((z+oz)*100)/100,k]),mine.points.map(([x,z,k])=>[x,z,k]));
 assert.equal(theirs.top,mine.top);
 // a solid plateau from the Conch Coast's east headland to a face over the beach
 for(let x=-192;x<=-155;x+=1)assert.ok(ground(x,74)>mine.top-.6,'plateau at '+x);
 assert.ok(ground(-149,70)<.6,'beach in front of the face');
 // continuous over the seam, and up to the conch headland
 for(let z=56;z<=82;z+=2){assert.ok(Math.abs(world.groundY(data.world.bounds.minX,z)-fw.groundY(frontier.bounds.maxX,z-oz))<.05,'seam at '+z);assert.ok(Math.abs(ground(-197,z)-ground(-193,z))<.8,'joins the conch headland at '+z);}
 // no scene collider inside the plateau, spawn untouched
 for(const [w,c] of[[world,mine],[fw,theirs]])assert.ok(!w.circles.some(o=>o.type==='accepted-scene'&&edgeCliffAt(c,o.x,o.z)>-Infinity));
 assert.ok(world.isFree(...data.world.playerSpawn,.45));
 // the face is a cliff: walking west from the beach stops at it
 let x=-140;for(;x>-158;x-=.2){const m=world.move(x,70,.45,-.2,0);if(m.x>x-.18)break;}
 assert.ok(x>-153,'the face blocks the beach at '+x.toFixed(1));
 // the north side is rock too (the Conch Coast is a hidden cove): walking up from the land behind stops at it
 let z=30;for(;z<50;z+=.2){const m=fw.move(-172-ox,z-oz,.45,0,.2);if(m.z<z-oz+.18)break;}
 assert.ok(z<44&&fw.groundY(-172-ox,z-oz)<1,'climbed the north side at '+z.toFixed(1));
 // the shore to the right is open, level ground: a walk (half-metre steps round props)
 // leads from the spawn to the first monsters' coast where the Conch Coast stood
 const S=.5,key=(i,j)=>i+','+j,start=[Math.round(data.world.playerSpawn[0]/S),Math.round(data.world.playerSpawn[1]/S)],seen=new Set([key(...start)]),queue=[start];let reached=false;
 while(queue.length&&!reached){const [i,j]=queue.shift();for(const [di,dj] of[[1,0],[-1,0],[0,1],[0,-1]]){const ni=i+di,nj=j+dj;if(seen.has(key(ni,nj))||ni*S<-150||ni*S>-50||nj*S<50||nj*S>90)continue;
  const m=world.move(i*S,j*S,.45,di*S,dj*S);if(Math.hypot(m.x-ni*S,m.z-nj*S)>.03||Math.abs(world.groundY(ni*S,nj*S))>1.2)continue;seen.add(key(ni,nj));queue.push([ni,nj]);if(ni*S>=-60)reached=true;}}
 assert.ok(reached,'no level walk from the spawn east along the shore');
});
