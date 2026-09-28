// Authored low-poly silhouettes for the frontier's foliage. All variants stay instanced.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createRng} from '../core/rng.js';

function coloured(g,color='#ffffff') {
 g.deleteAttribute('uv');const c=new THREE.Color(color),arr=[];
 for(let i=0;i<g.attributes.position.count;i++)arr.push(c.r,c.g,c.b);
 g.setAttribute('color',new THREE.Float32BufferAttribute(arr,3));return g.index?g.toNonIndexed():g;
}
function join(gs){return mergeGeometries(gs.map(g=>{g.deleteAttribute('uv');return g.index?g.toNonIndexed():g;}));}
function leafBlade(width=.11,length=.42) {
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-width,.03,length*.42,0,.1,length, 0,0,0,0,.1,length,width,.03,length*.42],3));
 g.computeVertexNormals();return g;
}
export function leafCrown(seed=7) {
 const rng=createRng(seed),parts=[];
 // All leaf masses face the fixed ARPG camera. Volume comes from their positions,
 // avoiding exposed board edges when instances are rotated around their trunks.
 for(let i=0;i<15;i++){
  const a=i*2.39996,r=i===0?0:Math.sqrt(i/15)*.70;
  const x=Math.cos(a)*r,z=Math.sin(a)*r,y=.30+Math.sqrt(Math.max(0,1-r*r))*.23-i*.018;
  const size=rng.range(.77,1.08);
  const g=new THREE.PlaneGeometry(size,size);g.rotateX(-1.02);g.translate(x,y,z);
  parts.push(g);
 }
 return mergeGeometries(parts);
}
export function pineBough() {
 const g=new THREE.PlaneGeometry(2.3,2.65);g.rotateX(-.60);g.translate(0,1.0,0);return g;
}
export function branchTrunk() {
 const parts=[];
 const segment=(a,b,r0,r1)=>{
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),dir=end.clone().sub(start);
  const g=new THREE.CylinderGeometry(r1,r0,dir.length(),7);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());parts.push(coloured(g));
 };
 segment([0,0,0],[.10,2.9,-.1],.34,.17);
 segment([.02,1.6,0],[-.83,3.2,.33],.17,.055);segment([.06,2,-.05],[1.04,3.54,-.22],.16,.045);
 segment([.06,2.5,-.09],[.24,3.78,.82],.11,.035);
 for(let i=0;i<5;i++){const a=i*1.256;segment([0,.32,0],[Math.sin(a)*.71,.01,Math.cos(a)*.71],.18,.025);}
 return join(parts);
}
export function meadowGrass() {
 const rng=createRng(620),parts=[];
 for(let i=0;i<8;i++){
  const g=leafBlade(.028+rng.next()*.027,.28+rng.next()*.34);
  // Curl upward from a narrow root, with a fine pointed tip.
  const p=g.attributes.position;
  for(let k=0;k<p.count;k++){const t=p.getZ(k);p.setXYZ(k,p.getX(k),t*.95,p.getY(k)+t*t*.48);}
  g.computeVertexNormals();g.rotateY(i*2.399);g.translate(Math.sin(i*2.399)*.12,0,Math.cos(i*2.399)*.12);
  coloured(g);const c=g.attributes.color;
  for(let k=0;k<p.count;k++){const t=Math.min(1,p.getY(k)/.6),col=new THREE.Color().setRGB(.60+t*.35,.67+t*.28,.43+t*.28);c.setXYZ(k,col.r,col.g,col.b);}
  parts.push(g);
 }
 return join(parts);
}
export function wildflowers() {
 const parts=[],h=.24;
 const stem=new THREE.CylinderGeometry(.008,.011,h,3);stem.translate(0,h/2,0);parts.push(coloured(stem,'#71844d'));
 for(let i=0;i<5;i++){
  const a=i*Math.PI*2/5,g=new THREE.CircleGeometry(.052,5);g.rotateX(-Math.PI/2);g.scale(.8,1,1.28);g.translate(Math.sin(a)*.057,h,Math.cos(a)*.057);parts.push(coloured(g));
 }
 const center=new THREE.CircleGeometry(.03,6);center.rotateX(-Math.PI/2);center.translate(0,h+.004,0);parts.push(coloured(center,'#e2b856'));
 const g=leafBlade(.028,.14);g.rotateY(1.5);g.translate(0,h*.38,0);parts.push(coloured(g,'#7b9b55'));
 return join(parts);
}
export function facetedStone() {
 const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position;
 for(let i=0;i<p.count;i++) {const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x*(1+.09*Math.sin(z*8)),Math.min(.78,y*(1+.12*Math.sin(x*6+z))),z*(1+.10*Math.cos(x*7)));}
 g.computeVertexNormals();return g;
}
