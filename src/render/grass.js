// The same surface attributes and colour function as ground.js, evaluated once per clump at
// load (bakeGrassColours, one small GPU pass read back into per-clump colours). Rendering a blade
// then only blends two stored colours: no per-pixel or per-vertex ground shader, no frame update.
import * as THREE from 'three';
import { regionShift } from './region-shift.js';
import { surfaceData, groundFieldUniforms } from './ground.js';
import { GROUND_COLOR_GLSL, GROUND_CLOUD_GLSL } from './ground-color.js';
import { patchMaterial, timeUniform } from './patch.js';
import art from '../../data/art.json';
import { groundBrushUniform } from './ground-brush.js';
import {prepareGrassCulling} from './grass-culling.js';

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
    coast:[read(s.coast,2,0),read(s.coast,2,1)],town:read(s.town),normal:normal.toArray(),height:read(h.data)};
}

export function attachGrassSurface(mesh,items,world) {
  const steps=attachGrassSurfaceSteps(mesh,items,world);
  for(;;)if(steps.next().done)return;
}

export function* attachGrassSurfaceSteps(mesh,items,world) {
  // Per-chunk attributes must belong to that chunk, not the shared blade geometry.
  mesh.geometry=mesh.geometry.clone();
  const fields={aGrassLight:3,aGrassDark:3,aGrassSplat:4,aGrassCoast:2,aGrassNormal:3,aGrassY:1,aGrassTown:1};
  const arrays=Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,new Float32Array(items.length*n)]));
  const positions=mesh.geometry.attributes.position,radii=new Float32Array(items.length);
  let radius=0;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    radius=Math.max(radius,Math.hypot(x,y,z)+Math.max(0,y)*.15*Math.hypot(1,.6));
  }
  mesh.userData.grassRadii=radii;
  for(let i=0;i<items.length;i++){
    const it=items[i];
    const scale=it.s??1;
    radii[i]=radius*Math.max(it.sx??scale,it.sy??scale,it.sz??scale)+.02;
    const p=sampleGround(world,it.x,it.z);
    for(const [k,v] of Object.entries({aGrassLight:p.light,aGrassDark:p.dark,aGrassSplat:p.splat,aGrassCoast:p.coast,aGrassNormal:p.normal,aGrassY:[p.height],aGrassTown:[p.town]})) arrays[k].set(v,i*fields[k]);
    if((i+1)%64===0)yield;
  }
  for(const [k,n] of Object.entries(fields))mesh.geometry.setAttribute(k,new THREE.InstancedBufferAttribute(arrays[k],n));
  mesh.name='ground-blended-grass';
}

export function grassMaterial(world) {
  const m=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
  m.userData.groundBrush=groundBrushUniform(m);
  const shift=regionShift();
  patchMaterial(m,{wind:.15});
  const previous=m.onBeforeCompile;
  m.onBeforeCompile=(s,r)=>{
    previous.call(m,s,r);
    s.uniforms.uTime=timeUniform;
    s.uniforms.uGrassWater={value:world.waterLevel};
    s.uniforms.uRegionShift=shift;s.uniforms.uNoiseOffset={value:new THREE.Vector2(...(world.data.atlas?.offset||[0,0]))};
    s.uniforms.uGrassTip={value:art.grass.tipLightening};
    s.uniforms.uGrassRootHeight={value:art.grass.rootBlendHeight};
    const vary=`varying vec3 vGrassBase,vGrassLawn,vGrassShade; varying float vGrassHeight;`;
    s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>
      ${vary} uniform float uGrassWater; uniform vec3 uRegionShift; uniform vec2 uNoiseOffset;
      attribute vec3 aGrassNormal,aGrassBase,aGrassLawn; attribute float aGrassY;
      ${GROUND_CLOUD_GLSL}`)
      .replace('#include <defaultnormal_vertex>',`#include <defaultnormal_vertex>
        transformedNormal=normalMatrix*normalize(aGrassNormal);`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 root=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vGrassHeight=position.y;
        // baked per clump (stored at half scale so values above 1 survive 8-bit storage)
        vGrassBase=aGrassBase*2.0;vGrassLawn=aGrassLawn*2.0;
        // underwater tint and drifting cloud shade apply alike to root and tip
        vGrassShade=mix(vec3(1.0),vec3(.70,.81,.80),1.0-smoothstep(uGrassWater-.4,uGrassWater+.05,aGrassY))*groundCloud(root.xz-uRegionShift.xz+uNoiseOffset,uTime);`);
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
      ${vary} uniform float uGrassTip,uGrassRootHeight;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        // the root is exactly the ground colour under the clump (grass on lawn, earth on a dirt edge);
        // above it the blade turns to the meadow's own green and lightens smoothly up to its tip
        float rise=smoothstep(.0,uGrassRootHeight,vGrassHeight);
        diffuseColor.rgb=mix(vGrassBase,vGrassLawn*(1.0+uGrassTip),rise)*vGrassShade;`);
    // Grass uses the terrain normal even on the reverse of a blade. Otherwise DoubleSide
    // negates the normal and makes half the clumps look almost black.
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);');
  };
  m.customProgramCacheKey=()=> 'grass-baked-colour-v9';
  return m;
}

// One-time colour bake: every clump becomes one point in an off-screen target, whose fragment
// runs the full painted-ground function at the clump root (and the meadow's own lawn tone).
// The two results are read back into 8-bit per-clump attributes; the bake inputs are then freed.
export function bakeGrassColours(renderer,root,world) {
  const steps=bakeGrassSteps(renderer,root,world);
  for(;;){const r=steps.next();if(r.done)return r.value;}
}

/** Preserve per-clump colours; async batches share a bounded colour atlas. */
export function* bakeGrassSteps(renderer,root,world,{asyncReadback=false}={}) {
  const meshes=[];root.traverse(o=>{if(o.name==='ground-blended-grass')meshes.push(o);});
  if(!meshes.length)return 0;
  root.updateMatrixWorld(true);
  const width=256,camera=new THREE.OrthographicCamera(0,1,1,0,-1,1),scene=new THREE.Scene(),m4=new THREE.Matrix4(),p=new THREE.Vector3();
  const material=new THREE.ShaderMaterial({
    uniforms:{uMode:{value:0},uWater:{value:world.waterLevel},uGroundBrush:meshes[0].material.userData.groundBrush,...groundFieldUniforms(world)},
    vertexShader:`attribute vec3 aRoot,aGrassLight,aGrassDark,aGrassNormal;attribute vec4 aGrassSplat;attribute vec2 aGrassCoast;attribute float aGrassY,aGrassTown;
      varying vec3 vRoot,vLight,vDark;varying vec4 vSplat;varying vec2 vCoast;varying float vUp,vTown;
      void main(){vRoot=vec3(aRoot.x,aGrassY,aRoot.z);vLight=aGrassLight;vDark=aGrassDark;vSplat=aGrassSplat;vCoast=aGrassCoast;vUp=aGrassNormal.y;vTown=aGrassTown;
        gl_PointSize=1.0;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
    fragmentShader:`#define GROUND_AA(x) (0.0)
      // Keep the full brush detail at each root. Implicit mip/anisotropic
      // sampling of isolated points produces invalid colours on WebKit.
      #define GROUND_BRUSH_SAMPLE(uv) textureLod(uGroundBrush,uv,0.0)
      uniform float uMode,uWater;varying vec3 vRoot,vLight,vDark;varying vec4 vSplat;varying vec2 vCoast;varying float vUp,vTown;
      ${GROUND_COLOR_GLSL}
      void main(){vec3 c=uMode<.5?groundColor(vRoot.xz,vRoot.y,vLight,vDark,vSplat,vCoast,vUp,uWater,vTown):lawnTone(vRoot.xz,vLight,vDark,vTown);
        gl_FragColor=vec4(clamp(c*.5,0.0,1.0),1.0);}`,
    depthTest:false,depthWrite:false,toneMapped:false});
  let compiled=false;
  try {
  if(asyncReadback&&renderer.initTexture){
    // First draw otherwise uploads the brush and every large ground field in
    // one step. Submit one texture at a time, with identical sampler settings.
    const textures=new Set(Object.values(material.uniforms).map(u=>u.value).filter(v=>v?.isTexture));
    for(const texture of textures){renderer.initTexture(texture);yield;}
  }
  // A fence per small scenery chunk costs hundreds of driver round trips. Pack
  // unchanged clump inputs into bounded atlases; only CPU preparation is sliced.
  // The synchronous compatibility path remains the original per-mesh reference.
  const batches=[],limit=width*Math.min(32,renderer.capabilities?.maxTextureSize??32);
  let batch=[],count=0;
  for(const mesh of meshes){
    if(batch.length&&(!asyncReadback||count+mesh.count>limit)){batches.push(batch);batch=[];count=0;}
    batch.push(mesh);count+=mesh.count;
  }
  if(batch.length)batches.push(batch);
  for(const batch of batches){
    const n=batch.reduce((sum,mesh)=>sum+mesh.count,0),height=Math.ceil(n/width);
    const positions=new Float32Array(n*3),roots=new Float32Array(n*3),fields={};
    const names=['aGrassLight','aGrassDark','aGrassNormal','aGrassSplat','aGrassCoast','aGrassY','aGrassTown'];
    for(const k of names)fields[k]=new Float32Array(n*batch[0].geometry.attributes[k].itemSize);
    let offset=0;
    for(const mesh of batch){
      for(let i=0;i<mesh.count;i++){
        const index=offset+i;
        const j=index*3;
        positions[j]=((index%width)+.5)/width;positions[j+1]=(Math.floor(index/width)+.5)/height;
        mesh.getMatrixAt(i,m4);p.setFromMatrixPosition(m4).applyMatrix4(mesh.matrixWorld);
        roots[j]=p.x;roots[j+1]=p.y;roots[j+2]=p.z;
        if(asyncReadback&&(i+1)%128===0)yield;
      }
      for(const k of names){const a=mesh.geometry.attributes[k];fields[k].set(a.array,offset*a.itemSize);}
      offset+=mesh.count;
      if(asyncReadback)yield;
    }
    const points=new THREE.BufferGeometry();
    points.setAttribute('position',new THREE.BufferAttribute(positions,3));points.setAttribute('aRoot',new THREE.BufferAttribute(roots,3));
    for(const k of names)points.setAttribute(k,new THREE.BufferAttribute(fields[k],batch[0].geometry.attributes[k].itemSize));
    const cloud=new THREE.Points(points,material);cloud.frustumCulled=false;scene.add(cloud);
    const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false}),pixels=new Uint8Array(width*height*4);
    try {
    if(asyncReadback&&!compiled&&renderer.compileAsync){
      // Compile the off-screen variant, which has a different output colour
      // space from the game's canvas. Restore the target before awaiting it.
      const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace?.(),mip=renderer.getActiveMipmapLevel?.();
      let pending;
      try{renderer.setRenderTarget(target);pending=renderer.compileAsync(scene,camera);}
      finally{renderer.setRenderTarget(previous,face,mip);}
      yield pending;compiled=true;
    }
    for(const [mode,name] of [[0,'aGrassBase'],[1,'aGrassLawn']]){
      material.uniforms.uMode.value=mode;
      const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace?.(),mip=renderer.getActiveMipmapLevel?.();
      const clear=renderer.getClearColor(new THREE.Color()).clone(),alpha=renderer.getClearAlpha();
      let pending;
      try{
        renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,camera);
        if(asyncReadback)pending=renderer.readRenderTargetPixelsAsync(target,0,0,width,height,pixels);
        else renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
      }finally{
        // The game may draw while the fence is pending. Restore borrowed renderer
        // state before yielding, rather than restoring stale state on completion.
        renderer.setRenderTarget(previous,face,mip);renderer.setClearColor(clear,alpha);
      }
      if(asyncReadback)yield pending;
      let offset=0;
      for(const mesh of batch){
        const out=new Uint8Array(mesh.count*3);
        for(let i=0;i<mesh.count;i++){
          const index=(offset+i)*4;
          out[i*3]=pixels[index];out[i*3+1]=pixels[index+1];out[i*3+2]=pixels[index+2];
          if(asyncReadback&&(i+1)%128===0)yield;
        }
        mesh.geometry.setAttribute(name,new THREE.InstancedBufferAttribute(out,3,true));
        offset+=mesh.count;
        if(asyncReadback)yield;
      }
    }
    }finally{
      scene.remove(cloud);points.dispose();target.dispose();
    }
    // only what the blade shader still reads stays on the GPU
    for(const mesh of batch){
      for(const k of ['aGrassLight','aGrassDark','aGrassSplat','aGrassCoast','aGrassTown'])mesh.geometry.deleteAttribute(k);
      prepareGrassCulling(mesh);yield;
    }
  }
  return meshes.length;
  }finally{material.dispose();}
}
