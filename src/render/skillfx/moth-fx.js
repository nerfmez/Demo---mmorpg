// The mirrorwing moth's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core events:
// - Glass Rain: a shard of glass forms in the air high over each marked circle while the moth holds its wings up,
//   then falls onto its mark as it goes off (area events give the marks and their delays; MonsterFx draws the shatter).
// - Moonlight Ring: a wall of moonlight runs out from the safe middle to the band's true edge (core burst).
// - Wing Glare: the moonlight caught in its wings is thrown along the lane as a beam (core beam, kind glare).
// Pools only, shared geometry, no allocation per frame.
import * as THREE from 'three';

const SHARDS = 12, WALLS = 2, BEAMS = 2;
const FORM = 0.75, FALL = 0.28, HIGH = 3.2; // s a shard shows before it lands, s it falls, m above its mark
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

const WALL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// a band of light standing round the ring: bright at the foot, fading up, broken into soft pillars
const WALL_FS = `varying vec2 vUv; uniform vec3 uC; uniform float uA; uniform float uSeed;
void main(){
  float up = pow(1.0 - vUv.y, 1.7);
  float pillars = 0.55 + 0.45 * sin(vUv.x * 6.2832 * 14.0 + uSeed);
  gl_FragColor = vec4(uC, uA * up * pillars);
}`;

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
    // ring walls: an open cylinder of light (radius 1, height 1, its foot at y 0)
    const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, 0.5, 0); wallGeo.userData.shared = true;
    this.walls = Array.from({ length: WALLS }, () => {
      const mat = new THREE.ShaderMaterial({ vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uC: { value: new THREE.Color(0xcdf2ff) }, uA: { value: 0 }, uSeed: { value: 0 } } });
      const m = new THREE.Mesh(wallGeo, mat); m.visible = false; m.renderOrder = 8; scene.add(m);
      return { m, t: 9, x: 0, z: 0, y: 0, inner: 0, outer: 1 };
    });
    this.wallI = 0;
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

  /** The moonlight ring goes off (core burst of mirror_ring): a wall of light runs out from the safe middle to the edge. */
  ring(e) {
    const w = this.walls[this.wallI++ % WALLS];
    Object.assign(w, { t: 0, x: e.x, z: e.z, y: this.gy(e.x, e.z), inner: e.inner || 0.3, outer: e.radius });
    w.m.material.uniforms.uSeed.value = Math.random() * 10;
    w.m.visible = true;
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
    for (const w of this.walls) {
      if (!w.m.visible) continue;
      w.t += dt;
      const k = Math.min(1, w.t / 0.45), out = 1 - (1 - k) * (1 - k) * (1 - k);
      if (k >= 1) { w.m.visible = false; continue; }
      const R = w.inner + (w.outer - w.inner) * out;
      w.m.position.set(w.x, w.y + 0.02, w.z);
      w.m.scale.set(R, 1.7 - 1.1 * out, R);
      w.m.material.uniforms.uA.value = (k < 0.1 ? k / 0.1 : 1) * (1 - k) * 1.1;
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
