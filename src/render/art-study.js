// Local art study. A crown is built from overlapping pointed leaves arranged in branch
// sprays, not a deformed solid ball. Geometry is shared by chunked tree instances.
import * as THREE from 'three';
import art from '../../data/art.json';
import { createRng } from '../core/rng.js';
import { animeStudy, animeConfig, animeFoliage, branchletTexture } from './anime-study.js';

export function inArtStudy(x,z) {
  if(animeStudy)return true; // art=anime covers the whole map
  const b=art.study.bounds;
  return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
}

export function cloudCrown(seed=3,shrub=false) {
  if(animeStudy)return animeFoliage(seed,shrub);
  const rng=createRng(seed),pos=[],normals=[],colors=[],uv=[];
  const clusters=shrub?[
    [0,.13,0,.58,.35,.55],[-.40,-.08,.15,.42,.29,.42],[.36,-.04,.14,.43,.31,.42]
  ]:[
    [-.08,.37,-.12,.55,.33,.49],
    [-.49,.02,-.20,.48,.29,.42],[.42,.10,-.29,.47,.31,.44],
    [-.49,-.10,.32,.44,.28,.41],[.35,-.03,.36,.52,.31,.44],
    [-.04,-.17,.45,.49,.27,.38],[-.04,.03,-.53,.50,.27,.36],
    [-.22,.55,.02,.39,.26,.37],[.27,.43,.06,.40,.25,.39]
  ];
  const dark=new THREE.Color('#527347'),mid=new THREE.Color('#819e5e'),light=new THREE.Color('#a8ba76');
  const basisX=new THREE.Vector3(),basisZ=new THREE.Vector3(),n=new THREE.Vector3();
  const c=new THREE.Color();
  const ring=[[-1,-.5],[1,-.5],[1,.5],[-1,.5]];
  for(const [cx,cy,cz,rx,ry,rz] of clusters) {
    const count=shrub?art.study.shrubLeavesPerSpray:art.study.treeLeavesPerSpray;
    for(let i=0;i<count;i++) {
      const dy=1-1.85*(i+.5)/count,a=i*2.39996+rng.range(-.23,.23),r=Math.sqrt(1-dy*dy);
      const dx=Math.cos(a)*r,dz=Math.sin(a)*r;
      const centre=new THREE.Vector3(cx+dx*rx,cy+dy*ry,cz+dz*rz);
      // Each spray follows its parent branch, then fans gently at its outer edge.
      // The long axis is projected onto the leaf plane; tips on lower/outer sprays
      // naturally slope down instead of lying flat in randomly rotated piles.
      n.set(dx*.72,.72+dy*.38,dz*.72).normalize();
      const branchAngle=Math.atan2(cz+dz*.42,cx+dx*.42);
      const fan=(i%2?1:-1)*.22+rng.range(-.16,.16);
      basisZ.set(Math.cos(branchAngle+fan),-.12,Math.sin(branchAngle+fan));
      basisZ.addScaledVector(n,-basisZ.dot(n)).normalize();
      basisX.crossVectors(n,basisZ).normalize();
      const xx=basisX,zz=basisZ;
      const length=shrub?rng.range(.35,.48):rng.range(.18,.27),width=length*rng.range(.24,.34);
      const t=THREE.MathUtils.smoothstep(centre.y,-.50,.78);
      c.copy(dark).lerp(mid,Math.min(1,t*1.7)).lerp(light,Math.max(0,(t-.55)*1.7));
      c.multiplyScalar(rng.range(.91,1.06));
      const verts=ring.map(([x,z])=>centre.clone().addScaledVector(xx,x*width).addScaledVector(zz,z*length).addScaledVector(n,-Math.abs(x)*.024));
      for(const k of [0,2,1,0,3,2]) {
        const v=verts[k];
          pos.push(v.x,v.y,v.z);uv.push(k===1||k===2?1:0,k>=2?1:0);
          // Lighting follows the whole spray; folded leaves do not become black shards.
          normals.push(n.x,n.y,n.z);
          colors.push(c.r,c.g,c.b);
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeBoundingSphere();return g;
}

let leafMap;
export function studyLeafTexture() {
  if(animeStudy)return branchletTexture(false);
  if(leafMap)return leafMap;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d');
  // One botanical leaf, not a repeated picture of a whole crown. The alpha boundary
  // supplies smooth pointed silhouettes while each plane occupies a real 3D position.
  ctx.fillStyle='#eef0e9';ctx.beginPath();ctx.moveTo(62,3);
  ctx.bezierCurveTo(76,24,117,44,107,74);
  ctx.bezierCurveTo(102,97,76,113,63,126);
  ctx.bezierCurveTo(48,105,13,95,19,62);
  ctx.bezierCurveTo(22,37,48,17,62,3);ctx.fill();
  ctx.fillStyle='#ffffff';ctx.beginPath();ctx.moveTo(62,3);
  ctx.bezierCurveTo(72,33,70,74,63,126);
  ctx.bezierCurveTo(77,102,98,86,102,65);
  ctx.bezierCurveTo(103,45,75,20,62,3);ctx.fill();
  ctx.strokeStyle='rgba(70,85,55,.20)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(62,10);ctx.quadraticCurveTo(72,62,63,119);ctx.stroke();
  leafMap=new THREE.CanvasTexture(canvas);leafMap.colorSpace=THREE.SRGBColorSpace;
  leafMap.anisotropy=4;return leafMap;
}

// A separate low shrub: broad, round leaves form shallow interlocking mounds.
// Its origin is soil level. It is deliberately not a scaled tree canopy.
export function lowShrub(seed=11) {
  if(animeStudy)return animeFoliage(seed,true);
  const rng=createRng(seed),positions=[],normals=[],colors=[],uv=[];
  const mounds=[[-.34,.15,.08,.37],[.28,.17,.08,.41],[-.02,.30,-.20,.38]];
  const low=new THREE.Color('#557748'),high=new THREE.Color('#8ba866');
  for(const [cx,cy,cz,radius] of mounds)for(let i=0;i<18;i++) {
    const a=i*2.39996,spread=Math.sqrt((i+.5)/18),x=Math.cos(a),z=Math.sin(a);
    const centre=new THREE.Vector3(cx+x*radius*spread,cy+.25*Math.sqrt(1-spread*spread),cz+z*radius*spread);
    const n=new THREE.Vector3(x*spread*.8,.2+Math.sqrt(1-spread*spread)*.9,z*spread*.8).normalize();
    const length=rng.range(.31,.43),width=length*.40;
    const az=a+rng.range(-.3,.3),along=new THREE.Vector3(Math.cos(az),0,Math.sin(az));
    along.addScaledVector(n,-along.dot(n)).normalize();
    const across=new THREE.Vector3().crossVectors(n,along).normalize();
    const c=low.clone().lerp(high,.30+(1-spread)*.60).multiplyScalar(rng.range(.97,1.03));
    const corners=[[-1,-.5],[1,-.5],[1,.5],[-1,.5]].map(([u,v])=>centre.clone().addScaledVector(across,u*width).addScaledVector(along,v*length));
    for(const k of [0,2,1,0,3,2]){
      const p=corners[k];positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);colors.push(c.r,c.g,c.b);uv.push(k===1||k===2?1:0,k>=2?1:0);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeBoundingSphere();return g;
}

let shrubMap;
export function studyShrubTexture() {
  if(animeStudy)return branchletTexture(true);
  if(shrubMap)return shrubMap;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const c=canvas.getContext('2d');c.fillStyle='#f3f4ed';
  c.beginPath();c.moveTo(64,8);c.bezierCurveTo(116,5,122,60,102,89);
  c.bezierCurveTo(90,106,70,116,64,124);c.bezierCurveTo(44,103,15,95,14,60);
  c.bezierCurveTo(13,27,34,5,64,8);c.fill();
  c.fillStyle='rgba(255,255,255,.40)';c.beginPath();c.ellipse(58,42,28,22,-.45,0,Math.PI*2);c.fill();
  shrubMap=new THREE.CanvasTexture(canvas);shrubMap.colorSpace=THREE.SRGBColorSpace;shrubMap.anisotropy=4;return shrubMap;
}
