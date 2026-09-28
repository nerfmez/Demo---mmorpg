// Ground decals that hug the terrain (target ring, aim reticle, telegraphs, skill areas).
// Build the geometry flat on the XZ plane (y = 0); conform() lifts every vertex to the ground
// under it after the mesh is moved, rotated about Y or scaled (uniformly in XZ).
import * as THREE from 'three';

export function makeDecal(geometry, material, world, offset = 0.06) {
  const g = geometry.clone();
  const p = g.attributes.position;
  const base = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    base[i * 2] = p.getX(i);
    base[i * 2 + 1] = p.getZ(i);
  }
  g.userData.base = base;
  const mesh = new THREE.Mesh(g, material);
  mesh.userData.decal = { world, offset, key: '' };
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

/** Re-fit the decal to the ground. Cheap enough to call every frame for moving decals. */
export function conform(mesh, force = false) {
  const d = mesh.userData.decal;
  const px = mesh.position.x;
  const pz = mesh.position.z;
  const a = mesh.rotation.y;
  const sx = mesh.scale.x;
  const sz = mesh.scale.z;
  const key = `${px.toFixed(2)}|${pz.toFixed(2)}|${a.toFixed(3)}|${sx.toFixed(3)}|${sz.toFixed(3)}`;
  if (!force && key === d.key) return;
  d.key = key;
  mesh.position.y = 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const base = g.userData.base;
  const sy = mesh.scale.y || 1;
  for (let i = 0; i < pos.count; i++) {
    const lx = base[i * 2] * sx;
    const lz = base[i * 2 + 1] * sz;
    const wx = px + lx * c + lz * s;
    const wz = pz - lx * s + lz * c;
    pos.setY(i, (d.world.surfaceY(wx, wz) + d.offset) / sy);
  }
  pos.needsUpdate = true;
}
