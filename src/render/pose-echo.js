// Snapshot the real animated rig; retain a bounded set of echoes between casts.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { disposeObject } from './dispose.js';
import { EffectPool } from './effect-pool.js';

export class PoseEchoPool extends EffectPool {
  constructor(root) {
    const keep = new Set();
    root.traverse(o => { if (o.geometry) keep.add(o.geometry); });
    super(() => {
      const echo = clone(root), sources = [], targets = [];
      root.traverse(o => sources.push(o));
      echo.traverse(o => targets.push(o));
      // Geometry stays owned by the source rig. SkeletonUtils gives each echo its
      // own bones/skeleton; a pose can fade while the source keeps animating.
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: .15,
        depthWrite: false, side: THREE.DoubleSide });
      for (const o of targets) if (o.material) o.material = Array.isArray(o.material) ? o.material.map(() => material) : material;
      echo.userData.echoMaterials = [material];
      echo.userData.echoSources = sources;
      echo.userData.echoTargets = targets;
      return echo;
    }, echo => disposeObject(echo, keep), 3);
    this.root = root;
  }
  capture(color) {
    const echo = this.take(), { echoSources: sources, echoTargets: targets } = echo.userData;
    for (let i = 0; i < targets.length; i++) {
      const from = sources[i], to = targets[i];
      to.position.copy(from.position);to.quaternion.copy(from.quaternion);to.scale.copy(from.scale);
      to.visible = from.visible;to.matrix.copy(from.matrix);
      if (from.morphTargetInfluences) for (let j = 0; j < from.morphTargetInfluences.length; j++) to.morphTargetInfluences[j] = from.morphTargetInfluences[j];
    }
    echo.visible = true;
    echo.userData.echoMaterials[0].color.set(color);
    echoOpacity(echo, .15);
    echo.updateMatrixWorld(true);
    return echo;
  }
}
export function echoOpacity(root,value){for(const m of root.userData.echoMaterials)m.opacity=value;}
