// A resident world keeps every buffer ready, but only attaches cells needed by
// the camera or its directional shadow. Detaching stops both renderer traversal
// and Three's recursive matrix walk; setting visible=false alone does not.
import * as THREE from 'three';

const renderable = o => o.isMesh || o.isLine || o.isPoints;
const defaultBeforeRender = THREE.Object3D.prototype.onBeforeRender;

function addExcluded(set, root) { root?.traverse?.(o => set.add(o)); }

function exclusions(region) {
  const skip = new Set();
  for (const n of region.npcs || []) {
    addExcluded(skip, n.root);addExcluded(skip, n.scarf?.mesh);
  }
  for (const o of region.npcMarkers || []) addExcluded(skip, o);
  for (const f of region.fires || []) addExcluded(skip, f.sprite);
  for (const o of region.waypointStones?.values?.() || []) addExcluded(skip, o);
  // Opening items are toggled through their authored group by placeWreck.
  for (const o of Object.values(region.weaponProps || {})) addExcluded(skip, o);
  region.root.traverse(o => {
    if (o.isSkinnedMesh || o.isBone || o.isSprite || o.morphTargetInfluences ||
        o.userData.spatialDynamic || o.onBeforeRender !== defaultBeforeRender) addExcluded(skip, o);
  });
  // Animation callbacks can update their pivot or siblings. Keep the original
  // branch containing such a callback, rather than severing its dependencies.
  region.root.traverse(o => {
    if (o.onBeforeRender !== defaultBeforeRender) {
      let branch = o;
      while (branch.parent && branch.parent !== region.root && !region.npcs?.some(n => n.root === branch.parent)) {
        if (branch.parent.name === 'blender-landmarks') break;
        branch = branch.parent;
      }
      addExcluded(skip, branch);
    }
  });
  return skip;
}

// Full authored bounds, independent of a compacted grass draw count. Shader
// displacement happens before instance transforms, so expand the source box
// before transforming each instance. Authored sphere envelopes (water/spray)
// are included as well. No vertex, colour, material or density is changed.
function objectBounds(object, scratch) {
  const grass = object.userData.grassCulling;
  if (grass) return scratch.box.setFromCenterAndSize(grass.bounds.center,
    scratch.size.setScalar(grass.bounds.radius * 2));
  const geometry = object.geometry;
  if (!geometry?.attributes.position) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const source = scratch.source.copy(geometry.boundingBox);
  // Explicitly expanded spheres protect GPU-only water/splash motion.
  source.union(scratch.sphereBox.setFromCenterAndSize(geometry.boundingSphere.center,
    scratch.size.setScalar(geometry.boundingSphere.radius * 2)));
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  let windX = 0, windZ = 0, outline = 0;
  for (const material of materials) {
    const patch = material?.userData.windPatch;
    const sway = Math.max(0, source.max.y + (patch?.windBase || 0)) * Math.abs(patch?.wind || 0);
    windX = Math.max(windX, sway);windZ = Math.max(windZ, sway * .6);
    outline = Math.max(outline, Math.abs(material?.userData.outlineWidth || 0));
    // patch hulls use a shader uniform instead of outlineWidth metadata.
    if (material?.customProgramCacheKey?.().includes('patch|') &&
        material.customProgramCacheKey().includes('|o1|')) outline = Math.max(outline, .06);
  }
  source.min.x -= windX + outline;source.max.x += windX + outline;
  source.min.z -= windZ + outline;source.max.z += windZ + outline;
  source.min.y -= outline;source.max.y += outline;
  if (!object.isInstancedMesh) return scratch.box.copy(source);
  scratch.box.makeEmpty();
  for (let i = 0; i < object.count; i++) {
    object.getMatrixAt(i, scratch.instance);
    scratch.box.union(scratch.instanceBox.copy(source).applyMatrix4(scratch.instance));
  }
  return scratch.box;
}

/** Call after static/import assembly and final atlas placement, before play. */
export function prepareSpatialRegion(region, { cellSize = 32, margin = .5 } = {}) {
  if (region.disposed) return null;
  if (region.spatial) return region.spatial.stats;
  if (!(cellSize > 0) || !(margin >= 0)) throw new RangeError('Invalid spatial cell bounds');
  const root = region.root, skip = exclusions(region), originals = [], parentOrders = new Map();
  root.updateMatrixWorld(true);
  // Frozen imported/environment nodes intentionally ignore forced updates.
  root.traverse(o => {
    if (o === root) return;
    if (o.matrixAutoUpdate) o.updateMatrix();
    o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
  });
  const inverse = root.matrixWorld.clone().invert(), cellsByKey = new Map();
  const scratch = { box:new THREE.Box3(), source:new THREE.Box3(), sphereBox:new THREE.Box3(),
    instanceBox:new THREE.Box3(), size:new THREE.Vector3(), centre:new THREE.Vector3(), instance:new THREE.Matrix4() };
  const nodes = [];root.traverse(o => nodes.push(o));
  let objects = 0;
  for (const object of nodes) {
    if (!renderable(object) || skip.has(object)) continue;
    let eligible = object.visible, groupOrder = null;
    for (let p = object.parent; p; p = p.parent) {
      if (!p.visible || skip.has(p)) eligible = false;
      if (p.isGroup && groupOrder === null) groupOrder = p.renderOrder;
      if (p === root) break;
    }
    groupOrder ??= 0;
    if (!eligible || object.children.some(child => skip.has(child))) continue;
    const bounds = objectBounds(object, scratch);
    if (!bounds || bounds.isEmpty() || !Number.isFinite(bounds.min.x + bounds.max.x + bounds.min.y + bounds.max.y + bounds.min.z + bounds.max.z)) continue;
    const ownBounds = bounds.clone(), localMatrix = new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    // Keep Three's individual sphere test conservative for shader-only motion
    // too (fountain foam/spray), rather than protecting just the enclosing cell.
    ownBounds.expandByScalar(margin / Math.max(.0001, localMatrix.getMaxScaleOnAxis()));
    bounds.applyMatrix4(localMatrix).expandByScalar(margin).getCenter(scratch.centre);
    const key = `${Math.floor(scratch.centre.x / cellSize)}/${Math.floor(scratch.centre.z / cellSize)}/${object.castShadow ? 1 : 0}/${groupOrder}`;
    let cell = cellsByKey.get(key);
    if (!cell) {
      const group = new THREE.Group();group.name = 'resident-cell-' + key;group.renderOrder = groupOrder;
      group.matrixAutoUpdate = false;group.matrixWorldAutoUpdate = false;group.matrixWorld.copy(root.matrixWorld);
      root.add(group);
      cell = { group, bounds:new THREE.Box3(), castShadow:!!object.castShadow, attached:true };
      cellsByKey.set(key, cell);
    }
    cell.bounds.union(bounds);
    const parent = object.parent;
    if (!parentOrders.has(parent)) parentOrders.set(parent, parent.children.slice());
    originals.push({ object, parent, matrix:object.matrix.clone(), matrixAutoUpdate:object.matrixAutoUpdate,
      matrixWorldAutoUpdate:object.matrixWorldAutoUpdate, boundingSphere:object.boundingSphere,
      hasBoundingSphere:Object.hasOwn(object, 'boundingSphere'), residentCell:object.userData.residentCell,
      hasResidentCell:Object.hasOwn(object.userData, 'residentCell') });
    cell.group.add(object);object.matrix.copy(localMatrix);
    object.userData.residentCell = cell;
    object.matrixAutoUpdate = false;object.matrixWorldAutoUpdate = false;
    // Three's per-object culling must use the same wind/water envelope as cells.
    object.boundingSphere = ownBounds.getBoundingSphere(new THREE.Sphere());
    objects++;
  }
  // Remove empty source grouping trees too: imports can leave hundreds of
  // wrappers after their renderable leaves move. They still own no new buffers.
  const removedGroups = [];
  function empty(object) {
    if (skip.has(object) || renderable(object) || object.isSprite || object.isLight || object.isBone) return false;
    for (const child of object.children) if (!empty(child)) return false;
    return true;
  }
  function prune(parent) {
    for (const child of parent.children.slice()) {
      if (cellsByKey.size && child.name.startsWith('resident-cell-')) continue;
      if (empty(child)) {
        if (!parentOrders.has(parent)) parentOrders.set(parent, parent.children.slice());
        removedGroups.push({object:child,parent});child.removeFromParent();
      } else if (!skip.has(child) && !renderable(child)) prune(child);
    }
  }
  prune(root);
  const cells = [...cellsByKey.values()];
  const stats = { cells:cells.length, objects, attachedCells:cells.length, attachedObjects:objects, testedCells:0 };
  region.spatial = { root, cells, originals, removedGroups, parentOrders, stats,
    clip:new THREE.Matrix4(), shadowClip:new THREE.Matrix4(), cameraFrustum:new THREE.Frustum(), shadowFrustum:new THREE.Frustum(),
    lastCamera:new Float64Array(16).fill(NaN), lastShadow:new Float64Array(16).fill(NaN),
    lastRoot:new Float64Array(root.matrixWorld.elements), lastShadowEnabled:null };
  return stats;
}

function changed(previous, current) {
  for (let i = 0; i < 16; i++) if (previous[i] !== current[i]) { previous.set(current);return true; }
  return false;
}

/** All scratch storage is allocated at preparation; movement creates no buffers. */
export function updateSpatialRegion(region, camera, sun) {
  const state = region.spatial;
  if (!state || region.disposed) return null;
  const root = state.root;
  root.updateWorldMatrix(true, false);
  if (changed(state.lastRoot, root.matrixWorld.elements)) {
    for (const cell of state.cells) {
      cell.group.matrixWorld.copy(root.matrixWorld);
      for (const object of cell.group.children) object.matrixWorld.multiplyMatrices(root.matrixWorld, object.matrix);
    }
  }
  camera.updateMatrixWorld();
  state.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(root.matrixWorld);
  const cameraChanged = changed(state.lastCamera, state.clip.elements);
  const shadowEnabled = !!(sun?.castShadow && sun.shadow?.camera);
  let shadowChanged = shadowEnabled !== state.lastShadowEnabled;
  state.lastShadowEnabled = shadowEnabled;
  if (shadowEnabled) {
    sun.updateWorldMatrix(true, false);sun.target.updateWorldMatrix(true, false);
    sun.shadow.updateMatrices(sun);
    const shadowCamera = sun.shadow.camera;
    state.shadowClip.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse).multiply(root.matrixWorld);
    shadowChanged = changed(state.lastShadow, state.shadowClip.elements) || shadowChanged;
  }
  state.stats.testedCells = 0;
  if (!cameraChanged && !shadowChanged) return state.stats;
  state.cameraFrustum.setFromProjectionMatrix(state.clip, camera.coordinateSystem);
  if (shadowEnabled) state.shadowFrustum.setFromProjectionMatrix(state.shadowClip, sun.shadow.camera.coordinateSystem);
  let attachedCells = 0, attachedObjects = 0;
  for (const cell of state.cells) {
    state.stats.testedCells++;
    const visible = state.cameraFrustum.intersectsBox(cell.bounds) ||
      (cell.castShadow && shadowEnabled && state.shadowFrustum.intersectsBox(cell.bounds));
    if (visible !== cell.attached) {
      if (visible) root.add(cell.group);else cell.group.removeFromParent();
      cell.attached = visible;
    }
    if (visible) { attachedCells++;attachedObjects += cell.group.children.length; }
  }
  state.stats.attachedCells = attachedCells;state.stats.attachedObjects = attachedObjects;
  return state.stats;
}

/** Restore before disposal, rebatching or quality traversal; ownership is unchanged. */
export function restoreSpatialRegion(region) {
  const state = region?.spatial;
  if (!state) return;
  for (const record of state.removedGroups) record.parent.add(record.object);
  for (const record of state.originals) {
    const object = record.object;
    record.parent.add(object);object.matrix.copy(record.matrix);
    object.matrixAutoUpdate = record.matrixAutoUpdate;object.matrixWorldAutoUpdate = record.matrixWorldAutoUpdate;
    if (record.hasBoundingSphere) object.boundingSphere = record.boundingSphere;else delete object.boundingSphere;
    if (record.hasResidentCell) object.userData.residentCell = record.residentCell;else delete object.userData.residentCell;
  }
  for (const [parent, order] of state.parentOrders) {
    const indices = new Map(order.map((object, index) => [object, index]));
    parent.children.sort((a, b) => (indices.get(a) ?? order.length) - (indices.get(b) ?? order.length));
  }
  for (const cell of state.cells) cell.group.removeFromParent();
  state.root.updateWorldMatrix(true, false);
  state.root.traverse(o => {
    if (o === state.root) return;
    if (o.matrixAutoUpdate) o.updateMatrix();
    o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
  });
  region.spatial = null;
}
