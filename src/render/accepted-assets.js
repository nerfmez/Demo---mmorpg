// Models an accepted scene places as part of its own scenery (the Singing
// Conch). Each is fetched once per session and kept as a CPU copy: a scene
// build bakes its own GPU geometry from it and takes a texture clone, so one
// region's disposal never reaches another's.
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const FILES={conch:'models/accepted-scenes/singing-conch.glb'};
let pending=null,loaded=null,failure=null;
// Start the fetch early (region assembly does this before terrain) so the
// scene build normally finds it ready.
export function prefetchAcceptedAssets(){
 if(pending||typeof location==='undefined')return pending;
 const base=new URL(import.meta.env.BASE_URL,location.href),loader=new GLTFLoader();
 pending=Promise.all(Object.entries(FILES).map(async([id,file])=>{
  const gltf=await loader.loadAsync(new URL(file,base).href);let mesh=null;
  gltf.scene.traverse(o=>{if(o.isMesh&&!mesh)mesh=o;});
  mesh.geometry.computeBoundingBox();
  return [id,{geometry:mesh.geometry,map:mesh.material.map}];
 })).then(list=>{loaded=Object.fromEntries(list);return loaded;},error=>{failure=error;throw error;});
 pending.catch(()=>{}); // reported by the scene build that needs it
 return pending;
}
// Waits (yielding frames) until the models are in. A failed fetch, and Node
// tools without a fetch base, build the scene without them: colliders and
// layout do not depend on the models, so the game stays playable.
export function* acceptedAssetSteps(){
 if(!prefetchAcceptedAssets())return {};
 while(!loaded){if(failure){console.warn('Accepted scene model missing',failure);return {};}yield;}
 const out={};
 for(const[id,a]of Object.entries(loaded))out[id]={geometry:a.geometry,map:a.map.clone()};
 return out;
}
