// Free the GPU buffers of objects that leave the scene. Three.js never frees geometry or
// materials on removeFromParent(); over a long session the leaked buffers make the game
// stutter (worst on iPad). Shared resources are kept: toon materials (cached), anything
// flagged userData.shared, sprite quads, and the geometries passed in `keep`.
export function disposeObject(obj, keep = null) {
  if (!obj) return;
  obj.removeFromParent();
  obj.traverse((o) => {
    if (o.geometry && !o.isSprite && !o.geometry.userData?.shared && !keep?.has(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.isMeshToonMaterial || m.userData?.rig) if (!m.userData?.shared) m.dispose();
  });
}
