import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { weaponGpuComplete, releaseWeaponGpuFence, waitForWeaponGpu } from '../browser/weapon-resource-gpu.mjs';

function fixture() {
  const calls = [], sync = {}, gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, TIMEOUT_EXPIRED: 2, ALREADY_SIGNALED: 3, CONDITION_SATISFIED: 4, WAIT_FAILED: 5,
    lost: false, status: 2,
    isContextLost() { return this.lost; },
    fenceSync(...args) { calls.push(['fence', ...args]); return sync; },
    flush() { calls.push(['flush']); },
    clientWaitSync(...args) { calls.push(['wait', ...args]); return this.status; },
    deleteSync(value) { calls.push(['delete', value]); },
  };
  const window = { __frontier: { view: { renderer: { getContext: () => gl } } } };
  const evaluate = fn => runInNewContext(`(${fn.toString()})()`, { window });
  return { gl, calls, sync, window, evaluate };
}

test('pending GPU work stays pending and reuses one flushed fence until completion', () => {
  const f = fixture();
  assert.equal(f.evaluate(weaponGpuComplete), false);
  assert.equal(f.evaluate(weaponGpuComplete), false);
  assert.equal(f.calls.filter(c => c[0] === 'fence').length, 1);
  assert.equal(f.calls.filter(c => c[0] === 'flush').length, 1);
  for (const call of f.calls.filter(c => c[0] === 'wait')) assert.deepEqual(call, ['wait', f.sync, 0, 0]);
  for (const status of [f.gl.ALREADY_SIGNALED, f.gl.CONDITION_SATISFIED]) {
    f.gl.status = status;
    assert.equal(f.evaluate(weaponGpuComplete), true);
  }
  f.evaluate(releaseWeaponGpuFence);
  assert.equal(f.window.__weaponResourceFence, undefined);
  assert.deepEqual(f.calls.at(-1), ['delete', f.sync]);
});

test('lost context, missing fence, wait failure and unexpected status cannot pass', () => {
  for (const setup of [f => f.gl.lost = true, f => f.gl.fenceSync = () => null,
    f => f.gl.status = f.gl.WAIT_FAILED, f => f.gl.status = 999]) {
    const f = fixture(); setup(f);
    assert.throws(() => f.evaluate(weaponGpuComplete), /resource.*(lost|create|failed)/);
    f.evaluate(releaseWeaponGpuFence);
    assert.equal(f.window.__weaponResourceFence, undefined);
  }
  const f = fixture(); f.evaluate(weaponGpuComplete);
  f.window.__frontier.view.renderer.getContext = () => ({ ...f.gl });
  assert.throws(() => f.evaluate(weaponGpuComplete), /changed its WebGL context/);
  f.evaluate(releaseWeaponGpuFence);
  const lost = fixture(); lost.evaluate(weaponGpuComplete); lost.gl.lost = true;
  assert.throws(() => lost.evaluate(weaponGpuComplete), /lost its WebGL context/);
  lost.evaluate(releaseWeaponGpuFence);
});

test('completion wrapper preserves the existing timeout and cleans up on success or failure', async () => {
  for (const failure of [null, Error('Timeout 90000ms exceeded'), Error('GPU fence failed')]) {
    const f = fixture();
    const page = {
      async waitForFunction(fn, arg, options) {
        assert.equal(arg, null);
        assert.deepEqual(options, { polling: 50 }); // No timeout override or retry.
        assert.equal(f.evaluate(fn), false);
        if (failure) throw failure;
        f.gl.status = f.gl.CONDITION_SATISFIED;
        assert.equal(f.evaluate(fn), true);
      },
      async evaluate(fn) { return f.evaluate(fn); },
    };
    if (failure) await assert.rejects(waitForWeaponGpu(page), error => error === failure);
    else assert.ok(await waitForWeaponGpu(page) >= 0);
    assert.equal(f.window.__weaponResourceFence, undefined);
    assert.deepEqual(f.calls.at(-1), ['delete', f.sync]);
  }
});
