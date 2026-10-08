// The wreck on Arrival Beach: a broken hull on its side, a snapped mast with torn sail, cargo
// scattered in the sand, and three weapons stuck in the beach for the player to choose from.
// Everything is cel-shaded and merged per material (a handful of draw calls). Decoration only:
// no collider, the spawn clearing stays open.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, outlined } from './toon.js';
import { createRng } from '../core/rng.js';

const COLORS = { hull: '#8a5a3a', hullDark: '#5e3c28', deck: '#b98a58', iron: '#5b6672', sail: '#e9dcc0', rope: '#c9b27c', crate: '#a77a4c', metal: '#c9d4de', gold: '#e8b84a', string: '#f2ead2', orb: '#9a7cff' };

/** Collects geometry per material and merges it into one outlined mesh each. */
class Bucket {
  constructor() { this.parts = new Map(); }
  add(color, geometry, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], opts = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
    const key = color + (opts.double ? '|d' : '') + (opts.emissive ? '|e' : '');
    if (!this.parts.has(key)) this.parts.set(key, { color, opts, geos: [] });
    this.parts.get(key).geos.push(geometry.applyMatrix4(m));
  }
  build(group) {
    for (const { color, opts, geos } of this.parts.values()) {
      const geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
      geos.forEach((g) => g.dispose());
      const mat = toon(color, { side: opts.double ? THREE.DoubleSide : THREE.FrontSide, emissive: opts.emissive, emissiveIntensity: opts.emissive ? 0.9 : 1 });
      group.add(outlined(geo, mat, { outline: opts.double ? null : '#3a2a22', width: 0.03 }));
    }
  }
}

/** The ship's remains. Local origin: the keel's middle on the sand, bow along +X. */
function hull(b, rng) {
  const L = 9, ribs = 7;
  // a keel and the lower hull ribs of a boat that lies tipped over on its starboard side
  b.add(COLORS.hullDark, new THREE.BoxGeometry(L, 0.35, 0.45), [0, 0.55, 0], [0, 0, 0.12]);
  for (let i = 0; i < ribs; i++) {
    const x = -L / 2 + 0.6 + (i / (ribs - 1)) * (L - 1.4);
    const swell = Math.cos(((i / (ribs - 1)) - 0.5) * Math.PI * 0.9);
    const r = 1.9 * swell + 0.5;
    const gone = i === 2 || i === 5; // snapped ribs
    const arc = new THREE.TorusGeometry(r, 0.13, 6, 14, gone ? Math.PI * 0.45 : Math.PI * 0.8);
    b.add(COLORS.hullDark, arc, [x, 0.6 + r * 0.25, 0], [0, Math.PI / 2, Math.PI * 0.1]);
  }
  // planks along the ribs, with gaps where they tore away
  for (let row = 0; row < 5; row++) {
    for (let seg = 0; seg < 4; seg++) {
      if (rng.next() < 0.28 + row * 0.07) continue;
      const x = -L / 2 + 0.9 + seg * (L - 1.8) / 3.2 + rng.range(-0.2, 0.2);
      const ang = 0.25 + row * 0.27;
      const r = 1.9 * Math.cos(((x / L)) * Math.PI * 0.9) + 0.5;
      const y = 0.6 + Math.sin(ang) * r;
      const z = -Math.cos(ang) * r * 0.9;
      b.add(row % 2 ? COLORS.hull : COLORS.hullDark, new THREE.BoxGeometry(L / 4.2 - 0.12, 0.06, 0.34), [x, y, z], [rng.range(-0.05, 0.05), 0, -ang + Math.PI / 2 + rng.range(-0.06, 0.06)]);
    }
  }
  // stem post, rising out of the bow, and the broken stern
  b.add(COLORS.hull, new THREE.BoxGeometry(0.3, 2.3, 0.35), [L / 2 - 0.1, 1.5, 0], [0, 0, -0.35]);
  b.add(COLORS.hull, new THREE.BoxGeometry(0.3, 1.2, 0.4), [-L / 2 + 0.2, 1.1, 0.1], [0.1, 0, 0.5]);
  // a stretch of deck that stayed attached
  b.add(COLORS.deck, new THREE.BoxGeometry(3.4, 0.1, 1.6), [0.8, 0.95, -0.9], [0, 0, 0.18]);
  for (let i = -1; i <= 1; i++) b.add(COLORS.hullDark, new THREE.BoxGeometry(0.1, 0.08, 1.62), [0.8 + i * 1.1, 1.0, -0.9], [0, 0, 0.18]);
}

function mast(b, rng) {
  // a snapped mast lying across the sand, a torn sail still hanging from the yard
  b.add(COLORS.hull, new THREE.CylinderGeometry(0.16, 0.2, 7, 7), [-1.2, 0.35, 3.6], [0.05, 0.25, Math.PI / 2]);
  b.add(COLORS.hullDark, new THREE.CylinderGeometry(0.1, 0.1, 4.2, 6), [0.2, 0.55, 3.1], [0, 0.25, Math.PI / 2]);
  const sail = new THREE.PlaneGeometry(3.6, 2.2, 6, 4);
  const p = sail.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.sin(x * 1.3) * 0.18 + Math.sin(y * 2.1 + x) * 0.08);
    if (y < -0.4) p.setY(i, y - Math.abs(Math.sin(x * 3.1)) * 0.5); // ragged hem
  }
  sail.computeVertexNormals();
  b.add(COLORS.sail, sail, [0.2, 0.62, 3.9], [-Math.PI / 2 + 0.12, 0.25, 0], [1, 1, 1], { double: true });
  b.add(COLORS.rope, new THREE.TorusGeometry(0.4, 0.05, 5, 12), [-3, 0.1, 2], [Math.PI / 2, 0, 0.4]);
}

function cargo(b, rng) {
  const spots = [[4.6, -1.4, 0.2], [5.6, -2.3, -0.5], [-5.2, -1.2, 0.8], [2.6, 2.1, 0.1]];
  spots.forEach(([x, z, r], i) => {
    if (i % 2) b.add(COLORS.crate, new THREE.BoxGeometry(0.9, 0.7, 0.9), [x, 0.3, z], [0.12, r, 0.08]);
    else {
      b.add(COLORS.hull, new THREE.CylinderGeometry(0.42, 0.42, 0.9, 10), [x, 0.4, z], [0.15, r, i ? 0.2 : 0]);
      b.add(COLORS.iron, new THREE.CylinderGeometry(0.435, 0.435, 0.07, 10), [x, 0.18, z], [0.15, r, 0]);
      b.add(COLORS.iron, new THREE.CylinderGeometry(0.435, 0.435, 0.07, 10), [x, 0.62, z], [0.15, r, 0]);
    }
  });
  for (let i = 0; i < 9; i++) b.add(i % 3 ? COLORS.hull : COLORS.hullDark, new THREE.BoxGeometry(rng.range(1, 2.2), 0.07, 0.3), [rng.range(-7, 7), 0.05, rng.range(-4, 5)], [0, rng.range(0, 3.1), rng.range(-0.1, 0.1)]);
}

/** The three weapons, each stuck in the beach with a soft marker ring. x offsets from the group origin. */
export function weaponProps() {
  const b = new Bucket();
  // sword: blade down in the sand, crossguard and grip up
  b.add(COLORS.metal, new THREE.BoxGeometry(0.16, 1.5, 0.05), [0, 0.8, 0], [0.1, 0, 0.08]);
  b.add(COLORS.gold, new THREE.BoxGeometry(0.62, 0.1, 0.12), [0, 1.62, 0], [0.1, 0, 0.08]);
  b.add(COLORS.hullDark, new THREE.CylinderGeometry(0.05, 0.05, 0.38, 6), [-0.02, 1.86, 0], [0.1, 0, 0.08]);
  b.add(COLORS.gold, new THREE.SphereGeometry(0.08, 6, 5), [-0.03, 2.07, 0], [0, 0, 0]);
  const sword = new THREE.Group();
  b.build(sword);
  const c = new Bucket();
  // bow: leaning on a crate, a curved limb and a string
  const limb = new THREE.TorusGeometry(0.75, 0.05, 6, 16, Math.PI * 0.9);
  c.add(COLORS.hull, limb, [0, 1.1, 0], [0, 0, Math.PI / 2 + Math.PI * 0.05], [1, 1, 1]);
  c.add(COLORS.string, new THREE.CylinderGeometry(0.012, 0.012, 1.5, 4), [0.2, 1.1, 0], [0, 0, 0]);
  c.add(COLORS.crate, new THREE.BoxGeometry(0.7, 0.55, 0.7), [0.55, 0.28, 0], [0, 0.3, 0]);
  const bow = new THREE.Group();
  c.build(bow);
  const d = new Bucket();
  // staff: upright, a glowing orb in a claw
  d.add(COLORS.hull, new THREE.CylinderGeometry(0.06, 0.07, 2.2, 7), [0, 1.0, 0], [0.06, 0, -0.05]);
  d.add(COLORS.gold, new THREE.TorusGeometry(0.16, 0.04, 5, 10), [0, 2.2, 0], [Math.PI / 2, 0, 0]);
  d.add(COLORS.orb, new THREE.SphereGeometry(0.15, 10, 8), [0, 2.2, 0], [0, 0, 0], [1, 1, 1], { emissive: '#7c5cff' });
  const staff = new THREE.Group();
  d.build(staff);
  return { sword, bow, staff };
}

/** @returns {THREE.Group} the wreck, ready to place (bow along +X). */
export function buildWreck(seed = 5) {
  const rng = createRng(seed);
  const rngR = { next: () => rng.next(), range: (a, b) => a + (b - a) * rng.next() };
  const b = new Bucket();
  hull(b, rngR);
  mast(b, rngR);
  cargo(b, rngR);
  const g = new THREE.Group();
  g.name = 'wreck';
  b.build(g);
  return g;
}
