// Keep the authored foliage/trunk paint; use real shadow visibility without lighting
// each leaf card by its own normal. No new textures or post-processing passes.
import * as THREE from 'three';
import {renderConfig} from './settings.js';
export const paintedLight = {value:new THREE.Color(1,1,1)};
const temp = new THREE.Color();
export function syncPaintedLighting(hemisphere, sun) {
  const cfg = renderConfig.painted;
  const energy = hemisphere.intensity + sun.intensity;
  temp.copy(hemisphere.color).multiplyScalar(hemisphere.intensity);
  const r = temp.r + sun.color.r * sun.intensity;
  const g = temp.g + sun.color.g * sun.intensity;
  const b = temp.b + sun.color.b * sun.intensity;
  const peak = Math.max(r,g,b,0.001);
  const influence = cfg.lightInfluence;
  const brightness = THREE.MathUtils.clamp(1 + influence * (energy / cfg.referenceEnergy - 1), .85, 1.15);
  paintedLight.value.setRGB(1+(r/peak-1)*influence,1+(g/peak-1)*influence,1+(b/peak-1)*influence).multiplyScalar(brightness);
}
/** Call after the wind/see-through patch so both patches are composed, not overwritten. */
export function receivePaintedShadow(material) {
  const previous = material.onBeforeCompile;
  const oldKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uPaintLight = paintedLight;
    shader.uniforms.uPaintShadow = {value:renderConfig.painted.shadowStrength};
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPaintLight; uniform float uPaintShadow;')
      .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>')
      .replace('#include <opaque_fragment>', `
        // Direct Lambert shading would expose separate cards: retain the baked mass.
        outgoingLight = diffuseColor.rgb * uPaintLight * (1.0 - uPaintShadow * (1.0 - getShadowMask()));
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => oldKey()+'|painted-shadow-v1';
  material.userData.paintedShadow = true;
  return material;
}
