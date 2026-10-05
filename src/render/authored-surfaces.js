// Source-approved RGBA art on small realtime surfaces. No movie/scene playback.
import * as THREE from 'three';
import pressureURL from '../../assets/vfx/approved-textures/warcry-pressure.png';
import movementURL from '../../assets/vfx/approved-textures/movement-atlas.png';
const loader=new THREE.TextureLoader(),pressure=loader.load(pressureURL),movement=loader.load(movementURL);
for(const t of [pressure,movement]){t.colorSpace=THREE.SRGBColorSpace;t.userData.shared=true;}
const quad=new THREE.PlaneGeometry(1,1,16,16);quad.userData.shared=true;
const NOISE=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}`;
export function artSurface(kind,crop=[0,0,1,1],energy=1.15){
 const ground=kind==='pressure';
 const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
 uniforms:{uMap:{value:ground?pressure:movement},uCrop:{value:new THREE.Vector4(...crop)},uTime:{value:0},uAlpha:{value:1},uDissolve:{value:0},uEnergy:{value:energy}},
 vertexShader:`varying vec2 vUv;uniform float uTime;void main(){vUv=uv;vec3 p=position;${ground?'float r=length(p.xy*2.);p.z=.035+.10*sin(min(r,1.)*3.14159)+.08*min(r,1.)*(sin(r*9.)*sin(uTime*13.5)+cos(r*9.)*cos(uTime*13.5));':''}gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`varying vec2 vUv;uniform sampler2D uMap;uniform vec4 uCrop;uniform float uTime,uAlpha,uDissolve,uEnergy;${NOISE}
 void main(){vec2 uv=vUv;vec2 flow=${ground?'(uv-.5)*(1.25-uTime*.2)':'uv-vec2(0,uTime*.3158)'};uv+=(vec2(noise(flow*4.5),noise(flow*4.5+13.))-.5)*.025;
 vec4 col=texture2D(uMap,uCrop.xy+uv*uCrop.zw);float dissolve=clamp((noise(vUv*7.+uTime*.75)-uDissolve)/.22,0.,1.);
 float edge=${ground?'1.':'(1.-smoothstep(.12,.48,abs(vUv.x-.5)))*(1.-smoothstep(.12,.48,abs(vUv.y-.5)))'};
 col.a*=uAlpha*dissolve*edge;if(col.a<.003)discard;gl_FragColor=vec4(col.rgb*uEnergy,col.a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const mesh=new THREE.Mesh(quad,m);mesh.frustumCulled=false;if(ground)mesh.rotation.x=-Math.PI/2;return mesh;
}
// Same four mint/turquoise ramp stops and soft edge as the brighter accepted field.
export function healingMaterial(){return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
 uniforms:{uT:{value:0},uA:{value:1}},vertexShader:'attribute vec2 aDisc;varying vec2 vP;void main(){vP=aDisc;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec2 vP;uniform float uT,uA;${NOISE}void main(){float r=length(vP);if(r>1.)discard;
 float n=noise(vP*3.08+vec2(.4*sin(uT*6.283185)));vec3 c=mix(vec3(.008,.08,.065),vec3(.015,.24,.16),smoothstep(.25,.5,n));c=mix(c,vec3(.045,.52,.33),smoothstep(.5,.65,n));c=mix(c,vec3(.24,.88,.54),smoothstep(.65,.76,n));
 float a=.38*(1.-smoothstep(.67,1.,r))*uA;gl_FragColor=vec4(c,a);
 #include <colorspace_fragment>
 }`});}
export function plusGeometry(size=.11,width=.023){
 const g=new THREE.BufferGeometry();const p=[];
 for(const [x,y] of [[size,width],[width,size]])p.push(-x,-y,0,x,-y,0,x,y,0,-x,-y,0,x,y,0,-x,y,0);
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return g;
}
export function keys(t,points){if(t<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++)if(t<=points[i][0]){const a=points[i-1],b=points[i];return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}return points.at(-1)[1];}

// Fixed game-camera billboarding. Caller supplies flight direction for a wake.
export function faceGameCamera(mesh){mesh.rotation.x=-Math.atan2(19,13.5);}
