import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=readFileSync(new URL('../../public/models/hairsample-male.glb',import.meta.url));
const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
test('HairSample master is pinned and the default scene contains complete skin without clothes',()=>{
 assert.equal(gltf.asset.extras.hairsample.sourceSha256,'4af2194f90ba846f3b13c00b50b14262419062d2171d17de922bcce2f89979c7');
 assert.equal(Object.keys(gltf.asset.extras.hairsample.humanoid.humanBones).length,54);
 const skin=gltf.meshes.find(m=>m.name==='BodySkin');
 assert.equal(skin.primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0),7112);
 const garmentIds=gltf.nodes.flatMap((n,i)=>['hoodie','pants','shoes'].includes(n.extras?.bodyPart)?[i]:[]);
 assert.equal(garmentIds.length,3);
 assert.ok(garmentIds.every(i=>!gltf.scenes[gltf.scene||0].nodes.includes(i)));
 assert.deepEqual(gltf.scenes.find(s=>s.name==='RuntimeWardrobe').nodes,garmentIds);
 assert.equal(gltf.animations?.length||0,0,'native cast remains preserved separately; game supplies all motion');
});
test('deployed HairSample asset identity matches the reviewed game derivative',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'c85fe5847d23cf2028974c01413b76f2ec074c2c77e0558e1346e5bb2fc5cec7');
 assert.equal(gltf.meshes.find(m=>m.name==='Hair001.baked').primitives.length,1,'identical-material hair index lists are batched');
});
