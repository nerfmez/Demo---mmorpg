// Free the GPU buffers of objects that leave the scene. Three.js never frees geometry or
// materials on removeFromParent(); over a long session the leaked buffers make the game
// stutter (worst on iPad). Shared resources are kept: toon materials (cached), anything
// flagged userData.shared, sprite quads, and the geometries passed in `keep`.
export function disposeObject(obj, keep = null) {
  if (!obj) return;
  obj.removeFromParent();
  const freed=new Set();
  const release=resource=>{if(!resource||keep?.has(resource)||freed.has(resource))return;freed.add(resource);resource.dispose();};
  obj.traverse((o) => {
    if (o.isSkinnedMesh) release(o.skeleton); // its bone texture
    if (o.isInstancedMesh) release(o); // instance matrix/colour buffers live on the mesh, not the geometry
    if (o.geometry && !o.isSprite && !o.geometry.userData?.shared && !keep?.has(o.geometry)) release(o.geometry);
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.isMeshToonMaterial || m.userData?.rig) if (!m.userData?.shared) release(m);
  });
}
