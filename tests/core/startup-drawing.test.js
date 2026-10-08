// Execute production main frame/startup callbacks with UI/renderer doubles.
// This verifies control flow, not browser frame timing or rendered pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FrameBuildQueue,afterPaint,useStartupTaskScheduling} from '../../src/render/build-queue.js';

const source=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
const frameSource=source.slice(source.indexOf('function frame(now) {'),source.indexOf('if (tripCharacter)'));
const startupSource=source.slice(source.lastIndexOf('waitForRegionImports(view).then('));
const schedulingSource=source.match(/^const releaseStartupScheduling = .*;$/m)?.[0] || 'const releaseStartupScheduling = () => {};';
const initialDrawState=source.match(/^let initialWorldReady = .*;$/m)?.[0] || 'let initialWorldReady = false;';
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

function harness({game=false,fail=false}={}){
  const old={raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,st:globalThis.setTimeout,ct:globalThis.clearTimeout,mc:globalThis.MessageChannel};
  const frames=new Map(),timers=new Map(),errors=[];let id=0,clock=0,paintTime=0,timerTime=0,draws=0,uiFrames=0,updates=0;
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
  const view={region:{staticReady:false,importedState:'building'},hitStop:0,render(){draws++;},setRenderScale(){}};
  const session=game?{panels:{tab:null,isOpen:false},input:{aim:null,update(){}},completion:{isOpen:false,update(){}},questRoute:{update(){}},game:{ch:{opening:{stage:'done'}},update(){updates++;},drainEvents:()=>[]},hud:{update(){}},saveT:0,badgeT:0,refreshBadges(){},refreshPortrait(){}}:null;
  const queue=new FrameBuildQueue({budgetMs:1,now:()=>clock});
  view.buildQueue=queue;
  const job=queue.enqueue((function*(){
    if(fail)throw new Error('initial import sentinel');
    view.region.staticReady=true;view.region.importedState='loading';clock++;yield;
    clock++;yield;
    view.region.importedState='imported-ready';return {status:'imported-ready'};
  })());
  view.region.ready=job.promise;
  const deps={view,F,fullscreen,session,document:{getElementById:()=>loading},console:{error:(...args)=>errors.push(args)},
    requestAnimationFrame:fn=>raf(t=>{uiFrames++;fn(t);}),waitForRegionImports:target=>target.region.ready,useStartupTaskScheduling,performance:{now:()=>0}};
  const api=Function('deps',`const {view,F,fullscreen,document,console,requestAnimationFrame,waitForRegionImports,useStartupTaskScheduling,performance}=deps;
    let session=deps.session;const governor=null,SAVE_ON=new Set();let last=0,time=0,fpsAcc=0,fpsN=0;
    ${initialDrawState}\n${schedulingSource}\n${frameSource}\n${startupSource}\nreturn {setSession(value){session=value;}};`)(deps);
  const tasks=async()=>{
    const pending=[...timers].filter(([,t])=>t.at<=timerTime).sort((a,b)=>a[1].at-b[1].at);
    for(const[key,t]of pending){if(timers.delete(key))t.fn();}await flush();
  };
  return {view,F,fullscreen,session,queue,loading,errors,api,get draws(){return draws;},get uiFrames(){return uiFrames;},get updates(){return updates;},
    async paint(){paintTime+=16;const f=[...frames.values()];frames.clear();f.forEach(fn=>fn(paintTime));timerTime=paintTime;await tasks();},
    async task(delta=0){timerTime+=delta;await tasks();},
    close(){for(const[k,v]of [['requestAnimationFrame',old.raf],['cancelAnimationFrame',old.caf],['setTimeout',old.st],['clearTimeout',old.ct],['MessageChannel',old.mc]]){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
  };
}

for(const game of [false,true])test(`${game?'fresh game':'title'} keeps UI/queue alive without drawing an unfinished initial world`,async()=>{
  const h=harness({game});
  try{
    await h.paint();await h.paint();
    assert.equal(h.view.region.staticReady,true);assert.equal(h.view.region.importedState,'loading');
    assert.equal(h.draws,0);assert.equal(h.loading.done,false);assert.equal(h.queue.stats.steps,2);assert.ok(h.uiFrames>=2);
    if(game)assert.ok(h.updates>0,'existing simulation progression is unchanged');
    await h.paint();assert.equal(h.loading.done,true);assert.equal(h.view.region.importedState,'imported-ready');
    assert.equal(h.queue.schedule,afterPaint,'visible world restores the original paint scheduler');
    assert.equal(h.F.modelsReady,false,'drawing readiness must not depend on the separate model gate');
    await h.paint();assert.ok(h.draws>0,'drawing resumes after imported-ready');
    const drawn=h.draws;h.fullscreen.blocked=true;await h.paint();assert.equal(h.draws,drawn);
    h.fullscreen.blocked=false;await h.paint();assert.ok(h.draws>drawn);
    const resumed=h.draws;h.view.region={staticReady:true,importedState:'loading'};
    await h.paint();assert.ok(h.draws>resumed,'later region streaming does not reset the initial draw gate');
    if(game){h.api.setSession(null);const beforeTitle=h.draws;await h.paint();assert.ok(h.draws>beforeTitle,'returning to the title still draws after initial readiness');}
  }finally{h.close();}
});

test('an initial import error stays observable and does not dismiss loading or draw a partial world',async()=>{
  const h=harness({fail:true});
  try{
    await h.paint();await h.paint();
    assert.equal(h.draws,0);assert.equal(h.loading.done,false);assert.equal(h.errors.length,1);
    assert.equal(h.queue.schedule,afterPaint,'failure restores the original scheduler');
    assert.match(h.loading.textContent,/could not load/);assert.match(h.errors[0][1].message,/initial import sentinel/);
    assert.ok(h.uiFrames>=2,'error reporting keeps the UI frame loop alive');
  }finally{h.close();}
});

test('actual startup readiness advances without UI rAF and restores paint scheduling before drawing',async()=>{
  const h=harness();
  try{
    assert.notEqual(h.queue.schedule,afterPaint);
    await h.task(16); // one-shot initial-frame fallback, not a construction slice
    assert.equal(h.queue.stats.steps,0);
    await h.task();assert.equal(h.queue.stats.steps,1);
    await h.task();await h.task();
    assert.equal(h.loading.done,true);assert.equal(h.view.region.importedState,'imported-ready');
    assert.equal(h.uiFrames,0);assert.equal(h.draws,0);assert.equal(h.queue.schedule,afterPaint);
    await h.paint();assert.ok(h.draws>0,'the unchanged UI frame starts drawing when rAF returns');
    const before=h.queue.stats.steps;
    const later=h.queue.enqueue((function*(){yield;})());
    await h.task();assert.equal(h.queue.stats.steps,before,'later streaming still waits for paint');
    await h.paint();await h.paint();await later.promise;
  }finally{h.close();}
});

test('startup failure also releases scheduling with no UI rAF',async()=>{
  const h=harness({fail:true});
  try{
    await h.task(16);await h.task();
    assert.equal(h.errors.length,1);assert.equal(h.loading.done,false);assert.equal(h.draws,0);
    assert.equal(h.uiFrames,0);assert.equal(h.queue.schedule,afterPaint);
  }finally{h.close();}
});
