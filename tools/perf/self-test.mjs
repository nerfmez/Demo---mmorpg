import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRecorder,pf} from './recorder.mjs';
import {instrument} from './overlay.mjs';
const tick = async()=>{for(let i=0;i<4;i++)await Promise.resolve();};
function fixture(limit=100){let t=0;return {p:createRecorder({clock:()=>t,limit}),advance:v=>{t+=v;}};}
test('disabled facade preserves original functions and loaders without installing hooks',()=>{
 const f=()=>1,v={};assert.equal(pf.sync('x',f),f);assert.equal(pf.generator('x',f),f);assert.equal(pf.loader(v),v);assert.equal(pf.renderer(v),v);
});
test('sync timing retains this, return value, exceptions and nested boundaries',()=>{
 const {p,advance}=fixture(),answer={},failure=Error('original');
 const inner=p.sync('inner',()=>{advance(2);return answer;});
 const outer=p.sync('outer',function(x){assert.equal(this.x,3);advance(1);return inner(x);});
 assert.equal(outer.call({x:3},1),answer);assert.deepEqual(p.snapshot().events.map(e=>[e.name,e.durationMs,e.parent]),[['inner',2,'outer'],['outer',3,null]]);
 assert.throws(()=>p.sync('fail',()=>{throw failure;})(),e=>e===failure);
 assert.equal(p.snapshot().unfinishedSpans.length,0);
});
test('generator measures active resume time, not suspended wall time',()=>{
 const {p,advance}=fixture();
 function* raw(){advance(2);const x=yield 17;advance(3);return x;}
 const g=p.generator('terrain.build',raw)();assert.deepEqual(g.next(),{done:false,value:17});advance(500);
 assert.deepEqual(g.next(99),{done:true,value:99});assert.deepEqual(p.snapshot().events.map(e=>e.durationMs),[2,3]);
});
for(const how of ['return','throw'])test('generator forwards '+how+' and nested cleanup',()=>{
 const {p}=fixture();let closed=0;function* raw(){try{yield 1;}finally{closed++;}}
 const g=p.generator('region.build',raw,1)(null,{data:{id:'map'}});g.next();
 if(how==='return')assert.deepEqual(g.return(7),{done:true,value:7});else assert.throws(()=>g.throw(Error('same')),/same/);
 assert.equal(closed,1);assert.equal(p.snapshot().regions[0].status,how==='return'?'cancelled':'error');
});
test('proxy returns iterator result objects without rewrapping them',()=>{
 const {p}=fixture(),a={done:false,value:{}},b={done:true,value:7};let i=0;
 const g=p.generator('custom',()=>({next:()=>i++?b:a,[Symbol.iterator](){return this;}}))();assert.equal(g.next(),a);assert.equal(g.next(),b);assert.equal(g[Symbol.iterator](),g);
});
test('static-ready, imported-ready and disposal belong to each region instance',async()=>{
 const {p,advance}=fixture();let resolve;const ready=new Promise(r=>resolve=r),value={ready,disposed:false};
 const g=p.generator('region.build',function*(){advance(4);return value;},1)(null,{data:{id:'same-map'}});
 assert.equal(g.next().value,value);assert.equal(p.status().pendingImports,1);advance(10);resolve();await tick();
 assert.equal(p.snapshot().regions[0].staticReadyMs,4);assert.equal(p.snapshot().regions[0].importedReadyMs,14);p.disposed(value);assert.equal(p.snapshot().regions[0].status,'disposed');
});
test('late completion is recorded as discarded, not a ready live scene',async()=>{
 const {p}=fixture();let resolve;const value={ready:new Promise(r=>resolve=r),disposed:false};
 p.generator('region.build',function*(){return value;},1)(null,{data:{id:'map'}}).next();
 value.disposed=true;p.disposed(value);resolve();await tick();assert.equal(p.snapshot().regions[0].status,'disposed-late-result');
});
test('loader retains the exact original promise and this, counts concurrent work',async()=>{
 const {p}=fixture();let resolve,reject;const a=new Promise(r=>resolve=r),b=new Promise((_,r)=>reject=r);let i=0;
 const loader={loadAsync(){assert.equal(this,loader);return i++?b:a;}};p.loader(loader,'city');assert.equal(loader.loadAsync('a'),a);assert.equal(loader.loadAsync('b'),b);
 assert.equal(p.activeLoads,2);resolve();reject(Error('bad asset'));await tick();assert.equal(p.activeLoads,0);assert.equal(p.snapshot().maxActiveLoads,2);assert.equal(p.snapshot().errors.length,1);assert.equal(p.snapshot().events[1].status,'error');
});
test('unfinished spans and truncation are visible, never reported complete',()=>{
 const {p,advance}=fixture(2);p.begin('interrupted-assembly');for(let i=0;i<4;i++)p.end(p.begin('step'));
 advance(10);const s=p.snapshot();assert.equal(s.dropped,2);assert.equal(s.unfinishedSpans[0].elapsedMs,10);assert.equal(s.measurementComplete,false);
});
test('View counters include both passes and one total streaming budget sample',()=>{
 const {p,advance}=fixture();const info={autoReset:true,render:{calls:0,triangles:0},memory:{geometries:3,textures:4},reset(){this.render.calls=0;this.render.triangles=0;}};
 const renderer={info,compile(){},readRenderTargetPixels(){advance(2);},render(){info.render.calls+=5;info.render.triangles+=10;advance(2);}};
 class View{constructor(){this.renderer=renderer;this.neighbours=new Map();}updateStreaming(){advance(7);}switchRegion(){return true;}render(){this.updateStreaming();renderer.render();renderer.render();}}
 p.renderer(renderer);p.installView(View);const v=new View();v.render();advance(20);v.render();const f=p.snapshot().frames[1];
 assert.equal(f.drawCalls,10);assert.equal(f.streamingCpuMs,7);assert.equal(f.intervalMs,31);assert.equal(f.cpuMs,11);
});
test('frame percentiles use nearest rank and retain every stall over thresholds',()=>{
 const {p,advance}=fixture();const info={render:{calls:0,triangles:0},memory:{geometries:1,textures:1},reset(){}};
 class View{constructor(){this.renderer={info};this.neighbours=new Map();}render(){}updateStreaming(){}switchRegion(){}}
 p.installView(View);const v=new View();v.render();for(const n of [16,20,34,51,100]){advance(n);v.render();}
 assert.deepEqual(p.snapshot().summary['cold-open'],{samples:5,p95Ms:100,p99Ms:100,maxMs:100,over33:3,over50:2,hiddenSamples:0});
});
test('memory counts are not converted to invented GPU byte estimates',()=>{
 const {p}=fixture();p.sample({renderer:{info:{memory:{geometries:15,textures:8},programs:[]}},scene:{traverse:f=>{f();f();}},neighbours:new Map()},'quiet');
 const s=p.snapshot().memory[0];assert.equal(s.gpuBytes,null);assert.equal(s.geometries,15);assert.equal(s.sceneObjects,2);
});
test('exact-anchor overlay refuses unknown or drifted sources',()=>{
 assert.throws(()=>instrument('src/core/game.js',''),/unsupported/);assert.throws(()=>instrument('src/render/grass.js','export function nope() {}'),/anchor/);
 const source='export function* bakeGrassSteps(renderer,root,world) { yield 1; return 2; }';const transformed=instrument('src/render/grass.js',source);
 assert.match(transformed,/__pf.generator\("grass.bake", __pf_raw_bakeGrassSteps, 2\)/);assert.throws(()=>instrument('src/render/grass.js',transformed),/already instrumented/);
});
test('runner retains 30s navigation deadline, captures failures and demands three paired runs',()=>{
 const s=readFileSync(new URL('./run.mjs',import.meta.url),'utf8');assert.match(s,/rep<=3/);assert.match(s,/i<=6/);assert.match(s,/30000-\(Date.now\(\)-navigationStart\)/);assert.match(s,/ERR_BLOCKED_BY_ADMINISTRATOR/);assert.doesNotMatch(s,/g\.monsters\s*=|player\.hp\s*=/);
});

test('phase changes do not relabel later first frames as initial startup',()=>{
 const {p,advance}=fixture();const info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0},reset(){}};
 class View{constructor(){this.renderer={info};this.neighbours=new Map();}render(){}updateStreaming(){}switchRegion(){}}
 p.installView(View);const v=new View();advance(5);v.render();p.phase('next');advance(10);v.render();
 assert.equal(p.snapshot().frames[0].firstRenderDelayMs,5);assert.equal(p.snapshot().frames[1].firstRenderDelayMs,null);
});
