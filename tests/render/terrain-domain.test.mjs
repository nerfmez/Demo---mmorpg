import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {terrainDomain} from '../../src/render/terrain-domain.js';
import {finishSteps} from '../../src/render/build-queue.js';
import {disposeObject} from '../../src/render/dispose.js';

// A legacy renderer dependency omits its JSON import attribute. Adapt only this
// Node test load; the production Vite loader and source modules stay unchanged.
const jsonHook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {terrainSteps,releaseGroundCaches,surfaceData}=await import(process.env.TERRAIN_SOURCE || '../../src/render/ground.js');
const {meadowPlantSteps}=await import('../../src/render/meadow.js');
jsonHook.deregister();

const data=loadData(),worlds=Object.fromEntries(Object.entries(data.maps).map(([id,wd])=>[id,createWorld(wd)]));
const domains=Object.fromEntries(Object.entries(worlds).map(([id,w])=>[id,terrainDomain(w,id=>worlds[id])]));
const A='azure-harbor-v1',F='frontier-wilds-v1',G='moonroot-grove-v1';
const local=(id,x,z)=>[x-worlds[id].data.atlas.offset[0],z-worlds[id].data.atlas.offset[1]];
const hfBytes=Object.fromEntries(Object.entries(worlds).map(([id,w])=>[id,Buffer.from(w.heightfield.data.buffer).slice()]));
const terrains=Object.fromEntries(Object.entries(worlds).map(([id,w])=>{
 const result=finishSteps(terrainSteps(w,{domain:domains[id]}));result.group.position.set(...[w.data.atlas.offset[0],0,w.data.atlas.offset[1]]);result.group.updateMatrixWorld(true);return [id,result.group];
}));
const hits=(x,z)=>{
 const ray=new THREE.Raycaster(new THREE.Vector3(x,200,z),new THREE.Vector3(0,-1,0));
 return Object.entries(terrains).flatMap(([id,g])=>ray.intersectObject(g,true).map(h=>({id,y:h.point.y})));
};
const roadMask=(id,x,z)=>{
 const ray=new THREE.Raycaster(new THREE.Vector3(x,200,z),new THREE.Vector3(0,-1,0));
 const hit=ray.intersectObject(terrains[id],true)[0];assert.ok(hit,`road terrain missing at ${x},${z}`);
 const geometry=hit.object.geometry,p=geometry.attributes.position,weights=new THREE.Vector3();
 const local=hit.object.worldToLocal(hit.point.clone());
 const {a,b,c}=hit.face;
 THREE.Triangle.getBarycoord(local,new THREE.Vector3().fromBufferAttribute(p,a),new THREE.Vector3().fromBufferAttribute(p,b),new THREE.Vector3().fromBufferAttribute(p,c),weights);
 const splat=geometry.attributes.aSplat;
 return splat.getX(a)*weights.x+splat.getX(b)*weights.y+splat.getX(c)*weights.z;
};

test('actual finite terrain covers the northern hole and never overlaps its neighbour',()=>{
 for(const z of[-200.25,-170.25,-160.01,-159.99,-150.25,-140.25,-130.25,-120.25,-92.25,0.25,80.25,114.25])
  for(const x of[-175.25,-160.01,-159.99,-150.25,-130.25]){
   const found=hits(x,z);assert.ok(found.length,`missing terrain at ${x},${z}`);
   assert.equal(new Set(found.map(h=>h.id)).size,1,`overlapping regions at ${x},${z}`);
  }
 assert.equal(hits(-150.25,-200.25)[0].id,G,'Grove owns the northern strip after expanding the former two-map world');
 assert.equal(hits(-150.25,-150.25)[0].id,G,'Grove replaces Azure’s old northern decorative skirt');
 assert.equal(hits(-150.25,-110.25)[0].id,A,'Azure still owns its native playable ground south of the Grove edge');
});

test('closed skirt edges and finite grid end meet at the same rendered height',()=>{
 for(let z=-160;z<=-120;z+=.25){
  // Grove owns the east side north of Azure's playable edge. Comparing an
  // unrendered Azure skirt there hid the actual F/G corner-profile mismatch.
  const eastOwner=z<-120?G:A,east=domains[eastOwner].height(...local(eastOwner,-160,z)),f=domains[F].height(...local(F,-160,z));
  assert.ok(Math.abs(east-f)<1e-6,`cut face ${F}/${eastOwner} at Z=${z}: ${f} versus ${east}`);
 }
 for(const z of[-159.75,-155.25,-150.25,-140.25,-130.25,-120.25]){
  const west=hits(-160.0001,z),east=hits(-159.9999,z);
  assert.ok(west.length&&east.length,`uncovered shared edge at Z=${z}`);
  assert.ok(Math.abs(west[0].y-east[0].y)<.003,`rendered cut face at Z=${z}`);
 }
 // Grove covers the former Azure finite cap on both sides in the current atlas.
 for(const x of[-155.25,-150.25,-140.25,-130.25]){
  const north=hits(x,-160-1e-5),south=hits(x,-160+1e-5);
  assert.ok(north.length&&south.length,`uncovered finite cap at X=${x}`);
  assert.equal(north[0].id,G);assert.equal(south[0].id,G);
  assert.ok(Math.abs(north[0].y-south[0].y)<.001,`finite grid cap at X=${x}`);
 }
 // The southern finite cap still has the reverse handover, beyond Frontier's grid.
 for(const x of[-195.25,-175.25,-165.25]){
  const north=hits(x,155-1e-5),south=hits(x,155+1e-5);
  assert.ok(north.length&&south.length,`uncovered southern cap at X=${x}`);
  assert.equal(north[0].id,F);assert.equal(south[0].id,A);
  assert.ok(Math.abs(north[0].y-south[0].y)<.001,`southern grid cap at X=${x}`);
 }
 for(const z of[115.25,130.25,145.25,154.75]){
  const west=hits(-160.0001,z),east=hits(-159.9999,z);
  assert.ok(west.length&&east.length,`uncovered southern shared edge at Z=${z}`);
  assert.ok(Math.abs(west[0].y-east[0].y)<.003,`southern rendered cut face at Z=${z}`);
 }
});

test('playable vertex heights, rule heightfields and coastal water classification are preserved',()=>{
 for(const[id,w]of Object.entries(worlds)){
  assert.deepEqual(Buffer.from(w.heightfield.data.buffer),hfBytes[id]);
  terrains[id].traverse(mesh=>{if(!mesh.geometry)return;const p=mesh.geometry.attributes.position,b=w.bounds;
   for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;
    const k=Math.round((z-w.heightfield.oz)/w.heightfield.res)*w.heightfield.w+Math.round((x-w.heightfield.ox)/w.heightfield.res);
    assert.equal(p.getY(i),w.heightfield.data[k],`${id} playable height at ${x},${z}`);
   }
  });
 }
 assert.equal(worlds[A].isWater(...local(A,-160,80)),false);
 assert.equal(worlds[F].isWater(...local(F,-160,80)),true,'the separate pre-existing coast rule mismatch is not silently changed');
});

test('retained decorative tree roots sample their actual terrain owner',()=>{
 let borrowed=0;
 for(const[id,w]of Object.entries(worlds))for(const tree of w.decor.edgeTrees){
  if(domains[id].owns(tree.x,tree.z))continue;
  const[x,z]=[tree.x+w.data.atlas.offset[0],tree.z+w.data.atlas.offset[1]],found=hits(x,z);
  if(!found.length)continue;
  const owner=found[0].id,expected=domains[owner].height(...local(owner,x,z),worlds[owner].groundY(...local(owner,x,z)));
  assert.ok(Math.abs(domains[id].groundHeight(tree.x,tree.z)-expected)<1e-6);borrowed++;
  // Independent of the height helper: intersect the production terrain triangles.
  // Native heightAt uses bilinear samples while the renderer triangulates cells.
  const ground=domains[id].groundHeight(tree.x,tree.z);
  assert.ok(Math.abs(ground-found[0].y)<.05,`tree root disagrees with actual triangles at ${x},${z}: ${ground} versus ${found[0].y}`);
 }
 assert.ok(borrowed>10,'exercise actual closed-end edge trees');
});

test('exterior forest cannot plant in an adjacent playable rectangle, including the Frontier camp corner',()=>{
 let excluded = 0, retained = 0;
 for (const [id, w] of Object.entries(worlds)) for (const tree of w.decor.edgeTrees) {
  const [x,z] = [tree.x+w.data.atlas.offset[0],tree.z+w.data.atlas.offset[1]];
  const neighbours = w.seams.map(s=>worlds[s.to]);
  const intrudes = neighbours.some(n=>{
   const nx=x-n.data.atlas.offset[0],nz=z-n.data.atlas.offset[1],b=n.bounds;
   return nx>=b.minX&&nx<=b.maxX&&nz>=b.minZ&&nz<=b.maxZ;
  });
  assert.equal(domains[id].edgeTreeAllowed(tree.x,tree.z),!intrudes,`${id} tree at ${x},${z}`);
  if (intrudes) excluded++; else retained++;
 }
 assert.ok(excluded>50,'exercise the actual overlapping border forest');
 assert.ok(retained>50,'retain the exterior world backdrop');
 const camp=worlds[G].decor.edgeTrees.filter(t=>{
  const [x,z]=[t.x+worlds[G].data.atlas.offset[0],t.z+worlds[G].data.atlas.offset[1]];
  return x>=-200&&x<=-160&&z>=-125&&z<=-61;
 });
 assert.ok(camp.length>20,'reproduce the supplied Frontier Settlement view');
 for (const t of camp) assert.equal(domains[G].edgeTreeAllowed(t.x,t.z),false);
});

test('the Grove gate road crosses terrain ownership without a rectangular paint cutoff',()=>{
 const z=-160.5;
 const west=roadMask(F,-160.001,z),east=roadMask(G,-159.999,z);
 assert.ok(west>.8&&east>.8,`road ends at the map boundary: ${west} / ${east}`);
 assert.ok(Math.abs(west-east)<.04,`road splat jumps at the join: ${west} / ${east}`);
 assert.ok(roadMask(F,-166,z)>.65,'the borrowed approach continues behind the boundary gate');
 assert.ok(roadMask(F,-183,z)<.15,'borrowed paint returns to native meadow within the existing seam band');
 assert.ok(worlds[F].roadDist(...local(F,-166,z))>20,'presentation approach leaves native gameplay roads unchanged');
});

test('decorative road continuation retains every native meadow clump and flower position',()=>{
 const world=worlds[F],field=surfaceData(world),paint=field.road,native=field.plantingRoad;
 assert.ok(native&&native!==paint,'retain the native planting mask separately from join paint');
 let expected;
 try {field.road=native;field.plantingRoad=null;expected=finishSteps(meadowPlantSteps(world,[]));}
 finally {field.road=paint;field.plantingRoad=native;}
 const actual=finishSteps(meadowPlantSteps(world,[]));
 assert.deepEqual(actual,expected,'painting across the map boundary must not remove or shift any grass/flowers');
});

test.after(()=>{for(const[id,g]of Object.entries(terrains)){disposeObject(g);releaseGroundCaches(worlds[id]);}});
