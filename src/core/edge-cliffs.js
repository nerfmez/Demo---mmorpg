// Raised ground behind an authored cliff line (acceptedScenes.edgeCliffs): a plateau
// outlined by a closed polygon whose edges are either cliffs (a steep face `lean`
// metres deep, drawn with rock columns by render/edge-cliffs.js) or ramps (a slope
// `ramp` metres wide down to the surrounding ground). Applied after the scenes and
// seams (core/terrain.js) as a floor under the ground; a ramp edge lying on a map
// seam keeps the seam's height. Pure geometry: no randomness.
import {pointInPolygon} from './math.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const prepared = new WeakMap();
function prepare(cliff) {
  let p = prepared.get(cliff); if (p) return p;
  const pts = cliff.points.map(q => [q[0], q[1]]), kinds = cliff.points.map(q => q[2] || 'cliff');
  const xs = pts.map(q => q[0]), zs = pts.map(q => q[1]);
  p = { pts, kinds, box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] };
  prepared.set(cliff, p); return p;
}
/** Distance from (x, z) to the nearest outline edge of each kind (edge i runs from point i). */
function edgeDistances(p, x, z) {
  let cliff = Infinity, ramp = Infinity;
  for (let i = 0; i < p.pts.length; i++) {
    const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
    if (p.kinds[i] === 'ramp') ramp = Math.min(ramp, d); else cliff = Math.min(cliff, d);
  }
  return { cliff, ramp };
}
/** The plateau height of one edge cliff at (x, z), or -Infinity outside it. */
export function edgeCliffAt(cliff, x, z) {
  const p = prepare(cliff), b = p.box;
  if (x < b[0] || x > b[1] || z < b[2] || z > b[3] || !pointInPolygon(p.pts, x, z)) return -Infinity;
  const { cliff: dc, ramp: dr } = edgeDistances(p, x, z);
  return cliff.top * Math.min(smooth(0, cliff.lean, dc), smooth(0, cliff.ramp, dr));
}
/** The highest plateau of all edge cliffs at (x, z), or -Infinity. */
export function edgeCliffsAt(data, x, z) {
  let h = -Infinity;
  for (const cliff of data.acceptedScenes?.edgeCliffs || []) h = Math.max(h, edgeCliffAt(cliff, x, z));
  return h;
}
/** True within `pad` metres of an edge cliff's outline or inside it: scene props there are left out. */
export function edgeCliffCover(data, x, z, pad = 0) {
  for (const cliff of data.acceptedScenes?.edgeCliffs || []) {
    const p = prepare(cliff), b = p.box;
    if (x < b[0] - pad || x > b[1] + pad || z < b[2] - pad || z > b[3] + pad) continue;
    if (pointInPolygon(p.pts, x, z)) return true;
    const d = edgeDistances(p, x, z);
    if (Math.min(d.cliff, d.ramp) < pad) return true;
  }
  return false;
}
/** The cliff stretches of an edge cliff as polylines (consecutive cliff edges joined). */
export function edgeCliffRuns(cliff) {
  const p = prepare(cliff), n = p.pts.length, runs = [];
  let start = p.kinds.findIndex(k => k === 'ramp'); if (start < 0) start = 0;
  for (let c = 1; c <= n; c++) {
    const i = (start + c) % n;
    if (p.kinds[i] === 'ramp') continue;
    if (p.kinds[(i + n - 1) % n] === 'ramp' || !runs.length) runs.push([p.pts[i]]);
    runs[runs.length - 1].push(p.pts[(i + 1) % n]);
  }
  return runs;
}
