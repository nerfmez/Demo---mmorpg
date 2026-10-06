// Scheduler/lifecycle contracts with real queues. No browser/GPU timing claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameBuildQueue,afterPaint,afterTask,useStartupTaskScheduling} from '../../src/render/build-queue.js';

function tasks(){
  const old={requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
  const frames=new Map(),timers=new Map();let id=0,time=0;
  globalThis.requestAnimationFrame=fn=>{const key=++id;frames.set(key,fn);return key;};
  globalThis.cancelAnimationFrame=key=>frames.delete(key);
  globalThis.setTimeout=(fn,delay=0)=>{const key=++id;timers.set(key,{fn,delay});return key;};
  globalThis.clearTimeout=key=>timers.delete(key);
  return {frames,timers,now:()=>time,tick:(n=1)=>{time+=n;},
    frame(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());},
    task(delay=0){const pending=[...timers].filter(([,t])=>t.delay===delay);for(const[key,t]of pending){if(timers.delete(key))t.fn();}},
    close(){for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
  };
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test('afterTask yields a future task and suppresses a cancelled stale callback',async()=>{
  const c=tasks();let steps=0;
  try{
    const cancel=afterTask(()=>steps++),stale=[...c.timers.values()][0].fn;
    await flush();assert.equal(steps,0,'a microtask checkpoint does not run construction');
    assert.equal(c.frames.size,0);cancel();stale();assert.equal(steps,0);
    afterTask(()=>steps++);c.task();assert.equal(steps,1);
  }finally{c.close();}
});

test('startup task slices retain the default six millisecond aggregate budget and round robin',async()=>{
  const c=tasks(),order=[];
  try{
    const queue=new FrameBuildQueue({now:c.now});
    function* work(label){for(let i=0;i<3;i++){order.push(label);c.tick(3);yield;}return label;}
    const a=queue.enqueue(work('city')),b=queue.enqueue(work('region'));
    const release=useStartupTaskScheduling(queue);
    assert.equal(queue.budgetMs,6);assert.equal(c.frames.size,1,'keep the initial paint request');
    c.task(16);assert.equal(queue.stats.steps,0,'fallback only schedules a future construction task');
    assert.equal(c.frames.size,0);c.task();
    assert.deepEqual(order,['city','region']);assert.equal(queue.stats.maxSliceMs,6);
    assert.equal(c.frames.size,0,'startup progress does not request a frame per slice');
    for(let i=0;i<4;i++)c.task();
    assert.deepEqual(await Promise.all([a.promise,b.promise]),['city','region']);
    assert.deepEqual(order,['city','region','city','region','city','region']);
    assert.equal(queue.budgetMs,6);release();assert.equal(queue.schedule,afterPaint);
  }finally{c.close();}
});

test('first paint can proceed; restoration cancels pending startup work and resumes after paint',async()=>{
  const c=tasks();
  try{
    const queue=new FrameBuildQueue({budgetMs:1,now:c.now});
    const job=queue.enqueue((function*(){for(let i=0;i<3;i++){c.tick();yield;}return 'done';})());
    const initial=queue.scheduled,release=useStartupTaskScheduling(queue);
    assert.equal(queue.scheduled,initial);c.frame();assert.equal(queue.stats.steps,0);
    c.task();assert.equal(queue.stats.steps,1);
    c.task(16);assert.equal(queue.stats.steps,1,'fallback does not cancel a newer handle');
    const stale=[...c.timers.values()].find(t=>t.delay===0).fn;
    release();assert.equal(queue.schedule,afterPaint);assert.equal(c.frames.size,1);
    stale();assert.equal(queue.stats.steps,1,'cancelled startup callback cannot drain twice');
    c.task();assert.equal(queue.stats.steps,1,'restored queue waits for paint');
    for(let i=0;i<3;i++){c.frame();c.task();}
    assert.equal(await job.promise,'done');release();assert.equal(c.frames.size,0);
  }finally{c.close();}
});

test('nested startup owners are queue local, release once, and restore the exact prior scheduler',()=>{
  const c=tasks();
  try{
    const original=run=>afterPaint(run),a=new FrameBuildQueue({schedule:original}),b=new FrameBuildQueue();
    const first=useStartupTaskScheduling(a),second=useStartupTaskScheduling(a);
    const other=useStartupTaskScheduling(b);
    assert.equal(c.timers.size,0,'empty queues need no first-frame fallback');
    first();first();assert.equal(a.schedule,afterTask);assert.equal(b.schedule,afterTask);
    second();assert.equal(a.schedule,original);assert.equal(b.schedule,afterTask);
    other();assert.equal(b.schedule,afterPaint);
    const again=useStartupTaskScheduling(a);assert.equal(a.schedule,afterTask);
    again();assert.equal(a.schedule,original);
  }finally{c.close();}
});

test('restoration preserves unrelated queued jobs and their completion',async()=>{
  const c=tasks(),order=[];
  try{
    const queue=new FrameBuildQueue({budgetMs:1,now:c.now});
    function* work(label){order.push(label);c.tick();yield;return label;}
    const first=queue.enqueue(work('initial')),release=useStartupTaskScheduling(queue);
    c.task(16);c.task();
    const other=queue.enqueue(work('neighbour'));release();
    assert.equal(queue.schedule,afterPaint);
    for(let i=0;i<4;i++){c.frame();c.task();}
    assert.deepEqual(await Promise.all([first.promise,other.promise]),['initial','neighbour']);
    assert.deepEqual(order,['initial','neighbour']);
    assert.equal(first.state,'success');assert.equal(other.state,'success');
  }finally{c.close();}
});

test('release before the initial fallback blocks stale takeover and cancellation remains terminal',async()=>{
  const c=tasks();
  try{
    const controller=new AbortController(),queue=new FrameBuildQueue({now:c.now});let entered=0;
    const job=queue.enqueue((function*(){entered++;yield;})(),{signal:controller.signal});
    const rejected=assert.rejects(job.promise,{name:'AbortError'});
    const release=useStartupTaskScheduling(queue),fallback=[...c.timers.values()].find(t=>t.delay===16).fn;
    controller.abort();release();const restored=queue.scheduled;
    fallback();assert.equal(queue.scheduled,restored);assert.equal(queue.schedule,afterPaint);
    assert.equal(c.timers.size,0);c.frame();c.task();await rejected;
    assert.equal(job.state,'cancelled');assert.equal(entered,0);assert.equal(queue.scheduled,null);
  }finally{c.close();}
});
