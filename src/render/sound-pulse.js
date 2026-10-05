import * as THREE from 'three';
const ring=new THREE.RingGeometry(.983,1,128);ring.rotateX(-Math.PI/2);ring.userData.shared=true;
// Thin, cool neutral pressure contours: no flame texture, tongues, sparks or additive bloom.
export function soundPulse(color){
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uColor:{value:new THREE.Color(color)},uAlpha:{value:1},uT:{value:0}},
 vertexShader:'varying vec3 vP;uniform float uT;void main(){vP=position;vec3 p=position;p.y+=.012*sin(atan(p.x,p.z)*7.+uT*10.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
 fragmentShader:`varying vec3 vP;uniform vec3 uColor;uniform float uAlpha,uT;void main(){float angle=atan(vP.x,vP.z);float arc=.4+.6*smoothstep(-.5,.5,sin(angle*3.+uT*2.));gl_FragColor=vec4(uColor,uAlpha*arc);
 #include <colorspace_fragment>
 }`});return new THREE.Mesh(ring,material);
}
