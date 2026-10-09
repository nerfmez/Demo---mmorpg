// Execute production main frame/startup callbacks with UI/renderer doubles.
// This verifies control flow, not browser frame timing or rendered pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {FrameBuildQueue,afterPaint,useStartupTaskScheduling} from '../../src/render/build-queue.js';
import {prepareSpatialRegion} from '../../src/render/spatial-region.js';
import {compactResidentGeometry} from '../../src/render/resident-geometry.js';

const source=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
// Region imports pull Vite-only JSON/assets. Evaluate the unchanged production
// readiness functions while supplying already-built scene/renderer doubles.
const regionSource=readFileSync(new URL('../../src/render/region.js',import.meta.url),'utf8');
const placementSource=regionSource.slice(regionSource.indexOf('export function placeRegion('),regionSource.indexOf('export function disposeRegion('));
const placeRegion=Function(placementSource.replace(/^export /gm,'')+'\nreturn placeRegion;')();
const residentSource=readFileSync(new URL('../../src/render/resident-world.js',import.meta.url),'utf8');
const warmResidentSteps=Function('THREE',residentSource.slice(residentSource.indexOf('export function* warmResidentSteps('),residentSource.indexOf('export async function prepareResidentWorld(')).replace(/^export /gm,'')+'\nreturn warmResidentSteps;')(THREE);
const prepareResidentWorld=Function('THREE','startRegion','placeRegion','prepareSpatialRegion','compactResidentGeometry',
  residentSource.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\nreturn prepareResidentWorld;')(
    THREE,()=>{throw new Error('the harness supplies all three native resident regions');},placeRegion,prepareSpatialRegion,compactResidentGeometry);
const frameSource=source.slice(source.indexOf('function frame(now) {'),source.indexOf('if (tripCharacter)'));
const startupSource=source.slice(source.lastIndexOf('view.worldReady.then('));
assert.ok(startupSource.startsWith('view.worldReady.then('),'execute the production all-world readiness callback');
const schedulingSource=source.match(/^const releaseStartupScheduling = .*;$/m)?.[0] || 'const releaseStartupScheduling = () => {};';
const initialDrawState=source.match(/^let initialWorldReady = .*;$/m)?.[0] || 'let initialWorldReady = false;';
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test('High post warmup compiles gameplay shadows in target output mode and restores borrowed renderer state on failures',()=>{
  for(const fault of [null,'compile','render']){
    const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());root.add(mesh);
    mesh.visible=false;mesh.frustumCulled=true;
    const originalTarget={},scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    let current=originalTarget,face=3,mip=2,compiled=0,disposed=0,privateTarget;
    const renderer={shadowMap:{enabled:true},getRenderTarget:()=>current,getActiveCubeFace:()=>face,getActiveMipmapLevel:()=>mip,
      setRenderTarget(target,nextFace=0,nextMip=0){current=target;face=nextFace;mip=nextMip;},
      compile(batch,cam,targetScene){
        compiled++;assert.equal(this.shadowMap.enabled,true);assert.equal(cam,camera);assert.equal(targetScene,scene);
        assert.equal(batch.children[0],mesh);assert.equal(mesh.parent,root,'compilation borrows without changing disposal ownership');
        assert.equal(current.width,8,'post output variant compiles against a private render target');
        privateTarget=current;privateTarget.addEventListener('dispose',()=>disposed++);
        if(fault==='compile')throw new Error('compile sentinel');
      },
      render(){assert.equal(compiled,1);assert.equal(this.shadowMap.enabled,false);assert.equal(current,privateTarget);if(fault==='render')throw new Error('render sentinel');},
    };
    const view={renderer,scene,camera,post:{},hemisphere:new THREE.HemisphereLight(),sun:new THREE.DirectionalLight()};
    const steps=warmResidentSteps(view,{root});
    if(fault)assert.throws(()=>steps.next(),new RegExp(fault+' sentinel'));
    else {assert.equal(steps.next().done,false);steps.return();}
    assert.equal(current,originalTarget);assert.equal(face,3);assert.equal(mip,2);assert.equal(renderer.shadowMap.enabled,true);
    assert.equal(mesh.visible,false);assert.equal(mesh.frustumCulled,true);assert.equal(mesh.parent,root);assert.equal(disposed,1);
    mesh.geometry.dispose();mesh.material.dispose();
  }
});

function harness({game=false,fail=false}={}){
  const old={raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,st:globalThis.setTimeout,ct:globalThis.clearTimeout,mc:globalThis.MessageChannel};
  const frames=new Map(),timers=new Map(),errors=[],uploads=[],compiled=[];let id=0,clock=0,paintTime=0,timerTime=0,draws=0,uiFrames=0,updates=0;
  const raf=fn=>{const key=++id;frames.set(key,fn);return key;};
  globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=key=>frames.delete(key);
  globalThis.setTimeout=(fn,delay=0)=>{const key=++id;timers.set(key,{fn,at:timerTime+delay});return key;};globalThis.clearTimeout=key=>timers.delete(key);
  globalThis.MessageChannel=class {
    constructor(){
      this.port1={onmessage:null,close(){}};
      this.port2={postMessage:data=>{const handler=this.port1.onmessage;const key=++id;timers.set(key,{fn:()=>handler?.({data}),at:timerTime});},close(){}};
    }
  };
  const loading={textContent:'building',done:false,classList:{add(name){if(name==='done')loading.done=true;}}};
  const fullscreen={blocked:false},F={paused:false,modelsReady:false};
  const view={worldPrepared:false,coordinateOrigin:[0,0],regions:new Map(),neighbours:new Map(),
    scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),hemisphere:new THREE.HemisphereLight(),sun:new THREE.DirectionalLight(),
    ensureWreck(){},hitStop:0,render(){draws++;},setRenderScale(){}};
  let renderTarget=null;
  view.renderer={shadowMap:{enabled:true},getRenderTarget:()=>renderTarget,setRenderTarget:t=>{renderTarget=t;},
    compile(batch,camera,targetScene){
      assert.equal(this.shadowMap.enabled,true,'compile gameplay shadow receiving variant before disabling upload shadows');
      assert.equal(targetScene,view.scene,'compile with the real scene light/fog state');
      assert.equal(camera,view.camera);assert.equal(renderTarget,null,'direct rendering compiles the canvas output variant');
      assert.ok(batch.children.every(o=>!o.isLight),'borrowed compile batch cannot duplicate target scene lights');
      compiled.push(batch.children.find(o=>o.isMesh).userData.mapId);
    },
    render(scene){const mapId=scene.children.find(o=>o.isMesh).userData.mapId;
      assert.equal(this.shadowMap.enabled,false,'private upload draw omits costly shadow passes');
      assert.equal(compiled.at(-1),mapId,'exact gameplay material variant compiles before its upload draw');
      uploads.push(mapId);clock++;}};
  const session=game?{panels:{tab:null,isOpen:false},input:{aim:null,update(){}},completion:{isOpen:false,update(){}},questRoute:{update(){}},supplies:{update(){}},game:{ch:{opening:{stage:'done'}},update(){updates++;},drainEvents:()=>[]},hud:{update(){}},saveT:0,badgeT:0,refreshBadges(){},refreshPortrait(){}}:null;
  const queue=new FrameBuildQueue({budgetMs:1,now:()=>clock});
  view.buildQueue=queue;
  const importControls=new Map();
  for(const [index,mapId]of ['active','remote-one','remote-two'].entries()){
    const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
    mesh.userData.mapId=mapId;root.add(mesh);
    const region={root,shift:{value:new THREE.Vector3()},world:{data:{id:mapId,atlas:{offset:[index*32,0]}}},controller:new AbortController(),
      stats:{},staticReady:false,importedState:'building',npcs:[],npcMarkers:[],fires:[],chimneys:[],grass:[],waypointStones:new Map()};
    view.regions.set(mapId,region);
    let release;
    const imported=new Promise(resolve=>{release=resolve;});
    if(index)importControls.set(mapId,release);
    const job=queue.enqueue((function*(){
      region.staticReady=true;region.importedState='loading';clock++;yield;
      if(fail&&mapId==='remote-two')throw new Error('remote import sentinel');
      if(index)yield imported;
      region.importedState='imported-ready';clock++;return {status:'imported-ready'};
    })(),{signal:region.controller.signal});
    region.ready=job.promise;
  }
  view.region=view.regions.get('active');
  // Exercise production readiness, including each region's real upload generator
  // and spatial preparation, instead of equating active imports to world-ready.
  view.worldReady=prepareResidentWorld(view,{});
  const deps={view,F,fullscreen,session,document:{getElementById:()=>loading},console:{error:(...args)=>errors.push(args)},
    requestAnimationFrame:fn=>raf(t=>{uiFrames++;fn(t);}),useStartupTaskScheduling,performance:{now:()=>0}};
  const api=Function('deps',`const {view,F,fullscreen,document,console,requestAnimationFrame,useStartupTaskScheduling,performance}=deps;
    let session=deps.session;const governor=null,SAVE_ON=new Set();let last=0,time=0,fpsAcc=0,fpsN=0;
    ${initialDrawState}\n${schedulingSource}\n${frameSource}\n${startupSource}\nreturn {setSession(value){session=value;}};`)(deps);
  const tasks=async()=>{
    const pending=[...timers].filter(([,t])=>t.at<=timerTime).sort((a,b)=>a[1].at-b[1].at);
    for(const[key,t]of pending){if(timers.delete(key))t.fn();}await flush();
  };
  return {view,F,fullscreen,session,queue,loading,errors,uploads,compiled,api,releaseImport(id){importControls.get(id)();},
    get draws(){return draws;},get uiFrames(){return uiFrames;},get updates(){return updates;},
    async paint(){paintTime+=16;const f=[...frames.values()];frames.clear();f.forEach(fn=>fn(paintTime));timerTime=paintTime;await tasks();},
    async task(delta=0){timerTime+=delta;await tasks();},
    close(){for(const release of importControls.values())release();
      for(const region of view.regions.values()){region.controller.abort();region.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
      for(const[k,v]of [['requestAnimationFrame',old.raf],['cancelAnimationFrame',old.caf],['setTimeout',old.st],['clearTimeout',old.ct],['MessageChannel',old.mc]]){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
  };
}

async function advance(h,ready,{paint=true}={}){
  for(let i=0;!ready()&&i<100;i++)await(paint?h.paint():h.task());
  assert.ok(ready(),'bounded startup construction reaches its checkpoint');
}

for(const game of [false,true])test(`${game?'fresh game':'title'} keeps loading opaque and UI alive until all regional imports and uploads finish`,async()=>{
  const h=harness({game});
  try{
    await advance(h,()=>h.view.region.importedState==='imported-ready');
    assert.equal(h.view.region.staticReady,true);assert.equal(h.draws,0);assert.equal(h.loading.done,false);assert.ok(h.uiFrames>=2);
    assert.equal(h.view.worldPrepared,false,'the active region alone cannot release the complete-world gate');
    if(game)assert.equal(h.updates,0,'movement stays paused while the world is incomplete');
    h.releaseImport('remote-one');
    await advance(h,()=>h.view.regions.get('remote-one').importedState==='imported-ready');
    assert.equal(h.loading.done,false);assert.equal(h.draws,0);assert.deepEqual(h.uploads,[]);
    h.releaseImport('remote-two');
    await advance(h,()=>h.view.regions.get('remote-two').importedState==='imported-ready');
    assert.equal(h.loading.done,false,'all imports still precede the buffer-upload gate');
    await advance(h,()=>h.uploads.length===2);
    assert.equal(h.loading.done,false);assert.equal(h.view.worldPrepared,false);assert.equal(h.draws,0);
    await advance(h,()=>h.uploads.length===3);
    assert.equal(h.loading.done,false,'the last upload job must settle before revealing the world');
    await advance(h,()=>h.loading.done);
    assert.deepEqual(h.uploads,['active','remote-one','remote-two']);assert.deepEqual(h.compiled,h.uploads);assert.equal(h.view.worldPrepared,true);
    assert.equal(h.view.renderer.shadowMap.enabled,true,'warm tasks restore gameplay shadows');
    assert.equal(h.view.renderer.getRenderTarget(),null,'warm tasks restore the borrowed target before exposing the world');
    for(const region of h.view.regions.values())assert.ok(region.spatial,'all regions were spatially prepared');
    assert.equal(h.queue.schedule,afterPaint,'visible world restores the original paint scheduler');
    assert.equal(h.F.modelsReady,false,'drawing readiness must not depend on the separate model gate');
    await h.paint();assert.ok(h.draws>0,'drawing resumes after complete-world readiness');
    if(game)assert.ok(h.updates>0,'simulation resumes only after complete-world readiness');
    const drawn=h.draws;h.fullscreen.blocked=true;await h.paint();assert.equal(h.draws,drawn);
    h.fullscreen.blocked=false;await h.paint();assert.ok(h.draws>drawn);
    const resumed=h.draws;h.view.region=h.view.regions.get('remote-one');
    await h.paint();assert.ok(h.draws>resumed,'selecting a prepared resident region does not reset the draw gate');
    assert.equal(h.uploads.length,3,'region selection does not start another buffer upload');
    if(game){h.api.setSession(null);const beforeTitle=h.draws;await h.paint();assert.ok(h.draws>beforeTitle,'returning to the title still draws after initial readiness');}
  }finally{h.close();}
});

test('a remote import error stays observable and does not dismiss loading or draw a partial world',async()=>{
  const h=harness({fail:true});
  try{
    await advance(h,()=>h.errors.length===1);
    assert.equal(h.draws,0);assert.equal(h.loading.done,false);assert.equal(h.errors.length,1);
    assert.equal(h.view.region.importedState,'imported-ready','active imports cannot hide a remote error');
    assert.equal(h.view.worldPrepared,false);
    assert.equal(h.queue.schedule,afterPaint,'failure restores the original scheduler');
    assert.match(h.loading.textContent,/could not load/);assert.match(h.errors[0][1].message,/remote import sentinel/);
    assert.ok(h.uiFrames>=2,'error reporting keeps the UI frame loop alive');
    const message=h.loading.textContent;await h.paint();await h.paint();
    assert.equal(h.loading.textContent,message);assert.equal(h.loading.done,false);assert.equal(h.draws,0);
  }finally{h.close();}
});

test('actual startup readiness advances without UI rAF and restores paint scheduling before drawing',async()=>{
  const h=harness();
  try{
    assert.notEqual(h.queue.schedule,afterPaint);
    await h.task(16); // one-shot initial-frame fallback, not a construction slice
    assert.equal(h.queue.stats.steps,0);
    await h.task();assert.equal(h.queue.stats.steps,1);
    await advance(h,()=>h.view.region.importedState==='imported-ready',{paint:false});
    assert.equal(h.loading.done,false,'active imports cannot reveal remote regions with rAF withheld');
    h.releaseImport('remote-one');h.releaseImport('remote-two');await flush();
    await advance(h,()=>h.uploads.length===2,{paint:false});
    assert.equal(h.loading.done,false);assert.equal(h.view.worldPrepared,false);
    await advance(h,()=>h.loading.done,{paint:false});
    assert.equal(h.view.worldPrepared,true);assert.deepEqual(h.uploads,['active','remote-one','remote-two']);
    assert.equal(h.uiFrames,0);assert.equal(h.draws,0);assert.equal(h.queue.schedule,afterPaint);
    await h.paint();assert.ok(h.draws>0,'the unchanged UI frame starts drawing when rAF returns');
    const before=h.queue.stats.steps;
    const later=h.queue.enqueue((function*(){yield;})());
    await h.task();assert.equal(h.queue.stats.steps,before,'later construction still waits for paint');
    await h.paint();await h.paint();await later.promise;
  }finally{h.close();}
});

test('startup failure also releases scheduling with no UI rAF',async()=>{
  const h=harness({fail:true});
  try{
    await h.task(16);await advance(h,()=>h.errors.length===1,{paint:false});
    assert.equal(h.errors.length,1);assert.equal(h.loading.done,false);assert.equal(h.draws,0);
    assert.equal(h.uiFrames,0);assert.equal(h.queue.schedule,afterPaint);
  }finally{h.close();}
});


test('incomplete grass preparation cannot reveal an otherwise imported resident world', async () => {
  const h = harness();
  try {
    h.view.regions.get('remote-two').grassError = new Error('grass preparation sentinel');
    h.releaseImport('remote-one');h.releaseImport('remote-two');
    await advance(h, () => h.errors.length === 1);
    assert.equal(h.view.worldPrepared, false);assert.equal(h.loading.done, false);
    assert.equal(h.draws, 0);assert.deepEqual(h.uploads, []);
    assert.match(h.errors[0][1].message, /grass preparation sentinel/);
    assert.equal(h.queue.schedule, afterPaint);
  } finally {h.close();}
});
