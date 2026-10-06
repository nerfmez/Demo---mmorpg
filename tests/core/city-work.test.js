import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityWorkQueue, afterCityFrame, drainSteps } from '../../src/render/city-work.js';

function fixture() {
  let now = 0;
  const frames = [];
  const run = createCityWorkQueue({budgetMs: 6, clock: () => now,
    schedule(fn) { const task = {fn}; frames.push(task); return () => { task.cancelled = true; }; }});
  return {run, frames, step(ms = 2) {now += ms;}, frame() {const task = frames.shift(); if (task && !task.cancelled) task.fn();}, flush() {while (frames.length) this.frame();}};
}
test('city queue shares one budget, round-robins jobs and does no work in enqueue microtasks', async () => {
  const f = fixture(), order = [], aStats = {}, bStats = {};
  function* steps(id) {for (let i = 0; i < 4; i++) {order.push(id); f.step(); yield;} return id;}
  const a = f.run(steps('a'), {stats:aStats}), b = f.run(steps('b'), {stats:bStats});
  await Promise.resolve(); assert.deepEqual(order, []); assert.equal(f.frames.length, 1);
  f.frame(); assert.deepEqual(order, ['a','b','a']); assert.equal(f.frames.length, 1);
  f.flush(); assert.deepEqual(await Promise.all([a,b]), ['a','b']);
  assert.equal(aStats.maxSliceMs, 6); assert.equal(aStats.maxStepMs, 2); assert.equal(bStats.maxSliceMs, 6);
});
test('abort removes queued work, unwinds nested finally in its own scope, and does not block another city', async () => {
  const f = fixture(), abort = new AbortController(); let scope = 'outside', closed = false;
  function* nested() {try {f.step(6); yield;} finally {assert.equal(scope,'city'); closed = true;}}
  const result = f.run((function*(){yield* nested(); throw new Error('must not resume');})(),
    {signal:abort.signal,resume(fn){const prev=scope;scope='city';try{return fn();}finally{scope=prev;}}});
  f.frame(); assert.equal(scope,'outside'); abort.abort();
  await assert.rejects(result,{name:'AbortError'}); assert.equal(closed,true); assert.equal(scope,'outside');
  const next=f.run((function*(){return 'new lifetime';})());f.flush();assert.equal(await next,'new lifetime');
});
test('failure rejects unchanged and releases temporary state; no silent success', async () => {
  const f=fixture(), error=new TypeError('shaderSource sentinel');let closed=false;
  const result=f.run((function*(){try {throw error;}finally{closed=true;}})());f.flush();
  await assert.rejects(result,e=>e===error);assert.equal(closed,true);
});
test('already aborted work never enters its generator', async () => {
  const f=fixture(), abort=new AbortController();abort.abort();let entered=false;
  await assert.rejects(f.run((function*(){entered=true;yield;})(),{signal:abort.signal}),{name:'AbortError'});
  assert.equal(entered,false);assert.equal(f.frames.length,0);
});
test('frame scheduling crosses a rendering callback AND a task boundary', async () => {
  const oldRAF=globalThis.requestAnimationFrame, oldCancel=globalThis.cancelAnimationFrame;
  let frame, ran=false;
  globalThis.requestAnimationFrame=fn=>(frame=fn,1);globalThis.cancelAnimationFrame=()=>{};
  try {
    afterCityFrame(()=>{ran=true;}); await Promise.resolve(); assert.equal(ran,false);
    frame(); await Promise.resolve(); assert.equal(ran,false);
    await new Promise(resolve=>setTimeout(resolve,5));assert.equal(ran,true);
  } finally {if(oldRAF)globalThis.requestAnimationFrame=oldRAF;else delete globalThis.requestAnimationFrame;if(oldCancel)globalThis.cancelAnimationFrame=oldCancel;else delete globalThis.cancelAnimationFrame;}
});
test('synchronous callers still receive the generator return value',()=>{
  assert.equal(drainSteps((function*(){yield;yield;return 17;})()),17);
});
