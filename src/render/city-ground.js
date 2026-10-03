// Surface pigments share the native ground painter. The mask is baked once;
// beds are painted into the walking surface, rather than floated over paving.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityFloorAt, cityFloorHeight } from '../core/city.js';
import { GROUND_COLOR_GLSL } from './ground-color.js';
import { groundFieldUniforms, surfaceData } from './ground.js';
import { timeUniform } from './patch.js';
import { distToPolyline } from '../core/math.js';
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
  const lightBytes=new Uint8Array(size*size*4),darkBytes=new Uint8Array(size*size*4),surface=surfaceData(world),hf=world.heightfield;
  const cape=world.data.city.capeTransition;
  const capePaths=world.roads.filter(r=>r.points.some(p=>p[0]<60&&p[1]>90));
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const x=bounds[0]+(i+.5)/size*bounds[2],z=bounds[1]+(j+.5)/size*bounds[3],k=(j*size+i)*4;
    const ni=Math.max(0,Math.min(hf.w-1,Math.round((x-hf.ox)/hf.res))),nj=Math.max(0,Math.min(hf.h-1,Math.round((z-hf.oz)/hf.res))),nk=nj*hf.w+ni;
    for(const [c,channel]of ['r','g','b'].entries()){lightBytes[k+c]=surface['l'+channel][nk]*255;darkBytes[k+c]=surface['d'+channel][nk]*255;}
    lightBytes[k+3]=surface.town[nk]*255;darkBytes[k+3]=surface.dirt[nk]*255;
    let bed=0;for(const t of trees)bed=Math.max(bed,Math.max(0,Math.min(1,(1.17-Math.hypot(x-t.x,z-t.z))/.12)));
    const floor=floors.find(f=>x>=f.bounds[0]&&x<=f.bounds[1]&&z>=f.bounds[2]&&z<=f.bounds[3]);
    const edge=floor?edgeDistance(floor.points,x,z):0;
    // Soil/grass fringes soften the exterior pad; inner streets retain their geometry.
    const coast=world.coastAt(x,z);
    // The actual coastal quay stays paved. Green fringes belong on inland edges.
    const inland=coast.distance>10?1:0;
    const localCape=cape&&x>=cape.bounds[0]&&x<=cape.bounds[1]&&z>=cape.bounds[2]&&z<=cape.bounds[3];
    let join=0,road=0;
    if(localCape&&world.heightfield.heightAt(x,z)>=.4){
      const boundary=floor?Math.min(edge,...(floor.holes||[]).map(h=>edgeDistance(h,x,z))):0;
      join=Math.max(0,Math.min(1,1-boundary/cape.width));join=join*join*(3-2*join);
      for(const path of capePaths)road=Math.max(road,Math.max(0,Math.min(1,(path.width/2+.7-distToPolyline(x,z,path.points))/.8)));
    }
    bytes[k]=bed*255;bytes[k+1]=Math.max(0,Math.min(1,(6-edge)/5))*inland*255;bytes[k+2]=join*255;bytes[k+3]=road*255;
  }
  const mask=new THREE.DataTexture(bytes,size,size);mask.name='city-soil-and-edge-mask';
  mask.magFilter=mask.minFilter=THREE.LinearFilter;mask.needsUpdate=true;
  const tintTextures=[lightBytes,darkBytes].map(data=>{const t=new THREE.DataTexture(data,size,size);t.magFilter=t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;});
  let owners=0;
  const materials=new Map();
  const material=kind=>{
    if(materials.has(kind))return materials.get(kind);
    const m=new THREE.MeshLambertMaterial({color:0xffffff}),brush=groundBrushUniform(m);
    // Custom world-space paint must retain its shader when static scenery is batched.
    m.userData.walkSurface='city-'+kind;owners++;
    let released=false;
    m.addEventListener('dispose',()=>{if(released)return;released=true;if(--owners===0){mask.dispose();tintTextures.forEach(t=>t.dispose());}});
    m.onBeforeCompile=shader=>{
      shader.uniforms.uGroundBrush=brush;shader.uniforms.uCityMask={value:mask};
      shader.uniforms.uCapeLight={value:tintTextures[0]};shader.uniforms.uCapeDark={value:tintTextures[1]};shader.uniforms.uTime=timeUniform;
      Object.assign(shader.uniforms,groundFieldUniforms(world));
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vCityGround;')
        .replace('#include <common>','#include <common>\nvarying float vCityHeight;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvec3 cityWorld=(modelMatrix*vec4(position,1.0)).xyz;vCityGround=cityWorld.xz;vCityHeight=cityWorld.y;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec2 vCityGround;varying float vCityHeight;uniform sampler2D uCityMask,uCapeLight,uCapeDark;uniform float uTime;\n${GROUND_COLOR_GLSL}
        vec3 citySetts(vec2 w,vec2 size,vec3 tone){
          float row=floor(w.y/size.y);vec2 p=w/size+vec2(mod(row,2.)*.5,0.);
          vec2 cell=floor(p),q=fract(p);float d=min(min(q.x,1.-q.x)*size.x,min(q.y,1.-q.y)*size.y);
          float aa=max(fwidth(d),.002);float joint=1.-smoothstep(.008-aa,.014+aa,d);
          vec3 stone=tone*(.97+hash12(cell)*.06)+(vnoise(w*4.)-.5)*.009;
          return mix(stone,tone*.88,joint);
        }`)
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec2 w=vCityGround;vec4 mask=texture2D(uCityMask,(w-vec2(-24.,-76.))/vec2(194.,216.));
          vec3 grass=mix(${colour(art.ground.palette.grassOchre)},vec3(.19,.30,.075),.72)*(.88+groundBrush(w).r*.22);
          vec3 earth=vec3(0.);if(mask.x>.001${kind==='base'?'||mask.y>.001':''})earth=paintedEarth(w,0.0);
          vec3 pave=citySetts(w,vec2(.44,.30),vec3(.48,.435,.35));
          ${kind==='road'?'pave=citySetts(w,vec2(.65,.45),vec3(.54,.51,.425));':''}
          ${kind==='plaza'?'pave=citySetts(w,vec2(.54,.36),vec3(.57,.50,.385));float ring=abs(length(w-vec2(62.,22.))-7.3);pave=mix(pave,pave*.82,1.-smoothstep(.10,.18,ring));':''}
          ${kind==='lawn'?`vec3 brush=groundBrush(w);pave=${colour('#8ba250')}*(.86+brush.r*.25+(vnoise(w*.45)-.5)*.08);pave*=1.-brush.g*.08+brush.b*.07;`:''}
          ${kind==='base'?'if(mask.y>.001)pave=mix(pave,mix(earth,grass,smoothstep(.10,.88,mask.y)),mask.y);':''}
          ${['base','road','lawn','cliff'].includes(kind)?`if(${['lawn','cliff'].includes(kind)?'true':'mask.b>.001'}){vec2 uv=(w-vec2(-24.,-76.))/vec2(194.,216.);vec4 L=texture2D(uCapeLight,uv),D=texture2D(uCapeDark,uv);vec3 native=groundColor(w,${kind==='cliff'?'vCityHeight':'.70'},L.rgb,D.rgb,vec4(mask.a,0.,0.,D.a),vec2(0.),${kind==='cliff'?'0.':'1.'},-.4,L.a)*groundCloud(w,uTime);pave=${['lawn','cliff'].includes(kind)?'native':'mix(pave,native,mask.b)'};}`:''}
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
  // Close the diagnosed see-through gap beneath source cape edges. Existing
  // native terrain is retained; these are structural faces, not another slab.
  const skirt=[];
  for(const floor of floors)for(const loop of [floor.points,...floor.holes||[]])for(let i=0;i<loop.length;i++){
    const a=loop[i],b=loop[(i+1)%loop.length],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.5);
    for(let k=0;k<n;k++){
      const x0=a[0]+(b[0]-a[0])*k/n,z0=a[1]+(b[1]-a[1])*k/n,x1=a[0]+(b[0]-a[0])*(k+1)/n,z1=a[1]+(b[1]-a[1])*(k+1)/n;
      const x=(x0+x1)/2,z=(z0+z1)/2;
      if(x<cape.bounds[0]||x>cape.bounds[1]||z<cape.bounds[2]||z>cape.bounds[3]||hf.heightAt(x,z)>=floor.height-.05)continue;
      const y0=cityFloorHeight(world.data.city,hf,x0,z0,floor),y1=cityFloorHeight(world.data.city,hf,x1,z1,floor);
      const lo0=Math.min(hf.heightAt(x0,z0),world.waterLevel-.5),lo1=Math.min(hf.heightAt(x1,z1),world.waterLevel-.5);
      for(const p of [[x0,y0,z0],[x1,y1,z1],[x0,lo0,z0],[x1,y1,z1],[x1,lo1,z1],[x0,lo0,z0]])skirt.push(p[0]-root.position.x,p[1]-root.position.y,p[2]-root.position.z);
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(skirt,3));geo.computeVertexNormals();geo.computeBoundingSphere();
  const rock=material('cliff');rock.side=THREE.DoubleSide;
  const face=new THREE.Mesh(geo,rock);face.name='cape-source-edge-retaining-faces';face.receiveShadow=true;root.add(face);
  return {material,trees:trees.length};
}
