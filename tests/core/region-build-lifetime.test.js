// Execute production region control flow with instrumented builders/loaders.
// The doubles isolate lifetime/coordinates; they are not a WebGL or pixel test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {FrameBuildQueue,cancelledBuild} from '../../src/render/build-queue.js';
import {importJob} from '../../src/render/import-job.js';
import {beginRegion,useRegion,regionShift} from '../../src/render/region-shift.js';
import {disposeObject} from '../../src/render/dispose.js';
const source=readFileSync(new URL('../../src/render/region.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/\bexport /g,'');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(){
 const pending=[],city=deferred(),kit=deferred(),cacheReleased=[],parts=[];let now=0;
 const queue=new FrameBuildQueue({budgetMs:1,now:()=>now,schedule:fn=>{pending.push(fn);return ()=>{};}});
 const world={data:{id:'test-region',city:{enabled:true},town:{workbench:[3,4],trainer:[8,9]}},boxes:[],groundY:()=>0};
 const terrainSteps=function*(w,{adopt}){const group=new THREE.Group();parts.push(group);adopt(group);now++;yield;return {group};};
 const environmentSteps=function*(w,{adopt}){const root=new THREE.Group();adopt(root);now++;yield;return {root,waypoints:new Map()};};
 const waterSteps=function*(w,contacts,{owner,adopt}){const root=new THREE.Group();const mesh=new THREE.Mesh(owner.geometry(new THREE.PlaneGeometry()),owner.material(new THREE.MeshBasicMaterial()));root.add(mesh);adopt(root);now++;yield;return root;};
 const stub=function*(){now++;yield;return {};};
 const deps={THREE,importJob,cancelledBuild,terrainSteps,environmentSteps,waterSteps,releaseGroundCaches:w=>cacheReleased.push(w),batchStaticSteps:stub,bakeGrassSteps:stub,attachWindShadow:()=>{},buildHumanoid:()=>({root:new THREE.Group()}),HumanoidAnimator:class{},residentTool:()=>new THREE.Group(),loadCity:()=>city.promise,loadTownKit:()=>kit.promise,disposeObject,beginRegion,useRegion,regionShift,toon:()=>{const m=new THREE.MeshToonMaterial();m.userData.shared=true;return m;},glowTexture:()=>new THREE.Texture()};
 const api=Function(...Object.keys(deps),source+'\nreturn {startRegion,regionSteps,placeRegion,disposeRegion,waitForRegionImports};')(...Object.values(deps));
 const view={buildQueue:queue,renderer:{},vfx:{}};
 const pump=async()=>{for(let i=0;i<100;i++){while(pending.length)pending.shift()();await Promise.resolve();if(!pending.length){await Promise.resolve();if(!pending.length)return;}}throw Error('queue did not settle');};
 return {api,view,world,city,kit,pending,cacheReleased,parts,pump};
}
function imported(){const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();root.add(new THREE.Mesh(geometry,material));let calls=0;return {root,stats:{},dispose(){if(!calls++){disposeObject(root);}return new Set([geometry,material]);},calls:()=>calls};}

test('cancellation before first region step releases the eagerly-created startup owner',async()=>{
 const h=harness(),r=h.api.startRegion(h.view,h.world),rejected=assert.rejects(r.ready,{name:'AbortError'});
 r.controller.abort();await h.pump();await rejected;assert.equal(r.disposed,true);assert.equal(r.staticReady,false);assert.equal(h.cacheReleased.length,1);assert.equal(h.parts.length,0);
});

test('lazy neighbour generator owns no region before its first next',()=>{
 const h=harness(),prior=regionShift(),steps=h.api.regionSteps(h.view,h.world);steps.return();assert.equal(regionShift(),prior);assert.deepEqual(h.cacheReleased,[]);assert.deepEqual(h.parts,[]);
});

test('interrupted static construction disposes adopted partial roots and restores shift',async()=>{
 const h=harness(),r=h.api.startRegion(h.view,h.world),prior=regionShift();const p=assert.rejects(r.ready,{name:'AbortError'});
 h.pending.shift()();assert.equal(h.parts.length,1);assert.equal(regionShift(),prior);r.controller.abort();await h.pump();await p;
 assert.equal(r.disposed,true);assert.equal(r.importedState,'cancelled');assert.equal(h.cacheReleased.length,1);
});

test('imported-ready waits for water assembly and outpost completion, then installs at latest shift once',async()=>{
 const h=harness(),r=h.api.startRegion(h.view,h.world);await h.pump();await r.staticReadyPromise;assert.equal(r.staticReady,true);assert.equal(r.importedState,'loading');
 h.api.placeRegion(r,-384,93);const city=imported();city.root.position.set(17,0,-9);h.city.resolve(city);await h.pump();assert.equal(r.importedState,'loading');
 h.kit.resolve(null);await h.pump();assert.deepEqual(await r.ready,{status:'imported-ready'});assert.equal(city.root.parent,r.root);
 const position=new THREE.Vector3().setFromMatrixPosition(city.root.matrixWorld);assert.deepEqual(position.toArray(),[-367,0,84]);
 h.api.placeRegion(r,0,0);const changed=new THREE.Vector3().setFromMatrixPosition(city.root.matrixWorld);assert.deepEqual(changed.toArray(),[17,0,-9]);
 h.api.disposeRegion(r);h.api.disposeRegion(r);assert.equal(h.cacheReleased.length,1);
});

test('late imports cannot attach after eviction; replacement keeps shared world caches alive',async()=>{
 const h=harness(),old=h.api.startRegion(h.view,h.world);await h.pump();await old.staticReadyPromise;
 const replacement=h.api.startRegion(h.view,h.world);h.api.disposeRegion(old);assert.equal(h.cacheReleased.length,0);
 const late=imported();h.city.resolve(late);await h.pump();assert.deepEqual(await old.ready,{status:'cancelled'});assert.equal(old.cityRoot,undefined);
 // Dispose replacement before the shared fixture result can be accepted as final.
 h.api.disposeRegion(replacement);h.kit.resolve(null);await h.pump();await replacement.ready.catch(()=>{});assert.equal(h.cacheReleased.length,1);
});

test('loader errors remain errors, not cancelled/imported-ready',async()=>{
 const h=harness(),r=h.api.startRegion(h.view,h.world),error=new Error('loader failed');
 const oldConsole=console.error;console.error=()=>{};
 try{const rejected=assert.rejects(r.ready,e=>e===error);await h.pump();h.city.reject(error);await h.pump();await rejected;assert.equal(r.importedState,'error');assert.equal(r.error,error);assert.equal(r.cityRoot,undefined);h.api.disposeRegion(r);assert.equal(r.importedState,'error');}
 finally{console.error=oldConsole;}
});

test('startup readiness follows a replacement after cancelled old construction, never a cancelled success',async()=>{
 for(const rejection of [false,true]){
  const h=harness(),old=deferred(),next=deferred();
  const a={ready:old.promise,importedState:'loading'},b={ready:next.promise,importedState:'loading'};
  h.view.region=a;let finished=false;const waiting=h.api.waitForRegionImports(h.view).then(result=>{finished=true;return result;});
  h.view.region=b;a.disposed=true;a.importedState='cancelled';
  if(rejection)old.reject(cancelledBuild());else old.resolve({status:'cancelled'});
  await Promise.resolve();await Promise.resolve();assert.equal(finished,false);
  b.importedState='imported-ready';next.resolve({status:'imported-ready'});assert.deepEqual(await waiting,{status:'imported-ready'});
 }
});

test('startup readiness retains real errors and rejects cancellation of the current region',async()=>{
 const h=harness(),error=new Error('asset failed');
 h.view.region={ready:Promise.reject(error),importedState:'error'};
 await assert.rejects(h.api.waitForRegionImports(h.view),e=>e===error);
 h.view.region={ready:Promise.resolve({status:'cancelled'}),disposed:true,importedState:'cancelled'};
 await assert.rejects(h.api.waitForRegionImports(h.view),{name:'AbortError'});
});
