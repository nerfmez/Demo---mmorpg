import test from 'node:test';
import assert from 'node:assert/strict';
import {trackStartupReadiness} from '../../src/render/startup-readiness.js';

test('readiness diagnostics retain the pending dependency and preserve the full gate',async()=>{
  let finish,clock=4,ready=false;
  const status={},world=new Promise(resolve=>finish=resolve);
  const result=trackStartupReadiness({world,models:Promise.resolve('rigs')},status,()=>clock).then(value=>{ready=true;return value;});
  await Promise.resolve();
  assert.equal(status.models.state,'ready');assert.equal(status.world.state,'pending');assert.equal(ready,false);
  clock=12;finish('resident');assert.deepEqual(await result,['resident','rigs']);
  assert.equal(status.world.state,'ready');assert.equal(status.world.elapsedMs,8);
});

test('readiness diagnostics preserve dependency errors without releasing the gate',async()=>{
  const error=new Error('remote shader sentinel'),status={};
  await assert.rejects(trackStartupReadiness({world:Promise.reject(error),models:Promise.resolve()},status),e=>e===error);
  assert.equal(status.world.state,'failed');assert.equal(status.world.error,error.message);assert.equal(status.models.state,'ready');
});
