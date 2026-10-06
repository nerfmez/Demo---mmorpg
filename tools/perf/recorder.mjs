// Opt-in, local profiling overlay. Never imported by the repository's normal build.
// Counts are not GPU bytes. Synchronous WebGL timings include submission/wait, not GPU execution time.
export function createRecorder({clock = () => performance.now(), limit = 120000} = {}) {
  const startedAt = clock(), events = [], frames = [], regions = [], memory = [], errors = [];
  const stack = [], owners = new WeakMap(), openSpans = new Set();
  let sequence = 0, activeLoads = 0, maxActiveLoads = 0, dropped = 0, phase = 'cold-open';
  let currentFrame = null, lastFrame = null, firstFrame = true;
  let lastAttempt = null, lastCompletedFrameAt = null;
  function addError(where, error, meta = {}) {
    const e = {phase, at: clock(), where, name:error?.name || null, message:String(error?.message ?? error),
      stack:typeof error?.stack === 'string' ? error.stack : null,
      activeLoads, spans:stack.map(t=>({name:t.name,start:t.start,world:t.world,region:t.region})), ...meta};
    append(errors,e); return e;
  }
  const append = (list, value) => { if (list.length < limit) list.push(value); else dropped++; };
  const detail = value => value?.data?.id || value?.world?.data?.id || null;
  function begin(name, meta = {}) { const token = {name, phase, start: clock(), parent: stack.at(-1)?.name || null, ...meta}; openSpans.add(token); return token; }
  function end(token, status = 'ok') { openSpans.delete(token); append(events, {...token, durationMs: clock() - token.start, status}); }
  function sync(name, fn, meta = () => ({})) {
    return function (...args) {
      const t = begin(name, meta(args, this)); stack.push(t);
      try { const value = fn.apply(this, args); end(t); return value; }
      catch (error) { addError(name,error); end(t, 'error'); throw error; }
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
                }, error => { record.status = 'import-error'; addError('region.ready',error); });
                else record.status = 'missing-ready-contract';
              }
            }
            return result;
          } catch (error) { finished = true; record.status = 'error'; addError(`${name}.${method}`,error,{world:record.world,region:record.id}); end(t, 'error'); throw error; }
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
      catch (error) { activeLoads--; addError(category,error); end(token, 'error'); throw error; }
      promise.then(() => { activeLoads--; end(token); }, error => {
        activeLoads--; end(token, 'error'); addError(category,error);
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
      let status='ok';
      try { return streaming.apply(this, args); }
      catch(error){status='error';addError('streaming.frame',error);throw error;}
      finally { const ms = clock() - token.start; if (currentFrame) currentFrame.streamingCpuMs += ms; end(token,status); }
    };
    View.prototype.render = function (...args) {
      const now = clock(), previous = currentFrame;
      currentFrame = {phase, at: now, intervalMs: lastFrame === null ? null : now - lastFrame,
        firstRenderDelayMs: firstFrame ? now - startedAt : null, streamingCpuMs: 0,
        activeLoads, hidden: typeof document !== 'undefined' ? document.hidden : false};
      lastFrame = now; firstFrame = false; this.renderer.info.reset();
      currentFrame.status='started';
      try { const result=render.apply(this,args);currentFrame.status='ok';lastCompletedFrameAt=clock();return result; }
      catch(error){currentFrame.status='error';addError('View.render',error);throw error;}
      finally {
        lastAttempt={at:now,endedAt:clock(),status:currentFrame.status};
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
  function disposed(obj) { const record = owners.get(obj);
    end(begin('region.dispose-observed',{world:detail(obj),region:record?.id??null,alreadyDisposed:!!obj?.disposed}));
    if (record) { record.disposedAt = clock(); record.status = 'disposed'; } }
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
      measurementComplete:false, frameHealth:{lastAttempt,lastCompletedFrameAt,sinceLastCompletedMs:lastCompletedFrameAt===null?null:clock()-lastCompletedFrameAt}, unfinishedSpans:[...openSpans].map(t=>({...t,elapsedMs:clock()-t.start})), frames, events, regions, memory, errors, summary:summary(),
      limitations:['Instrumentation overhead is not subtracted.', 'Nested event durations overlap; do not sum them.',
        'Frame intervals are View.render start-to-start, not GPU timer results.',
        'Memory counts are real renderer allocations, not bytes; JS heap API is approximate and optional.',
        'A completed static region is not necessarily an imported-ready region.']};
  }
  return {begin,end,sync,generator,loader,renderer,installView,disposed,sample,snapshot,
    diagnosticContext(){return {phase,activeLoads,lastAttempt,lastCompletedFrameAt,currentAttempt:currentFrame?{at:currentFrame.at,status:currentFrame.status}:null,spans:stack.map(t=>({name:t.name,start:t.start,world:t.world,region:t.region}))};},
    phase(name) { if (typeof name !== 'string' || name.length > 100) throw Error('invalid phase'); phase = name; lastFrame = null; },
    get activeLoads(){ return activeLoads; },
    status(){return {activeLoads,pendingImports:regions.filter(r=>r.status==='static-ready').length,regions:regions.length};}, addError };
}

/** Diagnostic-only observer. No recovery, resource disposal or GL error consumption.
 * Weak references avoid retaining past canvases, contexts and GPU objects. A browser
 * may keep a past Document in bfcache; that is NOT proof of a leaked GPU context.
 */
export function installWebGLDiagnostics(recorder, realm = globalThis, {limit=512}={}) {
  const now=()=>realm.performance.now(), rings=[], faults=[], documents=[], contexts=[];
  const byGL=new WeakMap(), objects=new WeakMap(), canvasIds=new WeakMap();
  const undo=[], subscriptions=[];let seq=0, dropped=0, timer=null, stall=null;
  const documentId=realm.crypto?.randomUUID?.()||`doc-${Date.now()}-${++seq}`;
  const key='pr80-gl-diagnostics-history-v1';
  const weak=value=>typeof realm.WeakRef==='function'?new realm.WeakRef(value):null;
  const safe=(fn,fallback=null)=>{try{return fn();}catch{return fallback;}};
  const state=()=>recorder.diagnosticContext?.()||{};
  const push=(type,detail={})=>{const event={type,at:now(),epochMs:realm.performance.timeOrigin+now(),...detail};
    if(rings.length>=limit){rings.shift();dropped++;}rings.push(event);return event;};
  function contextState(c,gl){gl ||= c.ref?.deref();return {id:c.id,createdAt:c.at,generation:c.generation,canvasId:c.canvasId,
    referenceAvailable:!!gl,isContextLost:gl?safe(()=>gl.isContextLost()):null,
    connected:gl?safe(()=>gl.canvas.isConnected):null,
    drawingBuffer:gl?[gl.drawingBufferWidth,gl.drawingBufferHeight]:null,
    counts:JSON.parse(JSON.stringify(c.counts)),lastCreateShader:c.lastCreateShader,lastSubmit:c.lastSubmit};}
  function fault(where,error,meta={}){
    const event=recorder.addError(where,error,{documentId,...meta});
    if(faults.length<32)faults.push({...event,contexts:contexts.map(c=>contextState(c)),recentResources:rings.slice(-80)});
  }
  function wrap(target,name,make,restore=false){
    const original=target?.[name];if(typeof original!=='function')return false;
    const descriptor=Object.getOwnPropertyDescriptor(target,name);
    const fn=make(original);
    try{target[name]=fn;if(target[name]!==fn)throw Error('method is not writable');
      // Only realm-global prototypes are reversible; recording per-instance undo
      // closures would keep otherwise unreachable renderers/contexts alive.
      if(restore)undo.push(()=>{if(target[name]===fn){if(descriptor)Object.defineProperty(target,name,descriptor);else delete target[name];}});return true;
    }catch(error){push('coverage-unavailable',{name,error:String(error)});return false;}
  }
  function listen(target,name,fn){target?.addEventListener?.(name,fn);const ref=weak(target);
    if(ref)subscriptions.push(()=>ref.deref()?.removeEventListener?.(name,fn));}
  function track(gl,kind){
    if(!gl||typeof gl.isContextLost!=='function')return;
    if(byGL.has(gl))return byGL.get(gl);
    let canvasId=canvasIds.get(gl.canvas);if(!canvasId){canvasId=`canvas-${++seq}`;canvasIds.set(gl.canvas,canvasId);}
    const c={id:`context-${++seq}`,at:now(),canvasId,kind,generation:0,ref:weak(gl),counts:{},lastCreateShader:null,lastSubmit:null};
    byGL.set(gl,c);contexts.push(c);push('context-observed',contextState(c,gl));
    for(const type of ['webglcontextlost','webglcontextrestored','webglcontextcreationerror'])listen(gl.canvas,type,e=>{
      if(type==='webglcontextrestored')c.generation++;
      const data={context:c.id,generation:c.generation,statusMessage:e.statusMessage||'',defaultPrevented:e.defaultPrevented,
        state:contextState(c),frame:state()};push(type,data);
      if(type!=='webglcontextrestored')fault(type,new Error(type),data);
      // Do NOT preventDefault, restore, stop propagation or change engine listeners.
    });
    for(const type of ['Shader','Program','Texture','Buffer','Framebuffer','Renderbuffer','VertexArray','Sampler','Query','TransformFeedback']){
      const counts=c.counts[type]={created:0,deletedCalls:0,nullCreates:0};
      wrap(gl,'create'+type,native=>function(...args){
        let value;try{value=Reflect.apply(native,this,args);}catch(error){fault('gl.create'+type,error,{context:c.id,state:contextState(c,this)});throw error;}
        const at=now(),obj=value?{id:`${type}-${++seq}`,context:c.id,generation:c.generation,createdAt:at,deletedAt:null}:null;
        if(obj){objects.set(value,obj);counts.created++;}else counts.nullCreates++;
        const event={context:c.id,generation:c.generation,resource:obj?.id??null,kind:type,phase:state().phase};
        push('gl.create'+type,event);
        if(type==='Shader')c.lastCreateShader={at,shaderType:args[0],resource:obj?.id??null,isContextLost:safe(()=>this.isContextLost())};
        if(value===null)fault('gl.create'+type+'.null',new Error('Native create'+type+' returned null'),{...event,state:contextState(c,this)});
        return value;
      });
      wrap(gl,'delete'+type,native=>function(value,...rest){
        const obj=value&&objects.get(value),meta={context:c.id,resource:obj?.id??null,ownerContext:obj?.context??null,wasAlreadyDeleted:obj?.deletedAt!=null};
        push('gl.delete'+type+'.begin',meta);
        try{const result=Reflect.apply(native,this,[value,...rest]);counts.deletedCalls++;if(obj)obj.deletedAt=now();push('gl.delete'+type+'.end',meta);return result;}
        catch(error){fault('gl.delete'+type,error,meta);throw error;}
      });
    }
    wrap(gl,'shaderSource',native=>function(shader,source){
      const obj=shader&&objects.get(shader);
      const meta=()=>({context:c.id,argumentKind:shader===null?'null':typeof shader,shader:obj?{...obj}:null,
        sourceLength:typeof source==='string'?source.length:null,state:contextState(c,this),frame:state()});
      // Keep native validation/exception untouched. Never replace a null shader.
      try{return Reflect.apply(native,this,arguments);}
      catch(error){fault('gl.shaderSource',error,meta());throw error;}
    });
    return c;
  }
  // Observe actual getContext calls: querying every canvas with getContext would
  // create extra contexts and spoil this investigation.
  for(const C of [realm.HTMLCanvasElement,realm.OffscreenCanvas])if(C?.prototype)wrap(C.prototype,'getContext',native=>function(kind,...args){
    const value=Reflect.apply(native,this,[kind,...args]);
    if(['webgl','webgl2','experimental-webgl'].includes(kind)){
      if(value)track(value,kind);else fault('getContext-null',new Error('Native '+kind+' context creation returned null'),{kind,frame:state()});
    }return value;
  },true);
  function attachRenderer(r){const gl=r.getContext(),c=track(gl,'renderer');if(!c||c.rendererAttached)return;
    c.rendererAttached=true;
    wrap(r,'render',native=>function(...args){
      const at=now();let status='ok';try{return Reflect.apply(native,this,args);}
      catch(error){status='error';fault('renderer.render',error,{context:c.id,state:contextState(c,gl)});throw error;}
      finally{c.lastSubmit={startedAt:at,endedAt:now(),status};}
    });
    wrap(r,'dispose',native=>function(...args){push('renderer.dispose.begin',{context:c.id,frame:state()});
      try{return Reflect.apply(native,this,args);}finally{push('renderer.dispose.end',{context:c.id,frame:state()});}});
  }
  // The recorder already wraps renderer creation; add no second renderer/context.
  const originalRenderer=recorder.renderer;
  recorder.renderer=function(r){const result=originalRenderer(r);attachRenderer(r);return result;};
  undo.push(()=>{recorder.renderer=originalRenderer;});
  function snapshot(){const f=state(),at=now();return {schema:'pr80-gl-v1',documentId,at,
    mode:'observation-only',dropped,frameHealth:{...f,sinceLastCompletedMs:f.lastCompletedFrameAt==null?null:at-f.lastCompletedFrameAt},stall,
    domCanvasCount:safe(()=>realm.document.querySelectorAll('canvas').length),contexts:contexts.map(c=>contextState(c)),
    events:rings.slice(),faults:faults.slice(),documentHistory:documents.slice(),
    limits:{gpuBytes:null,globalOrOtherTabContextCount:null,previousDocumentGPUReclamation:'not-observable',
      weakRefSupported:typeof realm.WeakRef==='function',note:'No getError(), recovery, forced context loss or extra getContext() calls. A returned render call is not a GPU presentation timestamp.'}};}
  function tick(){const f=state(),at=now();if(f.lastAttempt&&at-f.lastAttempt.endedAt>2000&&!realm.document.hidden){
      if(!stall){stall={observedAt:at,lastAttempt:{...f.lastAttempt},lastCompletedFrameAt:f.lastCompletedFrameAt};push('render-stall-observed',{...stall,contexts:contexts.map(c=>contextState(c))});}
    }else if(stall){push('render-stall-ended',{...stall,resumedAt:at,hidden:!!realm.document.hidden});stall=null;}}
  function history(type,e){const row={documentId,type,at:now(),epochMs:realm.performance.timeOrigin+now(),persisted:!!e?.persisted,
    path:realm.location?.pathname,contextStates:contexts.map(c=>contextState(c)),frame:state()};
    push(type,{persisted:row.persisted});documents.push(row);
    if(documents.length>16)documents.shift();safe(()=>realm.sessionStorage.setItem(key,JSON.stringify(documents)));}
  const prior=safe(()=>JSON.parse(realm.sessionStorage.getItem(key)||'[]'),[]);if(Array.isArray(prior))documents.push(...prior.slice(-12));
  listen(realm,'pagehide',e=>history('pagehide',e));listen(realm,'pageshow',e=>history('pageshow',e));
  listen(realm.document,'visibilitychange',()=>push('visibility',{hidden:realm.document.hidden,frame:state()}));
  // Timer is observation only. It never restarts RAF after a failure.
  if(realm.setInterval)timer=realm.setInterval(tick,1000);
  history('document-start');
  return {snapshot,tick,track,attachRenderer,disposeObserver(){if(timer!==null)realm.clearInterval(timer);for(const f of subscriptions)f();for(const f of undo.reverse())f();}};
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
  addEventListener('error', e => recorder.addError('window.error', e.error || e.message, {filename:e.filename||null,line:e.lineno||null,column:e.colno||null}));
  addEventListener('unhandledrejection', e => recorder.addError('unhandledrejection', e.reason));
  // This remains opt-in to the existing development-only hardware test page.
  const debugParams=new URLSearchParams(location.search);
  if(debugParams.get('glDebug')==='1'||(debugParams.get('deviceTest')==='1'&&debugParams.get('glDebug')!=='0')){
    const diagnostics=installWebGLDiagnostics(recorder);
    recorder.glDiagnostics=diagnostics;
    const baseSnapshot=recorder.snapshot;
    recorder.snapshot=()=>({...baseSnapshot(),glDiagnostics:diagnostics.snapshot()});
  }
}
