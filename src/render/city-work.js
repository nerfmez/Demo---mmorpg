// One budget for ALL imported-city CPU work, not one allowance per city.
// The rAF callback only schedules a task: the continuation is after that rendering
// opportunity, never an await/Promise microtask inside the rAF callback itself.
export const drainSteps = steps => {
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
};
export const cityAbortError = () => Object.assign(new Error('City assembly cancelled'), { name: 'AbortError' });
export function afterCityFrame(callback) {
  if (typeof requestAnimationFrame === 'function' && globalThis.document?.visibilityState !== 'hidden') {
    const frame = requestAnimationFrame(() => { timer = setTimeout(callback, 0); });
    let timer;
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }
  const timer = setTimeout(callback, 16);
  return () => clearTimeout(timer);
}

export function createCityWorkQueue({ budgetMs = 6, clock = () => performance.now(), schedule = afterCityFrame } = {}) {
  const jobs = [];
  let pending = null, running = false;
  function wake() {
    if (!pending && !running && jobs.length) pending = schedule(pump);
  }
  function finish(job, error, value) {
    job.signal?.removeEventListener('abort', job.abort);
    if (error) {
      // Yield* propagates return into temporary geometry builders' finally blocks.
      try { job.resume(() => job.steps.return?.()); } catch (cleanupError) { error = new AggregateError([error, cleanupError], 'City work and cleanup failed'); }
      job.reject(error);
    } else job.resolve(value);
  }
  function pump() {
    pending = null; running = true;
    const begin = clock(), touched = new Set();
    try {
      do {
        const job = jobs.shift();
        if (!job) break;
        if (job.signal?.aborted) { finish(job, cityAbortError()); continue; }
        let result, error;
        const start = clock();
        try { result = job.resume(() => job.steps.next()); } catch (e) { error = e; }
        const elapsed = clock() - start;
        job.stats.steps++; job.stats.cpuMs += elapsed;
        if (elapsed > job.stats.maxStepMs) { job.stats.maxStepMs = elapsed; job.stats.maxStepLabel = job.stage || 'setup'; }
        if (typeof result?.value === 'string') job.stage = result.value;
        touched.add(job);
        if (error) finish(job, error);
        else if (job.signal?.aborted) finish(job, cityAbortError());
        else if (result.done) finish(job, null, result.value);
        else jobs.push(job); // round robin; another city's continuation cannot burst independently
      } while (jobs.length && clock() - begin < budgetMs);
    } finally {
      const duration = clock() - begin;
      for (const job of touched) { job.stats.slices++; job.stats.maxSliceMs = Math.max(job.stats.maxSliceMs, duration); }
      running = false; wake();
    }
  }
  return function run(steps, { signal, resume = fn => fn(), stats = {} } = {}) {
    stats.steps ??= 0; stats.cpuMs ??= 0; stats.slices ??= 0; stats.maxStepMs ??= 0; stats.maxSliceMs ??= 0;
    return new Promise((resolve, reject) => {
      const job = { steps, signal, resume, stats, resolve, reject };
      job.abort = () => {
        const index = jobs.indexOf(job);
        if (index < 0) return; // a synchronous step finishes before the next JS event
        jobs.splice(index, 1); finish(job, cityAbortError());
        if (!jobs.length && pending) { pending(); pending = null; }
      };
      if (signal?.aborted) { finish(job, cityAbortError()); return; }
      signal?.addEventListener('abort', job.abort, { once: true });
      jobs.push(job); wake();
    });
  };
}
export const runCitySteps = createCityWorkQueue();

// Snapshot children before yielding: callers may reparent the current node.
export function* cityNodes(root) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    yield node;
  }
}
