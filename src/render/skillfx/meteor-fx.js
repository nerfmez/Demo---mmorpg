// Meteor, built from the approved set so it matches the old skills (owner, 2026-10-26: "match the
// old skills"). During the rules' delay a thin cel boundary marks the hit area, as the approved Stone
// Burst warning does. In the last part of the delay the approved Fireball V5 body, enlarged, drops
// from the sky behind the target, speeding up. On the 'burst' it lands with the approved Fireball
// contact flame (enlarged) and the approved Stone Burst eruption sized to the hit radius, so the rocks
// that break out of the ground are the same ones the player already knows. Cosmetic only.
// Research (docs/VFX-REFERENCE.md, 2026-10-26): toon core with flat colour bands, a ring/eruption on
// impact, the impact kept to a few decisive frames.
import * as THREE from 'three';
import { place, conformPlane, lookOf } from './fx-common.js';

const SLOTS = 3, FALL = 0.5, APEX = 6.5, BACK = 2.4, BODY = 2.3;
const X_AXIS = new THREE.Vector3(1, 0, 0);
// the Stone Burst warning's thin boundary, tinted by the element
const MARK_FS = `varying vec2 vP; uniform float uA; uniform vec3 uCol;
  void main(){ float r=length(vP); if(r>1.0||r<0.955) discard; gl_FragColor=vec4(uCol, 0.85*uA); }`;
const VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;

export class MeteorFx {
  constructor(scene, camera, vfx) {
    this.scene = scene; this.vfx = vfx;
    this.slots = Array.from({ length: SLOTS }, () => {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color() } }, vertexShader: VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false }));
      mark.rotation.x = -Math.PI / 2; mark.renderOrder = 1; mark.visible = false; scene.add(mark);
      return { mark, body: null, live: false, t: 0, delay: 1, x: 0, z: 0, radius: 3, element: 'fire', apex: new THREE.Vector3(), dir: new THREE.Vector3(), landed: false };
    });
  }
  // core 'area' event: the rules' delay starts. from: the caster (the rock comes from behind the target)
  begin(e, element, from) {
    const s = this.slots.find((q) => !q.live) || this.slots[0];
    this.dropBody(s);
    const dx = e.x - from.x, dz = e.z - from.z, l = Math.hypot(dx, dz) || 1;
    Object.assign(s, { live: true, t: 0, delay: Math.max(0.6, e.delay), x: e.x, z: e.z, radius: e.radius, element, landed: false });
    s.apex.set(e.x + dx / l * BACK, APEX, e.z + dz / l * BACK);
    s.dir.set(e.x - s.apex.x, -APEX, e.z - s.apex.z).normalize();
    place(s.mark, e.x, 0.03, e.z); s.mark.scale.setScalar(e.radius * 2); conformPlane(s.mark); s.mark.visible = true;
    const edge = lookOf(element).edge; s.mark.material.uniforms.uCol.value.setRGB(edge[0], edge[1], edge[2]);
  }
  dropBody(s) { if (s.body) { s.body.removeFromParent(); s.body.traverse((o) => o.material?.dispose?.()); s.body = null; } }
  // core 'burst': the rock lands
  impact(e) {
    const s = this.slots.find((q) => q.live && Math.hypot(q.x - e.x, q.z - e.z) < 0.05);
    if (!s) return;
    s.landed = true; s.mark.visible = false; this.dropBody(s);
    const v = this.vfx();
    v.playApproved('stone-burst', { x: e.x, z: e.z, radius: e.radius });
    if (s.element === 'fire') v.fireImpact({ x: e.x, z: e.z, y: 0.5, vx: s.dir.x, vz: s.dir.z, scale: 2.4 });
    else v.burst({ ...e, generic: true });
    s.live = false;
  }
  update(dt) {
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      s.mark.material.uniforms.uA.value = Math.min(1, s.t / 0.1);
      const fallAt = s.delay - FALL;
      if (s.t < fallAt || s.landed) continue;
      if (!s.body) {
        // the approved Fireball body, enlarged and turned to fall along the path (fire only; other elements keep the ball's shape in their colour)
        const m = this.vfx().fireMesh(0);
        const core = m.userData.launchCore; if (core) core.visible = false;
        s.body = new THREE.Group(); s.body.add(m); s.body.scale.setScalar(BODY); this.scene.add(s.body);
        // the flame's shape runs along its local +X (its uVelocity stays +X): turn the group down the fall
        s.body.quaternion.setFromUnitVectors(X_AXIS, s.dir);
        s.bodyTime = 0.625;
      }
      const u = Math.min(1, (s.t - fallAt) / FALL), k = u * u * 0.7 + u * 0.3;
      s.body.position.set(s.apex.x + (s.x - s.apex.x) * k, s.apex.y * (1 - k) + 0.4 * k, s.apex.z + (s.z - s.apex.z) * k);
      s.body.position.y += this.vfx().gy(s.body.position.x, s.body.position.z);
      const un = s.body.children[0].material.uniforms;
      s.bodyTime += dt; un.uTime.value = s.bodyTime; un.uVelocity.value.set(1, 0, 0); if (un.uTravelled) un.uTravelled.value = 99;
    }
  }
  clear() { for (const s of this.slots) { s.live = false; s.mark.visible = false; this.dropBody(s); } }
  get busy() { return this.slots.some((s) => s.live); }
}
