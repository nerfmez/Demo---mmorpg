// Claw and talon marks drawn as see-through light, the same way as the wolf's bite (skillfx/bite-fx.js;
// owner, 2026-11-01: "do the other two like this"): each mark is a solid curved slash shape - pointed at both
// ends, swelling toward its leading third - made of added light, lit on its outer edge and shaded on its
// inner (two toon tones), with a thin bright rim and a wider coloured halo. It wipes in along its length in a
// few frames (the claw passing), swells a little on the impact (squash and stretch), and its tail follows it
// out. The bear rakes with three, the eagle crosses two; the eagle's dive tears three red ones.
// Original shapes; pooled (12 marks, 3 shared geometries, one shader program; numbers in uniforms).
import * as THREE from 'three';

const MARKS = 12;
const IVORY = new THREE.Color('#fffaf2'), SHADE = new THREE.Color('#ecd9c6');
const VS = `attribute float aU; varying float vU; varying vec3 vC;
  void main(){ vU = aU; vC = color; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const FS = `varying float vU; varying vec3 vC; uniform float uHead, uTail, uA, uVC; uniform vec3 uTint;
  void main(){
    float k = smoothstep(uTail, uTail + 0.08, vU) * (1.0 - smoothstep(uHead - 0.06, uHead, vU));
    if (k < 0.01) discard;
    gl_FragColor = vec4(mix(uTint, vC, uVC), uA*k); }`;

// one slash shape, 2 units long along x (u 0 -> 1), bowed up by `bow`; inflate grows every edge
function slashShape(inflate) {
  const pos = [], col = [], us = [], N = 22, d = inflate, bow = 0.22, W = 0.13;
  const at = (u) => { const x = (u - 0.5) * 2, y = bow * (1 - (2 * u - 1) ** 2); return [x, y]; };
  const width = (u) => W * Math.pow(Math.sin(Math.PI * u), 0.75) * (0.75 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.5)));
  const vert = (x, y, c, u) => { pos.push(x, y, 0); col.push(c.r, c.g, c.b); us.push(u); };
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const [x0, y0] = at(u0), [x1, y1] = at(u1);
    // the normal of the centre line (pointing out of the bow: the outer, lit side)
    const tx = x1 - x0, ty = y1 - y0, L = Math.hypot(tx, ty), nx = -ty / L, ny = tx / L;
    const w0 = width(u0) + d, w1 = width(u1) + d, e0 = i === 0 ? d * 1.5 : 0, e1 = i === N - 1 ? d * 1.5 : 0;
    const ax = x0 - e0, bx = x1 + e1;
    // outer half (lit) and inner half (shaded)
    vert(ax, y0, IVORY, u0); vert(bx, y1, IVORY, u1); vert(bx + nx * w1, y1 + ny * w1, IVORY, u1);
    vert(ax, y0, IVORY, u0); vert(bx + nx * w1, y1 + ny * w1, IVORY, u1); vert(ax + nx * w0, y0 + ny * w0, IVORY, u0);
    vert(ax, y0, SHADE, u0); vert(bx - nx * w1, y1 - ny * w1, SHADE, u1); vert(bx, y1, SHADE, u1);
    vert(ax, y0, SHADE, u0); vert(ax - nx * w0, y0 - ny * w0, SHADE, u0); vert(bx - nx * w1, y1 - ny * w1, SHADE, u1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  g.userData.shared = true;
  return g;
}

export class ClawFx {
  constructor(scene, camera) {
    this.camera = camera;
    const geos = [slashShape(0.09), slashShape(0.022), slashShape(0)]; // halo, rim, fill
    this.marks = Array.from({ length: MARKS }, () => {
      const root = new THREE.Group(), mats = [];
      geos.forEach((g, i) => {
        const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
          uniforms: { uHead: { value: 0 }, uTail: { value: 0 }, uA: { value: 1 }, uVC: { value: i === 2 ? 1 : 0 }, uTint: { value: new THREE.Color() } } });
        const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 12 + i; mesh.frustumCulled = false; root.add(mesh); mats.push(m);
      });
      root.visible = false; scene.add(root);
      return { root, mats, t: 9, delay: 0, life: 0.34, wipe: 0.06, len: 1, wid: 1, angle: 0, flip: 1, alpha: 1 };
    });
    this.markI = 0;
  }
  /**
   * A mark centred at (x, y, z) on the screen's plane: len its half-length (m), wid its width scale, angle its
   * slope on the screen (rad), flip -1 to bow the other way, halo and rim its colours (THREE.Color), delay s.
   */
  mark(x, y, z, len, wid, angle, flip, halo, rim, delay = 0, life = 0.34, alpha = 1) {
    const k = this.marks[this.markI++ % MARKS];
    k.root.position.set(x, y, z); Object.assign(k, { t: -delay, len, wid, angle, flip, life, alpha, wipe: 0.06 });
    k.mats[0].uniforms.uTint.value.copy(halo); k.mats[1].uniforms.uTint.value.copy(rim);
    k.root.visible = false;
  }
  update(dt) {
    const q = this.camera.quaternion;
    for (const k of this.marks) {
      if (k.t >= k.life) { k.root.visible = false; continue; }
      k.t += dt; if (k.t < 0) continue;
      k.root.visible = true;
      const t = k.t, head = Math.min(1.08, t / k.wipe * 1.08), tail = Math.max(0, (t - k.wipe * 1.6) / (k.life - k.wipe * 1.6)) ** 1.4;
      // squash and stretch: long and thin as it wipes, swelling a little on the impact, then settling
      const sw = t < k.wipe ? 0.75 : 1 + 0.35 * Math.max(0, 1 - (t - k.wipe) / 0.08);
      const a = k.alpha * (1 - Math.max(0, (t / k.life - 0.65) / 0.35));
      k.root.quaternion.copy(q); k.root.rotateZ(k.angle);
      k.root.scale.set(k.len, k.len * k.wid * sw * k.flip, 1);
      const [halo, rim, fill] = k.mats;
      for (const m of k.mats) { m.uniforms.uHead.value = head; m.uniforms.uTail.value = tail; }
      fill.uniforms.uA.value = 0.5 * a; rim.uniforms.uA.value = 0.45 * a; halo.uniforms.uA.value = 0.45 * a; // the halo carries the colour
    }
  }
  clear() { for (const k of this.marks) { k.t = 9; k.root.visible = false; } }
}
