import{test}from'node:test';import assert from'node:assert/strict';import * as THREE from'three';import{cityFountain}from'../../src/render/city-fountain.js';
test('connected fountain replaces only water surfaces with upward finite fixed geometry',()=>{
 const root=new THREE.Group();root.position.set(72.32,.76,41.2);const stone=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,16),new THREE.MeshBasicMaterial());root.add(stone);const geometry=stone.geometry;
 const material=cityFountain(root,{data:{city:{fountain:{x:62,z:22}}}});
 for(const radius of [4.16,1.65,.76]){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.055,48),material);material.userData.preparePool(mesh);
  assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));assert.ok(mesh.geometry.attributes.normal.array.filter((_,i)=>i%3===1).every(v=>v>=0),'visible surface faces upward');
  mesh.geometry.computeBoundingBox();assert.ok(Math.abs(mesh.geometry.boundingBox.max.x-radius)<.001);assert.equal(mesh.geometry.attributes.position.count,392);mesh.geometry.dispose();
 }
 assert.equal(stone.geometry,geometry);assert.ok(root.getObjectByName('fountain-connected-crown-lips-curtains-jets'));assert.equal(root.getObjectByName('fountain-tier-impact-foam').count,19);
 const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.add(material);materials.forEach(m=>m.dispose());
});
