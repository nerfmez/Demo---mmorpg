// Executable lifecycle contracts. These are not GPU/FPS benchmarks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FrameBuildQueue,afterPaint} from '../../src/render/build-queue.js';
import {importJob} from '../../src/render/import-job.js';
import {regionShift,useRegion} from '../../src/render/region-shift.js';

function clockQueue(budgetMs=3){
  let time=0;const pending=[];
  const queue=new FrameBuildQueue({budgetMs,now:()=>time,schedule:fn=>{pending.push(fn);return ()=>{};}});
  return {queue,pending,tick:(n=1)=>{time+=n;},slice:()=>{assert.ok(pending.length);pending.shift()();},drain:()=>{let n=0;while(pending.length){assert.ok(n++<10000);pending.shift()();}}};
}
const countDispose=resource=>{let count=0;resource.addEventListener('dispose',()=>count++);return ()=>count;};

test('one aggregate budget, round-robin cities/regions, and explicit success',async()=>{
  const c=clockQueue(),order=[],stepTimes=[];
  function* work(id){for(let i=0;i<4;i++){order.push(id);c.tick();yield;}return id;}
  const a=c.queue.enqueue(work('city'),{onStep:ms=>stepTimes.push(ms)}),b=c.queue.enqueue(work('region'));
  assert.equal(c.pending.length,1);
  c.slice();assert.deepEqual(order,['city','region','city']);
  assert.equal(c.pending.length,1);assert.equal(a.state,'suspended');assert.equal(b.state,'suspended');
  c.drain();assert.deepEqual(await Promise.all([a.promise,b.promise]),['city','region']);
  assert.equal(a.state,'success');assert.equal(c.queue.stats.maxSliceMs,3);assert.deepEqual(stepTimes,[1,1,1,1,0]);
});

test('indivisible overruns remain visible, no false hard-budget assertion',async()=>{
  const c=clockQueue();const job=c.queue.enqueue((function*(){c.tick(19);yield;return 7;})());
  c.slice();assert.equal(job.stats.maxStepMs,19);assert.equal(c.queue.stats.maxSliceMs,19);
  assert.equal(job.state,'suspended');c.drain();assert.equal(await job.promise,7);
});

test('afterPaint schedules a task after rAF, never work inside the animation callback',()=>{
  const old={raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,st:globalThis.setTimeout,ct:globalThis.clearTimeout};
  const events=[];let raf,timer;
  globalThis.requestAnimationFrame=fn=>{raf=fn;return 1;};globalThis.cancelAnimationFrame=()=>events.push('cancel-frame');
  globalThis.setTimeout=fn=>{timer=fn;events.push('timer-scheduled');return 2;};globalThis.clearTimeout=()=>events.push('cancel-timer');
  try{const cancel=afterPaint(()=>events.push('work'));assert.deepEqual(events,[]);raf();assert.deepEqual(events,['timer-scheduled']);timer();assert.deepEqual(events,['timer-scheduled','work']);cancel();}
  finally{for(const [k,v]of [['requestAnimationFrame',old.raf],['cancelAnimationFrame',old.caf],['setTimeout',old.st],['clearTimeout',old.ct]]){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('cancel before start, while suspended, and during next never publishes success',async()=>{
  for(const mode of ['before','suspended','running']){
    const c=clockQueue(1),controller=new AbortController();let entered=0,closed=0;
    function* work(){try{entered++;c.tick();if(mode==='running')controller.abort();yield;return 'must not publish';}finally{closed++;}}
    const job=c.queue.enqueue(work(),{signal:controller.signal});const rejected=assert.rejects(job.promise,{name:'AbortError'});
    if(mode==='before')controller.abort();else{c.slice();if(mode==='suspended')controller.abort();}
    c.drain();await rejected;assert.equal(job.state,'cancelled');assert.equal(entered,mode==='before'?0:1);assert.equal(closed,entered);
  }
});

test('real exceptions reject rather than becoming successful readiness',async()=>{
  const c=clockQueue();const failure=new TypeError('shaderSource-shaped sentinel');
  const job=c.queue.enqueue((function*(){throw failure;})());const p=assert.rejects(job.promise,e=>e===failure);c.drain();await p;assert.equal(job.state,'error');
});

test('interleaved imports and cancelled finally blocks keep their captured region shift',async()=>{
  const c=clockQueue(1),prior=regionShift(),a={value:new THREE.Vector3(10,0,20)},b={value:new THREE.Vector3(-300,0,91)},observed=[];
  const signal=new AbortController(),ja=importJob({queue:c.queue,shift:a,signal:signal.signal}),jb=importJob({queue:c.queue,shift:b});
  function* work(id,shift){try{for(let i=0;i<3;i++){assert.equal(regionShift(),shift);observed.push(id);c.tick();yield;}}finally{assert.equal(regionShift(),shift);observed.push(id+'-finally');}}
  const pa=ja.run(work('A',a),'city'),pb=jb.run(work('B',b),'outpost');const rejected=assert.rejects(pa,{name:'AbortError'});
  c.slice();assert.equal(regionShift(),prior);c.slice();assert.equal(regionShift(),prior);signal.abort();c.drain();await rejected;await pb;
  assert.ok(observed.includes('A-finally'));assert.ok(observed.includes('B-finally'));assert.equal(regionShift(),prior);ja.abort();jb.abort();useRegion(prior);
});

test('cancel immediately frees owned construction resources and discards late GLTF results',()=>{
  const signal=new AbortController(),job=importJob({signal:signal.signal});
  const g=job.geometry(new THREE.BoxGeometry()),m=job.material(new THREE.MeshBasicMaterial()),t=job.texture(new THREE.Texture());
  const counts=[g,m,t].map(countDispose);signal.abort();assert.deepEqual(counts.map(f=>f()),[1,1,1]);
  const rawG=new THREE.BoxGeometry(),rawM=new THREE.MeshStandardMaterial(),rawT=new THREE.Texture();rawM.map=rawT;
  const late=new THREE.Mesh(rawG,rawM),lateCounts=[rawG,rawM,rawT].map(countDispose);
  assert.throws(()=>job.raw(late),{name:'AbortError'});job.abort(late);assert.deepEqual(lateCounts.map(f=>f()),[1,1,1]);
});

test('shared textures/cache materials survive cancellation; private import clones do not leak',()=>{
  const job=importJob(),shared=new THREE.MeshToonMaterial(),gradient=new THREE.Texture();shared.userData.shared=true;gradient.userData.shared=true;shared.gradientMap=gradient;
  const privateClone=shared.clone(),ownGeometry=job.geometry(new THREE.BoxGeometry());job.material(privateClone,true);
  const counters=[shared,gradient,privateClone,ownGeometry].map(countDispose);
  const root=new THREE.Group();root.add(new THREE.Mesh(ownGeometry,privateClone),new THREE.Mesh(new THREE.BoxGeometry(),shared));
  job.abort(root);assert.deepEqual(counters.map(f=>f()),[0,0,1,1]);job.abort(root);assert.deepEqual(counters.map(f=>f()),[0,0,1,1]);
});

test('success transfers only live resources, keeps shader-only dependencies, disposal is idempotent',()=>{
  const job=importJob(),g=job.geometry(new THREE.BoxGeometry()),unused=job.geometry(new THREE.PlaneGeometry());
  const m=job.material(new THREE.MeshBasicMaterial()),mask=job.texture(new THREE.Texture());job.depends(m,[mask]);
  const root=new THREE.Mesh(g,m),counts=[g,unused,m,mask].map(countDispose),dispose=job.commit(root);
  assert.deepEqual(counts.map(f=>f()),[0,1,0,0]);assert.throws(()=>job.raw(root),{name:'AbortError'});
  assert.deepEqual(counts.map(f=>f()),[0,1,0,0]);dispose();dispose();assert.deepEqual(counts.map(f=>f()),[1,1,1,1]);
});
