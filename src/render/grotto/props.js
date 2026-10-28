// Grotto props from the map's `props` list. Static pieces are merged by material (one draw per
// material plus its outline hull); the glowing ones (pearls, the rune circle, candle flames)
// get light sprites; the creatures and the giant shell come from creatures.js and animate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '../../core/rng.js';
import { turn } from '../../core/dungeon.js';
import { toonRamp, outlineMaterial } from '../toon.js';
import { runeTexture, glowTexture, nacreTexture } from './textures.js';
import { buildGiantShell, buildPearlSnail, buildSmallShell } from './creatures.js';

const STONE = '#cdb995', STONE_DARK = '#a3937a', MOSS = '#6f8f4e', WOOD = '#7a4a2c', GOLD = '#e7b64c';

/** Collects world-space geometry per material key and merges it at the end. */
class Batch {
  constructor() { this.parts = new Map(); this.mats = new Map(); }
  material(key, make) { if (!this.mats.has(key)) this.mats.set(key, make()); return key; }
  add(key, geo, matrix, outline = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(matrix);
    if (!this.parts.has(key)) this.parts.set(key, { list: [], outline });
    this.parts.get(key).list.push(g);
  }
  build(root) {
    for (const [key, { list, outline }] of this.parts) {
      const geo = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(geo, this.mats.get(key));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `props-${key}`;
      root.add(mesh);
      if (outline) root.add(new THREE.Mesh(geo, outlineMaterial(outline, 0.035)));
    }
  }
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
/** A world matrix: prop origin (x, y, z) turned by rot, then a local offset/rotation/scale. */
function place(base, lx, ly, lz, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const [ox, oz] = turn(lx * base.s, lz * base.s, base.rot);
  E.set(rx, base.rot + ry, rz, 'YXZ');
  Q.setFromEuler(E);
  return M.clone().compose(P.set(base.x + ox, base.y + ly * base.s, base.z + oz), Q, S.set(sx * base.s, sy * base.s, sz * base.s));
}

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 6),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  octa: new THREE.OctahedronGeometry(0.5, 0),
  halfTorus: new THREE.TorusGeometry(1, 0.2, 4, 16, Math.PI),
};
for (const g of Object.values(geo)) g.userData.shared = true; // module-owned, reused by every map

/** A jagged broken shaft: a box whose top corners are knocked to different heights. */
function brokenShaft(rng) {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, 0.5 - rng.range(0, 0.35));
  g.computeVertexNormals();
  return g;
}

/** Coral: tapering branches that fork and curl upward. Unit height about 1. */
function coralGeometry(seed, size = 1, depth = 3) {
  const rng = createRng(seed), parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const grow = (from, dir, len, rad, d) => {
    const to = from.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(rad * 0.62, rad, len, 6, 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    g.translate(from.x, from.y, from.z);
    parts.push(g);
    if (d === 0) {
      const tip = new THREE.SphereGeometry(rad * 1.1, 6, 4);
      tip.translate(to.x, to.y, to.z);
      parts.push(tip);
      return;
    }
    const n = d === depth ? 4 : d === 1 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.5, 0.5), spread = rng.range(0.45, 0.85);
      const nd = dir.clone().add(new THREE.Vector3(Math.cos(a) * spread, rng.range(0.15, 0.45), Math.sin(a) * spread)).normalize();
      grow(to, nd, len * rng.range(0.62, 0.8), rad * 0.68, d - 1);
    }
  };
  grow(new THREE.Vector3(), up, 0.32 * size, 0.1 * size, depth);
  const merged = mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
  parts.forEach((g) => g.dispose());
  return merged;
}

const glowMat = (color, opacity = 1) => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

/**
 * Build every prop of one map. `surfaceY(x, z)` gives the ground height for a prop.
 * Returns {root, update(dt, t), shell (the giant shell, if any), dispose()}.
 */
export function buildProps(map) {
  const root = new THREE.Group();
  root.name = 'grotto-props';
  const batch = new Batch();
  const rng = createRng((map.def.seed || 1) * 7 + 3);
  const lit = (color, opts = {}) => () => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts });
  const stone = batch.material('stone', lit(STONE));
  const stoneDark = batch.material('stoneDark', lit(STONE_DARK));
  const moss = batch.material('moss', lit(MOSS));
  const wood = batch.material('wood', lit(WOOD));
  const gold = batch.material('gold', lit(GOLD, { emissive: '#6a4a10', emissiveIntensity: 0.4 }));
  const crystal = batch.material('crystal', lit('#9ff2ff', { emissive: '#36c7ff', emissiveIntensity: 0.85 }));
  const wax = batch.material('wax', lit('#f4e7c9', { emissive: '#5a3c1c', emissiveIntensity: 0.3 }));
  const pearlMat = batch.material('pearl', () => new THREE.MeshToonMaterial({ color: '#f4e8ee', map: nacreTexture(), emissive: '#ffd9ef', emissiveIntensity: 0.18, gradientMap: toonRamp() }));
  const coralMats = new Map();
  const coralMat = (c) => { if (!coralMats.has(c)) coralMats.set(c, batch.material(`coral-${c}`, lit(c, { emissive: c, emissiveIntensity: 0.55 }))); return coralMats.get(c); };
  const coralGeos = [coralGeometry(11), coralGeometry(23), coralGeometry(37)];
  const treeGeo = coralGeometry(91, 4.2, 4);
  const sprites = [], animated = [], spin = [];
  let shell = null;

  const groundY = (x, z) => map.surfaceAt(x, z)?.y ?? 0;
  for (const p of map.def.props) {
    const rot = p.rot ?? 0, s = p.scale ?? 1;
    let [x, z] = p.at;
    const edge = map.rules.propTypes[p.type]?.edge;
    const [fx, fz] = edge ? turn(0, 2, rot) : [0, 0];
    const y = groundY(x + fx, z + fz);
    const base = { x, y, z, rot, s };
    switch (p.type) {
      case 'pillar':
      case 'pillarBroken': {
        const h = p.type === 'pillar' ? 4.4 : p.h ?? 1.8;
        batch.add(stoneDark, geo.box, place(base, 0, 0.25, 0, { sx: 1.45, sy: 0.5, sz: 1.45 }), '#4e4232');
        if (p.type === 'pillar') {
          batch.add(stone, geo.box, place(base, 0, 0.5 + (h - 1.1) / 2, 0, { sx: 0.95, sy: h - 1.1, sz: 0.95 }), '#5a4a38');
          batch.add(stoneDark, geo.box, place(base, 0, h - 0.35, 0, { sx: 1.4, sy: 0.5, sz: 1.4 }), '#4e4232');
          if (rng.chance(0.5)) batch.add(moss, geo.box, place(base, 0, h - 0.06, 0, { sx: 1.2, sy: 0.12, sz: 1.1, ry: 0.3 }));
        } else {
          const shaft = brokenShaft(rng);
          batch.add(stone, shaft, place(base, 0, 0.5 + (h - 0.5) / 2, 0, { sx: 0.95, sy: h - 0.5, sz: 0.95 }), '#5a4a38');
          shaft.dispose();
          // a fallen block beside it
          batch.add(stone, geo.box, place(base, rng.range(-1.6, 1.6), 0.3, rng.range(0.9, 1.4), { sx: 0.9, sy: 0.6, sz: 0.8, ry: rng.range(0, 1.5), rz: 0.2 }), '#5a4a38');
        }
        break;
      }
      case 'arch':
      case 'sealedArch': {
        const sealed = p.type === 'sealedArch', half = sealed ? 2.8 : 2.6, h = sealed ? 4.6 : 4.0;
        for (const side of [-1, 1]) {
          batch.add(stoneDark, geo.box, place(base, side * half, 0.3, 0, { sx: 1.5, sy: 0.6, sz: 1.5 }), '#4e4232');
          batch.add(stone, geo.box, place(base, side * half, 0.6 + (h - 0.6) / 2, 0, { sx: 1.0, sy: h - 0.6, sz: 1.0 }), '#5a4a38');
        }
        batch.add(stone, geo.halfTorus, place(base, 0, h, 0, { sx: half, sy: half, sz: 2.4 }), '#5a4a38');
        batch.add(stoneDark, geo.box, place(base, 0, h + half + 0.1, 0, { sx: 0.8, sy: 0.9, sz: 1.2 }), '#4e4232');
        if (sealed) {
          // the sealed door: a glowing slab with a turning rune
          const shape = new THREE.Shape();
          shape.moveTo(-half + 0.5, 0); shape.lineTo(half - 0.5, 0); shape.lineTo(half - 0.5, h); shape.absarc(0, h, half - 0.5, 0, Math.PI, false); shape.lineTo(-half + 0.5, 0);
          const door = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), new THREE.MeshToonMaterial({ color: '#2d5e86', emissive: '#3b78c8', emissiveIntensity: 0.55, gradientMap: toonRamp() }));
          door.position.set(x, y, z);
          door.rotation.y = rot;
          root.add(door);
          const rune = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: runeTexture(), color: '#b7f3ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          const [ox, oz] = turn(0, 0.08, rot);
          rune.position.set(x + ox, y + h * 0.62, z + oz);
          rune.rotation.y = rot;
          root.add(rune);
          spin.push({ mesh: rune, axis: 'z', speed: 0.25, pulse: true });
          for (const side of [-1, 1]) batch.add(coralMat('#b06cff'), coralGeos[1], place(base, side * (half + 0.9), 0, 0.3, { sx: 1.6, sy: 1.8, sz: 1.6 }));
        }
        break;
      }
      case 'shellGate': {
        // a stone doorway in the cave wall, lit from the shell's nacre passage behind it
        const half = 2.4, h = 4.4;
        for (const side of [-1, 1]) {
          batch.add(stoneDark, geo.box, place(base, side * half, h / 2, 0, { sx: 1.1, sy: h, sz: 1.2 }), '#4e4232');
          batch.add(stone, geo.box, place(base, side * half, h + 0.2, 0, { sx: 1.4, sy: 0.4, sz: 1.4 }), '#5a4a38');
        }
        batch.add(stone, geo.box, place(base, 0, h + 0.55, 0, { sx: half * 2 + 1.6, sy: 0.7, sz: 1.3 }), '#5a4a38');
        // the passage: nacre floor and walls receding into warm light
        const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(half - 0.4, half + 0.2, 5, 18, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshToonMaterial({ color: '#ffe8f0', map: nacreTexture(), emissive: '#ffbf8a', emissiveIntensity: 0.55, side: THREE.BackSide, gradientMap: toonRamp() }));
        const tg = new THREE.Group();
        tg.add(tunnel);
        tunnel.position.set(0, 0, -2.6);
        tunnel.rotation.set(-Math.PI / 2, 0, 0);
        tg.position.set(x, y + 0.05, z);
        tg.rotation.y = rot;
        root.add(tg);
        const light = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 - 0.2, h - 0.2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffd59a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        const [ox, oz] = turn(0, -1.2, rot);
        light.position.set(x + ox, y + (h - 0.2) / 2, z + oz);
        light.rotation.y = rot;
        root.add(light);
        animated.push((t) => { light.material.opacity = 0.75 + Math.sin(t * 1.6) * 0.15; });
        const sm = buildSmallShell(1.1, ['#ffe6ec', '#e2a0b0']);
        sm.position.set(x, y + h + 0.9, z);
        sm.rotation.y = rot;
        root.add(sm);
        break;
      }
      case 'coral': {
        const k = rng.int(0, coralGeos.length - 1), sz = s * rng.range(1.7, 2.3);
        batch.add(coralMat(p.color || '#b06cff'), coralGeos[k], place({ ...base, s: 1 }, 0, -0.05, 0, { sx: sz, sy: sz * rng.range(0.9, 1.25), sz, ry: rng.range(0, 6.28) }));
        if (rng.chance(0.6)) batch.add(coralMat(p.color || '#b06cff'), coralGeos[(k + 1) % 3], place({ ...base, s: 1 }, rng.range(-0.6, 0.6), -0.05, rng.range(-0.6, 0.6), { sx: sz * 0.6, sy: sz * 0.6, sz: sz * 0.6, ry: rng.range(0, 6.28) }));
        const sp = new THREE.Sprite(glowMat(p.color || '#b06cff', 0.35));
        sp.scale.setScalar(2.4 * s);
        sp.position.set(x, y + 1.0 * s, z);
        sprites.push(sp);
        break;
      }
      case 'coralTree': {
        batch.add(stoneDark, geo.sphere, place(base, 0, -0.2, 0, { sx: 4.2, sy: 1.3, sz: 4.2 }), '#4e4232');
        batch.add(coralMat('#c27bff'), treeGeo, place(base, 0, 0.3, 0, { sx: 1, sy: 1.1, sz: 1 }));
        batch.add(coralMat('#ff7fd8'), coralGeos[2], place(base, 1.4, 0.2, 0.6, { sx: 2.2, sy: 2.2, sz: 2.2 }));
        batch.add(coralMat('#59d7ff'), coralGeos[0], place(base, -1.3, 0.2, -0.4, { sx: 2.0, sy: 2.4, sz: 2.0 }));
        const sp = new THREE.Sprite(glowMat('#d9a2ff', 0.55));
        sp.scale.setScalar(9);
        sp.position.set(x, y + 4.2, z);
        sprites.push(sp);
        break;
      }
      case 'crystal': {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3), lean = i === 0 ? 0 : rng.range(0.25, 0.55), hh = (i === 0 ? 1.9 : rng.range(0.9, 1.5)) * s;
          batch.add(crystal, geo.octa, place({ ...base, s: 1 }, Math.cos(a) * 0.3 * (i > 0) * s, hh * 0.45, Math.sin(a) * 0.3 * (i > 0) * s, { sx: 0.45 * s, sy: hh, sz: 0.45 * s, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean }), '#1d6b8a');
        }
        const sp = new THREE.Sprite(glowMat('#7fe8ff', 0.5));
        sp.scale.setScalar(3.2 * s);
        sp.position.set(x, y + 1.0 * s, z);
        sprites.push(sp);
        break;
      }
      case 'pearl':
      case 'bigPearl': {
        const big = p.type === 'bigPearl', r = (big ? 1.25 : 0.32) * s;
        if (big) {
          batch.add(stoneDark, geo.cyl, place({ ...base, s: 1 }, 0, 0.3, 0, { sx: 2.6 * s, sy: 0.6, sz: 2.6 * s }), '#4e4232');
          batch.add(gold, geo.cyl6, place({ ...base, s: 1 }, 0, 0.75, 0, { sx: 1.7 * s, sy: 0.3, sz: 1.7 * s }), '#6a4a10');
        } else {
          batch.add(stoneDark, geo.sphere, place({ ...base, s: 1 }, 0, 0.05, 0, { sx: 0.9 * s, sy: 0.25, sz: 0.9 * s }));
        }
        const lift = big ? 0.9 + r : r * 0.9;
        const pearl = new THREE.Mesh(geo.sphere, batch.mats.get(pearlMat));
        pearl.scale.setScalar(r * 2);
        pearl.position.set(x, y + lift, z);
        pearl.castShadow = true;
        root.add(pearl);
        const sp = new THREE.Sprite(glowMat('#ffe3f4', big ? 0.45 : 0.4));
        sp.scale.setScalar(r * (big ? 4.2 : 5));
        sp.position.copy(pearl.position);
        sprites.push(sp);
        if (big) animated.push((t) => { sp.material.opacity = 0.38 + Math.sin(t * 1.4 + x) * 0.1; pearl.position.y = y + lift + Math.sin(t * 1.1 + z) * 0.12; sp.position.y = pearl.position.y; });
        break;
      }
      case 'chest': {
        batch.add(wood, geo.box, place(base, 0, 0.32, 0, { sx: 1.2, sy: 0.64, sz: 0.8 }), '#3a2414');
        batch.add(wood, geo.cyl, place(base, 0, 0.64, -0.12, { sx: 0.8, sy: 1.2, sz: 0.8, rz: Math.PI / 2, rx: -0.5 }), '#3a2414');
        for (const side of [-0.42, 0.42]) batch.add(gold, geo.box, place(base, side, 0.34, 0, { sx: 0.12, sy: 0.7, sz: 0.84 }));
        // spilled coins
        for (let i = 0; i < 7; i++) batch.add(gold, geo.cyl6, place(base, rng.range(-0.9, 0.9), 0.04, rng.range(0.5, 1.2), { sx: 0.22, sy: 0.05, sz: 0.22, rx: rng.range(-0.3, 0.3) }));
        const sp = new THREE.Sprite(glowMat('#ffd27a', 0.45));
        sp.scale.setScalar(2.2);
        sp.position.set(x, y + 0.9, z);
        sprites.push(sp);
        break;
      }
      case 'candles': {
        const n = 4 + rng.int(0, 2);
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, 6.28), r = rng.range(0, 0.6), hh = rng.range(0.3, 0.9);
          const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
          batch.add(wax, geo.cyl, place({ x: cx, y, z: cz, rot: 0, s: 1 }, 0, hh / 2, 0, { sx: 0.16, sy: hh, sz: 0.16 }));
          const f = new THREE.Sprite(glowMat('#ffc65e', 0.95));
          f.scale.set(0.32, 0.5, 1);
          f.position.set(cx, y + hh + 0.18, cz);
          sprites.push(f);
          const ph = rng.range(0, 6.28);
          animated.push((t) => { const k = 0.85 + Math.sin(t * 13 + ph) * 0.08 + Math.sin(t * 7.3 + ph * 2) * 0.07; f.scale.set(0.32 * k, 0.5 * k, 1); });
        }
        break;
      }
      case 'runeCircle': {
        const r = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: runeTexture(), color: '#7ff6ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
        r.rotation.x = -Math.PI / 2;
        r.scale.setScalar(s);
        r.position.set(x, y + 0.03, z);
        r.renderOrder = 1;
        root.add(r);
        spin.push({ mesh: r, axis: 'z', speed: 0.06, pulse: true });
        break;
      }
      case 'rock':
        batch.add(stoneDark, geo.sphere, place(base, 0, 0.2, 0, { sx: 2.4, sy: 1.5, sz: 2.0, ry: rng.range(0, 3) }), '#4e4232');
        break;
      case 'smallShell': {
        const sm = buildSmallShell(0.55 * s);
        sm.position.set(x, y, z);
        sm.rotation.y = rot;
        root.add(sm);
        break;
      }
      case 'starfish': {
        const shape = new THREE.Shape();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.18 : 0.5; shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
        g.rotateX(-Math.PI / 2);
        batch.add(batch.material('starfish', lit('#ef7f4a')), g, place(base, 0, 0.02, 0, { sx: s, sy: s, sz: s }));
        g.dispose();
        break;
      }
      case 'bossSnail': {
        const snail = buildPearlSnail();
        snail.root.position.set(x, y, z);
        snail.root.rotation.y = rot;
        snail.root.scale.setScalar(s);
        root.add(snail.root);
        animated.push((t, dt) => snail.update(dt, t));
        break;
      }
      case 'giantShell': {
        shell = buildGiantShell();
        shell.root.position.set(x, y, z);
        shell.root.rotation.y = rot;
        root.add(shell.root);
        animated.push((t, dt) => shell.update(dt, t));
        break;
      }
      default:
        throw new Error(`grotto prop ${p.type} has no model`);
    }
  }
  batch.build(root);
  for (const sp of sprites) { sp.renderOrder = 5; root.add(sp); }
  return {
    root,
    shell,
    update(dt, t) {
      for (const a of animated) a(t, dt);
      for (const s of spin) {
        s.mesh.rotation[s.axis] += s.speed * dt;
        if (s.pulse) s.mesh.material.opacity = 0.7 + Math.sin(t * 1.3) * 0.2;
      }
    },
  };
}
