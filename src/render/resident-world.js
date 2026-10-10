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
  // Keep material-array surfaces apart from single-material hulls borrowing the
  // same geometry. Group draw limits are ignored by a single-material mesh.
  const objectLists=[[],[]];
  region.root.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine||o.isSprite)objectLists[Array.isArray(o.material)?1:0].push(o);});
  const scene=new THREE.Scene();
  scene.fog=view.scene.fog;
  const compileBatch=new THREE.Group();
  const target=new THREE.WebGLRenderTarget(8,8,{depthBuffer:true});
  const renderer=view.renderer, previous=renderer.getRenderTarget();
  const previousFace=renderer.getActiveCubeFace?.()??0,previousMip=renderer.getActiveMipmapLevel?.()??0;
  const shadowEnabled=renderer.shadowMap.enabled;
  const shadowAutoUpdate=renderer.shadowMap.autoUpdate,shadowNeedsUpdate=renderer.shadowMap.needsUpdate;
  const sortObjects=renderer.sortObjects;
  const lightNodes=[view.hemisphere,view.sun,view.sun.target];
  // Normal startup warmup already created these maps. Preserve the previous
  // upload variant if that warmup failed before a required map was allocated.
  const uploadShadowEnabled=shadowEnabled&&lightNodes.every(light=>!light.isLight||!light.castShadow||!!light.shadow?.map);
  const stats=region.warmStats={stage:'warming',phase:'frame-advance',drawables:objectLists[0].length+objectLists[1].length,
    batches:0,sourceVertices:0,submittedVertices:0,submittedTriangles:0,submittedCalls:0,compileMs:0,submitMs:0,maxBatchMs:0};
  (region.stats??={}).residentWarm=stats;
  const started=performance.now();
  try {
    // Geometry disposal does not clear WebGLObjects' per-frame update cache.
    // Advance its frame after compaction so the first real warm draw cannot
    // reuse an upload remembered from the last pre-compaction shadow pass.
    try {
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.sortObjects=false;
      renderer.setRenderTarget(target);renderer.render(scene,view.camera);
    } finally {renderer.setRenderTarget(previous,previousFace,previousMip);renderer.shadowMap.enabled=shadowEnabled;renderer.shadowMap.autoUpdate=shadowAutoUpdate;renderer.shadowMap.needsUpdate=shadowNeedsUpdate;renderer.sortObjects=sortObjects;}
    for(const objects of objectLists)for(let i=0;i<objects.length;i+=12){
      const batch=objects.slice(i,i+12),flags=batch.map(o=>[o.frustumCulled,o.visible,o.count]);
      const geometries=new Map();
      try {
        scene.children=[...lightNodes,...batch];
        for(const o of batch){
          o.frustumCulled=false;o.visible=true;
          const geometry=o.geometry;
          if(geometry){
            const saved=geometries.get(geometry),range=saved?.range??geometry.drawRange;
            const vertices=geometry.index?.count??geometry.attributes.position?.count??0;
            const instances=o.isInstancedMesh?o.count:geometry.isInstancedBufferGeometry?(saved?.instanceCount??geometry.instanceCount):1;
            const groups=Array.isArray(o.material)?(saved?.groups??geometry.groups):[{start:0,count:vertices}];
            for(const group of groups)stats.sourceVertices+=Math.max(0,Math.min(range.start+range.count,group.start+group.count,vertices)-Math.max(range.start,group.start))*(Number.isFinite(instances)?instances:1);
          }
          if(geometry&&!geometries.has(geometry)){
            const range={start:geometry.drawRange.start,count:geometry.drawRange.count};
            geometries.set(geometry,{range,groups:geometry.groups,instanceCount:geometry.instanceCount});
            const vertices=geometry.index?.count??geometry.attributes.position?.count??0;
            const primitive=o.isPoints?1:o.isLine?2:3;
            if(Array.isArray(o.material)){
              geometry.groups=geometry.groups.map(group=>{
                const start=Math.max(range.start,group.start),end=Math.min(range.start+range.count,group.start+group.count,vertices);
                return {...group,start,count:Math.max(0,Math.min(primitive,end-start))};
              });
            }else geometry.setDrawRange(range.start,Math.max(0,Math.min(primitive,range.count,vertices-range.start)));
            if(geometry.isInstancedBufferGeometry)geometry.instanceCount=Math.min(1,geometry.instanceCount);
          }
          // Three uploads entire attribute/instance arrays before checking draw
          // counts. Submit one primitive/instance to prepare buffers and VAOs,
          // instead of executing every off-screen world vertex on software GL.
          if(o.isInstancedMesh)o.count=Math.min(1,o.count);
        }
        // Compile the exact gameplay shadow/output variant too. High uses a post
        // target (linear output); direct rendering uses the canvas output variant.
        // Borrow drawable objects only: adding these lights to both compile
        // scenes would duplicate the light counts in the resulting shader key.
        compileBatch.children=batch;
        renderer.shadowMap.enabled=shadowEnabled;
        renderer.setRenderTarget(view.post?target:null);
        stats.phase='compile';const compileStart=performance.now();
        renderer.compile(compileBatch,view.camera,view.scene);
        stats.compileMs+=performance.now()-compileStart;
        compileBatch.children=[];
        // Freeze shadow-map updates while retaining the gameplay receiver
        // shader key. Disabling shadows here would compile an extra variant.
        renderer.shadowMap.enabled=uploadShadowEnabled;
        renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
        // Sorting computes an InstancedMesh bound even with frustum culling off.
        // Do not cache a one-instance bound while its warm count is shortened.
        renderer.sortObjects=false;
        renderer.setRenderTarget(target);
        stats.phase='upload';const submitStart=performance.now();
        const before=renderer.info?.autoReset===false?{...renderer.info.render}:null;
        renderer.render(scene,view.camera);
        const submitMs=performance.now()-submitStart;stats.submitMs+=submitMs;stats.maxBatchMs=Math.max(stats.maxBatchMs,submitMs);
        const info=renderer.info?.render;
        if(info){const triangles=info.triangles-(before?.triangles??0),lines=info.lines-(before?.lines??0),points=info.points-(before?.points??0);
          stats.submittedTriangles+=triangles;stats.submittedVertices+=triangles*3+lines*2+points;stats.submittedCalls+=info.calls-(before?.calls??0);}
        stats.batches++;
      } finally {
        renderer.setRenderTarget(previous,previousFace,previousMip);renderer.shadowMap.enabled=shadowEnabled;renderer.shadowMap.autoUpdate=shadowAutoUpdate;renderer.shadowMap.needsUpdate=shadowNeedsUpdate;renderer.sortObjects=sortObjects;
        batch.forEach((o,j)=>{o.frustumCulled=flags[j][0];o.visible=flags[j][1];if(o.isInstancedMesh)o.count=flags[j][2];});
        for(const[geometry,saved]of geometries){geometry.setDrawRange(saved.range.start,saved.range.count);geometry.groups=saved.groups;if(geometry.isInstancedBufferGeometry)geometry.instanceCount=saved.instanceCount;}
        scene.children=[];
        compileBatch.children=[];
      }
      yield;
    }
    stats.stage='ready';stats.phase='done';return stats;
  } catch(error){stats.stage='failed';stats.error=error.message;throw error;
  } finally {
    if(stats.stage==='warming')stats.stage='cancelled';stats.elapsedMs=performance.now()-started;
    renderer.setRenderTarget(previous,previousFace,previousMip);renderer.shadowMap.enabled=shadowEnabled;renderer.shadowMap.autoUpdate=shadowAutoUpdate;renderer.shadowMap.needsUpdate=shadowNeedsUpdate;renderer.sortObjects=sortObjects;scene.children=[];compileBatch.children=[];target.dispose();
  }
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
