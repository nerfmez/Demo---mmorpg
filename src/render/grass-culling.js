import * as THREE from 'three';

// Keep the authored clumps, their wind envelope and baked colours. Only compact the
// draw buffers to omit fully off-camera spheres inside otherwise visible chunks.
// CPU storage is allocated once after baking; moving the camera creates no arrays
// or GPU objects. The original chunk bounds stay conservative when count changes.
const grassClipMatrix=new THREE.Matrix4(),grassFrustum=new THREE.Frustum();
export function prepareGrassCulling(mesh){
  const attributes=[mesh.instanceMatrix,...Object.values(mesh.geometry.attributes).filter(a=>a.isInstancedBufferAttribute)];
  const sources=attributes.map(a=>a.array.slice());
  const state={enabled:true,lastEnabled:null,count:mesh.count,radii:mesh.userData.grassRadii,
    matrix:new Float64Array(16).fill(NaN),indices:new Int32Array(mesh.count).fill(-1),attributes,sources};
  mesh.userData.grassCulling=state;
}
// Scene hooks run after world/camera matrices update and before render-list
// construction uploads attributes. Object hooks would leave this draw one frame
// behind the camera: count changes immediately, but reordered GPU buffers do not.
export function installGrassCulling(scene,root){
  const meshes=[];root.traverse(o=>{if(o.userData.grassCulling)meshes.push(o);});
  const previous=scene.onBeforeRender;
  scene.onBeforeRender=function(renderer,renderedScene,camera,target){
    previous.call(this,renderer,renderedScene,camera,target);
    for(const mesh of meshes)updateGrassVisibility(mesh,camera);
  };
}
export function updateGrassVisibility(mesh,camera){
  const s=mesh.userData.grassCulling;
  grassClipMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(mesh.matrixWorld);
  const matrix=grassClipMatrix.elements;
  let changed=s.lastEnabled!==s.enabled;
  for(let i=0;i<16;i++)if(s.matrix[i]!==matrix[i])changed=true;
  if(!changed)return;
  s.matrix.set(matrix);s.lastEnabled=s.enabled;
  grassFrustum.setFromProjectionMatrix(grassClipMatrix);
  const transforms=s.sources[0];let count=0,dirty=false;
  for(let i=0;i<s.count;i++){
    const offset=i*16,x=transforms[offset+12],y=transforms[offset+13],z=transforms[offset+14],radius=s.radii[i];
    let visible=true;
    if(s.enabled)for(let k=0;k<6;k++){
      const plane=grassFrustum.planes[k],n=plane.normal;
      if(n.x*x+n.y*y+n.z*z+plane.constant < -radius){visible=false;break;}
    }
    if(!visible)continue;
    if(s.indices[count]!==i){s.indices[count]=i;dirty=true;}
    count++;
  }
  if(count!==mesh.count)dirty=true;
  if(!dirty)return;
  for(let a=0;a<s.attributes.length;a++){
    const attribute=s.attributes[a],source=s.sources[a],size=attribute.itemSize,target=attribute.array;
    for(let i=0;i<count;i++)for(let j=0;j<size;j++)target[i*size+j]=source[s.indices[i]*size+j];
    attribute.needsUpdate=true;
  }
  mesh.count=count;
}
