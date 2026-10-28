// The grotto's floors and the cliffs under them, drawn from the same floors the rules walk on
// (src/core/dungeon.js): fans for circles/ellipses, strips for paths, real steps for stairs. Every
// floor's side runs down into the void and darkens to the void colour, so platforms read as
// standing over darkness like the concept. One merged mesh per material.
import * as THREE from 'three';
import { toonRamp } from '../toon.js';
import { flagstoneTexture, masonryTexture, nacreTexture, sandTexture, dirtTexture } from './textures.js';

const BASE = -14; // how far the cliffs fall
const FADE = 7; // metres for a cliff to darken into the void
const TILE = 4; // metres one texture repeat covers

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
function addWalls(mesh, poly, yTop, look, inner = null, hole = false) {
  if ((area(poly) > 0) !== (inner === null && !hole)) poly = [...poly].reverse();
  let u = 0;
  const lip = new THREE.Color(1, 1, 1), dark = new THREE.Color(look.void), deep = new THREE.Color(0.45, 0.6, 0.65);
  const mid = yTop - FADE;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (inner !== null) mesh.wall(ax, az, bx, bz, yTop, inner, u / TILE, (u + l) / TILE, lip, deep);
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

function addStairs(mesh, cliffs, f, look, white) {
  const [ax, az] = f.a, [bx, bz] = f.b, len = f.length, ux = (bx - ax) / len, uz = (bz - az) / len, h = f.w / 2;
  const px = -uz * h, pz = ux * h; // half width, sideways
  const n = Math.max(2, Math.round(Math.abs(f.y1 - f.y0) / 0.2));
  const at = (t) => [ax + ux * t, az + uz * t];
  const shadow = new THREE.Color(0.72, 0.72, 0.72);
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * len, t1 = ((i + 1) / n) * len;
    // the step's tread sits at the height of the ramp's middle over that step (the rules walk the ramp)
    const y = f.y0 + (f.y1 - f.y0) * ((i + 0.5) / n);
    const [x0, z0] = at(t0), [x1, z1] = at(t1);
    const c00 = [x0 + px, z0 + pz], c01 = [x0 - px, z0 - pz], c10 = [x1 + px, z1 + pz], c11 = [x1 - px, z1 - pz];
    const from = mesh.pos.length;
    mesh.topTri(c00, c10, c11, y, white);
    mesh.topTri(c00, c11, c01, y, white);
    faceUp(mesh, from);
    // sides of the flight: cliff walls under each step
    addWalls(cliffs, [c00, c10, c11, c01], y, look);
    // risers between steps, in the tread's stone
    const prevY = i === 0 ? Math.min(f.y0, f.y1) - 0.6 : f.y0 + (f.y1 - f.y0) * ((i - 0.5) / n);
    if (y > prevY) mesh.wall(c01[0], c01[1], c00[0], c00[1], y, prevY, 0, f.w / TILE, white, shadow);
    else mesh.wall(c00[0], c00[1], c01[0], c01[1], prevY, y, 0, f.w / TILE, white, shadow);
  }
}

/**
 * Edging stones: a raised band just inside every edge where the floor drops away (to the void,
 * to deep water or to a lower level), the way the concept rims its paths, pools and rooms. Edges
 * that join walkable ground at the same level (a path entering a room, a stair foot) stay open.
 */
function addCurbs(top, side, map, f, poly, look, hole = false) {
  if ((area(poly) > 0) === hole) poly = [...poly].reverse(); // the outward side faces away from the floor
  const width = f.kind === 'deep' ? 0.55 : 0.42;
  const yFloor = f.kind === 'deep' ? f.waterY + 0.25 : f.y;
  const yTop = f.kind === 'shallow' ? f.waterY + 0.1 : yFloor + (f.kind === 'deep' ? 0.08 : 0.12);
  const lip = new THREE.Color(1, 1, 1), low = new THREE.Color(0.7, 0.7, 0.7);
  const step = map.rules.maxStep;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-4) continue;
    const nx = -(bz - az) / l, nz = (bx - ax) / l; // outward
    const probe = map.surfaceAt((ax + bx) / 2 + nx * 0.6, (az + bz) / 2 + nz * 0.6);
    if (probe && probe.walkable && Math.abs(probe.y - f.y) <= step) continue;
    const a2 = [ax - nx * width, az - nz * width], b2 = [bx - nx * width, bz - nz * width];
    const from = top.pos.length;
    top.topTri([ax, az], [bx, bz], b2, yTop, lip);
    top.topTri([ax, az], b2, a2, yTop, lip);
    faceUp(top, from);
    side.wall(ax, az, bx, bz, yTop, yFloor - 0.05, 0, l / TILE, lip, low); // outer face
    side.wall(b2[0], b2[1], a2[0], a2[1], yTop, yFloor - 0.05, 0, l / TILE, lip, low); // inner face
  }
}

const KIND = {
  stone: { map: flagstoneTexture, color: '#efe7da', emissive: '#2a2219', emissiveIntensity: 0.3 },
  warm: { map: flagstoneTexture, color: '#f4e4cc', emissive: '#33261a', emissiveIntensity: 0.3 },
  shallow: { map: flagstoneTexture, color: '#79e3dc', emissive: '#0d5a62', emissiveIntensity: 0.55 },
  deep: { map: flagstoneTexture, color: '#3aa6b8', emissive: '#0b4a5c', emissiveIntensity: 0.7 },
  nacre: { map: nacreTexture, color: '#d9cbd6', emissive: '#4a3050', emissiveIntensity: 0.25 },
  sand: { map: sandTexture, color: '#efe0c4' },
  curb: { map: masonryTexture, color: '#e6d7b8' },
  dirt: { map: dirtTexture, color: '#ffffff' },
  seabed: { map: sandTexture, color: '#6cb9bf' },
};

/** Floors and cliffs of one dungeon map. Returns {root, dispose}. */
export function buildFloors(map, look) {
  const tops = new Map(), cliffs = new Mesh();
  const white = new THREE.Color(1, 1, 1);
  const topFor = (key) => { if (!tops.has(key)) tops.set(key, new Mesh()); return tops.get(key); };
  for (const f of map.floors) {
    const key = f.style === 'cave' ? 'dirt' : f.tone === 'warm' && f.kind === 'stone' ? 'warm' : f.tone === 'seabed' ? 'seabed' : f.kind;
    const top = topFor(key);
    if (f.shape === 'circle' || f.shape === 'ellipse') {
      const poly = ellipseOutline(f);
      addFan(top, poly, f.y, white);
      if (f.kind === 'deep') {
        // a basin: its rim stands just above the water, walled inside and out
        const rim = f.waterY + 0.25;
        addWalls(cliffs, poly, rim, look);
        addWalls(cliffs, poly, rim, look, f.y);
      } else addWalls(cliffs, poly, f.y, look);
    } else if (f.shape === 'path') {
      const from = top.pos.length;
      const poly = addStrip(top, f, white);
      faceUp(top, from);
      addWalls(cliffs, poly, f.y, look);
    } else if (f.shape === 'poly') {
      // a traced outline with holes: triangulated, walled around the outline and every hole
      const v2 = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, z));
      const outer = v2(f.pts), holes = (f.holes || []).map(v2), all = [outer, ...holes].flat();
      const from = top.pos.length;
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) top.topTri([all[a].x, all[a].y], [all[b].x, all[b].y], [all[c].x, all[c].y], f.y, white);
      faceUp(top, from);
      for (const r of floorRings(f)) addWalls(cliffs, r.pts, f.y, look, null, r.hole);
    } else if (f.shape === 'stairs') {
      addStairs(top, cliffs, f, look, white);
    }
  }
  // edging stones around drops (not on sand: the beach just meets the sea)
  const curbTop = topFor('curb'), curbSide = topFor('curb');
  for (const f of map.floors) {
    if (f.kind === 'sand' || f.shape === 'stairs' || f.style === 'cave') continue; // a cave's rim is its stone ring
    for (const r of floorRings(f)) addCurbs(curbTop, curbSide, map, f, r.pts, look, r.hole);
  }
  const root = new THREE.Group();
  root.name = 'grotto-floors';
  const owned = [];
  for (const [key, mesh] of tops) {
    const g = mesh.geometry();
    if (!g) continue;
    const k = KIND[key];
    const mat = new THREE.MeshToonMaterial({ color: k.color, map: k.map(), gradientMap: toonRamp(), vertexColors: true, emissive: k.emissive || '#000000', emissiveIntensity: k.emissiveIntensity ?? 1 });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.name = `floor-${key}`;
    root.add(m);
    owned.push(mat);
  }
  const cg = cliffs.geometry();
  const cliffMat = new THREE.MeshToonMaterial({ color: look.cliff, map: masonryTexture(), gradientMap: toonRamp(), vertexColors: true });
  const cm = new THREE.Mesh(cg, cliffMat);
  cm.receiveShadow = true;
  cm.castShadow = true;
  cm.name = 'cliffs';
  root.add(cm);
  owned.push(cliffMat);
  return { root, materials: owned };
}
