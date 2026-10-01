import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {paintNoise,meadowDensity} from '../../src/render/ground-field.js';
import {walkSurfaceMaterial} from '../../src/render/walk-surface.js';
import {disposeObject} from '../../src/render/dispose.js';

test('meadow field is continuous across negative coordinates and has both quiet and planted islands',()=>{
  let sparse=0,dense=0;
  for(let z=-120;z<120;z+=2.7)for(let x=-160;x<160;x+=2.9){
    const d=meadowDensity(x,z);assert.ok(d>=0&&d<=1);
    if(d<.24)sparse++;if(d>.75)dense++;
    assert.ok(Math.abs(d-meadowDensity(x+.001,z+.001))<.012,'sub-metre field cannot jump at a cell boundary');
  }
  assert.ok(sparse>150&&dense>150,'retain open floor and dense grass patches');
  for(const x of [-2,-1,0,1,2])assert.ok(Math.abs(paintNoise(x-1e-7,.31)-paintNoise(x+1e-7,.31))<1e-6);
});
test('walking pigments compose with Lambert shadow chunks and free their owned materials',()=>{
  for(const kind of ['wood','paving','earth']){
    const mat=walkSurfaceMaterial(kind,1,[34,40]);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
    mat.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes('#include <lights_lambert_fragment>'));
    assert.ok(shader.fragmentShader.includes('#include <shadowmap_pars_fragment>'));
    assert.equal(shader.uniforms.uWalkKind.value,{wood:0,paving:1,earth:2}[kind]);
    let freed=0;mat.addEventListener('dispose',()=>freed++);
    disposeObject(new THREE.Mesh(new THREE.BoxGeometry(1,.3,2),mat));assert.equal(freed,1);
  }
});
