import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {loadLandmarkAssets,AUTHORED_LANDMARKS} from '../../src/render/landmark-assets.js';
import {disposeObject} from '../../src/render/dispose.js';
const data=loadData(),manifest=JSON.parse(readFileSync(new URL('../../public/models/landmarks/manifest.json',import.meta.url)));
const base=new URL('../../',import.meta.url);
async function model(path){const b=readFileSync(new URL(path,base));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
test('every new map landmark has a separate editable source and usable export',async()=>{
 const required=Object.values(data.maps).flatMap(m=>m.landmarks.filter(l=>!l.builtin).map(l=>l.kind));
 assert.deepEqual([...AUTHORED_LANDMARKS].sort(),required.sort());
 for(const entry of manifest.landmarks){
  assert.ok(statSync(new URL(entry.source,base)).size>1000,entry.source);
  const {scene}=await model(entry.file);let triangles=0;
  scene.traverse(o=>{if(!o.isMesh)return;assert.ok(!o.material.map,'no texture loading');triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;const pos=o.geometry.attributes.position;for(const n of pos.array)assert.ok(Number.isFinite(n));});
  assert.ok(triangles>0&&triangles<15000,entry.kind);
  assert.equal(triangles,entry.triangles,entry.kind+' identity');disposeObject(scene);
 }
});
test('region landmark imports release raw/batched buffers once, including cancellation',async()=>{
 for(const wd of Object.values(data.maps)){
  const resources=new Map();const loader={async loadAsync(path){const gltf=await model('public/'+path);gltf.scene.traverse(o=>{for(const r of [o.geometry,o.material])if(r&&!resources.has(r)){resources.set(r,0);r.addEventListener('dispose',()=>resources.set(r,resources.get(r)+1));}});return gltf;}};
  const result=await loadLandmarkAssets(createWorld(wd),{loader,assetURL:path=>path});
  assert.equal(result.stats.kinds.length,wd.landmarks.filter(l=>!l.builtin).length);
  assert.ok(result.stats.batch.after<result.stats.sourceDraws,'material batches reduce draws');
  result.dispose();result.dispose();
  assert.ok([...resources.values()].every(n=>n===1),'each imported resource released exactly once');
 }
 const controller=new AbortController();controller.abort();
 await assert.rejects(loadLandmarkAssets(createWorld(data.world),{signal:controller.signal,assetURL:path=>path,loader:{loadAsync:path=>model('public/'+path)}}),{name:'AbortError'});
});
