// Small frontier art study: continuous crown surfaces and broad painted materials.
// Inspired by Sakuragaoka Station's foliage/normal approach; original implementation.
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import art from '../../data/art.json';
import { createRng } from '../core/rng.js';

export function inArtStudy(x,z) {
  const b=art.study.bounds;
  return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
}

export function cloudCrown(seed=3,shrub=false) {
  const rng=createRng(seed),lobes=[];
  for(let i=0;i<36;i++) {
    const y=1-2*(i+.5)/36,a=i*2.39996+seed,r=Math.sqrt(1-y*y);
    lobes.push({x:Math.cos(a)*r,y,z:Math.sin(a)*r,k:rng.range(.18,.30)});
  }
  const g=mergeVertices(new THREE.SphereGeometry(1,shrub?16:art.study.canopySegments,shrub?10:art.study.canopyRings).deleteAttribute('normal').deleteAttribute('uv'));
  const p=g.attributes.position,dirs=[],valleys=[];
  for(let i=0;i<p.count;i++) {
    const d=new THREE.Vector3().fromBufferAttribute(p,i).normalize();dirs.push(d);
    let puff=0;
    for(const l of lobes) puff+=l.k*Math.exp((d.x*l.x+d.y*l.y+d.z*l.z-1)*35);
    const radius=.78+puff;
    p.setXYZ(i,d.x*radius,d.y*radius*.77,d.z*radius*.92);
    valleys.push(puff);
  }
  g.computeVertexNormals();
  const n=g.attributes.normal,col=new Float32Array(p.count*3);
  const low=new THREE.Color('#638654'),high=new THREE.Color('#9eb56d'),c=new THREE.Color();
  for(let i=0;i<p.count;i++) {
    const d=dirs[i],q=new THREE.Vector3().fromBufferAttribute(n,i);
    const ellipsoid=new THREE.Vector3(d.x,d.y/.77,d.z/.92).normalize();
    q.lerp(ellipsoid,art.study.canopyNormalBlend).normalize();n.setXYZ(i,q.x,q.y,q.z);
    c.copy(low).lerp(high,THREE.MathUtils.smoothstep(d.y,-.7,.85));
    c.multiplyScalar(.82+.24*THREE.MathUtils.smoothstep(valleys[i],.06,.25));col.set([c.r,c.g,c.b],i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  g.computeBoundingSphere();
  return g;
}
