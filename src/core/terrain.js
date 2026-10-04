// Deterministic heightfield on a regular grid (metres). Pure logic: the simulation uses it
// for walkable slopes and ground height; the renderer builds the terrain mesh from the same
// numbers. Godot port: `npm run export:layout` writes the grid to data/generated/.
//
// Build order: rolling noise (amplitude per zone) + hills -> soften -> plateaus (cliff edges)
// + mountains past the map edge -> flatten town / pads -> roads smoothed into ramps ->
// river channel and ponds carved below the water level.

import { clamp, distToSegment, coastSample, toBoxLocal, fromBoxLocal } from './math.js';

// ---------- noise (hash-based, deterministic, no RNG state) ----------

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x, z, seed = 1) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x, z, seed = 1, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(x, z, seed + i * 17);
    norm += amp;
    x = x * 2.03 + 11.7;
    z = z * 2.03 + 5.3;
    amp *= 0.5;
  }
  return v / norm;
}

const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- grid helpers ----------

export function boxBlur(src, w, h, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = radius * 2 + 1;
  for (let j = 0; j < h; j++) {
    let acc = 0;
    const row = j * w;
    for (let i = -radius; i <= radius; i++) acc += src[row + clamp(i, 0, w - 1)];
    for (let i = 0; i < w; i++) {
      tmp[row + i] = acc / n;
      acc += src[row + clamp(i + radius + 1, 0, w - 1)] - src[row + clamp(i - radius, 0, w - 1)];
    }
  }
  for (let i = 0; i < w; i++) {
    let acc = 0;
    for (let j = -radius; j <= radius; j++) acc += tmp[clamp(j, 0, h - 1) * w + i];
    for (let j = 0; j < h; j++) {
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
export function rasterPolyline(grid, pts, reach, visit) {
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

// ---------- build ----------

/**
 * @param {object} worldData data/world.json
 * @param {(x:number,z:number)=>object} zoneAt zone lookup (for hill amplitude)
 */
/** True when `along` lies on the open span of a seam on that edge (atlas.seams). */
export function seamOpen(worldData, edge, along) {
  for (const seam of worldData.atlas?.seams || []) if (seam.edge === edge && along >= seam.span[0] && along <= seam.span[1]) return seam;
  return null;
}

/** Height of a seam profile ([[along, h], ...] sorted by along) at `along`. */
export function seamHeight(profile, along) {
  if (along <= profile[0][0]) return profile[0][1];
  for (let k = 1; k < profile.length; k++) {
    const [a1, h1] = profile[k];
    if (along <= a1) {
      const [a0, h0] = profile[k - 1];
      return h0 + ((h1 - h0) * (along - a0)) / (a1 - a0 || 1);
    }
  }
  return profile[profile.length - 1][1];
}

export function buildHeightfield(worldData, zoneAt) {
  const t = worldData.terrain;
  const b = worldData.bounds;
  const res = t.res || 1;
  const margin = t.margin ?? 40;
  const ox = b.minX - margin;
  const oz = b.minZ - margin;
  const w = Math.round((b.maxX - b.minX + margin * 2) / res) + 1;
  const h = Math.round((b.maxZ - b.minZ + margin * 2) / res) + 1;
  const grid = { ox, oz, res, w, h };
  const seed = worldData.seed || 1;
  const water = worldData.waterLevel ?? -0.4;
  const n = w * h;
  const X = (i) => ox + i * res;
  const Z = (j) => oz + j * res;

  // 1. hill amplitude per zone, blurred so zones blend
  let amp = new Float32Array(n);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = X(i);
      const z = Z(j);
      const inside = x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
      amp[j * w + i] = inside ? zoneAt(x, z).hillAmp ?? 1 : 1.5;
    }
  amp = boxBlur(amp, w, h, Math.max(1, Math.round(9 / res)));
  amp = boxBlur(amp, w, h, Math.max(1, Math.round(6 / res)));

  // 2. rolling noise + hills
  let hf = new Float32Array(n);
  const ns = t.noiseScale || 0.028;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = X(i);
      const z = Z(j);
      const k = j * w + i;
      hf[k] = amp[k] * (fbm(x * ns, z * ns, seed) - 0.5) * 2.2 + (valueNoise(x * 0.13, z * 0.13, seed + 99) - 0.5) * 0.25;
    }
  for (const [hx, hz, hr, hh] of t.hills || []) {
    const i0 = Math.max(0, Math.floor((hx - hr - ox) / res));
    const i1 = Math.min(w - 1, Math.ceil((hx + hr - ox) / res));
    const j0 = Math.max(0, Math.floor((hz - hr - oz) / res));
    const j1 = Math.min(h - 1, Math.ceil((hz + hr - oz) / res));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(X(i) - hx, Z(j) - hz);
        if (d < hr) hf[j * w + i] += hh * (0.5 + 0.5 * Math.cos((Math.PI * d) / hr));
      }
  }
  hf = boxBlur(hf, w, h, 1);

  // 3. plateaus with cliff edges, mountains past the map edge
  for (const p of t.plateaus || []) {
    const pw = p.power || 2;
    const edge = (p.edge || 1.5) / Math.min(p.rx, p.rz);
    for (let j = 0; j < h; j++) {
      const z = Z(j);
      if (Math.abs(z - p.z) > p.rz * 1.3) continue;
      for (let i = 0; i < w; i++) {
        const x = X(i);
        if (Math.abs(x - p.x) > p.rx * 1.3) continue;
        let q = Math.pow(Math.pow(Math.abs(x - p.x) / p.rx, pw) + Math.pow(Math.abs(z - p.z) / p.rz, pw), 1 / pw);
        q += (valueNoise(x * 0.18, z * 0.18, seed + 5) - 0.5) * 0.07; // ragged cliff line
        const m = 1 - smoothstep(1 - edge, 1, q);
        if (m > 0) hf[j * w + i] += p.height * m;
      }
    }
  }
  const sea = worldData.sea?.shore ? worldData.sea : null;
  const inset = 3;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = X(i);
      const z = Z(j);
      // no mountains on the sea side (the sea runs to the horizon) or along an
      // open seam with a neighbouring map (the land continues there)
      const open = (edge, along) => seamOpen(worldData, edge, along) ? 0 : 1;
      const out = Math.max((b.minX + inset - x) * open('minX', z), (x - (b.maxX - inset)) * open('maxX', z), (b.minZ + inset - z) * open('minZ', x), sea ? 0 : (z - (b.maxZ - inset)) * open('maxZ', x), 0);
      if (out > 0) hf[j * w + i] += smoothstep(0, 24, out) * 13 + out * 0.12 + (valueNoise(x * 0.09, z * 0.09, seed + 7) - 0.5) * 5 * smoothstep(0, 12, out);
    }

  const sample = (x, z) => sampleGrid(grid, hf, x, z);

  // 4. flatten the town and pads (arenas, camp)
  const town = worldData.town;
  if (town) {
    const zn = worldData.zones.find((q) => q.id === 'settlement');
    for (const r of zn?.rects || []) {
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const x = X(i);
          const z = Z(j);
          const dx = Math.max(r[0] - x, x - r[1], 0);
          const dz = Math.max(r[2] - z, z - r[3], 0);
          const m = 1 - smoothstep(0, 10, Math.hypot(dx, dz));
          if (m > 0) hf[j * w + i] = hf[j * w + i] * (1 - m) + (town.height ?? 0.4) * m;
        }
    }
  }
  for (const [px, pz, pr] of t.pads || []) {
    const target = sample(px, pz);
    const reach = pr + 6;
    for (let j = Math.max(0, Math.floor((pz - reach - oz) / res)); j <= Math.min(h - 1, Math.ceil((pz + reach - oz) / res)); j++)
      for (let i = Math.max(0, Math.floor((px - reach - ox) / res)); i <= Math.min(w - 1, Math.ceil((px + reach - ox) / res)); i++) {
        const m = 1 - smoothstep(pr, reach, Math.hypot(X(i) - px, Z(j) - pz));
        if (m > 0) hf[j * w + i] = hf[j * w + i] * (1 - m) + target * m;
      }
  }
  for (const wp of worldData.waypoints || []) {
    const [px, pz] = wp.pos;
    const target = sample(px, pz);
    for (let j = Math.max(0, Math.floor((pz - 6 - oz) / res)); j <= Math.min(h - 1, Math.ceil((pz + 6 - oz) / res)); j++)
      for (let i = Math.max(0, Math.floor((px - 6 - ox) / res)); i <= Math.min(w - 1, Math.ceil((px + 6 - ox) / res)); i++) {
        const m = 1 - smoothstep(2.5, 6, Math.hypot(X(i) - px, Z(j) - pz));
        if (m > 0) hf[j * w + i] = hf[j * w + i] * (1 - m) + target * m;
      }
  }

  // 5. roads: sample the height along each road, smooth it into gentle ramps, blend it in
  const best = new Float32Array(n).fill(Infinity);
  const roadH = new Float32Array(n);
  for (const road of worldData.roads || []) {
    const pts = road.points;
    const half = road.width / 2;
    const reach = half + 4.5;
    // profile every metre of arc length
    const lens = [0];
    for (let s = 0; s < pts.length - 1; s++) lens.push(lens[s] + Math.hypot(pts[s + 1][0] - pts[s][0], pts[s + 1][1] - pts[s][1]));
    const total = lens[lens.length - 1];
    const count = Math.ceil(total) + 1;
    let prof = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      const a = Math.min(total, k);
      let s = 0;
      while (s < pts.length - 2 && lens[s + 1] < a) s++;
      const u = (a - lens[s]) / (lens[s + 1] - lens[s] || 1);
      prof[k] = sample(pts[s][0] + (pts[s + 1][0] - pts[s][0]) * u, pts[s][1] + (pts[s + 1][1] - pts[s][1]) * u);
    }
    for (let pass = 0; pass < 3; pass++) {
      const win = 11;
      const next = new Float32Array(count);
      for (let k = 0; k < count; k++) {
        let acc = 0;
        let cnt = 0;
        for (let q = Math.max(0, k - win); q <= Math.min(count - 1, k + win); q++) {
          acc += prof[q];
          cnt++;
        }
        next[k] = acc / cnt;
      }
      prof = next;
    }
    rasterPolyline(grid, pts, reach, (k, d, arc) => {
      const e = d - half; // distance from this road's edge
      if (e < best[k]) {
        best[k] = e;
        roadH[k] = prof[Math.min(count - 1, Math.round(arc))];
      }
    });
  }
  for (let k = 0; k < n; k++) {
    if (best[k] === Infinity) continue;
    const m = 1 - smoothstep(0.6, 4.5, best[k]);
    hf[k] = hf[k] * (1 - m) + roadH[k] * m;
  }

  // 6. river channel and ponds, carved below the water level
  const river = worldData.river;
  if (river) {
    const half = river.width / 2;
    const bankWidth = river.bankWidth ?? 6;
    const reach = half + bankWidth;
    const bestR = new Float32Array(n).fill(Infinity);
    rasterPolyline(grid, river.points, reach, (k, d) => {
      if (d < bestR[k]) bestR[k] = d;
    });
    for (let k = 0; k < n; k++) {
      const d = bestR[k];
      if (d === Infinity) continue;
      if (river.walkable) {
        // A shallow gravel stream with a continuous gentle bank, not a sunken trench.
        const bed = water - (river.depth ?? 0.18);
        const edge = water + 0.08;
        const channel = bed + (edge - bed) * smoothstep(0, half, d);
        const bank = smoothstep(half, half + bankWidth, d);
        hf[k] = d <= half ? channel : edge * (1 - bank) + Math.max(edge, hf[k]) * bank;
      } else hf[k] = carve(hf[k], d, half, water);
    }
  }
  for (const [px, pz, pr] of worldData.ponds || []) {
    const reach = pr + 6;
    for (let j = Math.max(0, Math.floor((pz - reach - oz) / res)); j <= Math.min(h - 1, Math.ceil((pz + reach - oz) / res)); j++)
      for (let i = Math.max(0, Math.floor((px - reach - ox) / res)); i <= Math.min(w - 1, Math.ceil((px + reach - ox) / res)); i++) {
        const k = j * w + i;
        hf[k] = carve(hf[k], Math.hypot(X(i) - px, Z(j) - pz), pr, water);
      }
  }

  // 7. the sea: a sandy beach sloping into water that deepens away from the shore
  if (sea) {
    const beach = sea.beach || 14;
    for (let i = 0; i < w; i++) {
      const x = X(i);
      const sz = polylineZAtX(sea.shore, x);
      for (let j = 0; j < h; j++) {
        const c = sea.coastline || sea.edgeKinds ? coastSample(sea, x, Z(j)) : { distance: sz - Z(j), kind: 'beach' };
        const d = c.distance; // true distance also follows the steep bay sides
        if (c.kind !== 'beach') {
          if (d >= 0 && d < 4) hf[j * w + i] = worldData.town.height ?? .7;
          else if (d < 0) hf[j * w + i] = Math.max(water - 4.5, water - .3 + d * .5);
          continue;
        }
        if (d > beach + 8) continue;
        const k = j * w + i;
        const ripple = (valueNoise(x * 0.2, Z(j) * 0.2, seed + 31) - 0.5) * 0.15;
        let prof;
        if (d >= 0) prof = water + 0.12 + d * 0.07 + ripple;
        else prof = Math.max(water - 4.5, water - 0.25 + d * 0.16);
        const m = d < 0 ? 1 : 1 - smoothstep(beach, beach + 8, d);
        const target = d >= 0 ? Math.min(hf[k], prof) * 0.3 + prof * 0.7 : prof;
        hf[k] = hf[k] * (1 - m) + target * m;
      }
    }
  }

  // Recess the terrain under authored ramp slabs, preserving the land endpoint.
  // Flat pier approaches also need this: coplanar paving otherwise hides wood.
  for (const dock of worldData.docks || []) if (dock.rampFromTerrain && dock.terrainRecess) {
    const start=fromBoxLocal(dock,0,-dock.hz), startY=sample(start.x,start.z);
    for(let j=0;j<h;j++) for(let i=0;i<w;i++) {
      const local=toBoxLocal(dock,X(i),Z(j));
      if(Math.abs(local.lx)>dock.hx+.3 || local.lz<=-dock.hz || local.lz>dock.hz)continue;
      const t=(local.lz+dock.hz)/(2*dock.hz);
      const deck=startY+(dock.height-startY)*t;
      hf[j*w+i]=Math.min(hf[j*w+i],deck-dock.terrainRecess*Math.min(1,t*10));
    }
  }

  // 8. seams: an edge shared with a neighbouring map (atlas.seams) blends to one
  // common height profile, so both maps meet on the same ground. Past the edge the
  // profile continues instead of the mountain wall.
  for (const seam of worldData.atlas?.seams || []) {
    if (!seam.profile?.length) continue;
    const alongX = seam.edge === 'minZ' || seam.edge === 'maxZ', edgeAt = b[seam.edge], inward = seam.edge.startsWith('max') ? -1 : 1;
    const band = seam.band ?? 24;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const x = X(i), z = Z(j), along = alongX ? x : z;
        const past = Math.max(seam.span[0] - along, along - seam.span[1], 0);
        if (past >= band) continue;
        const inside = ((alongX ? z : x) - edgeAt) * inward; // metres inside the map
        if (inside >= band) continue;
        const m = (1 - smoothstep(0, band, Math.max(0, inside))) * (1 - smoothstep(0, band, past));
        hf[j * w + i] = hf[j * w + i] * (1 - m) + seamHeight(seam.profile, along) * m;
      }
  }

  return {
    ...grid,
    data: hf,
    waterLevel: water,
    heightAt: (x, z) => sampleGrid(grid, hf, x, z),
    /** Surface normal (unnormalised y = 1 scaled) and slope magnitude. */
    slopeAt(x, z) {
      const e = res;
      const dx = (sampleGrid(grid, hf, x + e, z) - sampleGrid(grid, hf, x - e, z)) / (2 * e);
      const dz = (sampleGrid(grid, hf, x, z + e) - sampleGrid(grid, hf, x, z - e)) / (2 * e);
      return Math.hypot(dx, dz);
    },
  };
}

/** River/pond cross-section: bed below the water level, banks rising gently. */
function polylineZAtX(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if (x >= ax && x <= bx) return az + ((bz - az) * (x - ax)) / (bx - ax || 1);
  }
  return pts[pts.length - 1][1];
}

function carve(hNow, d, half, water) {
  let prof;
  if (d < half) {
    const t = d / half;
    prof = water - (0.35 + 0.95 * (1 - t * t));
  } else prof = water - 0.35 + (d - half) * 0.55;
  const m = 1 - smoothstep(half + 2.5, half + 6, d);
  const carved = Math.min(hNow, prof);
  return hNow * (1 - m) + carved * m;
}

export function sampleGrid(grid, data, x, z) {
  const fx = clamp((x - grid.ox) / grid.res, 0, grid.w - 1.0001);
  const fz = clamp((z - grid.oz) / grid.res, 0, grid.h - 1.0001);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * grid.w + i;
  const a = data[k];
  const b = data[k + 1];
  const c = data[k + grid.w];
  const d = data[k + grid.w + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
