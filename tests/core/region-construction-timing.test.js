import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The region module imports browser-only assets. Execute its production timing
// wrapper with deterministic clocks and generators to verify control contracts.
const source=readFileSync(new URL('../../src/render/region.js',import.meta.url),'utf8');
const timing=source.slice(source.indexOf('export function* timedRegionSteps'),source.indexOf('// Materials made inside'));
const timedRegionSteps=Function(timing.replace(/^export /gm,'')+'\nreturn timedRegionSteps;')();

test('native stage diagnostics separate synchronous work, scheduler pauses and promise waits',()=>{
  let clock=100;const promise={},region={stats:{}};promise.then=()=>{};
  const result={complete:true};
  const steps=timedRegionSteps(region,'grass',(function*(){
    clock+=3;assert.equal(yield,7);clock+=5;assert.equal(yield promise,8);clock+=2;return result;
  })(),()=>clock);
  assert.deepEqual(steps.next(),{value:undefined,done:false});clock+=11;
  assert.deepEqual(steps.next(7),{value:promise,done:false});
  const stats=region.stats.construction.grass;assert.equal(stats.state,'waiting');assert.equal(stats.startedMs,100);assert.equal(stats.pausedAtMs,119);assert.equal(stats.cpuMs,8);assert.equal(stats.scheduleMs,11);
  clock+=20;assert.deepEqual(steps.next(8),{value:result,done:true});
  assert.equal(stats.state,'ready');assert.equal(stats.pausedAtMs,null);assert.equal(stats.steps,3);assert.equal(stats.waitingMs,20);assert.equal(stats.elapsedMs,41);assert.equal(stats.maxStepMs,5);
  assert.deepEqual(Object.keys(region.stats.construction),['grass']);
});

test('native stage wrapper forwards a rejected wait to the builder and preserves recovery',()=>{
  const error=new Error('fence sentinel'),promise={then(){}},region={stats:{}};
  let cleaned=0;
  const steps=timedRegionSteps(region,'grass',(function*(){try{try{yield promise;}catch(caught){assert.equal(caught,error);return 'recovered';}}finally{cleaned++;}})());
  assert.equal(steps.next().value,promise);assert.deepEqual(steps.throw(error),{value:'recovered',done:true});
  assert.equal(cleaned,1);assert.equal(region.stats.construction.grass.state,'ready');
});

test('native stage failures remain rejected and cancellation closes the current builder exactly once',()=>{
  for(const fault of ['throw','cancel','cleanup']){
    const error=new Error('builder sentinel'),region={stats:{}};let cleaned=0;
    const steps=timedRegionSteps(region,'terrain',(function*(){try{yield;}finally{cleaned++;if(fault==='cleanup')throw error;}})());
    steps.next();
    if(fault==='throw')assert.throws(()=>steps.throw(error),caught=>caught===error);
    else if(fault==='cleanup')assert.throws(()=>steps.return(),caught=>caught===error);
    else assert.equal(steps.return().done,true);
    const stats=region.stats.construction.terrain;
    assert.equal(cleaned,1);assert.equal(stats.state,fault==='throw'?'failed':'cancelled');assert.ok(stats.elapsedMs>=0);
    if(fault==='throw')assert.equal(stats.error,error.message);
  }
});
