// Native scene assembly. The game retains its renderer, camera, input, collision
// world, saving and resident visibility; approved sources supply scenery only.
import * as THREE from 'three';
import {createAcceptedScene as beach} from './accepted-scenes/beach.js';
import {createAcceptedScene as forest} from './accepted-scenes/forest.js';
import {createAcceptedScene as shell} from './accepted-scenes/shell-beach.js';
import {createAcceptedScene as mill} from './accepted-scenes/hill-windmill.js';
import {createAcceptedScene as meadow} from './accepted-scenes/azure-meadow.js';
import {createAcceptedScene as rose} from './accepted-scenes/rose-garden.js';
import {acceptedScenes,connectorClear,sceneWeight,sceneSample,sceneLift} from '../core/accepted-scenes.js';
import {distToPolyline} from '../core/math.js';
import {timeUniform} from './patch.js';
import {clipRegionGeometrySteps} from './region-ownership.js';
import {acceptedAssetSteps} from './accepted-assets.js';
import {acceptedGroundEdit,acceptedEditReach} from '../core/accepted-shift.js';
import {animeConfig,animeFoliageMaterial,animeTrunkMaterial} from './anime-study.js';
import {hullMaterial} from './patch.js';
import {grassMaterial,attachGrassSurfaceSteps} from './grass.js';
const factories={beach,forest,'shell-beach':shell,'hill-windmill':mill,'azure-meadow':meadow,'rose-garden':rose};
export function* acceptedScenerySteps(world,renderer,{adopt}={}){
 const root=new THREE.Group();root.name='accepted-concept-scenes';adopt?.(root);
 const animations=[],waypoints=new Map(),textures=new Set(),depthMaterials=new Set();
 // The scenes' trees, shrubs and grass are the map's own (factories tag them, data:
 // acceptedScenes.foliage): one set of the game's materials for all six scenes.
 const foliage=world.data.acceptedScenes?.foliage||null,gameMaterials={};
 const gameMaterial=kind=>gameMaterials[kind]??=kind==='crown'?animeFoliageMaterial(false):kind==='shrub'?animeFoliageMaterial(true):kind==='trunk'?animeTrunkMaterial():kind==='hull'?hullMaterial(animeConfig.palette.trunkLine,animeConfig.trunk.outlineWidth,{see:true}):grassMaterial(world);
 for(const spec of acceptedScenes(world.data)){
  yield;
  const assets=spec.id==='shell-beach'?yield* acceptedAssetSteps():{};
  const result=factories[spec.id]({renderer,time:timeUniform,clipBounds:spec.box,assets,foliage:foliage&&sceneFoliage(foliage,spec)}),source=result.root;
  source.name='accepted-'+spec.id;source.position.set(spec.x,spec.y,spec.z);source.scale.setScalar(spec.s);root.add(source);root.updateMatrixWorld(true);
  const dynamic=new Set();
  const keep=o=>o?.traverse(n=>dynamic.add(n));
  if(result.waypoint){
   const stone=result.waypoint.root;keep(stone);stone.name='arrival-waypoint-rebuilding-stone';
   stone.userData.updateAccepted=(dt,t,on,px,pz)=>result.update(dt,t,on&&(result.waypoint.active||Math.hypot(px-stone.matrixWorld.elements[12],pz-stone.matrixWorld.elements[14])<4.8));stone.userData.waypointId='landing';waypoints.set('landing',stone);
  }
  // The rotor remains separate from the static scenery batches.
  if(result.landmark?.rotor){keep(result.landmark.rotor);result.landmark.rotor.userData.spatialDynamic=true;animations.push(result);}
  // Animated parts are not baked: they move whole with the ground edit under them (lift).
  for(const o of [result.landmark?.rotor,result.waypoint?.root])if(o)seatWhole(world,spec,o);
  const meshes=[];source.traverse(o=>{if(o.isMesh||o.isPoints)meshes.push(o);});
  // repair connectors pruned by their boxes (the check runs for every vertex)
  const repairs=world.data.acceptedScenes.connectors.filter(r=>r.repair).map(r=>{const pad=r.width/2+2.5,xs=r.points.map(p=>p[0]),zs=r.points.map(p=>p[1]);return {r,box:[Math.min(...xs)-pad,Math.max(...xs)+pad,Math.min(...zs)-pad,Math.max(...zs)+pad]};});
  const nearRepair=(x,z)=>repairs.some(({r,box})=>x>=box[0]&&x<=box[1]&&z>=box[2]&&z<=box[3]&&distToPolyline(x,z,r.points)<r.width/2+2.5);
  const b=spec.bounds,clipWorld={bounds:{minX:b[0],maxX:b[1],minZ:b[2],maxZ:b[3]},seams:[{edge:'minX',outward:-1,alongX:false},{edge:'maxX',outward:1,alongX:false},{edge:'minZ',outward:-1,alongX:true},{edge:'maxZ',outward:1,alongX:true}]};
  for(const mesh of meshes){
   if(mesh.customDepthMaterial)depthMaterials.add(mesh.customDepthMaterial);
   // the game's shared textures (the foliage leaf map) are not the scene's to free
   const own=t=>t?.isTexture&&!t.userData?.shared;
   for(const mat of[mesh.material,mesh.customDepthMaterial])if(mat){for(const v of Object.values(mat))if(own(v))textures.add(v);if(mat.uniforms)for(const u of Object.values(mat.uniforms))if(own(u.value))textures.add(u.value);}
   if(dynamic.has(mesh))continue;
   if(mesh.isPoints){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();continue;}
   const kind=foliage&&mesh.isInstancedMesh?mesh.geometry.userData.gameFoliage:null;
   // a scene's own trunk outline gives way to the game's hull (added below)
   if(kind==='trunk'&&mesh.material.side===THREE.BackSide){mesh.removeFromParent();mesh.material.dispose();continue;}
   const matrix=mesh.matrixWorld.clone();let placed=[mesh];
   if(mesh.isInstancedMesh){
    const m=new THREE.Matrix4(),color=new THREE.Color(),p=new THREE.Vector3();let count=0;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const cover=mesh.geometry.boundingBox.max.y-mesh.geometry.boundingBox.min.y<1.6; // grass, flowers, shrubs
    for(let i=0;i<mesh.count;i++){
     mesh.getMatrixAt(i,m);m.premultiply(matrix);p.setFromMatrixPosition(m);
     // Every instance stands on the ground the player walks on (feather, seams,
     // connectors and shore all move it); only those at the very edge are left out,
     // and ground cover where the game's sea runs over the scene's old shore.
     if(sceneWeight(spec,p.x,p.z)<.1||connectorClear(world.data,p.x,p.z,1.2))continue;
     if(cover&&spec.shore&&p.y-sceneSample(spec,'heights',p.x,p.z)<1&&world.inSea(p.x,p.z))continue;
     m.elements[13]+=world.groundY(p.x,p.z)-sceneSample(spec,'heights',p.x,p.z);
     mesh.setMatrixAt(count,m);if(mesh.instanceColor){mesh.getColorAt(i,color);mesh.setColorAt(count,color);}count++;
    }
    mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    // As the map's own plants: one piece per chunk, so a camera or the sun's shadow
    // box draws only the pieces it reaches (grass keeps its own per-clump culling).
    placed=kind==='grass'||!foliage?.chunk?[mesh]:splitInstances(mesh,foliage.chunk);
    if(kind)for(const part of placed)yield* gameFoliageSteps(world,part,kind,gameMaterial,foliage,root);
   }else{
    // Copy before baking: hulls may share a geometry with their visible surface.
    const original=mesh.geometry;mesh.geometry=original.clone().applyMatrix4(matrix);
    if(mesh.geometry.userData.rigidParts)yield* seatRigidParts(world,spec,mesh);
    const positions=mesh.geometry.attributes.position,reach=acceptedEditReach(world.data,spec,world.heightfield.acceptedConnectors),lift=sceneLift(world.data,spec);
    if(!mesh.geometry.userData.rigidParts)for(let i=0;i<positions.count;i++){
     if(i%16384===16383)yield;
     const x=positions.getX(i),z=positions.getZ(i),w=sceneWeight(spec,x,z);const repair=nearRepair(x,z);
     // Inside, follow the world's later edits (connectors, seams, shore); they leave cliffs scaled with the ground.
     // Out of every edit's reach the ground differs from the scene only by its lift.
     if(w>=.999&&!repair){if(!reach(x,z)){if(lift)positions.setY(i,positions.getY(i)+lift);continue;}const shift=acceptedGroundEdit(world.data,spec,x,z,world.heightfield.acceptedConnectors).shift;if(Math.abs(shift)>.002)positions.setY(i,positions.getY(i)+shift);continue;}
     const base=sceneSample(spec,'heights',x,z);positions.setY(i,world.groundY(x,z)+(positions.getY(i)-base)*w);
    }
    if(mesh.name==='accepted-cliffs')for(const road of world.data.acceptedScenes.connectors.filter(r=>r.repair))for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);if(distToPolyline(x,z,road.points)<road.width/2+1)positions.setY(i,Math.min(positions.getY(i),world.groundY(x,z)-.08));}
    mesh.geometry=yield* clipRegionGeometrySteps(mesh.geometry,clipWorld);
    if(!mesh.userData.authoredNormals)mesh.geometry.computeVertexNormals(); // imported models keep their smooth normals
   }
   // All fixed vertices/instances are now region-local, ready for cell batching.
   for(const o of placed){root.add(o);o.position.set(0,0,0);o.quaternion.identity();o.scale.setScalar(1);o.updateMatrix();}
   if(placed[0]!==mesh)mesh.removeFromParent();
   mesh.geometry.computeBoundingSphere();mesh.geometry.computeBoundingBox();
   yield;
  }
  // CPU closures also own non-rendered construction geometry and private depth
  // materials. Release it when the whole resident region is disposed.
  result.root=source;
 }
 root.userData.acceptedAnimations=animations;
 root.userData.disposeAcceptedTextures=()=>{for(const t of textures)t.dispose();textures.clear();for(const m of depthMaterials)m.dispose();depthMaterials.clear();};
 return {root,waypoints,animations};
}
// Tree sizes for one factory, in its own units (world / spec.s): ordinary trees by the
// scene's scale, the listed big trees at their own size.
function sceneFoliage(foliage,spec){
 const big=(foliage.bigTrees||[]).filter(b=>b.scene===spec.id).map(b=>({x:(b.at[0]-spec.x)/spec.s,z:(b.at[1]-spec.z)/spec.s,s:b.size/spec.s,r:1/spec.s}));
 return {scale:foliage.treeScale?.[spec.id]??1,big};
}
// A tagged scene mesh takes the map's material: crowns the map's tint, trunks the
// game's ink hull, grass the game's ground-coloured blades (baked with the map's grass).
function* gameFoliageSteps(world,mesh,kind,gameMaterial,foliage,root){
 mesh.material.dispose();mesh.material=gameMaterial(kind);
 if(kind==='crown'&&mesh.instanceColor){
  const tint=new THREE.Color(foliage.crownTint),c=new THREE.Color();
  for(let i=0;i<mesh.count;i++){mesh.getColorAt(i,c);mesh.setColorAt(i,c.multiply(tint));}
  mesh.instanceColor.needsUpdate=true;
 }
 if(kind==='trunk'){
  const hull=new THREE.InstancedMesh(mesh.geometry,gameMaterial('hull'),mesh.count);
  hull.instanceMatrix.copy(mesh.instanceMatrix);hull.instanceMatrix.needsUpdate=true;hull.computeBoundingSphere();root.add(hull);
 }
 if(kind==='grass'){
  const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),items=[];
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);m.decompose(p,q,sc);items.push({x:p.x,z:p.z,sx:sc.x,sy:sc.y,sz:sc.z});}
  mesh.castShadow=false;yield* attachGrassSurfaceSteps(mesh,items,world);
 }
}
// Instances (already world-placed) regrouped into size-metre square pieces that share
// the geometry and material; the scene-wide original only gives up its instance buffers.
function splitInstances(mesh,size){
 const m=new THREE.Matrix4(),c=new THREE.Color(),cells=new Map();
 for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);const k=Math.floor(m.elements[12]/size)+','+Math.floor(m.elements[14]/size);let ids=cells.get(k);if(!ids)cells.set(k,ids=[]);ids.push(i);}
 if(cells.size<2)return [mesh];
 const parts=[];
 for(const ids of cells.values()){
  const part=new THREE.InstancedMesh(mesh.geometry,mesh.material,ids.length);
  part.name=mesh.name;part.castShadow=mesh.castShadow;part.receiveShadow=mesh.receiveShadow;part.renderOrder=mesh.renderOrder;part.frustumCulled=mesh.frustumCulled;
  part.customDepthMaterial=mesh.customDepthMaterial;part.customDistanceMaterial=mesh.customDistanceMaterial;part.userData={...mesh.userData};
  ids.forEach((id,j)=>{mesh.getMatrixAt(id,m);part.setMatrixAt(j,m);if(mesh.instanceColor){mesh.getColorAt(id,c);part.setColorAt(j,c);}});
  part.instanceMatrix.needsUpdate=true;if(part.instanceColor)part.instanceColor.needsUpdate=true;
  parts.push(part);
 }
 mesh.dispose();
 return parts;
}
function seatWhole(world,spec,o){
 const p=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld),edit=acceptedGroundEdit(world.data,spec,p.x,p.z,world.heightfield.acceptedConnectors);
 if(Math.abs(edit.shift)<.002)return;
 p.y+=edit.shift;o.parent.worldToLocal(p);o.position.copy(p);o.updateMatrixWorld(true);
}
// Stones are separate parts (factory groups): each moves whole with the ground
// under its centre, and one the feather or a later edit would squash below half
// its height is left out instead of being flattened into a wedge.
function* seatRigidParts(world,spec,mesh){
 const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry,pos=g.attributes.position,keep=[],reach=acceptedEditReach(world.data,spec,world.heightfield.acceptedConnectors);let kept=0;
 for(const group of g.groups){
  let cx=0,cz=0;for(let i=group.start;i<group.start+group.count;i++){cx+=pos.getX(i);cz+=pos.getZ(i);}
  cx/=group.count;cz/=group.count;
  const w=sceneWeight(spec,cx,cz),edit=w>=.999?(reach(cx,cz)?acceptedGroundEdit(world.data,spec,cx,cz,world.heightfield.acceptedConnectors):{shift:sceneLift(world.data,spec),keep:1}):null,share=edit?edit.keep:w;
  if(share<.5)continue;
  const shift=edit?edit.shift:world.groundY(cx,cz)-sceneSample(spec,'heights',cx,cz);
  if(Math.abs(shift)>.002)for(let i=group.start;i<group.start+group.count;i++)pos.setY(i,pos.getY(i)+shift);
  keep.push(group);kept+=group.count;
  if(keep.length%256===0)yield;
 }
 const out=new THREE.BufferGeometry();
 for(const[name,a]of Object.entries(g.attributes)){
  const data=new a.array.constructor(kept*a.itemSize);let at=0;
  for(const group of keep){data.set(a.array.subarray(group.start*a.itemSize,(group.start+group.count)*a.itemSize),at);at+=group.count*a.itemSize;}
  out.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize,a.normalized));
 }
 if(g!==mesh.geometry)g.dispose();
 mesh.geometry.dispose();mesh.geometry=out;
}
