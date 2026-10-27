// Software inspection of the actual integrated geometry; not a WebGL/device test.
import {createCanvas} from '@napi-rs/canvas';
import {writeFileSync,mkdirSync} from 'node:fs';
import * as THREE from 'three';
import {loadData} from '../src/core/data-node.js';
import {createWorld} from '../src/core/world.js';
import {acceptedScenerySteps} from '../src/render/accepted-scenes.js';
import {createTerrain} from '../src/render/ground.js';
import {acceptedSceneLayout} from '../src/core/accepted-scenes.js';
globalThis.document={createElement:type=>{if(type==='canvas')return createCanvas(512,512);throw Error(type);}};
globalThis.window={devicePixelRatio:1};
const output=process.argv[2];mkdirSync(output,{recursive:true});
const data=loadData(),world=createWorld(data.world),renderer={domElement:{height:706},getRenderTarget(){return null;},setRenderTarget(){},render(){}};
const steps=acceptedScenerySteps(world,renderer),root=new THREE.Group();let content;
for(;;){const r=steps.next();if(r.done){content=r.value;root.add(content.root);break;}}
root.add(createTerrain(world).group);root.updateMatrixWorld(true);
const textures=[],textureIds=new Map(),objects=[];
function texture(t){if(!t)return null;if(textureIds.has(t.uuid))return textureIds.get(t.uuid);let im=t.image,can;if(im?.data){can=createCanvas(im.width,im.height);const ctx=can.getContext('2d'),image=ctx.createImageData(im.width,im.height);image.data.set(im.data);ctx.putImageData(image,0,0);}else if(im?.width){can=createCanvas(im.width,im.height);can.getContext('2d').drawImage(im,0,0);}else return null;const id=textures.length,path='texture-'+id+'.png';writeFileSync(output+'/'+path,can.toBuffer('image/png'));textureIds.set(t.uuid,id);textures.push({path,flipY:t.flipY});return id;}
root.traverse(o=>{
 if(!o.isMesh||!o.visible||o.material?.side===THREE.BackSide)return;let g=o.geometry;if(g.index)g=g.toNonIndexed();const p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color,uv=g.attributes.uv;if(!p||!p.count)return;
 const matrices=[],instanceColors=[];
 if(o.isInstancedMesh){const m=new THREE.Matrix4(),cc=new THREE.Color();for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);matrices.push(new THREE.Matrix4().multiplyMatrices(o.matrixWorld,m).elements);if(o.instanceColor){o.getColorAt(i,cc);instanceColors.push([cc.r,cc.g,cc.b]);}else instanceColors.push([1,1,1]);}}else{matrices.push(o.matrixWorld.elements);instanceColors.push([1,1,1]);}
 const color=o.material.color||new THREE.Color(1,1,1);
 let colors=c?[...c.array]:null;
 if(g.attributes.aSplat){colors=[];for(let i=0;i<p.count;i++){const tr=g.attributes.aSplat.getX(i),co=g.attributes.aCoast.getX(i),a=new THREE.Color('#98af42').lerp(new THREE.Color('#ddbc80'),Math.max(tr,co));colors.push(a.r,a.g,a.b);}}
 objects.push({name:o.name,kind:'mesh',positions:[...p.array],normals:n?[...n.array]:null,colors,uv:uv?[...uv.array]:null,map:texture(o.material.map),matrices,instanceColors,color:[color.r,color.g,color.b],paint:null,alphaTest:o.material.alphaTest||0});
});
const camera=new THREE.PerspectiveCamera(45,1254/706,.1,1000);
for(const spec of acceptedSceneLayout.scenes){
 const target=new THREE.Vector3(spec.x,spec.y+1,spec.z-14*spec.s),distance=65*spec.s;
 camera.position.copy(target).add(new THREE.Vector3(0,Math.sin(40*Math.PI/180)*distance,Math.cos(40*Math.PI/180)*distance));camera.lookAt(target);camera.updateMatrixWorld();
 writeFileSync(output+'/'+spec.id+'.json',JSON.stringify({objects,textures,view:camera.matrixWorldInverse.elements,projection:camera.projectionMatrix.elements,shore:[],checkpoints:[]}));
}
console.log({meshes:objects.length,textures:textures.length});
