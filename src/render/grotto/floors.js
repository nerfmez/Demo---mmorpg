// The grotto's floors and the cliffs under them, drawn from the same floors the rules walk on
// (src/core/dungeon.js): fans for circles/ellipses, strips for paths, real steps for stairs. Every
// floor's side runs down into the void and darkens to the void colour, so platforms read as
// standing over darkness like the concept. One merged mesh per material.
import * as THREE from 'three';
import { toonRamp } from '../toon.js';
import { gamePaint, stoneBlock, stoneMesh, STONE, STAIR } from './game-paint.js';
import { createRng } from '../../core/rng.js';
import { PAVING_TILE, flagstoneTexture, masonryTexture, nacreTexture, sandTexture, dirtTexture, wornTexture } from './textures.js';

const BASE = -14; // how far the cliffs fall
const FADE = 7; // metres for a cliff to darken into the void
const TILE = PAVING_TILE; // metres one texture repeat covers

class Mesh {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  vert(x, y, z, nx, ny, nz, u, v, c) { this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c.r, c.g, c.b); }
  /** A flat top triangle (counter-clockwise seen from above). */
  topTri(a, b, c, y, col) { for (const [x, z] of [a, b, c]) this.vert(x, y, z, 0, 1, 0, x / TILE, z / TILE, col); }
  /** A vertical wall from (ax,az) to (bx,bz), between yTop and yBottom, facing outward (nx,nz). */
  wall(ax, az, bx, bz, yTop, yBot, u0, u1, cTop, cBot) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    const v = (y) => y / TILE;
    this.vert(ax, yTop, az, nx, 0, nz, u0, v(yTop), cTop);
    this.vert(ax, yBot, az, nx, 0, nz, u0, v(yBot), cBot);
    this.vert(bx, yTop, bz, nx, 0, nz, u1, v(yTop), cTop);
    this.vert(bx, yTop, bz, nx, 0, nz, u1, v(yTop), cTop);
    this.vert(ax, yBot, az, nx, 0, nz, u0, v(yBot), cBot);
    this.vert(bx, yBot, bz, nx, 0, nz, u1, v(yBot), cBot);
  }
  /** A wall whose top slopes, from yA at a to yB at b. */
  wallSlope(ax, az, bx, bz, yA, yB, yBot, u0, u1, cTop, cBot) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    const v = (y) => y / TILE;
    this.vert(ax, yA, az, nx, 0, nz, u0, v(yA), cTop);
    this.vert(ax, yBot, az, nx, 0, nz, u0, v(yBot), cBot);
    this.vert(bx, yB, bz, nx, 0, nz, u1, v(yB), cTop);
    this.vert(bx, yB, bz, nx, 0, nz, u1, v(yB), cTop);
    this.vert(ax, yBot, az, nx, 0, nz, u0, v(yBot), cBot);
    this.vert(bx, yBot, bz, nx, 0, nz, u1, v(yBot), cBot);
  }
  /** A top quad a-b-c-d whose corners stand at their own heights (a tilted block). */
  tiltedTop(a, b, c, d, ya, yb, yc, yd, col) {
    for (const [[x, z], y] of [[a, ya], [b, yb], [c, yc], [a, ya], [c, yc], [d, yd]]) this.vert(x, y, z, 0, 1, 0, x / TILE, z / TILE, col);
  }
  geometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** A circle's or ellipse's outline, about `step` metres between points. */
export function ellipseOutline(f, step = 0.8) {
  const rx = f.r ?? f.rx, rz = f.r ?? f.rz, n = Math.max(16, Math.ceil((Math.PI * (rx + rz)) / step));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -(i / n) * Math.PI * 2; // seen from above with z toward the viewer this runs counter-clockwise
    out.push([f.c[0] + Math.cos(a) * rx, f.c[1] + Math.sin(a) * rz]);
  }
  return out;
}

/** The outline of a path: its right edge forward, a round cap, its left edge back, a round cap. */
export function pathOutline(f, capSteps = 8) {
  const L = f.line, h = f.w / 2, right = [], left = [];
  for (let i = 0; i < L.length; i++) {
    const p = L[Math.max(0, i - 1)], q = L[Math.min(L.length - 1, i + 1)];
    let tx = q[0] - p[0], tz = q[1] - p[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    // right of the direction of travel, seen from above with +z toward the viewer: (-tz, tx)
    right.push([L[i][0] - tz * h, L[i][1] + tx * h]);
    left.push([L[i][0] + tz * h, L[i][1] - tx * h]);
  }
  const cap = (c, from, sign) => {
    const pts = [];
    const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    for (let k = 1; k < capSteps; k++) { const a = a0 + sign * (k / capSteps) * Math.PI; pts.push([c[0] + Math.cos(a) * h, c[1] + Math.sin(a) * h]); }
    return pts;
  };
  const end = L[L.length - 1], start = L[0];
  return [...right, ...cap(end, right[right.length - 1], -1), ...left.reverse(), ...cap(start, left[left.length - 1], -1)];
}

/** Every outline of a floor: [{pts, hole}] (a traced floor has holes: rock islands). */
export function floorRings(f, step = 0.8) {
  if (f.shape === 'circle' || f.shape === 'ellipse') return [{ pts: ellipseOutline(f, step), hole: false }];
  if (f.shape === 'path') return [{ pts: pathOutline(f, 10), hole: false }];
  if (f.shape === 'poly') return [{ pts: f.pts, hole: false }, ...(f.holes || []).map((h) => ({ pts: h, hole: true }))];
  return [];
}

/** Signed area: positive when the outline runs counter-clockwise on screen (north up), the way wall() faces outward. */
export function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; s += ax * bz - bx * az; }
  return -s / 2;
}

/**
 * Cliff walls around an outline, facing away from the floor and darkening into the void (a
 * `hole` faces into the hole; `inner` faces into a basin, down to that height).
 */
function addWalls(mesh, poly, yTop, look, inner = null, hole = false, map = null, self = null) {
  if ((area(poly) > 0) !== (inner === null && !hole)) poly = [...poly].reverse();
  let u = 0;
  const lip = new THREE.Color(1, 1, 1), dark = new THREE.Color(look.void), deep = new THREE.Color(0.45, 0.6, 0.65), low = new THREE.Color(0.62, 0.62, 0.62);
  const mid = yTop - FADE;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const l = Math.hypot(bx - ax, bz - az);
    // what lies past this edge: another floor at this height (no wall: the two meet flush), a lower
    // floor (a wall down to it, not a cliff into the void) or nothing (the cliff)
    const nx = l ? -(bz - az) / l : 0, nz = l ? (bx - ax) / l : 0;
    const past = map && inner === null ? map.surfaceAt((ax + bx) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5) : null;
    const other = past && past.floor !== self ? past : null;
    if (other && Math.abs(other.y - yTop) < 0.12) { u += l; continue; }
    if (inner !== null) mesh.wall(ax, az, bx, bz, yTop, inner, u / TILE, (u + l) / TILE, lip, deep);
    else if (other && other.y < yTop) mesh.wall(ax, az, bx, bz, yTop, other.y - 0.4, u / TILE, (u + l) / TILE, lip, low);
    else {
      mesh.wall(ax, az, bx, bz, yTop, mid, u / TILE, (u + l) / TILE, lip, dark);
      mesh.wall(ax, az, bx, bz, mid, BASE, u / TILE, (u + l) / TILE, dark, dark);
    }
    u += l;
  }
}

function addFan(mesh, poly, y, white) {
  let cx = 0, cz = 0;
  for (const [x, z] of poly) { cx += x; cz += z; }
  cx /= poly.length; cz /= poly.length;
  const ccw = area(poly) > 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // triangles must face up: for an outline with positive area() that is (centre, a, b)
    if (ccw) mesh.topTri([cx, cz], a, b, y, white); else mesh.topTri([cx, cz], b, a, y, white);
  }
}

function addStrip(mesh, f, white) {
  const poly = pathOutline(f, 10), n = f.line.length;
  // right edge is poly[0..n-1]; left edge (reversed) follows the end cap
  const capN = 9, right = poly.slice(0, n), left = poly.slice(n + capN, n + capN + n).reverse();
  for (let i = 0; i < n - 1; i++) {
    const r0 = right[i], r1 = right[i + 1], l0 = left[i], l1 = left[i + 1];
    mesh.topTri(r0, r1, l1, f.y, white); // the caller turns every triangle up (faceUp)
    mesh.topTri(r0, l1, l0, f.y, white);
  }
  // round caps as fans
  const capFan = (c, pts) => { for (let i = 0; i < pts.length - 1; i++) mesh.topTri(c, pts[i], pts[i + 1], f.y, white); };
  capFan(f.line[n - 1], [right[n - 1], ...poly.slice(n, n + capN), left[n - 1]]);
  capFan(f.line[0], [left[0], ...poly.slice(n + capN + n), right[0]]);
  return poly;
}

/** Make every triangle of an up-facing top face upward (strip winding depends on the turn direction). */
function faceUp(mesh, from) {
  const p = mesh.pos;
  for (let i = from; i < p.length; i += 9) {
    const ax = p[i], az = p[i + 2], bx = p[i + 3], bz = p[i + 5], cx = p[i + 6], cz = p[i + 8];
    // normal.y of (b-a)x(c-a) = (bz-az)(cx-ax) - (bx-ax)(cz-az)
    if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) {
      for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
      const uv = mesh.uv, j = (i / 3) * 2;
      for (let k = 0; k < 2; k++) { const t = uv[j + 2 + k]; uv[j + 2 + k] = uv[j + 4 + k]; uv[j + 4 + k] = t; }
    }
  }
}

/**
 * A flight of stairs laid the game's way (accepted scenes' stoneStairs): every step is a course of
 * cut grey stones square to the flight, each course level with its front edge standing proud as a
 * riser, the joints staggered from course to course, and a low cheek stone at each side. The rules
 * walk the ramp under them; the steps sit at the ramp's middle height over each step.
 */
function addStairs(blocks, f, map, rng) {
  const [ax, az] = f.a, [bx, bz] = f.b, len = f.length, ux = (bx - ax) / len, uz = (bz - az) / len, h = f.w / 2;
  const qx = -uz, qz = ux; // unit sideways
  // steps of about 0.15 m rise, at least 0.4 m deep
  const n = Math.max(3, Math.min(Math.round(Math.abs(f.y1 - f.y0) / 0.15), Math.floor(len / 0.4)));
  const yAt = (i) => f.y0 + (f.y1 - f.y0) * ((i + 0.5) / n);
  const ry = Math.atan2(ux, uz), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const cheekW = Math.min(0.55, h * 0.2), cheekH = 0.45, inner = f.w - cheekW * 2;
  const place = (x, y, z, w, hh, d, yaw, color) => {
    q.setFromEuler(new THREE.Euler(0, yaw, 0));
    m4.compose(v.set(x, y, z), q, one);
    stoneBlock(blocks, rng, w, hh, d, color, m4);
  };
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * len, t1 = ((i + 1) / n) * len, tm = (t0 + t1) / 2, depth = (t1 - t0) * 1.04;
    const y = yAt(i), below = i === 0 ? Math.min(f.y0, f.y1) - 0.3 : Math.min(yAt(i - 1), y) - 0.12;
    const hh = y - below + 0.04, cx = ax + ux * tm, cz = az + uz * tm;
    // the course: stones about 0.9 m across, offset by half a stone on every other step
    const k = Math.max(2, Math.round(inner / 0.9)), w = inner / k, shift = i % 2 ? w / 2 : 0;
    for (let j = -1; j < k; j++) {
      const a = Math.max(0, j * w + shift), b = Math.min(inner, (j + 1) * w + shift);
      if (b - a < 0.12) continue;
      const off = -inner / 2 + (a + b) / 2;
      place(cx + qx * off, below, cz + qz * off, (b - a) * rng.range(0.94, 0.98), hh, depth, ry + rng.range(-0.02, 0.02), rng.pick(STAIR));
    }
    // the cheeks: a taller stone at each side, stepping with the flight
    for (const side of [1, -1]) {
      const off = side * (h - cheekW / 2), top = y + cheekH;
      const s = map.surfaceAt(cx + qx * side * (h + 0.5), cz + qz * side * (h + 0.5));
      const foot = s ? Math.min(s.y, y) - 0.2 : below - 0.6;
      place(cx + qx * off, foot, cz + qz * off, cheekW, top - foot, depth * 1.01, ry, rng.pick(STONE));
    }
  }
}

/**
 * Edging stones: a row of raised blocks just inside every edge where the floor drops away (to the
 * void, to water or to a lower level), the way the concept rims its walkways, pools and rooms;
 * each block its own length and height, with a narrow gap between. Edges that join ground at the
 * same level (a path entering a room, a stair foot) stay open. A walkway over shallow water gets
 * them too, although the hero can wade off it. The stones are old: now and then one is gone, one
 * has tipped over the edge or sunk, the rest sit a little crooked; none line an edge that broke
 * away (`broken`: the rubble props, [x, z, r]).
 */
function addCurbs(top, side, map, f, poly, look, hole = false, broken = []) {
  if ((area(poly) > 0) === hole) poly = [...poly].reverse(); // the outward side faces away from the floor
  const width = f.kind === 'deep' ? 0.55 : 0.5;
  const yFloor = f.kind === 'deep' ? f.waterY + 0.25 : f.y;
  const yBase = f.kind === 'shallow' ? f.waterY + 0.08 : yFloor + (f.kind === 'deep' ? 0.06 : 0.16);
  const lip = new THREE.Color(1, 1, 1), low = new THREE.Color(0.7, 0.7, 0.7);
  const hash = (n) => { const h = Math.sin(n * 91.345 + 7.13) * 43758.5453; return h - Math.floor(h); };
  // `left` is what remains of the current block; one used up to rounding counts as used up (or t stops moving)
  let block = 0, left = 0, blockH = yBase, wear = 1, tipOut = 0, lean = 0; // the current block, what is left of it (used up below 1e-4: rounding would stall t), its top and how it has aged
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-4) continue;
    const nx = -(bz - az) / l, nz = (bx - ax) / l; // outward
    const probe = map.surfaceAt((ax + bx) / 2 + nx * 0.6, (az + bz) / 2 + nz * 0.6);
    // open where the floor goes on at its own level; none beside a flight of stairs (its cheek is the wall there)
    if (probe && probe.walkable && (Math.abs(probe.y - f.y) < 0.2 || probe.floor.shape === 'stairs')) { left = 0; continue; }
    // cut the edge into blocks: 0.8-1.4 m each, 0.07 m apart, 0.12-0.3 m above the floor
    let t = 0;
    while (t < l - 1e-3) {
      if (left <= 1e-4) {
        block++;
        left = 0.8 + hash(block) * 0.6;
        blockH = yBase + hash(block + 0.5) * 0.14;
        wear = hash(block + 0.25);
        tipOut = wear < 0.3 ? 0.12 + hash(block + 0.75) * 0.22 : 0; // tipped over the edge (or sunk, at the water)
        lean = (hash(block + 0.6) - 0.5) * (tipOut ? 0.16 : 0.07); // one end lower than the other
        t += 0.07;
        continue;
      }
      const t1 = Math.min(l, t + left);
      const p = [ax + ((bx - ax) * t) / l, az + ((bz - az) * t) / l], q = [ax + ((bx - ax) * t1) / l, az + ((bz - az) * t1) / l];
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      const gone = wear < 0.13 || broken.some(([x, z, r]) => (mx - x) ** 2 + (mz - z) ** 2 < (r + 0.7) ** 2);
      if (!gone) {
        const p2 = [p[0] - nx * width, p[1] - nz * width], q2 = [q[0] - nx * width, q[1] - nz * width];
        // corner heights: the outer edge drops when the stone tips out; the ends lean
        const hp = blockH - tipOut - lean, hq = blockH - tipOut + lean, hp2 = blockH - tipOut * 0.25 - lean, hq2 = blockH - tipOut * 0.25 + lean;
        const from = top.pos.length;
        top.tiltedTop(p, q, q2, p2, hp, hq, hq2, hp2, lip);
        faceUp(top, from);
        const bot = yFloor - 0.05 - tipOut * 0.5;
        side.wallSlope(p[0], p[1], q[0], q[1], hp, hq, bot, 0, (t1 - t) / TILE, lip, low); // outer face
        side.wallSlope(q2[0], q2[1], p2[0], p2[1], hq2, hp2, bot, 0, (t1 - t) / TILE, lip, low); // inner face
        side.wallSlope(p2[0], p2[1], p[0], p[1], hp2, hp, bot, 0, width / TILE, lip, low); // its ends
        side.wallSlope(q[0], q[1], q2[0], q2[1], hq, hq2, bot, 0, width / TILE, lip, low);
      }
      left -= t1 - t;
      t = t1;
    }
  }
}

/**
 * The paving stones that fell where the old floor broke (each rubble prop lists them, grotto-trace.py):
 * every one its own slab, showing its own stone of the paving (its top keeps the texture of the place
 * it came from), slid out the way the break faces, tipped and sunk to the water floor; the ones from
 * the edge still lean on it, half out of the water. Tops go in with the paving, sides with the curbs.
 */
function addSunkStones(top, side, map, props) {
  const lip = new THREE.Color(1, 1, 1), low = new THREE.Color(0.62, 0.62, 0.62), m4 = new THREE.Matrix4(), e = new THREE.Euler(), v = new THREE.Vector3(), n = new THREE.Vector3();
  const hash = (k) => { const h = Math.sin(k * 51.73 + 3.1) * 43758.5453; return h - Math.floor(h); };
  let k = 0;
  for (const p of props) {
    const [bx, bz] = p.at, rot = p.rot ?? 0, ox = Math.sin(rot), oz = Math.cos(rot);
    for (const [cx, cz, w0, d0] of p.stones || []) {
      k++;
      const g = map.surfaceAt(cx + ox * 0.6, cz + oz * 0.6) || map.surfaceAt(bx, bz);
      if (!g || g.waterY == null) continue;
      const w = w0 * 0.94, d = d0 * 0.94, t = 0.22; // a hair smaller than its gap: worn as it fell
      // how far it slid out, how it tipped (toward the water, a little sideways) and how it turned
      const slide = 0.2 + hash(k) * 0.7, along = (cx - bx) * ox + (cz - bz) * oz; // stones from the rim slide less
      const x = cx + ox * slide * (along > -0.3 ? 1 : 0.4), z = cz + oz * slide * (along > -0.3 ? 1 : 0.4);
      const leanOnEdge = hash(k + 0.3) < 0.45;
      const tilt = leanOnEdge ? 0.35 + hash(k + 0.5) * 0.35 : hash(k + 0.5) * 0.25;
      const roll = (hash(k + 0.7) - 0.5) * 0.5, yaw = (hash(k + 0.9) - 0.5) * 0.7;
      const y = leanOnEdge ? g.waterY - 0.12 : g.y + 0.02 + hash(k + 0.1) * 0.08;
      // tip about the axis across the slide: the stone's far side (toward the water) goes down
      const qy = Math.atan2(ox, oz) + yaw;
      m4.makeRotationFromEuler(e.set(tilt, qy, roll, 'YXZ')).setPosition(x, y, z);
      const local = (lx, ly, lz) => v.set(lx, ly, lz).applyMatrix4(m4).toArray();
      // the stone's own corners in its local frame (turned back so they keep the joints' lines, all
      // but the small turn it took as it fell)
      const c = Math.cos(yaw - qy), s = Math.sin(yaw - qy), corner = (sx, sz) => [sx * w / 2 * c - sz * d / 2 * s, sx * w / 2 * s + sz * d / 2 * c];
      const base = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => corner(a, b));
      const P = [...base.map(([lx, lz]) => local(lx, t / 2, lz)), ...base.map(([lx, lz]) => local(lx, -t / 2, lz))];
      // its top shows the stone it was: uv from where it lay
      const uv = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [(cx + a * w / 2) / TILE, (cz + b * d / 2) / TILE]);
      n.set(0, 1, 0).applyEuler(e);
      const from = top.pos.length;
      for (const q of [0, 2, 1, 0, 3, 2]) top.vert(P[q][0], P[q][1], P[q][2], n.x, n.y, n.z, uv[q][0], uv[q][1], lip);
      faceUp(top, from);
      const mid = [(P[0][0] + P[2][0]) / 2, (P[0][2] + P[2][2]) / 2];
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
        const a = P[i], b = P[j], ab = P[j + 4], aa = P[i + 4];
        let nx = (a[0] + b[0]) / 2 - mid[0], nz = (a[2] + b[2]) / 2 - mid[1];
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        // wind each side to face out: (a, b, b-bottom) is front-facing when (b - a) x (down) points along n
        const ex = b[0] - a[0], ez = b[2] - a[2], out = -ez * nx + ex * nz < 0;
        const quad = out ? [a, b, ab, a, ab, aa] : [b, a, aa, b, aa, ab];
        const cols = out ? [lip, lip, low, lip, low, low] : [lip, lip, low, lip, low, low];
        quad.forEach((q, qi) => side.vert(q[0], q[1], q[2], nx, 0, nz, (qi % 3) * 0.1, q[1] / TILE, cols[qi]));
      }
    }
  }
}

/**
 * Wear on the paving: decals of a damp stain, hairline cracks and chipped spots (wornTexture), about one
 * every 45 m² of stone floor and one beside every break (the rubble props), never under a prop or
 * over an edge. Returns a Mesh (one draw) or null.
 */
function addWear(map, broken) {
  const rng = createRng((map.def.seed || 1) * 13 + 5), mesh = new Mesh(), white = new THREE.Color(1, 1, 1);
  const props = (map.def.props || []).filter((p) => p.type !== 'rubble' && p.type !== 'runeCircle');
  const clearOfProps = (x, z) => props.every((p) => (p.at[0] - x) ** 2 + (p.at[1] - z) ** 2 > (1.6 + 1.2 * (p.scale ?? 1)) ** 2);
  const put = (f, x, z, size) => {
    const a = rng.range(0, Math.PI * 2), c = Math.cos(a) * size / 2, s = Math.sin(a) * size / 2;
    const corners = [[x - c + s, z - s - c], [x + c + s, z + s - c], [x + c - s, z + s + c], [x - c - s, z - s + c]];
    if (!corners.every(([cx, cz]) => map.surfaceAt(cx, cz)?.floor === f)) return false;
    const cell = rng.int(0, 3), u0 = (cell % 2) / 2, v0 = 1 - Math.floor(cell / 2) / 2; // the canvas runs top down, the texture bottom up
    const uv = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 - 0.5], [u0, v0 - 0.5]], y = f.y + 0.012;
    const from = mesh.pos.length;
    for (const k of [0, 1, 2, 0, 2, 3]) mesh.vert(corners[k][0], y, corners[k][1], 0, 1, 0, uv[k][0], uv[k][1], white);
    faceUp(mesh, from);
    return true;
  };
  for (const f of map.floors) {
    if (f.shape !== 'poly' || f.kind !== 'stone' || f.style === 'cave') continue;
    const [x0, z0, x1, z1] = f.box;
    let want = Math.round(Math.abs(area(f.pts)) / 45);
    for (let tries = want * 12; want > 0 && tries > 0; tries--) {
      const x = rng.range(x0, x1), z = rng.range(z0, z1);
      if (map.surfaceAt(x, z)?.floor !== f || !clearOfProps(x, z)) continue;
      if (put(f, x, z, rng.range(1.6, 2.6))) want--;
    }
  }
  // the floor cracked where it broke: just inside each break, toward the nearest stone
  for (const [bx, bz, r] of broken) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = bx + Math.sin(a) * (r + 0.9), z = bz + Math.cos(a) * (r + 0.9), s = map.surfaceAt(x, z);
      if (s && s.floor.kind === 'stone' && s.floor.shape === 'poly' && clearOfProps(x, z) && put(s.floor, x, z, 1.5)) break;
    }
  }
  const g = mesh.geometry();
  if (!g) return null;
  const mat = new THREE.MeshToonMaterial({ map: wornTexture(), gradientMap: toonRamp(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.renderOrder = 1;
  m.name = 'floor-wear';
  return m;
}

const KIND = {
  stone: { map: flagstoneTexture, color: '#efe7da', emissive: '#2a2219', emissiveIntensity: 0.3 },
  warm: { map: flagstoneTexture, color: '#f4e4cc', emissive: '#33261a', emissiveIntensity: 0.3 },
  shallow: { map: flagstoneTexture, color: '#7fd4cc', emissive: '#0d5a62', emissiveIntensity: 0.3, paint: { sat: 1, tint: '#ffffff', gain: 1 } },
  deep: { map: flagstoneTexture, color: '#3f9fb0', emissive: '#0b4a5c', emissiveIntensity: 0.45, paint: { sat: 1, tint: '#ffffff', gain: 1 } },
  nacre: { map: nacreTexture, color: '#d9cbd6', emissive: '#4a3050', emissiveIntensity: 0.25 },
  sand: { map: sandTexture, color: '#efe0c4', paint: { sat: 1, tint: '#ffffff', gain: 1 } },
  curb: { map: masonryTexture, color: '#e6d7b8' },
  dirt: { map: dirtTexture, color: '#ffffff' },
  seabed: { map: sandTexture, color: '#6cb9bf', paint: { sat: 1, tint: '#ffffff', gain: 1 } },
};

/** Floors and cliffs of one dungeon map. Returns {root, dispose}. */
export function buildFloors(map, look) {
  const tops = new Map(), cliffs = new Mesh();
  const white = new THREE.Color(1, 1, 1);
  const topFor = (key) => { if (!tops.has(key)) tops.set(key, new Mesh()); return tops.get(key); };
  const blocks = { pos: [], col: [], line: [] }, stairRng = createRng((map.def.seed || 1) * 7 + 3);
  for (const f of map.floors) {
    const key = f.style === 'cave' ? 'dirt' : f.tone === 'warm' && f.kind === 'stone' ? 'warm' : f.tone === 'seabed' ? 'seabed' : f.kind;
    const top = topFor(key);
    if (f.shape === 'circle' || f.shape === 'ellipse') {
      const poly = ellipseOutline(f);
      addFan(top, poly, f.y, white);
      if (f.kind === 'deep') {
        // a basin: its rim stands just above the water, walled inside and out
        const rim = f.waterY + 0.25;
        addWalls(cliffs, poly, rim, look, null, false, map, f);
        addWalls(cliffs, poly, rim, look, f.y);
      } else addWalls(cliffs, poly, f.y, look, null, false, map, f);
    } else if (f.shape === 'path') {
      const from = top.pos.length;
      const poly = addStrip(top, f, white);
      faceUp(top, from);
      addWalls(cliffs, poly, f.y, look, null, false, map, f);
    } else if (f.shape === 'poly') {
      // a traced outline with holes: triangulated, walled around the outline and every hole
      const v2 = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, z));
      const outer = v2(f.pts), holes = (f.holes || []).map(v2), all = [outer, ...holes].flat();
      const from = top.pos.length;
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) top.topTri([all[a].x, all[a].y], [all[b].x, all[b].y], [all[c].x, all[c].y], f.y, white);
      faceUp(top, from);
      for (const r of floorRings(f)) addWalls(cliffs, r.pts, f.y, look, null, r.hole, map, f);
    } else if (f.shape === 'stairs') {
      addStairs(blocks, f, map, stairRng);
    }
  }
  // edging stones around drops (not on sand: the beach just meets the sea)
  const curbTop = topFor('curb'), curbSide = topFor('curb');
  const broken = (map.def.props || []).filter((p) => p.type === 'rubble').map((p) => [p.at[0], p.at[1], 1.4 * (p.scale ?? 1), p.rot ?? 0]);
  addSunkStones(topFor('stone'), curbSide, map, (map.def.props || []).filter((p) => p.type === 'rubble'));
  for (const f of map.floors) {
    if (f.kind === 'sand' || f.shape === 'stairs' || f.style === 'cave') continue; // a cave's rim is its stone ring
    for (const r of floorRings(f)) addCurbs(curbTop, curbSide, map, f, r.pts, look, r.hole, broken);
  }
  const root = new THREE.Group();
  root.name = 'grotto-floors';
  const owned = [];
  for (const [key, mesh] of tops) {
    const g = mesh.geometry();
    if (!g) continue;
    const k = KIND[key];
    // the game's painted stone: water floors keep their own colour, stone takes the game's grey
    const mat = gamePaint(look, `floor-${key}`, { color: k.color, map: k.map(), emissive: k.emissive || '#000000', emissiveIntensity: k.emissiveIntensity ?? 1, ...(k.paint || {}) });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.name = `floor-${key}`;
    root.add(m);
    owned.push(mat);
  }
  root.add(stoneMesh(blocks, look, 'stairs'));
  const wear = addWear(map, broken);
  if (wear) { root.add(wear); owned.push(wear.material); }
  const cg = cliffs.geometry();
  const cliffMat = gamePaint(look, 'cliffs', { color: look.cliff, map: masonryTexture() });
  const cm = new THREE.Mesh(cg, cliffMat);
  cm.receiveShadow = true;
  cm.castShadow = true;
  cm.name = 'cliffs';
  root.add(cm);
  owned.push(cliffMat);
  return { root, materials: owned };
}
