// One deterministic paint atlas for the whole ground family, baked once at construction.
// R = mottled brush tone, G/B = irregular shadow/light grass blades. No external asset/DOM.
import * as THREE from 'three';
import {createRng} from '../core/rng.js';
let atlas=null,owners=0;
function bakeBrushes(){
  const size=1024,bytes=new Uint8Array(size*size*4),rng=createRng(70921);
  for(let i=0;i<bytes.length;i+=4){bytes[i]=128;bytes[i+3]=255;}
  const index=(x,y)=>(((y%size+size)%size)*size+(x%size+size)%size)*4;
  // Overlapping uneven short brush daubs, not a smooth single-frequency noise wash.
  for(let i=0;i<4600;i++){
    const cx=rng.range(0,size),cy=rng.range(0,size),rx=rng.range(3,18),ry=rx*rng.range(.45,1.05),tone=rng.range(83,179);
    for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++){
      const u=(x+.5-cx)/rx,v=(y+.5-cy)/ry,d=u*u+v*v;
      if(d>=1)continue;const k=index(x,y),a=(1-d)*.63;
      bytes[k]=Math.round(bytes[k]*(1-a)+tone*a);
    }
  }
  // Short stubble tufts: many small clusters of short tapered marks with gaps, so the lawn has a
  // painted texture without long leaves that read as grass lying flat on the ground.
  for(let tuft=0;tuft<1500;tuft++){
    const cx=rng.range(0,size),cy=rng.range(0,size),radius=rng.range(5,16),direction=rng.range(-.7,.7);
    const leaves=rng.int(7,15);
    for(let leaf=0;leaf<leaves;leaf++){
      const a=rng.range(0,Math.PI*2),r=Math.sqrt(rng.next())*radius;
      const bx=cx+Math.cos(a)*r,by=cy+Math.sin(a)*r,angle=direction+rng.range(-1.0,1.0);
      const length=rng.range(4,11),width=rng.range(1.1,2.3),bend=rng.range(-2,2),c=Math.cos(angle),s=Math.sin(angle);
      const channel=rng.next()<.35?1:2,pigment=rng.range(112,232);
      const corners=[[0,-1],[-width-Math.abs(bend),length+1],[width+Math.abs(bend),length+1]].map(([x,y])=>[bx+c*x-s*y,by+s*x+c*y]);
      const minX=Math.floor(Math.min(...corners.map(p=>p[0]))-2),maxX=Math.ceil(Math.max(...corners.map(p=>p[0]))+2);
      const minY=Math.floor(Math.min(...corners.map(p=>p[1]))-2),maxY=Math.ceil(Math.max(...corners.map(p=>p[1]))+2);
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const dx=x+.5-bx,dy=y+.5-by,u=c*dx+s*dy,v=-s*dx+c*dy,t=v/length;
        if(t<=0||t>=1)continue;
        const half=width*Math.pow(Math.sin(Math.PI*t),.7),distance=Math.abs(u-bend*t*t);
        const coverage=Math.max(0,Math.min(1,half+.65-distance));if(!coverage)continue;
        const k=index(x,y)+channel;bytes[k]=Math.max(bytes[k],Math.round(pigment*coverage));
      }
    }
  }
  const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
  texture.name='ground-brush-atlas';texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}
export function groundBrushUniform(material){
  if(!atlas)atlas=bakeBrushes();const texture=atlas;owners++;
  let released=false;
  material.addEventListener('dispose',()=>{
    if(released)return;released=true;
    if(--owners===0){texture.dispose();atlas=null;}
  });
  return {value:texture};
}
