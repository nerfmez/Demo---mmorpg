// Opt-in, local profiling overlay. Never imported by the repository's normal build.
// Counts are not GPU bytes. Synchronous WebGL timings include submission/wait, not GPU execution time.
export function createRecorder({clock = () => performance.now(), limit = 120000} = {}) {
  const startedAt = clock(), events = [], frames = [], regions = [], memory = [], errors = [];
  const stack = [], owners = new WeakMap(), openSpans = new Set();
  let sequence = 0, activeLoads = 0, maxActiveLoads = 0, dropped = 0, phase = 'cold-open';
  let currentFrame = null, lastFrame = null, firstFrame = true;
  const append = (list, value) => { if (list.length < limit) list.push(value); else dropped++; };
  const detail = value => value?.data?.id || value?.world?.data?.id || null;
  function begin(name, meta = {}) { const token = {name, phase, start: clock(), parent: stack.at(-1)?.name || null, ...meta}; openSpans.add(token); return token; }
  function end(token, status = 'ok') { openSpans.delete(token); append(events, {...token, durationMs: clock() - token.start, status}); }
  function sync(name, fn, meta = () => ({})) {
    return function (...args) {
      const t = begin(name, meta(args, this)); stack.push(t);
      try { const value = fn.apply(this, args); end(t); return value; }
      catch (error) { end(t, 'error'); throw error; }
      finally { stack.pop(); }
    };
  }
  // Proxy iterator methods directly: preserve each yielded value, result object, return and throw.
  // Time only synchronous work in a resume, NOT time suspended between frames.
  function generator(name, fn, worldArg = 0) {
    return function (...args) {
      const it = fn.apply(this, args), region = name === 'region.build';
      let record = null, finished = false;
      const proxy = {[Symbol.iterator]() { return this; }};
      for (const method of ['next', 'return', 'throw']) {
        if (typeof it[method] !== 'function') continue;
        proxy[method] = (...values) => {
          if (!record) {
            record = {id: ++sequence, world: detail(args[worldArg]), start: clock(), phase, status: 'building', staticReadyMs: null, importedReadyMs: null};
            if (region) append(regions, record);
          }
          const t = begin(`${name}.${method}`, {region: region ? record.id : null, world: record.world}); stack.push(t);
          try {
            const result = it[method](...values);
            end(t);
            if (!finished && result.done) {
              finished = true;
              record.status = method === 'next' ? 'static-ready' : 'cancelled';
              if (region && method === 'next') {
                record.staticReadyMs = clock() - record.start;
                const value = result.value;
                if (value && typeof value === 'object') owners.set(value, record);
                // Observe settlement without replacing the original promise or masking its rejection.
                if (value?.ready?.then) value.ready.then(() => {
                  record.importedReadyMs = clock() - record.start;
                  record.status = value.disposed ? 'disposed-late-result' : 'imported-ready';
                }, error => { record.status = 'import-error'; append(errors, {phase, where: 'region.ready', message: String(error)}); });
                else record.status = 'missing-ready-contract';
              }
            }
            return result;
          } catch (error) { finished = true; record.status = 'error'; end(t, 'error'); throw error; }
          finally { stack.pop(); }
        };
      }
      return proxy;
    };
  }
  function loader(value, category) {
    const load = value.loadAsync;
    value.loadAsync = function (...args) {
      const token = begin('gltf.request+parse', {category, url: String(args[0]), activeLoads: ++activeLoads});
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
      let promise;
      try { promise = load.apply(this, args); }
      catch (error) { activeLoads--; end(token, 'error'); throw error; }
      promise.then(() => { activeLoads--; end(token); }, error => {
        activeLoads--; end(token, 'error'); append(errors, {phase, where: category, message: String(error)});
      });
      return promise;
    };
    return value;
  }
  function method(target, key, name, meta) { target[key] = sync(name, target[key], meta); }
  function renderer(r) {
    // Include all passes rather than accidentally reporting only the post-processing quad.
    r.info.autoReset = false;
    method(r, 'readRenderTargetPixels', 'gpu.readback.sync');
    method(r, 'compile', 'shader.compile.sync');
    method(r, 'render', 'renderer.submit.sync');
    return r;
  }
  function installView(View) {
    const render = View.prototype.render, streaming = View.prototype.updateStreaming;
    View.prototype.updateStreaming = function (...args) {
      const token = begin('streaming.frame', {neighbours: this.neighbours.size,
        building: [...this.neighbours.values()].filter(n => n.steps).length, activeLoads});
      try { return streaming.apply(this, args); }
      finally { const ms = clock() - token.start; if (currentFrame) currentFrame.streamingCpuMs += ms; end(token); }
    };
    View.prototype.render = function (...args) {
      const now = clock(), previous = currentFrame;
      currentFrame = {phase, at: now, intervalMs: lastFrame === null ? null : now - lastFrame,
        firstRenderDelayMs: firstFrame ? now - startedAt : null, streamingCpuMs: 0,
        activeLoads, hidden: typeof document !== 'undefined' ? document.hidden : false};
      lastFrame = now; firstFrame = false; this.renderer.info.reset();
      try { return render.apply(this, args); }
      finally {
        currentFrame.cpuMs = clock() - now;
        currentFrame.drawCalls = this.renderer.info.render.calls;
        currentFrame.triangles = this.renderer.info.render.triangles;
        currentFrame.geometries = this.renderer.info.memory.geometries;
        currentFrame.textures = this.renderer.info.memory.textures;
        append(frames, currentFrame); currentFrame = previous;
      }
    };
    method(View.prototype, 'switchRegion', 'region.switch', args => ({to: args[0]}));
  }
  function disposed(obj) { const record = owners.get(obj); if (record) { record.disposedAt = clock(); record.status = 'disposed'; } }
  function sample(view, label) {
    const r = view.renderer, heap = typeof performance !== 'undefined' ? performance.memory : null;
    let objects = 0; view.scene.traverse(() => objects++);
    const value = {label, phase, at: clock(), geometries: r.info.memory.geometries,
      textures: r.info.memory.textures, programs: r.info.programs?.length ?? null, sceneObjects: objects,
      jsHeapBytesApprox: heap?.usedJSHeapSize ?? null, gpuBytes: null, activeLoads,
      neighbours: view.neighbours.size, building: [...view.neighbours.values()].filter(n => n.steps).length};
    append(memory, value); return value;
  }
  function summary() {
    const groups = {};
    for (const p of new Set(frames.map(f => f.phase))) {
      const selected = frames.filter(f => f.phase === p && f.intervalMs !== null && !f.hidden);
      const sorted = selected.map(f => f.intervalMs).sort((a,b) => a-b);
      const q = p => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
      groups[p] = {samples: sorted.length, p95Ms:q(.95), p99Ms:q(.99), maxMs:q(1),
        over33:sorted.filter(v => v > 33).length, over50:sorted.filter(v => v > 50).length,
        hiddenSamples:frames.filter(f => f.phase === p && f.hidden).length};
    }
    return groups;
  }
  function snapshot() {
    return {schema:1, startedAt, capturedAt:clock(), phase, activeLoads, maxActiveLoads, dropped,
      measurementComplete:false, unfinishedSpans:[...openSpans].map(t=>({...t,elapsedMs:clock()-t.start})), frames, events, regions, memory, errors, summary:summary(),
      limitations:['Instrumentation overhead is not subtracted.', 'Nested event durations overlap; do not sum them.',
        'Frame intervals are View.render start-to-start, not GPU timer results.',
        'Memory counts are real renderer allocations, not bytes; JS heap API is approximate and optional.',
        'A completed static region is not necessarily an imported-ready region.']};
  }
  return {begin,end,sync,generator,loader,renderer,installView,disposed,sample,snapshot,
    phase(name) { if (typeof name !== 'string' || name.length > 100) throw Error('invalid phase'); phase = name; lastFrame = null; },
    get activeLoads(){ return activeLoads; },
    status(){return {activeLoads,pendingImports:regions.filter(r=>r.status==='static-ready').length,regions:regions.length};}, addError(where,message){append(errors,{phase,where,message:String(message)});} };
}

// This file is copied only into an explicit profiling worktree by prepare.mjs.
const enabled = typeof window !== 'undefined' && import.meta.env?.MODE === 'profile'
  && new URLSearchParams(location.search).get('profile') === '1';
const recorder = enabled ? createRecorder() : null;
export const pf = recorder || {begin:()=>null,end:()=>{},sync:(_n,f)=>f,generator:(_n,f)=>f,
  loader:v=>v,renderer:v=>v,installView:()=>{},disposed:()=>{}};
if (recorder) {
  window.__streamProfile = recorder;
  const resource = {entries:[], dropped:0, supported:false};
  try {
    const observer = new PerformanceObserver(list => {
      for(const entry of list.getEntries()) {
        if(resource.entries.length < 10000) resource.entries.push(entry.toJSON()); else resource.dropped++;
      }
    });
    observer.observe({type:'resource',buffered:true}); resource.supported = true;
  } catch (error) { resource.error = String(error); }
  const snapshot = recorder.snapshot;
  recorder.snapshot = () => ({...snapshot(), resource, environment:{userAgent:navigator.userAgent,
    webdriver:navigator.webdriver, devicePixelRatio, location:location.pathname+location.search,
    timeOrigin:performance.timeOrigin},
    // ResourceTiming measures browser resource fetches; GLTF spans also include decode/parse.
    longTasksSupported:typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')});
  addEventListener('error', e => recorder.addError('window.error', e.message));
  addEventListener('unhandledrejection', e => recorder.addError('unhandledrejection', e.reason));
}
