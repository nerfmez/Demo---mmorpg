import{test}from'node:test';import assert from'node:assert/strict';import * as THREE from'three';
import{gradeCapeMesh}from'../../src/render/city-cape.js';import{cityFloorAt}from'../../src/core/city.js';
test('cape road trim removes unsupported shore/hole triangles without changing the outside city',()=>{
 const floor={height:.76,points:[[0,0],[10,0],[10,10],[0,10]],holes:[[[4,4],[6,4],[6,6],[4,6]]]};
 const city={enabled:true,floors:[floor],capeTransition:{bounds:[0,10,0,10],width:2.5}},world={data:{city},heightfield:{heightAt:()=>.7}},root=new THREE.Group();
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-2,.776,2,8,.776,2,8,.776,8],3));
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);gradeCapeMesh(mesh,world,root,floor,true);
 const p=mesh.geometry.attributes.position;assert.ok(p.count>3);
 for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;assert.ok(cityFloorAt(city,x,z),'every visible cape road triangle has source land support');}
 assert.ok([...mesh.geometry.attributes.normal.array].every(Number.isFinite));mesh.geometry.dispose();mesh.material.dispose();
});
