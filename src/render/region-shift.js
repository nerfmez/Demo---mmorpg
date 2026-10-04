// Open world: a neighbouring map is drawn beside the active one, offset by the atlas
// delta between them. World-space ground/water shaders sample baked fields in their
// own map's coordinates, so each map's materials subtract that map's shift. A build
// takes the shift that is current while its materials are made (beginRegion).
import * as THREE from 'three';

let current = { value: new THREE.Vector3() };
export const regionShift = () => current;
export function beginRegion() {
  current = { value: new THREE.Vector3() };
  return current;
}
/** Resume a region's shift for materials made after an await. */
export function useRegion(shift) {
  current = shift;
}
