// The Pearlshell Grotto's scene for one dungeon map (src/core/dungeon.js): floors and cliffs,
// water and falls, the rocky rim, props, lights with their pools on the floor and drifting
// motes. Everything here is static except the uniforms/props animated by update().
import * as THREE from 'three';
import { createRng } from '../../core/rng.js';
import { disposeObject } from '../dispose.js';
import { buildFloors } from './floors.js';
import { buildWater } from './water.js';
import { buildRim, rimPoints } from './rim.js';
import { buildProps } from './props.js';
import { buildCaveDressing } from './dressing.js';
import { glowTexture } from './textures.js';

const MOTE_VERT = `
uniform float uTime, uSize;
attribute float aPhase;
attribute vec3 aColor;
varying vec3 vColor;
varying float vFade;
void main() {
  vec3 p = position;
  float k = fract(uTime * 0.05 + aPhase);
  p.y += k * 6.0;
  p.x += sin(uTime * 0.6 + aPhase * 30.0) * 0.5;
  p.z += cos(uTime * 0.5 + aPhase * 20.0) * 0.5;
  vFade = sin(k * 3.14159);
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + 0.4 * sin(aPhase * 40.0 + uTime * 2.0)) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FRAG = `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vFade;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vFade);
  #include <colorspace_fragment>
}`;

function buildMotes(map, count, colours, seed) {
  const rng = createRng(seed), pos = [], phase = [], col = [];
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const cs = colours.map((c) => new THREE.Color(c));
  for (let tries = 0; pos.length / 3 < count && tries < count * 20; tries++) {
    const x = rng.range(minX, maxX), z = rng.range(minZ, maxZ), s = map.surfaceAt(x, z);
    if (!s) continue;
    pos.push(x, (s.waterY ?? s.y) + rng.range(0.2, 2), z);
    phase.push(rng.next());
    const c = rng.pick(cs);
    col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: 260 }, uMap: { value: glowTexture() } },
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}

/**
 * @param {object} map createDungeon(...) result
 * @param {object} o {sea: true for the beach (the deep floor is open sea), motes: count, tall: rim wall height factor,
 *   kit: the Blender kit (kit.js), which dresses `cave` zones and replaces the simple props}
 */
export function buildGrottoScene(map, o = {}) {
  const look = map.def.look;
  const root = new THREE.Group();
  root.name = `dungeon-${map.def.id}`;
  const floors = buildFloors(map, look);
  root.add(floors.root);
  const water = buildWater(map, { sea: o.sea });
  root.add(water.root);
  const keepClear = [
    ...(map.def.waterfalls || []).map((w) => [w.at[0], w.at[1], w.w / 2 + 0.8]),
    ...(map.def.links || []).map((l) => [l.at[0], l.at[1], 2.5]),
  ];
  const edge = o.sea ? [] : rimPoints(map, 1.25);
  if (!o.sea) root.add(buildRim(map, look, { seed: map.def.seed, keepClear, tall: o.tall ?? 1, points: edge }).root);
  if (o.kit) root.add(buildCaveDressing(map, o.kit, edge, { clear: keepClear, seed: (map.def.seed || 1) + 11 }).root);
  const props = buildProps(map, { decor: edge, keepClear, kit: o.kit });
  root.add(props.root);
  // lights, each with a soft pool of its colour on the floor below
  const pools = [];
  for (const l of map.def.lights || []) {
    const s = map.surfaceAt(l.at[0], l.at[1]);
    const y = s ? s.waterY ?? s.y : 0;
    const light = new THREE.PointLight(l.color, l.intensity, l.range, 1.6);
    light.position.set(l.at[0], y + l.y, l.at[1]);
    root.add(light);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(l.range * 0.42, 24), new THREE.MeshBasicMaterial({ map: glowTexture(), color: l.color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(l.at[0], y + 0.06, l.at[1]);
    pool.renderOrder = 4;
    root.add(pool);
    pools.push({ pool, light, base: l.intensity, phase: l.at[0] });
  }
  const motes = o.motes ? buildMotes(map, o.motes, o.moteColours || ['#9ff3ff', '#ffc8f0', '#c9a8ff', '#fff1c0'], (map.def.seed || 1) + 5) : null;
  if (motes) root.add(motes);
  return {
    root,
    shell: props.shell,
    update(dt, t) {
      water.update(t);
      props.update(dt, t);
      for (const p of pools) {
        const k = 1 + Math.sin(t * 1.7 + p.phase) * 0.06 + Math.sin(t * 5.1 + p.phase) * 0.03;
        p.light.intensity = p.base * k;
        p.pool.material.opacity = 0.2 * k;
      }
      if (motes) motes.material.uniforms.uTime.value = t;
    },
    dispose() { disposeObject(root); },
  };
}
