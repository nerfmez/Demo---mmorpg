// Living touches from the approved beach scene: gulls gliding over the coast with their shadows
// sliding across the sand, and butterflies over meadows and glades. A fixed handful of each, kept
// around the camera focus and hidden where they do not belong; no allocation per frame.
import * as THREE from 'three';
import art from '../../data/art.json' with {type:'json'};
import rendering from '../../data/rendering.json' with {type:'json'};

const A = art.ambience;
// a shadow falls away from the sun: per metre of height it moves -sun.x/sun.y, -sun.z/sun.y
const SUN = rendering.shadow.sunOffset, SHADOW_X = -SUN[0] / SUN[1], SHADOW_Z = -SUN[2] / SUN[1];

function wingGeometry(span, chord, sweep, tip = null) {
  // one wing from the body (x=0) out to +x, swept back at the tip; `tip` greys the outer end
  const g = new THREE.BufferGeometry();
  const p = [0, 0, chord * 0.5, 0, 0, -chord * 0.5, span, 0, -sweep, 0, 0, chord * 0.5, span, 0, -sweep, span * 0.55, 0, chord * 0.1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const t = new THREE.Color(tip || '#ffffff'), c = [];
  for (let i = 0; i < p.length; i += 3) { const k = Math.max(0, p[i] / span - 0.55) / 0.45; c.push(1 + (t.r - 1) * k, 1 + (t.g - 1) * k, 1 + (t.b - 1) * k); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

export class Ambience {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.name = 'ambience'; scene.add(this.root);
    const gullWing = wingGeometry(0.75, 0.32, 0.28, A.gullTip), bfWing = wingGeometry(0.22, 0.24, -0.03);
    const gullMat = new THREE.MeshBasicMaterial({ color: A.gullColor, vertexColors: true, side: THREE.DoubleSide });
    const shadowMat = new THREE.MeshBasicMaterial({ color: A.gullShadow, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    this.owned = [gullWing, bfWing, gullMat, shadowMat];
    const bird = (wingMat, wing) => {
      const g = new THREE.Group(), l = new THREE.Mesh(wing, wingMat), r = new THREE.Mesh(wing, wingMat);
      r.scale.x = -1; g.add(l, r); g.userData.wings = [l, r]; return g;
    };
    this.gulls = [];
    for (let i = 0; i < A.gulls; i++) {
      const body = bird(gullMat, gullWing), shadow = bird(shadowMat, gullWing);
      shadow.renderOrder = 1; this.root.add(body, shadow);
      this.gulls.push({ body, shadow, a: i * 2.1, r: 5 + i * 3, h: A.gullHeight + i * 0.8, speed: 0.22 + i * 0.05, phase: i * 1.7 });
    }
    this.butterflies = [];
    for (let i = 0; i < A.butterflies; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: A.butterflyColors[i % A.butterflyColors.length], side: THREE.DoubleSide });
      this.owned.push(mat);
      const b = bird(mat, bfWing); this.root.add(b);
      this.butterflies.push({ body: b, ox: Math.sin(i * 2.4) * 6, oz: Math.cos(i * 2.4) * 5, phase: i * 1.3, speed: 0.5 + (i % 3) * 0.17 });
    }
    this.focus = new THREE.Vector3();
  }

  /** x, z: camera focus; ground(x, z): ground height there; zoneId: the zone under the focus. */
  update(dt, time, x, z, ground, zoneId) {
    const coast = A.gullZones.includes(zoneId), field = A.butterflyZones.includes(zoneId);
    // drift the anchor after the focus so the flock does not snap when the hero turns; after a
    // teleport (or the first frame) it jumps
    if (Math.abs(x - this.focus.x) + Math.abs(z - this.focus.z) > 30) this.focus.set(x, 0, z);
    this.focus.x += (x - this.focus.x) * Math.min(1, dt * 0.6);
    this.focus.z += (z - this.focus.z) * Math.min(1, dt * 0.6);
    const fx = this.focus.x, fz = this.focus.z;
    for (const g of this.gulls) {
      g.body.visible = g.shadow.visible = coast;
      if (!coast) continue;
      g.a += dt * g.speed;
      const px = fx + Math.cos(g.a) * g.r, pz = fz + Math.sin(g.a) * g.r * 0.7 + 2, gy = ground(px, pz);
      const flap = Math.sin(time * 5.5 + g.phase) * (Math.sin(time * 0.6 + g.phase) > 0.3 ? 0.55 : 0.08);
      const heading = Math.atan2(-Math.sin(g.a), Math.cos(g.a) * 0.7);
      g.body.position.set(px, gy + g.h, pz); g.body.rotation.set(0, heading, Math.sin(g.a) * 0.25);
      // the shadow falls along the sun's direction onto the ground below
      g.shadow.position.set(px + g.h * SHADOW_X, gy + 0.06, pz + g.h * SHADOW_Z); g.shadow.rotation.set(0, heading, 0);
      const wb = g.body.userData.wings, ws = g.shadow.userData.wings;
      wb[0].rotation.z = flap; wb[1].rotation.z = -flap; ws[0].rotation.z = flap * 0.6; ws[1].rotation.z = -flap * 0.6;
    }
    for (const b of this.butterflies) {
      b.body.visible = field;
      if (!field) continue;
      const t = time * b.speed + b.phase;
      const px = fx + b.ox + Math.sin(t * 1.3) * 2.2 + Math.sin(t * 3.1) * 0.4, pz = fz + b.oz + Math.cos(t * 0.9) * 1.8;
      b.body.position.set(px, ground(px, pz) + 0.9 + Math.sin(t * 2.3) * 0.3 + Math.sin(time * 9 + b.phase) * 0.04, pz);
      b.body.rotation.set(0, Math.atan2(Math.cos(t * 1.3) * 2.9, -Math.sin(t * 0.9) * 1.6), 0);
      const flap = 0.2 + Math.abs(Math.sin(time * 14 + b.phase)) * 1.1;
      const w = b.body.userData.wings; w[0].rotation.z = flap; w[1].rotation.z = -flap;
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const o of this.owned) o.dispose();
  }
}
