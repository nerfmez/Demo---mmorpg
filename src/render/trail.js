// A glowing ribbon that follows the real weapon while a melee skill swings. Each frame it records
// the blade (base point to tip, in world space); a segment is only drawn as bright as the tip is
// really moving, so the light appears during the strike and not during the wind-up, and its length
// and path are the weapon's own. Reuses one geometry (no allocation per frame).
import * as THREE from 'three';

const N = 20; // samples kept

export class BladeTrail {
  constructor(scene) {
    this.age = new Float32Array(N).fill(9);
    this.alpha = new Float32Array(N);
    this.base = new Float32Array(N * 3);
    this.tip = new Float32Array(N * 3);
    this.head = 0; // index of the newest sample
    this.count = 0;
    this.on = false;
    this.life = 0.2;
    this.min = 5;
    this.full = 14;
    this.last = new THREE.Vector3();
    this.hasLast = false;
    const pos = new Float32Array(N * 2 * 3);
    const a = new Float32Array(N * 2);
    const u = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      u[i * 2] = 0;
      u[i * 2 + 1] = 1;
    }
    const idx = [];
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aA', new THREE.BufferAttribute(a, 1));
    this.geo.setAttribute('aU', new THREE.BufferAttribute(u, 1));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffc24a) }, uCore: { value: new THREE.Color(0xfff3c4) }, uOpacity: { value: .85 }, uCoreWidth: { value: .22 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `attribute float aA; attribute float aU; varying float vA; varying float vU;
        void main(){ vA = aA; vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform vec3 uCore; uniform float uOpacity,uCoreWidth; varying float vA; varying float vU;
        void main(){
          float a = vA * uOpacity * smoothstep(0.0, .22, vU);
          vec3 col = mix(uColor, uCore, smoothstep(1.-max(uCoreWidth,.03), .999, vU));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Set up for a swing: cfg is a data/combat-fx.json weapon entry. Recording starts with start(). */
  begin(cfg, glow, core) {
    this.clear();
    this.life = cfg.life * (cfg.trailLife ?? 1);
    this.min = cfg.minSpeed;
    this.full = cfg.fullSpeed;
    this.mat.uniforms.uColor.value.set(glow);
    this.mat.uniforms.uCore.value.set(core);
    this.mat.uniforms.uOpacity.value = cfg.trailOpacity ?? .85;
    this.mat.uniforms.uCoreWidth.value = cfg.trailCoreWidth ?? .22;
  }

  clear() {
    this.on = false; this.hasLast = false; this.count = 0; this.head = 0;
    this.age.fill(9); this.alpha.fill(0); this.mesh.visible = false;
  }

  start() {
    this.on = true;
    this.hasLast = false;
  }

  end() {
    this.on = false;
  }

  /** baseW and tipW are world positions of the blade; dt in seconds. */
  update(dt, baseW, tipW) {
    for (let i = 0; i < N; i++) this.age[i] += dt;
    if (this.on && dt > 0) {
      const speed = this.hasLast ? this.last.distanceTo(tipW) / dt : 0;
      this.last.copy(tipW);
      this.hasLast = true;
      this.head = (this.head + 1) % N;
      this.base[this.head * 3] = baseW.x;
      this.base[this.head * 3 + 1] = baseW.y;
      this.base[this.head * 3 + 2] = baseW.z;
      this.tip[this.head * 3] = tipW.x;
      this.tip[this.head * 3 + 1] = tipW.y;
      this.tip[this.head * 3 + 2] = tipW.z;
      this.age[this.head] = 0;
      const k = Math.min(1, Math.max(0, (speed - this.min) / Math.max(0.01, this.full - this.min)));
      this.alpha[this.head] = k * k * (3 - 2 * k);
      this.count = Math.min(N, this.count + 1);
    }
    const pos = this.geo.attributes.position.array;
    const a = this.geo.attributes.aA.array;
    let any = false;
    for (let j = 0; j < N; j++) {
      // newest first, so the strip runs from the blade's current place backward in time
      const i = (this.head - j + N) % N;
      const live = j < this.count ? Math.max(0, 1 - this.age[i] / this.life) : 0;
      const al = this.alpha[i] * live * live;
      if (al > 0.01) any = true;
      const src = j < this.count ? i : this.head;
      pos[j * 6] = this.base[src * 3];
      pos[j * 6 + 1] = this.base[src * 3 + 1];
      pos[j * 6 + 2] = this.base[src * 3 + 2];
      pos[j * 6 + 3] = this.tip[src * 3];
      pos[j * 6 + 4] = this.tip[src * 3 + 1];
      pos[j * 6 + 5] = this.tip[src * 3 + 2];
      a[j * 2] = a[j * 2 + 1] = al;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
    this.mesh.visible = any;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
