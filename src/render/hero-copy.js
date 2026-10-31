// A copy of the hero's rig in its current pose (SkeletonUtils gives it its own bones; geometry and, unless a
// material is given, materials stay the hero's). Stealth's ghost (a see-through copy only its own player sees,
// re-posed every frame) and Decoy's copy (the hero's own look, held in the pose it was left in) use it.
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { disposeObject } from './dispose.js';

export function copyRig(root, material = null) {
  const obj = clone(root), src = [], dst = [];
  root.traverse((o) => src.push(o));
  obj.traverse((o) => dst.push(o));
  if (material) for (const o of dst) if (o.material) o.material = Array.isArray(o.material) ? o.material.map(() => material) : material;
  const c = { obj, src, dst, root };
  syncCopy(c);
  return c;
}
/** Pose the copy like the hero now. */
export function syncCopy(c) {
  const { src, dst } = c;
  for (let i = 0; i < dst.length && i < src.length; i++) {
    const a = src[i], b = dst[i];
    b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale);
    if (a.morphTargetInfluences && b.morphTargetInfluences) for (let j = 0; j < a.morphTargetInfluences.length; j++) b.morphTargetInfluences[j] = a.morphTargetInfluences[j];
  }
  c.obj.visible = true;
  c.obj.updateMatrixWorld(true);
}
/** Free the copy (its bones), keeping the hero's geometry and materials. */
export function dropCopy(c) {
  const keep = new Set();
  c.root.traverse((o) => {
    if (o.geometry) keep.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) keep.add(m);
  });
  disposeObject(c.obj, keep);
}

/**
 * Stealth's cloak (owner: a plain purple body was too flat): the body nearly clear, its outline a bright rim
 * that fades into it, and a shimmer of light bands running over it like heat haze, so it reads as "still
 * here, unseen". One material (one program); `uTime` is advanced by its user.
 */
export function cloakMaterial(THREE) {
  const m = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false });
  const uniforms = { uTime: { value: 0 }, uRim: { value: new THREE.Color(0.95, 0.93, 1.0) }, uTint: { value: new THREE.Color(0.55, 0.48, 1.0) } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = 'uniform float uTime; uniform vec3 uRim; uniform vec3 uTint;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float fres = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      float band = sin(vViewPosition.y*16.0 + vViewPosition.x*9.0 - uTime*7.0)*0.5 + 0.5;
      float haze = smoothstep(0.82, 1.0, band)*(0.35 + 0.65*fres);
      float rim = pow(fres, 2.4);
      gl_FragColor = vec4(mix(uTint, uRim, clamp(rim*1.2 + haze, 0.0, 1.0)), clamp(0.04 + rim*0.85 + haze*0.22, 0.0, 1.0));`);
  };
  m.userData.cloak = uniforms;
  return m;
}
