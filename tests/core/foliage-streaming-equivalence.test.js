import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createRng} from '../../src/core/rng.js';
const art=JSON.parse(readFileSync(new URL('../../data/art.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../../src/render/anime-study.js',import.meta.url),'utf8');
const make=s=>Function('THREE','art','createRng',s.replace(/^import[^\n]+\n/gm,'').replace(/\bexport /g,'')+'\nreturn animeFoliage;')(THREE,art,createRng);
// The previous vertex colour calculation, with its original arithmetic/order.
const oldColor=`function foliageColor(point,normal,shrub){const prefix=shrub?'shrub':'leaf',palette=animeConfig.palette;
 const dark=new THREE.Color(palette[prefix+'Shadow']),mid=new THREE.Color(palette[prefix+'Mid']),light=new THREE.Color(palette[prefix+'Light']);
 const height=shrub?THREE.MathUtils.smoothstep(point.y,.08,1.1):THREE.MathUtils.smoothstep(point.y,-.45,.85);
 const lit=THREE.MathUtils.clamp(normal.dot(new THREE.Vector3(-.5,1,.25).normalize())*.26+height*.50+.10,0,1);
 return dark.lerp(mid,Math.min(1,lit*1.9)).lerp(light,Math.max(0,(lit-.53)*1.9));}`;
const legacySource=source.replace(/const foliageLightDirection=[\s\S]*?\/\/ Four connected/,oldColor+'\n// Four connected').replace('foliageColor(v,curvedNormal,shrub,colors,vertexShade)','foliageColor(v,curvedNormal,shrub)').replace('foliageColor(centre,normal,shrub,colors,shade);','shade.copy(foliageColor(centre,normal,shrub));');
test('reused foliage palette/direction produces byte-identical tree and shrub geometry',()=>{
 const build=make(source),legacy=make(legacySource);
 for(const shrub of [false,true])for(const seed of [3,7,91]){
  const before=legacy(seed,shrub),after=build(seed,shrub);
  for(const name of ['position','normal','color','uv'])assert.deepEqual(after.attributes[name].array,before.attributes[name].array,`${shrub}/${seed}/${name}`);
  assert.deepEqual(after.boundingSphere,before.boundingSphere);before.dispose();after.dispose();
 }
});
