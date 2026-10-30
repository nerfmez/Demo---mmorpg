// Dungeon maps (data/dungeons/*.json): flat floors on fixed levels joined by stairs, with water,
// over a void. Floors are simple shapes or outlines traced from the concept art. Unlike the open
// world there is no heightfield: the last floor in the list that
// contains a point is the ground there. A step between two points is walkable when both are on a
// walkable floor and their heights differ by at most `maxStep`, so a ledge between two levels is
// a wall and only stairs join them. Props block with circles (`propTypes.*.block`). Links are
// doors to another map; a secret link works only after it has been found (inspectAt). A prop with
// `talk` answers the hero beside it (talkAt): the throne's pearl wakes the boss.
// Pure rules: no three, no DOM. The renderer reads the same floors to draw them.

const WALK = { stone: true, sand: true, nacre: true, shallow: true, deep: false };

/** Chaikin corner cutting: the smooth centre line the game walks on and the renderer draws. */
export function smoothPath(pts, iterations = 3) {
  let p = pts.map(([x, z]) => [x, z]);
  for (let k = 0; k < iterations; k++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/** Turn a prop-local offset by facing `a` (rotation.y = a): local +z becomes (sin a, cos a). */
export function turn(lx, lz, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [lx * c + lz * s, -lx * s + lz * c];
}

function segDist2(px, pz, ax, az, bx, bz) {
  const ux = bx - ax, uz = bz - az, l2 = ux * ux + uz * uz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ux + (pz - az) * uz) / l2)) : 0;
  const dx = px - (ax + ux * t), dz = pz - (az + uz * t);
  return dx * dx + dz * dz;
}

// Point in polygon by crossings, with the edges bucketed in 1 m bands of z so a test only looks
// at the few edges level with the point (traced outlines have hundreds of points).
const BAND = 1;
function prepareRing(pts) {
  const z0 = Math.min(...pts.map((p) => p[1])), bands = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const lo = Math.floor((Math.min(a[1], b[1]) - z0) / BAND), hi = Math.floor((Math.max(a[1], b[1]) - z0) / BAND);
    for (let k = lo; k <= hi; k++) (bands[k] ||= []).push([a[0], a[1], b[0], b[1]]);
  }
  return { z0, bands };
}
function ringContains(r, x, z) {
  const edges = r.bands[Math.floor((z - r.z0) / BAND)];
  if (!edges) return false;
  let inside = false;
  for (const [ax, az, bx, bz] of edges) {
    if ((az > z) !== (bz > z) && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
  }
  return inside;
}

/** Prepare one floor: bounding box and a containment test giving the height there (or NaN). */
function prepareFloor(f) {
  const out = { ...f, walkable: WALK[f.kind] ?? false };
  if (f.shape === 'circle' || f.shape === 'ellipse') {
    const [cx, cz] = f.c, rx = f.r ?? f.rx, rz = f.r ?? f.rz;
    out.box = [cx - rx, cz - rz, cx + rx, cz + rz];
    out.heightAt = (x, z) => (((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1 ? f.y : NaN);
  } else if (f.shape === 'path') {
    const line = smoothPath(f.pts), h2 = (f.w / 2) ** 2;
    out.line = line;
    const xs = line.map((p) => p[0]), zs = line.map((p) => p[1]), h = f.w / 2;
    out.box = [Math.min(...xs) - h, Math.min(...zs) - h, Math.max(...xs) + h, Math.max(...zs) + h];
    out.heightAt = (x, z) => {
      for (let i = 0; i < line.length - 1; i++) if (segDist2(x, z, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]) <= h2) return f.y;
      return NaN;
    };
  } else if (f.shape === 'stairs') {
    const [ax, az] = f.a, [bx, bz] = f.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, h = f.w / 2;
    out.length = len;
    out.y = Math.max(f.y0, f.y1);
    out.box = [Math.min(ax, bx) - h, Math.min(az, bz) - h, Math.max(ax, bx) + h, Math.max(az, bz) + h];
    out.heightAt = (x, z) => {
      const t = (x - ax) * ux + (z - az) * uz, side = -(x - ax) * uz + (z - az) * ux;
      if (t < 0 || t > len || Math.abs(side) > h) return NaN;
      return f.y0 + (f.y1 - f.y0) * (t / len);
    };
  } else if (f.shape === 'poly') {
    // a traced outline (data/dungeons/*-trace.json): pts, plus holes cut out of it (rock islands)
    const rings = [f.pts, ...(f.holes || [])].map(prepareRing);
    const xs = f.pts.map((p) => p[0]), zs = f.pts.map((p) => p[1]);
    out.box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    out.heightAt = (x, z) => {
      if (!ringContains(rings[0], x, z)) return NaN;
      for (let i = 1; i < rings.length; i++) if (ringContains(rings[i], x, z)) return NaN;
      return f.y;
    };
  } else throw new Error(`dungeon floor ${f.id}: unknown shape ${f.shape}`);
  return out;
}

/** Collision circles of the props, from `propTypes` (radius or [dx, dz, r] list), scaled and turned. */
export function propBlockers(props, types) {
  const out = [];
  for (const p of props) {
    const t = types[p.type];
    if (!t) throw new Error(`dungeon prop type ${p.type} is not in propTypes`);
    const s = p.scale ?? 1, a = p.rot ?? 0;
    if (typeof t.block === 'number') { if (t.block > 0) out.push({ x: p.at[0], z: p.at[1], r: t.block * s, prop: p.type }); continue; }
    for (const [dx, dz, r] of t.block) {
      const [ox, oz] = turn(dx * s, dz * s, a);
      out.push({ x: p.at[0] + ox, z: p.at[1] + oz, r: r * s, prop: p.type });
    }
  }
  return out;
}

const PROBES = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];

/**
 * One dungeon map (the `inside` or `outside` part of a dungeon file).
 * @param {object} def the map ({floors, props, links, regions, bounds, spawn, ...})
 * @param {object} rules the file's shared rules ({maxStep, maxSlope, heroRadius, propTypes})
 */
export function createDungeon(def, rules) {
  const floors = def.floors.map(prepareFloor);
  const maxStep = rules.maxStep, radius = rules.heroRadius;
  const blockers = propBlockers(def.props || [], rules.propTypes);

  /** The floor under (x, z): {y, floor, walkable, waterY} or null over the void. */
  function surfaceAt(x, z) {
    for (let i = floors.length - 1; i >= 0; i--) {
      const f = floors[i], b = f.box;
      if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      const y = f.heightAt(x, z);
      if (!Number.isNaN(y)) return { y, floor: f, walkable: f.walkable, waterY: f.waterY ?? null };
    }
    return null;
  }

  const blockedAt = (x, z, r = radius) => blockers.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < (b.r + r) ** 2);

  /** Height to stand at (x, z) coming from height fromY, or NaN: the body (radius r) must fit on walkable ground. */
  function standY(x, z, fromY, r = radius) {
    const s = surfaceAt(x, z);
    if (!s || !s.walkable || Math.abs(s.y - fromY) > maxStep) return NaN;
    for (const [px, pz] of PROBES) {
      const q = surfaceAt(x + px * r, z + pz * r);
      if (!q || !q.walkable || Math.abs(q.y - s.y) > maxStep) return NaN;
    }
    return s.y;
  }

  /** Push (x, z) out of the prop circles. */
  function pushOut(x, z) {
    for (const b of blockers) {
      const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz), min = b.r + radius;
      if (d < min) {
        const k = d > 1e-6 ? min / d : 1;
        x = b.x + (d > 1e-6 ? dx * k : min);
        z = b.z + (d > 1e-6 ? dz * k : 0);
      }
    }
    return [x, z];
  }

  /** Move pos {x, z, y} by (dx, dz), sliding along ledges and props. Sub-steps so a long frame never skips a ledge. */
  function move(pos, dx, dz) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
    for (let i = 0; i < n; i++) {
      const sx = dx / n, sz = dz / n;
      for (const [tx, tz] of [[pos.x + sx, pos.z + sz], [pos.x + sx, pos.z], [pos.x, pos.z + sz]]) {
        const [px, pz] = pushOut(tx, tz);
        const y = standY(px, pz, pos.y);
        if (!Number.isNaN(y)) { pos.x = px; pos.z = pz; pos.y = y; break; }
      }
    }
    return pos;
  }

  /** The named area around (x, z) (the smallest region containing it), for the banner. */
  function regionAt(x, z) {
    let best = null;
    for (const r of def.regions || []) {
      const d = Math.hypot(x - r.at[0], z - r.at[1]);
      if (d <= r.r && (!best || r.r < best.r)) best = r;
    }
    return best;
  }

  /** The door at (x, z), if any; a secret door only once it is in `found` (a Set of link ids). */
  function linkAt(x, z, found) {
    return (def.links || []).find((l) => Math.hypot(x - l.at[0], z - l.at[1]) <= l.r && (!l.secret || found?.has(l.id))) || null;
  }

  /** A secret door close enough to inspect from (x, z) and not found yet. */
  function inspectAt(x, z, found) {
    return (def.links || []).find((l) => l.secret && !found?.has(l.id) && Math.hypot(x - l.at[0], z - l.at[1]) <= l.inspectR) || null;
  }

  /** A prop that talks from (x, z) (`talk: {r, labelTh, lineTh, wakes}`, the throne's pearl wakes the
   *  boss), unless what it wakes is already in `woken` (a Set of prop types). */
  function talkAt(x, z, woken) {
    return (def.props || []).find((p) => p.talk && !woken?.has(p.talk.wakes) && Math.hypot(x - p.at[0], z - p.at[1]) <= p.talk.r) || null;
  }

  /** Where (x, z) can stand at all, ignoring where it came from (spawns and arrivals). */
  function landY(x, z) {
    const s = surfaceAt(x, z);
    return s ? standY(x, z, s.y) : NaN;
  }

  return { def, rules, floors, blockers, bounds: def.bounds, surfaceAt, standY, landY, blockedAt, pushOut, move, regionAt, linkAt, inspectAt, talkAt };
}

/**
 * Every place reachable on foot from `from`, on a `res`-metre grid (the step rule, the hero's
 * body and the props all apply). Returns reached(x, z): true when the nearest grid cell was reached.
 */
export function reachableFrom(map, from, res = 0.5) {
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const w = Math.floor((maxX - minX) / res) + 1, h = Math.floor((maxZ - minZ) / res) + 1;
  const ys = new Float32Array(w * h).fill(NaN), seen = new Uint8Array(w * h);
  const ix = (x) => Math.round((x - minX) / res), iz = (z) => Math.round((z - minZ) / res);
  const sx = ix(from[0]), sz = iz(from[1]);
  const y0 = map.landY(minX + sx * res, minZ + sz * res);
  if (Number.isNaN(y0)) throw new Error(`start ${from} cannot stand`);
  const queue = [sx + sz * w];
  ys[queue[0]] = y0; seen[queue[0]] = 1;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q], cx = c % w, cz = (c - cx) / w, cy = ys[c];
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, nz = cz + oz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const n = nx + nz * w;
      if (seen[n]) continue;
      const x = minX + nx * res, z = minZ + nz * res;
      if (map.blockedAt(x, z)) continue;
      const y = map.standY(x, z, cy);
      if (Number.isNaN(y)) continue;
      seen[n] = 1; ys[n] = y; queue.push(n);
    }
  }
  const reached = (x, z) => {
    const a = ix(x), b = iz(z);
    return a >= 0 && b >= 0 && a < w && b < h && seen[a + b * w] === 1;
  };
  reached.count = queue.length;
  return reached;
}
