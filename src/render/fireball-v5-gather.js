// Small converging charge wisps, attached to the same staff-head transform.
// One draw, shared quad geometry; positions/fades are evaluated by the GPU.
import * as THREE from 'three';
const cache = new Map();
export function chargeGather(cfg, uniforms) {
  const count = cfg.gatherCount;
  let geometry = cache.get(count);
  if (!geometry) {
    const positions = [], seeds = [], indices = [];
    for (let i = 0; i < count; i++) {
      const base = i * 4;
      positions.push(-1,0,0, 1,0,0, -1,1,0, 1,1,0);
      seeds.push(i,i,i,i);indices.push(base,base+1,base+2,base+2,base+1,base+3);
    }
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));
    geometry.setIndex(indices);geometry.userData.shared = true;cache.set(count,geometry);
  }
  const material = new THREE.ShaderMaterial({
    uniforms: {uProgress:uniforms.uProgress,uVelocity:uniforms.uVelocity,
      uGather:{value:new THREE.Vector4(cfg.gatherRadius,cfg.wispLength,cfg.wispWidth,count)}},
    transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,forceSinglePass:true,
    vertexShader:/* glsl */`
      attribute float aSeed;
      uniform float uProgress;uniform vec3 uVelocity;uniform vec4 uGather;
      varying vec2 vUv;varying float vFade;
      void main(){
        float delay=.025*aSeed,k=uProgress;
        float q=smoothstep(delay,.78+.02*aSeed,k);
        float angle=6.2831853*aSeed/uGather.w+.37;
        vec3 start=vec3(.16+.025*sin(aSeed),cos(angle)*uGather.x,sin(angle)*uGather.x);
        vec2 d=length(uVelocity.xz)>.001?normalize(uVelocity.xz):vec2(1,0);
        start=vec3(d.x*start.x-d.y*start.z,start.y,d.y*start.x+d.x*start.z);
        vec3 p=start*(1.-q);
        vec4 center=modelViewMatrix*vec4(p,1.);
        vec2 outward=(modelViewMatrix*vec4(start,0.)).xy;
        outward=length(outward)>.001?normalize(outward):vec2(0,1);
        vec2 across=vec2(-outward.y,outward.x);
        float size=mix(1.,.45,q);
        center.xy+=(outward*(position.y-.35)*uGather.y+across*position.x*uGather.z)*size;
        gl_Position=projectionMatrix*center;
        vUv=position.xy;
        vFade=smoothstep(delay,delay+.10,k)*(1.-smoothstep(.48+.02*aSeed,.80+.02*aSeed,k));
      }`,
    fragmentShader:/* glsl */`
      varying vec2 vUv;varying float vFade;
      void main(){
        float width=pow(max(0.,sin(vUv.y*3.14159265)),.7);
        float edge=abs(vUv.x+.18*sin(vUv.y*5.));
        float alpha=(1.-smoothstep(width*.65,width,edge))*vFade;
        if(alpha<.01)discard;
        vec3 color=mix(vec3(1.,.16,.005),vec3(1.,.78,.17),max(0.,1.-edge)*(.8-.4*vUv.y));
        gl_FragColor=vec4(color*1.7,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.renderOrder=8;return mesh;
}
