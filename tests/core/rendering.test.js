import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {renderConfig,qualitySettings,lightingSettings,applyShadowQuality} from '../../src/render/settings.js';
import {patchMaterial,attachWindShadow,timeUniform} from '../../src/render/patch.js';
import {receivePaintedShadow,syncPaintedLighting,paintedLight} from '../../src/render/painted.js';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('lighting has one explicit authoritative source; art layout and world do not override it',()=>{
 assert.equal(lightingSettings().name,'daylight');assert.equal(lightingSettings('legacy').name,'legacy');
 assert.throws(()=>lightingSettings('unknown'),RangeError);
 assert.equal(JSON.parse(read('data/art.json')).anime.light,undefined);
 assert.equal(JSON.parse(read('data/world.json')).presentation,undefined);
 for(const profile of Object.values(renderConfig.lighting.profiles))for(const k of ['ambientIntensity','sunIntensity','shadowIntensity'])assert.ok(Number.isFinite(profile[k]));
});
test('quality switches dispose old shadow targets, do not reallocate unchanged presets, and use valid sizes',()=>{
 const renderer={shadowMap:{enabled:true}},sun=new THREE.DirectionalLight();
 assert.equal(qualitySettings('bad').name,'medium');
 let disposed=0;
 const setTarget=()=>{sun.shadow.map={dispose(){disposed++;}};};
 applyShadowQuality(renderer,sun,'high');assert.equal(sun.shadow.mapSize.x,2048);
 setTarget();applyShadowQuality(renderer,sun,'medium');assert.equal(disposed,1);assert.equal(sun.shadow.map,null);assert.equal(sun.shadow.mapSize.x,1024);
 setTarget();applyShadowQuality(renderer,sun,'medium');assert.equal(disposed,1);
 applyShadowQuality(renderer,sun,'low');assert.equal(disposed,2);assert.equal(renderer.shadowMap.enabled,false);assert.equal(sun.shadow.map,null);
 applyShadowQuality(renderer,sun,'high');assert.equal(sun.shadow.mapSize.x,2048);assert.equal(renderer.shadowMap.enabled,true);
 assert.equal(renderConfig.nativeAntialias,true,'native AA is a context-wide policy, not a misleading mutable quality property');
});
test('wind shadow matches fill vertex deformation and alpha silhouette but excludes camera dither',()=>{
 const map=new THREE.Texture(),mat=patchMaterial(new THREE.MeshLambertMaterial({map,alphaTest:.4,side:THREE.DoubleSide}),{wind:.014,windBase:1.2,see:true});
 const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),mat,2);mesh.castShadow=true;
 assert.ok(attachWindShadow(mesh));const depth=mesh.customDepthMaterial;
 assert.equal(depth.map,map);assert.equal(depth.alphaTest,mat.alphaTest);assert.equal(depth.side,mat.side);
 const mock=()=>({uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\nvoid main() {'});
 const fill=mock(),shadow=mock();mat.onBeforeCompile(fill);depth.onBeforeCompile(shadow);
 assert.equal(fill.vertexShader,shadow.vertexShader);
 assert.equal(fill.uniforms.uTime,timeUniform);assert.equal(shadow.uniforms.uTime,timeUniform);
 assert.ok(fill.fragmentShader.includes('uSeeCenter'));assert.ok(!shadow.fragmentShader.includes('uSeeCenter'));
 const twin=new THREE.Mesh(mesh.geometry,mat);twin.castShadow=true;attachWindShadow(twin);assert.equal(twin.customDepthMaterial,depth);
 let disposed=false;depth.addEventListener('dispose',()=>disposed=true);mat.dispose();assert.ok(disposed);
 const noncasting=new THREE.Mesh(mesh.geometry,mat);assert.equal(attachWindShadow(noncasting),false);
});
test('painted material composes wind with restrained real shadows without replacing textures or palette',()=>{
 const map=new THREE.Texture(),mat=receivePaintedShadow(patchMaterial(new THREE.MeshLambertMaterial({map,vertexColors:true}),{wind:.014}));
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
 mat.onBeforeCompile(shader);assert.ok(shader.vertexShader.includes('uWindAmp'));
 assert.ok(shader.fragmentShader.includes('#include <shadowmask_pars_fragment>'));
 assert.ok(shader.fragmentShader.includes('getShadowMask()'));assert.equal(mat.map,map);
 const hemi=new THREE.HemisphereLight('#e8f4ff','#657858',1.5),sun=new THREE.DirectionalLight('#fff1d7',1.65);
 syncPaintedLighting(hemi,sun);const full=paintedLight.value.clone();hemi.intensity=.4;sun.intensity=.4;syncPaintedLighting(hemi,sun);
 assert.ok(paintedLight.value.r<full.r);assert.ok(paintedLight.value.r>.7,'paint cannot turn black');
});
test('only actual actor bodies receive shadows; skill artwork and HUD are not changed by renderer code',()=>{
 assert.match(read('src/render/skinned.js'),/mesh\.receiveShadow = true/);
 assert.match(read('src/render/skinned.js'),/face\.receiveShadow = true/);
 assert.match(read('src/render/monsterSkin.js'),/mesh\.receiveShadow = m === mat/);
 assert.match(read('src/ui/input.js'),/art\('skill',s\.id\)/);
 assert.match(read('src/ui/input.js'),/art\('skill',mv\.id\)/);
});
