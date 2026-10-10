// Strike trails that come out of the monster itself: thin ribbons recorded from the real tip of
// the limb that hits (a paw's claws, the upper and lower jaw, a crab's claw, a mantis blade), the
// same way the hero's blade trail follows the real weapon. The light follows the actual strike
// motion of the rig, and is only bright while that tip is really moving fast, so wind-ups stay
// dark and the strike reads as the creature's own claws, fangs or pincers.
// Tuning: data/combat-fx.json monsters[attack].trail; which limbs strike: overrides[type.attack].limbs.
import * as THREE from 'three';
import { BladeTrail } from './trail.js';

const _p = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _m = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);

/**
 * Where a limb ends, in the bone's own space: the explicit `at` point (rig rest space), else the
 * segment end of that bone farthest from its joint (data/models.json segments). Null when the
 * rig has no imported model for it.
 */
export function limbTip(rig, limb) {
  const name = typeof limb === 'string' ? limb : limb.bone;
  const bone = rig.bones[name];
  const inv = rig.restInverse?.[name];
  if (!bone || !inv) return null;
  let best = null, far = -1;
  const ends = typeof limb === 'string' || !limb.at ? (rig.modelCfg?.segments?.[name] || []) : [[limb.at]];
  const list = Array.isArray(ends[0]?.[0]) ? ends : [ends];
  for (const seg of list)
    for (const q of seg) {
      _p.fromArray(q).applyMatrix4(inv);
      const d = _p.lengthSq();
      if (d > far) {
        far = d;
        best = _p.clone();
      }
    }
  if (!best) return null;
  const dir = best.clone().normalize();
  const lat = new THREE.Vector3().crossVectors(dir, Math.abs(dir.z) > 0.8 ? X : Z).normalize();
  return { bone, tip: best, dir, lat };
}

/** Trails for one monster view; reused across its strikes, freed with the view. */
export class MonsterTrails {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.slots = [];
    this.look = null;
  }

  configure(rig, f) {
    this.look = f;
    this.slots.length = 0;
    for (const t of this.pool) t.clear();
    if (!f?.trail || !f.limbs) return;
    const c = f.trail;
    let k = 0;
    for (const limb of f.limbs) {
      const info = limbTip(rig, limb);
      if (!info) continue;
      const n = c.streaks ?? 1;
      for (let s = 0; s < n; s++) {
        const off = info.lat.clone().multiplyScalar((s - (n - 1) / 2) * (c.spread ?? 0.06));
        const trail = this.pool[k] || (this.pool[k] = new BladeTrail(this.scene));
        trail.begin({ life: c.life, minSpeed: c.minSpeed, fullSpeed: c.fullSpeed, trailOpacity: c.opacity, trailCoreWidth: c.core ?? 0.35 }, f.color, f.coreColor ?? '#ffffff');
        // a short stroke across the very tip of the claw/fang: base a little inside, tip a little past
        const base = info.tip.clone().addScaledVector(info.dir, -(c.width ?? 0.05)).add(off);
        const tip = info.tip.clone().addScaledVector(info.dir, c.reach ?? 0.03).add(off);
        this.slots.push({ trail, bone: info.bone, base, tip });
        k++;
      }
    }
  }

  /** f: the attack's merged look (or null); active: the strike window is open. */
  update(dt, rig, f, active) {
    if (f !== this.look) this.configure(rig, f);
    for (const s of this.slots) {
      if (active && !s.trail.on) s.trail.start();
      else if (!active && s.trail.on) s.trail.end();
      s.bone.updateWorldMatrix(true, false);
      _m.copy(s.bone.matrixWorld);
      _b.copy(s.base).applyMatrix4(_m);
      _t.copy(s.tip).applyMatrix4(_m);
      s.trail.update(dt, _b, _t);
    }
  }

  // Trails live directly in the scene. Stop them when the owning creature leaves
  // the conservative view envelope so old tip samples cannot flash on reentry.
  clear() {
    for (const t of this.pool) t.clear();
  }

  dispose() {
    for (const t of this.pool) t.dispose();
    this.pool.length = 0;
    this.slots.length = 0;
  }
}
