import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PoseEchoPool } from '../../src/render/pose-echo.js';

test('echo reuses owned snapshots, freezes bones and morphs, and never disposes source geometry', () => {
 const root=new THREE.Group(), geometry=new THREE.BoxGeometry(), material=new THREE.MeshBasicMaterial();
 const mesh=new THREE.SkinnedMesh(geometry,material), bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));root.add(mesh);
 mesh.morphTargetInfluences=[.3];let sourceGeometryFreed=0;geometry.addEventListener('dispose',()=>sourceGeometryFreed++);
 const pool=new PoseEchoPool(root);root.position.x=4;bone.rotation.z=.4;
 const first=pool.capture(0x83bdde), echoMesh=first.children[0];
 assert.equal(echoMesh.geometry,geometry);assert.notEqual(echoMesh.skeleton,mesh.skeleton);
 assert.equal(first.position.x,4);assert.ok(Math.abs(echoMesh.skeleton.bones[0].rotation.z-.4)<1e-10);
 bone.rotation.z=.9;mesh.morphTargetInfluences[0]=.7;assert.ok(Math.abs(echoMesh.skeleton.bones[0].rotation.z-.4)<1e-10);assert.equal(echoMesh.morphTargetInfluences[0],.3);
 const simultaneous=pool.capture(0x9152ca);assert.notEqual(first,simultaneous);assert.ok(Math.abs(simultaneous.children[0].skeleton.bones[0].rotation.z-.9)<1e-10);
 const mat=echoMesh.material;pool.release(first);const reused=pool.capture(0x9152ca);
 assert.equal(reused,first);assert.equal(reused.children[0].material,mat);assert.equal(reused.children[0].morphTargetInfluences[0],.7);
 let freed=0;mat.addEventListener('dispose',()=>freed++);pool.clear();assert.equal(freed,1);assert.equal(sourceGeometryFreed,0);
});
