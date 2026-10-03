import{test}from'node:test';import assert from'node:assert/strict';import * as THREE from'three';
import{gradeCapeMesh,trimCityPaving}from'../../src/render/city-cape.js';import{cityFloorAt}from'../../src/core/city.js';
test('cape road trim removes unsupported shore/hole triangles without changing the outside city',()=>{
 const floor={height:.76,points:[[0,0],[10,0],[10,10],[0,10]],holes:[[[4,4],[6,4],[6,6],[4,6]]]};
 const city={enabled:true,floors:[floor],capeTransition:{bounds:[0,10,0,10],width:2.5}},world={data:{city},heightfield:{heightAt:()=>.7}},root=new THREE.Group();
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-2,.776,2,8,.776,2,8,.776,8],3));
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);gradeCapeMesh(mesh,world,root,floor,true);
 const p=mesh.geometry.attributes.position;assert.ok(p.count>3);
 for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;assert.ok(cityFloorAt(city,x,z),'every visible cape road triangle has source land support');}
 assert.ok([...mesh.geometry.attributes.normal.array].every(Number.isFinite));mesh.geometry.dispose();mesh.material.dispose();
});
test('property clipping preserves contained triangles and cuts concavities and holes without overlapping partitions',()=>{
 const floor={height:.76,points:[[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]],holes:[[[1,1],[2,1],[2,2],[1,2]]]};
 const world={data:{city:{enabled:true,floors:[floor]}}},root=new THREE.Group();root.position.set(2,.76,3);
 const positions=[-1,.016,0,1,.016,0,1,.016,1, -3,.016,-3,7,.016,-3,7,.016,7];
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);trimCityPaving(mesh,world,root);
 const p=mesh.geometry.attributes.position;let area=0;
 for(let i=0;i<p.count;i+=3){
  const a=[p.getX(i)+2,p.getZ(i)+3],b=[p.getX(i+1)+2,p.getZ(i+1)+3],c=[p.getX(i+2)+2,p.getZ(i+2)+3];
  const triangleArea=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
  assert.ok(triangleArea>1e-8,'no zero-area duplicate faces');area+=triangleArea;
  assert.ok(cityFloorAt(world.data.city,(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3),'actual visible triangle inside supported land');
 }
 assert.deepEqual([...p.array.slice(0,9)],positions.slice(0,9).map(Math.fround),'contained source triangle unchanged');
 assert.ok(area>15&&area<51,'clipped area stays bounded by source triangles');
 mesh.geometry.dispose();mesh.material.dispose();
});
