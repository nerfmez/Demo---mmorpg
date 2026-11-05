// The mirrorwing moth's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core events:
// - Glass Rain: a shard of glass forms in the air high over each marked circle while the moth holds its wings up,
//   then falls onto its mark as it goes off (area events give the marks and their delays; MonsterFx draws the shatter).
// - Mirror Decoy: a glass image of the moth is left where it hung (core area kind mirror_bomb), flickering faster and
//   faster like a fuse burning down, then it bursts (MonsterFx draws the explosion). The image is a pooled moth rig
//   from the View (host.takeRig), lit pale and see-through.
// - Wing Glare: the moonlight caught in its wings is thrown along the lane as a beam (core beam, kind glare).
// Pools only, shared geometry, no allocation per frame.
import * as THREE from 'three';
import { lightSprite, glowTexture } from './light-kit.js';

const SHARDS = 12, BEAMS = 2, DECOYS = 3;
const FORM = 0.75, FALL = 0.28, HIGH = 3.2; // s a shard shows before it lands, s it falls, m above its mark
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

const GHOST = { moving: false, speed: 0, smoothSpeed: 0, state: 'idle', windup: null, lookYaw: 0, hurt: 0, actT: 0 };

export class MothFx {
  constructor(scene, host) {
    this.host = host;
    this.time = 0;
    // shards: a pale glass crystal inside a cold glowing shell
    const crystal = new THREE.OctahedronGeometry(1, 0).scale(0.2, 0.7, 0.2); crystal.userData.shared = true;
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xe4f8ff, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false });
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x7fd2ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, toneMapped: false });
    glassMat.userData.shared = shellMat.userData.shared = true;
    this.shards = Array.from({ length: SHARDS }, () => {
      const g = new THREE.Group(), core = new THREE.Mesh(crystal, glassMat), shell = new THREE.Mesh(crystal, shellMat);
      shell.scale.setScalar(1.45);
      g.add(shell, core); g.visible = false; g.renderOrder = 9; scene.add(g);
      return { g, x: 0, z: 0, land: -1, spin: 0, next: 0 };
    });
    this.shardI = 0;
    this.decoys = []; // { rig, x, z, y, t, fuse, phase, source, next, halo }
    // a cold halo pulsing round each decoy, the fuse's beat
    this.halos = Array.from({ length: DECOYS }, () => { const h = lightSprite(scene, glowTexture('cold'), true, 9); h.visible = false; return h; });
    // glare beams: a white core inside a cold sheath, a unit tube along +Z
    const tube = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5); tube.userData.shared = true;
    const beamMat = (c, o) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); return m; };
    this.beams = Array.from({ length: BEAMS }, () => {
      const core = new THREE.Mesh(tube, beamMat(0xffffff, 1)), glow = new THREE.Mesh(tube, beamMat(0x6fcfff, 0.45));
      const g = new THREE.Group(); g.add(glow, core); g.visible = false; g.renderOrder = 10; scene.add(g);
      return { g, core, glow, t: 9, len: 1, x: 0, y: 0, z: 0, ex: 0, ez: 0 };
    });
    this.beamI = 0;
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }

  /** A glass shard is marked (core area kind glass_shard): it forms high over the mark and lands as it goes off. */
  shard(e) {
    const q = this.shards[this.shardI++ % SHARDS];
    Object.assign(q, { x: e.x, z: e.z, land: this.time + e.delay, spin: Math.random() * 6.283, next: 0 });
  }

  /**
   * The mirror decoy is left (core area kind mirror_bomb): a glass moth where the real one hung, facing as it did,
   * until it bursts (pop) or its fuse is long past.
   */
  decoy(e) {
    const take = this.host.takeRig, real = e.source != null ? this.host.monsterRig?.(e.source) : null;
    if (!take || !real || this.decoys.length >= DECOYS) return;
    const rig = take('mirrorwing_moth');
    rig.root.position.set(e.x, this.gy(e.x, e.z), e.z);
    rig.root.rotation.y = real.root.rotation.y;
    rig.root.scale.copy(real.root.scale);
    rig.decoyScale = real.root.scale.x;
    this.host.scene.add(rig.root);
    const halo = this.halos.find((h) => !h.visible);
    this.decoys.push({ rig, x: e.x, z: e.z, t: 0, fuse: e.delay, phase: 0, source: e.source, next: 0, halo });
  }
  /** The decoy at (x, z) bursts: its rig goes back to the View's pool; true when there was one. */
  pop(x, z) {
    const i = this.decoys.findIndex((d) => Math.hypot(d.x - x, d.z - z) < 0.5);
    if (i < 0) return false;
    this.free(i);
    return true;
  }
  free(i) {
    const d = this.decoys[i];
    this.decoys.splice(i, 1);
    if (d.halo) d.halo.visible = false;
    this.host.releaseRig?.(d.rig);
  }

  /** The wing glare (core beam, kind glare): from the moth's chest down along the lane to its end. */
  glare(e, from) {
    const b = this.beams[this.beamI++ % BEAMS];
    const ex = e.x + Math.sin(e.angle) * e.length, ez = e.z + Math.cos(e.angle) * e.length;
    b.x = from ? from.x : e.x; b.y = from ? from.y : this.gy(e.x, e.z) + 1.5; b.z = from ? from.z : e.z;
    b.ex = ex; b.ez = ez; b.t = 0; b.w = e.width;
    _a.set(b.x, b.y, b.z); _b.set(ex, this.gy(ex, ez) + 0.45, ez);
    b.len = _a.distanceTo(_b);
    b.g.position.copy(_a); b.g.lookAt(_b); b.g.visible = true;
    const fx = this.host.vfx?.fx;
    // motes of reflected light left hanging along the lane, the far end the brightest
    if (fx) for (let i = 0; i < 16; i++) {
      const u = (i + Math.random() * 0.5) / 16;
      fx.add(_a.x + (_b.x - _a.x) * u, _a.y + (_b.y - _a.y) * u, _a.z + (_b.z - _a.z) * u, (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4,
        { color: i % 3 ? 0xd8f6ff : 0xfff6d8, size: 0.16 + 0.12 * u, sizeEnd: 0.03, life: 0.35 + 0.25 * u, drag: 2 });
    }
  }

  fade(rig, a) {
    for (const [mat, hull] of [[rig.material, rig.hull], [rig.modelMaterial, rig.modelHull]]) {
      if (!mat) continue;
      if (!mat.transparent) { mat.transparent = true; mat.depthWrite = false; mat.needsUpdate = true; if (hull) { hull.transparent = true; hull.depthWrite = false; hull.needsUpdate = true; } }
      mat.opacity = a;
      if (hull) hull.opacity = a * a;
    }
  }

  update(dt) {
    this.time += dt;
    const fx = this.host.vfx?.fx;
    for (const q of this.shards) {
      const left = q.land - this.time;
      if (left > FORM || left < 0) { q.g.visible = false; continue; }
      const gy = this.gy(q.x, q.z);
      q.g.visible = true;
      q.spin += dt * (left > FALL ? 2.5 : 9);
      if (left > FALL) {
        // forming: grows out of a glint, turning slowly, high over its mark
        const k = 1 - (left - FALL) / (FORM - FALL), s = k < 0.4 ? k / 0.4 : 1;
        q.g.position.set(q.x, gy + HIGH + 0.15 * Math.sin(this.time * 6 + q.x), q.z);
        q.g.scale.setScalar(Math.max(0.01, s * (1 + 0.25 * (1 - s))));
        q.g.rotation.set(0, q.spin, 0.15);
      } else {
        // falling, tip down, faster and faster, a trail of cold glitter behind it
        const u = 1 - left / FALL;
        q.g.position.set(q.x, gy + 0.35 + (HIGH - 0.35) * (1 - u * u), q.z);
        q.g.scale.set(1, 1 + 0.5 * u, 1);
        q.g.rotation.set(0, q.spin, 0);
        q.next -= dt;
        if (fx && q.next <= 0) { q.next = 0.025; fx.add(q.x + (Math.random() - 0.5) * 0.15, q.g.position.y + 0.5, q.z + (Math.random() - 0.5) * 0.15, 0, 0.3, 0, { color: 0xcff2ff, size: 0.14, sizeEnd: 0.02, life: 0.3, drag: 3 }); }
      }
    }
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i], r = d.rig;
      d.t += dt;
      if (d.t > d.fuse + 0.6) { this.free(i); continue; }
      // the fuse: a pale glass glow pulsing faster and faster, brightest as it runs out; it swells on the last beat
      const k = Math.min(1, d.t / d.fuse);
      d.phase += dt * (3 + 16 * k * k) * Math.PI * 2;
      const pulse = 0.5 + 0.5 * Math.sin(d.phase);
      r.material.userData.flash.value.set(0.7 + 0.3 * pulse + 0.3 * k, 0, 1.1 + 0.3 * pulse);
      const see = 0.88 + 0.12 * pulse;
      this.fade(r, see);
      const swell = k > 0.85 ? 1 + 0.18 * (k - 0.85) / 0.15 : 1 + 0.02 * pulse;
      r.root.scale.setScalar(r.decoyScale * swell);
      r.animate(r, GHOST, dt, this.time);
      if (d.halo) {
        r.bones.body.getWorldPosition(_a);
        d.halo.visible = true; d.halo.position.copy(_a);
        d.halo.scale.setScalar((1.6 + 0.6 * pulse + 0.8 * k) * r.decoyScale);
        d.halo.material.opacity = 0.35 + 0.45 * pulse * (0.5 + 0.5 * k);
      }
      d.next -= dt;
      if (fx && d.next <= 0) {
        d.next = 0.12 - 0.08 * k;
        const a = Math.random() * 6.283, y = this.gy(d.x, d.z) + 1.2 + Math.random() * 0.8;
        fx.add(d.x + Math.sin(a) * 0.5, y, d.z + Math.cos(a) * 0.5, Math.sin(a) * 0.4, 0.3, Math.cos(a) * 0.4, { color: k > 0.6 ? 0xffffff : 0xcdeeff, size: 0.12 + 0.1 * k, sizeEnd: 0.02, life: 0.4, drag: 2 });
      }
    }
    for (const b of this.beams) {
      if (!b.g.visible) continue;
      b.t += dt;
      const k = b.t / 0.38;
      if (k >= 1) { b.g.visible = false; continue; }
      // a hard flash at full width, then the core thins and the sheath spreads as it fades
      const w = b.w || 1.1, thin = k < 0.15 ? 1 : 1 - (k - 0.15) / 0.85;
      b.core.scale.set(w * 0.12 * thin, w * 0.12 * thin, b.len);
      b.glow.scale.set(w * (0.38 + 0.25 * k), w * (0.38 + 0.25 * k), b.len);
      b.core.material.opacity = thin;
      b.glow.material.opacity = 0.5 * (1 - k);
    }
  }
}
