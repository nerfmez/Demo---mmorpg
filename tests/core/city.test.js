import {test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{data}from'./helpers.js';import{createWorld}from'../../src/core/world.js';import{Game}from'../../src/core/game.js';import{createCharacter,migrateCharacter}from'../../src/core/character.js';import{fromBoxLocal}from'../../src/core/math.js';import{cityNavigation}from'./city-navigation.js';
const world=createWorld(data.world),city=data.world.city;
import{cityFloorAt}from'../../src/core/city.js';
import{createUnifiedWorld}from'../../src/core/unified-world.js';
import{OpenWorldGame}from'../../src/core/open-world-game.js';
const before=JSON.parse(readFileSync(new URL('../fixtures/azure-pre-city/world.json',import.meta.url)));
const provenance=JSON.parse(readFileSync(new URL('../../docs/city-v3-source-provenance.json',import.meta.url)));
const navigation=cityNavigation(world);
test('approved producer city identity, full paving and exact east-facing house survive preparation',()=>{
 assert.equal(city.files.length,11);assert.equal(city.files.reduce((n,f)=>n+f.bytes,0),5454368);
 for(const f of city.files){const b=readFileSync(new URL('../../public/'+f.url,import.meta.url));assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);}
 assert.ok(!city.files.some(f=>/Sea|Trees/.test(f.file)));assert.deepEqual(city.offset,[72.32,.76,41.2]);
 assert.equal(cityFloorAt(city,21,104),null,'source mainland inner loop remains a hole');
 assert.equal(world.terrainY(21,104),world.heightfield.heightAt(21,104),'source hole uses actual native terrain height');
 const f=provenance.find(p=>p.name==='Fountain broad octagonal first step');assert.ok(f.bounds[1][0]-f.bounds[0][0]>10);
 const b=readFileSync(new URL('../../public/assets/city-v3/05_Residential.glb',import.meta.url));const gltf=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));const n=gltf.nodes.find(n=>n.name==='AC_Home_Balcony_026');
 assert.deepEqual(n.translation,[-48.2400016784668,.07999999821186066,-24.959999084472656]);assert.ok(Math.abs(n.rotation[1]-Math.SQRT1_2)<1e-6);assert.ok(Math.abs(n.rotation[3]-Math.SQRT1_2)<1e-6);
 const entry=city.entries.find(p=>p.id===n.name);assert.ok(entry.front[0]>.999&&Math.abs(entry.front[1])<1e-5);
 assert.equal(world.boxes.filter(b=>b.type==='house').length,0,'no procedural old-town buildings');
});
test('all 63 entrances, functional anchors, piers and lighthouse connect to the unchanged beach spawn',()=>{
 const targets=[...city.entries,...['workbench','trainer','respawn'].map(id=>({id,x:data.world.town[id][0],z:data.world.town[id][1]})),...world.docks,...world.waypoints.map(p=>({...p,z:p.z+2.2})),{id:'beach',x:data.world.playerSpawn[0],z:data.world.playerSpawn[1]},{id:'lighthouse',x:data.world.harbor.lighthouse[0]+4.5,z:data.world.harbor.lighthouse[1]}];
 assert.equal(city.entries.length,63);
 for(const t of targets){assert.ok(world.isFree(t.x,t.z,.45),t.id+' free');const path=navigation.path(t.x,t.z);assert.ok(path,t.id+' connected');
  for(let i=1;i<path.length;i++){let [x,z]=path[i-1];const b=path[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-x,b[1]-z)/.15)),dx=(b[0]-x)/steps,dz=(b[1]-z)/steps;
   for(let k=0;k<steps;k++){const moved=world.move(x,z,.45,dx,dz);assert.ok(Math.hypot(moved.x-x-dx,moved.z-z-dz)<.025,t.id+' actual movement at '+[x,z]+', destination '+b+' moved '+[moved.x,moved.z]);x=moved.x;z=moved.z;}}
 }
 for(const b of city.colliders.filter(b=>b.type==='city_building'))assert.ok(!world.isFree(b.x,b.z,.45),b.id+' solid walls');
 assert.ok(!world.isFree(...data.world.town.centre,.45),'fountain basin blocks walking');
 for(const deck of world.docks.filter(d=>d.kind==='city_pier')){
  assert.ok(world.isFree(deck.x,deck.z,.45),deck.id+' deck');
  const side=fromBoxLocal(deck,deck.hx+1,0);if(world.inSea(side.x,side.z)&&!world.dockAt(side.x,side.z))assert.ok(!world.isFree(side.x,side.z,.45),deck.id+' water sides');
 }
});
test('native foliage, coastline data, spawn and source layout remain preserved; NPCs and boats have clear sites',()=>{
 const moves=city.propertyBoundary?.treeRelocations||[];
 assert.deepEqual(data.world.town.trees,before.town.trees.map(t=>{const m=moves.find(m=>m.id===t.id);return m?{...t,x:m.next[0],z:m.next[1]}:t;}));assert.deepEqual(data.world.sea,before.sea);assert.deepEqual(data.world.playerSpawn,before.playerSpawn);assert.deepEqual(data.world.ponds,before.ponds);
 const npcWorld=createWorld({...data.world,town:{...data.world.town,residents:[]}});
 for(const r of data.world.town.residents)assert.ok(npcWorld.isFree(r.x,r.z,r.r),r.id+' clear');
 assert.equal(data.world.harbor.boats.length,before.harbor.boats.length);for(const[x,z]of data.world.harbor.boats)assert.ok(world.inSea(x,z),'boat afloat');
 const g=new Game(data,{world,seed:9});assert.deepEqual([g.player.x,g.player.z],before.playerSpawn);
 for(const anchor of['trainer','workbench']){[g.player.x,g.player.z]=data.world.town[anchor];assert.ok(g.nearby()[anchor],anchor+' interaction remains');}
});
test('city adoption preserves merged Job/EXP and save history, including formerly blocked positions',()=>{
 const ch=createCharacter(data);ch.level=8;ch.exp=123;ch.jobLevel=5;ch.jobExp=45;ch.jobPoints=8;ch.gold=321;ch.progress.waypoints.push('town');ch.pos=[62,22];
 const saved=structuredClone(ch),m=migrateCharacter(ch,data);for(const k of['level','exp','jobLevel','jobExp','jobPoints','jobNodes','treeRevision','gear','skills','slots','progress'])assert.deepEqual(m[k],saved[k],k);
 const g=new Game(data,{world,character:m,seed:9});assert.ok(world.isFree(g.player.x,g.player.z,.45));[g.player.x,g.player.z]=data.world.town.respawn;assert.ok(world.isFree(g.respawnPoint().x,g.respawnPoint().z,.45));
});
test('native city navigation respects cross-cell NPC footprints and walks the unified game at either origin',()=>{
 const azure=data.world.id,frontier='frontier-wilds-v1';
 const worlds=Object.fromEntries(Object.entries(data.maps).map(([id,map])=>[id,id===azure?world:createWorld(map)]));
 const unified=createUnifiedWorld(worlds,azure),vendor=world.circles.find(o=>o.id==='fish_vendor');
 assert.ok(Math.hypot(56-vendor.x,18-vendor.z)<vendor.r+.45,'the former route point overlaps the unchanged NPC');
 assert.equal(world.isFree(56,18,.45),false,'native query must search across the x=56 gridline');
 assert.equal(unified.isFree(56,18,.45),false);
 assert.deepEqual([vendor.x,vendor.z,vendor.r],[55.4,17.5,.34]);
 const targets=[...['trainer','workbench'].map(id=>({id,x:data.world.town[id][0],z:data.world.town[id][1]})),...world.docks.filter(d=>d.kind==='city_pier')];
 for(const origin of[azure,frontier]){
  const g=new OpenWorldGame({...data,world:data.maps[origin]},{world:worlds[origin],worlds,seed:9});g.monsters=[];
  for(const t of targets){
   [g.player.x,g.player.z]=g.scenePoint(azure,...data.maps[azure].town.respawn);g.activateRegion(azure);
   const path=navigation.path(t.x,t.z);assert.ok(path,t.id+' independently reachable');
   for(const point of path){
    const [x,z]=g.scenePoint(azure,...point);let ticks=0;
    for(;ticks<1600&&Math.hypot(x-g.player.x,z-g.player.z)>.04;ticks++){
     const distance=Math.hypot(x-g.player.x,z-g.player.z);g.setMove((x-g.player.x)/distance,(z-g.player.z)/distance);
     g.update(Math.min(1/60,distance/g.derived.moveSpeed));
     assert.ok(g.world.isFree(g.player.x,g.player.z,g.player.r),t.id+' walking keeps actor clearance');
    }
    assert.ok(ticks<1600,t.id+' walks through '+point+' with origin '+origin);
   }
   g.setMove(0,0);
   const[lx,lz]=g.localPoint(azure,g.player.x,g.player.z);
   assert.ok(Math.hypot(lx-t.x,lz-t.z)<.04,t.id+' reached');
   if(t.id==='trainer'||t.id==='workbench')assert.ok(g.nearby()[t.id],t.id+' interaction remains available');
  }
 }
});
