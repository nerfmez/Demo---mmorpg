// Revive (the priest's guardian light, owner 2026-11-02; core: a buff with `revive`, reviveFrom). Round 2
// (owner: "prettier"): built with the approved Blessing of Light's techniques (skillfx/bless-fx.js: a column of
// light carved from flowing noise, crisp twinkling stars, a lens glint, soft rings in the air) and given its
// own read - wings of light, the guardian angel that waits over you:
//   bestow: wings of gold light unfold behind the hero (feathers fanning out from the shoulders, the tips
//           trailing the arms) and fold away into it; a gold ring goes out to the true radius in the air;
//           stars pop round it; a holy circle of light (two rings, a star of eight points) turns under it;
//   wait:   over every body that carries the light a double halo turns slowly (a feather of light now and then
//           drifting down from it), breathing, fading over the light's last 3 s;
//   rising: the light catches the lethal hit - a column of light bursts UP out of the ground (streaks flowing
//           upward), a lens glint, the wings open wide from the risen body and dissolve into feathers of light
//           drifting down, stars, the holy circle under it, a short shake; the halo is gone.
// One column mesh, two circle meshes, one ribbon pair, pooled stars: light on an iPad.
import * as THREE from 'three';
import { Ribbon, mulberry32, NOISE, place } from './fx-common.js';
import { CORE_FS, GLOW_FS, W, lineW, lineGlowW, circlePoints, lightOf, starTexture, flareTexture, lightSprite } from './light-kit.js';

const LOOK = lightOf('holy');
const STARS = 28, FEATHERS = 40, WINGS = 3, HALO = 25, RING = 49, CIRCLES = 3;
const HEAD = { player: 1.5, spirit_wisp: 1.35, spirit_wolf: 1.35, spirit_alpha: 2.0, stone_guardian: 2.7, hunt_hound: 1.45, hunt_bear: 1.9, hunt_hawk: 2.6, pack_hound: 1.25 };
const out2 = (k) => 1 - (1 - k) * (1 - k);
const COLUMN_VS = `varying vec2 vUv; varying float vFres;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal); vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv; }`;
// the rising column: revealed from the ground UP to uRise with a bright front, streaks flowing upward
const COLUMN_FS = `varying vec2 vUv; varying float vFres; uniform float uT; uniform float uA; uniform float uRise;
  ${NOISE}
  void main(){
    float y = vUv.y, front = uRise - y; if (front < 0.0) discard;
    float ang = vUv.x * 6.2832;
    float n = fbm(vec2(cos(ang), sin(ang)) * 1.8 + (y * 2.2 - uT * 3.6) * vec2(0.8, 0.6));
    float streak = smoothstep(0.42, 0.78, n);
    float fadeY = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.45, 1.0, y) * 0.9);
    float rim = pow(vFres, 1.6), lead = smoothstep(0.06, 0.0, front) * (1.0 - step(0.999, uRise)) * 0.7;
    float a = ((0.12 + 0.6 * rim) * (0.55 + 0.45 * streak) + 0.35 * streak + lead) * fadeY;
    vec3 c = mix(vec3(1.0, 0.78, 0.36), vec3(1.0, 0.99, 0.93), clamp(0.35 + streak * 0.5 + lead, 0.0, 1.0));
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uA); }`;
// the holy circle on the ground: two rings and an eight-pointed star of thin lines, turning
const CIRCLE_VS = `varying vec2 vP; void main(){ vP = uv*2.0 - 1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const CIRCLE_FS = `varying vec2 vP; uniform float uA, uRot, uOpen;
  float line(float d, float w){ return 1.0 - smoothstep(w*0.5, w, abs(d)); }
  void main(){ float r = length(vP); if (r > 1.0) discard;
    float R = 0.6 + 0.35*uOpen, a = atan(vP.y, vP.x) + uRot;
    float k = line(r - R, 0.03) + 0.7*line(r - R*0.84, 0.018);
    // an eight-pointed star: two squares turned 45 degrees, drawn as lines inside the inner ring
    float star = 0.0;
    for (int i = 0; i < 2; i++) { float t = a + float(i)*0.7854; vec2 q = r*vec2(cos(t), sin(t)); float d = max(abs(q.x), abs(q.y)) - R*0.58; star = max(star, line(d, 0.022)); }
    float glow = exp(-pow((r - R)/0.1, 2.0))*0.3 + (1.0 - r)*0.06;
    float v = (k + star*0.75 + glow)*uA; if (v < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0, 0.72, 0.28)*v + vec3(1.0, 0.95, 0.8)*v*v*0.35, 1.0); }`;
let sw = 0;
const featherW = (x) => sw * Math.sin(Math.PI * Math.min(1, x * 1.1)) * (1 - 0.6 * x), featherGlowW = (x) => featherW(x) * 2.4;

export class ReviveFx {
  /** call: the CallFx (shared ground rings; unused here but kept for the director's wiring). */
  constructor(scene, camera, call) {
    this.camera = camera; this.call = call; this.rnd = mulberry32(131); this.time = 0; this.onShake = null;
    this.core = new Ribbon(scene, camera, 1600, CORE_FS, THREE.NormalBlending); this.glow = new Ribbon(scene, camera, 1600, GLOW_FS, THREE.AdditiveBlending);
    this.core.mesh.renderOrder = 11; this.glow.mesh.renderOrder = 10;
    const geo = new THREE.CylinderGeometry(0.75, 0.55, 6, 28, 1, true).translate(0, 3, 0); geo.userData.shared = true;
    this.column = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uRise: { value: 0 } }, vertexShader: COLUMN_VS, fragmentShader: COLUMN_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.column.visible = false; this.column.renderOrder = 7; scene.add(this.column);
    this.colT = 9; this.colX = 0; this.colZ = 0; this.colS = 1;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.circles = Array.from({ length: CIRCLES }, () => {
      const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ vertexShader: CIRCLE_VS, fragmentShader: CIRCLE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uRot: { value: 0 }, uOpen: { value: 0 } } }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.visible = false; scene.add(m); return { m, t: 9, life: 1.2, size: 1, x: 0, z: 0 };
    });
    this.ci = 0;
    const tex = starTexture('holy');
    this.stars = Array.from({ length: STARS }, () => ({ sp: lightSprite(scene, tex, false, 12), p: new THREE.Vector3(), vy: 0, t: 9, life: 1, size: 0.3, spin: 0 }));
    this.starI = 0;
    this.flare = lightSprite(scene, flareTexture('holy'), true, 13); this.flareT = 9; this.flareP = new THREE.Vector3(); this.flareS = 3;
    this.wings = Array.from({ length: WINGS }, () => ({ t: 9, life: 1, x: 0, y: 1, z: 0, facing: 0, span: 1, open: 0, rise: false }));
    this.wi = 0;
    this.feathers = Array.from({ length: FEATHERS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 9, life: 1.4, ph: 0, len: 0.22 }));
    this.fi = 0;
    this.rings = Array.from({ length: 2 }, () => ({ t: 9, x: 0, z: 0, R: 9, y: 0.9 }));
    this.ringPts = Array.from({ length: RING }, () => new THREE.Vector3()); this.halo = Array.from({ length: HALO }, () => new THREE.Vector3());
    this.f5 = Array.from({ length: 6 }, () => new THREE.Vector3()); this.two = [new THREE.Vector3(), new THREE.Vector3()];
    this.feTime = 0;
  }
  star(x, y, z, size, life, delay = 0, vy = -0.4) { const s = this.stars[this.starI++ % STARS]; s.p.set(x, y, z); s.vy = vy; s.t = -delay; s.life = life; s.size = size; s.spin = (this.rnd() - 0.5) * 3; }
  feather(x, y, z, vx, vy, vz, life = 1.4, len = 0.22) { const f = this.feathers[this.fi++ % FEATHERS]; f.p.set(x, y, z); f.v.set(vx, vy, vz); Object.assign(f, { t: 0, life, ph: this.rnd() * 6.283, len }); }
  circle(x, z, size, life) { const c = this.circles[this.ci++ % CIRCLES]; Object.assign(c, { t: 0, life, size, x, z }); c.m.visible = true; place(c.m, x, 0.04, z); c.m.scale.setScalar(2 * size); }
  wing(x, y, z, facing, span, life, rise) { const w = this.wings[this.wi++ % WINGS]; Object.assign(w, { t: 0, life, x, y, z, facing, span, rise }); }

  /** The rules' buff of Revive at (x, z) out to radius; facing: the hero's. */
  bestow(x, z, radius, facing = 0) {
    this.wing(x, 1.05, z, facing, 1.25, 1.3, false);
    this.circle(x, z, 1.1, 1.4);
    const r0 = this.rings[0]; Object.assign(r0, { t: 0, x, z, R: radius || 9, y: 0.9 });
    for (let i = 0; i < 9; i++) { const a = this.rnd() * 6.283, d = 0.4 + this.rnd() * 1.0; this.star(x + Math.sin(a) * d, 0.6 + this.rnd() * 2.2, z + Math.cos(a) * d, 0.4 + this.rnd() * 0.35, 0.8 + this.rnd() * 0.4, 0.05 + this.rnd() * 0.4); }
  }
  /** The rules' revive of a body at (x, z) (type: 'player' or the ally's type), facing its way. */
  rise(x, z, type, facing = 0) {
    const h = HEAD[type] || 1.6, s = Math.max(1, h / 1.5);
    this.colT = 0; this.colX = x; this.colZ = z; this.colS = s;
    this.flareT = 0; this.flareP.set(x, h * 0.6, z); this.flareS = 3.2 * s;
    this.wing(x, h * 0.72, z, facing, 1.55 * s, 1.5, true);
    this.circle(x, z, 1.4 * s, 1.6);
    for (let i = 0; i < 12; i++) { const a = this.rnd() * 6.283, d = 0.3 + this.rnd() * 0.9; this.star(x + Math.sin(a) * d, 0.4 + this.rnd() * 2.6 * s, z + Math.cos(a) * d, 0.4 + this.rnd() * 0.45, 0.7 + this.rnd() * 0.5, this.rnd() * 0.3, 0.3); }
    this.onShake?.(0.14, 0.14);
  }

  // one wing (side +1 right, -1 left) of feathers fanning from the shoulder; open 0..1
  drawWing(w, side, open, a) {
    // the wings spread across the screen (the camera's right on the ground), a little behind the body from the
    // camera, so they always open wide from the high game camera whichever way the body faces
    const m = this.camera.matrixWorld.elements, rl = Math.hypot(m[0], m[2]) || 1, sx = m[0] / rl, sz = m[2] / rl;
    const bx = -m[8] / rl * 0.2, bz = -m[10] / rl * 0.2;
    // an angel's wing: an arch from the shoulder up and out to the tip (the wing's bone), and feathers hanging
    // from it, down and out, longest at the tip (the primaries); open 0..1 spreads the arch
    const n = 7, P = this.f5, span = w.span * (0.35 + 0.65 * open);
    const at = (u, o) => { // a point on the arch at u (0 shoulder .. 1 tip): o.x across, o.y up
      o.x = side * (0.12 + span * u); o.y = 0.15 + span * (0.75 * Math.sin(Math.PI * 0.62 * u)) - span * 0.12 * u * u; return o; };
    const A = { x: 0, y: 0 }, B = { x: 0, y: 0 };
    // the arch itself, a bright edge
    for (let k = 0; k < P.length; k++) { at(k / (P.length - 1), A); P[k].set(w.x + bx + sx * A.x, w.y + A.y, w.z + bz + sz * A.x); }
    sw = 0.1 * w.span; this.glow.strip(P, featherGlowW, 0.6 * a, LOOK.glow); this.core.strip(P, (x) => sw * (1 - 0.6 * x), a, LOOK.edge);
    for (let i = 0; i < n; i++) {
      const u = 0.12 + 0.88 * (i / (n - 1));
      at(u, A);
      const ang = (0.25 + 0.5 * u) * side, len = w.span * (0.45 + 0.55 * u * u) * (0.5 + 0.5 * open); // from down, swung out toward the tip
      for (let k = 0; k < P.length; k++) {
        const t = k / (P.length - 1), cur = 0.15 * t * t * side; // the tips curl outward
        B.x = A.x + Math.sin(ang + cur) * len * t; B.y = A.y - Math.cos(ang + cur) * len * t;
        P[k].set(w.x + bx + sx * B.x, w.y + B.y, w.z + bz + sz * B.x);
      }
      sw = (0.1 + 0.05 * u) * w.span;
      this.glow.strip(P, featherGlowW, 0.5 * a, LOOK.glow); this.core.strip(P, featherW, 0.85 * a, LOOK.edge);
    }
  }

  /** bodies: [{x, z, type, t (the light's time left)}] that carry the light now. */
  update(dt, bodies) {
    this.time += dt;
    this.core.begin(); this.glow.begin();
    // the wings: unfold (overshoot), hold, then fold in (bestow) or dissolve into feathers (rise)
    for (const w of this.wings) {
      if (w.t >= w.life) continue;
      w.t += dt; const k = w.t / w.life, openT = Math.min(1, w.t / 0.22);
      let open = out2(openT) * (1 + 0.12 * Math.sin(Math.PI * openT)), a = Math.min(1, w.t / 0.08);
      if (w.rise) { a *= 1 - Math.max(0, (k - 0.45) / 0.55); if (k > 0.45 && Math.floor(w.t * 30) !== Math.floor((w.t - dt) * 30)) for (const sd of [1, -1]) { const me = this.camera.matrixWorld.elements, ml = Math.hypot(me[0], me[2]) || 1, sx = me[0] / ml * sd, sz = me[2] / ml * sd, d = 0.4 + this.rnd() * w.span; this.feather(w.x + sx * d, w.y + 0.2 + this.rnd() * w.span * 0.7, w.z + sz * d, sx * 0.4, 0.2, sz * 0.4); } }
      else { const fold = Math.max(0, (k - 0.55) / 0.45); open *= 1 - fold * fold; a *= 1 - fold * fold; }
      // a soft beat while open
      open *= 1 + 0.05 * Math.sin(w.t * 9);
      this.drawWing(w, 1, open, a); this.drawWing(w, -1, open, a);
    }
    // the ring of light going out in the air to the true radius
    for (const r of this.rings) {
      if (r.t >= 0.75) continue;
      r.t += dt; const rk = Math.min(1, r.t / 0.65);
      for (let i = 0; i < 2; i++) {
        const k = Math.min(1, Math.max(0, (r.t - i * 0.12) / 0.65)); if (k <= 0 || k >= 1) continue;
        circlePoints(this.ringPts, r.x, r.z, 0.8 + (r.R - 0.8) * out2(k), r.y);
        W.v = (i ? 0.08 : 0.14) * (1 - 0.5 * k); this.glow.strip(this.ringPts, lineGlowW, 0.35 * (1 - k), LOOK.glow); this.core.strip(this.ringPts, lineW, (i ? 0.55 : 0.9) * (1 - k * k), LOOK.edge);
      }
    }
    // the halos: two thin turning rings over the head, breathing; a feather of light drifts down now and then
    this.feTime += dt; const drift = this.feTime > 0.5; if (drift) this.feTime = 0;
    for (const b of bodies) {
      const h = HEAD[b.type] || 1.6, fade = Math.min(1, b.t / 3), br = 0.75 + 0.25 * Math.sin(this.time * 3 + b.x);
      for (let j = 0; j < 2; j++) {
        circlePoints(this.halo, b.x, b.z, (0.3 + (h > 2 ? 0.08 : 0)) * (j ? 0.78 : 1), h + 0.05 * j + 0.03 * Math.sin(this.time * 2));
        W.v = j ? 0.035 : 0.06; this.glow.strip(this.halo, lineGlowW, 0.6 * br * fade, LOOK.glow); this.core.strip(this.halo, lineW, (j ? 0.6 : 0.95) * br * fade, LOOK.edge);
      }
      if (drift && fade > 0.3) { const a = this.rnd() * 6.283; this.feather(b.x + Math.cos(a) * 0.3, h, b.z + Math.sin(a) * 0.3, 0, -0.1, 0, 1.6, 0.16); }
    }
    // feathers of light: drift down, rocking
    for (const f of this.feathers) {
      if (f.t >= f.life) continue;
      f.t += dt; const u = f.t / f.life;
      f.v.multiplyScalar(Math.max(0, 1 - dt * 1.8)); f.v.y = Math.max(f.v.y - 0.8 * dt, -0.35); f.p.addScaledVector(f.v, dt);
      const rock = Math.sin(f.t * 4 + f.ph) * 0.6, L = f.len;
      this.two[0].set(f.p.x - Math.cos(rock) * L * 0.5, f.p.y + Math.sin(rock) * L * 0.5, f.p.z); this.two[1].set(f.p.x + Math.cos(rock) * L * 0.5, f.p.y - Math.sin(rock) * L * 0.5, f.p.z);
      const P = this.f5; for (let k = 0; k < P.length; k++) P[k].lerpVectors(this.two[0], this.two[1], k / (P.length - 1));
      sw = 0.06; const a = Math.sin(Math.PI * Math.min(1, u * 1.5)) * (1 - u);
      this.glow.strip(P, featherGlowW, 0.6 * a, LOOK.glow); this.core.strip(P, featherW, a, LOOK.edge);
    }
    this.core.end(); this.glow.end();
    // the rising column
    if (this.colT < 1.0) {
      this.colT += dt; const t = this.colT, U = this.column.material.uniforms, sink = Math.max(0, (t - 0.45) / 0.55);
      this.column.visible = true; place(this.column, this.colX, 0, this.colZ);
      this.column.scale.set(this.colS * (1 - 0.6 * sink), this.colS, this.colS * (1 - 0.6 * sink));
      U.uRise.value = Math.min(1, t / 0.18); U.uT.value = this.time; U.uA.value = 1 - sink * sink;
    } else this.column.visible = false;
    // the glint
    if (this.flareT < 0.45) { this.flareT += dt; const fk = this.flareT / 0.45; this.flare.visible = true; this.flare.position.copy(this.flareP); this.flare.scale.setScalar(this.flareS * (0.5 + 0.5 * out2(Math.min(1, fk * 4))) * (1 - 0.4 * fk)); this.flare.material.opacity = 1 - fk * fk; }
    else this.flare.visible = false;
    // the holy circles
    for (const c of this.circles) {
      if (c.t >= c.life) { c.m.visible = false; continue; }
      c.t += dt; const u = c.t / c.life, U = c.m.material.uniforms;
      U.uOpen.value = out2(Math.min(1, c.t / 0.2)); U.uRot.value = c.t * 0.9; U.uA.value = Math.min(1, c.t / 0.08) * (1 - Math.max(0, (u - 0.5) / 0.5));
    }
    // the stars: pop, twinkle, drift, shrink away (as Blessing's)
    for (const s of this.stars) {
      if (s.t >= s.life) { s.sp.visible = false; continue; }
      s.t += dt; if (s.t < 0) { s.sp.visible = false; continue; }
      const k = s.t / s.life, grow = Math.min(1, k * 6), size = s.size * (grow < 1 ? grow * 1.3 : 1.3 - 0.3 * Math.min(1, (k - 1 / 6) * 4)) * (1 - k * k) * (0.85 + 0.15 * Math.sin(s.t * 22));
      s.p.y += s.vy * dt; s.sp.visible = true; s.sp.position.copy(s.p); s.sp.scale.setScalar(size); s.sp.material.rotation = s.spin * s.t; s.sp.material.opacity = 1;
    }
  }
  clear() {
    this.colT = 9; this.column.visible = false; this.flareT = 9; this.flare.visible = false;
    for (const w of this.wings) w.t = 9; for (const f of this.feathers) f.t = 9; for (const r of this.rings) r.t = 9;
    for (const c of this.circles) { c.t = 9; c.m.visible = false; } for (const s of this.stars) { s.t = s.life = 9; s.sp.visible = false; }
  }
}
