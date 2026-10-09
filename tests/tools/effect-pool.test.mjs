import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectPool } from '../../src/render/effect-pool.js';
test('retains a bounded set, renders overflow, and releases every owner exactly once', () => {
  let created = 0;const freed=[];
  const pool=new EffectPool(()=>({id:++created,removeFromParent(){this.detached=true;}}),o=>freed.push(o.id),2);
  const objects=Array.from({length:4},()=>pool.take());
  for(const o of objects)pool.release(o);
  assert.deepEqual(freed,[3,4]);assert.equal(pool.idle.length,2);
  const reused=pool.take();assert.equal(created,4);assert.equal(reused.detached,true);
  pool.clear();assert.deepEqual(freed,[3,4,2,1]);
  pool.release(reused);pool.clear();assert.equal(freed.length,4);
});
