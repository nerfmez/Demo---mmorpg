import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareVrmBody} from '../../src/render/vrm-body.js';
test('two-scene game asset resolves humanoid and expressions when scene associations omit them',async()=>{
 const bytes=readFileSync(new URL('../../public/models/hairsample-male.glb',import.meta.url));
 const size=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+size));
 json.images=[];json.textures=[];json.materials=json.materials.map(m=>({name:m.name}));
 json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(size+28).toString('base64');
 globalThis.ProgressEvent ||= class {constructor(type,options){Object.assign(this,options);}};
 const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
 const template=prepareVrmBody(gltf,{hairsample:true});
 assert.equal(template.hipsName,'J_Bip_C_Hips');
 assert.equal(Object.keys(template.map).length,16);
 assert.ok(template.world.head[1]-template.world.hips[1]>.4);
 assert.ok(template.world.armL[0]>0&&template.world.armR[0]<0);
 assert.equal(template.scene.getObjectByName('BodySkin').geometry.index.count/3,7112);
 assert.equal(template.wardrobe.children.length,3);
 for(const bindings of Object.values(template.expressions))for(const b of bindings){
  const face=template.scene.getObjectByName(b.node);assert.ok(face);
  let found=false;face.traverse(o=>{if(o.morphTargetInfluences){found=true;assert.ok(b.index<o.morphTargetInfluences.length);}});
  assert.ok(found,'native face morph target exists');
 }
});
