// Ownership is per load, never inferred from the currently active region. Global
// toon/outline caches and resources explicitly marked shared are borrowed, not owned.
import { FrameBuildQueue, cancelledBuild } from './build-queue.js';
import { regionShift, useRegion } from './region-shift.js';

let fallbackQueue;
export function importJob({ queue, signal, shift = regionShift(), loader, assetURL } = {}) {
  queue ||= (fallbackQueue ||= new FrameBuildQueue());
  const geometries = new Set(), materials = new Set(), textures = new Set(), disposed = new Set();
  let closed = false;
  const adopted = new Set(), privateMaterials = new Set(), watched = new WeakSet(), dependencies = new WeakMap();
  const watch = resource => { if(resource && !watched.has(resource)){watched.add(resource);resource.addEventListener?.('dispose',()=>disposed.add(resource));} return resource; };
  const release = resource => {
    if (!resource || (resource.userData?.shared && !privateMaterials.has(resource)) || adopted.has(resource) || disposed.has(resource)) return;
    disposed.add(resource); resource.dispose();
  };
  const raw = scene => {
    scene.traverse(o => {
      if (o.geometry && !o.geometry.userData?.shared) geometries.add(watch(o.geometry));
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        if (m.userData?.shared) continue;
        materials.add(watch(m));
        for (const value of Object.values(m)) if (value?.isTexture && !value.userData?.shared) textures.add(watch(value));
      }
    });
    if (closed || signal?.aborted) { cleanup(); throw cancelledBuild(); }
    return scene;
  };
  const own = root => root?.traverse(o => {
    if (o.geometry && !o.geometry.userData?.shared) geometries.add(watch(o.geometry));
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      // Cached toon and inverted-hull materials are not owned by an import job.
      if (!m.userData?.shared) materials.add(watch(m));
    }
  });
  const cleanup = keep => {
    const used = new Set();
    keep?.traverse(o => {
      if (o.geometry) used.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        used.add(m); for (const v of Object.values(m)) if (v?.isTexture) used.add(v);
        for(const texture of dependencies.get(m)||[])used.add(texture);
      }
    });
    for (const group of [geometries, materials, textures]) for (const resource of group) if (!used.has(resource)) release(resource);
  };
  const onAbort=()=>{closed=true;cleanup();};
  signal?.addEventListener('abort',onAbort,{once:true});
  if(signal?.aborted)onAbort();
  const check = () => { if (closed || signal?.aborted) throw cancelledBuild(); };
  const stats = { steps: 0, cpuMs: 0, maxStepMs: 0, stages: [] };
  return {
    signal, loader, stats, raw, own, check,
    geometry: g => { if (g && !g.userData?.shared) geometries.add(watch(g)); return g; },
    material: (m, privateMaterial = false) => { if(privateMaterial)privateMaterials.add(m); if (m && (!m.userData?.shared || privateMaterial)) materials.add(watch(m)); return m; },
    texture: texture => {if(texture&&!texture.userData?.shared)textures.add(watch(texture));return texture;},
    depends: (material, list) => {dependencies.set(material,list);for(const texture of list)textures.add(watch(texture));},
    release,
    assetURL: assetURL || (path => new URL(path, new URL(import.meta.env.BASE_URL, location.href)).href),
    async run(steps, label) {
      check();
      const started=performance.now();
      const job = queue.enqueue(steps, { signal, label, resume: fn => {
        const previous = regionShift(); useRegion(shift);
        try { return fn(); } finally { useRegion(previous); }
      } });
      try { const value = await job.promise; check(); return value; }
      finally { stats.stages.push({label,state:job.state,wallMs:performance.now()-started,...job.stats});stats.steps += job.stats.steps; stats.cpuMs += job.stats.cpuMs; stats.maxStepMs = Math.max(stats.maxStepMs, job.stats.maxStepMs); }
    },
    commit(root) {
      check(); own(root); cleanup(root);
      // Transfer, do not merely mark closed. A late failed sibling request must
      // never reclaim buffers already installed by a successful import.
      root.traverse(o => { if (o.geometry) adopted.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
          adopted.add(m); for (const v of Object.values(m)) if (v?.isTexture) adopted.add(v);
          for(const texture of dependencies.get(m)||[])adopted.add(texture);
        }
      });
      geometries.clear(); materials.clear(); textures.clear(); closed = true;
      signal?.removeEventListener('abort',onAbort);
      const transferred = [...adopted].filter(resource => watched.has(resource));
      let removed=false;
      return () => {
        if(removed)return new Set(transferred);removed=true;
        for(const resource of transferred){adopted.delete(resource);release(resource);}
        return new Set(transferred);
      };
    },
    abort(root) { if (root) { own(root); root.removeFromParent(); } closed = true; signal?.removeEventListener('abort',onAbort); cleanup(); },
  };
}
