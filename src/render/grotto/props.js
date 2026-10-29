// Grotto props from the map's `props` list. Static pieces are merged by material (one draw per
// material plus its outline hull); the glowing ones (pearls, the rune circle, candle flames)
// get halos (one instanced glow field; the few that animate are sprites); the creatures and the
// giant shell come from creatures.js and animate. Corals and crystals also grow along the cave
// rim (`decor`), as thick as the concept has them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '../../core/rng.js';
import { turn } from '../../core/dungeon.js';
import { toonRamp, outlineMaterial } from '../toon.js';
import { runeTexture, glowTexture, nacreTexture, medallionTexture } from './textures.js';
import { buildGiantShell, buildPearlSnail, buildSmallShell } from './creatures.js';
import { buildGiantClam } from './clam.js';
import { GLOW_CORALS, glowCoralInstances, coralPools } from './corals.js';
import { paintedInstances } from './painted.js';
import { glowField } from './glow.js';
import { kitInstances } from './kit.js';

// which of the painted corals (corals.js) a coral of the map's colour can be
const GLOW_BY_COLOR = { '#b06cff': ['purple', 'bubbles'], '#4fd9ff': ['blue', 'teal'], '#ff6fd2': ['pink'], '#5f8cff': ['tubes', 'blue'] };
const UNDERGROWTH = ['bubbles', 'tubes', 'teal', 'pink']; // the low kinds that fill in around a clump
const STONE = '#cdb995', STONE_DARK = '#a3937a', MOSS = '#55704c', WOOD = '#7a4a2c', GOLD = '#e7b64c';

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
      mesh.castShadow = !key.startsWith('coral'); // glowing corals light themselves; their shadows would double the coral cost
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
    const g = new THREE.CylinderGeometry(rad * 0.62, rad, len, 5, 1, true); // open: the joints hide the ends
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    g.translate(from.x, from.y, from.z);
    parts.push(g);
    if (d === 0) {
      const tip = new THREE.OctahedronGeometry(rad * 1.15, 0);
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
 * Build every prop of one map, plus rim decor at `decor` edge points ({x, z, nx, nz, y} from
 * rim.js, kept off `keepClear` [x, z, r] spots). `kit` is the Blender kit, `clam` the painted giant
 * clam (clam.js), `corals` the six painted glowing corals (corals.js), which grow in clumps in every room,
 * `painted` the props from the owner's sheets (painted.js), which take the place of the simple ones.
 * Returns {root, update(dt, t), shell}.
 */
export function buildProps(map, { decor = [], keepClear = [], kit = null, clam = null, corals = null, painted = null } = {}) {
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
  const decorGeos = [coralGeometry(53, 1.3, 2), coralGeometry(67, 1.3, 2), coralGeometry(79, 1.3, 2)]; // lighter: the rim has hundreds
  const treeGeo = coralGeometry(91, 4.2, 4);
  const sprites = [], animated = [], spin = [], glows = [];
  // modelled kit pieces (Blender) placed by name, instanced at the end
  const kitPut = new Map();
  const putKit = (name, x, y, z, ry, s = 1) => { if (!kitPut.has(name)) kitPut.set(name, []); kitPut.get(name).push({ x, y, z, ry, s }); };
  const coralPut = new Map(); // `${colour}|${shape}` -> placements
  const putCoral = (color, shape, x, y, z, ry, s) => { const k = `${color}|${shape}`; if (!coralPut.has(k)) coralPut.set(k, []); coralPut.get(k).push({ x, y, z, ry, s }); };
  const halo = (x, y, z, size, color, alpha = 0.4) => glows.push({ x, y, z, size, color, alpha });
  // the painted corals grow in clumps, as reefs do: one big coral of the colour asked for, a few
  // smaller ones of mixed kinds around its foot (along the wall when it grows at one), never two
  // clumps on top of each other. The clump lights the floor around it (a flat pool, not a halo,
  // which the floor and walls would cut into a disc).
  const glowPut = new Map(), clumps = [], pools = [];
  const paintedPut = new Map();
  const putPainted = (name, x, y, z, ry, s = 1) => {
    if (!paintedPut.has(name)) paintedPut.set(name, []);
    paintedPut.get(name).push({ x, y, z, ry, s });
  };
  const putGlow = (name, x, y, z, ry, s) => {
    if (!glowPut.has(name)) glowPut.set(name, []);
    glowPut.get(name).push({ x, y, z, ry, s });
  };
  const clump = (color, x, y, z, ry, s, wall = null) => {
    if (clumps.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r + 1.2 * s) ** 2)) return;
    const kin = GLOW_BY_COLOR[color] || GLOW_BY_COLOR['#b06cff'], main = rng.pick(kin), big = corals.get(main);
    putGlow(main, x, y, z, ry, s);
    let reach = big.radius * s, left = reach, right = reach;
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const others = kin.filter((k) => k !== main); // a smaller copy of the big one beside it would read as a copy
      const name = others.length && rng.chance(0.25) ? rng.pick(others) : rng.pick(UNDERGROWTH.filter((k) => k !== main)), c = corals.get(name);
      const ks = s * rng.range(0.3, 0.65), r = c.radius * ks;
      let px, pz;
      if (wall) {
        // beside the last one on this side, along the wall, a little in front of or behind the line
        const side = i % 2 ? -1 : 1, d = (side > 0 ? right : left) + r * rng.range(0.6, 0.9);
        if (side > 0) right = d + r; else left = d + r;
        const out = rng.range(-0.35, 0.25);
        px = x - wall[1] * side * d + wall[0] * out;
        pz = z + wall[0] * side * d + wall[1] * out;
      } else {
        const a = rng.range(0, Math.PI * 2), d = reach * 0.8 + r * rng.range(0.6, 1.0);
        px = x + Math.sin(a) * d;
        pz = z + Math.cos(a) * d;
      }
      const ground = map.surfaceAt(px, pz);
      putGlow(name, px, (ground ? ground.y : y + 0.05) - 0.05, pz, ry + rng.range(-0.9, 0.9), ks);
    }
    reach = Math.max(reach, left, right);
    clumps.push([x, z, reach]);
    const s0 = map.surfaceAt(x, z);
    pools.push({ x, y: (s0 ? s0.y : y) + 0.16, z, r: reach + big.height * s * 0.3, color: GLOW_CORALS[main].halo });
  };
  let shell = null, archKind = 0, chestKind = 0;

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
        if (painted) {
          putPainted(p.type === 'pillar' ? 'pillar' : 'pillar_broken', x, y, z, rot + (rng.int(0, 3) * Math.PI) / 2, s * rng.range(0.92, 1.05));
          break;
        }
        const h = p.type === 'pillar' ? 4.4 : p.h ?? 1.8;
        batch.add(stoneDark, geo.box, place(base, 0, 0.25, 0, { sx: 1.45, sy: 0.5, sz: 1.45 }), '#4e4232');
        if (p.type === 'pillar') {
          batch.add(stone, geo.box, place(base, 0, 0.5 + (h - 1.1) / 2, 0, { sx: 0.95, sy: h - 1.1, sz: 0.95 }), '#5a4a38');
          batch.add(stoneDark, geo.box, place(base, 0, h - 0.35, 0, { sx: 1.4, sy: 0.5, sz: 1.4 }), '#4e4232');
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
        if (painted) {
          // the two open arches are the two kinds of the sheet; the sealed one glows with its seal
          putPainted(p.type === 'sealedArch' ? 'arch_sealed' : archKind++ % 2 ? 'arch_shell' : 'arch', x, y, z, rot, s);
          if (p.type === 'sealedArch') pools.push({ x, y: y + 0.16, z, r: 3.2, color: '#7fe8ff' });
          break;
        }
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
        const half = kit ? 1.3 : 2.4, h = 4.4;
        if (kit) putKit('gate', x, y, z, rot);
        else for (const side of [-1, 1]) {
          batch.add(stoneDark, geo.box, place(base, side * half, h / 2, 0, { sx: 1.1, sy: h, sz: 1.2 }), '#4e4232');
          batch.add(stone, geo.box, place(base, side * half, h + 0.2, 0, { sx: 1.4, sy: 0.4, sz: 1.4 }), '#5a4a38');
        }
        if (!kit) batch.add(stone, geo.box, place(base, 0, h + 0.55, 0, { sx: half * 2 + 1.6, sy: 0.7, sz: 1.3 }), '#5a4a38');
        // the passage: nacre floor and walls receding into warm light
        const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(half - 0.4, half + 0.2, 5, 18, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshToonMaterial({ color: '#ffe8f0', map: nacreTexture(), emissive: '#ffbf8a', emissiveIntensity: 0.55, side: THREE.BackSide, gradientMap: toonRamp() }));
        const tg = new THREE.Group();
        tg.add(tunnel);
        tunnel.position.set(0, 0, -2.6);
        tunnel.rotation.set(-Math.PI / 2, 0, 0);
        tg.position.set(x, y + 0.05, z);
        tg.rotation.y = rot;
        root.add(tg);
        const light = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 - 0.2, kit ? 3.6 : h - 0.2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffd59a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        const [ox, oz] = turn(0, -1.2, rot);
        light.position.set(x + ox, y + (kit ? 1.8 : (h - 0.2) / 2), z + oz);
        light.rotation.y = rot;
        root.add(light);
        animated.push((t) => { light.material.opacity = 0.75 + Math.sin(t * 1.6) * 0.15; });
        if (!kit) {
          const sm = buildSmallShell(1.1, ['#ffe6ec', '#e2a0b0']);
          sm.position.set(x, y + h + 0.9, z);
          sm.rotation.y = rot;
          root.add(sm);
        }
        break;
      }
      case 'coral': {
        if (corals) {
          clump(p.color || '#b06cff', x, y - 0.05, z, rot + rng.range(-0.5, 0.5), s * rng.range(0.7, 1.05));
          break;
        }
        if (kit && map.surfaceAt(x, z)?.floor.style === 'cave') {
          const c = p.color || '#b06cff', sz = s * rng.range(1.3, 1.7);
          putCoral(c, rng.chance(0.5) ? 'coral_bush' : 'coral_fan', x, y - 0.05, z, rng.range(0, 6.28), sz);
          halo(x, y + 0.9 * s, z, 2.4 * s, c, 0.3);
          break;
        }
        const k = rng.int(0, coralGeos.length - 1), sz = s * rng.range(1.7, 2.3);
        batch.add(coralMat(p.color || '#b06cff'), coralGeos[k], place({ ...base, s: 1 }, 0, -0.05, 0, { sx: sz, sy: sz * rng.range(0.9, 1.25), sz, ry: rng.range(0, 6.28) }));
        if (rng.chance(0.6)) batch.add(coralMat(p.color || '#b06cff'), coralGeos[(k + 1) % 3], place({ ...base, s: 1 }, rng.range(-0.6, 0.6), -0.05, rng.range(-0.6, 0.6), { sx: sz * 0.6, sy: sz * 0.6, sz: sz * 0.6, ry: rng.range(0, 6.28) }));
        halo(x, y + 1.0 * s, z, 2.6 * s, p.color || '#b06cff', 0.35);
        break;
      }
      case 'coralTree': {
        if (painted) {
          // the great coral of the steps: its light falls on the floor round it, small corals at its foot
          putPainted('coral_tree', x, y - 0.1, z, rot, s);
          pools.push({ x, y: y + 0.16, z, r: 4.5 * s, color: '#e090ff' });
          if (corals) for (const [dx, dz, c] of [[2.2, 1.0, '#ff6fd2'], [-2.0, -0.6, '#4fd9ff']]) clump(c, x + dx * s, groundY(x + dx * s, z + dz * s) - 0.05, z + dz * s, rot + rng.range(-1, 1), rng.range(0.6, 0.8));
          break;
        }
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
        if (painted) {
          const k = s > 1.25 ? 'crystal_l' : s < 0.9 ? 'crystal_s' : rng.pick(['crystal_m', 'crystal_m', 'crystal_s', 'crystal_l']);
          putPainted(k, x, y - 0.05, z, rng.range(0, 6.28), 1 + (s - 1) * 0.3);
          pools.push({ x, y: y + 0.16, z, r: 1.4 + painted.get(k).height * 0.5, color: '#7fe8ff' });
          break;
        }
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3), lean = i === 0 ? 0 : rng.range(0.25, 0.55), hh = (i === 0 ? 1.9 : rng.range(0.9, 1.5)) * s;
          batch.add(crystal, geo.octa, place({ ...base, s: 1 }, Math.cos(a) * 0.3 * (i > 0) * s, hh * 0.45, Math.sin(a) * 0.3 * (i > 0) * s, { sx: 0.45 * s, sy: hh, sz: 0.45 * s, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean }), '#1d6b8a');
        }
        // in a cave room its light falls on the floor; a halo there is cut into a disc by the walls
        if (corals && map.surfaceAt(x, z)?.floor.style === 'cave') pools.push({ x, y: y + 0.16, z, r: 1.6 * s, color: '#7fe8ff' });
        else halo(x, y + 1.0 * s, z, 3.2 * s, '#7fe8ff', 0.5);
        break;
      }
      case 'pearl':
      case 'bigPearl': {
        if (painted && p.type === 'bigPearl') {
          putPainted('pearl_altar', x, y, z, rot, s);
          pools.push({ x, y: y + 0.16, z, r: 3.2 * s, color: '#ffe3f4' });
          break;
        }
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
        if (!big) { halo(x, y + lift, z, r * 5, '#ffe3f4', 0.4); break; }
        const sp = new THREE.Sprite(glowMat('#ffe3f4', 0.3));
        sp.scale.setScalar(r * 3.6);
        sp.position.copy(pearl.position);
        sprites.push(sp);
        animated.push((t) => { sp.material.opacity = 0.26 + Math.sin(t * 1.4 + x) * 0.07; pearl.position.y = y + lift + Math.sin(t * 1.1 + z) * 0.12; sp.position.y = pearl.position.y; });
        break;
      }
      case 'chest': {
        if (painted) {
          putPainted(chestKind++ % 2 ? 'chest_open' : 'chest', x, y, z, rot);
          halo(x, y + 0.7, z, 1.2, '#ffd27a', 0.18);
          break;
        }
        if (kit) {
          for (const part of ['chest_body', 'chest_lid', 'chest_metal']) putKit(part, x, y, z, rot);
          halo(x, y + 0.9, z, 1.6, '#ffd27a', 0.25);
          break;
        }
        batch.add(wood, geo.box, place(base, 0, 0.32, 0, { sx: 1.2, sy: 0.64, sz: 0.8 }), '#3a2414');
        batch.add(wood, geo.cyl, place(base, 0, 0.64, -0.12, { sx: 0.8, sy: 1.2, sz: 0.8, rz: Math.PI / 2, rx: -0.5 }), '#3a2414');
        for (const side of [-0.42, 0.42]) batch.add(gold, geo.box, place(base, side, 0.34, 0, { sx: 0.12, sy: 0.7, sz: 0.84 }));
        // spilled coins
        for (let i = 0; i < 7; i++) batch.add(gold, geo.cyl6, place(base, rng.range(-0.9, 0.9), 0.04, rng.range(0.5, 1.2), { sx: 0.22, sy: 0.05, sz: 0.22, rx: rng.range(-0.3, 0.3) }));
        halo(x, y + 0.9, z, 2.2, '#ffd27a', 0.45);
        break;
      }
      case 'candles': {
        if (painted) { putPainted('candles', x, y, z, rng.range(0, 6.28), s * rng.range(0.9, 1.15)); break; }
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
        // a medallion carved into the temple floor under the water (the concept's circle): stone, not magic
        const r = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: medallionTexture(), transparent: true, opacity: 0.8, depthWrite: false }));
        r.rotation.x = -Math.PI / 2;
        r.scale.setScalar(s);
        r.position.set(x, y + 0.03, z);
        r.renderOrder = 1;
        root.add(r);
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
      case 'giantClam': {
        // the clam that keeps a pearl (clam.js); its pearl breathes a soft glow
        if (!clam) break; // the model did not load: the page still works without it
        const c = buildGiantClam(clam);
        c.position.set(x, y, z);
        c.rotation.y = rot;
        c.scale.setScalar(s);
        root.add(c);
        c.updateMatrixWorld(true);
        const pearl = c.userData.nodes.pearl.children[0];
        pearl.geometry.computeBoundingBox();
        const at = pearl.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(pearl.matrixWorld);
        halo(at.x, at.y, at.z, 0.75 * s, '#efe4ff', 0.3); // around the pearl only, not over the shell
        const glow = pearl.material;
        animated.push((t) => { glow.emissiveIntensity = 0.2 + Math.sin(t * 1.3) * 0.06; });
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
      case 'barrel': {
        if (painted) { putPainted('barrel', x, y, z, rng.range(0, 6.28)); break; }
        batch.add(wood, geo.cyl, place(base, 0, 0.5, 0, { sx: 0.85, sy: 1.0, sz: 0.85 }), '#3a2414');
        for (const yy of [0.18, 0.82]) batch.add(stoneDark, geo.cyl, place(base, 0, yy, 0, { sx: 0.9, sy: 0.08, sz: 0.9 }));
        if (rng.chance(0.5)) batch.add(wood, geo.cyl, place(base, 0.75, 0.42, 0.3, { sx: 0.8, sy: 0.95, sz: 0.8, rx: Math.PI / 2, ry: rng.range(0, 3) }), '#3a2414');
        break;
      }
      case 'post':
        if (painted) putPainted('post', x, y, z, rot + rng.range(-0.3, 0.3), s);
        else if (kit) putKit('post', x, y, z, rot + rng.range(-0.2, 0.2), s);
        else batch.add(stone, geo.box, place(base, 0, 0.65, 0, { sx: 0.5, sy: 1.3, sz: 0.5 }), '#5a4a38');
        break;
      case 'crate': {
        if (painted) { putPainted('crate', x, y, z, rot); if (rng.chance(0.5)) putPainted('crate', x + 0.06, y + 0.9 * 0.98, z - 0.05, rot + 0.5, 0.75); break; }
        if (kit) { putKit('crate', x, y, z, rot); if (rng.chance(0.5)) putKit('crate', x + 0.08, y + 0.7, z - 0.05, rot + 0.5, 0.8); break; }
        batch.add(wood, geo.box, place(base, 0, 0.4, 0, { sx: 0.85, sy: 0.8, sz: 0.85 }), '#3a2414');
        batch.add(stoneDark, geo.box, place(base, 0, 0.4, 0, { sx: 0.9, sy: 0.12, sz: 0.9 }));
        if (rng.chance(0.6)) batch.add(wood, geo.box, place(base, 0.1, 1.05, 0.05, { sx: 0.6, sy: 0.5, sz: 0.6, ry: 0.4 }), '#3a2414');
        break;
      }
      case 'ruinWall': {
        // a run of broken wall: stacked blocks, the courses stepping down toward the broken end
        const len = p.len ?? 4, courses = 3;
        for (let c = 0; c < courses; c++) {
          const n = Math.max(1, Math.round((len / 1.1) * (1 - c * 0.28)));
          for (let i = 0; i < n; i++) {
            const lx = -len / 2 + (i + 0.5) * (len / Math.round(len / 1.1)) + (c % 2) * 0.3;
            batch.add(c === 0 ? stoneDark : stone, geo.box, place(base, lx, 0.32 + c * 0.6, rng.range(-0.05, 0.05), { sx: 1.0, sy: 0.56, sz: 0.75, ry: rng.range(-0.05, 0.05) }), '#4e4232');
          }
        }
        batch.add(stone, geo.box, place(base, len / 2 + 0.7, 0.25, 0.7, { sx: 0.9, sy: 0.5, sz: 0.7, ry: 0.6, rz: 0.15 }), '#5a4a38');
        if (rng.chance(0.6)) batch.add(moss, geo.box, place(base, -len * 0.2, 1.84, 0, { sx: len * 0.4, sy: 0.1, sz: 0.7 }));
        break;
      }
      case 'fallenPillar': {
        if (painted) { putPainted('pillar_fallen', x, y, z, rot, s); break; }
        batch.add(stone, geo.box, place(base, 0, 0.48, 0, { sx: 0.95, sy: 0.95, sz: 3.6, rx: 0.05 }), '#5a4a38');
        batch.add(stoneDark, geo.box, place(base, 0, 0.7, -2.1, { sx: 1.4, sy: 1.4, sz: 0.5 }), '#4e4232');
        batch.add(stone, geo.box, place(base, 0.4, 0.3, 2.4, { sx: 0.8, sy: 0.6, sz: 0.9, ry: 0.5 }), '#5a4a38');
        break;
      }
      default:
        throw new Error(`grotto prop ${p.type} has no model`);
    }
  }
  // corals and crystals growing out of the rim, thickest on the walls facing the camera
  const palette = map.def.look.decor || ['#b06cff', '#ff6fd2', '#4fd9ff', '#5f8cff'];
  const clear = (x, z) => keepClear.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);
  for (const e of decor) {
    const roll = rng.next();
    if (roll > 0.2 || e.stairs || clear(e.x, e.z)) continue; // nothing grows on the treads
    const x = e.x - e.nx * 0.15, z = e.z - e.nz * 0.15, d = { x, y: e.y, z, rot: 0, s: 1 };
    if (corals) {
      // the painted corals grow at the foot of the walls, fewer and fuller, facing the room; now and
      // then a crystal cluster among them
      if (roll < 0.05) {
        const big = rng.chance(0.25) ? rng.range(1.0, 1.25) : rng.range(0.55, 0.9); // now and then a tall one
        clump(rng.pick(palette), e.x - e.nx * 0.3, e.y - 0.1, e.z - e.nz * 0.3, Math.atan2(-e.nx, -e.nz) + rng.range(-0.5, 0.5), big, [e.nx, e.nz]);
      } else if (painted && roll < 0.075 && !clumps.some(([cx, cz, r]) => (e.x - cx) ** 2 + (e.z - cz) ** 2 < (r + 1) ** 2)) {
        const k = rng.chance(0.7) ? 'crystal_s' : 'crystal_m';
        putPainted(k, e.x - e.nx * 0.2, e.y - 0.08, e.z - e.nz * 0.2, rng.range(0, 6.28), rng.range(0.8, 1.1));
        clumps.push([e.x, e.z, 1]);
        pools.push({ x: e.x - e.nx * 0.6, y: e.y + 0.16, z: e.z - e.nz * 0.6, r: 1.6, color: '#7fe8ff' });
      }
      continue;
    }
    if (kit && e.style === 'cave') {
      // in a cave the modelled corals grow at the foot of the walls, fewer and fuller
      if (roll < 0.06) {
        const c = rng.pick(palette), sz = rng.range(0.8, 1.3);
        putCoral(c, rng.chance(0.5) ? 'coral_bush' : 'coral_fan', e.x - e.nx * 0.25, e.y - 0.1, e.z - e.nz * 0.25, Math.atan2(-e.nx, -e.nz) + rng.range(-0.4, 0.4), sz);
        if (roll < 0.03) halo(e.x, e.y + sz * 0.7, e.z, sz * 2, c, 0.22);
      }
      continue;
    }
    if (roll < 0.15) {
      const c = rng.pick(palette), sz = rng.range(1.0, 2.0);
      batch.add(coralMat(c), decorGeos[rng.int(0, 2)], place(d, 0, -0.05, 0, { sx: sz, sy: sz * rng.range(0.9, 1.3), sz, ry: rng.range(0, 6.28) }));
      if (roll < 0.07) halo(x, e.y + sz * 0.5, z, sz * 1.5, c, 0.3);
    } else {
      const sz = rng.range(0.5, 0.9);
      for (let i = 0; i < 3; i++) {
        const a = rng.range(0, 6.28), lean = i ? rng.range(0.3, 0.6) : 0.1, hh = (i ? rng.range(0.7, 1.1) : 1.5) * sz;
        batch.add(crystal, geo.octa, place(d, Math.cos(a) * 0.25 * sz, hh * 0.45, Math.sin(a) * 0.25 * sz, { sx: 0.45 * sz, sy: hh, sz: 0.45 * sz, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean }), '#1d6b8a');
      }
      halo(x, e.y + 0.8 * sz, z, 2.4 * sz, '#7fe8ff', 0.35);
    }
  }
  batch.build(root);
  for (const [name, list] of kitPut) root.add(kitInstances(kit, name, list));
  for (const [key, list] of coralPut) {
    const [color, shape] = key.split('|');
    const inst = kitInstances(kit, shape, list, kit.coralMaterial(color));
    inst.castShadow = false;
    root.add(inst);
  }
  for (const [name, list] of glowPut) root.add(glowCoralInstances(corals, name, list));
  for (const [name, list] of paintedPut) root.add(paintedInstances(painted, name, list));
  if (pools.length) root.add(coralPools(pools));
  for (const sp of sprites) { sp.renderOrder = 5; root.add(sp); }
  if (glows.length) root.add(glowField(glows));
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
