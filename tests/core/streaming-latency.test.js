// Production streaming control flow: bounded recovery, waiting-job identity and eviction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {FrameBuildQueue} from '../../src/render/build-queue.js';
import {disposeObject} from '../../src/render/dispose.js';
const source=readFileSync(new URL('../../src/render/view.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function harness({alwaysFail=false,degraded=false,preview=false}={}){
 let now=0,attempts=0,disposed=0,scheduling=0,released=0,gpuDisposals=0,materialDisposals=0;const tasks=[],wait=deferred(),scene=new THREE.Scene();
 const queue=new FrameBuildQueue({now:()=>now,schedule:fn=>{tasks.push(fn);return ()=>{};}});
 const neighbour={world:{data:{id:'neighbour',atlas:{offset:[-384,-93]}}},root:new THREE.Group(),grass:[],staticReady:true,shift:{value:new THREE.Vector3()}};
 const dispose=region=>{if(region.disposed)return;region.disposed=true;disposed++;region.previewRoot?.removeFromParent();region.root.removeFromParent();disposeObject(region.root);};
 if(preview){neighbour.staticReady=false;neighbour.terrain={group:new THREE.Group()};const mesh=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial());mesh.geometry.addEventListener('dispose',()=>gpuDisposals++);mesh.material.addEventListener('dispose',()=>materialDisposals++);neighbour.terrain.group.add(mesh);neighbour.root.add(neighbour.terrain.group);}
 function* regionSteps(view,world,region,{onTerrainReady}={}){attempts++;let completed=false;try{
  if(preview){onTerrainReady(neighbour);yield wait.promise;neighbour.staticReady=true;neighbour.grassReady=true;completed=true;return neighbour;}
  if(degraded){if(attempts>1)yield wait.promise;completed=true;return {...neighbour,root:new THREE.Group(),grassReady:degraded==='recover'&&attempts>1,grassError:degraded==='recover'&&attempts>1?null:Error('readback timed out')};}
  if(alwaysFail||attempts===1)throw Error('readback timed out');yield wait.promise;completed=true;return neighbour;
 }finally{if(!completed){if(preview)dispose(neighbour);else disposed++;}}}
 const View=Function('THREE','regionSteps','disposeRegion','placeRegion','useStartupTaskScheduling','STREAM_IN','STREAM_OUT','STREAM_BUDGET_MS','performance','console',source.slice(source.indexOf('export class View')).replace(/^export /,'')+'\nreturn View;')(
  THREE,regionSteps,dispose,(region,x,z)=>{region.root.position.set(x,0,z);region.shift.value.set(x,0,z);region.root.updateMatrixWorld(true);},()=>{scheduling++;let done=false;return ()=>{assert.equal(done,false);done=true;released++;};},140,200,6,{now:()=>now},{error(){}});
 const view=Object.create(View.prototype);Object.assign(view,{scene,buildQueue:queue,neighbours:new Map(),coreWorld:()=>neighbour.world,
  region:{world:{data:{id:'active',atlas:{offset:[0,0]}},bounds:{minX:0},seams:[{to:'neighbour',edge:'minX',span:[-30,30],alongX:false,outward:-1}]},grass:[]}});
 const pump=async()=>{for(let i=0;i<5;i++){while(tasks.length)tasks.shift()();await flush();}};
 return {view,queue,neighbour,wait,pump,tick:ms=>{now+=ms;},get attempts(){return attempts;},get disposed(){return disposed;},get gpuDisposals(){return {geometry:gpuDisposals,material:materialDisposals};},get scheduling(){return {owners:scheduling,released};}};
}
test('a failed streamed neighbour retries once after backoff and attaches successful output',async()=>{
 const h=harness();h.view.updateStreaming(8,0);await h.pump();const failed=h.view.neighbours.get('neighbour');
 assert.equal(failed.job.state,'error');assert.equal(h.view.neighbourReady('neighbour'),false);
 h.view.updateStreaming(8,0);await h.pump();assert.equal(h.attempts,1,'no immediate retry loop');
 h.tick(1000);h.view.updateStreaming(8,0);await h.pump();const retry=h.view.neighbours.get('neighbour');
 assert.notEqual(retry,failed);assert.equal(h.attempts,2);assert.equal(retry.job.state,'waiting');assert.equal(h.queue.jobs.length,0);
 h.view.updateStreaming(8,0);await h.pump();assert.equal(h.view.neighbours.get('neighbour'),retry,'a waiting job is still owned');assert.equal(h.attempts,2);
 h.wait.resolve();await h.pump();assert.equal(retry.job.state,'success');assert.equal(h.view.neighbourReady('neighbour'),true);assert.equal(h.neighbour.root.parent,h.view.scene);
 assert.deepEqual(h.scheduling,{owners:2,released:2});
});

test('completed terrain preview borrows owner buffers and cannot enable gameplay before static readiness',async()=>{
 const h=harness({preview:true});h.view.updateStreaming(8,0);await h.pump();const n=h.view.neighbours.get('neighbour'),preview=n.preview.previewRoot;
 assert.equal(n.job.state,'waiting');assert.equal(h.view.neighbourReady('neighbour'),false);assert.equal(n.region,null);
 assert.equal(preview.parent,h.view.scene);assert.deepEqual(preview.position.toArray(),[-384,0,-93]);assert.deepEqual(h.neighbour.root.position.toArray(),[0,0,0]);
 const original=h.neighbour.terrain.group.children[0],borrowed=preview.children[0].children[0];
 assert.equal(borrowed.geometry,original.geometry);assert.equal(borrowed.material,original.material);assert.deepEqual(h.gpuDisposals,{geometry:0,material:0});
 h.wait.resolve();await h.pump();assert.equal(h.view.neighbourReady('neighbour'),true);assert.equal(h.neighbour.grassReady,true);
 assert.equal(preview.parent,null);assert.equal(n.preview,null);assert.equal(h.neighbour.root.parent,h.view.scene);assert.deepEqual(h.gpuDisposals,{geometry:0,material:0});
 h.view.updateStreaming(10000,10000);assert.deepEqual(h.gpuDisposals,{geometry:1,material:1});assert.equal(h.disposed,1);
});

test('evicted terrain preview detaches immediately while its owner survives the wait and frees buffers once',async()=>{
 const h=harness({preview:true});h.view.updateStreaming(8,0);await h.pump();const n=h.view.neighbours.get('neighbour'),preview=n.preview.previewRoot;
 h.view.updateStreaming(10000,10000);assert.equal(preview.parent,null);assert.deepEqual(h.gpuDisposals,{geometry:0,material:0});assert.equal(h.view.neighbourReady('neighbour'),false);
 h.wait.resolve();await h.pump();assert.equal(n.job.state,'cancelled');assert.equal(h.neighbour.root.parent,null);assert.equal(h.disposed,1);
 assert.deepEqual(h.gpuDisposals,{geometry:1,material:1});assert.deepEqual(h.scheduling,{owners:1,released:1});
});
test('a persistently failed neighbour has a bounded retry count until it leaves the retained area',async()=>{
 const h=harness({alwaysFail:true});h.view.updateStreaming(8,0);await h.pump();
 h.tick(1000);h.view.updateStreaming(8,0);await h.pump();h.tick(10000);h.view.updateStreaming(8,0);await h.pump();
 assert.equal(h.attempts,2);assert.equal(h.disposed,2);assert.equal(h.view.neighbourReady('neighbour'),false);
 h.view.updateStreaming(10000,10000);assert.equal(h.view.neighbours.size,0);
 h.view.updateStreaming(8,0);await h.pump();assert.equal(h.attempts,3,'a later visit can try again');
});
test('eviction during the retry wait discards late output and cannot reattach a cancelled region',async()=>{
 const h=harness();h.view.updateStreaming(8,0);await h.pump();h.tick(1000);h.view.updateStreaming(8,0);await h.pump();
 const n=h.view.neighbours.get('neighbour');h.view.updateStreaming(10000,10000);assert.equal(h.view.neighbours.size,0);
 h.wait.resolve();await h.pump();assert.equal(n.job.state,'cancelled');assert.equal(h.neighbour.root.parent,null);assert.equal(h.disposed,2);assert.equal(h.view.neighbours.size,0);
 assert.deepEqual(h.scheduling,{owners:2,released:2});
});

test('persistent grass timeout retains a visible scene through retry and after the retry limit',async()=>{
 const h=harness({degraded:true});h.view.updateStreaming(8,0);await h.pump();const first=h.view.neighbours.get('neighbour'),old=first.region;
 assert.equal(first.job.state,'success');assert.ok(first.error);assert.equal(old.root.parent,h.view.scene);assert.equal(h.view.neighbourReady('neighbour'),true);
 h.tick(1000);h.view.updateStreaming(8,0);await h.pump();const retry=h.view.neighbours.get('neighbour');
 assert.equal(retry.job.state,'waiting');assert.equal(retry.region,old);assert.equal(old.root.parent,h.view.scene,'retry never blanks the fallback');
 h.wait.resolve();await h.pump();const terminal=retry.region;
 h.tick(10000);h.view.updateStreaming(8,0);await h.pump();assert.equal(h.attempts,2);
 assert.equal(terminal.root.parent,h.view.scene);assert.equal(h.view.neighbourReady('neighbour'),true);assert.ok(retry.error);
 assert.equal(old.root.parent,null);assert.equal(h.disposed,1);assert.deepEqual(h.scheduling,{owners:2,released:2});
 h.view.updateStreaming(10000,10000);assert.equal(terminal.root.parent,null);assert.equal(h.disposed,2);
});

test('eviction while retrying a grass timeout disposes the visible fallback and unfinished replacement',async()=>{
 const h=harness({degraded:true});h.view.updateStreaming(8,0);await h.pump();const old=h.view.neighbours.get('neighbour').region;
 h.tick(1000);h.view.updateStreaming(8,0);await h.pump();const retry=h.view.neighbours.get('neighbour');
 h.view.updateStreaming(10000,10000);assert.equal(old.root.parent,null);h.wait.resolve();await h.pump();
 assert.equal(retry.job.state,'cancelled');assert.equal(h.view.neighbours.size,0);assert.equal(h.disposed,2);assert.deepEqual(h.scheduling,{owners:2,released:2});
});

test('a successful grass retry replaces the fallback with full output and clears its error',async()=>{
 const h=harness({degraded:'recover'});h.view.updateStreaming(8,0);await h.pump();const old=h.view.neighbours.get('neighbour').region;
 assert.equal(old.grassReady,false);h.tick(1000);h.view.updateStreaming(8,0);await h.pump();
 assert.equal(old.root.parent,h.view.scene);h.wait.resolve();await h.pump();const n=h.view.neighbours.get('neighbour');
 assert.equal(n.region.grassReady,true);assert.equal(n.error,null);assert.equal(n.region.root.parent,h.view.scene);
 assert.equal(old.root.parent,null);assert.equal(h.disposed,1);assert.equal(h.view.neighbourReady('neighbour'),true);
});
