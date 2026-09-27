// Painted ground (grass / dirt road / mud / stone) and stylised water.
// A low-res splat map says where each surface is; the shader paints cel-stepped
// colour patches, blade speckles and pebbles on top so it stays crisp up close.
import * as THREE from 'three';
import { distToPolyline, dist } from '../core/math.js';

const MARGIN = 40;
const PX_PER_M = 4;

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<4;i++){ v += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }
`;

export function createGround(world) {
  const b = world.bounds;
  const minX = b.minX - MARGIN;
  const minZ = b.minZ - MARGIN;
  const sizeX = b.maxX - b.minX + MARGIN * 2;
  const sizeZ = b.maxZ - b.minZ + MARGIN * 2;
  const splat = paintSplat(world, minX, minZ, sizeX, sizeZ);

  const geo = new THREE.PlaneGeometry(sizeX, sizeZ, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(minX + sizeX / 2, 0, minZ + sizeZ / 2);

  const stops = [-100, -45, -2, 30, 75];
  const light = ['#9ccf5a', '#9fd052', '#72b843', '#6dbb6a', '#9dbb6c'];
  const dark = ['#78b046', '#7cb640', '#4f9a35', '#4d9a58', '#7a9a55'];

  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSplat = { value: splat.texture };
    shader.uniforms.uMin = { value: new THREE.Vector2(minX, minZ) };
    shader.uniforms.uSize = { value: new THREE.Vector2(sizeX, sizeZ) };
    shader.uniforms.uStops = { value: stops };
    shader.uniforms.uLight = { value: light.map((c) => new THREE.Color(c)) };
    shader.uniforms.uDark = { value: dark.map((c) => new THREE.Color(c)) };
    shader.uniforms.uArena = { value: new THREE.Vector3(world.data.boss.arena.x, world.data.boss.arena.z, world.data.boss.arena.r) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos;
uniform sampler2D uSplat; uniform vec2 uMin; uniform vec2 uSize;
uniform float uStops[5]; uniform vec3 uLight[5]; uniform vec3 uDark[5]; uniform vec3 uArena;
${NOISE_GLSL}
vec3 zoneCol(float x, bool lightSide){
  vec3 c = lightSide ? uLight[0] : uDark[0];
  for(int i=1;i<5;i++){ float t = smoothstep(uStops[i]-12.0, uStops[i]+12.0, x); c = mix(c, lightSide ? uLight[i] : uDark[i], t); }
  return c;
}`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
{
  vec2 w = vWorldPos.xz;
  vec4 sp = texture2D(uSplat, (w - uMin) / uSize);
  float big = fbm(w * 0.07);
  float mid = vnoise(w * 0.45);
  float fine = vnoise(w * 3.1);
  float blade = vnoise(vec2(w.x * 7.0, w.y * 2.2));
  // grass: two cel tones in soft-edged patches, plus light blade speckles
  float patchT = smoothstep(0.47, 0.53, big + (mid - 0.5) * 0.28);
  vec3 grass = mix(zoneCol(w.x, false), zoneCol(w.x, true), patchT);
  grass = mix(grass, grass * 1.13 + vec3(0.03, 0.03, 0.0), step(0.78, blade) * 0.55);
  grass = mix(grass, grass * 0.86, step(0.8, fine) * 0.4);
  // dirt road
  vec3 dirtA = vec3(0.80, 0.62, 0.40);
  vec3 dirtB = vec3(0.70, 0.52, 0.33);
  vec3 dirt = mix(dirtB, dirtA, smoothstep(0.4, 0.6, mid));
  dirt = mix(dirt, vec3(0.60, 0.44, 0.29), step(0.86, fine) * 0.7);
  dirt = mix(dirt, vec3(0.88, 0.78, 0.60), step(0.93, vnoise(w * 5.3)) * 0.6);
  // mud on banks
  vec3 mud = mix(vec3(0.42, 0.45, 0.28), vec3(0.50, 0.52, 0.32), mid);
  // stone tiles (town plaza, ruins)
  vec2 tw = w * vec2(1.25, 1.6);
  vec2 tile = tw + vec2(step(0.5, fract(tw.y * 0.5)) * 0.5, 0.0);
  vec2 f = abs(fract(tile) - 0.5);
  float grout = step(0.45, max(f.x, f.y));
  vec3 stone = mix(vec3(0.80, 0.76, 0.70), vec3(0.70, 0.67, 0.63), step(0.5, hash12(floor(tile))));
  stone = mix(stone, vec3(0.52, 0.49, 0.47), grout);
  float mossAmt = w.x > 40.0 ? 0.75 : 0.25; // ruins are overgrown, the town plaza is kept
  stone = mix(stone, grass * 0.95, smoothstep(0.72, 0.95, fine * 0.6 + big * 0.7) * mossAmt);
  vec3 col = grass;
  col = mix(col, mud, smoothstep(0.2, 0.8, sp.b));
  float roadEdge = sp.r + (mid - 0.5) * 0.35 + (fine - 0.5) * 0.12;
  col = mix(col, dirt, smoothstep(0.42, 0.52, roadEdge));
  col = mix(col, stone, smoothstep(0.45, 0.55, sp.g + (mid - 0.5) * 0.3));
  // boss arena: a faint rune circle
  float ad = distance(w, uArena.xy);
  float ring = smoothstep(0.35, 0.0, abs(ad - (uArena.z - 3.0))) + smoothstep(0.25, 0.0, abs(ad - (uArena.z - 4.2)));
  col = mix(col, vec3(0.55, 0.50, 0.66), clamp(ring, 0.0, 1.0) * 0.75);
  // dense forest outside the map edge
  col *= mix(0.72, 1.0, clamp((sp.a - 0.5) * 2.0, 0.0, 1.0));
  diffuseColor.rgb = col;
}`
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return { mesh, splatCanvas: splat.canvas, rect: { minX, minZ, sizeX, sizeZ } };
}

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function paintSplat(world, minX, minZ, sizeX, sizeZ) {
  const W = Math.round(sizeX * PX_PER_M);
  const H = Math.round(sizeZ * PX_PER_M);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const wd = world.data;
  const road = wd.path.points;
  const roadHalf = wd.path.width / 2;
  const river = wd.river;
  const b = world.bounds;
  const town = { x: -84, z: 0, r: 8.5 };
  const ruins = { x: wd.ruins.centre[0], z: wd.ruins.centre[1], r: 16 };
  for (let j = 0; j < H; j++) {
    const z = minZ + (j + 0.5) / PX_PER_M;
    for (let i = 0; i < W; i++) {
      const x = minX + (i + 0.5) / PX_PER_M;
      const k = (j * W + i) * 4;
      const rd = distToPolyline(x, z, road);
      let r = 1 - smooth(roadHalf - 0.6, roadHalf + 0.6, rd);
      const rv = distToPolyline(x, z, river.points) - river.width / 2;
      let mud = 1 - smooth(-0.5, 1.8, rv);
      for (const [px, pz, pr] of wd.ponds) mud = Math.max(mud, 1 - smooth(pr - 0.5, pr + 1.6, dist(x, z, px, pz)));
      let g = 0;
      const td = dist(x, z, town.x, town.z);
      g = Math.max(g, 1 - smooth(town.r - 2, town.r, td));
      const ud = dist(x, z, ruins.x, ruins.z);
      g = Math.max(g, 1 - smooth(ruins.r - 2, ruins.r + 1, ud));
      if (x > 56 && g < 0.5) {
        // scattered broken paving in the ruins zone
        const cell = Math.sin(Math.floor(x / 4) * 12.9898 + Math.floor(z / 4) * 78.233) * 43758.5453;
        if (cell - Math.floor(cell) > 0.72) g = Math.max(g, 0.6);
      }
      if (g > 0.5) r *= 0.3;
      // alpha = inside the playable map (canvas alpha must stay > 0 or RGB is lost)
      const inside = x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ ? 0 : smooth(0, 3, Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z));
      d[k] = r * 255;
      d[k + 1] = g * 255;
      d[k + 2] = mud * 255;
      d[k + 3] = 128 + inside * 127;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  // premultiplied alpha would eat the RGB where A is 0 — keep straight alpha
  texture.premultiplyAlpha = false;
  return { canvas, texture };
}

// ---------- water ----------

const waterUniforms = { uTime: { value: 0 } };

export function tickWater(t) {
  waterUniforms.uTime.value = t;
}

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float edge; attribute float along;
      varying float vEdge; varying float vAlong; varying vec2 vW;
      void main(){ vEdge = edge; vAlong = along; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying float vEdge; varying float vAlong; varying vec2 vW;
      ${NOISE_GLSL}
      void main(){
        vec3 deep = vec3(0.20, 0.55, 0.78);
        vec3 shallow = vec3(0.42, 0.78, 0.90);
        float n = vnoise(vW * 0.35 + vec2(0.0, uTime * 0.25));
        vec3 col = mix(deep, shallow, smoothstep(0.35, 0.95, vEdge + (n - 0.5) * 0.25));
        // flowing streaks, cel-stepped
        float s = vnoise(vec2(vAlong * 0.9 - uTime * 1.2, vEdge * 5.0 + vW.x * 0.05));
        col = mix(col, vec3(0.78, 0.94, 1.0), step(0.78, s) * 0.55);
        // foam band at the bank
        float foam = step(0.86 + (vnoise(vW * 2.0 + uTime * 0.6) - 0.5) * 0.08, vEdge);
        col = mix(col, vec3(0.96, 0.99, 1.0), foam * 0.9);
        float a = mix(0.93, 0.8, vEdge) ;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

/** River strip + ponds. */
export function createWater(world) {
  const group = new THREE.Group();
  const mat = waterMaterial();
  const river = world.data.river;
  const pts = river.points;
  const half = river.width / 2;
  // densify polyline
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
    for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  dense.push(pts[pts.length - 1]);
  const cols = 6;
  const pos = [];
  const edge = [];
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
    const nx = -tz;
    const nz = tx;
    if (i > 0) acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    for (let c = 0; c <= cols; c++) {
      const s = (c / cols) * 2 - 1;
      pos.push(dense[i][0] + nx * s * (half + 0.25), 0.05, dense[i][1] + nz * s * (half + 0.25));
      edge.push(Math.abs(s));
      along.push(acc);
    }
  }
  for (let i = 0; i < dense.length - 1; i++)
    for (let c = 0; c < cols; c++) {
      const a = i * (cols + 1) + c;
      const b2 = a + cols + 1;
      idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geo.setIndex(idx);
  const riverMesh = new THREE.Mesh(geo, mat);
  riverMesh.renderOrder = 1;
  group.add(riverMesh);

  for (const [px, pz, pr] of world.data.ponds) {
    const segs = 40;
    const rings = 4;
    const p = [];
    const e = [];
    const al = [];
    const ix = [];
    for (let r = 0; r <= rings; r++)
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const rr = (r / rings) * (pr + 0.3);
        const wob = r === rings ? 1 + Math.sin(a * 3 + px) * 0.05 : 1;
        p.push(px + Math.sin(a) * rr * wob, 0.05, pz + Math.cos(a) * rr * wob);
        e.push(r / rings);
        al.push(a * pr);
      }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s;
        const b2 = a + segs + 1;
        ix.push(a, a + 1, b2, a + 1, b2 + 1, b2);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('edge', new THREE.Float32BufferAttribute(e, 1));
    g.setAttribute('along', new THREE.Float32BufferAttribute(al, 1));
    g.setIndex(ix);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 1;
    group.add(m);
  }
  return group;
}
