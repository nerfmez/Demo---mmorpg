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
const {terrainSteps,releaseGroundCaches}=await import(process.env.TERRAIN_SOURCE || '../../src/render/ground.js');
jsonHook.deregister();

const data=loadData(),worlds=Object.fromEntries(Object.entries(data.maps).map(([id,wd])=>[id,createWorld(wd)]));
const domains=Object.fromEntries(Object.entries(worlds).map(([id,w])=>[id,terrainDomain(w,id=>worlds[id])]));
const A='azure-harbor-v1',F='frontier-wilds-v1';
const local=(id,x,z)=>[x-worlds[id].data.atlas.offset[0],z-worlds[id].data.atlas.offset[1]];
const hfBytes=Object.fromEntries(Object.entries(worlds).map(([id,w])=>[id,Buffer.from(w.heightfield.data.buffer).slice()]));
const terrains=Object.fromEntries(Object.entries(worlds).map(([id,w])=>{
 const result=finishSteps(terrainSteps(w,{domain:domains[id]}));result.group.position.set(...[w.data.atlas.offset[0],0,w.data.atlas.offset[1]]);result.group.updateMatrixWorld(true);return [id,result.group];
}));
const hits=(x,z)=>{
 const ray=new THREE.Raycaster(new THREE.Vector3(x,200,z),new THREE.Vector3(0,-1,0));
 return Object.entries(terrains).flatMap(([id,g])=>ray.intersectObject(g,true).map(h=>({id,y:h.point.y})));
};

test('actual finite terrain covers the northern hole and never overlaps its neighbour',()=>{
 for(const z of[-200.25,-170.25,-160.01,-159.99,-150.25,-140.25,-130.25,-120.25,-92.25,0.25,80.25,114.25])
  for(const x of[-175.25,-160.01,-159.99,-150.25,-130.25]){
   const found=hits(x,z);assert.ok(found.length,`missing terrain at ${x},${z}`);
   assert.equal(new Set(found.map(h=>h.id)).size,1,`overlapping regions at ${x},${z}`);
  }
 assert.equal(hits(-150.25,-200.25)[0].id,F,'Frontier retains its margin where Azure has no grid');
 assert.equal(hits(-150.25,-150.25)[0].id,A,'the overlapping strip still has one owner');
});

test('closed skirt edges and finite grid end meet at the same rendered height',()=>{
 for(let z=-160;z<=-120;z+=.25){
  const a=domains[A].height(...local(A,-160,z)),f=domains[F].height(...local(F,-160,z));
  assert.ok(Math.abs(a-f)<1e-6,`cut face at Z=${z}: ${a} versus ${f}`);
 }
 for(const z of[-159.75,-155.25,-150.25,-140.25,-130.25,-120.25]){
  const west=hits(-160.0001,z),east=hits(-159.9999,z);
  assert.ok(west.length&&east.length,`uncovered shared edge at Z=${z}`);
  assert.ok(Math.abs(west[0].y-east[0].y)<.003,`rendered cut face at Z=${z}`);
 }
 for(const x of[-155.25,-150.25,-140.25,-130.25]){
  const north=hits(x,-160-1e-5),south=hits(x,-160+1e-5);
  assert.ok(north.length&&south.length,`uncovered finite cap at X=${x}`);
  assert.equal(north[0].id,F);assert.equal(south[0].id,A);
  assert.ok(Math.abs(north[0].y-south[0].y)<.001,`finite grid cap at X=${x}`);
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
 }
 assert.ok(borrowed>10,'exercise actual closed-end edge trees');
});

test.after(()=>{for(const[id,g]of Object.entries(terrains)){disposeObject(g);releaseGroundCaches(worlds[id]);}});
