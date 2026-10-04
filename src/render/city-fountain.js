// Connected cosmetic water: fixed meshes, shared clock, no fluid simulation.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {timeUniform} from './patch.js';
import { regionShift } from './region-shift.js';

const WATER_HEIGHT_GLSL=`
float waterHeight(vec2 p,float tier){
 float r=length(p),a=r>.0001?atan(p.y,p.x):0.;
 return sin(r*10.-uTime*3.4+sin(a*3.+uTime*.4)*.45)*.026
   +sin(p.x*7.+p.y*5.-uTime*2.3)*.016
   +sin(r*18.-uTime*5.1+tier)*.008;
}`;
export function cityFountain(root,world){
 const {x,z}=world.data.city.fountain,ox=root.position.x,oy=root.position.y,oz=root.position.z;
 const centre=`(vec2(${x},${z})+uRegionShift.xz)`,shift=regionShift();
 // Drawn as a neighbouring map, the fountain's world centre moves by the region shift.
 const shifted=sh=>{sh.uniforms.uRegionShift=shift;sh.vertexShader='uniform vec3 uRegionShift;\n'+sh.vertexShader;sh.fragmentShader='uniform vec3 uRegionShift;\n'+sh.fragmentShader;};
 const pool=new THREE.MeshPhongMaterial({color:'#368e99',specular:'#c5eee6',shininess:65,transparent:true,opacity:.90,depthWrite:false});
 pool.userData.walkSurface='animated-fountain-water-mass';
 pool.userData.preparePool=mesh=>{
  // Replace only the old solid water cylinder. Stone/footprint/collider stay intact.
  const old=mesh.geometry;old.computeBoundingBox();const b=old.boundingBox,r=Math.max(b.max.x-b.min.x,b.max.z-b.min.z)/2;
  const yTop=b.max.y+(r<2&&r>1?.11:0),seg=48,rings=7,pos=[],uv=[],indices=[];
  for(let j=0;j<=rings;j++)for(let i=0;i<=seg;i++){
   const a=i/seg*Math.PI*2,rr=j/rings*r;pos.push(Math.cos(a)*rr,yTop,Math.sin(a)*rr);uv.push(.5+Math.cos(a)*rr/r*.5,.5+Math.sin(a)*rr/r*.5);
  }
  for(let j=0;j<rings;j++)for(let i=0;i<seg;i++){const a=j*(seg+1)+i,b=a+seg+1;indices.push(a,a+1,b,a+1,b+1,b);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();g.boundingSphere.radius+=.07;
  mesh.geometry=g;old.dispose();
 };
 pool.onBeforeCompile=s=>{
  s.uniforms.uTime=timeUniform;shifted(s);
  s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>\nuniform float uTime;varying vec3 vFountain;${WATER_HEIGHT_GLSL}`)
   .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
    vec3 fw=(modelMatrix*vec4(position,1.)).xyz;vec2 fp=fw.xz-${centre};float tier=fw.y;
    float dx=(waterHeight(fp+vec2(.025,0.),tier)-waterHeight(fp-vec2(.025,0.),tier))/.05;
    float dz=(waterHeight(fp+vec2(0.,.025),tier)-waterHeight(fp-vec2(0.,.025),tier))/.05;
    objectNormal=normalize(vec3(-dx,1.,-dz));`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vec3 wp=(modelMatrix*vec4(position,1.)).xyz;transformed.y+=waterHeight(wp.xz-${centre},wp.y);vFountain=(modelMatrix*vec4(transformed,1.)).xyz;`);
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFountain;uniform float uTime;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    vec2 p=vFountain.xz-${centre};float r=length(p),a=r>.0001?atan(p.y,p.x):0.;
    float advect=.5+.5*sin(r*11.-uTime*3.4+sin(a*3.+uTime*.4)*.8);
    float crossflow=.5+.5*sin(p.x*6.+p.y*4.-uTime*2.3);
    diffuseColor.rgb*=.78+advect*.30+crossflow*.10;
    float crest=smoothstep(.77,.97,advect)*( .35+.65*crossflow);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.43,.71,.69),crest*.22);
    float impactRadius=vFountain.y>3.7?0.:vFountain.y>2.5?1.17:3.9;
    float age=fract(uTime*.53+a*.11),ring=abs(r-impactRadius-age*.7);
    float ripple=(1.-smoothstep(.022,.065,ring))*(1.-age)*.22;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.78,.74),ripple);
   `);
 };
 pool.customProgramCacheKey=()=> 'city-connected-pool-v2';
 const vector=(r,a,y)=>new THREE.Vector3(x+Math.cos(a)*r-ox,y-oy,z+Math.sin(a)*r-oz),parts=[],hits=[];
 const decorate=(g,phase,mode)=>{const n=g.attributes.position.count,p=new Float32Array(n),m=new Float32Array(n);p.fill(phase);m.fill(mode);g.setAttribute('flowPhase',new THREE.BufferAttribute(p,1));g.setAttribute('flowMode',new THREE.BufferAttribute(m,1));return g;};
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,curve=new THREE.QuadraticBezierCurve3(vector(1.86,a,1.63),vector(2.87,a,3.68),vector(3.9,a,1.60));parts.push(decorate(new THREE.TubeGeometry(curve,16,.047,5,false),i*.31,0));hits.push(vector(3.9,a,1.62));
 }
 // A living crown column feeds the top dish, rather than a solid finial ball.
 parts.push(decorate(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(vector(0,0,4.27),vector(.14,0,5.04),vector(.53,0,4.27)),18,.10,6,false),.3,3));hits.push(vector(.53,0,4.30));
 const curtain=(start,width,r0,rLip,r1,y0,y1,phase,mode)=>{
  const across=7,down=10,pos=[],uv=[],idx=[];
  for(let j=0;j<=down;j++)for(let i=0;i<=across;i++){
   const t=j/down,a=start+(i/across-.5)*width,drop=Math.max(0,(t-.25)/.75);
   const r=t<.25?r0+(rLip-r0)*t/.25:rLip+(r1-rLip)*drop;
   const y=t<.25?y0+Math.sin(t/.25*Math.PI)*.02:y0-(y0-y1)*Math.pow(drop,1.3);
   const p=vector(r,a,y);pos.push(p.x,p.y,p.z);uv.push(t,i/across);
  }
  for(let j=0;j<down;j++)for(let i=0;i<across;i++){const a=j*(across+1)+i,b=a+across+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();parts.push(decorate(g,phase,mode));hits.push(vector(r1,start,y1+.025));
 };
 // Broad connected lip sheets connect each moving pool to the next tier.
 for(let i=0;i<6;i++)curtain(i*Math.PI/3,.52,1.64,1.97,2.18,3.185,1.60,i*.31,1);
 for(let i=0;i<4;i++)curtain(i*Math.PI/2+.3,.72,.69,.96,1.17,4.27,3.18,i*.43,2);
 const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());geo.computeBoundingSphere();geo.boundingSphere.radius+=.12;
 const flow=new THREE.MeshBasicMaterial({color:'#78bfc8',transparent:true,opacity:.82,depthWrite:false,side:THREE.DoubleSide});
 flow.onBeforeCompile=s=>{
  s.uniforms.uTime=timeUniform;shifted(s);
  s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>\nuniform float uTime;attribute float flowPhase,flowMode;varying vec2 vFlow;varying float vFlowPhase,vFlowMode;${WATER_HEIGHT_GLSL}`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vFlow=uv;vFlowPhase=flowPhase;vFlowMode=flowMode;
    vec3 wp=(modelMatrix*vec4(position,1.)).xyz;vec2 p=wp.xz-${centre};
    if(flowMode>0.5&&flowMode<2.5){
      transformed.y+=waterHeight(p,flowMode)*pow(1.-uv.x,2.);
      transformed.xz+=normalize(p+vec2(.001))*sin(uTime*4.1+uv.x*14.+flowPhase)*.035*uv.x;
    }else if(flowMode>2.5){transformed.xz+=vec2(sin(uTime*3.+position.y*7.),cos(uTime*2.7+position.y*8.))*.035;}
   `);
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float uTime;varying vec2 vFlow;varying float vFlowPhase,vFlowMode;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    float run=.5+.5*sin(vFlow.x*31.-uTime*8.+vFlowPhase+sin(vFlow.y*11.+uTime)*.8);
    float sheet=.5+.5*sin(vFlow.y*19.+sin(vFlow.x*8.-uTime*3.)*.8);
    diffuseColor.rgb*=.80+run*.24;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.72,.89,.85),smoothstep(.72,.97,run)*(.25+.35*sheet));
    diffuseColor.a*=vFlowMode>.5?.65+sheet*.28:.74+run*.26;
   `);
 };
 flow.customProgramCacheKey=()=> 'city-connected-overflow-v2';
 const jets=new THREE.Mesh(geo,flow);jets.name='fountain-connected-crown-lips-curtains-jets';root.add(jets);
 const points=[],phases=[];
 for(const[i,hit]of hits.entries())for(let j=0;j<3;j++){points.push(hit.x,hit.y,hit.z);phases.push((i*.13+j*.31)%1,i*2.39+j*2.1);}
 const splashGeo=new THREE.BufferGeometry();splashGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));splashGeo.setAttribute('splashPhase',new THREE.Float32BufferAttribute(phases,2));splashGeo.computeBoundingSphere();splashGeo.boundingSphere.radius+=.5;
 const splashMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:timeUniform},vertexShader:`attribute vec2 splashPhase;uniform float uTime;varying float vFade;void main(){float t=fract(uTime*1.4+splashPhase.x);vec3 p=position;p.xz+=vec2(cos(splashPhase.y),sin(splashPhase.y))*t*.30;p.y+=sin(t*3.14159)*.28;vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;gl_PointSize=3.;vFade=(1.-t)*(1.-smoothstep(45.,100.,length(view.xyz)));}`,fragmentShader:`varying float vFade;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.76,.92,.87,(1.-smoothstep(.24,.5,d))*vFade*.65);}`});
 const spray=new THREE.Points(splashGeo,splashMat);spray.name='fountain-impact-splash';root.add(spray);
 // One instanced draw of soft expanding foam patches at every tier impact.
 const foamGeo=new THREE.RingGeometry(.035,.23,16);foamGeo.rotateX(-Math.PI/2);foamGeo.setAttribute('impactPhase',new THREE.InstancedBufferAttribute(new Float32Array(hits.map((_,i)=>i*.137)),1));
 const foamMat=new THREE.MeshBasicMaterial({color:'#d1eee5',transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide});foamMat.userData.walkSurface='fountain-impact-foam';
 foamMat.onBeforeCompile=s=>{s.uniforms.uTime=timeUniform;shifted(s);s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>\nuniform float uTime;attribute float impactPhase;varying float vFoamFade;${WATER_HEIGHT_GLSL}`).replace('#include <begin_vertex>',`#include <begin_vertex>\nfloat age=fract(uTime*.63+impactPhase);transformed.xz*=.45+age*1.8;vec3 wp=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;transformed.y+=waterHeight(wp.xz-${centre},wp.y);vFoamFade=(1.-age)*.8;`);s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vFoamFade;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vFoamFade;');};foamMat.customProgramCacheKey=()=> 'city-tier-impact-foam-v1';
 const foam=new THREE.InstancedMesh(foamGeo,foamMat,hits.length),matrix=new THREE.Matrix4();hits.forEach((p,i)=>foam.setMatrixAt(i,matrix.makeTranslation(p.x,p.y,p.z)));foam.name='fountain-tier-impact-foam';foam.instanceMatrix.needsUpdate=true;root.add(foam);
 return pool;
}
