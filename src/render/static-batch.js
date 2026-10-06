// Static scenery batching: after the map is built, meshes that never move and share one cached
// material kind (toon surfaces, their outline hulls, feature-edge lines) are merged per map cell.
// Toon materials differ only by colour, so a cell's parts are merged across colours: each part's
// colour is written into a vertex colour (and its outline colour into a second one), and one
// shared material draws them. The look is unchanged — same world-space geometry and colours —
// but the town goes from hundreds of draw calls to a few dozen, which limits frame rate on iPad.
// Built once at load. A surface and its outline hull share one merged geometry, as they did before.
import * as THREE from 'three';
import { finishSteps } from './build-queue.js';
import { batchPartSteps, mergeGeometrySteps, transformGeometrySteps, finishGeometrySteps } from './geometry-steps.js';

// Only plain shared materials qualify: no wind or per-object shader inputs, no local-position
// painting (walk surfaces), no transparency sorting except the shared feature-edge lines.
function batchable(o) {
  const m = o.material;
  if (!m || Array.isArray(m) || o.isInstancedMesh || o.isSkinnedMesh || o.morphTargetInfluences) return false;
  if (o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  if (m.userData.windPatch || m.userData.walkSurface) return false;
  if (o.isLineSegments) return !!m.userData.shared;
  if (!o.isMesh || m.transparent) return false;
  return m.isMeshToonMaterial || (m.isMeshBasicMaterial && m.userData.outlineWidth !== undefined);
}

const batchToon = new Map(), batchHull = new Map();
function toonFor(m) {
  const key = `${m.emissive.getHex()}|${m.emissiveIntensity}|${m.side}`;
  if (!batchToon.has(key)) {
    const t = m.clone(); t.color.set(0xffffff); t.vertexColors = true; t.userData = { shared: true };
    batchToon.set(key, t);
  }
  return batchToon.get(key);
}
// the outline hull reads its own colour attribute from the shared merged geometry
function hullFor(m) {
  const width = m.userData.outlineWidth;
  if (!batchHull.has(width)) {
    const h = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    h.onBeforeCompile = (shader) => {
      m.onBeforeCompile(shader);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 hullColor;')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = hullColor;');
    };
    h.customProgramCacheKey = () => `outline-batch-${width}`;
    h.userData = { shared: true, outlineWidth: width };
    batchHull.set(width, h);
  }
  return batchHull.get(width);
}
export const batchStatic=(root,opts)=>finishSteps(batchStaticSteps(root,opts));
export function* batchStaticSteps(root, { cell = 24, exclude = [], owner } = {}) {
  root.updateMatrixWorld(true);
  const skip = new Set();
  for (const e of exclude) e?.traverse((o) => skip.add(o));
  const inverse = root.matrixWorld.clone().invert(), groups = new Map(), centre = new THREE.Vector3(), box = new THREE.Box3(), seen = new Set();
  const cellOf = (o) => { box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).getCenter(centre); return `${Math.floor(centre.x / cell)}/${Math.floor(centre.z / cell)}`; };
  const add = (key, entry) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entry); };
  const nodes=[];root.traverse(o=>nodes.push(o));
  for(const o of nodes){
    yield;
    if(!skip.has(o)&&o.visible&&o.geometry?.attributes.position&&batchable(o))yield* finishGeometrySteps(o.geometry,false,false);
  }
  root.traverse((o) => {
    if (seen.has(o) || skip.has(o) || !o.visible || !o.geometry || !batchable(o)) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) return;
    seen.add(o);
    if (o.isLineSegments) return add(`L/${o.material.uuid}/${cellOf(o)}/${o.renderOrder}`, { lines: o });
    // a toon surface and the outline hull drawn from the same geometry travel together
    const hull = o.material.isMeshToonMaterial ? o.parent?.children.find((s) => s !== o && s.geometry === o.geometry && batchable(s) && !s.material.isMeshToonMaterial) : null;
    if (hull) seen.add(hull);
    const surface = o.material.isMeshToonMaterial ? o : null, outline = hull || (surface ? null : o);
    const kind = `${surface ? toonFor(surface.material).uuid : '-'}/${outline ? hullFor(outline.material).uuid : '-'}`;
    add(`M/${kind}/${cellOf(o)}/${o.castShadow}/${o.receiveShadow}/${o.renderOrder}`, { surface, outline, source: o });
  });
  const freed = new Set(), matrix = new THREE.Matrix4();
  let before = 0, after = 0;
  try {
  for (const list of groups.values()) {
    yield;
    const temporary=[];
    try {
    const draws = list[0].lines ? 1 : (list[0].surface ? 1 : 0) + (list[0].outline ? 1 : 0);
    before += list.length * draws;
    if (list.length < 2) { after += draws; continue; }
    if (list[0].lines) {
      for(const {lines}of list){
        matrix.multiplyMatrices(inverse,lines.matrixWorld);
        const g=lines.geometry.clone();temporary.push(g);owner?.geometry(g);yield* transformGeometrySteps(g,matrix);
      }
      const merged=yield* mergeGeometrySteps(temporary,owner);
      const mesh = new THREE.LineSegments(merged, list[0].lines.material);
      mesh.renderOrder = list[0].lines.renderOrder; mesh.name = 'static-batch'; root.add(mesh);
      for (const { lines } of list) { freed.add(lines.geometry); lines.removeFromParent(); }
      after++; continue;
    }
    for(const {surface,outline,source}of list){matrix.multiplyMatrices(inverse,source.matrixWorld);temporary.push(yield* batchPartSteps(source.geometry,surface?.material,outline?.material,matrix,owner));}
    const merged=yield* mergeGeometrySteps(temporary,owner);temporary.push(merged);
    yield* finishGeometrySteps(merged);
    const { surface, outline, source } = list[0];
    if (surface) { const m = new THREE.Mesh(merged, toonFor(surface.material)); Object.assign(m, { castShadow: source.castShadow, receiveShadow: source.receiveShadow, renderOrder: source.renderOrder, name: 'static-batch' }); root.add(m); }
    if (outline) { const h = new THREE.Mesh(merged, hullFor(outline.material)); Object.assign(h, { castShadow: false, receiveShadow: outline.receiveShadow, renderOrder: outline.renderOrder, name: 'static-batch' }); root.add(h); }
    temporary.splice(temporary.indexOf(merged),1);
    after += draws;
    for (const { surface: s, outline: h } of list) for (const o of [s, h]) if (o) { freed.add(o.geometry); o.removeFromParent(); }
    } finally { for(const g of temporary)owner?owner.release(g):g.dispose(); }
  }
  // Drop groups left empty by the merge, then freeze the static subtree: its matrices are final,
  // so the per-frame scene-graph update no longer walks thousands of scenery nodes.
  const empty = [];
  root.traverse((o) => { if (o !== root && !skip.has(o) && !o.geometry && !o.isLight && o.children.length === 0) empty.push(o); });
  for (let o of empty) { while (o && o !== root && !o.geometry && o.children.length === 0 && !skip.has(o)) { const p = o.parent; o.removeFromParent(); o = p; } }
  root.updateMatrixWorld(true);
  for (const child of root.children) {
    let moving = false;
    child.traverse((o) => { if (skip.has(o)) moving = true; });
    if (!moving) child.traverse((o) => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; });
  }
  let objects = 0; root.traverse(() => objects++);
  return { before, after, objects };
  } finally {
  // geometries still used by something that stayed (or marked shared) are kept
  root.traverse((o) => { if (o.geometry) freed.delete(o.geometry); });
  freed.forEach((g) => { if (!g.userData.shared) {if(owner)owner.geometry(g);else g.dispose();} });
  }
}
