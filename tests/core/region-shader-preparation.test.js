import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {FrameBuildQueue} from '../../src/render/build-queue.js';
const source=readFileSync(new URL('../../src/render/region.js',import.meta.url),'utf8');
const compileRegionSteps=Function('THREE',source.slice(source.indexOf('export function* compileRegionSteps'),source.indexOf('/** Synchronous compatibility')).replace('export ','')+'\nreturn compileRegionSteps;')(THREE);
const queue=()=>{const tasks=[],q=new FrameBuildQueue({schedule:fn=>{tasks.push(fn);return ()=>{};}});return {q,tasks,drain(){while(tasks.length)tasks.shift()();}};};
const sceneFixture=()=>{const root=new THREE.Group(),group=new THREE.Group();root.add(group);for(let i=0;i<37;i++)group.add(new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2));return {root,group,objects:[...group.children]};};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const noParallelCompiler={has:name=>{assert.equal(name,'KHR_parallel_shader_compile');return false;}};
test('material preparation splits submission and borrows exact objects without reparenting',async()=>{
 const {root,group,objects}=sceneFixture(),c=queue(),scene=new THREE.Scene(),camera=new THREE.Camera(),batches=[];
 const view={scene,camera,renderer:{compileAsync(batch,cam,target){assert.equal(cam,camera);assert.equal(target,scene);batches.push([...batch.children]);for(const o of batch.children)assert.equal(o.parent,group);return Promise.resolve();}}};
 const job=c.q.enqueue(compileRegionSteps(view,root));
 for(let i=0;i<4;i++){c.drain();await Promise.resolve();}c.drain();await job.promise;
 assert.deepEqual(batches.map(a=>a.length),[16,16,5]);assert.deepEqual(batches.flat(),objects);assert.deepEqual(group.children,objects);assert.equal(root.parent,null);
});
test('all bounded shader submissions precede one readiness barrier and cancellation waits for it',async()=>{
 const {root,group,objects}=sceneFixture(),c=queue(),signal=new AbortController(),pending=[];let borrowed,disposed=0;
 for(const o of objects)o.geometry.addEventListener('dispose',()=>disposed++);
 const view={renderer:{extensions:noParallelCompiler,compileAsync(batch){borrowed=batch;const wait=deferred();pending.push({wait,objects:[...batch.children]});return wait.promise;}}};
 const job=c.q.enqueue(compileRegionSteps(view,root),{signal:signal.signal}),rejected=assert.rejects(job.promise,{name:'AbortError'});
 c.drain();assert.equal(job.state,'waiting');assert.deepEqual(pending.map(p=>p.objects.length),[16,16,5]);assert.deepEqual(pending.flatMap(p=>p.objects),objects);
 signal.abort();assert.equal(borrowed.children.length,5);pending[0].wait.resolve();pending[1].wait.resolve();await Promise.resolve();c.drain();assert.equal(job.state,'waiting','no readiness/cancellation publication while another program is compiling');
 pending[2].wait.resolve();await Promise.resolve();await Promise.resolve();c.drain();await rejected;
 assert.equal(borrowed.children.length,0);assert.deepEqual(group.children,objects);assert.equal(disposed,0);
});
test('first-use textures upload one per step and shared maps are submitted once',()=>{
 const root=new THREE.Group(),map=new THREE.Texture(),field=new THREE.DataTexture(new Uint8Array(4),1,1);
 const a=new THREE.MeshBasicMaterial({map}),b=new THREE.ShaderMaterial({uniforms:{field:{value:field},borrowedMap:{value:map}}});root.add(new THREE.Mesh(new THREE.BoxGeometry(),a),new THREE.Mesh(new THREE.BoxGeometry(),b));
 const uploads=[],view={renderer:{extensions:noParallelCompiler,initTexture:t=>uploads.push(t),compileAsync:()=>Promise.resolve()}};
 const steps=compileRegionSteps(view,root);assert.equal(steps.next().done,false);assert.deepEqual(uploads,[map]);assert.equal(steps.next().done,false);assert.deepEqual(uploads,[map,field]);
 const submission=steps.next();assert.equal(submission.value,undefined);assert.equal(submission.done,false);
 const pending=steps.next();assert.ok(pending.value instanceof Promise);steps.return();assert.equal(a.map,map);assert.equal(b.uniforms.field.value,field);
});

test('a rejected early compile stays observed during submission and fails the final barrier',async()=>{
 const {root,group,objects}=sceneFixture(),error=new Error('shader compile sentinel'),wait=deferred(),unhandled=[];let calls=0,borrowed;
 const onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
 const steps=compileRegionSteps({renderer:{extensions:noParallelCompiler,compileAsync(batch){borrowed=batch;return ++calls===1?wait.promise:Promise.resolve();}}},root);
 try{
  assert.equal(steps.next().value,undefined);wait.reject(error);
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);
  assert.equal(steps.next().value,undefined);assert.equal(steps.next().value,undefined);
  const joined=steps.next().value;assert.ok(joined instanceof Promise);await assert.rejects(joined,e=>e===error);
  assert.throws(()=>steps.throw(error),e=>e===error);assert.equal(borrowed.children.length,0);assert.deepEqual(group.children,objects);
 }finally{steps.return();process.off('unhandledRejection',onUnhandled);}
});

test('cancellation between submissions releases borrowed references without disposing source objects',async()=>{
 const {root,group,objects}=sceneFixture(),wait=deferred();let borrowed,disposed=0;
 for(const o of objects)o.geometry.addEventListener('dispose',()=>disposed++);
 const steps=compileRegionSteps({renderer:{extensions:noParallelCompiler,compileAsync(batch){borrowed=batch;return wait.promise;}}},root);
 steps.next();assert.equal(borrowed.children.length,16);assert.equal(steps.return().done,true);
 assert.equal(borrowed.children.length,0);assert.deepEqual(group.children,objects);assert.equal(disposed,0);
 wait.reject(new Error('cancelled shader poll'));await new Promise(resolve=>setImmediate(resolve));
});

test('parallel shader drivers and unknown capability retain serial shared-material variant barriers',async()=>{
 for(const capability of [true,undefined]){
  const {root,objects}=sceneFixture(),c=queue(),material=objects[0].material,pending=[],batches=[];
  // A shared material is reused by distinct mesh/attribute variants. Submitting
  // the next batch before readiness would overwrite Three's currentProgram.
  for(const o of objects)o.material=material;
  const renderer={compileAsync(batch){assert.equal(pending.at(-1)?.settled??true,true);batches.push([...batch.children]);const wait=deferred();wait.settled=false;pending.push(wait);return wait.promise;}};
  if(capability!==undefined)renderer.extensions={has:()=>capability};
  const job=c.q.enqueue(compileRegionSteps({renderer},root));c.drain();assert.equal(job.state,'waiting');assert.equal(batches.length,1);
  for(let i=0;i<3;i++){
   assert.equal(batches.length,i+1);pending[i].settled=true;pending[i].resolve();await Promise.resolve();c.drain();
  }
  await job.promise;assert.deepEqual(batches.map(a=>a.length),[16,16,5]);assert.deepEqual(batches.flat(),objects);
 }
});

test('Three compileAsync polls captured materials after its scene children are replaced',async()=>{
 // Exercise the bundled renderer's actual method: submission captures materials
 // synchronously; the asynchronous driver poll does not traverse the scene.
 const rendererSource=readFileSync(new URL('../../node_modules/three/src/renderers/WebGLRenderer.js',import.meta.url),'utf8');
 const method=rendererSource.slice(rendererSource.indexOf('this.compileAsync = function'),rendererSource.indexOf('// Animation Loop',rendererSource.indexOf('this.compileAsync = function')));
 const timers=[],scene=new THREE.Group(),first=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),second=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());scene.add(first);
 let ready=false,submissions=0;
 const materialProperties=new Map([[first.material,{currentProgram:{isReady:()=>ready}}]]);
 const renderer={compile(root){submissions++;assert.equal(root,scene);return new Set(root.children.map(o=>o.material));}};
 const compile=Function('properties','extensions','setTimeout',method+'\nreturn this.compileAsync;').call(renderer,{get:m=>{assert.equal(m,first.material);return materialProperties.get(m);}}, {get:()=>null},fn=>timers.push(fn));
 let completed=false;const pending=compile.call(renderer,scene).then(result=>{completed=true;assert.equal(result,scene);});
 scene.children=[second];timers.shift()();await Promise.resolve();assert.equal(completed,false);assert.equal(submissions,1);
 ready=true;timers.shift()();await pending;assert.equal(completed,true);assert.equal(submissions,1);
});

test('Three marks no-extension programs ready immediately and polls real parallel compilations',()=>{
 const programSource=readFileSync(new URL('../../node_modules/three/src/renderers/webgl/WebGLProgram.js',import.meta.url),'utf8');
 const start=programSource.indexOf('let programReady ='),method=programSource.slice(start,programSource.indexOf('// free resource',start));
 const buildReady=Function('parameters','gl','program','COMPLETION_STATUS_KHR',method+'\nreturn this.isReady;');
 let polls=0,completed=false;const program={},status=0x91B1,gl={getProgramParameter(p,s){assert.equal(p,program);assert.equal(s,status);polls++;return completed;}};
 const immediate=buildReady.call({}, {rendererExtensionParallelShaderCompile:false},gl,program,status);
 assert.equal(immediate(),true);assert.equal(polls,0);
 const parallel=buildReady.call({}, {rendererExtensionParallelShaderCompile:true},gl,program,status);
 assert.equal(parallel(),false);assert.equal(polls,1);completed=true;assert.equal(parallel(),true);assert.equal(polls,2);
 assert.equal(parallel(),true);assert.equal(polls,2,'a prepared program no longer polls the driver');
});
