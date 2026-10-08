import * as THREE from 'three';

// Keep the authored clumps, their wind envelope and baked colours. Only compact the
// draw buffers to omit fully off-camera spheres inside otherwise visible chunks.
// CPU storage is allocated once after baking; moving the camera creates no arrays
// or GPU objects. The original chunk bounds stay conservative when count changes.
const grassClipMatrix=new THREE.Matrix4(),grassFrustum=new THREE.Frustum();
export function prepareGrassCulling(mesh){
  const attributes=[mesh.instanceMatrix,...Object.values(mesh.geometry.attributes).filter(a=>a.isInstancedBufferAttribute)];
  const sources=attributes.map(a=>a.array.slice());
  // Immutable full-chunk envelope includes the authored wind sphere of every clump.
  const box=new THREE.Box3(),p=new THREE.Vector3(),r=mesh.userData.grassRadii;
  for(let i=0;i<mesh.count;i++){
    const k=i*16,x=sources[0][k+12],y=sources[0][k+13],z=sources[0][k+14];
    box.expandByPoint(p.set(x-r[i],y-r[i],z-r[i]));box.expandByPoint(p.set(x+r[i],y+r[i],z+r[i]));
  }
  const state={enabled:true,lastEnabled:null,bounds:box.getBoundingSphere(new THREE.Sphere()),lastTested:0,count:mesh.count,radii:r,
    matrix:new Float64Array(16).fill(NaN),indices:new Int32Array(mesh.count).fill(-1),attributes,sources};
  mesh.userData.grassCulling=state;
}
// Scene hooks run after world/camera matrices update and before render-list
// construction uploads attributes. Object hooks would leave this draw one frame
// behind the camera: count changes immediately, but reordered GPU buffers do not.
// `source` is a root to collect from once, or a function returning the current meshes
// (the open world adds and drops a neighbouring map's grass).
export function installGrassCulling(scene,source){
  const meshes=[];if(typeof source!=='function')source.traverse(o=>{if(o.userData.grassCulling)meshes.push(o);});
  const list=typeof source==='function'?source:()=>meshes;
  const previous=scene.onBeforeRender;
  scene.onBeforeRender=function(renderer,renderedScene,camera,target){
    previous.call(this,renderer,renderedScene,camera,target);
    for(const mesh of list())updateGrassVisibility(mesh,camera);
  };
}
export function updateGrassVisibility(mesh,camera){
  const s=mesh.userData.grassCulling;
  grassClipMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(mesh.matrixWorld);
  const matrix=grassClipMatrix.elements;
  let changed=s.lastEnabled!==s.enabled;
  for(let i=0;i<16;i++)if(s.matrix[i]!==matrix[i])changed=true;
  if(!changed)return;
  s.matrix.set(matrix);s.lastEnabled=s.enabled;s.lastTested=0;
  grassFrustum.setFromProjectionMatrix(grassClipMatrix);
  if(s.enabled&&!grassFrustum.intersectsSphere(s.bounds)){mesh.count=0;return;}
  const transforms=s.sources[0];let count=0,first=-1;
  for(let i=0;i<s.count;i++){
    s.lastTested++;
    const offset=i*16,x=transforms[offset+12],y=transforms[offset+13],z=transforms[offset+14],radius=s.radii[i];
    let visible=true;
    if(s.enabled)for(let k=0;k<6;k++){
      const plane=grassFrustum.planes[k],n=plane.normal;
      if(n.x*x+n.y*y+n.z*z+plane.constant < -radius){visible=false;break;}
    }
    if(!visible)continue;
    if(s.indices[count]!==i){s.indices[count]=i;if(first<0)first=count;}
    count++;
  }
  if(first<0){if(count!==mesh.count)mesh.count=count;return;}
  // Only the reordered tail is rewritten and uploaded; the unchanged prefix and
  // the slots past count stay on the GPU as they were.
  for(let a=0;a<s.attributes.length;a++){
    const attribute=s.attributes[a],source=s.sources[a],size=attribute.itemSize,target=attribute.array;
    for(let i=first;i<count;i++)for(let j=0;j<size;j++)target[i*size+j]=source[s.indices[i]*size+j];
    attribute.clearUpdateRanges();attribute.addUpdateRange(first*size,(count-first)*size);
    attribute.needsUpdate=true;
  }
  mesh.count=count;
}
