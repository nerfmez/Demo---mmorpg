import{test}from'node:test';import assert from'node:assert/strict';import*as THREE from'three';
import{prepareGrassCulling,updateGrassVisibility,installGrassCulling}from'../../src/render/grass-culling.js';
test('grass keeps viewport-edge wind spheres and matching baked colours without rebuilding buffers',()=>{
 const g=new THREE.PlaneGeometry(.4,.8),mesh=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial(),3),m=new THREE.Matrix4();
 for(const[i,x]of[0,30,10.25].entries())mesh.setMatrixAt(i,m.makeTranslation(x,0,0));
 g.setAttribute('aGrassBase',new THREE.InstancedBufferAttribute(new Uint8Array([10,11,12,20,21,22,30,31,32]),3,true));
 mesh.userData.grassRadii=new Float32Array([.5,.5,.5]);mesh.computeBoundingSphere();mesh.updateMatrixWorld(true);
 const bounds=mesh.boundingSphere.clone(),matrixArray=mesh.instanceMatrix.array,colorArray=g.attributes.aGrassBase.array;
 prepareGrassCulling(mesh);
 const camera=new THREE.PerspectiveCamera(90,1,.1,100);camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 updateGrassVisibility(mesh,camera);
 assert.equal(mesh.count,2,'keep whole clump at viewport edge including wind');
 assert.deepEqual([...colorArray.slice(0,6)],[10,11,12,30,31,32]);assert.equal(matrixArray[28],10.25);
 const version=mesh.instanceMatrix.version;
 updateGrassVisibility(mesh,camera);assert.equal(mesh.instanceMatrix.version,version,'fixed camera skips buffer updates');
 camera.position.set(30,0,10);camera.lookAt(30,0,0);camera.updateMatrixWorld(true);updateGrassVisibility(mesh,camera);
 assert.equal(mesh.count,1);assert.equal(matrixArray[12],30);assert.deepEqual([...colorArray.slice(0,3)],[20,21,22]);
 assert.deepEqual(mesh.instanceMatrix.updateRanges,[{start:0,count:16}],'upload only the visible reordered slots');
 assert.deepEqual(g.attributes.aGrassBase.updateRanges,[{start:0,count:3}]);
 mesh.userData.grassCulling.enabled=false;updateGrassVisibility(mesh,camera);
 assert.equal(mesh.count,3);assert.deepEqual([...colorArray],[10,11,12,20,21,22,30,31,32]);
 assert.equal(mesh.instanceMatrix.array,matrixArray);assert.equal(g.attributes.aGrassBase.array,colorArray);assert.ok(mesh.boundingSphere.equals(bounds));
 g.dispose();mesh.material.dispose();
});
test('scene pre-render updates current-camera instance data before draw uploads',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(.4,.8),new THREE.MeshBasicMaterial(),2),m=new THREE.Matrix4();
 mesh.setMatrixAt(0,m.makeTranslation(0,0,0));mesh.setMatrixAt(1,m.makeTranslation(30,0,0));mesh.userData.grassRadii=new Float32Array([.5,.5]);
 prepareGrassCulling(mesh);root.add(mesh);scene.add(root);scene.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera(90,1,.1,100);let chained=0;scene.onBeforeRender=()=>chained++;installGrassCulling(scene,root);
 for(const x of[0,30,0]){
  camera.position.set(x,0,10);camera.lookAt(x,0,0);camera.updateMatrixWorld(true);
  scene.onBeforeRender(null,scene,camera,null);
  assert.equal(mesh.count,1);assert.equal(mesh.instanceMatrix.array[12],x,'current camera is ready when the render list uploads');
 }
 assert.equal(chained,3);assert.equal(mesh.onBeforeRender,THREE.Object3D.prototype.onBeforeRender,'draw does not modify instance buffers');
 mesh.geometry.dispose();mesh.material.dispose();
});
test('off-camera chunks skip individual tests and reenter with correct sources; density is reversible',()=>{
 const g=new THREE.PlaneGeometry(.4,.8),mesh=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial(),20),m=new THREE.Matrix4();
 const colors=new Uint8Array(60);for(let i=0;i<20;i++){mesh.setMatrixAt(i,m.makeTranslation(i*.1,0,0));colors.set([i,10,20],i*3);}
 g.setAttribute('aGrassBase',new THREE.InstancedBufferAttribute(colors,3,true));mesh.userData.grassRadii=new Float32Array(20).fill(.5);prepareGrassCulling(mesh);mesh.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera(90,1,.1,100),s=mesh.userData.grassCulling;
 const move=x=>{camera.position.set(x,0,10);camera.lookAt(x,0,0);camera.updateMatrixWorld(true);updateGrassVisibility(mesh,camera);};
 move(500);assert.equal(mesh.count,0);assert.equal(s.lastTested,0);const version=mesh.instanceMatrix.version;
 move(501);assert.equal(mesh.instanceMatrix.version,version,'invisible chunk has no upload');
 s.fraction=.35;move(0);assert.equal(mesh.count,7);assert.equal(s.lastTested,7);
 for(let j=0;j<mesh.count;j++)assert.equal(colors[j*3],s.indices[j],'baked attributes follow their original clump');
 s.fraction=1;move(0);assert.equal(mesh.count,20);assert.deepEqual([...colors.filter((_,i)=>i%3===0)],Array.from({length:20},(_,i)=>i));
 g.dispose();mesh.material.dispose();
});
