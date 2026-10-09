// Scheduler/lifecycle contracts with real queues. No browser/GPU timing claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameBuildQueue,afterPaint,afterTask,useStartupTaskScheduling} from '../../src/render/build-queue.js';

function tasks(){
  const old={requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,MessageChannel:globalThis.MessageChannel};
  const frames=new Map(),timers=new Map(),messages=new Map(),channels=[];let id=0,time=0;
  globalThis.requestAnimationFrame=fn=>{const key=++id;frames.set(key,fn);return key;};
  globalThis.cancelAnimationFrame=key=>frames.delete(key);
  globalThis.setTimeout=(fn,delay=0)=>{const key=++id;timers.set(key,{fn,delay});return key;};
  globalThis.clearTimeout=key=>timers.delete(key);
  globalThis.MessageChannel=class {
    constructor(){
      this.port1={onmessage:null,closed:0,close(){this.closed++;}};
      this.port2={closed:0,postMessage:data=>{const handler=this.port1.onmessage;messages.set(++id,()=>handler?.({data}));},close(){this.closed++;}};
      channels.push(this);
    }
  };
  return {frames,timers,messages,channels,now:()=>time,tick:(n=1)=>{time+=n;},
    frame(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());},
    task(delay=0){const posted=delay===0?[...messages]:[];const pending=[...timers].filter(([,t])=>t.delay===delay);for(const[key,t]of pending){if(timers.delete(key))t.fn();}for(const[key,fn]of posted){if(messages.delete(key))fn();}},
    close(){for(const[key,value]of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
  };
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test('settled GPU work resumes in a budgeted task without another game paint',async()=>{
  const c=tasks();let resolve;const gpu=new Promise(r=>{resolve=r;});let resumed=0;
  try{
    const queue=new FrameBuildQueue({now:c.now});
    const job=queue.enqueue((function*(){yield gpu;for(let i=0;i<3;i++){resumed++;c.tick(3);yield;}return 'ready';})());
    c.frame();c.task();assert.equal(job.state,'waiting');
    resolve();await flush();assert.equal(resumed,0,'GPU microtasks cannot advance construction');
    assert.equal(c.frames.size,0,'a completed fence does not request a paint');
    c.task();assert.equal(resumed,2);assert.equal(queue.stats.maxSliceMs,6);
    assert.equal(c.frames.size,1,'remaining CPU work still waits for paint');
    c.task();assert.equal(resumed,2);
    c.frame();c.task();assert.equal(await job.promise,'ready');
  }finally{c.close();}
});

test('GPU continuation replaces pending paint once and preserves round robin',async()=>{
  const c=tasks();let resolveA,resolveB;const a=new Promise(r=>{resolveA=r;}),b=new Promise(r=>{resolveB=r;}),order=[];
  try{
    const queue=new FrameBuildQueue({budgetMs:1,now:c.now});
    const first=queue.enqueue((function*(){yield a;order.push('A');c.tick();return 'A';})());
    const second=queue.enqueue((function*(){yield b;order.push('B');c.tick();return 'B';})());
    c.frame();c.task();assert.equal(first.state,'waiting');assert.equal(second.state,'waiting');
    const cpu=queue.enqueue((function*(){order.push('CPU');c.tick();return 'CPU';})());
    const stale=[...c.frames.values()][0];
    resolveA();resolveB();await flush();assert.equal(c.frames.size,0);assert.equal(c.timers.size,1);
    stale();assert.equal(c.timers.size,1,'cancelled paint cannot schedule a stale drain');
    c.task();assert.deepEqual(order,['CPU']);assert.equal(queue.stats.maxSliceMs,1);
    c.frame();c.task();c.frame();c.task();
    assert.deepEqual(await Promise.all([first.promise,second.promise,cpu.promise]),['A','B','CPU']);
    assert.deepEqual(order,['CPU','A','B']);
  }finally{c.close();}
});

test('evicted GPU work retains its owner until settlement then closes without paint',async()=>{
  for(const fail of [false,true]){
    const c=tasks(),controller=new AbortController();let resolve,reject,disposed=0,published=0;
    const gpu=new Promise((a,b)=>{resolve=a;reject=b;});
    try{
      const queue=new FrameBuildQueue();
      const job=queue.enqueue((function*(){try{yield gpu;published++;}finally{disposed++;}})(),{signal:controller.signal});
      const rejected=assert.rejects(job.promise,{name:'AbortError'});
      c.frame();c.task();controller.abort();assert.equal(disposed,0);
      if(fail)reject(new Error('GPU read failed'));else resolve();
      await flush();assert.equal(disposed,0);assert.equal(c.frames.size,0);
      c.task();await rejected;assert.equal(disposed,1);assert.equal(published,0);
    }finally{c.close();}
  }
});

test('a GPU wait survives startup scheduler release and resumes through its restored task scheduler',async()=>{
  const c=tasks();let resolve;const gpu=new Promise(r=>{resolve=r;});
  try{
    const queue=new FrameBuildQueue(),release=useStartupTaskScheduling(queue);
    const job=queue.enqueue((function*(){yield gpu;return 'ready';})());
    c.task();assert.equal(job.state,'waiting');release();
    assert.equal(queue.schedule,afterPaint);assert.equal(queue.resumeSchedule,afterTask);
    resolve();await flush();assert.equal(c.frames.size,0);
    c.task();assert.equal(await job.promise,'ready');
    assert.equal(c.channels[0].port1.closed,1);assert.equal(c.channels[0].port2.closed,1);
  }finally{c.close();}
});

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
    const stale=[...c.messages.values()][0];
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
    const resumeA=a.resumeSchedule,resumeB=b.resumeSchedule;
    const first=useStartupTaskScheduling(a),second=useStartupTaskScheduling(a);
    const owned=a.schedule;
    assert.equal(a.resumeSchedule,owned);
    const other=useStartupTaskScheduling(b);
    assert.equal(c.channels.length,2,'one channel per queue, not per owner');
    assert.equal(c.timers.size,0,'empty queues need no first-frame fallback');
    first();first();assert.equal(a.schedule,owned);assert.notEqual(b.schedule,afterPaint);
    assert.equal(c.channels[0].port1.closed,0);
    second();assert.equal(a.schedule,original);assert.equal(a.resumeSchedule,resumeA);assert.notEqual(b.schedule,afterPaint);
    assert.equal(c.channels[0].port1.closed,1);assert.equal(c.channels[0].port2.closed,1);
    other();assert.equal(b.schedule,afterPaint);assert.equal(b.resumeSchedule,resumeB);
    const again=useStartupTaskScheduling(a);assert.notEqual(a.schedule,original);
    assert.equal(c.channels.length,3,'a new lease owns a fresh channel');
    again();assert.equal(a.schedule,original);
  }finally{c.close();}
});

test('message continuations are future tasks; cancellation and closed ports suppress stale work',async()=>{
  const c=tasks();let ran=0,painted=0;
  try{
    const queue=new FrameBuildQueue(),release=useStartupTaskScheduling(queue),owned=queue.schedule;
    const cancel=owned(()=>ran++),stale=[...c.messages.values()][0];
    cancel();owned(()=>ran++);stale();assert.equal(ran,0);
    await flush();assert.equal(ran,0,'microtasks cannot run the message continuation');
    requestAnimationFrame(()=>painted++);c.frame();assert.equal(painted,1);assert.equal(ran,0);
    c.task();assert.equal(ran,1);assert.equal(c.timers.size,0,'channel continuations use no recurring timers');
    owned(()=>ran++);const beforeClose=[...c.messages.values()][0];
    release();beforeClose();assert.equal(ran,1);
    const posted=c.messages.size;owned(()=>ran++);assert.equal(c.messages.size,posted,'closed ports receive no new work');
    c.task();assert.equal(ran,1);
    assert.equal(c.channels[0].port1.closed,1);assert.equal(c.channels[0].port2.closed,1);
  }finally{c.close();}
});

test('startup uses timer tasks only when MessageChannel is unavailable',async()=>{
  const c=tasks();
  try{
    delete globalThis.MessageChannel;
    const queue=new FrameBuildQueue({budgetMs:1,now:c.now}),release=useStartupTaskScheduling(queue);
    const job=queue.enqueue((function*(){c.tick();yield;return 'done';})());
    assert.equal(queue.schedule,afterTask);assert.equal(c.channels.length,0);
    assert.equal(c.frames.size,0);await flush();assert.equal(queue.stats.steps,0);
    c.task();assert.equal(queue.stats.steps,1);c.task();assert.equal(await job.promise,'done');
    release();assert.equal(queue.schedule,afterPaint);
  }finally{c.close();}
});

test('real MessageChannel finishes startup tasks and releases its ports',async()=>{
  if(typeof MessageChannel!=='function')return;
  let time=0;
  const queue=new FrameBuildQueue({budgetMs:1,now:()=>time});
  const release=useStartupTaskScheduling(queue);
  try{
    const job=queue.enqueue((function*(){for(let i=0;i<3;i++){time++;yield;}return 'done';})());
    assert.equal(await job.promise,'done');assert.equal(queue.stats.steps,4);assert.equal(queue.stats.maxSliceMs,1);
  }finally{release();}
  assert.equal(queue.schedule,afterPaint);
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
