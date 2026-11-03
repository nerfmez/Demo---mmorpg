// Leaves of light (docs/MONSTER-ATTACKS.md: the forest monsters' attacks). A curved, pointed leaf shape, lit on
// one half and shaded on the other (two toon tones), drawn as added light in autumn red, orange and olive.
// They stream out in a cone (the leaf fox's gust), burst up from a landing, or swirl round a point (a charge
// cue), fluttering as they slow: each turns about its own axis and drifts side to side, then shrinks away.
// One InstancedMesh (one draw call), fixed pool, no allocation per leaf or per frame.
import * as THREE from 'three';

const N = 72;
const LIT = new THREE.Color('#fff6e6'), SHADE = new THREE.Color('#d9b48c');
export const AUTUMN = [new THREE.Color('#ff6a2a'), new THREE.Color('#ffa63a'), new THREE.Color('#e8442a'), new THREE.Color('#b8c84a')];

// a leaf 1 unit long along +x, pointed at both ends, its spine bowed a little; lit above the spine, shaded below
function leafShape() {
  const pos = [], col = [], S = 10, W = 0.2, bow = 0.08;
  const at = (u) => [u - 0.5, bow * Math.sin(Math.PI * u)];
  const w = (u) => W * Math.pow(Math.sin(Math.PI * u), 0.8) * (0.7 + 0.6 * u * (1 - u) * 2);
  const v = (x, y, c) => { pos.push(x, y, 0); col.push(c.r, c.g, c.b); };
  for (let i = 0; i < S; i++) {
    const u0 = i / S, u1 = (i + 1) / S, [x0, y0] = at(u0), [x1, y1] = at(u1);
    v(x0, y0, LIT); v(x1, y1, LIT); v(x1, y1 + w(u1), LIT);
    v(x0, y0, LIT); v(x1, y1 + w(u1), LIT); v(x0, y0 + w(u0), LIT);
    v(x0, y0, SHADE); v(x1, y1 - w(u1), SHADE); v(x1, y1, SHADE);
    v(x0, y0, SHADE); v(x0, y0 - w(u0), SHADE); v(x1, y1 - w(u1), SHADE);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.userData.shared = true;
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class LeafFx {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(leafShape(), mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    for (let i = 0; i < N; i++) { this.mesh.setMatrixAt(i, HIDDEN); this.mesh.setColorAt(i, AUTUMN[0]); }
    this.mesh.visible = false;
    scene.add(this.mesh);
    // per leaf: position, velocity, spin, flutter, age, life, size, drag, swirl centre (cx, cz, radius, rate)
    this.f = { p: new Float32Array(N * 3), v: new Float32Array(N * 3), rot: new Float32Array(N * 3), spin: new Float32Array(N * 3), t: new Float32Array(N).fill(9), life: new Float32Array(N), size: new Float32Array(N), drag: new Float32Array(N), phase: new Float32Array(N), swirl: new Float32Array(N * 4) };
    this.i = 0;
    this.live = 0;
    this.seed = 7;
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  /** One leaf at (x, y, z) moving (vx, vy, vz); delay s before it shows. */
  leaf(x, y, z, vx, vy, vz, size, life, drag = 2.5, delay = 0, color = null) {
    const i = this.i++ % N, f = this.f, j = i * 3;
    f.p[j] = x; f.p[j + 1] = y; f.p[j + 2] = z; f.v[j] = vx; f.v[j + 1] = vy; f.v[j + 2] = vz;
    f.rot[j] = this.rnd() * 6.3; f.rot[j + 1] = this.rnd() * 6.3; f.rot[j + 2] = this.rnd() * 6.3;
    f.spin[j] = (this.rnd() - 0.5) * 14; f.spin[j + 1] = (this.rnd() - 0.5) * 10; f.spin[j + 2] = (this.rnd() - 0.5) * 18;
    f.t[i] = -delay; f.life[i] = life; f.size[i] = size; f.drag[i] = drag; f.phase[i] = this.rnd() * 6.3; f.swirl[i * 4 + 2] = 0;
    this.mesh.setColorAt(i, color || AUTUMN[Math.floor(this.rnd() * AUTUMN.length)]);
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
    return i;
  }
  /** A cone of leaves from (x, y, z) along angle a (rad, game facing), arc (rad) wide, reaching range m. */
  cone(x, y, z, a, arc, range, n = 16) {
    for (let k = 0; k < n; k++) {
      const ang = a + (k / (n - 1) - 0.5) * arc * (0.85 + 0.3 * this.rnd()), sp = range * (2.1 + 0.6 * this.rnd());
      this.leaf(x, y + (this.rnd() - 0.3) * 0.4, z, Math.sin(ang) * sp, 0.6 + this.rnd() * 1.2, Math.cos(ang) * sp, 0.48 + this.rnd() * 0.2, 0.62 + this.rnd() * 0.25, 3.2, (k % 4) * 0.012);
    }
  }
  /** Leaves thrown up and out from a landing at (x, z) on ground y. */
  burst(x, y, z, n = 14, speed = 3.5) {
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * 6.283 + this.rnd() * 0.4, sp = speed * (0.6 + 0.6 * this.rnd());
      this.leaf(x + Math.sin(ang) * 0.3, y + 0.15, z + Math.cos(ang) * 0.3, Math.sin(ang) * sp, 3 + this.rnd() * 2.5, Math.cos(ang) * sp, 0.4 + this.rnd() * 0.16, 0.75 + this.rnd() * 0.3, 2.2);
    }
  }
  /** A leaf circling (cx, cz) at radius r and height y for life s (a charge cue). */
  orbit(cx, y, cz, r, rate, life, size = 0.26) {
    const i = this.leaf(cx, y, cz, 0, 0.25, 0, size, life, 0);
    const s = this.f.swirl; s[i * 4] = cx; s[i * 4 + 1] = cz; s[i * 4 + 2] = r; s[i * 4 + 3] = rate;
    this.f.phase[i] = this.rnd() * 6.3;
  }
  /** Keep leaf i alive and placed at (x, y, z), spinning flat (a boomerang); release() lets it go. */
  hold(i, x, y, z, spin) {
    const f = this.f, j = i * 3;
    f.t[i] = Math.min(f.t[i], 0.1); f.life[i] = 9; f.swirl[i * 4 + 2] = -1;
    f.p[j] = x; f.p[j + 1] = y; f.p[j + 2] = z; f.v[j] = f.v[j + 1] = f.v[j + 2] = 0;
    f.rot[j] = -Math.PI / 2; f.rot[j + 1] = 0; f.rot[j + 2] = spin;
    this.mesh.visible = true;
  }
  release(i) { const f = this.f; f.life[i] = f.t[i] + 0.2; f.swirl[i * 4 + 2] = 0; }
  update(dt, time = 0) {
    if (!this.mesh.visible) return;
    const f = this.f;
    let any = false;
    for (let i = 0; i < N; i++) {
      if (f.t[i] >= f.life[i]) continue;
      f.t[i] += dt;
      any = true;
      if (f.t[i] < 0 || f.t[i] >= f.life[i]) { this.mesh.setMatrixAt(i, HIDDEN); continue; }
      const k = f.t[i] / f.life[i], j = i * 3, sw = f.swirl[i * 4 + 2];
      if (sw < 0) {
        // held (a boomerang leaf): placed by hold() each frame
        _q.setFromEuler(_e.set(f.rot[j], f.rot[j + 1], f.rot[j + 2], 'XZY'));
        _m.compose(_p.set(f.p[j], f.p[j + 1], f.p[j + 2]), _q, _s.set(f.size[i], f.size[i], f.size[i]));
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      if (sw > 0) {
        // circling a point, rising a little
        const ang = f.phase[i] + f.t[i] * f.swirl[i * 4 + 3];
        f.p[j] = f.swirl[i * 4] + Math.sin(ang) * sw; f.p[j + 2] = f.swirl[i * 4 + 1] + Math.cos(ang) * sw; f.p[j + 1] += f.v[j + 1] * dt;
      } else {
        // flying, slowing by drag; as it slows it falls and drifts side to side (the flutter)
        const d = Math.exp(-f.drag[i] * dt);
        f.v[j] *= d; f.v[j + 2] *= d; f.v[j + 1] = f.v[j + 1] * d - 3.2 * dt;
        const slow = 1 / (1 + Math.hypot(f.v[j], f.v[j + 2]));
        const fl = Math.sin(f.t[i] * 9 + f.phase[i]) * 1.4 * slow;
        f.p[j] += (f.v[j] + fl * Math.cos(f.phase[i])) * dt; f.p[j + 1] += f.v[j + 1] * dt; f.p[j + 2] += (f.v[j + 2] - fl * Math.sin(f.phase[i])) * dt;
      }
      for (let a = 0; a < 3; a++) f.rot[j + a] += f.spin[j + a] * dt * (sw > 0 ? 0.4 : 1);
      // grows in over a few frames, shrinks away over its last third
      const sc = f.size[i] * Math.min(1, f.t[i] / 0.05) * (k < 0.66 ? 1 : 1 - (k - 0.66) / 0.34);
      _q.setFromEuler(_e.set(f.rot[j], f.rot[j + 1], f.rot[j + 2]));
      _m.compose(_p.set(f.p[j], f.p[j + 1], f.p[j + 2]), _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!any) this.mesh.visible = false;
    void time;
  }
  clear() { this.f.t.fill(9); for (let i = 0; i < N; i++) this.mesh.setMatrixAt(i, HIDDEN); this.mesh.instanceMatrix.needsUpdate = true; this.mesh.visible = false; }
}
