// Prepare immutable native scenes once during the opaque initial load. Movement
// only changes visibility; no terrain build, GPU colour readback or imports run.
import * as THREE from 'three';
import { startRegion, placeRegion } from './region.js';
import { compactResidentGeometry } from './resident-geometry.js';
import { prepareSpatialRegion, updateSpatialRegion, restoreSpatialRegion } from './spatial-region.js';

// compileAsync prepares programs but does not upload vertex buffers. Submit every
// drawable once to a tiny private target before revealing the world, including
// off-camera geometry. Borrow objects without changing their actual parent.
export function* warmResidentSteps(view, region) {
  const objects=[];
  region.root.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine||o.isSprite)objects.push(o);});
  const scene=new THREE.Scene();
  scene.fog=view.scene.fog;
  const compileBatch=new THREE.Group();
  const target=new THREE.WebGLRenderTarget(8,8,{depthBuffer:true});
  const renderer=view.renderer, previous=renderer.getRenderTarget();
  const previousFace=renderer.getActiveCubeFace?.()??0,previousMip=renderer.getActiveMipmapLevel?.()??0;
  const shadowEnabled=renderer.shadowMap.enabled;
  const lightNodes=[view.hemisphere,view.sun,view.sun.target];
  try {
    for(let i=0;i<objects.length;i+=12){
      const batch=objects.slice(i,i+12),flags=batch.map(o=>[o.frustumCulled,o.visible]);
      try {
        scene.children=[...lightNodes,...batch];
        for(const o of batch){o.frustumCulled=false;o.visible=true;}
        // Compile the exact gameplay shadow/output variant too. The tiny upload
        // draw deliberately has shadows off; High uses a post target (linear
        // output), while direct rendering uses the canvas output variant.
        // Borrow drawable objects only: adding these lights to both compile
        // scenes would duplicate the light counts in the resulting shader key.
        compileBatch.children=batch;
        renderer.shadowMap.enabled=shadowEnabled;
        renderer.setRenderTarget(view.post?target:null);
        renderer.compile(compileBatch,view.camera,view.scene);
        compileBatch.children=[];
        renderer.shadowMap.enabled=false;
        renderer.setRenderTarget(target);
        renderer.render(scene,view.camera);
      } finally {
        renderer.setRenderTarget(previous,previousFace,previousMip);renderer.shadowMap.enabled=shadowEnabled;
        batch.forEach((o,j)=>{[o.frustumCulled,o.visible]=flags[j];});
        scene.children=[];
        compileBatch.children=[];
      }
      yield;
    }
  } finally {renderer.setRenderTarget(previous,previousFace,previousMip);renderer.shadowMap.enabled=shadowEnabled;scene.children=[];compileBatch.children=[];target.dispose();}
}

export async function prepareResidentWorld(view, worlds) {
  const origin=view.coordinateOrigin;
  for(const world of Object.values(worlds)){
    if(view.regions.has(world.data.id))continue;
    view.regions.set(world.data.id,startRegion(view,world));
  }
  // Full imported readiness, not merely terrain/static readiness. A dock, city or
  // landmark cannot become visible later as the player approaches its cell.
  await Promise.all([...view.regions.values()].map(region=>region.ready));
  for (const region of view.regions.values()) if (region.grassError) throw region.grassError;
  // Pack all shared buffers before warming any region: aliases across regions
  // must never invalidate a buffer after its first gameplay-ready upload.
  for(const region of view.regions.values()) region.bufferStats = compactResidentGeometry(region);
  for(const [id,region] of view.regions){
    const [x,z]=region.world.data.atlas.offset;
    placeRegion(region,x-origin[0],z-origin[1]);
    view.ensureWreck(region);
    view.scene.add(region.root);
    if(region!==view.region)view.neighbours.set(id,{region,steps:null,buildMs:0});
    await view.buildQueue.enqueue(warmResidentSteps(view,region),{signal:region.controller.signal,label:'world.upload.'+id}).promise;
    prepareSpatialRegion(region);
  }
  refreshResidentCollections(view);
  view.worldPrepared=true;
  return {status:'world-ready',regions:view.regions.size};
}

export function refreshResidentCollections(view){
  const npcs=[],markers=[],fires=[],chimneys=[],grass=[],stones=new Map();
  for(const [id,r] of view.regions){
    const dx=r.root.position.x,dz=r.root.position.z;
    for(const n of r.npcs){n.regionWorld=r.world;npcs.push(n);}
    markers.push(...r.npcMarkers);grass.push(...r.grass);
    for(const f of r.fires)fires.push({...f,x:f.x+dx,z:f.z+dz});
    for(const c of r.chimneys)chimneys.push(c.clone().add(new THREE.Vector3(dx,0,dz)));
    for(const [key,stone] of r.waypointStones){stone.userData.worldId=id;stone.userData.waypointId=key;stones.set(id+'/'+key,stone);}
  }
  Object.assign(view,{residentNpcs:npcs,residentMarkers:markers,residentFires:fires,residentChimneys:chimneys,residentStones:stones,grassList:grass});
}
export function updateResidentVisibility(view){
  for(const region of view.regions.values())updateSpatialRegion(region,view.camera,view.renderer.shadowMap.enabled ? view.sun : null);
}
export function restoreResidentVisibility(view){
  for(const region of view.regions.values())restoreSpatialRegion(region);
}
