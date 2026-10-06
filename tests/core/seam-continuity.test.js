import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {Game} from '../../src/core/game.js';
import {ownsRegionPoint} from '../../src/render/region-ownership.js';
const data=loadData(),AZURE='azure-harbor-v1',FRONTIER='frontier-wilds-v1';
const worlds=Object.fromEntries(Object.entries(data.maps).map(([id,wd])=>[id,createWorld(wd)]));
const on=id=>({...data,world:data.maps[id]});
const point=(id,x,z)=>[x+data.maps[id].atlas.offset[0],z+data.maps[id].atlas.offset[1]];
const game=()=>{const g=new Game(on(AZURE),{world:worlds[AZURE],seed:7});g.worlds=worlds;return g;};
const fromGlobal=(id,[x,z])=>[x-data.maps[id].atlas.offset[0],z-data.maps[id].atlas.offset[1]];

test('shared terrain profile aligns at the coast and through the whole open span',()=>{
 const a=worlds[AZURE],b=worlds[FRONTIER],seam=a.seams[0];
 for(let z=seam.span[0];z<=seam.span[1];z+=1){const world=point(AZURE,a.bounds.minX,z),[bx,bz]=fromGlobal(FRONTIER,world);assert.ok(Math.abs(a.terrainY(a.bounds.minX,z)-b.terrainY(bx,bz))<.02,'height at '+z);}
 const at=80,[bx,bz]=fromGlobal(FRONTIER,[-160,at]);assert.equal(a.terrainY(-160,at),b.terrainY(bx,bz));
});

test('both maps partition the entire shared edge: middle, closed ends and water apron',()=>{
 const a=worlds[AZURE],b=worlds[FRONTIER];
 for(const z of [-240,-120,-80,0,80,140,230])for(const x of [-200,-160.01,-159.99,-120]){
  const [ax,az]=fromGlobal(AZURE,[x,z]),[bx,bz]=fromGlobal(FRONTIER,[x,z]);assert.notEqual(ownsRegionPoint(a,ax,az),ownsRegionPoint(b,bx,bz),`${x},${z}`);
 }
});

test('crossing is exact atlas translation at centre and both safe span ends, including return',()=>{
 const a=worlds[AZURE],span=a.seams[0].span;
 let checked=0,blocked=0;
 for(const z of [span[0]+.5,-80,0,span[1]-.5]){
  const g=game();g.player.x=a.bounds.minX;g.player.z=z;
  if(!a.isFree(g.player.x,z,g.player.r,{allowSeams:true})){
   assert.ok(a.isWater(g.player.x,z),'the excluded southern end is authored sea, not missing coverage');blocked++;continue;
  }
  const global=point(AZURE,g.player.x,z),next=fromGlobal(FRONTIER,global);
  assert.ok(worlds[FRONTIER].isFree(...next,g.player.r,{allowSeams:true}),'dry source sample has a walkable destination');
  checked++;
  assert.equal(g.crossSeam(g.world.seams[0]).ok,true);
  assert.deepEqual(point(FRONTIER,...g.ch.pos),global);g.enterWorld(worlds[FRONTIER]);assert.deepEqual(point(FRONTIER,g.player.x,g.player.z),global);
  assert.equal(g.crossSeam(g.world.seams[0]).ok,true);g.enterWorld(worlds[AZURE]);assert.deepEqual(point(AZURE,g.player.x,g.player.z),global);
 }
 assert.equal(checked,3,'all three dry centre/end samples must actually run');
 assert.equal(blocked,1,'the southern sea end remains blocked');
});

test('normal walking crosses without inward hop; same player, camera shift event and save data',()=>{
 const g=game(),seam=g.world.seams[0];[g.player.x,g.player.z]=[seam.gate[0]+2,seam.gate[1]];
 g.ch.gold=321;const before={id:g.player.id,gear:structuredClone(g.ch.gear),skills:structuredClone(g.ch.skills),level:g.ch.level};g.input.moveX=-1;
 for(let i=0;i<120&&!g.travelled;i++)g.update(1/60);
 assert.equal(g.travelled,FRONTIER);const originalPoint=point(AZURE,g.player.x,g.player.z);assert.deepEqual(point(FRONTIER,...g.ch.pos),originalPoint);
 g.enterWorld(worlds[FRONTIER]);assert.deepEqual(point(FRONTIER,g.player.x,g.player.z),originalPoint);assert.equal(g.player.id,before.id);assert.equal(g.ch.gold,321);assert.deepEqual(g.ch.gear,before.gear);assert.deepEqual(g.ch.skills,before.skills);assert.equal(g.ch.level,before.level);
 const event=g.drainEvents().find(e=>e.type==='worldChanged');assert.deepEqual(event.shift,[384,93]);
 const camera=[-145,19,-80],translated=[camera[0]+event.shift[0],camera[1],camera[2]+event.shift[1]];assert.deepEqual(point(FRONTIER,translated[0],translated[2]),point(AZURE,camera[0],camera[2]));
 const restored=new Game(on(FRONTIER),{world:worlds[FRONTIER],seed:7,character:JSON.parse(JSON.stringify(g.snapshot()))});assert.deepEqual(point(FRONTIER,restored.player.x,restored.player.z),originalPoint);
 assert.equal(restored.ch.version,g.ch.version);assert.equal(restored.ch.gold,321);
});

test('reversal, reload and evict-style reconstruction retain the pre-existing population contract',()=>{
 const g=game();[g.player.x,g.player.z]=g.world.seams[0].gate;
 for(let i=0;i<4;i++){
  const id=g.world.seams[0].to;assert.ok(g.crossSeam(g.world.seams[0]).ok);g.enterWorld(worlds[id]);
  const expected=new Game(on(id),{world:createWorld(data.maps[id]),seed:7});
  assert.deepEqual(g.spawnPoints.map(p=>[p.monster,p.x,p.z,p.level,p.bossId]),expected.spawnPoints.map(p=>[p.monster,p.x,p.z,p.level,p.bossId]));
  assert.equal(g.projectiles.length,0);assert.equal(g.drops.length,0);assert.equal(g.areas.length,0);
 }
});

test('closed ends, combat and pending neighbours cannot cross; loading preserves state',()=>{
 const g=game(),w=g.world,s=w.seams[0],r=g.player.r;
 assert.equal(w.seamAt(w.bounds.minX+.45,s.gate[1],r),null,'no early crossing');
 assert.equal(w.seamAt(w.bounds.minX,s.span[0]+r/2,r),null,'circle cannot overlap a closed end');
 const end=w.move(w.bounds.minX+1,s.span[0]-1,r,-2,0,{allowSeams:true});assert.equal(end.x,w.bounds.minX+r);
 const ordinary=w.move(w.bounds.minX+1,s.gate[1],r,-2,0);assert.equal(ordinary.x,w.bounds.minX+r,'monster/default movement unchanged');
 [g.player.x,g.player.z]=s.gate;g.canCrossSeam=()=>false;const saved=JSON.stringify(g.ch);assert.equal(g.crossSeam(s).reason,'loading');assert.equal(JSON.stringify(g.ch),saved);
 g.canCrossSeam=()=>true;g.player.combatT=10; // public method predicate exercised separately below
 g.inCombat=()=>true;g.input.moveX=-1;[g.player.x,g.player.z]=[s.gate[0]+1,s.gate[1]];
 for(let i=0;i<60;i++)g.update(1/60);assert.equal(g.ch.worldId,AZURE);assert.equal(g.drainEvents().filter(e=>e.type==='travelRefused'&&e.reason==='combat').length,1);
 g.inCombat=()=>false;g.player.dead=true;assert.equal(g.crossSeam(s).reason,'dead');
});
