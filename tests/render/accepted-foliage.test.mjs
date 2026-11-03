import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
import {createCanvas} from '@napi-rs/canvas';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {acceptedSceneLayout} from '../../src/core/accepted-scenes.js';

// The scene factories draw their foliage textures on a canvas; Node has none.
globalThis.document??={createElement:type=>{if(type==='canvas')return createCanvas(512,512);throw Error(type);}};
const jsonHook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{...context.importAttributes,type:'json'}}:context);}});
const {acceptedScenerySteps}=await import('../../src/render/accepted-scenes.js');
jsonHook.deregister();

const data=loadData(),world=createWorld(data.world),foliage=data.world.acceptedScenes.foliage;
const renderer={domElement:{height:706},getRenderTarget(){return null;},setRenderTarget(){},render(){}};
// the Conch Coast lies in the Frontier map: every region with scenes builds its own
const meshes=[];
for(const w of[world,createWorld(data.maps['frontier-wilds-v1'])]){const steps=acceptedScenerySteps(w,renderer);let built;for(;;){built=steps.next();if(built.done)break;}built.value.root.traverse(o=>{if(o.isInstancedMesh){o.userData.region=w.data.id;meshes.push(o);}});}
// Azure's foliage settings size Azure's scenes and the Conch Coast (in the Frontier map). The Frontier's
// own zones keep their authored tree sizes, as Moonroot's do: their roots are drawn for those trunks.
const conch=acceptedSceneLayout.scenes.find(s=>s.id==='shell-beach').bounds,azureSized=(mesh,x,z)=>mesh.userData.region!=='frontier-wilds-v1'||x>=conch[0]&&x<=conch[1]&&z>=conch[2]&&z<=conch[3];
const scales=mesh=>{const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),out=[];for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);m.decompose(p,q,s);out.push(s.y);}return out;};

test('scene trees, shrubs and grass are drawn with the map\'s own materials',()=>{
 const kinds={};for(const mesh of meshes){const kind=mesh.geometry.userData.gameFoliage;if(kind)(kinds[kind]??=[]).push(mesh);}
 for(const kind of['crown','shrub','trunk','grass'])assert.ok(kinds[kind]?.length>=6,kind+' in every scene');
 for(const mesh of[...kinds.crown,...kinds.shrub])assert.match(mesh.material.customProgramCacheKey(),/^anime-branchlet-/);
 for(const mesh of kinds.grass)assert.equal(mesh.name,'ground-blended-grass','scene grass takes the ground colour bake');
 const trunks=kinds.trunk.filter(m=>m.material.side!==THREE.BackSide),hulls=kinds.trunk.filter(m=>m.material.side===THREE.BackSide);
 assert.equal(hulls.length,trunks.length,'one game ink hull per trunk mesh, no scene outline left');
});

test('ordinary scene trees are the map\'s size; the listed big trees stay big',()=>{
 const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),trees=[];
 for(const mesh of meshes)if(mesh.geometry.userData.gameFoliage==='trunk'&&mesh.material.side!==THREE.BackSide)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);m.decompose(p,q,sc);if(azureSized(mesh,p.x,p.z))trees.push({x:p.x,z:p.z,s:sc.x});}
 const isBig=t=>foliage.bigTrees.some(b=>Math.hypot(b.at[0]-t.x,b.at[1]-t.z)<1);
 for(const b of foliage.bigTrees){
  const t=trees.find(t=>Math.hypot(b.at[0]-t.x,b.at[1]-t.z)<1);
  assert.ok(t&&Math.abs(t.s-b.size)<.02,`${b.scene} big tree at ${b.at} has size ${b.size} (got ${t?.s})`);
 }
 const map=world.circles.filter(c=>['tree','birch','willow'].includes(c.type)).map(c=>c.scale*.85).sort((a,b)=>a-b);
 const ordinary=trees.filter(t=>!isBig(t)).map(t=>t.s).sort((a,b)=>a-b),median=a=>a[a.length>>1];
 assert.ok(ordinary.at(-1)<=map.at(-1)+.05,`largest ordinary scene tree ${ordinary.at(-1)} within the map's ${map.at(-1)}`);
 assert.ok(Math.abs(median(ordinary)-median(map))<.1,`scene median ${median(ordinary)} near the map's ${median(map)}`);
 assert.ok(foliage.bigTrees.every(b=>b.size>map.at(-1)),'big trees are bigger than any ordinary tree');
});
