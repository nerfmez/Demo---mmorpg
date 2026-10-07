// Playwright serializes these functions into the page: keep them standalone.
export function weaponGpuComplete() {
  const gl = window.__frontier.view.renderer.getContext();
  if (gl.isContextLost()) throw Error('Weapon resource probe lost its WebGL context');
  if (!window.__weaponResourceFence) {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) throw Error('Weapon resource probe could not create a GPU fence');
    window.__weaponResourceFence = { gl, sync };
    gl.flush();
  }
  const fence = window.__weaponResourceFence;
  if (fence.gl !== gl) throw Error('Weapon resource probe changed its WebGL context');
  // A zero timeout keeps the page responsive. Polling yields to the browser's
  // event loop, as required for WebGL sync objects to become signaled.
  const status = gl.clientWaitSync(fence.sync, 0, 0);
  if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return true;
  if (status === gl.TIMEOUT_EXPIRED) return false;
  throw Error(`Weapon resource GPU fence failed: ${status}`);
}

export function releaseWeaponGpuFence() {
  const fence = window.__weaponResourceFence;
  if (fence) fence.gl.deleteSync(fence.sync);
  delete window.__weaponResourceFence;
}

export async function waitForWeaponGpu(page) {
  const start = Date.now();
  try {
    // Inherits the test's existing 90-second timeout; pending work never passes.
    await page.waitForFunction(weaponGpuComplete, null, { polling: 50 });
    return Date.now() - start;
  } finally {
    await page.evaluate(releaseWeaponGpuFence);
  }
}
