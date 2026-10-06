// A linked rectangular map owns the inward half-plane of each shared edge.
// The entire edge, including its closed ends, partitions decorative margins and
// sea aprons. The walkable seam span is NOT a terrain/water ownership boundary.
// Rules, colliders, shoreline values and the authored open span are unchanged.
import * as THREE from 'three';

export function regionPlanes(world) {
  return (world.seams || []).map(s => ({ axis: s.alongX ? 2 : 0,
    limit: world.bounds[s.edge], outward: s.outward }));
}
export function ownsRegionPoint(world, x, z) {
  return (world.seams || []).every(s => ((s.alongX ? z : x) - world.bounds[s.edge]) * s.outward <= 1e-7);
}

/** Clip actual triangles and interpolate every vertex attribute, including swash
 * depth/shore/wash values. No shader discard, fog cover-up or extra seam height. */
export function* clipRegionGeometrySteps(g, world, owner) {
  const planes = regionPlanes(world), pos = g.attributes.position;
  if (!planes.length || !pos) return g;
  let needsClip=false;
  for(const plane of planes){
    let outside=0;
    for(let i=0;i<pos.count;i++){
      if(i&&i%1024===0)yield;
      if((pos.getComponent(i,plane.axis)-plane.limit)*plane.outward>0)outside++;
    }
    if(outside)needsClip=true;
    if(outside===pos.count){g.setIndex([]);g.userData.regionOwnershipClipped=true;return g;}
  }
  if(!needsClip)return g;
  const idx = g.index, count = idx ? idx.count : pos.count, names = Object.keys(g.attributes);
  const sizes = names.map(n => g.attributes[n].itemSize), offsets = [];
  let stride = 0; for (const size of sizes) { offsets.push(stride); stride += size; }
  const po = offsets[names.indexOf('position')], arrays = names.map(() => []);
  const vertex = i => names.flatMap(name => {
    const a = g.attributes[name], result = [];
    for (let j = 0; j < a.itemSize; j++) result.push(a.getComponent(i, j));
    return result;
  });
  let changed = false;
  for (let i = 0; i < count; i += 3) {
    if (i && i % 384 === 0) yield;
    let poly = [vertex(idx ? idx.getX(i) : i), vertex(idx ? idx.getX(i + 1) : i + 1), vertex(idx ? idx.getX(i + 2) : i + 2)];
    for (const plane of planes) {
      const coordinate = po + plane.axis, d = p => (plane.limit - p[coordinate]) * plane.outward;
      if (poly.every(p => d(p) >= 0)) continue;
      changed = true; const next = [];
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j], b = poly[(j + 1) % poly.length], da = d(a), db = d(b);
        if (da >= 0) next.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db), p = a.map((v, k) => v + (b[k] - v) * t);
          p[coordinate] = plane.limit; next.push(p);
        }
      }
      poly = next; if (!poly.length) break;
    }
    for (let j = 1; j < poly.length - 1; j++) for (const p of [poly[0], poly[j], poly[j + 1]])
      for (let a = 0; a < names.length; a++) for (let k = 0; k < sizes[a]; k++) arrays[a].push(p[offsets[a] + k]);
  }
  if (!changed) return g;
  const out = new THREE.BufferGeometry(); owner?.geometry(out);
  for (let a = 0; a < names.length; a++) {
    const original = g.attributes[names[a]];
    // Water/terrain attributes are unnormalised Float32. Refuse an unsupported
    // format rather than silently changing integer-normalised render inputs.
    if (original.normalized || original.isInterleavedBufferAttribute) throw new Error('Unsupported region geometry attribute: ' + names[a]);
    out.setAttribute(names[a], new THREE.BufferAttribute(new original.array.constructor(arrays[a]), sizes[a]));
  }
  out.userData = {...g.userData, regionOwnershipClipped: true};
  owner ? owner.release(g) : g.dispose(); return out;
}
