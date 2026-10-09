// Blender exports use the native 3-step toon ramp, cached same-hue hulls and
// cooperative static batching. A region owns every imported GPU buffer.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {toon, outlineMaterial, darker} from './toon.js';
import {importJob} from './import-job.js';
import {batchStaticSteps} from './static-batch.js';
import manifest from '../../public/models/landmarks/manifest.json' with {type:'json'};

export const AUTHORED_LANDMARKS = new Set(manifest.landmarks.map(l=>l.kind));
export function animateLandmarkSpinner(pivot){
 const nodes=[];pivot.traverse(o=>nodes.push(o));
 let lastFrame=-1;
 const turn=renderer=>{
  const frame=renderer?.info.render.frame;
  if(frame!==undefined&&lastFrame===frame)return;
  lastFrame=frame;pivot.rotation.z=.4+performance.now()/1000*.55;pivot.updateMatrix();
  for(let i=0;i<nodes.length;i++){const o=nodes[i];if(o.parent)o.matrixWorld.multiplyMatrices(o.parent.matrixWorld,o.matrix);}
 };
 for(const o of nodes)if(o.isMesh)o.onBeforeRender=turn;
}
export async function loadLandmarkAssets(world, options={}) {
 const list=(world.landmarks||[]).filter(l=>!l.builtin&&AUTHORED_LANDMARKS.has(l.kind));
 if(!list.length)return null;
 const loader=options.loader||new GLTFLoader(),job=importJob({...options,loader});
 const root=new THREE.Group();root.name='blender-landmarks';
 let triangles=0,sourceDraws=0;
 try {
  const files=await Promise.all(list.map(async lm=>({lm,scene:job.raw((await loader.loadAsync(job.assetURL('models/landmarks/'+lm.kind+'.glb'))).scene)})));
  await job.run((function*(){
   for(const {lm,scene}of files){
    yield;
    scene.name='landmark-'+lm.kind;
    let low=Infinity;
    const groundHeight=options.groundHeight||((x,z)=>world.groundY(x,z));
    for(const part of [{x:lm.x,z:lm.z},...lm.parts])low=Math.min(low,groundHeight(part.x,part.z));
    scene.position.set(lm.x,low-.08,lm.z);scene.rotation.y=lm.rot||0;
    root.add(scene);
    const meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
    for(const mesh of meshes){
     yield;
     const old=mesh.material,color='#'+old.color.getHexString(),glow=old.emissive?.getHex()? '#'+old.emissive.getHexString():undefined;
     mesh.material=toon(color,{emissive:glow,emissiveIntensity:glow ? .45 : 1,side:old.side});
     mesh.castShadow=!glow;mesh.receiveShadow=true;
     const wrapper=new THREE.Group();mesh.parent.add(wrapper);wrapper.add(mesh);
     const hull=new THREE.Mesh(mesh.geometry,outlineMaterial(darker(color,.42),.022));
     hull.position.copy(mesh.position);hull.quaternion.copy(mesh.quaternion);hull.scale.copy(mesh.scale);wrapper.add(hull);
     sourceDraws+=2;triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;
    }
    const spinner=scene.getObjectByName('landmark-spinner');if(spinner)animateLandmarkSpinner(spinner);
   }
  })(),'landmarks.toon');
  const batch=await job.run(batchStaticSteps(root,{owner:job}),'landmarks.batch');
  return {root,dispose:job.commit(root),stats:{kinds:list.map(l=>l.kind),triangles,sourceDraws,batch,assembly:job.stats}};
 }catch(error){job.abort(root);throw error;}
}
