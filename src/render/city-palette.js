// Data-driven recolours for imported city art: whole source materials by name
// (e.g. indigo timber → warm wood) and single named parts. Source files stay unchanged.
import * as THREE from 'three';

const scratch = new THREE.Color();
export function cityColor(city, material, meshName = '') {
  const hex = city?.meshColors?.[meshName] || city?.materialColors?.[material.name];
  return hex ? scratch.set(hex) : material.color;
}
