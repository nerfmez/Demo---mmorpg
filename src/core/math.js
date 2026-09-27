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

/** Distance from a point to a polyline [[x,z],...]. */
export function distToPolyline(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (r.d < best) best = r.d;
  }
  return best;
}

/** Z of a polyline that runs mostly along X (used for the road), linear interpolation. */
export function polylineZAtX(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if (x >= ax && x <= bx) return lerp(az, bz, (x - ax) / (bx - ax || 1));
  }
  return pts[pts.length - 1][1];
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
