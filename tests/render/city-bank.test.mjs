import{test}from'node:test';import assert from'node:assert/strict';import*as THREE from'three';import{loadData}from'../../src/core/data-node.js';import{createWorld}from'../../src/core/world.js';import{bankGeometry}from'../../src/render/city-bank.js';import{pointInPolygon}from'../../src/core/math.js';
const world=createWorld(loadData().world),offset=world.data.city.offset,bank=bankGeometry(world,offset);
test('bank closes exposed source perimeter on both sides and grades island intersections without buried crossing walls',()=>{
 const m=new THREE.Mesh(bank.face,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.position.fromArray(offset);m.updateMatrixWorld();const ray=new THREE.Raycaster();
 assert.ok(bank.segments.length>100);assert.ok(bank.segments.some(s=>s.riser));
 for(const [i,s]of bank.segments.entries()){
  const a=s.a,b=s.b,dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),x=(a[0]+b[0])/2,z=(a[2]+b[2])/2,y=(a[1]+b[1]+s.bottom[0]+s.bottom[1])/4,n=new THREE.Vector3(dz/len,0,-dx/len);
  assert.ok(s.bottom[0]<a[1]&&s.bottom[1]<b[1]);
  for(const sign of[-1,1]){ray.set(new THREE.Vector3(x,y,z).addScaledVector(n,.2*sign),n.clone().multiplyScalar(-sign));assert.ok(ray.intersectObject(m).length,'both-direction face coverage '+i);}
  if(!s.riser&&s.floor===0){const floor=world.data.city.floors[0],normal=new THREE.Vector3().fromBufferAttribute(bank.face.attributes.normal,i*6);const inside=pointInPolygon(floor.points,x+normal.x*.01,z+normal.z*.01)&&!(floor.holes||[]).some(h=>pointInPolygon(h,x+normal.x*.01,z+normal.z*.01));assert.equal(inside,false,'normal points away from land '+i);}
 }
 assert.ok(bank.face.attributes.position.array.every(Number.isFinite));assert.ok(bank.cap.attributes.normal.array.filter((_,i)=>i%3===1).every(y=>y>0));
 bank.face.dispose();bank.cap.dispose();m.material.dispose();
});
