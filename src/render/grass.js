// The same surface attributes and colour function as ground.js, sampled once per instance.
// No render target, extra texture fetch, CPU frame update or material per grass clump.
import * as THREE from 'three';
import { surfaceData } from './ground.js';
import { GROUND_COLOR_GLSL } from './ground-color.js';
import { patchMaterial, timeUniform } from './patch.js';
import art from '../../data/art.json';
import { groundBrushUniform } from './ground-brush.js';

export function sampleGround(world,x,z) {
  const h=world.heightfield,s=surfaceData(world);
  const gx=Math.max(0,Math.min(h.w-1.00001,(x-h.ox)/h.res));
  const gz=Math.max(0,Math.min(h.h-1.00001,(z-h.oz)/h.res));
  const i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,a=j*h.w+i;
  // Match the terrain's diagonal, not bilinear interpolation across two triangles.
  const ids=u+v<=1?[a,a+1,a+h.w]:[a+1,a+h.w,a+h.w+1];
  const weights=u+v<=1?[1-u-v,u,v]:[1-v,1-u,u+v-1];
  const read=(array,stride=1,component=0)=>ids.reduce((sum,k,n)=>sum+array[k*stride+component]*weights[n],0);
  const H=(i,j)=>h.data[Math.max(0,Math.min(h.h-1,j))*h.w+Math.max(0,Math.min(h.w-1,i))];
  const normal=new THREE.Vector3();
  ids.forEach((k,n)=>{
    const xi=k%h.w,zi=Math.floor(k/h.w);
    const q=new THREE.Vector3((H(xi-1,zi)-H(xi+1,zi))/(2*h.res),1,(H(xi,zi-1)-H(xi,zi+1))/(2*h.res)).normalize();
    normal.addScaledVector(q,weights[n]);
  });
  return {light:[read(s.lr),read(s.lg),read(s.lb)],dark:[read(s.dr),read(s.dg),read(s.db)],
    splat:[read(s.road),read(s.stone),read(s.mud),read(s.dirt)],
    coast:[read(s.coast,2,0),read(s.coast,2,1)],normal:normal.toArray(),height:read(h.data)};
}

export function attachGrassSurface(mesh,items,world) {
  // Per-chunk attributes must belong to that chunk, not the shared blade geometry.
  mesh.geometry=mesh.geometry.clone();
  const fields={aGrassLight:3,aGrassDark:3,aGrassSplat:4,aGrassCoast:2,aGrassNormal:3,aGrassY:1};
  const arrays=Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,new Float32Array(items.length*n)]));
  items.forEach((it,i)=>{
    const p=sampleGround(world,it.x,it.z);
    for(const [k,v] of Object.entries({aGrassLight:p.light,aGrassDark:p.dark,aGrassSplat:p.splat,aGrassCoast:p.coast,aGrassNormal:p.normal,aGrassY:[p.height]})) arrays[k].set(v,i*fields[k]);
  });
  for(const [k,n] of Object.entries(fields))mesh.geometry.setAttribute(k,new THREE.InstancedBufferAttribute(arrays[k],n));
  mesh.name='ground-blended-grass';
}

export function grassMaterial(world) {
  const m=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
  const brush=groundBrushUniform(m);
  patchMaterial(m,{wind:.15});
  const previous=m.onBeforeCompile;
  m.onBeforeCompile=(s,r)=>{
    previous.call(m,s,r);
    s.uniforms.uTime=timeUniform;
    s.uniforms.uGrassWater={value:world.waterLevel};
    s.uniforms.uGroundBrush=brush;
    s.uniforms.uGrassTip={value:art.grass.tipLightening};
    s.uniforms.uGrassRootHeight={value:art.grass.rootBlendHeight};
    const vary=`varying vec3 vGrassRoot,vGrassLight,vGrassDark; varying vec4 vGrassSplat; varying vec2 vGrassCoast; varying float vGrassHeight,vGrassUp;`;
    s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>
      ${vary}
      attribute vec3 aGrassLight,aGrassDark,aGrassNormal; attribute vec4 aGrassSplat; attribute vec2 aGrassCoast; attribute float aGrassY;`)
      .replace('#include <defaultnormal_vertex>',`#include <defaultnormal_vertex>
        transformedNormal=normalMatrix*normalize(aGrassNormal);`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vGrassRoot=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vGrassRoot.y=aGrassY;vGrassHeight=position.y;
        vGrassLight=aGrassLight;vGrassDark=aGrassDark;vGrassSplat=aGrassSplat;vGrassCoast=aGrassCoast;vGrassUp=aGrassNormal.y;`);
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
      ${vary} uniform float uTime,uGrassWater,uGrassTip,uGrassRootHeight;
      ${GROUND_COLOR_GLSL}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec3 base=groundColor(vGrassRoot.xz,vGrassRoot.y,vGrassLight,vGrassDark,vGrassSplat,vGrassCoast,vGrassUp,uGrassWater);
        base=mix(base,base*vec3(.70,.81,.80),1.0-smoothstep(uGrassWater-.4,uGrassWater+.05,vGrassRoot.y));
        base*=groundCloud(vGrassRoot.xz,uTime);
        diffuseColor.rgb=base*(1.0+uGrassTip*smoothstep(.02,uGrassRootHeight,vGrassHeight));`);
    // Grass uses the terrain normal even on the reverse of a blade. Otherwise DoubleSide
    // negates the normal and makes half the clumps look almost black.
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);');
  };
  m.customProgramCacheKey=()=> 'grass-shared-ground-v3';
  return m;
}
