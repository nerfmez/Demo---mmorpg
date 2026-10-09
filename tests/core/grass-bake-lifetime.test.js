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
 return {root,mesh,renderer,pending,disposed,state,original,calls:()=>({asyncCalls,syncCalls}),mode:()=>mode};
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

for(const failure of [false,true])test(`a bounded grass failure ignores a late ${failure?'rejection':'resolution'} without a blocking read`,async()=>{
 const f=fixture(),c=queue(),prior=f.state(),unhandled=[],onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
 try{
  const j=c.q.enqueue(bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true,readbackTimeoutMs:5}));
  const rejected=assert.rejects(j.promise,/GPU readback did not settle in 5 ms/);
  c.drain();await settleMicrotasks();c.drain();await new Promise(r=>setTimeout(r,15));c.drain();await rejected;
  assert.equal(j.state,'error');assert.deepEqual(f.calls(),{asyncCalls:1,syncCalls:0});
  assert.deepEqual(f.state(),prior);assert.deepEqual(f.disposed,{points:1,target:1,material:1});
  if(failure)f.pending.shift().reject(new Error('late'));else f.pending.shift().resolve();
  await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(unhandled,[]);assert.equal(f.mesh.geometry.attributes.aGrassBase,undefined);
 }finally{process.off('unhandledRejection',onUnhandled);}
});

// A WebGL2 double for the bake's own cancellable readback: fences report `status()`.
function fakeGL(f,status){
 const buffers=new Set(),syncs=new Set();
 const gl={PIXEL_PACK_BUFFER:1,STREAM_READ:2,RGBA:3,UNSIGNED_BYTE:4,SYNC_GPU_COMMANDS_COMPLETE:5,SYNC_FLUSH_COMMANDS_BIT:6,ALREADY_SIGNALED:0x911a,TIMEOUT_EXPIRED:0x911b,WAIT_FAILED:0x911d,
  live:{buffers:0,syncs:0},polls:0,fences:0,
  createBuffer(){const b={value:0};buffers.add(b);gl.live.buffers++;return b;},deleteBuffer(b){assert.equal(buffers.delete(b),true,'buffer freed once');gl.live.buffers--;},bindBuffer(t,b){gl.bound=b;},bufferData(){},
  readPixels(){gl.bound.value=f.mode()?151:83;},fenceSync(){const sync={id:++gl.fences};syncs.add(sync);gl.live.syncs++;return sync;},deleteSync(sync){assert.equal(syncs.delete(sync),true,'each fence freed once');gl.live.syncs--;},flush(){},
  clientWaitSync(sync){gl.polls++;return status(sync);},getBufferSubData(t,o,out){out.fill(gl.bound.value);}};
 f.renderer.getContext=()=>gl;return gl;
}
async function run(f,c,options){
 const j=c.q.enqueue(bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true,...options}));
 j.promise.catch(()=>{}); // observe a bounded failure while the test pumps the queue
 for(let i=0;i<40&&!['success','error','cancelled'].includes(j.state);i++){c.drain();await new Promise(r=>setTimeout(r,10));}
 c.drain();return j.promise;
}

test('the cancellable readback reads the bound target, then frees its buffer and fence',async()=>{
 const sync=fixture();bakeGrassColours(sync.renderer,sync.root,{waterLevel:0});
 const f=fixture(),gl=fakeGL(f,()=>gl.ALREADY_SIGNALED);
 assert.equal(await run(f,queue()),1);
 for(const name of ['aGrassBase','aGrassLawn'])assert.deepEqual(f.mesh.geometry.attributes[name].array,sync.mesh.geometry.attributes[name].array);
 assert.deepEqual(gl.live,{buffers:0,syncs:0});assert.deepEqual(f.calls(),{asyncCalls:0,syncCalls:0});
});

test('a stalled grass fence is renewed asynchronously with identical colours and no blocking read',async()=>{
 const sync=fixture();bakeGrassColours(sync.renderer,sync.root,{waterLevel:0});
 const f=fixture(),gl=fakeGL(f,sync=>sync.id===1?gl.TIMEOUT_EXPIRED:gl.ALREADY_SIGNALED);
 assert.equal(await run(f,queue(),{readbackTimeoutMs:100}),1);
 for(const name of ['aGrassBase','aGrassLawn'])assert.deepEqual(f.mesh.geometry.attributes[name].array,sync.mesh.geometry.attributes[name].array);
 assert.deepEqual(f.calls(),{asyncCalls:0,syncCalls:0});assert.equal(gl.fences,3);
 assert.deepEqual(gl.live,{buffers:0,syncs:0});
});

test('a persistently stalled readback stops polling and frees original and renewed fences within its bound',async()=>{
 const f=fixture(),gl=fakeGL(f,()=>gl.TIMEOUT_EXPIRED);
 await assert.rejects(run(f,queue(),{readbackTimeoutMs:20}),/GPU readback did not settle in 20 ms/);
 assert.deepEqual(gl.live,{buffers:0,syncs:0});assert.equal(f.calls().syncCalls,0);assert.equal(gl.fences,2);
 const polls=gl.polls;await new Promise(r=>setTimeout(r,30));assert.equal(gl.polls,polls,'no polling after cancel');
});

test('aborted queued grass cancels a never-settling readback when the wait times out',async()=>{
 const f=fixture(),c=queue(),gl=fakeGL(f,()=>gl.TIMEOUT_EXPIRED),signal=new AbortController(),outside=regionShift(),prior=f.state();
 const render=f.renderer.render;f.renderer.render=scene=>{render(scene);f.renderer.getRenderTarget().addEventListener('dispose',()=>f.disposed.target++);};
 const timers=new Map(),oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;let id=0;
 globalThis.setTimeout=(fn,delay,...args)=>{timers.set(++id,{delay,run:()=>fn(...args)});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 const fire=delay=>{const entry=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(entry,`pending ${delay} ms timer`);timers.delete(entry[0]);entry[1].run();};
 try{
  const j=c.q.enqueue(inRegion({value:new THREE.Vector3(100,0,200)},bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true})),{signal:signal.signal});
  const rejected=assert.rejects(j.promise,{name:'AbortError'});
  c.drain();await settleMicrotasks();c.drain();assert.equal(j.state,'waiting');assert.deepEqual(gl.live,{buffers:1,syncs:1});
  fire(4);assert.equal(gl.polls,1);fire(250);assert.equal(gl.fences,2);const stalePoll=[...timers.values()].find(timer=>timer.delay===4).run;
  signal.abort();assert.equal(j.state,'waiting');assert.deepEqual(f.disposed,{points:0,target:0,material:0});
  // The queue retains owners until the bounded wait settles, then calls return(), not next().
  fire(5000);await settleMicrotasks();c.drain();await rejected;
  assert.equal(j.state,'cancelled');assert.deepEqual(f.disposed,{points:1,target:1,material:1});
  assert.deepEqual(gl.live,{buffers:0,syncs:0});assert.equal(timers.size,0,'all readback timers cleared');
  const polls=gl.polls;stalePoll();j.cancel();assert.equal(gl.polls,polls,'a stale poll cannot touch freed GPU owners');
  assert.deepEqual(gl.live,{buffers:0,syncs:0});assert.deepEqual(f.disposed,{points:1,target:1,material:1});
  assert.deepEqual(f.calls(),{asyncCalls:0,syncCalls:0});assert.equal(f.mesh.geometry.attributes.aGrassBase,undefined);
  assert.deepEqual(f.state(),prior);assert.equal(regionShift(),outside);
 }finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;}
});

test('a renewed fence failure releases owners exactly once without publishing grass',async()=>{
 const f=fixture(),gl=fakeGL(f,sync=>sync.id===1?gl.TIMEOUT_EXPIRED:gl.WAIT_FAILED);
 await assert.rejects(run(f,queue(),{readbackTimeoutMs:40}),/GPU readback failed/);
 assert.equal(gl.fences,2);assert.deepEqual(gl.live,{buffers:0,syncs:0});assert.equal(f.calls().syncCalls,0);
 assert.equal(f.mesh.geometry.attributes.aGrassBase,undefined);assert.deepEqual({points:f.disposed.points,material:f.disposed.material},{points:1,material:1});
});

for(const failure of [false,true])test(`cancelled grass ignores a late readback ${failure?'rejection':'resolution'}`,async()=>{
 const f=fixture(),c=queue(),signal=new AbortController(),outside=regionShift();
 const j=c.q.enqueue(inRegion(outside,bakeGrassSteps(f.renderer,f.root,{waterLevel:0},{asyncReadback:true,readbackTimeoutMs:5})),{signal:signal.signal});
 const rejected=assert.rejects(j.promise,{name:'AbortError'});
 c.drain();await settleMicrotasks();c.drain();assert.equal(j.state,'waiting');signal.abort();
 await new Promise(resolve=>setTimeout(resolve,15));c.drain();await rejected;
 if(failure)f.pending.shift().reject(new Error('late cancelled read'));else f.pending.shift().resolve();
 await new Promise(resolve=>setTimeout(resolve,0));c.drain();j.cancel();
 assert.equal(j.state,'cancelled');assert.deepEqual(f.disposed,{points:1,target:1,material:1});
 assert.equal(f.mesh.geometry.attributes.aGrassBase,undefined);assert.equal(f.mesh.geometry.attributes.aGrassLawn,undefined);
 assert.deepEqual(f.calls(),{asyncCalls:1,syncCalls:0});assert.equal(regionShift(),outside);
});
