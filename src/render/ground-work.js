// Same arithmetic and traversal as core/terrain helpers; rendering cooperates
// without changing collision/heightfield construction or authored resolution.
import {clamp,distToSegment} from '../core/math.js';

export function* boxBlurSteps(src, w, h, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = radius * 2 + 1;
  for (let j = 0; j < h; j++) {
    if(j%8===0)yield;
    let acc = 0;
    const row = j * w;
    for (let i = -radius; i <= radius; i++) acc += src[row + clamp(i, 0, w - 1)];
    for (let i = 0; i < w; i++) {
      tmp[row + i] = acc / n;
      acc += src[row + clamp(i + radius + 1, 0, w - 1)] - src[row + clamp(i - radius, 0, w - 1)];
    }
  }
  for (let i = 0; i < w; i++) {
    if(i%8===0)yield;
    let acc = 0;
    for (let j = -radius; j <= radius; j++) acc += tmp[clamp(j, 0, h - 1) * w + i];
    for (let j = 0; j < h; j++) {
    if(j%8===0)yield;
      out[j * w + i] = acc / n;
      acc += tmp[clamp(j + radius + 1, 0, h - 1) * w + i] - tmp[clamp(j - radius, 0, h - 1) * w + i];
    }
  }
  return out;
}

/**
 * Rasterise polylines: for every cell within `reach` metres of a line, calls
 * visit(index, distance, arcLength, lineIndex). Only cells near each segment are touched.
 */
export function* rasterPolylineSteps(grid, pts, reach, visit) {
  const { ox, oz, res, w, h } = grid;
  let arc = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const segLen = Math.hypot(bx - ax, bz - az);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - ox) / res));
    const i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + reach - ox) / res));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - oz) / res));
    const j1 = Math.min(h - 1, Math.ceil((Math.max(az, bz) + reach - oz) / res));
    for (let j = j0; j <= j1; j++) {
      if(j%8===0)yield;
      const z = oz + j * res;
      for (let i = i0; i <= i1; i++) {
        const x = ox + i * res;
        const r = distToSegment(x, z, ax, az, bx, bz);
        if (r.d <= reach) visit(j * w + i, r.d, arc + r.t * segLen);
      }
    }
    arc += segLen;
  }
  return arc;
}
