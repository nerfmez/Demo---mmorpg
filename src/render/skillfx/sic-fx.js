// Sic 'Em (the hunter sends the companion at its target; core: commandCompanion, the 'sicEm' event, then the
// companion's pounce, 'companionPounce'). Research (web search, 2026-11-01; the pages themselves were blocked):
// games mark the target of an order with a head marker above it (FFXIV's headmarkers, a red reticle above the
// target in Sonic and the Black Knight), in a colour that reads on any monster - bright with a dark shadow
// (a Monster Hunter Now suggestion) - and animate the lock as it takes (Destiny, Kingdom Hearts). In the
// game's see-through light (like the companions' bites and claws):
//   order:  the hero's whistle (the call's arcs) toward the prey;
//   marker: a red chevron of light drops in over the prey's head with a squash, over a soft dark shadow, and
//           bobs and pulses while the companion runs at it; a ground reticle of three brackets closes in round
//           the prey and turns (the lock);
//   rush:   two streaks of light trail the companion as it runs in;
//   strike: when the pounce lands the chevron snaps down onto the prey and bursts (a star and lines out); if
//           the order lapses without a strike it just fades.
// Pooled (2 markers), numbers in uniforms; no allocation per frame.
import * as THREE from 'three';
import { place } from './fx-common.js';

const MARKERS = 2, TRAIL = 8;
const CORE = new THREE.Color('#ff9a7a'), RIM = new THREE.Color('#ffe8de'), HALO = new THREE.Color('#ff2a1a'), SHADOW = new THREE.Color('#2a0d10');
const RUSH = { core: [1.0, 0.86, 0.78], glow: [1.0, 0.3, 0.18] };

// the chevron (pointing down), as two arms from the tip; inflate grows every edge
function chevron(inflate) {
  const pos = [], d = inflate, T = 0.17 + 2 * d;
  const arm = (sx) => {
    const ax = 0, ay = -0.32 - d * 1.6, bx = sx * (0.5 + d), by = 0.32 + d, L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L * T / 2, ny = (bx - ax) / L * T / 2;
    pos.push(ax - nx, ay - ny, 0, bx - nx, by - ny, 0, bx + nx, by + ny, 0, ax - nx, ay - ny, 0, bx + nx, by + ny, 0, ax + nx, ay + ny, 0);
  };
  arm(-1); arm(1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.userData.shared = true;
  return g;
}
const RET_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// three bracket arcs at the reticle's radius (uR, 0..1 of the plane), turning (uRot), with a soft halo
const RET_FS = `varying vec2 vP; uniform float uR, uRot, uA; uniform vec3 uC;
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float a = atan(vP.y, vP.x) + uRot, seg = fract(a / 2.0944);
    float on = smoothstep(0.0, 0.04, seg) * (1.0 - smoothstep(0.62, 0.66, seg));
    float d = abs(r - uR), line = (1.0 - smoothstep(0.02, 0.045, d)) * on, halo = exp(-d*d*120.0) * 0.45 * on;
    float k = (line + halo) * uA; if (k < 0.01) discard; gl_FragColor = vec4(uC * k, 1.0); }`;

export class SicFx {
  /** host: the CompanionFx (its glints, strokes and ribbons, and the call's whistle and locate). */
  constructor(scene, camera, host) {
    this.camera = camera; this.host = host; this.preyOf = null; // preyOf(id): the monster now
    const geos = [chevron(0.12), chevron(0.06), chevron(0.022), chevron(0)]; // shadow, halo, rim, core
    const quad = new THREE.PlaneGeometry(1, 1);
    this.markers = Array.from({ length: MARKERS }, () => {
      const root = new THREE.Group(), mats = [];
      geos.forEach((g, i) => {
        const m = new THREE.MeshBasicMaterial({ color: [SHADOW, HALO, RIM, CORE][i], transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: i === 0 ? THREE.NormalBlending : THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 14 + i; mesh.frustumCulled = false; root.add(mesh); mats.push(m);
      });
      root.visible = false; scene.add(root);
      const ret = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: RET_VS, fragmentShader: RET_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uR: { value: 1 }, uRot: { value: 0 }, uA: { value: 0 }, uC: { value: HALO.clone() } } }));
      ret.rotation.x = -Math.PI / 2; ret.renderOrder = 3; ret.visible = false; scene.add(ret);
      return { root, mats, ret, t: 99, end: 0, ally: 0, prey: 0, x: 0, y: 1.8, z: 0, burst: false, trail: Array.from({ length: TRAIL }, () => new THREE.Vector3()), tn: 0 };
    });
  }
  /** The rules' sicEm: e.id the companion, e.target its prey. */
  order(e, hero) {
    const m = this.markers.find((q) => q.t >= 90) || this.markers.find((q) => q.ally === e.id) || this.markers[0];
    Object.assign(m, { t: 0, end: 0, ally: e.id, prey: e.target, x: e.tx, z: e.tz, burst: false, tn: 0 });
    m.root.visible = true; m.ret.visible = true;
    // the whistle toward the prey
    const arcs = this.host.call.arcs, dir = Math.atan2(e.tx - hero.x, e.tz - hero.z);
    for (let i = 0; i < 2; i++) { const a = arcs.find((q) => q.t >= 0.6) || arcs[i]; Object.assign(a, { t: -i * 0.08, x: hero.x, y: 1.15, z: hero.z, dir }); }
  }
  /** The rules' companionPounce: the marker snaps onto the prey and bursts. */
  pounced(id) { const m = this.markers.find((q) => q.ally === id && q.t < 90 && !q.end); if (m) { m.burst = true; m.end = m.t; } }

  update(dt, core, glow) {
    const q = this.camera.quaternion;
    for (const m of this.markers) {
      if (m.t >= 90) continue;
      m.t += dt; const t = m.t;
      const prey = this.preyOf?.(m.prey), ally = this.host.call.locate?.(m.ally);
      if (prey && !prey.dead) { m.x = prey.x; m.z = prey.z; m.y = 1.5 + (prey.r || 0.5) * 0.8; }
      // the order lapsed (no strike): fade out
      if (!m.end && (!ally || !ally.sic || !prey || prey.dead)) m.end = t;
      const e = m.end ? t - m.end : 0, life = m.burst ? 0.22 : 0.3;
      if (m.end && e >= life) { m.t = 99; m.root.visible = false; m.ret.visible = false; continue; }
      // the chevron: drops in with a squash, bobs, pulses; on the strike it snaps down and swells away
      const drop = Math.min(1, t / 0.14), land = t < 0.14 ? 1.5 - 0.5 * drop : 1 - 0.25 * Math.sin(Math.min(1, (t - 0.14) / 0.12) * Math.PI);
      let y = m.y + 0.9 * (1 - drop) ** 2 + 0.07 * Math.sin(t * 7), sx = 0.6, sy = 0.6 * land, a = Math.min(1, t / 0.08);
      if (m.burst) { const k = e / life; y -= 0.6 * Math.min(1, k * 3); sx *= 1 + 0.8 * k; sy = sx; a *= 1 - k; }
      else if (m.end) a *= 1 - e / life;
      const pulse = 0.85 + 0.15 * Math.sin(t * 10);
      place(m.root, m.x, y, m.z); m.root.quaternion.copy(q); m.root.scale.set(sx, sy, 1);
      const [shadow, halo, rim, c] = m.mats; shadow.opacity = 0.4 * a; halo.opacity = 0.6 * a * pulse; rim.opacity = 0.5 * a; c.opacity = 0.75 * a;
      // the ground reticle: closes in round the prey, turning
      const lock = Math.min(1, t / 0.25), U = m.ret.material.uniforms;
      place(m.ret, m.x, 0.05, m.z); m.ret.scale.setScalar(2 * (1.6 - 0.6 * lock * lock) * (m.burst ? 1 + e * 2 : 1));
      U.uR.value = 0.92; U.uRot.value = t * 2.2; U.uA.value = a * (0.5 + 0.5 * lock);
      // the rush: two streaks of light trail the companion while it runs in
      if (ally && !m.end) {
        const h = ally.type === 'hunt_hawk' ? 1.8 : 0.55, tr = m.trail;
        if (m.tn === 0) for (const p of tr) p.set(ally.x, h, ally.z);
        for (let i = TRAIL - 1; i > 0; i--) tr[i].copy(tr[i - 1]); tr[0].set(ally.x, h, ally.z); m.tn++;
        const moved = tr[0].distanceTo(tr[TRAIL - 1]);
        if (moved > 0.6) { this.host.rush(tr, 0.12, RUSH, core, glow); this.host.rush(tr, -0.12, RUSH, core, glow); }
      }
    }
  }
  clear() { for (const m of this.markers) { m.t = 99; m.root.visible = false; m.ret.visible = false; } }
}
