import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {Ribbon} from '../../src/render/ribbon.js';

test('scarf motion, normals, reset and teleport match the original High-quality trace exactly', () => {
  const expected=JSON.parse(readFileSync(new URL('../render/ribbon-motion.json',import.meta.url),'utf8'));
  const r=new Ribbon(),anchor=new THREE.Vector3(),back=new THREE.Vector3(0,0,1),side=new THREE.Vector3(1,0,0);
  const now=performance.now;
  performance.now=()=>1234;
  try {
    for(let i=0;i<expected.length;i++) {
      anchor.set(i<10?i*.04:3,1.7+i*.01,i*.025);
      if(i===8)r.reset();
      r.update(i===5?.08:1/60,anchor,back,side,.4);
      assert.deepEqual({pos:[...r.pos],normal:[...r.mesh.geometry.attributes.normal.array],pts:r.pts.map(p=>p.toArray()),prev:r.prev.map(p=>p.toArray())},expected[i]);
    }
  } finally {
    performance.now=now;r.mesh.geometry.dispose();r.mesh.material.dispose();
  }
});
