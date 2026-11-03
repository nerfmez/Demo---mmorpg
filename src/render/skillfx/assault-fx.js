// Assault (the summoner's order: every summon runs at one target, faster, and its next hit there is harder
// and knocks it back; core: commandSummons, the 'summonAssault' event, then each summon's allyStrike with
// `sic`). Built on Sic 'Em's language (skillfx/sic-fx.js: a head marker over the target that reads on any
// monster, a ground reticle that closes in - from the same research) in the summoner's spirit blue, so the
// two orders read apart: a red single chevron is the hunter's, a blue triple chevron the summoner's.
//   order:  three blue chevrons stack down over the target (a "charge" sign) and a reticle closes in round
//           it; a tether of light runs from each summon to the target for a moment (who was sent);
//   rush:   each summon trails two streaks of light as it runs in;
//   strike: each charged hit knocks the target back - a crescent of light breaks on it, facing the blow,
//           with speed lines thrown out the way it is pushed and a star; the first one bursts the marker;
//   end:    the marker fades when every summon has struck or the order lapses.
// Pooled (2 orders, 8 rush trails, 6 shocks), no allocation per frame.
import * as THREE from 'three';
import { place } from './fx-common.js';
import { chevron, RET_VS, RET_FS } from './sic-fx.js';

const ORDERS = 2, TRAILS = 8, TRAIL = 8, SHOCKS = 6;
const CORE = new THREE.Color('#5cb8ff'), RIM = new THREE.Color('#d8f0ff'), HALO = new THREE.Color('#1f6dff'), SHADOW = new THREE.Color('#0a1a33');
const LIGHT = { core: [0.8, 0.94, 1.0], glow: [0.22, 0.55, 1.0] };
const HEIGHT = { spirit_wisp: 0.95, spirit_alpha: 1.2, spirit_wolf: 0.7, stone_guardian: 1.4 };

export class AssaultFx {
  /** host: the CompanionFx (rush strokes, glints, the call's locate); preyOf(id): the monster now. */
  constructor(scene, camera, host) {
    this.camera = camera; this.host = host; this.preyOf = null;
    const geos = [chevron(0.12), chevron(0.06), chevron(0.022), chevron(0)], quad = new THREE.PlaneGeometry(1, 1);
    this.orders = Array.from({ length: ORDERS }, () => {
      const stack = [0, 1, 2].map(() => {
        const root = new THREE.Group(), mats = [];
        geos.forEach((g, i) => {
          const m = new THREE.MeshBasicMaterial({ color: [SHADOW, HALO, RIM, CORE][i], transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: i === 0 ? THREE.NormalBlending : THREE.AdditiveBlending });
          const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 14 + i; mesh.frustumCulled = false; root.add(mesh); mats.push(m);
        });
        root.visible = false; scene.add(root); return { root, mats };
      });
      const ret = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: RET_VS, fragmentShader: RET_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uR: { value: 0.92 }, uRot: { value: 0 }, uA: { value: 0 }, uC: { value: HALO.clone() } } }));
      ret.rotation.x = -Math.PI / 2; ret.renderOrder = 3; ret.visible = false; scene.add(ret);
      return { stack, ret, t: 99, end: 0, burst: false, prey: 0, ids: [], x: 0, y: 1.8, z: 0 };
    });
    this.trails = Array.from({ length: TRAILS }, () => ({ id: null, pts: Array.from({ length: TRAIL }, () => new THREE.Vector3()), n: 0, t: 0 }));
    this.shocks = Array.from({ length: SHOCKS }, () => ({ t: 9, c: new THREE.Vector3(), d: new THREE.Vector3(), s: 1 }));
    this.si = 0;
    this.line = Array.from({ length: 6 }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()];
  }
  /** The rules' summonAssault: e.ids the summons sent, e.target, e.tx, e.tz. */
  order(e) {
    const o = this.orders.find((q) => q.t >= 90) || this.orders[0];
    Object.assign(o, { t: 0, end: 0, burst: false, hitT: 9, prey: e.target, x: e.tx, z: e.tz }); o.ids = e.ids.slice();
    for (const c of o.stack) c.root.visible = true; o.ret.visible = true;
    for (const id of e.ids) { const tr = this.trails.find((q) => q.id === id) || this.trails.find((q) => q.id === null); if (tr) { tr.id = id; tr.n = 0; tr.t = 0; } }
  }
  /** A charged strike (allyStrike with sic) of one of the sent summons: the knock and, the first, the burst. */
  strike(e) {
    const o = this.orders.find((q) => q.t < 90 && q.ids.includes(e.id ?? -1)) || this.orders.find((q) => q.t < 90 && q.prey === e.target);
    if (o) o.hitT = 0; // each charged hit pulses the marker; it bursts when the last one has struck
    const s = this.shocks[this.si++ % SHOCKS], k = HEIGHT[e.kind] ? 1 : 0.8;
    const dx = e.x - e.fromX, dz = e.z - e.fromZ, L = Math.hypot(dx, dz) || 1;
    s.t = 0; s.s = e.kind === 'spirit_alpha' || e.kind === 'stone_guardian' ? 1.35 : 1; s.d.set(dx / L, 0, dz / L);
    s.c.set(e.x - s.d.x * 0.35, 0.75 * k, e.z - s.d.z * 0.35);
    this.host.glint(s.c.x, s.c.y, s.c.z, 1.1 * s.s, 0);
    this.host.onShake?.(0.08 * s.s, 0.08);
  }
  update(dt, core, glow) {
    const q = this.camera.quaternion, locate = this.host.call.locate;
    for (const o of this.orders) {
      if (o.t >= 90) continue;
      o.t += dt; const t = o.t, prey = this.preyOf?.(o.prey);
      if (prey && !prey.dead) { o.x = prey.x; o.z = prey.z; o.y = 1.6 + (prey.r || 0.5) * 0.8; }
      const live = o.ids.some((id) => locate?.(id)?.sic);
      if (!o.end && (!live || !prey || prey.dead)) { o.end = t; o.burst = o.hitT < 1; }
      o.hitT = (o.hitT ?? 9) + dt;
      const e = o.end ? t - o.end : 0, life = o.burst ? 0.25 : 0.3;
      if (o.end && e >= life && !live) { o.t = 99; for (const c of o.stack) c.root.visible = false; o.ret.visible = false; continue; }
      // three chevrons drop in one after another and pulse down the stack (a "charge" sign)
      const a0 = o.end && !live ? 1 - Math.min(1, e / life) : 1;
      o.stack.forEach((c, i) => {
        const ti = t - i * 0.05, drop = Math.min(1, Math.max(0, ti / 0.12)), pulse = 0.75 + 0.25 * Math.sin(t * 12 - i * 1.4);
        const hp = Math.max(0, 1 - o.hitT / 0.15); // a charged hit landed: the stack jolts down and flares
        let y = o.y + 0.36 * (2 - i) + 0.7 * (1 - drop) ** 2 + 0.05 * Math.sin(t * 7) - 0.15 * hp, s = (0.55 - 0.05 * i) * (1 + 0.25 * hp), a = drop * a0;
        if (o.burst) { const k = Math.min(1, e / 0.25); y -= 0.5 * k; s *= 1 + 0.7 * k; a *= 1 - k; }
        c.root.visible = a > 0.01; place(c.root, o.x, y, o.z); c.root.quaternion.copy(q); c.root.scale.set(s, s * 0.8, 1);
        const [sh, h, r, cc] = c.mats; sh.opacity = 0.35 * a; h.opacity = 0.6 * a * pulse; r.opacity = 0.5 * a; cc.opacity = 0.75 * a;
      });
      const lock = Math.min(1, t / 0.25), U = o.ret.material.uniforms;
      place(o.ret, o.x, 0.05, o.z); o.ret.scale.setScalar(2 * (1.7 - 0.6 * lock * lock));
      U.uRot.value = -t * 2.2; U.uA.value = a0 * (0.5 + 0.5 * lock) * (o.burst ? 1 - Math.min(1, e / 0.25) : 1);
      // the tethers: from each summon to the target, for a moment
      if (t < 0.3) for (const id of o.ids) {
        const al = locate?.(id); if (!al) continue;
        const P = this.line, h = HEIGHT[al.type] || 0.8, f = 1 - t / 0.3;
        for (let i = 0; i < P.length; i++) { const u = i / (P.length - 1); P[i].set(al.x + (o.x - al.x) * u, h + (o.y - 0.4 - h) * u + Math.sin(Math.PI * u) * 0.35, al.z + (o.z - al.z) * u); }
        this.host.line(P, LIGHT, core, glow, 0.035 * f, 0.6 * f);
      }
    }
    // the rush trails of the sent summons
    for (const tr of this.trails) {
      if (tr.id === null) continue;
      const al = locate?.(tr.id);
      if (!al || !al.sic) { tr.id = null; continue; }
      const h = (HEIGHT[al.type] || 0.8) * 0.6;
      if (tr.n === 0) for (const p of tr.pts) p.set(al.x, h, al.z);
      for (let i = TRAIL - 1; i > 0; i--) tr.pts[i].copy(tr.pts[i - 1]); tr.pts[0].set(al.x, h, al.z); tr.n++;
      if (tr.pts[0].distanceTo(tr.pts[TRAIL - 1]) > 0.5) { this.host.rush(tr.pts, 0.1, LIGHT, core, glow); this.host.rush(tr.pts, -0.1, LIGHT, core, glow); }
    }
    // the knocks: a crescent of light breaking on the target, facing the blow, and speed lines thrown out
    for (const s of this.shocks) {
      if (s.t >= 0.32) continue;
      s.t += dt; const k = s.t / 0.32, a = 1 - k, P = this.line, side = this.two[0].set(-s.d.z, 0, s.d.x);
      for (let i = 0; i < P.length; i++) {
        const u = i / (P.length - 1) * 2 - 1, r = (0.55 + 0.6 * k) * s.s;
        P[i].copy(s.c).addScaledVector(side, u * r).addScaledVector(s.d, (0.15 + 0.5 * k) * s.s - (u * u) * 0.35 * r); P[i].y += Math.sin(u * 1.2) * 0.1;
      }
      this.host.line(P, LIGHT, core, glow, 0.09 * a * s.s, 0.9 * a);
      for (let j = -1; j <= 1; j++) {
        const o = this.two[1].copy(side).multiplyScalar(j * 0.28 * s.s);
        const a0 = 0.3 + 1.4 * k, b0 = a0 + 0.55;
        for (let i = 0; i < P.length; i++) { const u = i / (P.length - 1); P[i].copy(s.c).add(o).addScaledVector(s.d, (a0 + (b0 - a0) * u) * s.s); P[i].y += 0.1 * j; }
        this.host.line(P, LIGHT, core, glow, 0.035 * a, 0.7 * a);
      }
    }
  }
  clear() { for (const o of this.orders) { o.t = 99; for (const c of o.stack) c.root.visible = false; o.ret.visible = false; } for (const tr of this.trails) tr.id = null; for (const s of this.shocks) s.t = 9; }
}
