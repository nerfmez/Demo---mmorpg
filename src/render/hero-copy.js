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
