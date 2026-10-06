// Real Three.js CPU geometry/resource checks, NOT WebGL, device timing or FPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drainSteps } from '../../src/render/city-work.js';
import { featureEdgesSteps, mergeCityGeometriesSteps, cityBoundsSteps, cityPartSteps, finishCityTrianglesSteps } from '../../src/render/city-geometry.js';
import { importedMaterialSteps, hasOpenEdges } from '../../src/render/city-palette.js';
import { createCityResources, loadCitySource, waitCityLoads } from '../../src/render/city-resources.js';
import { batchStaticSteps } from '../../src/render/static-batch.js';
import { toon, outlineMaterial } from '../../src/render/toon.js';
const same = (a,b) => {
  assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));
  for (const key of Object.keys(a.attributes)) assert.deepEqual(a.attributes[key].array,b.attributes[key].array,key);
};
const counted = resource => {let count=0;resource.addEventListener('dispose',()=>count++);return ()=>count;};
const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};};

test('feature edge arrays preserve Three welding, winding and threshold selection exactly',()=>{
  for(const g of [new THREE.BoxGeometry(),new THREE.PlaneGeometry(10,10,40,40),new THREE.SphereGeometry(2,32,16)])for(const angle of [1,28,90]){
    const old=new THREE.EdgesGeometry(g,angle), current=drainSteps(featureEdgesSteps(g,angle));same(current,old);old.dispose();current.dispose();
  }
});
test('large edge construction suspends inside a single mesh',()=>{
  const steps=featureEdgesSteps(new THREE.PlaneGeometry(10,10,40,40));let turns=0;while(!steps.next().done)turns++;
  assert.ok(turns>25,'not just a yield between mesh calls');
});
test('incremental attribute concatenation and flat normals preserve float32 intermediates',()=>{
  const parts=[new THREE.BoxGeometry().toNonIndexed(),new THREE.BoxGeometry().toNonIndexed()];
  same(drainSteps(mergeCityGeometriesSteps(parts)),mergeGeometries(parts));
  const values=[0.1,0.2,0.3,5.4,3.2,7.8,4.1,3.3,-2.3,0,0,0,0,0,0,0,0,0];
  const old=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(values,3));old.computeVertexNormals();old.computeBoundingSphere();
  const result=drainSteps(finishCityTrianglesSteps(values));same(result,old);assert.deepEqual(result.boundingSphere,old.boundingSphere);
});
test('batch parts preserve indexed positions, vertex colours and transformed normals',()=>{
  const g=new THREE.BoxGeometry(), color=new THREE.Float32BufferAttribute(Array.from({length:g.attributes.position.count*3},(_,i)=>i%7/7),3);g.setAttribute('color',color);
  const surface=new THREE.MeshToonMaterial({color:'#a78421',vertexColors:true}), hull=outlineMaterial('#381412');
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(7,1,-4),new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.7,.1)),new THREE.Vector3(2,3,4));
  const src=g.toNonIndexed(), old=new THREE.BufferGeometry();old.setAttribute('position',src.attributes.position.clone());old.setAttribute('normal',src.attributes.normal.clone());
  const make=(c,vc)=>new THREE.Float32BufferAttribute(Array.from({length:src.attributes.position.count*3},(_,i)=>[c.r,c.g,c.b][i%3]*(vc?vc.array[i]:1)),3);
  old.setAttribute('color',make(surface.color,src.attributes.color));old.setAttribute('hullColor',make(hull.color));old.applyMatrix4(matrix);
  same(drainSteps(cityPartSteps(g,surface,hull,matrix)),old);
});
test('incremental bounds are equal to Three bounds',()=>{
  const a=new THREE.SphereGeometry(2,64,32), b=a.clone();a.computeBoundingBox();a.computeBoundingSphere();drainSteps(cityBoundsSteps(b));
  assert.deepEqual(b.boundingBox,a.boundingBox);assert.deepEqual(b.boundingSphere,a.boundingSphere);
});
test('palette scratch colour cannot be overwritten by a different suspended city',()=>{
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,30,30));mesh.name='roof';const old=new THREE.MeshStandardMaterial({color:'#ffffff',side:THREE.DoubleSide});
  const a=importedMaterialSteps({meshColors:{roof:'#ff1200'}},old,mesh,new Map());assert.equal(a.next().done,false);
  const b=drainSteps(importedMaterialSteps({meshColors:{roof:'#0033ff'}},old,mesh,new Map()));
  const ma=drainSteps(a);assert.equal(ma.color.getHexString(),'ff1200');assert.equal(b.color.getHexString(),'0033ff');assert.equal(ma.side,THREE.DoubleSide);assert.equal(hasOpenEdges(new THREE.BoxGeometry()),false);
});
test('city resource owner disposes only private geometry/materials/textures and is idempotent',()=>{
  const root=new THREE.Group(),owner=createCityResources(root),g=new THREE.BoxGeometry(),tex=new THREE.Texture(),m=new THREE.MeshStandardMaterial({map:tex});
  const gs=new THREE.BoxGeometry();gs.userData.shared=true;const ms=toon('#654321'), ts=ms.gradientMap, borrowedHull=outlineMaterial('#123456');
  root.add(new THREE.Mesh(g,m),new THREE.Mesh(gs,ms),new THREE.Mesh(gs,borrowedHull));owner.source(root);
  const privateCount=[g,m,tex].map(counted),sharedCount=[gs,ms,ts,borrowedHull].map(counted);
  owner.dispose();owner.dispose();assert.deepEqual(privateCount.map(f=>f()),[1,1,1]);assert.deepEqual(sharedCount.map(f=>f()),[0,0,0,0]);
});
test('explicit per-load toon clones are owned despite batching shared flag; live borrowed cache survives',()=>{
  const root=new THREE.Group(),owner=createCityResources(root),cache=toon('#112244'), own=cache.clone();own.userData.shared=true;
  const a=counted(own),b=counted(cache),t=counted(cache.gradientMap);owner.ownMaterial(own);root.add(new THREE.Mesh(new THREE.BoxGeometry(),own));owner.dispose();
  assert.equal(a(),1);assert.equal(b(),0);assert.equal(t(),0);
});
test('cancelling during original material retirement still releases its source textures',()=>{
  const root=new THREE.Group(),owner=createCityResources(root),m=new THREE.MeshStandardMaterial({map:new THREE.Texture()}),n=counted(m.map);owner.original(m);
  const steps=owner.retireOriginals();steps.next();steps.next(); // root traversal, then material disposed before texture pass
  owner.dispose();steps.return();assert.equal(n(),1);
});
test('late private GLTF result is released after owner abort, never installed',async()=>{
  const d=deferred(),root=new THREE.Group(),owner=createCityResources(root),scene=new THREE.Group(),g=new THREE.BoxGeometry(),m=new THREE.MeshStandardMaterial({map:new THREE.Texture()});scene.add(new THREE.Mesh(g,m));
  const counts=[g,m,m.map].map(counted), result=loadCitySource({loadAsync:()=>d.promise},'ignored',owner);owner.dispose();d.resolve({scene});
  await assert.rejects(result,{name:'AbortError'});assert.deepEqual(counts.map(f=>f()),[1,1,1]);assert.equal(root.children.length,0);
});
test('abort resolves pending wait promptly; network failure is not changed into success',async()=>{
  const d=deferred(), abort=new AbortController();const result=waitCityLoads(d.promise,abort.signal);abort.abort();await assert.rejects(result,{name:'AbortError'});d.resolve(null);
  const e=new Error('GLTF failed');await assert.rejects(waitCityLoads(Promise.reject(e),new AbortController().signal),x=>x===e);
});
test('cancelled batch releases detached temporary geometry but keeps live shared inputs',()=>{
  const root=new THREE.Group(),g=new THREE.PlaneGeometry(3,3,80,80);g.userData.shared=true;const material=toon('#341298'),n=counted(g),m=counted(material);
  root.add(new THREE.Mesh(g,material),new THREE.Mesh(g,material));const steps=batchStaticSteps(root);for(let i=0;i<30;i++)steps.next();steps.return();
  assert.equal(n(),0);assert.equal(m(),0);assert.ok(root.children.length>=2);
});
