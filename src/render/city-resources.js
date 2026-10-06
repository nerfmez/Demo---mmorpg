// A city's private GLTF loads are not a cross-region template cache. Cached toon,
// outline, batch and explicitly shared resources are borrowed, never released here.
import { cityAbortError, cityNodes } from './city-work.js';
const materialsOf = node => Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
const borrowedMaterial = m => m.userData?.shared || m.isMeshToonMaterial || m.userData?.outlineWidth !== undefined;
export function createCityResources(root) {
  const sources = new Set(), detached = new Set(), originals = new Set(), ownedMaterials = new Set(), sourceTextures = new Set();
  let closed = false;
  function disposeTrees(roots, keep = new Set()) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    for (const tree of roots) for (const o of cityNodes(tree)) {
      if (o.geometry && !o.isSprite && !o.geometry.userData?.shared && !keep.has(o.geometry)) geometries.add(o.geometry);
      for (const m of materialsOf(o)) if (!borrowedMaterial(m)) materials.add(m);
    }
    for (const m of originals) if (!m.userData?.shared) materials.add(m);
    for (const t of sourceTextures) textures.add(t);
    for (const m of ownedMaterials) materials.add(m); // allocated by this load, even when batching marks it shared
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  }
  return {
    get closed() { return closed; },
    source(scene) { sources.add(scene); },
    original(material) {
      for (const m of Array.isArray(material) ? material : [material]) if (m) {
        originals.add(m);
        if (!m.userData?.shared) for (const t of Object.values(m)) if (t?.isTexture && !t.userData?.shared) sourceTextures.add(t);
      }
    },
    ownMaterial(material) { ownedMaterials.add(material); return material; },
    drop(node) { detached.add(node); for (const o of cityNodes(node)) this.original(o.material); node.removeFromParent(); },
    *retireOriginals() {
      const used = new Set();
      for (const o of cityNodes(root)) { if (o.geometry) used.add(o.geometry); yield; }
      const freed = new Set();
      for (const tree of detached) for (const o of cityNodes(tree)) {
        if (o.geometry && !o.geometry.userData?.shared && !used.has(o.geometry) && !freed.has(o.geometry)) { freed.add(o.geometry); o.geometry.dispose(); }
        yield;
      }
      detached.clear();
      for (const m of originals) {
        if (!m.userData?.shared) {
          m.dispose();
        }
        originals.delete(m); yield;
      }
      for (const t of sourceTextures) { t.dispose(); sourceTextures.delete(t); yield; }
    },
    dispose() {
      if (closed) return; closed = true; root.removeFromParent();
      // Unprocessed source materials have not yet been replaced/registered.
      for (const tree of sources) for (const o of cityNodes(tree)) for (const m of materialsOf(o)) if (!borrowedMaterial(m)) this.original(m);
      disposeTrees([root, ...sources, ...detached]);
      sources.clear(); detached.clear(); originals.clear(); ownedMaterials.clear(); sourceTextures.clear(); root.clear();
    },
  };
}

export function waitCityLoads(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(cityAbortError());
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export async function loadCitySource(loader, url, owner, signal) {
  const gltf = await loader.loadAsync(url), scene = gltf.scene;
  if (owner.closed || signal?.aborted) {
    const late = createCityResources(scene); late.source(scene); late.dispose();
    throw cityAbortError();
  }
  owner.source(scene); return scene;
}
