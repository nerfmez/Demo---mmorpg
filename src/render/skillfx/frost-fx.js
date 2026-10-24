// Frost Nova: clean cel ground frost racing out to the real radius, clustered hexagonal
// crystals popping behind the front, mist riding it, chips, frozen crust on hit dummies,
// then the frost recedes inward. Charge starts on castStart, the burst on the core 'nova' event.
import * as THREE from 'three';
import { mulberry32, clamp01, NOISE, BILLBOARD_VS, addLight, fxGround, place, conformPlane } from './fx-common.js';

const SPREAD = 0.38, MELT0 = 1.25, MELT1 = 2.15, END = 2.4, CHIPS = 260;

// Ground frost, anime style: a flat cel decal with a clean scalloped edge, a bright rim band,
// and flat tones, with no lines inside. It melts by receding inward.
const frostFS = `varying vec2 vP; uniform float uR; uniform float uMelt; uniform float uEdgeGlow; uniform float uS;
  uniform float uElem; vec3 retint(vec3 c){ if(uElem<0.5) return c; float l=dot(c,vec3(0.3,0.59,0.11)); vec3 lo=uElem<1.5?vec3(0.72,0.16,0.04):vec3(0.2,0.42,0.08); vec3 hi=uElem<1.5?vec3(1.0,0.88,0.55):vec3(0.8,1.0,0.5); return mix(lo,hi,smoothstep(0.3,1.0,l)); }
  void main(){
    vec2 q = vP / uS;
    float r = length(q), ang = atan(q.y, q.x);
    float R = uR / uS;
    // eleven soft scallops with a short point between each pair
    float sc = abs(sin(ang * 5.5 + 0.7));
    float edge = R * (0.86 + 0.07 * sc + 0.05 * pow(1.0 - sc, 6.0)) * (1.0 - 0.85 * uMelt * uMelt);
    if (r > edge || R < 0.01) discard;
    float e = edge - r; // distance in from the edge
    vec3 fill = vec3(0.70, 0.88, 0.98), lite = vec3(0.88, 0.97, 1.0);
    vec3 c = fill; float a = 0.8;
    if (e < 0.32) { c = lite; a = 0.9; }                   // rim band
    if (e < 0.07) { c = vec3(0.42, 0.70, 0.92); a = 0.95; } // thin outline, same hue
    a *= mix(1.0, 0.75, step(0.5, uMelt)) * (0.85 + 0.15 * uEdgeGlow);
    gl_FragColor = vec4(retint(c), a); }`;
const mistFS = `varying vec2 vUv; uniform float uT; uniform float uSeed; ${NOISE}
  uniform float uElem; vec3 retint(vec3 c){ if(uElem<0.5) return c; float l=dot(c,vec3(0.3,0.59,0.11)); vec3 lo=uElem<1.5?vec3(0.72,0.16,0.04):vec3(0.2,0.42,0.08); vec3 hi=uElem<1.5?vec3(1.0,0.88,0.55):vec3(0.8,1.0,0.5); return mix(lo,hi,smoothstep(0.3,1.0,l)); }
  void main(){ vec2 p=vUv; float r=length(p);
    float n = fbm(p*1.6 + uSeed + vec2(uT*0.8, -uT*0.5));
    float body = n*1.25 - r*0.95 - uT*0.55;
    if (body < 0.05) discard;
    vec3 c = body > 0.3 ? vec3(0.96,0.99,1.0) : vec3(0.72,0.88,0.98);
    gl_FragColor = vec4(retint(c), body > 0.3 ? 0.8 : 0.5); }`;

function crystalGeo(seed) {
  const r = mulberry32(seed), n = 6, pos = [], bar = [];
  const shoulder = 0.62 + r() * 0.14, low = [], high = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + (r() - 0.5) * 0.25, rr = 0.85 + r() * 0.3;
    low.push([Math.cos(a) * rr, -0.25, Math.sin(a) * rr]);
    const t = 0.82 + r() * 0.12;
    high.push([Math.cos(a) * rr * t, shoulder + (r() - 0.5) * 0.08, Math.sin(a) * rr * t]);
  }
  const tip = [(r() - 0.5) * 0.25, 1.0, (r() - 0.5) * 0.25];
  const tri = (a, b, c, hide) => {
    pos.push(...a, ...b, ...c);
    const B = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    if (hide >= 0) for (const v of B) v[hide] += 1;
    for (const v of B) bar.push(...v);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(low[i], high[i], low[j], 0);
    tri(high[i], high[j], low[j], 1);
    tri(high[i], tip, high[j], -1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('bary', new THREE.Float32BufferAttribute(bar, 3));
  g.computeVertexNormals();
  return g;
}

const compact = (arr, alive) => { let w = 0; for (const x of arr) if (alive(x)) arr[w++] = x; arr.length = w; };

export class FrostFx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.geos = Array.from({ length: 8 }, (_, i) => crystalGeo(40 + i));
    // Fire/Poison Shift keep the nova's shapes and recolour them (0 cold, 1 fire, 2 poison)
    this.elem = { value: 0 };
    this.iceMat = new THREE.ShaderMaterial({
      uniforms: { uElem: this.elem },
      vertexShader: `attribute vec3 bary; varying vec3 vB; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP;
        void main(){ vB=bary; vY=position.y; vP=position;
          vec4 w = modelMatrix*vec4(position,1.0);
          vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vB; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP;
        uniform float uElem; vec3 retint(vec3 c){ if(uElem<0.5) return c; float l=dot(c,vec3(0.3,0.59,0.11)); vec3 lo=uElem<1.5?vec3(0.72,0.16,0.04):vec3(0.2,0.42,0.08); vec3 hi=uElem<1.5?vec3(1.0,0.88,0.55):vec3(0.8,1.0,0.5); return mix(lo,hi,smoothstep(0.3,1.0,l)); }
        void main(){
          vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
          vec3 L = normalize(vec3(-0.35, 0.8, 0.5));
          float ndl = dot(N, L);
          vec3 deep = vec3(0.16,0.40,0.70), mid = vec3(0.42,0.75,0.95), lite = vec3(0.84,0.96,1.0);
          vec3 c = mix(deep, mid, smoothstep(-0.2, 0.3, ndl));
          c = mix(c, lite, smoothstep(0.35, 0.8, ndl));
          c = mix(c, deep*0.85, (1.0 - smoothstep(-0.25, 0.25, vY)) * 0.7);
          c = mix(c, vec3(1.0), smoothstep(0.75, 1.0, vY) * 0.35);
          float fr = abs(fract(dot(vP, vec3(2.3, 1.1, 1.7)) + 0.13) - 0.5);
          c = mix(c, lite, (1.0 - smoothstep(0.0, 0.035, fr)) * 0.45 * step(0.0, ndl + 0.3));
          float strip = abs(fract(vY*1.6 + vP.x*0.8) - 0.5);
          c = mix(c, vec3(1.0), (1.0 - smoothstep(0.05, 0.08, strip)) * step(0.4, ndl) * 0.6);
          float e = min(min(vB.x, vB.y), vB.z);
          c = mix(c, vec3(0.93,0.99,1.0), (1.0 - smoothstep(0.0, 0.07, e)) * 0.45);
          float rim = 1.0 - max(dot(N, normalize(vV)), 0.0);
          c = mix(c, vec3(0.9,0.98,1.0), smoothstep(0.5, 0.95, rim) * 0.55);
          gl_FragColor = vec4(retint(c), 0.88); }`,
      transparent: true,
    });
    this.rimMat = new THREE.MeshBasicMaterial({ color: '#7dbde6', side: THREE.BackSide, transparent: true, opacity: 0.55, depthWrite: false });
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.chipMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.06), new THREE.MeshToonMaterial({ color: '#d8f3ff', emissive: '#25506f' }), CHIPS);
    this.chipMesh.frustumCulled = false; this.chipMesh.count = 0; scene.add(this.chipMesh);
    this.light = addLight(scene, new THREE.PointLight('#bfe9ff', 0, 7, 1.6));
    this.novas = []; this.chips = []; this.rnd = mulberry32(5); this.time = 0; this.o = new THREE.Object3D();
    // ice chips come from a fixed pool (no allocation while they fly)
    this.chipPool = Array.from({ length: CHIPS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: 0, life: 0, max: 1, s: 1, inward: false }));
    this.chipFree = [...this.chipPool];
    this.chipAlive = (c) => c.life < c.max || (this.chipFree.push(c), false);
    this.novaAlive = (n) => !n.dead;
  }
  setElement(element) {
    const k = element === 'fire' ? 1 : element === 'poison' ? 2 : 0;
    if (k === this.elem.value) return;
    this.elem.value = k;
    const [rim, chip, glow, light] = [['#7dbde6', '#d8f3ff', '#25506f', '#bfe9ff'], ['#e8743a', '#ffd9a0', '#6f2a10', '#ffb070'], ['#7fbf4a', '#e2ffb8', '#2d5a14', '#c8ff9a']][k];
    this.rimMat.color.set(rim); this.chipMesh.material.color.set(chip); this.chipMesh.material.emissive.set(glow); this.light.color.set(light);
  }
  makeNova(x, z, radius, strength) {
    const r = this.rnd;
    const root = place(new THREE.Group(), x, 0, z); this.scene.add(root);
    const S = radius / 4.2;
    const mat = new THREE.ShaderMaterial({ uniforms: { uR: { value: 0 }, uMelt: { value: 0 }, uEdgeGlow: { value: 1 }, uS: { value: S }, uElem: this.elem },
      vertexShader: `varying vec2 vP; uniform float uS; void main(){ vP=(uv*2.0-1.0)*6.0*uS; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: frostFS, transparent: true, depthWrite: false });
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(12 * S, 12 * S, 24, 24), mat);
    frost.rotation.x = -Math.PI / 2; frost.renderOrder = 1; root.add(frost);
    conformPlane(frost, 0.012 + this.novas.length * 0.002); // over the real ground (slopes)
    const mists = [];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.quad, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: r() * 50 }, uElem: this.elem }, vertexShader: BILLBOARD_VS, fragmentShader: mistFS, transparent: true, depthWrite: false }));
      m.renderOrder = 4; m.visible = false; root.add(m);
      mists.push({ m, a: (i / 18) * 6.283 + (r() - 0.5) * 0.3, reach: 0.75 + r() * 0.3, size: (0.9 + r() * 0.8) * Math.max(0.7, S), delay: r() * 0.06, life: 0.55 + r() * 0.3, lift: 0.2 + r() * 0.5 });
    }
    const n = { root, frost, mat, mists, shards: [], radius, S, strength, t: 0, burstAt: null, charge: 0, done: new Set() };
    this.novas.push(n);
    return n;
  }
  addShard(n, lx, lz, tArr, size, height, tilt, breakAt, seed) {
    const r = mulberry32(seed);
    const piv = new THREE.Group(), o = n.root.position; piv.position.set(lx, fxGround.y(o.x + lx, o.z + lz) - o.y, lz); // on the ground under it
    const m = new THREE.Group();
    piv.rotation.set(0, Math.atan2(lx, lz) + (r() - 0.5) * 0.6, 0);
    const count = height > 0.5 ? 1 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2);
    for (let i = 0; i < count; i++) {
      const c = new THREE.Mesh(this.geos[(seed + i * 3) % 8], this.iceMat);
      const o = new THREE.Mesh(c.geometry, this.rimMat); o.scale.setScalar(1.045); c.add(o);
      const k = i === 0 ? 1 : 0.4 + r() * 0.3, w = size / height;
      c.scale.set(w * (i ? 0.85 : 1), k, w * (i ? 0.85 : 1));
      const sa = r() * 6.283;
      c.position.set(i ? Math.cos(sa) * w * 1.2 : 0, 0, i ? Math.sin(sa) * w * 1.2 : 0);
      c.rotation.set(i ? tilt * 0.4 + (r() - 0.5) * 0.9 : tilt, r() * 6.28, i ? (r() - 0.5) * 1.2 : (r() - 0.5) * 0.3);
      m.add(c);
    }
    piv.add(m); piv.visible = false; n.root.add(piv);
    n.shards.push({ piv, m, tArr, size, height, breakAt, x: lx, z: lz, charge: tArr < 0 });
  }
  // castStart: motes spiral in and small crystals bud at the caster's feet
  beginCharge(x, z, total, radius) {
    const n = this.makeNova(x, z, radius, 1);
    n.chargeTotal = Math.max(0.05, total);
    const r = this.rnd;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283 + r(), rr = 0.45 + r() * 0.25; this.addShard(n, Math.sin(a) * rr, Math.cos(a) * rr, -n.chargeTotal + 0.05 + i * 0.03, 0.05 + r() * 0.04, 0.18 + r() * 0.2, 0.7, 0.25 + r() * 0.15, 100 + i + Math.floor(this.time * 10)); }
    this.pendingCharge = n;
  }
  // core 'nova' event. targets: [{x, z}] of dummies hit (for the frozen crust)
  burst(x, z, radius, targets, strength = 1) {
    let n = this.pendingCharge;
    if (!n || n.burstAt !== null || Math.hypot(n.root.position.x - x, n.root.position.z - z) > 1 || Math.abs(n.radius - radius) > 0.01) n = this.makeNova(x, z, radius, strength);
    this.pendingCharge = null;
    n.burstAt = n.t;
    const r = this.rnd, R = radius;
    const arrive = (d) => SPREAD * (1 - Math.cbrt(1 - Math.min(0.999, d / R)));
    const local = targets.map((t) => [t.x - x, t.z - z]);
    let placed = 0, guard = 0;
    const want = Math.round(60 * Math.min(1.4, R / 4.2) * strength);
    while (placed < want && guard++ < 2000) {
      const a = r() * 6.283;
      const rr = r() < 0.35 ? R * (0.83 + r() * 0.18) : R * (0.18 + Math.sqrt(r()) * 0.71);
      const lx = Math.sin(a) * rr, lz = Math.cos(a) * rr;
      if (local.some(([tx, tz]) => Math.hypot(tx - lx, tz - lz) < 0.6)) continue;
      const near = rr > R * 0.8;
      const size = near ? 0.06 + r() * 0.05 : 0.1 + r() * 0.12;
      const height = (near ? 0.35 + r() * 0.45 : 0.55 + r() * 1.1 * (1 - rr / (R * 1.43))) * (0.75 + 0.25 * strength);
      this.addShard(n, lx, lz, arrive(rr) + r() * 0.03, size, height, 0.35 + r() * 0.55, 0.75 + r() * 0.5 + rr * 0.04, placed + 1 + Math.floor(this.time * 100));
      placed++;
    }
    local.forEach(([tx, tz], k) => {
      const d = Math.hypot(tx, tz), rk = mulberry32(300 + k + Math.floor(this.time * 10));
      for (let i = 0; i < 5; i++) {
        const a = rk() * 6.283, rr = 0.28 + rk() * 0.12;
        this.addShard(n, tx + Math.sin(a) * rr, tz + Math.cos(a) * rr, arrive(Math.min(d, R)) + 0.02 + i * 0.015, 0.06 + rk() * 0.05, 0.3 + rk() * 0.35, -0.35 - rk() * 0.3, 1.6 + rk() * 0.3, 200 + k * 10 + i);
      }
      n.targetsHit = (n.targetsHit || []).concat([{ x: tx + x, z: tz + z, at: arrive(Math.min(d, R)) }]);
    });
  }
  chipBurst(x, y, z, count, speed, up, s) {
    const r = this.rnd;
    for (let i = 0; i < count && this.chips.length < CHIPS; i++) {
      const a = r() * 6.283;
      const c = this.chipFree.pop(); if (!c) break;
      c.p.set(x, y, z); c.v.set(Math.sin(a) * speed * (0.4 + r()), up * (0.5 + r()), Math.cos(a) * speed * (0.4 + r())); c.rot.set(r() * 6, r() * 6, r() * 6);
      c.spin = 6 + r() * 14; c.life = 0; c.max = 0.45 + r() * 0.4; c.s = s * (0.5 + r()); c.inward = false;
      this.chips.push(c);
    }
  }
  update(dt) {
    this.time += dt;
    let lightK = 0, lightPos = null;
    for (const n of this.novas) {
      n.t += dt;
      const ox = n.root.position.x, oz = n.root.position.z;
      if (n.burstAt === null) {
        // charging
        const c = clamp01(n.t / n.chargeTotal);
        n.mat.uniforms.uR.value = (0.25 + 0.55 * c) * n.S;
        if (Math.floor(n.t / 0.025) !== Math.floor((n.t - dt) / 0.025) && this.chips.length < CHIPS) {
          const r = this.rnd, a = r() * 6.283, rr = 1.6 + r() * 0.8;
          const q = this.chipFree.pop();
          if (q) {
            q.p.set(ox + Math.sin(a) * rr, 0.3 + r() * 1.2, oz + Math.cos(a) * rr); q.v.set(-Math.sin(a + 0.6) * rr * 4.5, -0.6, -Math.cos(a + 0.6) * rr * 4.5); q.rot.set(0, 0, 0);
            q.spin = 10; q.life = 0; q.max = 0.22; q.s = 0.6; q.inward = true;
            this.chips.push(q);
          }
        }
        for (const s of n.shards) this.shardPose(s, n.t - n.chargeTotal, 1e9);
        if (lightK < 2 * c) { lightK = 2 * c; lightPos = n.root.position; }
        if (n.t > n.chargeTotal + 1) n.dead = true; // the cast was cancelled
        continue;
      }
      const t = n.t - n.burstAt, R = n.radius;
      if (!n.done.has('burst')) { n.done.add('burst'); this.chipBurst(ox, 0.4, oz, Math.round(26 * n.strength), 6.5 * n.S, 4.5, 1.0); }
      const front = R * (1 - Math.pow(1 - Math.min(1, t / SPREAD), 3));
      n.mat.uniforms.uR.value = Math.max(0.8 * n.S, front);
      n.mat.uniforms.uMelt.value = clamp01((t - MELT0) / (MELT1 - MELT0));
      n.mat.uniforms.uEdgeGlow.value = t < SPREAD ? 1 : Math.max(0, 1 - (t - SPREAD) / 0.3);
      n.frost.visible = t < MELT1;
      for (const s of n.shards) {
        const at = s.charge ? s.tArr + n.chargeTotal - n.burstAt : s.tArr;
        this.shardPose(s, t - at, t - s.breakAt);
        if (t >= s.breakAt && !n.done.has(s)) { n.done.add(s); this.chipBurst(ox + s.x, s.height * 0.5, oz + s.z, 3, 1.6, 2.5, s.size * 7); }
      }
      for (const h of n.targetsHit || []) if (t >= h.at && !n.done.has(h)) { n.done.add(h); this.chipBurst(h.x, 1.0, h.z, 10, 2.5, 3.5, 0.9); }
      for (const p of n.mists) {
        const age = t - p.delay;
        if (age < 0 || age > p.life) { p.m.visible = false; continue; }
        const u = age / p.life, rr = R * (1 - Math.pow(1 - Math.min(1, (age + p.delay) / SPREAD), 3)) * p.reach;
        p.m.visible = true;
        p.m.position.set(Math.sin(p.a) * rr, 0.35 + p.lift * u, Math.cos(p.a) * rr);
        p.m.scale.setScalar(p.size * (0.6 + 0.7 * u));
        p.m.quaternion.copy(this.camera.quaternion);
        p.m.material.uniforms.uT.value = u;
      }
      const k = 9 * Math.exp(-t * 7) * n.strength;
      if (k > lightK) { lightK = k; lightPos = n.root.position; }
      if (t > END) n.dead = true;
    }
    for (const n of this.novas) if (n.dead) this.disposeNova(n);
    compact(this.novas, this.novaAlive);
    this.light.intensity = lightK;
    if (lightPos) place(this.light, lightPos.x, 1.2, lightPos.z);

    for (const c of this.chips) {
      c.life += dt;
      if (!c.inward) { c.v.y -= 12 * dt; c.v.multiplyScalar(1 - 1.5 * dt); }
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.03) { c.p.y = 0.03; c.v.multiplyScalar(0.3); c.v.y = Math.abs(c.v.y) * 0.4; }
      c.rot.x += c.spin * dt; c.rot.y += c.spin * 0.7 * dt;
    }
    compact(this.chips, this.chipAlive);
    let i = 0;
    for (const c of this.chips) {
      const u = c.life / c.max;
      place(this.o, c.p.x, c.p.y, c.p.z); this.o.rotation.copy(c.rot); this.o.scale.setScalar(c.s * (u > 0.7 ? (1 - u) / 0.3 : 1));
      this.o.updateMatrix(); this.chipMesh.setMatrixAt(i++, this.o.matrix);
    }
    this.chipMesh.count = i; this.chipMesh.instanceMatrix.needsUpdate = true;
  }
  // pop with overshoot as the front passes, sink and shatter later
  shardPose(s, age, sinceBreak) {
    let k = 0;
    if (age >= 0) {
      const g = clamp01(age / 0.075);
      k = g < 1 ? (1.2 * Math.sin(g * Math.PI * 0.62)) / Math.sin(Math.PI * 0.62) : 1 + 0.2 * Math.exp(-(age - 0.075) * 30) * Math.cos((age - 0.075) * 50);
      if (sinceBreak > 0) k *= Math.max(0, 1 - sinceBreak / 0.12);
    }
    s.piv.visible = k > 0.01;
    s.m.scale.set(s.height * Math.max(0.35, k), s.height * k, s.height * Math.max(0.35, k));
  }
  disposeNova(n) {
    n.root.removeFromParent();
    n.frost.geometry.dispose(); n.mat.dispose();
    for (const p of n.mists) p.m.material.dispose();
  }
  clear() { for (const n of this.novas) this.disposeNova(n); this.novas = []; for (const c of this.chips) this.chipFree.push(c); this.chips.length = 0; this.pendingCharge = null; }
  get busy() { return this.novas.length > 0 || this.chips.length > 0; }
}
