// The hermit crab's effects (docs/MONSTER-ATTACKS.md), cosmetic only, from core state and events:
// - Claw guard (core claw_guard): a blow from in front on its raised claw glances off in a clank of sparks (core
//   clawGuard); the snap itself is the light pincer look (data/combat-fx.json monsters.claw_guard).
// - Anemone sting (core anemone): every hermit wears a few sea anemones on its shell; through the wind-up they swell
//   and glow, and the sting lashes tentacles of pink light out over the rear cone (the true arc and reach), stinging
//   what they reach.
// - Shell shed (core shell_shed, area coral_burst): coral chips fall off the trembling shell; the burst throws coral
//   shards and a ring out to the true radius; the shell stays where it stood (a pooled hermit rig from the View
//   showing only its shell, its anemones with it) until the crab climbs back in.
// Pools only; no allocation per frame.
import * as THREE from 'three';

const PINK = 0xff8ad0, PINK_HOT = new THREE.Color(0xffd8f0), PINK_IDLE = new THREE.Color(0xe86ab8), STALK = 0x9a4a8a;
const CORAL = [0xff8a7a, 0xffc0a8, 0xf4ece0, 0xe86a5a];
const RING = new THREE.Color(0xffb0a0), CLANK = new THREE.Color(0xfff0c0), STAR = { core: [1, 0.98, 0.85], glow: [1, 0.8, 0.3] };
const DEG = Math.PI / 180;
const LASHES = 8, SEG = 12;
const _v = new THREE.Vector3();

// one anemone: a stalk and a crown of tentacles, in the shell bone's space (shared geometry)
let ANEMONE = null;
function anemoneGeometry() {
  if (ANEMONE) return ANEMONE;
  const stalk = new THREE.CylinderGeometry(0.07, 0.09, 0.12, 7).translate(0, 0.06, 0);
  const crown = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, t = new THREE.ConeGeometry(0.025, 0.2, 4).translate(0, 0.1, 0);
    t.rotateX(0.75 + (i % 2) * 0.25).rotateY(a).translate(Math.sin(a) * 0.05, 0.12, Math.cos(a) * 0.05);
    crown.push(t);
  }
  const merged = mergeAll(crown);
  stalk.userData.shared = true; merged.userData.shared = true;
  ANEMONE = { stalk, crown: merged };
  return ANEMONE;
}
function mergeAll(list) {
  let n = 0, idx = 0;
  for (const g of list) { n += g.attributes.position.count; idx += g.index.count; }
  const pos = new Float32Array(n * 3), index = new Uint16Array(idx);
  let o = 0, k = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    for (let i = 0; i < g.index.count; i++) index[k++] = g.index.array[i] + o;
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}
// a hermit crab's soft abdomen, curling back and up from behind its head (head bone space)
let ABDOMEN = null;
function abdomenGeometry() {
  if (ABDOMEN) return ABDOMEN;
  const parts = [[0, -0.12, -0.22, 0.24], [0, -0.1, -0.46, 0.21], [0.03, -0.02, -0.65, 0.17], [0.06, 0.1, -0.76, 0.12]];
  const flesh = [], hull = [];
  for (const [x, y, z, r] of parts) {
    flesh.push(new THREE.SphereGeometry(r, 10, 8).scale(1, 0.85, 1).translate(x, y, z));
    hull.push(new THREE.SphereGeometry(r + 0.025, 10, 8).scale(1, 0.85, 1).translate(x, y, z));
  }
  ABDOMEN = { flesh: mergeAll(flesh), hull: mergeAll(hull) };
  ABDOMEN.flesh.userData.shared = true; ABDOMEN.hull.userData.shared = true;
  return ABDOMEN;
}
// where they sit on the shell (shell bone space), and how they lean
const SPOTS = [[0.26, 0.4, -0.02, 0.5], [-0.22, 0.4, 0.04, -0.45], [0.03, 0.42, 0.2, 0.1]];

export class HermitFx {
  constructor(scene, host, monster) {
    this.scene = scene; this.host = host; this.monster = monster; this.time = 0;
    this.shells = new Map(); // monster id -> { rig, t }
    this.clankT = new Map();
    // tentacle lashes: flat strips bent along a curve each frame, a violet glow under a hot pink core (plain
    // blending: added light washes out to white on the pale sand)
    const strip = (c, o) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, SEG), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
    this.lashes = Array.from({ length: LASHES }, () => {
      const glow = strip(0x9a3ad8, 0.5), m = strip(0xff5ac0, 0.95);
      glow.renderOrder = 8; m.renderOrder = 9;
      return { m, glow, t: 9, x: 0, y: 0, z: 0, a: 0, len: 1, bow: 0, delay: 0 };
    });
    this.lashI = 0;
    // the guarded front: a gold arc on the ground over the claw's guard (guardArc), flaring at each clank
    const half = 60 * DEG; // data/monsters.json hermit_crab.claw_guard.guardArc / 2
    const arc = new THREE.RingGeometry(0.86, 1, 32, 1, -Math.PI / 2 - half, 2 * half).rotateX(-Math.PI / 2); arc.userData.shared = true;
    this.guards = Array.from({ length: 2 }, () => { const m = new THREE.Mesh(arc, new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; });
    this.flare = new Map(); // monster id -> clank flare 1..0
  }
  gy(x, z) { return this.host.groundAt?.(x, z) ?? 0; }
  get fx() { return this.host.vfx?.fx; }

  /** Sea anemones on a hermit rig's shell, and its soft abdomen for when it is out (once per rig; pooled rigs keep them). */
  dress(rig) {
    if (rig.anemones || !rig.bones?.shell) return;
    // the abdomen: a soft curl of coral flesh behind its head, a dark hull behind it for the outline (shown by the
    // animator while it is out of its shell)
    const A = abdomenGeometry(), ab = new THREE.Group();
    ab.add(new THREE.Mesh(A.flesh, new THREE.MeshBasicMaterial({ color: 0xf2a48a })), new THREE.Mesh(A.hull, new THREE.MeshBasicMaterial({ color: 0x7a3426, side: THREE.BackSide })));
    ab.visible = false;
    rig.bones.head.add(ab);
    rig.abdomen = ab;
    const G = anemoneGeometry();
    const stalkMat = new THREE.MeshBasicMaterial({ color: STALK });
    const crownMat = new THREE.MeshBasicMaterial({ color: PINK_IDLE.clone(), toneMapped: false });
    rig.anemones = { crownMat, crowns: [] };
    for (const [x, y, z, lean] of SPOTS) {
      const g = new THREE.Group();
      g.position.set(x, y, z); g.rotation.set(0, 0, -lean);
      const s = new THREE.Mesh(G.stalk, stalkMat), c = new THREE.Mesh(G.crown, crownMat);
      g.add(s, c);
      rig.bones.shell.add(g);
      rig.anemones.crowns.push(c);
    }
  }

  /** The hermit's own events; true when drawn here. */
  event(e, g) {
    if (e.type === 'clawGuard') {
      // a clank on the raised claw: sparks thrown back toward the blow, a glint, a small ring
      const last = this.clankT.get(e.id) ?? -9;
      if (this.time - last < 0.15) return true;
      this.clankT.set(e.id, this.time);
      const m = g?.monsterById?.(e.id), f = m ? m.facing : Math.atan2(e.fromX - e.x, e.fromZ - e.z);
      const cx = e.x + Math.sin(f) * 0.95, cz = e.z + Math.cos(f) * 0.95, y = this.gy(cx, cz) + 0.85;
      const back = Math.atan2(e.fromX - cx, e.fromZ - cz);
      if (this.fx) for (let i = 0; i < 12; i++) { const a = back + (Math.random() - 0.5) * 1.6, v = 3 + Math.random() * 3; this.fx.add(cx, y, cz, Math.sin(a) * v, 1.5 + Math.random() * 2, Math.cos(a) * v, { color: i % 3 ? 0xfff0b0 : 0xffffff, size: 0.09, sizeEnd: 0.02, life: 0.3, gravity: 9, drag: 1.5 }); }
      this.monster.burstStar?.(cx, y, cz, 0.55, STAR, 0xffffff, 0xffd060);
      this.monster.call?.ring(cx, y, cz, 0.55, CLANK, 0.18);
      this.flare.set(e.id, 1);
      this.monster.onShake?.(0.03, 0.04);
      return true;
    }
    if (e.type === 'shellShed') {
      const s = this.shells.get(e.id);
      if (s) s.t = 0;
      return true;
    }
    if (e.type === 'shellClimb') return true;
    if (e.type === 'reshell') {
      const y = this.gy(e.x, e.z);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.4, y + 0.15, e.z + Math.cos(a) * 0.4, Math.sin(a) * 1.1, 0.5, Math.cos(a) * 1.1, 0.7, 0.45); }
      this.monster.companion?.glint(e.x, y + 1.1, e.z, 0.9, 0);
      return true;
    }
    return false;
  }

  /** The anemones' sting (core monsterSwing of anemone); true when drawn here. */
  swing(e, g) {
    if (e.type !== 'hermit_crab' || e.name !== 'anemone') return false;
    const arc = e.arc * DEG, ox = e.x + Math.sin(e.angle) * 0.6, oz = e.z + Math.cos(e.angle) * 0.6, y = this.gy(ox, oz) + 0.75;
    for (let i = 0; i < LASHES; i++) {
      const L = this.lashes[this.lashI++ % LASHES], u = LASHES > 1 ? i / (LASHES - 1) : 0.5;
      Object.assign(L, { t: 0, x: ox, y, z: oz, a: e.angle + (u - 0.5) * arc * 0.92, len: e.range * (0.85 + Math.random() * 0.2), bow: (Math.random() - 0.5) * 0.9, delay: Math.abs(u - 0.5) * 0.08 });
    }
    // stings on the hero if the cone reached them
    const p = g?.player;
    if (p && !p.dead) {
      const d = Math.hypot(p.x - e.x, p.z - e.z), off = Math.atan2(Math.sin(Math.atan2(p.x - e.x, p.z - e.z) - e.angle), Math.cos(Math.atan2(p.x - e.x, p.z - e.z) - e.angle));
      if (d <= e.range + (p.r || 0.4) && Math.abs(off) <= arc / 2) {
        const py = this.gy(p.x, p.z) + 0.9;
        if (this.fx) for (let i = 0; i < 10; i++) { const a = Math.random() * 6.283; this.fx.add(p.x, py, p.z, Math.sin(a) * 2, 1 + Math.random() * 1.5, Math.cos(a) * 2, { color: i % 2 ? PINK : 0xd8ff8a, size: 0.1, sizeEnd: 0.02, life: 0.4, gravity: 4, drag: 2 }); }
        this.monster.companion?.glint(p.x, py, p.z, 0.8, 0.05);
      }
    }
    this.monster.onShake?.(0.04, 0.06);
    return true;
  }

  /** The coral burst (core burst of area coral_burst): shards and a ring to the true edge. */
  burst(e) {
    if (e.kind !== 'coral_burst') return false;
    const y = this.gy(e.x, e.z), fx = this.fx;
    if (fx) for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, v = 3 + Math.random() * 3.5; fx.add(e.x + Math.sin(a) * 0.5, y + 0.7, e.z + Math.cos(a) * 0.5, Math.sin(a) * v, 2.5 + Math.random() * 3, Math.cos(a) * v, { color: CORAL[i % 4], size: 0.14 + Math.random() * 0.08, sizeEnd: 0.06, life: 0.7, gravity: 12, drag: 0.6 }); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; this.monster.call?.dust(e.x + Math.sin(a) * 0.6, y + 0.15, e.z + Math.cos(a) * 0.6, Math.sin(a) * 2.6, 0.4, Math.cos(a) * 2.6, 0.9, 0.5); }
    this.monster.call?.ring(e.x, y + 0.06, e.z, e.radius, RING, 0.35);
    this.monster.companion?.glint(e.x, y + 1, e.z, 1.3, 0);
    this.monster.onShake?.(0.12, 0.12);
    return true;
  }

  update(dt, g) {
    this.time += dt;
    const seen = this.seen || (this.seen = new Set()); seen.clear();
    let ng = 0;
    for (const m of g.monsters) {
      if (m.type !== 'hermit_crab') continue;
      const r = this.host.monsterRig?.(m.id);
      // its guarded front while the claw is up
      const fl = Math.max(0, (this.flare.get(m.id) || 0) - dt * 4);
      this.flare.set(m.id, fl);
      if (!m.dead && m.state === 'windup' && m.windup?.name === 'claw_guard' && ng < this.guards.length) {
        const k = Math.min(1, (3 * m.stateT) / m.windup.total), G = this.guards[ng++], R = m.r + 0.55;
        G.visible = true; G.position.set(m.x, this.gy(m.x, m.z) + 0.08, m.z); G.rotation.y = m.facing; G.scale.set(R, 1, R);
        G.material.opacity = 0.18 * k + 0.7 * fl;
      }
      if (r) {
        this.dress(r);
        // the anemones sway, and swell and glow through their wind-up
        const k = m.state === 'windup' && m.windup?.name === 'anemone' ? Math.min(1, m.stateT / m.windup.total) : 0;
        this.pose(r, k, m.id);
        // coral chips falling off the trembling shell before it sheds
        if (m.state === 'windup' && m.windup?.name === 'shell_shed' && Math.random() < 0.5) {
          const a = Math.random() * 6.283;
          this.fx?.add(m.x + Math.sin(a) * 0.5, this.gy(m.x, m.z) + 1.1, m.z + Math.cos(a) * 0.5, Math.sin(a) * 0.8, 0.5, Math.cos(a) * 0.8, { color: CORAL[(Math.random() * 4) | 0], size: 0.08, sizeEnd: 0.04, life: 0.5, gravity: 10, drag: 0.5 });
        }
      }
      // the empty shell it left
      if (!m.naked || m.dead) continue;
      seen.add(m.id);
      let s = this.shells.get(m.id);
      if (!s && this.host.takeRig) {
        const rig = this.host.takeRig('hermit_crab');
        this.host.scene.add(rig.root);
        this.dress(rig);
        // a pooled rig let go while its crab was out of its shell comes back with its body shrunk: whole again
        const B = rig.bones;
        B.body.scale.setScalar(1); B.head.position.copy(B.head.userData.rest.pos);
        for (const n of rig.legs) B[n].position.copy(B[n].userData.rest.pos);
        rig.bareOn = false; rig.abdomen.visible = false;
        // only the shell shows: the head (and with it the claws) and the legs shrunk to nothing; the soft body stays
        // inside it (shrinking the body crumpled the shell, whose rim is skinned half to the body)
        this.shrink(rig, 0.01);
        s = { rig, t: 0, scale: r ? r.root.scale.x : rig.root.scale.x, yaw: r ? r.root.rotation.y : m.naked.facing };
        this.shells.set(m.id, s);
      }
      if (!s) continue;
      s.t += dt;
      const nk = m.naked, y = this.gy(nk.x, nk.z), hop = s.t < 0.35 ? Math.sin((s.t / 0.35) * Math.PI) * 0.5 : 0;
      s.rig.root.position.set(nk.x, y + hop, nk.z);
      s.rig.root.rotation.set(Math.sin(this.time * 2.3 + m.id) * 0.03 + (nk.phase === 'climb' ? Math.sin(this.time * 18) * 0.06 : 0), s.yaw, s.t < 0.35 ? (1 - s.t / 0.35) * 0.4 : 0);
      s.rig.root.scale.setScalar(s.scale);
      this.pose(s.rig, 0, m.id);
    }
    for (let i = ng; i < this.guards.length; i++) this.guards[i].visible = false;
    for (const [id, s] of this.shells) {
      if (seen.has(id)) continue;
      this.shrink(s.rig, 1);
      this.host.releaseRig?.(s.rig);
      this.shells.delete(id);
    }
    // the lashes: out fast, a moment held, drawn back
    for (const L of this.lashes) {
      if (L.t >= 0.5) { L.m.visible = L.glow.visible = false; continue; }
      L.t += dt;
      const t = L.t - L.delay;
      if (t < 0) { L.m.visible = L.glow.visible = false; continue; }
      const out = t < 0.1 ? t / 0.1 : t < 0.22 ? 1 : Math.max(0, 1 - (t - 0.22) / 0.2);
      this.bend(L.m, L, out, 0.07);
      this.bend(L.glow, L, out, 0.17);
      L.m.visible = L.glow.visible = out > 0.01;
      L.m.material.opacity = 0.95 * Math.min(1, out * 1.5);
      L.glow.material.opacity = 0.5 * Math.min(1, out * 1.5);
    }
  }

  shrink(rig, k) {
    const b = rig.bones;
    b.head.scale.setScalar(k);
    for (const n of rig.legs) b[n].scale.setScalar(k);
  }

  pose(rig, k, seed) {
    const A = rig.anemones;
    if (!A) return;
    A.crownMat.color.copy(PINK_IDLE).lerp(PINK_HOT, k);
    for (let i = 0; i < A.crowns.length; i++) {
      const c = A.crowns[i];
      c.scale.setScalar(1 + 0.7 * k + Math.sin(this.time * (k ? 20 : 2.2) + i * 1.7 + seed) * (k ? 0.08 : 0.05));
      c.rotation.y = Math.sin(this.time * 1.3 + i + seed) * 0.3;
    }
  }

  // a tentacle of light from (x, y, z) along a for len * out, bowed sideways, sinking to the ground at its tip
  bend(mesh, L, out, width) {
    const pos = mesh.geometry.attributes.position, s = Math.sin(L.a), c = Math.cos(L.a), len = L.len * out;
    for (let j = 0; j <= SEG; j++) {
      const u = j / SEG, d = len * u, side = Math.sin(u * Math.PI) * L.bow * out + Math.sin(u * 9 + this.time * 30) * 0.05 * u;
      const x = L.x + s * d + c * side, z = L.z + c * d - s * side;
      const y = L.y * (1 - u) + (this.gy(x, z) + 0.2) * u + Math.sin(u * Math.PI) * 0.25;
      const w = width * (1 - u * 0.75);
      // the strip's two edges, square to the lash on the ground
      pos.setXYZ(j * 2, x - c * w, y, z + s * w);
      pos.setXYZ(j * 2 + 1, x + c * w, y, z - s * w);
    }
    pos.needsUpdate = true;
    void _v;
  }
}
