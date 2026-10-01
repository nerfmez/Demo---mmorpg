// Authored low-poly silhouettes for the frontier's foliage. All variants stay instanced.
import * as THREE from 'three';
import art from '../../data/art.json';
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
 const rng=createRng(620),positions=[];
 // Six narrow three-segment blades: delicate curved tips, no broad triangular fern cards.
 for(let i=0;i<6;i++){
  // blade height/width/bend ranges (metres) from art.grass.blade: tall and upright enough to read
  // as standing under the 3/4 camera
  const B=art.grass.blade;
  const a=i*2.39996+rng.range(-.25,.25),h=rng.range(...B.height),width=rng.range(...B.width),bend=rng.range(...B.bend);
  const points=[];
  for(let j=0;j<=3;j++){
   const t=j/3,w=width*(j===0?.33:j===3?0:1-t*.72);
   const y=h*(t-.13*t*t),z=bend*t*t,offset=Math.sin(a)*.07;
   points.push([Math.cos(a)*(-w)+Math.sin(a)*z+offset,y,-Math.sin(a)*(-w)+Math.cos(a)*z+Math.cos(a)*.07]);
   points.push([Math.cos(a)*w+Math.sin(a)*z+offset,y,-Math.sin(a)*w+Math.cos(a)*z+Math.cos(a)*.07]);
  }
  for(let j=0;j<3;j++){
   const k=j*2;positions.push(...points[k],...points[k+1],...points[k+2]);
   if(j<2)positions.push(...points[k+1],...points[k+3],...points[k+2]);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
 const colors=[];for(let i=0;i<g.attributes.position.count;i++){
  const t=Math.min(1,g.attributes.position.getY(i)/.54);colors.push(.63+t*.32,.71+t*.24,.46+t*.25);
 }
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
export function wildflowers() {
 const parts=[],h=.29;
 const stem=new THREE.CylinderGeometry(.008,.011,h,3);stem.translate(0,h/2,0);parts.push(coloured(stem,'#71844d'));
 for(let i=0;i<5;i++){
  const a=i*Math.PI*2/5,g=new THREE.CircleGeometry(.060,6);g.rotateX(-Math.PI/2);g.scale(.85,1,1.32);g.rotateZ(Math.sin(a)*.12);g.translate(Math.sin(a)*.064,h+Math.cos(a)*.006,Math.cos(a)*.064);parts.push(coloured(g));
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

/** A scalloped fan and a coiled gastropod; surface relief stays readable at field scale. */
export function beachShell(kind = 'fan') {
 const pos=[], colors=[], indices=[];
 const vertex=(x,y,z,t)=>{pos.push(x,y,z);colors.push(t,t*.98,t*.93);};
 if(kind==='fan') {
  const rings=6,segments=28;
  for(let r=0;r<=rings;r++)for(let i=0;i<=segments;i++){
   const u=r/rings,a=-1.2+i/segments*2.4,rib=Math.cos(i/segments*Math.PI*18);
   const radius=(.46+.02*rib)*u;
   vertex(Math.sin(a)*radius,.025+Math.sin(u*Math.PI)*.105+rib*.018*u,Math.cos(a)*radius-.18,.79+.14*(rib*.5+.5)+.06*u);
  }
  for(let r=0;r<rings;r++)for(let i=0;i<segments;i++){
   const a=r*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
 } else {
  const segments=48,sides=7;
  for(let i=0;i<=segments;i++){
   const t=i/segments,a=t*Math.PI*5.3,rad=.27*(1-t)+.025,tube=.1*(1-t)+.008;
   for(let j=0;j<=sides;j++){
    const b=j/sides*Math.PI*2,rr=rad+Math.cos(b)*tube;
    vertex(Math.cos(a)*rr,.11+t*.11+Math.sin(b)*tube,Math.sin(a)*rr,.78+.17*Math.max(0,Math.sin(b))+.04*Math.sin(a*7));
   }
  }
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
   const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,a+1,b,a+1,b+1,b);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

// Coconut palm, built along +Y and leaning toward +Z (instance ry turns the lean). The trunk is a
// stack of short flared rings following a soft curve; vertex colour darkens each ring's foot and
// lights its lip. Returns the geometry and the local crown position for placing fronds.
export function palmTrunk(height=5.2,lean=1.25,rings=11) {
  const parts=[],at=t=>new THREE.Vector3(0,height*t,lean*Math.pow(t,1.7));
  const dark=new THREE.Color('#6f5640'),light=new THREE.Color('#b39672');
  for(let i=0;i<rings;i++){
    const t0=i/rings,t1=(i+1)/rings,a=at(t0),b=at(t1),dir=b.clone().sub(a),r=.27-.11*t0;
    const g=new THREE.CylinderGeometry(r*1.05,r*.84,dir.length()*1.02,8,1,false);
    const pos=g.attributes.position,col=[];
    for(let k=0;k<pos.count;k++){const c=dark.clone().lerp(light,pos.getY(k)>0?.85:.15);col.push(c.r,c.g,c.b);}
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()));
    g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);g.deleteAttribute('uv');parts.push(g);
  }
  const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  return {geometry,crown:at(1)};
}
// One arching frond along +Z: a slender midrib and many paired leaflets that hang lower toward
// the tip, so the frond falls softly instead of standing as a stiff fan. Colour runs from a fresh
// mid-green base to a sunlit yellow-green tip; young fronds stand up, old ones droop.
export function palmFrond(length=3.4,lift=1.0,droop=1.7) {
  const positions=[],colors=[],normals=[];
  const base=new THREE.Color('#6aa84f'),tip=new THREE.Color('#cbe68c');
  const spine=t=>[Math.sin(t*2.2)*.08*t,Math.sin(t*Math.PI*.5)*lift-t*t*t*droop,t*length];
  const vertex=(p,t)=>{positions.push(...p);normals.push(0,1,0);const c=base.clone().lerp(tip,Math.min(1,t));colors.push(c.r,c.g,c.b);};
  const steps=24;
  for(let i=1;i<steps;i++){
    const t=i/steps,dt=1/steps,w=(.62*Math.pow(Math.sin(Math.PI*Math.min(1,t*1.05)),.6)+.05)*(1-t*.3);
    const a=spine(t),b=spine(Math.min(1,t+dt*.55));
    for(const side of [-1,1]){
      // leaflets sweep back and hang: more at the tip, a little alternate flutter
      const hang=w*(.45+.75*t)+(i%2)*.04;
      const end=[a[0]+side*w*.9,a[1]-hang,a[2]-w*.42];
      const mid=[a[0]+side*w*.45,a[1]-hang*.35+.02,a[2]-w*.12];
      vertex(a,t*.7);vertex(b,t*.7+.04);vertex(mid,t*.85+.1);
      vertex(a,t*.7);vertex(mid,t*.85+.1);vertex(end,t+.3);
    }
    const m=spine(t-dt);
    for(const p of [[m[0]-.02,m[1]+.015,m[2]],[m[0]+.02,m[1]+.015,m[2]],[a[0]+.02,a[1]+.015,a[2]],[m[0]-.02,m[1]+.015,m[2]],[a[0]+.02,a[1]+.015,a[2]],[a[0]-.02,a[1]+.015,a[2]]])vertex(p,t*.5);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
