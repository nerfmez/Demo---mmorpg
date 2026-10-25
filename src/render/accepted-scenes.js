// Native scene assembly. The game retains its renderer, camera, input, collision
// world, saving and resident visibility; approved sources supply scenery only.
import * as THREE from 'three';
import {createAcceptedScene as beach} from './accepted-scenes/beach.js';
import {createAcceptedScene as forest} from './accepted-scenes/forest.js';
import {createAcceptedScene as shell} from './accepted-scenes/shell-beach.js';
import {createAcceptedScene as mill} from './accepted-scenes/hill-windmill.js';
import {createAcceptedScene as meadow} from './accepted-scenes/azure-meadow.js';
import {createAcceptedScene as rose} from './accepted-scenes/rose-garden.js';
import {acceptedScenes,connectorClear,sceneWeight,sceneSample} from '../core/accepted-scenes.js';
import {distToPolyline} from '../core/math.js';
import {timeUniform} from './patch.js';
import {clipRegionGeometrySteps} from './region-ownership.js';
import {acceptedAssetSteps} from './accepted-assets.js';
import {acceptedGroundEdit,acceptedEditReach} from '../core/accepted-shift.js';
const factories={beach,forest,'shell-beach':shell,'hill-windmill':mill,'azure-meadow':meadow,'rose-garden':rose};
export function* acceptedScenerySteps(world,renderer,{adopt}={}){
 const root=new THREE.Group();root.name='accepted-concept-scenes';adopt?.(root);
 const animations=[],waypoints=new Map(),textures=new Set(),depthMaterials=new Set();
 for(const spec of acceptedScenes(world.data)){
  yield;
  const assets=spec.id==='shell-beach'?yield* acceptedAssetSteps():{};
  const result=factories[spec.id]({renderer,time:timeUniform,clipBounds:spec.box,assets}),source=result.root;
  source.name='accepted-'+spec.id;source.position.set(spec.x,spec.y,spec.z);source.scale.setScalar(spec.s);root.add(source);root.updateMatrixWorld(true);
  const dynamic=new Set();
  const keep=o=>o?.traverse(n=>dynamic.add(n));
  if(result.waypoint){
   const stone=result.waypoint.root;keep(stone);stone.name='arrival-waypoint-rebuilding-stone';
   stone.userData.updateAccepted=(dt,t,on,px,pz)=>result.update(dt,t,on&&(result.waypoint.active||Math.hypot(px-stone.matrixWorld.elements[12],pz-stone.matrixWorld.elements[14])<4.8));stone.userData.waypointId='landing';waypoints.set('landing',stone);
  }
  // The rotor remains separate from the static scenery batches.
  if(result.landmark?.rotor){keep(result.landmark.rotor);result.landmark.rotor.userData.spatialDynamic=true;animations.push(result);}
  const meshes=[];source.traverse(o=>{if(o.isMesh||o.isPoints)meshes.push(o);});
  // repair connectors pruned by their boxes (the check runs for every vertex)
  const repairs=world.data.acceptedScenes.connectors.filter(r=>r.repair).map(r=>{const pad=r.width/2+2.5,xs=r.points.map(p=>p[0]),zs=r.points.map(p=>p[1]);return {r,box:[Math.min(...xs)-pad,Math.max(...xs)+pad,Math.min(...zs)-pad,Math.max(...zs)+pad]};});
  const nearRepair=(x,z)=>repairs.some(({r,box})=>x>=box[0]&&x<=box[1]&&z>=box[2]&&z<=box[3]&&distToPolyline(x,z,r.points)<r.width/2+2.5);
  const b=spec.bounds,clipWorld={bounds:{minX:b[0],maxX:b[1],minZ:b[2],maxZ:b[3]},seams:[{edge:'minX',outward:-1,alongX:false},{edge:'maxX',outward:1,alongX:false},{edge:'minZ',outward:-1,alongX:true},{edge:'maxZ',outward:1,alongX:true}]};
  for(const mesh of meshes){
   if(mesh.customDepthMaterial)depthMaterials.add(mesh.customDepthMaterial);
   for(const mat of[mesh.material,mesh.customDepthMaterial])if(mat){for(const v of Object.values(mat))if(v?.isTexture)textures.add(v);if(mat.uniforms)for(const u of Object.values(mat.uniforms))if(u.value?.isTexture)textures.add(u.value);}
   if(dynamic.has(mesh))continue;
   if(mesh.isPoints){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();continue;}
   const matrix=mesh.matrixWorld.clone();
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
   }else{
    // Copy before baking: hulls may share a geometry with their visible surface.
    const original=mesh.geometry;mesh.geometry=original.clone().applyMatrix4(matrix);
    if(mesh.geometry.userData.rigidParts)yield* seatRigidParts(world,spec,mesh);
    const positions=mesh.geometry.attributes.position,reach=acceptedEditReach(world.data,spec,world.heightfield.acceptedConnectors);
    if(!mesh.geometry.userData.rigidParts)for(let i=0;i<positions.count;i++){
     if(i%16384===16383)yield;
     const x=positions.getX(i),z=positions.getZ(i),w=sceneWeight(spec,x,z);const repair=nearRepair(x,z);
     // Inside, follow the world's later edits (connectors, seams, shore); they leave cliffs scaled with the ground.
     if(w>=.999&&!repair){if(!reach(x,z))continue;const shift=acceptedGroundEdit(world.data,spec,x,z,world.heightfield.acceptedConnectors).shift;if(Math.abs(shift)>.002)positions.setY(i,positions.getY(i)+shift);continue;}
     const base=sceneSample(spec,'heights',x,z);positions.setY(i,world.groundY(x,z)+(positions.getY(i)-base)*w);
    }
    if(mesh.name==='accepted-cliffs')for(const road of world.data.acceptedScenes.connectors.filter(r=>r.repair))for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);if(distToPolyline(x,z,road.points)<road.width/2+1)positions.setY(i,Math.min(positions.getY(i),world.groundY(x,z)-.08));}
    mesh.geometry=yield* clipRegionGeometrySteps(mesh.geometry,clipWorld);
    if(!mesh.userData.authoredNormals)mesh.geometry.computeVertexNormals(); // imported models keep their smooth normals
   }
   // All fixed vertices/instances are now region-local, ready for cell batching.
   root.add(mesh);mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.setScalar(1);mesh.updateMatrix();
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
// Stones are separate parts (factory groups): each moves whole with the ground
// under its centre, and one the feather or a later edit would squash below half
// its height is left out instead of being flattened into a wedge.
function* seatRigidParts(world,spec,mesh){
 const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry,pos=g.attributes.position,keep=[],reach=acceptedEditReach(world.data,spec,world.heightfield.acceptedConnectors);let kept=0;
 for(const group of g.groups){
  let cx=0,cz=0;for(let i=group.start;i<group.start+group.count;i++){cx+=pos.getX(i);cz+=pos.getZ(i);}
  cx/=group.count;cz/=group.count;
  const w=sceneWeight(spec,cx,cz),edit=w>=.999?(reach(cx,cz)?acceptedGroundEdit(world.data,spec,cx,cz,world.heightfield.acceptedConnectors):{shift:0,keep:1}):null,share=edit?edit.keep:w;
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
