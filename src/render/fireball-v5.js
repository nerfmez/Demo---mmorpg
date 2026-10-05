// Approved Blender V5: continuous capped shells with advected, unlit cutouts.
// Geometry/field constants transcribed from the verified producer handoff.
// Noise is normalized GLSL gradient fBM, an approximation of Blender 4D noise.
import * as THREE from 'three';
import { v5ContactMesh } from './fireball-v5-contact.js';
import { chargeGather } from './fireball-v5-gather.js';

const geometryCache = new Map();
function geometry(mode, layer) {
  const key = `${mode}:${layer}`;
  if (geometryCache.has(key)) return geometryCache.get(key);
  let g;
  if (mode === 1) g = new THREE.SphereGeometry([.32,.275,.238][layer], 32, 20);
  else {
    const axial=48, radial=24, p=[], gathered=[], indices=[];
    for(let j=0;j<=axial;j++) {
      const x0=.4-2.12*j/axial, rear=Math.max(0,-x0)/1.72;
      const radius=x0>=0 ? .255*Math.sqrt(Math.max(0,1-(x0/.4)**2)) : .255*Math.pow(Math.max(0,1-rear),.62);
      for(let k=0;k<=radial;k++) {
        const a=k*Math.PI*2/radial;
        const r=radius*(1-.12*layer)*(1+.11*rear*Math.sin(3*a+5*rear+layer));
        const sphereRadius=layer===0?.32:.275, phi=Math.PI*j/axial;
        gathered.push(sphereRadius*Math.cos(phi),sphereRadius*Math.sin(phi)*Math.cos(a),sphereRadius*Math.sin(phi)*Math.sin(a));
        p.push(x0<0?x0*1.17:x0,r*Math.cos(a)+.045*rear*Math.sin(4*rear+layer),r*Math.sin(a)+.025*rear*Math.sin(7*rear+layer));
      }
    }
    for(let j=0;j<axial;j++)for(let k=0;k<radial;k++) {
      const a=j*(radial+1)+k,b=a+radial+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
    g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.setAttribute('aGather',new THREE.Float32BufferAttribute(gathered,3));g.computeVertexNormals();
  }
  if(mode===1)g.setAttribute('aGather',g.attributes.position);
  g.userData.shared=true;geometryCache.set(key,g);return g;
}
const field = /* glsl */`
uniform vec3 uRim,uBody,uHot,uCore;
float hash3(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
vec3 gradient(vec3 p) {
 return normalize(vec3(hash3(p),hash3(p+vec3(19,7,31)),hash3(p+vec3(47,23,11)))*2.-1.);
}
float noise3(vec3 p) {
 vec3 i=floor(p),v=fract(p),f=v*v*v*(v*(v*6.-15.)+10.);
 float n=mix(mix(mix(dot(gradient(i),v),dot(gradient(i+vec3(1,0,0)),v-vec3(1,0,0)),f.x),
 mix(dot(gradient(i+vec3(0,1,0)),v-vec3(0,1,0)),dot(gradient(i+vec3(1,1,0)),v-vec3(1,1,0)),f.x),f.y),
 mix(mix(dot(gradient(i+vec3(0,0,1)),v-vec3(0,0,1)),dot(gradient(i+vec3(1,0,1)),v-vec3(1,0,1)),f.x),
 mix(dot(gradient(i+vec3(0,1,1)),v-vec3(0,1,1)),dot(gradient(i+vec3(1,1,1)),v-vec3(1,1,1)),f.x),f.y),f.z);
 return .5+.85*n;
}
float fbm(vec3 p,float w,float detail) {
 // Slow fourth-coordinate turbulence; transport comes from A, not this offset.
 p+=vec3(.31,.19,.27)*w;
 float n=noise3(p), amp=.58, weight=1.;
 n+=noise3(p*2.+17.)*amp*min(detail,1.);weight+=amp*min(detail,1.);
 float fracDetail=clamp(detail-1.,0.,1.);
 n+=noise3(p*4.+37.)*amp*amp*fracDetail;weight+=amp*amp*fracDetail;
 return n/weight;
}
vec3 rotateField(vec3 p,float a) {
 vec3 axis=normalize(vec3(.30,.90,.20));
 return p*cos(a)+cross(axis,p)*sin(a)+axis*dot(axis,p)*(1.-cos(a));
}
vec3 heatColor(float h,bool core) {
 vec3 c0=core?vec3(1,.10,.002):vec3(1,.075,.002);
 vec3 c1=core?vec3(1,.26,.01):vec3(1,.32,.008);
 vec3 c2=core?vec3(1,.52,.035):vec3(1,.66,.07);
 vec3 c3=core?vec3(1,.76,.13):vec3(1,.92,.42);
 // Relative palette edits retain the approved linear ramp at authored defaults.
 c0*=uRim/vec3(0.887923,.226966,.021219);
 c1*=uBody/vec3(1.,.456411,.046665);
 c2*=uHot/vec3(1.,.871367,.351533);
 c3*=uCore;
 vec3 c=mix(c0,c1,smoothstep(.43,.57,h));
 c=mix(c,c2,smoothstep(.57,.65,h));return mix(c,c3,smoothstep(.65,.75,h));
}
`;
const vertexShader=/* glsl */`
uniform vec3 uVelocity; uniform float uScale,uMode,uWidth,uLength,uTravelled;
attribute vec3 aGather;
varying vec3 vObject,vNormal,vEye;
void main(){
 vec3 p=position;
 vObject=vec3(p.x,.676*p.y-.737*p.z,.737*p.y+.676*p.z);
 vec2 d=uVelocity.xz; d=length(d)<.001?vec2(1,0):normalize(d);
 vec3 shape=p;
 if(uMode<.5){
   if(shape.x<0.)shape.x*=min(1.,(.32+uTravelled)/2.0124);
   shape=mix(aGather,shape,smoothstep(0.,.45,uTravelled));
   shape*=vec3(uLength/2.4124,uWidth/.51,uWidth/.51);
 }
 vec3 oriented=vec3(d.x*shape.x-d.y*shape.z,shape.y,d.y*shape.x+d.x*shape.z);
 float size=uMode>.5?uWidth/.64:1.;
 vec3 n=vec3(d.x*normal.x-d.y*normal.z,normal.y,d.y*normal.x+d.x*normal.z);
 vec4 mv=modelViewMatrix*vec4(oriented*uScale*size,1.);
 vNormal=normalize(normalMatrix*n);vEye=normalize(-mv.xyz);
 gl_Position=projectionMatrix*mv;
}`;
const fragmentShader=/* glsl */`
uniform float uTime,uLayer,uMode,uFilled,uAlpha,uSeed,uChargeBuild;
uniform vec3 uTail;
varying vec3 vObject,vNormal,vEye;
${field}
void main(){
 float l=uLayer,t=uMode>.5?uTime:.625+(uTime-.625)*uTail.z/18.; bool charge=uMode>.5; bool filled=uFilled>.5;
 vec3 scale=charge?vec3(5.2):vec3(1.25+.35*l,7.3-.7*l,7.3-.7*l);
 float q=clamp((t-.625)*6.,0.,1.);
 float angle=charge?5.8*t+.7*l:mix(14./24.*5.8+.7*l,.25*l,q);
 vec3 offset=charge?vec3(.20*t,0,.75*t+.23*l):vec3(7.44*(t-.625)+(1.-q)*.125,.7*l,(1.-q)*.468);
 vec3 a=rotateField(vObject*scale,angle)+offset;
 float w=6.73*l+.34*t;
 vec3 warp=vec3(fbm(a*.95,w,2.),fbm(a*.95+vec3(19,7,31),w,2.),fbm(a*.95+vec3(47,23,11),w,2.));
 float n=fbm(a+.75*(warp-.5),3.37*l+.46*t,charge?1.7:.65);
 float threshold=charge?.555+.022*l:mix(.67+.01*l,.41+.045*l,clamp((vObject.x+1.989)/2.389,0.,1.));
 float coverage=filled?1.:clamp((n-threshold+.012)/.034,0.,1.);
 float heat=charge?n:mix(.44+.065*l,.62+.12*l,clamp((vObject.x+2.0124)/2.4124,0.,1.));
 if(filled)heat+=.19*abs(dot(normalize(vNormal),normalize(vEye)));
 float strength=filled?1.40:charge?2.1+.5*l:mix(1.35,1.75,l);
 float alpha=coverage*uAlpha;
 if(charge)alpha*=filled?smoothstep(.10,.75,uChargeBuild):smoothstep(0.,.55,uChargeBuild);
 if(alpha<.01)discard;
 gl_FragColor=vec4(heatColor(heat,filled)*strength,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export function v5FlameMesh(cfg,mode=0) {
  if(mode===2)return v5ContactMesh(cfg);
  const uniforms={uRim:{value:new THREE.Color(cfg.colors.rim)},uBody:{value:new THREE.Color(cfg.colors.body)},uHot:{value:new THREE.Color(cfg.colors.hot)},uCore:{value:new THREE.Color(cfg.colors.core)},uTail:{value:new THREE.Vector3(cfg.projectile.tailHalfWidth,cfg.projectile.tailSway,cfg.projectile.flowSpeed)},uChargeBuild:{value:1},uTravelled:{value:0},uTime:{value:0},uScale:{value:1},uMode:{value:mode},uAlpha:{value:1},uSeed:{value:0},uProgress:{value:0},
    uVelocity:{value:new THREE.Vector3(1,0,0)},uLength:{value:cfg.projectile.length},uWidth:{value:cfg.projectile.width},uGlowRadius:{value:0}};
  const make=layer=>{
    const m=new THREE.ShaderMaterial({uniforms:{...uniforms,uLayer:{value:Math.min(layer,1)},uFilled:{value:layer===2?1:0}},vertexShader,fragmentShader,
      transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,forceSinglePass:true});
    if(mode===0 && layer===2){
      m.uniforms.uMode={value:1};m.uniforms.uWidth={value:cfg.cast.size};m.uniforms.uAlpha={value:1};
    }
    const mesh=new THREE.Mesh(geometry(layer===2?1:mode,layer),m);mesh.frustumCulled=false;mesh.renderOrder=layer===2?5:7-layer;return mesh;
  };
  const mesh=make(0);mesh.add(make(1));
  const core=make(2);mesh.add(core);if(mode===0)mesh.userData.launchCore=core;
  if(mode===1){mesh.userData.gather=chargeGather(cfg.cast,uniforms);mesh.add(mesh.userData.gather);}
  mesh.userData.v5=true;return mesh;
}
