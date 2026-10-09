import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {terrainDomain} from '../../src/render/terrain-domain.js';
import {finishSteps} from '../../src/render/build-queue.js';
import {disposeObject} from '../../src/render/dispose.js';

const hook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {terrainSteps,waterSteps,releaseGroundCaches}=await import('../../src/render/ground.js');
hook.deregister();
const data=loadData(),A='azure-harbor-v1',F='frontier-wilds-v1';
const worlds=Object.fromEntries([A,F].map(id=>[id,createWorld(data.maps[id])]));
const domains=Object.fromEntries([A,F].map(id=>[id,terrainDomain(worlds[id],id=>worlds[id])]));
const local=(id,x,z)=>[x-worlds[id].data.atlas.offset[0],z-worlds[id].data.atlas.offset[1]];
const fieldBytes=Object.fromEntries([A,F].map(id=>[id,Buffer.from(worlds[id].heightfield.data.buffer).slice()]));
const groups=Object.fromEntries([A,F].map(id=>{
 const w=worlds[id],domain=domains[id];
 const terrain=finishSteps(terrainSteps(w,{domain})).group;
 const water=finishSteps(waterSteps(w,null,{domain}));
 for(const g of [terrain,water]){g.position.set(w.data.atlas.offset[0],0,w.data.atlas.offset[1]);g.updateMatrixWorld(true);}
 return [id,{terrain,water}];
}));
const attributeAt=(id,kind,x,z,attribute)=>{
 const ray=new THREE.Raycaster(new THREE.Vector3(x,200,z),new THREE.Vector3(0,-1,0));
 const hits=ray.intersectObject(groups[id][kind],true).filter(h=>h.object.geometry.attributes[attribute]);
 assert.ok(hits.length,`${id} ${kind} covers ${x},${z}`);
 const h=hits[0],g=h.object.geometry,p=g.attributes.position,attr=g.attributes[attribute];
 const point=h.object.worldToLocal(h.point.clone()),triangle=new THREE.Triangle(...[h.face.a,h.face.b,h.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(p,i)));
 const b=triangle.getBarycoord(point,new THREE.Vector3());
 return Array.from({length:attr.itemSize},(_,i)=>[h.face.a,h.face.b,h.face.c].reduce((sum,k,j)=>sum+attr.array[k*attr.itemSize+i]*b.getComponent(j),0));
};

test('rendered sand/wet mask and swash meet at the actual shared coastal edge',()=>{
 for(const z of [67.25,70.25,75.25,79.8,80.25,82.25,84.25,90.25,110.25]){
  const a=domains[A].coastAt(...local(A,-160,z)),f=domains[F].coastAt(...local(F,-160,z));
  assert.ok(Math.abs(a.distance-f.distance)<1e-9);assert.equal(a.beach,f.beach);
  for(const [kind,attribute,tolerance]of [['terrain','aCoast',.015],['water','shore',.015]]){
   if(kind==='water'&&z<75)continue; // retained native swash grids begin seaward of the dry back beach
   const west=attributeAt(F,kind,-160-1e-5,z,attribute),east=attributeAt(A,kind,-160+1e-5,z,attribute);
   for(let i=0;i<west.length;i++)assert.ok(Math.abs(west[i]-east[i])<tolerance,`${kind} ${attribute}[${i}] at ${z}: ${west[i]} / ${east[i]}`);
  }
 }
 assert.equal(domains[A].coastAt(-160,80).beach,15.5);
});

test('coastal blending recovers native samples outside the seam band and at inland seams',()=>{
 for(const [id,x,z]of [[A,-136,77],[F,-184,77],[A,-160,-92],[F,-160,-92],[A,-160,-140],[F,-160,-140],[A,-100,80],[F,-230,80]]){
  const [lx,lz]=local(id,x,z),w=worlds[id];
  assert.deepEqual(domains[id].coastAt(lx,lz),{...w.coastAt(lx,lz),beach:w.data.sea.beach||14,blend:0});
 }
 // No new jump at the band limits, back beach or shared boundary.
 for(const id of [A,F])for(const x of [-184,-160,-136])for(const z of [45,60,70,80,90]){
  const [lx,lz]=local(id,x,z),d=domains[id];
  assert.ok(Math.abs(d.coastAt(lx-1e-5,lz).distance-d.coastAt(lx+1e-5,lz).distance)<1e-3);
 }
});

test('rule heights/water and local contacts stay unchanged while sea phase uses atlas coordinates',()=>{
 for(const id of [A,F]){
  const w=worlds[id];assert.deepEqual(Buffer.from(w.heightfield.data.buffer),fieldBytes[id]);
  const sea=groups[id].water.children.find(m=>m.name==='sea-swash').material;
  assert.deepEqual(sea.uniforms.uAtlasOffset.value.toArray(),w.data.atlas.offset);
  // Contact texture bounds still describe the local coast, not its global shift.
  const bounds=sea.uniforms.uContactBounds.value;
  assert.ok(bounds.x>=w.bounds.minX-6&&bounds.x<w.bounds.maxX);
 }
 assert.equal(worlds[A].isWater(...local(A,-160,80)),false);
 assert.equal(worlds[F].isWater(...local(F,-160,80)),true);
});

test.after(()=>{for(const id of [A,F]){disposeObject(groups[id].terrain);disposeObject(groups[id].water);releaseGroundCaches(worlds[id]);}});
