// Terrain mesh (from the shared heightfield) and stylised water.
// The terrain is split into tiles so off-screen parts are culled. Per-vertex attributes carry
// what the surface is (road, paving, mud, bare dirt) and the zone colours; the fragment shader
// paints soft cel patches, blade speckles, rocky cliff faces, drifting cloud shadows.
import * as THREE from 'three';
import { rasterPolyline, boxBlur, valueNoise } from '../core/terrain.js';
import { timeUniform } from './patch.js';

const TILE = 32;

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm3(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<3;i++){ v += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return v / 0.875; }
`;

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Per-grid-vertex surface data: splat (road, paving, mud, dirt) and blurred zone tints. */
function surfaceData(world) {
  const hf = world.heightfield;
  const { w, h, ox, oz, res } = hf;
  const n = w * h;
  const wd = world.data;
  const road = new Float32Array(n);
  const mud = new Float32Array(n);
  const stone = new Float32Array(n);
  const dirt = new Float32Array(n);
  const grid = { ox, oz, res, w, h };
  for (const r of world.roads) {
    const half = r.width / 2;
    rasterPolyline(grid, r.points, half + 1.5, (k, d) => {
      road[k] = Math.max(road[k], 1 - smooth(half - 0.7, half + 0.7, d));
    });
  }
  if (wd.river) {
    const half = wd.river.width / 2;
    rasterPolyline(grid, wd.river.points, half + 3, (k, d) => {
      mud[k] = Math.max(mud[k], 1 - smooth(half - 0.3, half + 2.4, d));
    });
  }
  const town = wd.town;
  const ruins = wd.ruins;
  const b = world.bounds;
  for (let j = 0; j < h; j++) {
    const z = oz + j * res;
    for (let i = 0; i < w; i++) {
      const x = ox + i * res;
      const k = j * w + i;
      for (const [px, pz, pr] of wd.ponds) {
        const d = Math.hypot(x - px, z - pz);
        if (d < pr + 3) mud[k] = Math.max(mud[k], 1 - smooth(pr - 0.3, pr + 2.2, d));
      }
      const td = Math.hypot(x - town.centre[0], z - town.centre[1]);
      if (td < town.plazaRadius + 2) stone[k] = Math.max(stone[k], 1 - smooth(town.plazaRadius - 1.5, town.plazaRadius, td));
      if (ruins) {
        const rd = Math.hypot(x - ruins.centre[0], z - ruins.centre[1]);
        stone[k] = Math.max(stone[k], 1 - smooth(ruins.ringRadius + 0.5, ruins.ringRadius + 2.5, rd));
      }
      const inside = x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
      const zn = inside ? world.zoneAt(x, z) : null;
      if (zn && zn.id === 'ruins' && stone[k] < 0.5 && valueNoise(x * 0.23, z * 0.23, 3) > 0.68) stone[k] = 0.62;
      const dirtBias = zn ? { highlands: 0.18, wolf_den: 0.14, ruins: 0.08 }[zn.id] || 0 : 0.1;
      dirt[k] = smooth(0.62 - dirtBias, 0.72 - dirtBias, valueNoise(x * 0.07, z * 0.07, 11) * 0.8 + valueNoise(x * 0.3, z * 0.3, 12) * 0.2);
      if (stone[k] > 0.5) road[k] *= 0.3;
    }
  }
  // zone colours, blurred so borders blend
  let lr = new Float32Array(n);
  let lg = new Float32Array(n);
  let lb = new Float32Array(n);
  let dr = new Float32Array(n);
  let dg = new Float32Array(n);
  let db = new Float32Array(n);
  const cache = new Map();
  const col = (hex) => {
    if (!cache.has(hex)) cache.set(hex, new THREE.Color(hex));
    return cache.get(hex);
  };
  for (let j = 0; j < h; j++) {
    const z = oz + j * res;
    for (let i = 0; i < w; i++) {
      const x = ox + i * res;
      const zn = world.zoneAt(Math.min(b.maxX - 0.1, Math.max(b.minX, x)), Math.min(b.maxZ - 0.1, Math.max(b.minZ, z)));
      const [L, D] = zn.palette || ['#9ccf5a', '#78b046'];
      const k = j * w + i;
      const cl = col(L);
      const cd = col(D);
      lr[k] = cl.r;
      lg[k] = cl.g;
      lb[k] = cl.b;
      dr[k] = cd.r;
      dg[k] = cd.g;
      db[k] = cd.b;
    }
  }
  const blur = (a) => boxBlur(boxBlur(a, w, h, 6), w, h, 4);
  [lr, lg, lb, dr, dg, db] = [lr, lg, lb, dr, dg, db].map(blur);
  return { road, mud, stone, dirt, lr, lg, lb, dr, dg, db };
}

export function createTerrain(world) {
  const hf = world.heightfield;
  const { w, h, ox, oz, res, data } = hf;
  const surf = surfaceData(world);
  const mat = terrainMaterial(world);
  const group = new THREE.Group();
  group.name = 'terrain';
  const H = (i, j) => data[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
  for (let tj = 0; tj < h - 1; tj += TILE) {
    for (let ti = 0; ti < w - 1; ti += TILE) {
      const cw = Math.min(TILE, w - 1 - ti);
      const chh = Math.min(TILE, h - 1 - tj);
      const vw = cw + 1;
      const vh = chh + 1;
      const pos = new Float32Array(vw * vh * 3);
      const nrm = new Float32Array(vw * vh * 3);
      const splat = new Float32Array(vw * vh * 4);
      const tintL = new Float32Array(vw * vh * 3);
      const tintD = new Float32Array(vw * vh * 3);
      for (let j = 0; j < vh; j++)
        for (let i = 0; i < vw; i++) {
          const gi = ti + i;
          const gj = tj + j;
          const k = gj * w + gi;
          const v = j * vw + i;
          pos[v * 3] = ox + gi * res;
          pos[v * 3 + 1] = data[k];
          pos[v * 3 + 2] = oz + gj * res;
          const nx = (H(gi - 1, gj) - H(gi + 1, gj)) / (2 * res);
          const nz = (H(gi, gj - 1) - H(gi, gj + 1)) / (2 * res);
          const inv = 1 / Math.hypot(nx, 1, nz);
          nrm[v * 3] = nx * inv;
          nrm[v * 3 + 1] = inv;
          nrm[v * 3 + 2] = nz * inv;
          splat[v * 4] = surf.road[k];
          splat[v * 4 + 1] = surf.stone[k];
          splat[v * 4 + 2] = surf.mud[k];
          splat[v * 4 + 3] = surf.dirt[k];
          tintL[v * 3] = surf.lr[k];
          tintL[v * 3 + 1] = surf.lg[k];
          tintL[v * 3 + 2] = surf.lb[k];
          tintD[v * 3] = surf.dr[k];
          tintD[v * 3 + 1] = surf.dg[k];
          tintD[v * 3 + 2] = surf.db[k];
        }
      const idx = [];
      for (let j = 0; j < chh; j++)
        for (let i = 0; i < cw; i++) {
          const a = j * vw + i;
          const b2 = a + vw;
          idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
      geo.setAttribute('aTintL', new THREE.BufferAttribute(tintL, 3));
      geo.setAttribute('aTintD', new THREE.BufferAttribute(tintD, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      group.add(mesh);
    }
  }
  return { group, material: mat };
}

function terrainMaterial(world) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bossList = world.data.bosses || [];
  const arena = (bossList.find((b) => b.final) || bossList[0])?.arena || { x: 9999, z: 9999, r: 1 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uArena = { value: new THREE.Vector3(arena.x, arena.z, arena.r) };
    shader.uniforms.uWater = { value: world.waterLevel };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aSplat; attribute vec3 aTintL; attribute vec3 aTintD;
varying vec3 vWorldPos; varying vec4 vSplat; varying vec3 vTintL; varying vec3 vTintD; varying float vUp;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vSplat = aSplat; vTintL = aTintL; vTintD = aTintD; vUp = normal.y;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos; varying vec4 vSplat; varying vec3 vTintL; varying vec3 vTintD; varying float vUp;
uniform float uTime; uniform vec3 uArena; uniform float uWater;
${NOISE_GLSL}`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
{
  vec2 w = vWorldPos.xz;
  float y = vWorldPos.y;
  float big = fbm3(w * 0.07);
  float mid = vnoise(w * 0.45);
  float fine = vnoise(w * 3.1);
  float blade = vnoise(vec2(w.x * 7.0, w.y * 2.2));
  // grass: two tones in soft patches + blade speckles; hilltops a touch warmer
  float patchT = smoothstep(0.46, 0.54, big + (mid - 0.5) * 0.28);
  vec3 grass = mix(vTintD, vTintL, patchT);
  grass *= 1.0 + clamp(y * 0.018, -0.05, 0.08);
  grass = mix(grass, grass * 1.13 + vec3(0.03, 0.03, 0.0), step(0.78, blade) * 0.5);
  grass = mix(grass, grass * 0.86, step(0.8, fine) * 0.35);
  // bare dirt patches (highlands, den)
  vec3 dry = mix(vec3(0.66, 0.56, 0.38), vec3(0.74, 0.64, 0.45), mid);
  // dirt road with pebbles
  vec3 dirtA = vec3(0.80, 0.62, 0.40);
  vec3 dirtB = vec3(0.70, 0.52, 0.33);
  vec3 road = mix(dirtB, dirtA, smoothstep(0.4, 0.6, mid));
  road = mix(road, vec3(0.60, 0.44, 0.29), step(0.86, fine) * 0.7);
  road = mix(road, vec3(0.88, 0.78, 0.60), step(0.93, vnoise(w * 5.3)) * 0.6);
  // mud / wet sand on banks
  vec3 mud = mix(vec3(0.46, 0.47, 0.30), vec3(0.62, 0.58, 0.40), smoothstep(uWater - 0.2, uWater + 0.6, y));
  // stone paving
  vec2 tw = w * vec2(1.25, 1.6);
  vec2 tile = tw + vec2(step(0.5, fract(tw.y * 0.5)) * 0.5, 0.0);
  vec2 f = abs(fract(tile) - 0.5);
  float grout = step(0.45, max(f.x, f.y));
  vec3 stone = mix(vec3(0.80, 0.76, 0.70), vec3(0.70, 0.67, 0.63), step(0.5, hash12(floor(tile))));
  stone = mix(stone, vec3(0.52, 0.49, 0.47), grout);
  float mossAmt = w.x > 60.0 ? 0.75 : 0.2;
  stone = mix(stone, grass * 0.95, smoothstep(0.72, 0.95, fine * 0.6 + big * 0.7) * mossAmt);
  // cliff rock: layered strata on steep faces
  float strata = vnoise(vec2(w.x * 0.15 + w.y * 0.15, y * 2.2));
  vec3 rock = mix(vec3(0.52, 0.49, 0.47), vec3(0.66, 0.62, 0.57), smoothstep(0.35, 0.65, strata));
  rock = mix(rock, vec3(0.42, 0.40, 0.40), step(0.8, fract(y * 1.3 + mid * 0.4)) * 0.5);
  vec3 col = grass;
  col = mix(col, dry, vSplat.a * 0.85);
  col = mix(col, mud, smoothstep(0.2, 0.8, vSplat.b));
  float roadEdge = vSplat.r + (mid - 0.5) * 0.35 + (fine - 0.5) * 0.12;
  col = mix(col, road, smoothstep(0.42, 0.52, roadEdge));
  col = mix(col, stone, smoothstep(0.45, 0.55, vSplat.g + (mid - 0.5) * 0.3));
  float cliff = smoothstep(0.82, 0.68, vUp + (fine - 0.5) * 0.05);
  col = mix(col, rock, cliff);
  // grassy lip on top of cliffs
  // boss arena rune circle
  float ad = distance(w, uArena.xy);
  float ring = smoothstep(0.35, 0.0, abs(ad - (uArena.z - 3.0))) + smoothstep(0.25, 0.0, abs(ad - (uArena.z - 4.2)));
  col = mix(col, vec3(0.55, 0.50, 0.66), clamp(ring, 0.0, 1.0) * 0.75);
  // under the water line: darker, bluish
  col = mix(col, col * vec3(0.55, 0.68, 0.72), smoothstep(uWater + 0.05, uWater - 0.4, y));
  // drifting cloud shadows
  float cloud = fbm3(w * 0.012 + vec2(uTime * 0.012, uTime * 0.006));
  col *= 1.0 - 0.16 * smoothstep(0.55, 0.72, cloud);
  diffuseColor.rgb = col;
}`
      );
  };
  mat.customProgramCacheKey = () => 'terrain-v2';
  return mat;
}

// ---------- water ----------

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: timeUniform },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float depth; attribute float along;
      varying float vDepth; varying float vAlong; varying vec2 vW;
      void main(){ vDepth = depth; vAlong = along; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying float vDepth; varying float vAlong; varying vec2 vW;
      ${NOISE_GLSL}
      void main(){
        float d = vDepth + (vnoise(vW * 1.3 + uTime * 0.4) - 0.5) * 0.06;
        if (d <= 0.0) discard;
        vec3 deep = vec3(0.16, 0.47, 0.72);
        vec3 mid = vec3(0.27, 0.66, 0.84);
        vec3 shallow = vec3(0.55, 0.86, 0.90);
        vec3 col = mix(shallow, mid, smoothstep(0.05, 0.45, d));
        col = mix(col, deep, smoothstep(0.5, 1.2, d));
        // flowing streaks (rivers) and ripples (ponds)
        float s = vnoise(vec2(vAlong * 0.9 - uTime * 1.2, vW.x * 0.35 + vW.y * 0.35));
        col = mix(col, vec3(0.80, 0.95, 1.0), step(0.8, s) * 0.45 * smoothstep(0.2, 0.6, d));
        // sun glints
        float g = vnoise(vW * 2.6 + vec2(uTime * 0.7, -uTime * 0.5));
        col = mix(col, vec3(1.0), step(0.92, g) * 0.6);
        // foam along the shore
        float foam = 1.0 - smoothstep(0.03, 0.12 + 0.05 * sin(uTime * 2.0 + vW.x), d);
        col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.9);
        float a = mix(0.62, 0.93, smoothstep(0.0, 0.6, d));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

/** River strip + ponds at the water level; depth comes from the heightfield. */
export function createWater(world) {
  const group = new THREE.Group();
  const mat = waterMaterial();
  const wl = world.waterLevel;
  const hY = world.terrainY;
  const river = world.data.river;
  if (river) {
    const pts = river.points;
    const half = river.width / 2 + 1.6;
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2));
      for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    dense.push(pts[pts.length - 1]);
    const cols = 12;
    const pos = [];
    const depth = [];
    const along = [];
    const idx = [];
    let acc = 0;
    for (let i = 0; i < dense.length; i++) {
      const p0 = dense[Math.max(0, i - 1)];
      const p1 = dense[Math.min(dense.length - 1, i + 1)];
      let tx = p1[0] - p0[0];
      let tz = p1[1] - p0[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      if (i > 0) acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
      for (let c = 0; c <= cols; c++) {
        const s = (c / cols) * 2 - 1;
        const x = dense[i][0] - tz * s * half;
        const z = dense[i][1] + tx * s * half;
        pos.push(x, wl, z);
        depth.push(wl - hY(x, z));
        along.push(acc);
      }
    }
    for (let i = 0; i < dense.length - 1; i++)
      for (let c = 0; c < cols; c++) {
        const a = i * (cols + 1) + c;
        const b2 = a + cols + 1;
        idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    group.add(waterMesh(pos, depth, along, idx, mat));
  }
  for (const [px, pz, pr] of world.data.ponds || []) {
    const segs = 40;
    const rings = 8;
    const R = pr + 1.6;
    const pos = [];
    const depth = [];
    const along = [];
    const idx = [];
    for (let r = 0; r <= rings; r++)
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const rr = (r / rings) * R;
        const x = px + Math.sin(a) * rr;
        const z = pz + Math.cos(a) * rr;
        pos.push(x, wl, z);
        depth.push(wl - hY(x, z));
        along.push(a * pr);
      }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s;
        const b2 = a + segs + 1;
        idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
      }
    group.add(waterMesh(pos, depth, along, idx, mat));
  }
  return group;
}

function waterMesh(pos, depth, along, idx, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  return m;
}
