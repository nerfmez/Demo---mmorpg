import * as THREE from 'three';
const ring=new THREE.RingGeometry(.90,1.05,128);ring.rotateX(-Math.PI/2);ring.userData.shared=true;
// Compact orange acoustic contours with a soft local halo, never flame tongues.
export function soundPulse(cfg){
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uColor:{value:new THREE.Color(cfg.color)},uCore:{value:new THREE.Color(cfg.core)},uAlpha:{value:1},uT:{value:0}},
 vertexShader:'varying vec3 vP;uniform float uT;void main(){vP=position;vec3 p=position;p.y+=.012*sin(atan(p.x,p.z)*7.+uT*10.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
 fragmentShader:`varying vec3 vP;uniform vec3 uColor,uCore;uniform float uAlpha,uT;void main(){float angle=atan(vP.x,vP.z);float arc=.4+.6*smoothstep(-.5,.5,sin(angle*3.+uT*2.));float r=length(vP.xz);float core=exp(-pow((r-.983)/.009,2.));float glow=exp(-pow((r-.983)/.038,2.));gl_FragColor=vec4(mix(uColor,uCore,core*.6),uAlpha*arc*(core*.85+glow*.28));
 #include <colorspace_fragment>
 }`});return new THREE.Mesh(ring,material);
}
