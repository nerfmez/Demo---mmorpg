// Imported city art (GLB kits) as Frontier toon materials. Recolours are data:
// whole source materials by name (e.g. indigo timber -> warm wood) and single named
// parts. Source files stay unchanged; the same rules serve the city and outpost kits.
import * as THREE from 'three';
import { toon } from './toon.js';
import { drainSteps } from './city-work.js';

const scratch = new THREE.Color();
export function cityColor(palette, material, meshName = '') {
  const hex = palette?.meshColors?.[meshName] || palette?.materialColors?.[material.name];
  return hex ? scratch.set(hex) : material.color;
}

// True when some edge belongs to a single triangle (after welding by position).
export function hasOpenEdges(geometry) { return drainSteps(openEdgesSteps(geometry)); }
export function* openEdgesSteps(geometry) {
  const p = geometry.attributes.position, index = geometry.index, n = index ? index.count : p.count, ids = new Map(), edges = new Map();
  const vertex = (i) => {
    const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
    let id = ids.get(k);
    if (id === undefined) ids.set(k, (id = ids.size));
    return id;
  };
  for (let t = 0; t + 2 < n; t += 3) {
    if (t % 384 === 0) yield;
    const a = vertex(index ? index.getX(t) : t), b = vertex(index ? index.getX(t + 1) : t + 1), c = vertex(index ? index.getX(t + 2) : t + 2);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const e = u < v ? u * 1048576 + v : v * 1048576 + u;
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  }
  let scanned = 0;
  for (const count of edges.values()) { if (count === 1) return true; if (++scanned % 512 === 0) yield; }
  return false;
}

/**
 * Shared toon material for an imported mesh. Source art is double-sided: closed solids
 * stay front-only; open sheets (awnings, canvas, roof skins) keep both faces or vanish
 * from behind. `cache` maps colour/emissive/side to one material per load.
 */
export function importedMaterial(palette, old, mesh, cache) { return drainSteps(importedMaterialSteps(palette, old, mesh, cache)); }
export function* importedMaterialSteps(palette, old, mesh, cache) {
  const base = cityColor(palette, old, mesh.name).clone();
  const side = old.side === THREE.DoubleSide && (yield* openEdgesSteps(mesh.geometry)) ? THREE.DoubleSide : THREE.FrontSide;
  const key = `${base.getHex()}/${old.emissive?.getHex() || 0}/${side}`;
  if (!cache.has(key)) {
    const m = toon('#' + base.getHexString(), { side }).clone();
    m.color.copy(base);
    m.userData.shared = true;
    if (old.emissive) m.emissive.copy(old.emissive);
    cache.set(key, m);
  }
  return cache.get(key);
}
