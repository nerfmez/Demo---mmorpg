// Production bake and region delegation with deterministic GPU fences. Pixel
// equivalence on real WebGL is checked separately by the browser probe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {FrameBuildQueue} from '../../src/render/build-queue.js';
import {regionShift,useRegion} from '../../src/render/region-shift.js';
const source=readFileSync(new URL('../../src/render/grass.js',import.meta.url),'utf8');
const bakeSource=source.slice(source.indexOf('export function bakeGrassColours')).replace(/\bexport /g,'');
const {bakeGrassColours,bakeGrassSteps}=Function('THREE','groundFieldUniforms','GROUND_COLOR_GLSL','prepareGrassCulling',bakeSource+'\nreturn {bakeGrassColours,bakeGrassSteps};')(THREE,()=>({}),'',()=>{});
const regionSource=readFileSync(new URL('../../src/render/region.js',import.meta.url),'utf8');
const inRegion=Function('regionShift','useRegion',regionSource.slice(regionSource.indexOf('export function* inRegion'),regionSource.indexOf('/** Synchronous compatibility')).replace(/\bexport /g,'')+'\nreturn inRegion;')(regionShift,useRegion);
function fixture(extraMeshes=0,count=9){
 const root=new THREE.Group(),g=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial();material.userData.groundBrush={value:null};
 for(const [k,n] of Object.entries({aGrassLight:3,aGrassDark:3,aGrassNormal:3,aGrassSplat:4,aGrassCoast:2,aGrassY:1,aGrassTown:1}))g.setAttribute(k,new THREE.InstancedBufferAttribute(new Float32Array(count*n),n));
 const mesh=new THREE.InstancedMesh(g,material,count);mesh.name='ground-blended-grass';for(let i=0;i<count;i++)mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i,0,i));root.add(mesh);
 for(let i=0;i<extraMeshes;i++){const extra=mesh.clone();extra.geometry=g.clone();extra.position.set(i+1,0,-i-1);root.add(extra);}
 const pending=[],disposed={points:0,target:0,material:0},original=new THREE.WebGLRenderTarget(4,4);let target=original,face=3,mip=2,color=new THREE.Color('#123456'),alpha=.7,mode=0,asyncCalls=0,syncCalls=0;
 const renderer={getRenderTarget:()=>target,getActiveCubeFace:()=>face,getActiveMipmapLevel:()=>mip,getClearColor:c=>c.copy(color),getClearAlpha:()=>alpha,
  setRenderTarget:(t,f=0,m=0)=>{target=t;face=f;mip=m;},setClearColor:(c,a)=>{color.set(c);alpha=a;},clear(){},
  render(scene){mode=scene.children[0].material.uniforms.uMode.value;},
  compileAsync(scene){const p=scene.children[0];p.geometry.addEventListener('dispose',()=>disposed.points++);p.material.addEventListener('dispose',()=>disposed.material++);return Promise.resolve();},
  readRenderTargetPixels(t,x,y,w,h,pixels){syncCalls++;pixels.fill(mode?151:83);},
  readRenderTargetPixelsAsync(t,x,y,w,h,pixels){asyncCalls++;const value=mode?151:83;if(asyncCalls%2===1)t.addEventListener('dispose',()=>disposed.target++);return new Promise((resolve,reject)=>pending.push({resolve:()=>{pixels.fill(value);resolve(pixels);},reject}));},
 };
 const state=()=>({target,face,mip,color:color.getHex(),alpha});
 return {root,mesh,renderer,pending,disposed,state,original,calls:()=>({asyncCalls,syncCalls})};
}
function queue(){const tasks=[];return {tasks,q:new FrameBuildQueue({schedule:fn=>{tasks.push(fn);return ()=>{};}}),drain(){while(tasks.length)tasks.shift()();}};}
async function settleMicrotasks(){await Promise.resolve();await Promise.resolve();}
test('async grass bake restores renderer state before waiting and produces identical attributes',async()=>{
 const sync=fixture();bakeGrassColours(sync.renderer,sync.root,{waterLevel:0});
 const f=fixture(),c=queue(),prior=f.state(),shift={value:new THREE.Vector3(30,0,-91)},outside=regionShift();
 const j=c.q.enqueue(inRegion(shift,bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true})));
 c.drain();await settleMicrotasks();c.drain();assert.equal(j.state,'waiting');assert.deepEqual(f.state(),prior);assert.equal(regionShift(),outside);
 // A game draw changes borrowed state while the first fence is pending.
 const gameTarget=new THREE.WebGLRenderTarget(8,8);f.renderer.setRenderTarget(gameTarget,1,1);f.renderer.setClearColor('#abcdef',.4);const during=f.state();
 f.pending.shift().resolve();await settleMicrotasks();assert.equal(f.mesh.geometry.attributes.aGrassBase,undefined);c.drain();assert.deepEqual(f.state(),during);
 f.pending.shift().resolve();await settleMicrotasks();c.drain();assert.equal(await j.promise,1);
 for(const name of ['aGrassBase','aGrassLawn'])assert.deepEqual(f.mesh.geometry.attributes[name].array,sync.mesh.geometry.attributes[name].array);
 assert.deepEqual(f.calls(),{asyncCalls:2,syncCalls:0});assert.deepEqual(f.disposed,{points:1,target:1,material:1});assert.deepEqual(f.state(),during);
});
test('evicted bake retains GPU owners until completion and closes nested region scopes',async()=>{
 const f=fixture(),c=queue(),signal=new AbortController(),outside=regionShift(),shift={value:new THREE.Vector3(100,0,200)};
 const j=c.q.enqueue(inRegion(shift,bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true})),{signal:signal.signal});const rejected=assert.rejects(j.promise,{name:'AbortError'});
 c.drain();await settleMicrotasks();c.drain();signal.abort();assert.deepEqual(f.disposed,{points:0,target:0,material:0});
 f.pending.shift().resolve();await settleMicrotasks();assert.equal(f.disposed.target,0);c.drain();await rejected;
 assert.deepEqual(f.disposed,{points:1,target:1,material:1});assert.equal(regionShift(),outside);assert.equal(f.mesh.geometry.attributes.aGrassBase,undefined);
});
test('readback failure propagates through nested region scopes and frees all bake owners',async()=>{
 const f=fixture(),c=queue(),error=new Error('GPU unavailable'),outside=regionShift();
 const j=c.q.enqueue(inRegion(outside,bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true})));const rejected=assert.rejects(j.promise,e=>e===error);
 c.drain();await settleMicrotasks();c.drain();f.pending.shift().reject(error);await settleMicrotasks();c.drain();await rejected;
 assert.deepEqual(f.disposed,{points:1,target:1,material:1});assert.equal(regionShift(),outside);
});

test('async atlas batches multiple chunks into two reads with exact per-mesh attributes',async()=>{
 const sync=fixture(2);bakeGrassColours(sync.renderer,sync.root,{waterLevel:0});
 const f=fixture(2),c=queue(),prior=f.state();
 const j=c.q.enqueue(bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true}));
 for(let i=0;i<20&&j.state!=='success';i++){
  c.drain();await settleMicrotasks();for(const pending of f.pending.splice(0))pending.resolve();await settleMicrotasks();
 }
 c.drain();assert.equal(await j.promise,3);assert.deepEqual(f.calls(),{asyncCalls:2,syncCalls:0});assert.equal(sync.calls().syncCalls,6);
 for(let i=0;i<3;i++)for(const name of ['aGrassBase','aGrassLawn'])assert.deepEqual(f.root.children[i].geometry.attributes[name].array,sync.root.children[i].geometry.attributes[name].array);
 assert.deepEqual(f.state(),prior);assert.deepEqual(f.disposed,{points:1,target:1,material:1});
});

test('large grass input uses bounded atlases instead of retaining a whole-map target',async()=>{
 const f=fixture(2,4000),c=queue(),sizes=[];
 const read=f.renderer.readRenderTargetPixelsAsync;f.renderer.readRenderTargetPixelsAsync=(target,x,y,w,h,pixels)=>{sizes.push(w*h);return read(target,x,y,w,h,pixels);};
 const j=c.q.enqueue(bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true}));
 for(let i=0;i<30&&j.state!=='success';i++){
  c.drain();await settleMicrotasks();for(const pending of f.pending.splice(0))pending.resolve();await settleMicrotasks();
 }
 c.drain();assert.equal(await j.promise,3);assert.equal(f.calls().asyncCalls,4);assert.ok(sizes.every(n=>n<=8192));
});
