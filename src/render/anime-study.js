// Opt-in art preview. No game state or shared world data is modified.
import * as THREE from 'three';
import art from '../../data/art.json';
import { createRng } from '../core/rng.js';
import { patchMaterial } from './patch.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// On by default; ?art=baseline restores the previous look for comparison.
export const animeStudy = typeof location === 'undefined' || new URLSearchParams(location.search).get('art') !== 'baseline';
export const artReviewLayout = typeof location !== 'undefined' && ['anime','baseline'].includes(new URLSearchParams(location.search).get('art'));
export const animeConfig = art.anime;

function foliageColor(point, normal, shrub) {
  const prefix=shrub?'shrub':'leaf',palette=animeConfig.palette;
  const dark=new THREE.Color(palette[prefix+'Shadow']),mid=new THREE.Color(palette[prefix+'Mid']),light=new THREE.Color(palette[prefix+'Light']);
  const height=shrub?THREE.MathUtils.smoothstep(point.y,.08,1.1):THREE.MathUtils.smoothstep(point.y,-.45,.85);
  const lit=THREE.MathUtils.clamp(normal.dot(new THREE.Vector3(-.5,1,.25).normalize())*.26+height*.50+.10,0,1);
  return dark.lerp(mid,Math.min(1,lit*1.9)).lerp(light,Math.max(0,(lit-.53)*1.9));
}

// Four connected, jagged paint silhouettes shared by all instances.
const maps = new Map();
export function branchletTexture(shrub = false) {
  if (maps.has(shrub)) return maps.get(shrub);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), rng = createRng(shrub ? 708 : 391);
  // Connected paint silhouettes: broad asymmetrical lobes with torn/notched
  // boundaries. There is deliberately no individual botanical leaf primitive.
  const profiles=animeConfig.patchProfiles;
  for(let tile=0;tile<4;tile++) {
    ctx.save();ctx.translate((tile%2)*256,Math.floor(tile/2)*256);
    const outline=profiles[tile];ctx.fillStyle='#ffffff';ctx.beginPath();
    ctx.moveTo(...outline[0]);
    for(let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length];
      const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
      const steps=Math.max(1,Math.floor(len/rng.range(9,18)));
      for(let j=1;j<=steps;j++) {
        const t=j/steps,edge=j===steps?0:rng.range(-11,7);
        ctx.lineTo(a[0]+dx*t-dy/len*edge,a[1]+dy*t+dx/len*edge);
        if(j<steps)ctx.lineTo(a[0]+dx*(t+.025)+dy/len*4,a[1]+dy*(t+.025)-dx/len*4);
      }
    }
    ctx.closePath();ctx.fill();ctx.restore();
  }
  // Keep RGB white even in fully transparent texels. Canvas premultiplication
  // otherwise makes mip-filtered alpha edges dark, producing black leaf speckles.
  const pixels=ctx.getImageData(0,0,512,512).data;
  for(let i=0;i<pixels.length;i+=4)pixels[i]=pixels[i+1]=pixels[i+2]=255;
  const map=new THREE.DataTexture(pixels,512,512,THREE.RGBAFormat);
  map.flipY=true;map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;
  map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  map.userData.shared=true;maps.set(shrub,map);return map;
}

export function animeFoliage(seed=3,shrub=false) {
  const rng=createRng(seed),p=[],n=[],c=[],uv=[];
  const cfg=animeConfig,clusters=shrub?cfg.shrubSprays:cfg.treeSprays;
  const count=shrub?cfg.shrubCardsPerSpray:cfg.treeCardsPerSpray;
  const sizes=shrub?cfg.shrubCardSize:cfg.treeCardSize;
  const shade=new THREE.Color();
  const append=(center,normal,size,roll,tile,col)=>{
    const across=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),normal);
    if(across.lengthSq()<.001)across.set(1,0,0);else across.normalize();
    const along=new THREE.Vector3().crossVectors(normal,across).normalize();
    const x=across.clone().multiplyScalar(Math.cos(roll)).addScaledVector(along,Math.sin(roll));
    const y=along.clone().multiplyScalar(Math.cos(roll)).addScaledVector(across,-Math.sin(roll));
    // A tessellated arch, not a flat card or a four-triangle pyramid.
    const segments=4;
    const vertex=(a,b)=>{
      const bulge=size*.14*(1-a*a)*(1-b*b);
      const v=center.clone().addScaledVector(x,a*size*.56).addScaledVector(y,b*size*.56).addScaledVector(normal,bulge);
      const curvedNormal=normal.clone().addScaledVector(x,a*.28*(1-b*b)).addScaledVector(y,b*.28*(1-a*a)).normalize();
      p.push(v.x,v.y,v.z);n.push(curvedNormal.x,curvedNormal.y,curvedNormal.z);
      const tone=foliageColor(v,curvedNormal,shrub).lerp(col,.22);
      c.push(tone.r,tone.g,tone.b);
      uv.push(((tile%2)+(a+1)*.5)*.5,(Math.floor(tile/2)+(b+1)*.5)*.5);
    };
    for(let j=0;j<segments;j++)for(let i=0;i<segments;i++) {
      const a=-1+i*2/segments,b=-1+j*2/segments,step=2/segments;
      for(const [u,v] of [[a,b],[a+step,b],[a+step,b+step],[a,b],[a+step,b+step],[a,b+step]])vertex(u,v);
    }

  };
  // Sparse, unequal overlapping painted patches along each authored branch.
  // They fill the volume itself, rather than tile the surface of a sphere.
  clusters.forEach(([cx,cy,cz,rx,ry,rz],ci)=>{
    for(let i=0;i<count;i++) {
      // Interlocking branch surfaces cross through a volume; they do not form
      // an enclosing spherical shell or share one camera-facing orientation.
      const angle=i*2.39996+ci*1.67+rng.range(-.4,.4);
      const dx=rng.range(-1,1),dz=rng.range(-1,1);
      const centre=new THREE.Vector3(cx+dx*rx*.90,cy+rng.range(-.65,.85)*ry,cz+dz*rz*.90);
      const slope=i%3===0?.38:.80;
      const normal=new THREE.Vector3(Math.cos(angle)*slope,.65,Math.sin(angle)*slope).normalize();
      const size=rng.range(...sizes)*(i===0?1.1:1);
      shade.copy(foliageColor(centre,normal,shrub));
      shade.multiplyScalar(.99+(ci%3)*.018);
      append(centre,normal,size,rng.range(-1.4,1.4),ci%2===0?i%4:(i+1)%4,shade);
    }
  });
  const g=new THREE.BufferGeometry();
  for(const [key,array,size] of [['position',p,3],['normal',n,3],['color',c,3],['uv',uv,2]])g.setAttribute(key,new THREE.Float32BufferAttribute(array,size));
  g.computeBoundingSphere();return g;
}

export function animeFoliageMaterial(shrub=false) {
  // Painted lighting belongs to the foliage mass, not the individual alpha cards.
  // The mesh still casts a real shadow onto the ground and neighbouring props.
  const m=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,map:branchletTexture(shrub),alphaTest:.45,side:THREE.DoubleSide,forceSinglePass:true});
  patchMaterial(m,{wind:shrub ? .018 : .014,windBase:shrub?0:1.2,see:!shrub});
  m.customProgramCacheKey=()=>`anime-branchlet-${shrub}-1`;
  return m;
}

export function shrubStems() {
  const parts=[];
  for(const [x,y,z] of animeConfig.shrubSprays) {
    const a=new THREE.Vector3(x*.15,0,z*.15),b=new THREE.Vector3(x,y,z),d=b.clone().sub(a);
    const geo=new THREE.CylinderGeometry(.009,.025,d.length(),5);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
    geo.translate(...a.add(b).multiplyScalar(.5).toArray());parts.push(geo);
  }
  const result=mergeGeometries(parts);parts.forEach(g=>g.dispose());return result;
}

// Authored tapered trunk, buttress roots and branch junctions. Broad painted
// facets replace the old repeating bark noise; creases are sparse tapered strokes.
export function animeTrunk() {
  const cfg=animeConfig.trunk,p=[],n=[],c=[];
  const pal=animeConfig.palette,sun=new THREE.Vector3(-.6,.55,.55).normalize();
  const light=new THREE.Color(pal.trunkLight),mid=new THREE.Color(pal.trunkMid),shadow=new THREE.Color(pal.trunkShadow),ink=new THREE.Color(pal.trunkLine);
  const paths=[cfg.spine,...cfg.roots];
  for(const [x,y,z] of animeConfig.treeSprays) {
    const end=[x*2.5,3.5+y*1.7,z*2.25,.025];
    paths.push([[.05,1.85,0,.175],[x*.80,2.65+y*.40,z*.65,.125],[x*1.65,3.1+y*1.0,z*1.5,.07],end]);
  }
  const write=(v,no,color)=>{p.push(...v.toArray());n.push(...no.toArray());c.push(color.r,color.g,color.b);};
  for(const path of paths) {
    const rings=path.map(([x,y,z,r],i)=>{
      const prev=new THREE.Vector3(...path[Math.max(0,i-1)].slice(0,3));
      const next=new THREE.Vector3(...path[Math.min(path.length-1,i+1)].slice(0,3));
      const tangent=next.sub(prev).normalize();
      const across=new THREE.Vector3(0,0,1).cross(tangent).normalize();
      const along=tangent.clone().cross(across).normalize(),center=new THREE.Vector3(x,y,z);
      return Array.from({length:cfg.sides},(_,k)=>{
        const a=k/cfg.sides*Math.PI*2,no=across.clone().multiplyScalar(Math.cos(a)).addScaledVector(along,Math.sin(a));
        return {v:center.clone().addScaledVector(no,r),no};
      });
    });
    for(let j=0;j<rings.length-1;j++)for(let k=0;k<cfg.sides;k++) {
      const kk=(k+1)%cfg.sides,quad=[rings[j][k],rings[j][kk],rings[j+1][kk],rings[j+1][k]];
      const normal=quad[0].no.clone().add(quad[1].no).normalize(),lit=normal.dot(sun);
      const tone=lit>.33?mid.clone().lerp(light,THREE.MathUtils.smoothstep(lit,.33,.9)):shadow.clone().lerp(mid,THREE.MathUtils.smoothstep(lit,-.65,.33));
      for(const id of [0,1,2,0,2,3])write(quad[id].v,normal,tone);
    }
  }
  // A handful of broken bark strokes follow the bent spine, never a full stripe pattern.
  for(const [angle,from,to,width] of cfg.creases) {
    const samples=[];
    for(let i=0;i<=8;i++) {
      const t=i/8,y=THREE.MathUtils.lerp(from,to,t),sp=cfg.spine;
      let j=0;while(j<sp.length-2&&sp[j+1][1]<y)j++;
      const u=(y-sp[j][1])/(sp[j+1][1]-sp[j][1]),x=THREE.MathUtils.lerp(sp[j][0],sp[j+1][0],u),z=THREE.MathUtils.lerp(sp[j][2],sp[j+1][2],u),r=THREE.MathUtils.lerp(sp[j][3],sp[j+1][3],u);
      const a=angle+Math.sin(t*3.1)*.10,half=Math.sin(t*Math.PI)*width;
      // Ring-section apothem avoids floating above the faceted trunk surface.
      const sector=2*Math.PI/cfg.sides,theta=a%(sector),radius=r*Math.cos(Math.PI/cfg.sides)/Math.cos(theta-Math.PI/cfg.sides)+.003;
      samples.push([-1,1].map(side=>new THREE.Vector3(x+Math.cos(a+side*half)*radius,y,z+Math.sin(a+side*half)*radius)));
    }
    for(let i=0;i<8;i++)for(const [j,k] of [[i,0],[i+1,0],[i+1,1],[i,0],[i+1,1],[i,1]])write(samples[j][k],new THREE.Vector3(Math.cos(angle),0,Math.sin(angle)),ink);
  }
  const g=new THREE.BufferGeometry();for(const [key,array] of [['position',p],['normal',n],['color',c]])g.setAttribute(key,new THREE.Float32BufferAttribute(array,3));g.computeBoundingSphere();return g;
}

export function animeTrunkMaterial() {
  return patchMaterial(new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}),{see:true});
}
