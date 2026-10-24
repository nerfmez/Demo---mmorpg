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
const factories={beach,forest,'shell-beach':shell,'hill-windmill':mill,'azure-meadow':meadow,'rose-garden':rose};
export function* acceptedScenerySteps(world,renderer,{adopt}={}){
 const root=new THREE.Group();root.name='accepted-concept-scenes';adopt?.(root);
 const animations=[],waypoints=new Map(),textures=new Set(),depthMaterials=new Set();
 for(const spec of acceptedScenes(world.data)){
  yield;
  const result=factories[spec.id]({renderer,time:timeUniform,clipBounds:spec.box}),source=result.root;
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
  const b=spec.bounds,clipWorld={bounds:{minX:b[0],maxX:b[1],minZ:b[2],maxZ:b[3]},seams:[{edge:'minX',outward:-1,alongX:false},{edge:'maxX',outward:1,alongX:false},{edge:'minZ',outward:-1,alongX:true},{edge:'maxZ',outward:1,alongX:true}]};
  for(const mesh of meshes){
   if(mesh.customDepthMaterial)depthMaterials.add(mesh.customDepthMaterial);
   for(const mat of[mesh.material,mesh.customDepthMaterial])if(mat){for(const v of Object.values(mat))if(v?.isTexture)textures.add(v);if(mat.uniforms)for(const u of Object.values(mat.uniforms))if(u.value?.isTexture)textures.add(u.value);}
   if(dynamic.has(mesh))continue;
   if(mesh.isPoints){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();continue;}
   const matrix=mesh.matrixWorld.clone();
   if(mesh.isInstancedMesh){
    const m=new THREE.Matrix4(),color=new THREE.Color(),p=new THREE.Vector3();let count=0;
    for(let i=0;i<mesh.count;i++){
     mesh.getMatrixAt(i,m);m.premultiply(matrix);p.setFromMatrixPosition(m);
     if(sceneWeight(spec,p.x,p.z)<.35||connectorClear(world.data,p.x,p.z,1.2))continue;
     if(sceneWeight(spec,p.x,p.z)<.999)m.elements[13]+=world.groundY(p.x,p.z)-sceneSample(spec,'heights',p.x,p.z);
     mesh.setMatrixAt(count,m);if(mesh.instanceColor){mesh.getColorAt(i,color);mesh.setColorAt(count,color);}count++;
    }
    mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
   }else{
    // Copy before baking: hulls may share a geometry with their visible surface.
    const original=mesh.geometry;mesh.geometry=original.clone().applyMatrix4(matrix);
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i),w=sceneWeight(spec,x,z);const repair=world.data.acceptedScenes.connectors.find(r=>r.repair&&distToPolyline(x,z,r.points)<r.width/2+2.5);if(w>=.999&&!repair)continue;const base=sceneSample(spec,'heights',x,z);positions.setY(i,world.groundY(x,z)+(positions.getY(i)-base)*w);}
    if(mesh.name==='accepted-cliffs')for(const road of world.data.acceptedScenes.connectors.filter(r=>r.repair))for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);if(distToPolyline(x,z,road.points)<road.width/2+1)positions.setY(i,Math.min(positions.getY(i),world.groundY(x,z)-.08));}
    mesh.geometry=yield* clipRegionGeometrySteps(mesh.geometry,clipWorld);mesh.geometry.computeVertexNormals();
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
