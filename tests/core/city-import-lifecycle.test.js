// Execute production region lifetime/installation code with isolated scenery and
// loader doubles. This tests control flow/transforms, not rendering or device FPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createCityWorkQueue} from '../../src/render/city-work.js';
import {cityAbortError} from '../../src/render/city-work.js';
import {disposeObject} from '../../src/render/dispose.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function fixture({waterError=null}={}) {
 const tasks=[], cities=[],kits=[];let clock=0,current,cacheReleases=0;const waters=[];
 const runCitySteps=createCityWorkQueue({clock:()=>clock,schedule:fn=>{const t={fn};tasks.push(t);return()=>{t.cancelled=true;};}});
 const world={data:{id:'test-city',city:{enabled:true},town:{workbench:[0,0],trainer:[4,4]}},boxes:[],groundY:()=>0};
 const deps={THREE,runCitySteps,cityAbortError,disposeObject,
  beginRegion:()=>current={value:new THREE.Vector3()},regionShift:()=>current,useRegion:s=>current=s,
  terrainSteps:function*(){return{group:new THREE.Group()};},environmentSteps:function*(){return{root:new THREE.Group(),waypoints:new Map()};},
  bakeGrassSteps:function*(){},batchStatic:()=>({}),attachWindShadow:()=>{},residentTool:()=>new THREE.Group(),
  buildHumanoid:()=>({root:new THREE.Group(),bones:{handR:new THREE.Group()}}),HumanoidAnimator:class{},toon:()=>new THREE.MeshBasicMaterial(),glowTexture:()=>null,
  releaseGroundCaches:()=>{cacheReleases++;},
  createWater:()=>{if(waterError)throw waterError;clock+=6;const w=new THREE.Group(),m=new THREE.MeshBasicMaterial(),g=new THREE.PlaneGeometry();w.add(new THREE.Mesh(g,m));w.userData.contactSections=2;waters.push(w);return w;},
  loadCity:(_w,options)=>{const d=deferred();cities.push({...d,options});return d.promise;},
  loadTownKit:()=>{const d=deferred();kits.push(d);return d.promise;},
 };
 const source=readFileSync(new URL('../../src/render/region.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const api=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;\n${source}\nreturn {buildRegion,placeRegion,disposeRegion};`)(deps);
 function built() {const r=api.buildRegion({renderer:{},vfx:{}},world);new THREE.Scene().add(r.root);return r;}
 function cityResult() {const root=new THREE.Group(),child=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());root.position.set(10,0,20);child.position.set(1,0,2);root.add(child);root.updateMatrixWorld(true);root.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});let disposed=0;return{root,child,stats:{},dispose(){if(disposed)return;disposed++;disposeObject(root);},get disposed(){return disposed;}};}
 return{...api,built,cities,kits,tasks,waters,world,cityResult,get cacheReleases(){return cacheReleases;},get current(){return current;},
  frame(){const t=tasks.shift();if(t&&!t.cancelled)t.fn();},foreign(){current={value:new THREE.Vector3(700,0,900)};return current;}};
}
test('imported-ready follows water bake, installation and town kit; latest atlas shift is applied once',async()=>{
 const f=fixture(),r=f.built(),c=f.cityResult();f.cities[0].resolve(c);await tick();
 assert.equal(r.importedStatus,'loading');assert.equal(c.root.parent,null);
 f.placeRegion(r,100,200);const foreign=f.foreign();f.frame();await tick();
 assert.equal(f.current,foreign);assert.equal(c.root.parent,null);assert.equal(f.waters.length,1);assert.equal(f.kits.length,0);
 f.placeRegion(r,-40,80);f.frame();await tick();assert.equal(c.root.parent,r.root);
 assert.deepEqual(c.child.matrixWorld.elements.slice(12,15),[-29,0,102]);
 assert.equal(f.current,foreign);assert.notEqual(r.importedStatus,'imported-ready');assert.equal(f.kits.length,1);
 f.kits[0].resolve(null);assert.deepEqual(await r.ready,{status:'imported-ready'});
 assert.equal(r.stats.city,c.stats);
});
test('dispose between bake and installation cancels result, releases water and does not load another kit',async()=>{
 const f=fixture(),r=f.built(),c=f.cityResult();f.cities[0].resolve(c);await tick();f.frame();await tick();
 let waterFreed=0;f.waters[0].children[0].geometry.addEventListener('dispose',()=>waterFreed++);
 f.disposeRegion(r);assert.deepEqual(await r.ready,{status:'cancelled'});
 assert.equal(c.disposed,1);assert.equal(c.root.parent,null);assert.equal(waterFreed,1);assert.equal(f.kits.length,0);
});
test('late load after region disposal is released, and reentry lifetime is independent',async()=>{
 const f=fixture(),old=f.built();f.disposeRegion(old);const current=f.built(),late=f.cityResult();
 f.cities[0].resolve(late);assert.deepEqual(await old.ready,{status:'cancelled'});assert.equal(late.disposed,1);
 const releases=f.cacheReleases;f.disposeRegion(old);assert.equal(f.cacheReleases,releases,'stale cleanup cannot release new ground cache');
 const c=f.cityResult();f.cities[1].resolve(c);await tick();f.frame();await tick();f.frame();await tick();f.kits[0].resolve(null);
 assert.deepEqual(await current.ready,{status:'imported-ready'});assert.equal(c.disposed,0);assert.equal(c.root.parent,current.root);
});
test('postload cancellation and error have distinct terminal states',async()=>{
 const f=fixture(),r=f.built();const error=new Error('invalid city model');f.cities[0].reject(error);
 await assert.rejects(r.ready,e=>e===error);assert.equal(r.importedStatus,'error');assert.equal(r.importError,error);
});
test('water/shader-style exception is observable and cannot mark imported-ready',async()=>{
 const error=new TypeError('shaderSource sentinel'),f=fixture({waterError:error}),r=f.built(),c=f.cityResult();f.cities[0].resolve(c);await tick();f.frame();
 await assert.rejects(r.ready,e=>e===error);assert.equal(r.importedStatus,'error');assert.equal(c.disposed,1);assert.equal(f.kits.length,0);
});
test('disposed load state callback cannot overwrite cancellation',async()=>{
 const f=fixture(),r=f.built();f.disposeRegion(r);f.cities[0].options.onState('assembling');assert.equal(r.importedStatus,'cancelled');
 f.cities[0].reject(cityAbortError());assert.deepEqual(await r.ready,{status:'cancelled'});
});
