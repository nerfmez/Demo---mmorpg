// Surface pigments share the native ground painter. The mask is baked once;
// beds are painted into the walking surface, rather than floated over paving.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityFloorAt } from '../core/city.js';
import { SURFACE_PAINT_GLSL } from './ground-color.js';
import { groundBrushUniform } from './ground-brush.js';
import { outlined, toon } from './toon.js';
import art from '../../data/art.json' with {type:'json'};

const colour = hex => { const c = new THREE.Color(hex); return `vec3(${c.r},${c.g},${c.b})`; };
const edgeDistance = (points,x,z) => {
  let best=Infinity;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
    best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
  }
  return best;
};

export function cityGround(world, root) {
  const floors=world.data.city.floors.slice(0,2), bounds=[-24,-76,194,216],size=512;
  const trees=world.circles.filter(c=>['tree','birch','palm'].includes(c.type)&&cityFloorAt(world.data.city,c.x,c.z));
  const bytes=new Uint8Array(size*size*4);
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const x=bounds[0]+(i+.5)/size*bounds[2],z=bounds[1]+(j+.5)/size*bounds[3],k=(j*size+i)*4;
    let bed=0;for(const t of trees)bed=Math.max(bed,Math.max(0,Math.min(1,(1.17-Math.hypot(x-t.x,z-t.z))/.12)));
    const floor=floors.find(f=>x>=f.bounds[0]&&x<=f.bounds[1]&&z>=f.bounds[2]&&z<=f.bounds[3]);
    const edge=floor?edgeDistance(floor.points,x,z):0;
    // Soil/grass fringes soften the exterior pad; inner streets retain their geometry.
    const coast=world.coastAt(x,z);
    // The actual coastal quay stays paved. Green fringes belong on inland edges.
    const inland=coast.distance>10?1:0;
    bytes[k]=bed*255;bytes[k+1]=Math.max(0,Math.min(1,(6-edge)/5))*inland*255;bytes[k+3]=255;
  }
  const mask=new THREE.DataTexture(bytes,size,size);mask.name='city-soil-and-edge-mask';
  mask.magFilter=mask.minFilter=THREE.LinearFilter;mask.needsUpdate=true;
  let owners=0;
  const materials=new Map();
  const material=kind=>{
    if(materials.has(kind))return materials.get(kind);
    const m=new THREE.MeshLambertMaterial({color:0xffffff}),brush=groundBrushUniform(m);
    // Custom world-space paint must retain its shader when static scenery is batched.
    m.userData.walkSurface='city-'+kind;owners++;
    let released=false;
    m.addEventListener('dispose',()=>{if(released)return;released=true;if(--owners===0)mask.dispose();});
    m.onBeforeCompile=shader=>{
      shader.uniforms.uGroundBrush=brush;shader.uniforms.uCityMask={value:mask};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vCityGround;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvCityGround=(modelMatrix*vec4(position,1.0)).xz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec2 vCityGround;uniform sampler2D uCityMask;\n${SURFACE_PAINT_GLSL}
        vec3 citySetts(vec2 w,vec2 size,vec3 tone){
          float row=floor(w.y/size.y);vec2 p=w/size+vec2(mod(row,2.)*.5,0.);
          vec2 cell=floor(p),q=fract(p);float d=min(min(q.x,1.-q.x)*size.x,min(q.y,1.-q.y)*size.y);
          float aa=max(fwidth(d),.002);float joint=1.-smoothstep(.008-aa,.014+aa,d);
          vec3 stone=tone*(.97+hash12(cell)*.06)+(vnoise(w*4.)-.5)*.009;
          return mix(stone,tone*.88,joint);
        }`)
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec2 w=vCityGround;vec2 mask=texture2D(uCityMask,(w-vec2(-24.,-76.))/vec2(194.,216.)).rg;
          vec3 grass=mix(${colour(art.ground.palette.grassOchre)},vec3(.19,.30,.075),.72)*(.88+groundBrush(w).r*.22);
          vec3 earth=paintedEarth(w,0.0);
          vec3 pave=citySetts(w,vec2(.44,.30),vec3(.48,.435,.35));
          ${kind==='road'?'pave=citySetts(w,vec2(.65,.45),vec3(.54,.51,.425));':''}
          ${kind==='plaza'?'pave=citySetts(w,vec2(.54,.36),vec3(.57,.50,.385));float ring=abs(length(w-vec2(62.,22.))-7.3);pave=mix(pave,pave*.82,1.-smoothstep(.10,.18,ring));':''}
          ${kind==='lawn'?`vec3 brush=groundBrush(w);pave=${colour('#8ba250')}*(.86+brush.r*.25+(vnoise(w*.45)-.5)*.08);pave*=1.-brush.g*.08+brush.b*.07;`:''}
          ${kind==='base'?'pave=mix(pave,mix(earth,grass,smoothstep(.10,.88,mask.y)),mask.y);':''}
          diffuseColor.rgb=mix(pave,earth*.82,mask.x);
        `);
    };
    m.customProgramCacheKey=()=>`city-ground-v1-${kind}`;materials.set(kind,m);return m;
  };
  const parts=[];
  // Low segmented stone borders only around town trees, not forest edge trees.
  for(const t of trees.filter(t=>t.type==='birch'&&t.x>0&&t.x<100&&t.z>-50&&t.z<45)){
    const shape=new THREE.Shape();shape.absarc(0,0,1.23,0,Math.PI*2,false);
    const hole=new THREE.Path();hole.absarc(0,0,1.10,0,Math.PI*2,true);shape.holes.push(hole);
    const g=new THREE.ExtrudeGeometry(shape,{depth:.075,bevelEnabled:false,curveSegments:16});
    g.rotateX(-Math.PI/2).translate(t.x-root.position.x,world.groundY(t.x,t.z)-root.position.y,t.z-root.position.z);parts.push(g);
  }
  if(parts.length){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());const rim=outlined(g,toon('#969582'),{outline:'#656957',width:.012,castShadow:false});rim.name='native-tree-soil-borders';root.add(rim);}
  return {material,trees:trees.length};
}
