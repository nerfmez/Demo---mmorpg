// Small math helpers shared by the simulation. Pure functions, no engine types.
// Axis convention (same as Godot and Three.js): X right, Y up, Z toward the camera.
// A facing angle `a` points along (sin a, cos a) on the XZ plane.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function dist(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

export function dist2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

/** Facing angle from (ax,az) toward (bx,bz). */
export function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

/** Signed smallest difference b - a, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function dirFromAngle(a) {
  return { x: Math.sin(a), z: Math.cos(a) };
}

/** Distance from point to segment, plus the projection parameter t in [0,1]. */
export function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return { d: dist(px, pz, cx, cz), t, cx, cz };
}

const polylineBoxes = new WeakMap();
/** Lower bound of the distance from a point to a polyline: the distance to its
 *  bounding box (cached per points array). Lets nearest-road searches skip
 *  polylines that cannot beat the best distance found so far. */
export function distToPolylineBounds(px, pz, pts) {
  let b = polylineBoxes.get(pts);
  if (!b) {
    b = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, z] of pts) { if (x < b[0]) b[0] = x; if (x > b[1]) b[1] = x; if (z < b[2]) b[2] = z; if (z > b[3]) b[3] = z; }
    polylineBoxes.set(pts, b);
  }
  const dx = Math.max(b[0] - px, 0, px - b[1]), dz = Math.max(b[2] - pz, 0, pz - b[3]);
  return Math.hypot(dx, dz);
}

/** Distance from a point to a polyline [[x,z],...]. The same arithmetic as
 *  distToSegment (identical results), without an object per segment: road and
 *  path queries run per ground sample and map pixel. */
export function distToPolyline(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], vx = pts[i + 1][0] - ax, vz = pts[i + 1][1] - az;
    const len2 = vx * vx + vz * vz;
    const t = clamp(len2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / len2 : 0, 0, 1);
    const dx = ax + vx * t - px, dz = az + vz * t - pz, d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
}

/** Z of a polyline that runs mostly along X (used for the road), linear interpolation. */
const strictlyIncreasing = new WeakMap();
export function polylineZAtX(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  let sorted = strictlyIncreasing.get(pts);
  if (sorted === undefined) { sorted = pts.every((p, i) => !i || p[0] > pts[i - 1][0]); strictlyIncreasing.set(pts, sorted); }
  if (sorted) { // same segment as the scan below, found by bisection (shorelines are long)
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] < x) lo = mid; else hi = mid; }
    const [ax, az] = pts[lo], [bx, bz] = pts[hi];
    return lerp(az, bz, (x - ax) / (bx - ax || 1));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if (x >= ax && x <= bx) return lerp(az, bz, (x - ax) / (bx - ax || 1));
  }
  return pts[pts.length - 1][1];
}

/** Even/odd containment, including concave capes. No temporary arrays. */
export function pointInPolygon(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** The original X shoreline remains the default; an authored coastal contour
 * is optional for capes with multiple land/water intervals along the same X. */
export function seaContains(sea, x, z) {
  if (sea.coastline) return !coastIndex(sea.coastline).contains(x, z);
  return z > polylineZAtX(sea.shore, x) || (!!sea.bays && bayIndex(sea).some((b) => x >= b.box[0] && x <= b.box[1] && z >= b.box[2] && z <= b.box[3] && pointInPolygon(b.points, x, z)));
}

// Bays (data sea.bays, Frontier's Sunfall Coast): water cut into the land north of an X shoreline,
// each a closed outline {points, kinds} whose open side lies out in the sea. Their coast is the
// outline's edges that are not out at sea, and the shoreline's own segments inside a bay are not
// coast there. Far from every bay (more than BAY_REACH metres outside its box) coastSample answers
// exactly as before.
const BAY_REACH = 60, bayIndexes = new WeakMap();
function bayIndex(sea) {
  let list = bayIndexes.get(sea.bays);
  if (list) return list;
  list = sea.bays.map((bay) => {
    const xs = bay.points.map((p) => p[0]), zs = bay.points.map((p) => p[1]), box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    return { points: bay.points, kinds: bay.kinds || [], box };
  });
  const inside = (x, z) => list.some((b) => pointInPolygon(b.points, x, z));
  for (const b of list) {
    const edges = [], near = (x, z) => x > b.box[0] - BAY_REACH && x < b.box[1] + BAY_REACH && z > b.box[2] - BAY_REACH && z < b.box[3] + BAY_REACH;
    b.points.forEach((a, i) => { const c = b.points[(i + 1) % b.points.length], mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2; if (mz <= polylineZAtX(sea.shore, mx)) edges.push({ a, b: c, kind: b.kinds[i] || 'beach' }); });
    for (let i = 0; i < sea.shore.length - 1; i++) {
      const a = sea.shore[i], c = sea.shore[i + 1], mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if ((near(a[0], a[1]) || near(c[0], c[1])) && !inside(mx, mz - 0.01)) edges.push({ a, b: c, kind: sea.edgeKinds?.[i] || 'beach' });
    }
    b.edges = edges;
  }
  bayIndexes.set(sea.bays, list);
  return list;
}

// A long coastline is indexed once: runs of 16 consecutive segments with their
// bounding boxes (nearest-edge queries visit runs in order of their box distance
// and stop once no box can beat the best), and the edges spanning each z band
// (containment tests only those). Answers equal the brute-force loops exactly:
// the same per-segment arithmetic and the same lowest-index tie rule.
const COAST_RUN = 16, COAST_BAND = 8, coastIndexes = new WeakMap();
function coastIndex(points) {
  let g = coastIndexes.get(points);
  if (g) return g;
  let z0 = Infinity, z1 = -Infinity;
  for (const [, z] of points) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const nz = Math.floor((z1 - z0) / COAST_BAND) + 1, bands = Array.from({ length: nz }, () => []);
  const cz = z => Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / COAST_BAND)));
  // pointInPolygon pairs vertex i with i-1 (wrapping), including the closing edge.
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    for (let k = cz(Math.min(a[1], b[1])); k <= cz(Math.max(a[1], b[1])); k++) bands[k].push(i);
  }
  const runs = [];
  for (let s = 0; s < points.length - 1; s += COAST_RUN) {
    const e = Math.min(points.length - 1, s + COAST_RUN), box = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = s; i <= e; i++) { const [x, z] = points[i]; box[0] = Math.min(box[0], x); box[1] = Math.max(box[1], x); box[2] = Math.min(box[2], z); box[3] = Math.max(box[3], z); }
    runs.push({ s, e, box, lb: 0 });
  }
  // the run with the nearest box first (a good first bound), then every run whose box
  // can still beat the best; no per-query sort (the tie rule picks the lowest index anyway)
  const scan = (r, x, z, best) => {
    let { nearest, index } = best;
    for (let i = r.s; i < r.e; i++) {
      const a = points[i], b = points[i + 1];
      const vx=b[0]-a[0], vz=b[1]-a[1], len2=vx*vx+vz*vz;
      const t=len2>0?clamp(((x-a[0])*vx+(z-a[1])*vz)/len2,0,1):0;
      const dx=x-a[0]-vx*t, dz=z-a[1]-vz*t, d=dx*dx+dz*dz;
      if (d < nearest || (d === nearest && i < index)) { nearest = d; index = i; }
    }
    best.nearest = nearest; best.index = index;
  };
  g = {
    nearest(x, z) {
      let first = runs[0];
      for (const r of runs) { const dx = Math.max(r.box[0] - x, 0, x - r.box[1]), dz = Math.max(r.box[2] - z, 0, z - r.box[3]); r.lb = dx * dx + dz * dz; if (r.lb < first.lb) first = r; }
      const best = { nearest: Infinity, index: 0 };
      scan(first, x, z, best);
      for (const r of runs) if (r !== first && !(r.lb > best.nearest * (1 + 1e-9) + 1e-9)) scan(r, x, z, best); // margin for rounding in the box bound
      return best;
    },
    contains(x, z) {
      const j = Math.floor((z - z0) / COAST_BAND);
      if (j < 0 || j >= nz) return false;
      let inside = false;
      for (const i of bands[j]) {
        const a = points[i], b = points[i === 0 ? points.length - 1 : i - 1];
        if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      return inside;
    },
  };
  coastIndexes.set(points, g);
  return g;
}

/** Signed nearest shoreline distance (positive inland) and authored edge use. */
export function coastSample(sea, x, z) {
  const points = sea.coastline || sea.shore, kinds = sea.coastline ? sea.coastKinds : sea.edgeKinds;
  if (!sea.coastline && sea.bays) {
    const bay = bayIndex(sea).find((b) => x > b.box[0] - BAY_REACH && x < b.box[1] + BAY_REACH && z > b.box[2] - BAY_REACH && z < b.box[3] + BAY_REACH);
    if (bay) {
      let nearest = Infinity, kind = 'beach';
      for (const { a, b, kind: k } of bay.edges) {
        const vx = b[0] - a[0], vz = b[1] - a[1], len2 = vx * vx + vz * vz, t = len2 > 0 ? clamp(((x - a[0]) * vx + (z - a[1]) * vz) / len2, 0, 1) : 0;
        const dx = x - a[0] - vx * t, dz = z - a[1] - vz * t, d = dx * dx + dz * dz;
        if (d < nearest) { nearest = d; kind = k; }
      }
      return { distance: Math.sqrt(nearest) * (seaContains(sea, x, z) ? -1 : 1), kind };
    }
  }
  if (points.length > 64) {
    const { nearest, index } = coastIndex(points).nearest(x, z);
    return { distance: Math.sqrt(nearest) * (seaContains(sea, x, z) ? -1 : 1), kind: kinds?.[index] || 'beach' };
  }
  let nearest = Infinity, index = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const vx=b[0]-a[0], vz=b[1]-a[1], len2=vx*vx+vz*vz;
    const t=len2>0?clamp(((x-a[0])*vx+(z-a[1])*vz)/len2,0,1):0;
    const dx=x-a[0]-vx*t, dz=z-a[1]-vz*t;
    const d=dx*dx+dz*dz;
    if (d < nearest) { nearest = d; index = i; }
  }
  return { distance: Math.sqrt(nearest) * (seaContains(sea, x, z) ? -1 : 1), kind: kinds?.[index] || 'beach' };
}

/** Transform a world point into an oriented box's local frame. Box: {x,z,hx,hz,angle}. */
export function toBoxLocal(box, px, pz) {
  const c = Math.cos(box.angle);
  const s = Math.sin(box.angle);
  const dx = px - box.x;
  const dz = pz - box.z;
  // inverse rotation about Y (the box's local +X is (cos a, -sin a) in world XZ)
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

export function fromBoxLocal(box, lx, lz) {
  const c = Math.cos(box.angle);
  const s = Math.sin(box.angle);
  return { x: box.x + lx * c + lz * s, z: box.z - lx * s + lz * c };
}

export function pointInBox(box, px, pz, pad = 0) {
  const { lx, lz } = toBoxLocal(box, px, pz);
  return Math.abs(lx) <= box.hx + pad && Math.abs(lz) <= box.hz + pad;
}
