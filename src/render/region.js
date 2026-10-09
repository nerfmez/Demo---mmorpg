// One map's static scene (terrain, scenery, water, city/outpost kits, town NPCs) as a
// region the View can hold beside another. The active region sits at the scene origin;
// a neighbouring map is placed at its atlas delta, and its ground/water shaders take
// the same delta as their region shift (region-shift.js). `regionSteps` yields between
// the heavy parts so a neighbour can stream in over many frames; `buildRegion` runs it
// all at once only for legacy callers; the starting map now uses startRegion too.
import * as THREE from 'three';
import {importJob} from './import-job.js';
import {cancelledBuild} from './build-queue.js';
import { terrainSteps, waterSteps, releaseGroundCaches } from './ground.js';
import { environmentSteps } from './environment.js';
import { batchStaticSteps } from './static-batch.js';
import { bakeGrassSteps } from './grass.js';
import { attachWindShadow } from './patch.js';
import { buildHumanoid, HumanoidAnimator } from './hero.js';
import { residentTool } from './districts.js';
import { loadCity } from './city.js';
import { loadTownKit } from './town-kit.js';
import { loadLandmarkAssets } from './landmark-assets.js';
import { disposeObject } from './dispose.js';
import { beginRegion, useRegion, regionShift } from './region-shift.js';
import { toon } from './toon.js';
import { glowTexture } from './vfx.js';
import { terrainDomain } from './terrain-domain.js';

// Rule worlds/cached fields can be borrowed by an old and a replacement build.
const groundOwners=new WeakMap();
function createRegion(world){
  const previous=regionShift(),shift=beginRegion();useRegion(previous);
  const root=new THREE.Group();root.name='region-'+world.data.id;
  const region={world,shift,root,npcs:[],npcMarkers:[],fires:[],chimneys:[],grass:[],waypointStones:new Map(),disposed:false,ready:null,stats:{},controller:new AbortController(),importedState:'building',staticReady:false,importDisposers:[]};
  groundOwners.set(world,(groundOwners.get(world)||0)+1);
  return region;
}
export function startRegion(view,world){
  const region=createRegion(world);
  const job=view.buildQueue.enqueue(regionSteps(view,world,region),{signal:region.controller.signal,label:'region.'+world.data.id});
  region.staticReadyPromise=job.promise;
  job.promise.catch(error=>{if(error.name!=='AbortError')region.error=error;disposeRegion(region);}); // includes cancellation before the first next()
  region.ready=job.promise.then(result=>result.importsReady);
  return region;
}
// Initial loading consumers must not treat an evicted region's cancelled result
// as imported-ready. Follow a replacement, while preserving genuine failures.
export async function waitForRegionImports(view) {
  for (;;) {
    const region = view.region;
    let result;
    try { result = await region.ready; }
    catch (error) {
      if (region !== view.region && error.name === 'AbortError') continue;
      throw error;
    }
    if (region !== view.region) continue;
    if (region.disposed || result?.status === 'cancelled') throw cancelledBuild();
    if (result?.status !== 'imported-ready' || region.importedState !== 'imported-ready')
      throw region.error || new Error('Region imports did not complete');
    return result;
  }
}

export function* regionSteps(view, world, region) {
  region ||= createRegion(world); // lazy: return() before the first next() owns nothing
  const {shift}=region;
  let completed=false;
  try {
    yield* inRegion(shift,assembleRegion(view,world,region));
    completed=true;return region;
  } catch(error){if(error.name!=='AbortError')region.error=error;throw error;} finally {if(!completed)disposeRegion(region);}
}

function* assembleRegion(view,world,region){
  const {root,shift}=region;
  const domain = terrainDomain(world, id => view.ruleWorlds?.[id] || view.coreWorld?.(id));
  region.terrain = yield* inRegion(shift, terrainSteps(world,{domain,adopt:group=>root.add(group)}));
  root.add(region.terrain.group);
  yield;
  useRegion(shift); // another build may have run in between
  const env = yield* inRegion(shift, environmentSteps(world,{groundHeight:domain.groundHeight,adopt:group=>root.add(group)}));
  yield;
  useRegion(shift); // another build may have run in between
  // Keep only authored native hull/pile contact roots before batching moves
  // their geometry. These CPU-only clones share buffers and are never rendered.
  const nativeContacts = new THREE.Group();
  if (world.data.city?.enabled) {
    env.root.updateMatrixWorld(true);
    env.root.traverse((o) => {
      if (o.userData.waterContact) {
        const copy = o.clone(true);
        o.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
        nativeContacts.add(copy);
      }
    });
  }
  if (!world.data.city?.enabled) root.add(yield* inRegion(shift,waterSteps(world,env.root,{adopt:group=>root.add(group)})));
  env.root.traverse(attachWindShadow); // one-time setup; no per-frame allocation
  yield;
  useRegion(shift); // another build may have run in between
  yield* inRegion(shift, bakeGrassSteps(view.renderer, env.root, world)); // GPU passes per chunk; blades then just read colours
  yield;
  useRegion(shift); // another build may have run in between
  // after the water-contact bake: merge fixed scenery that shares a material, per map cell
  region.staticBatch = yield* inRegion(shift,batchStaticSteps(env.root, { exclude: [...(env.waypoints?.values?.() || [])] }));
  root.add(env.root);
  env.root.traverse((o) => o.userData.grassCulling && region.grass.push(o));
  region.waypointStones = env.waypoints;
  yield;
  useRegion(shift); // another build may have run in between

  // Town NPCs
  const t = world.data.town;
  const smith = buildHumanoid({ skin: '#e8b890', hair: '#8a4a2a', tunic: '#d9c7a8', hairStyle: 'short' }, {}, { npc: true, apron: '#5b3a22', beard: '#8a4a2a' });
  smith.root.position.set(t.workbench[0] + 1.6, world.groundY(t.workbench[0] + 1.6, t.workbench[1] + 0.2), t.workbench[1] + 0.2);
  smith.root.rotation.y = -Math.PI / 2 - 0.4;
  smith.job = 'smith';
  const trainer = buildHumanoid({ skin: '#f6d2b5', hair: '#f0d48a', tunic: '#fbf6ee', scarf: '#3b6ad0', eyes: '#3a6ad0' }, {}, { npc: true, longHair: true, straps: true, scarf: true });
  trainer.root.position.set(t.trainer[0] + 1.2, world.groundY(t.trainer[0] + 1.2, t.trainer[1] - 0.2), t.trainer[1] - 0.2);
  trainer.root.rotation.y = -Math.PI / 2 + 0.3;
  trainer.job = 'trainer';
  const townNpcs = [smith, trainer];
  if (t.shopkeeper) {
    // the potion seller (town.shop is where the player stands; town.shopkeeper is x, z, facing)
    const [kx, kz, ka] = t.shopkeeper;
    const merchant = buildHumanoid({ skin: '#f0c8a4', hair: '#5a3a5e', tunic: '#f4e6d0', scarf: '#c8436a', eyes: '#7a3a5a' }, {}, { npc: true, apron: '#8a3a52', scarf: true });
    merchant.root.position.set(kx, world.groundY(kx, kz), kz);
    merchant.root.rotation.y = ka;
    merchant.job = 'shop';
    townNpcs.push(merchant);
  }
  for (const resident of t.residents || []) {
    const n = buildHumanoid(resident.look, {}, { npc: true, ...(resident.outfit || {}) });
    n.root.position.set(resident.x, world.groundY(resident.x, resident.z), resident.z);
    n.root.rotation.y = resident.angle;
    n.root.userData.residentId = resident.id;
    n.scenery = true;
    n.activity = resident.activity;
    if (resident.tool) n.bones.handR.add(residentTool(resident.tool));
    townNpcs.push(n);
  }
  for (const n of townNpcs) {
    n.anim = new HumanoidAnimator(n);
    n.idleState = { speed: 0, facing: n.root.rotation.y, moving: false, dash: null, dead: false, time: 0 };
    root.add(n.root);
    if (n.scarf) root.add(n.scarf.mesh);
    region.npcs.push(n);
  }
  region.npcMarkers = [marker(root, world, t.workbench[0], t.workbench[1], '#ffd166'), marker(root, world, t.trainer[0], t.trainer[1], '#8fd0ff')];
  if (t.shop) region.npcMarkers.push(marker(root, world, ...(t.shopkeeper || t.shop).slice(0, 2), '#ff8fa8'));

  // campfire flame and house chimneys
  if (world.data.camp) {
    const [fx, fz] = world.data.camp.fire;
    const f = view.vfx.sprite(0xffa040, 1.6, 0.9);
    f.position.set(fx, world.groundY(fx, fz) + 0.6, fz);
    root.add(f);
    region.fires.push({ sprite: f, x: fx, z: fz });
  }
  region.chimneys = world.boxes.filter((b) => b.type === 'house' && !b.kit).map((b) => new THREE.Vector3(b.x, world.groundY(b.x, b.z) + 4.9, b.z));

  // Imported kits load in the background; a region disposed meanwhile drops them.
  const keep = (obj) => {
    if (region.disposed) {
      disposeObject(obj);
      return false;
    }
    root.add(obj);
    // Kits arrive frozen (static batching) after the region may already sit at its atlas delta:
    // give them this region's world matrices now, or they draw at the map's own coordinates.
    recompose(obj);
    return true;
  };
  const options={queue:view.buildQueue,signal:region.controller.signal,shift};
  region.importedState='loading';
  region.staticReady=true;
  region.importsReady=(async()=>{
    let city=null,kit=null,landmarks=null,waterOwner=null;const installed=[];
    const live=()=>{if(region.disposed)throw cancelledBuild();};
    try {
      city=await loadCity(world,options);live();
      if(city){
        region.importDisposers.push(city.dispose);
        region.stats.city=city.stats;
        // Bake in map-local space even if this region changed its atlas delta
        // while files were arriving. The contact clones are borrowed CPU data.
        nativeContacts.add(city.root);
        const start=performance.now();
        waterOwner=importJob(options);
        let water;
        try {
          water=await waterOwner.run(waterSteps(world,nativeContacts,{owner:waterOwner,adopt:g=>{water=g;}}),'city.water-contact-and-install');
          live();
          const disposeWater=waterOwner.commit(water);region.importDisposers.push(disposeWater);
        } catch(error){waterOwner.abort(water);throw error;}
        finally {nativeContacts.remove(city.root);}
        live();keep(city.root);region.cityRoot=city.root;keep(water);installed.push(city.root,water);
        city.stats.waterContactMs=performance.now()-start;
        city.stats.waterAssembly={...waterOwner.stats};city.stats.waterContactSections=water.userData.contactSections;
      }
      live();kit=await loadTownKit(world,options);live();
      if(kit){region.importDisposers.push(kit.dispose);keep(kit.root);installed.push(kit.root);region.townKitRoot=kit.root;region.stats.townKit=kit.stats;}
      live();landmarks=await loadLandmarkAssets(world,{...options,groundHeight:domain.groundHeight});live();
      if(landmarks){region.importDisposers.push(landmarks.dispose);keep(landmarks.root);installed.push(landmarks.root);region.stats.landmarks=landmarks.stats;}
      live();region.importedState='imported-ready';return {status:'imported-ready'};
    } catch(error){
      city?.dispose?.();kit?.dispose?.();landmarks?.dispose?.();
      for(const dispose of region.importDisposers)dispose?.();
      for(const obj of installed)obj.removeFromParent();
      city?.root.removeFromParent();kit?.root.removeFromParent();
      if(error.name==='AbortError'&&region.disposed){region.importedState='cancelled';return {status:'cancelled'};}
      region.importedState='error';region.error=error;
      throw error; // actual import failures remain observable by the consumer
    } finally {nativeContacts.clear();}
  })();
  // Install a rejection observer immediately; keep the original promise rejected
  // for initial loading/region consumers. This does not catch renderer exceptions.
  region.ready ||= region.importsReady;
  region.importsReady.catch(error=>console.error('Region import failed: '+world.data.id,error));

  return region;
}

// Materials made inside a nested build take this region's shift on every resume.
export function* inRegion(shift, steps) {
  const resume=fn=>{const previous=regionShift();useRegion(shift);try{return fn();}finally{useRegion(previous);}};
  let completed=false;
  try {for(;;){const step=resume(()=>steps.next());if(step.done){completed=true;return step.value;}yield;}}
  finally {if(!completed)resume(()=>steps.return?.());}
}

/** Synchronous compatibility entry; normal startup and streaming use the shared queue. */
export function buildRegion(view, world) {
  const steps = regionSteps(view, world);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Place a region `delta` metres from the active map's origin (shaders follow). */
export function placeRegion(region, dx, dz) {
  const root = region.root;
  root.position.set(dx, 0, dz);
  region.shift.value.set(dx, 0, dz);
  // Static scenery is frozen after batching (matrixWorldAutoUpdate off), so three never
  // recomputes it, even when forced. Recompose every world matrix here, parents first.
  root.updateMatrix();
  root.matrixWorld.copy(root.matrix);
  for (const child of root.children) recompose(child);
}

/** Recompute world matrices under `obj` from its parent, parents first (frozen nodes included). */
function recompose(obj) {
  obj.traverse((o) => {
    if (o.matrixAutoUpdate) o.updateMatrix();
    o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
  });
}

export function disposeRegion(region) {
  if(!region||region.disposed)return;
  region.disposed = true;
  region.importedState=region.error?'error':'cancelled';
  region.controller?.abort();
  const handled=new Set();
  for(const dispose of region.importDisposers||[])for(const resource of dispose?.()||[])handled.add(resource);
  region.root.removeFromParent();
  disposeObject(region.root,handled);
  const owners=Math.max(0,(groundOwners.get(region.world)||1)-1);
  if(owners)groundOwners.set(region.world,owners);
  else {groundOwners.delete(region.world);releaseGroundCaches(region.world);}
}

function marker(root, world, x, z, color) {
  const y = world.groundY(x, z);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(0.8, 0.8, 1);
  s.position.set(x, y + 3.2, z);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), toon(color, { emissive: color, emissiveIntensity: 0.6 }));
  gem.position.set(x, y + 3.2, z);
  gem.userData.baseY = y + 3.2;
  root.add(s, gem);
  return gem;
}
