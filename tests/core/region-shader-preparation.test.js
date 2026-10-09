import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {FrameBuildQueue} from '../../src/render/build-queue.js';
const source=readFileSync(new URL('../../src/render/region.js',import.meta.url),'utf8');
const compileRegionSteps=Function('THREE',source.slice(source.indexOf('export function* compileRegionSteps'),source.indexOf('/** Synchronous compatibility')).replace('export ','')+'\nreturn compileRegionSteps;')(THREE);
const queue=()=>{const tasks=[],q=new FrameBuildQueue({schedule:fn=>{tasks.push(fn);return ()=>{};}});return {q,tasks,drain(){while(tasks.length)tasks.shift()();}};};
const sceneFixture=()=>{const root=new THREE.Group(),group=new THREE.Group();root.add(group);for(let i=0;i<37;i++)group.add(new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2));return {root,group,objects:[...group.children]};};
test('material preparation splits submission and borrows exact objects without reparenting',async()=>{
 const {root,group,objects}=sceneFixture(),c=queue(),scene=new THREE.Scene(),camera=new THREE.Camera(),batches=[];
 const view={scene,camera,renderer:{compileAsync(batch,cam,target){assert.equal(cam,camera);assert.equal(target,scene);batches.push([...batch.children]);for(const o of batch.children)assert.equal(o.parent,group);return Promise.resolve();}}};
 const job=c.q.enqueue(compileRegionSteps(view,root));
 for(let i=0;i<4;i++){c.drain();await Promise.resolve();}c.drain();await job.promise;
 assert.deepEqual(batches.map(a=>a.length),[16,16,5]);assert.deepEqual(batches.flat(),objects);assert.deepEqual(group.children,objects);assert.equal(root.parent,null);
});
test('cancelling an outstanding shader batch clears borrowed references after it settles',async()=>{
 const {root,group,objects}=sceneFixture(),c=queue(),signal=new AbortController();let resolve,borrowed,disposed=0;
 for(const o of objects)o.geometry.addEventListener('dispose',()=>disposed++);
 const view={renderer:{compileAsync(batch){borrowed=batch;return new Promise(r=>{resolve=r;});}}};
 const job=c.q.enqueue(compileRegionSteps(view,root),{signal:signal.signal}),rejected=assert.rejects(job.promise,{name:'AbortError'});
 c.drain();signal.abort();assert.equal(borrowed.children.length,16);resolve();await Promise.resolve();c.drain();await rejected;
 assert.equal(borrowed.children.length,0);assert.deepEqual(group.children,objects);assert.equal(disposed,0);
});
test('first-use textures upload one per step and shared maps are submitted once',()=>{
 const root=new THREE.Group(),map=new THREE.Texture(),field=new THREE.DataTexture(new Uint8Array(4),1,1);
 const a=new THREE.MeshBasicMaterial({map}),b=new THREE.ShaderMaterial({uniforms:{field:{value:field},borrowedMap:{value:map}}});root.add(new THREE.Mesh(new THREE.BoxGeometry(),a),new THREE.Mesh(new THREE.BoxGeometry(),b));
 const uploads=[],view={renderer:{initTexture:t=>uploads.push(t),compileAsync:()=>Promise.resolve()}};
 const steps=compileRegionSteps(view,root);assert.equal(steps.next().done,false);assert.deepEqual(uploads,[map]);assert.equal(steps.next().done,false);assert.deepEqual(uploads,[map,field]);
 const pending=steps.next();assert.ok(pending.value instanceof Promise);steps.return();assert.equal(a.map,map);assert.equal(b.uniforms.field.value,field);
});
