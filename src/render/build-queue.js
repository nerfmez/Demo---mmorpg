// Cooperative construction, not a hard real-time guarantee. All region/import jobs
// share one queue. An indivisible next() can overrun; stats report that honestly.
export function finishSteps(steps) {
  for (;;) { const step = steps.next(); if (step.done) return step.value; }
}

// A timer after rAF gives the browser a rendering opportunity. A resolved Promise
// alone would keep draining microtasks before paint. The timer fallback works in Node.
export function afterPaint(run) {
  let frame = null, timer = null, stopped = false;
  const later = () => { if (!stopped) timer = setTimeout(() => { if (!stopped) run(); }, 0); };
  if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(later);
  else later();
  return () => { stopped = true; if (frame !== null) cancelAnimationFrame(frame); clearTimeout(timer); };
}

// Hidden initial construction can advance between UI frames, but must yield to
// browser tasks rather than monopolising the microtask checkpoint.
export function afterTask(run) {
  let stopped = false;
  const timer = setTimeout(() => { if (!stopped) run(); }, 0);
  return () => { stopped = true; clearTimeout(timer); };
}

const startupScheduling = new WeakMap();
export function useStartupTaskScheduling(queue) {
  let state = startupScheduling.get(queue);
  if (!state) {
    state = { owners: 0, schedule: queue.schedule, fallback: null };
    startupScheduling.set(queue, state);
    queue.schedule = afterTask;
    // Keep the already-requested first paint opportunity. If rAF is withheld
    // (e.g. a background tab), this one-shot task can take over that exact handle.
    // The delay requests an opportunity, not a guaranteed paint or time limit.
    const pending = queue.scheduled;
    if (pending) state.fallback = setTimeout(() => {
      if (startupScheduling.get(queue) !== state || queue.scheduled !== pending) return;
      queue.scheduled = null; pending(); queue.wake();
    }, 16);
    else queue.wake();
  }
  state.owners++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state.owners) return;
    startupScheduling.delete(queue);
    clearTimeout(state.fallback);
    const pending = queue.scheduled;
    queue.scheduled = null;
    pending?.();
    queue.schedule = state.schedule;
    queue.wake();
  };
}

export function cancelledBuild() {
  const error = new Error('Region construction cancelled'); error.name = 'AbortError'; return error;
}

export class FrameBuildQueue {
  constructor({ budgetMs = 6, now = () => performance.now(), schedule = afterPaint } = {}) {
    this.budgetMs = budgetMs; this.now = now; this.schedule = schedule;
    this.jobs = []; this.scheduled = null; this.running = false;
    this.stats = { slices: 0, steps: 0, maxStepMs: 0, maxSliceMs: 0 };
  }
  enqueue(steps, { signal, resume = fn => fn(), label = 'build', onStep } = {}) {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const job = { steps, promise, signal, resume, label, onStep, state: 'queued',
      stats: { steps: 0, cpuMs: 0, maxStepMs: 0 }, resolve, reject };
    const settle = (state, value) => {
      if (['success', 'cancelled', 'error'].includes(job.state)) return;
      job.state = state; signal?.removeEventListener('abort', job.cancel);
      if (state === 'success') resolve(value); else reject(value);
    };
    job.cancel = () => {
      if (['success', 'cancelled', 'error'].includes(job.state)) return;
      // JavaScript cannot abort a synchronous next() halfway through. Check again
      // before publishing its return value and close suspended generators in scope.
      if (job.state === 'running') { job.cancelRequested = true; return; }
      try { resume(() => steps.return?.()); settle('cancelled', cancelledBuild()); }
      catch (error) { settle('error', error); }
    };
    job.settle = settle;
    if (signal?.aborted) job.cancel();
    else { signal?.addEventListener('abort', job.cancel, { once: true }); this.jobs.push(job); this.wake(); }
    return job;
  }
  wake() {
    if (this.running || this.scheduled || !this.jobs.length) return;
    this.scheduled = this.schedule(() => { this.scheduled = null; this.drain(); });
  }
  drain() {
    if (this.running) return;
    this.running = true;
    const start = this.now(), budget = Number.isFinite(this.budgetMs) ? Math.max(.1, this.budgetMs) : 6;
    try {
      while (this.jobs.length && this.now() - start < budget) {
        const job = this.jobs.shift();
        if (!['queued', 'suspended'].includes(job.state)) continue;
        if (job.signal?.aborted) { job.cancel(); continue; }
        const t = this.now(); job.state = 'running';
        try {
          const step = job.resume(() => job.steps.next());
          const elapsed = this.now() - t;
          job.stats.steps++; job.stats.cpuMs += elapsed;
          job.stats.maxStepMs = Math.max(job.stats.maxStepMs, elapsed);
          this.stats.steps++; this.stats.maxStepMs = Math.max(this.stats.maxStepMs, elapsed);
          job.onStep?.(elapsed);
          job.state = 'suspended';
          if (job.cancelRequested || job.signal?.aborted) job.cancel();
          else if (step.done) job.settle('success', step.value);
          else this.jobs.push(job); // round-robin: a newly resumed city cannot monopolise the queue
        } catch (error) {
          try { job.resume(() => job.steps.return?.()); }
          catch (cleanupError) { error = new AggregateError([error, cleanupError], 'Build and cleanup failed'); }
          job.settle('error', error);
        }
      }
    } finally {
      this.stats.slices++; this.stats.maxSliceMs = Math.max(this.stats.maxSliceMs, this.now() - start);
      this.running = false; this.wake();
    }
  }
}
