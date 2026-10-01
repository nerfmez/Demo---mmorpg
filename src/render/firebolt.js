// Original procedural flame contours. One billboard for the moving body, one bounded
// instanced pool for detached wisps, embers and smoke; no textures or paid assets.
import * as THREE from 'three';

const NOISE = /* glsl */ `
  float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise21(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
               mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),f.x),f.y);
  }
  float flow(vec2 p){ return noise21(p)*0.7+noise21(p*2.13+17.0)*0.3; }
`;
const PALETTE = /* glsl */ `
  uniform vec3 uRim, uBody, uHot, uCore;
  vec3 flameColor(float heat){
    vec3 c=mix(uRim,uBody,smoothstep(0.01,0.09,heat));
    c=mix(c,uHot,smoothstep(0.15,0.25,heat));
    return mix(c,uCore,smoothstep(0.37,0.53,heat));
  }
`;
const palette = (cfg) => ({
  uRim: { value: new THREE.Color(cfg.colors.rim) },
  uBody: { value: new THREE.Color(cfg.colors.body) },
  uHot: { value: new THREE.Color(cfg.colors.hot) },
  uCore: { value: new THREE.Color(cfg.colors.core) },
});
let quad;
function sharedQuad() {
  if (!quad) {
    quad = new THREE.PlaneGeometry(1, 1);
    quad.userData.shared = true;
  }
  return quad;
}

export function flameMesh(cfg, mode = 0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...palette(cfg), uTime:{value:0}, uSeed:{value:0}, uScale:{value:1},
      uAlpha:{value:1}, uMode:{value:mode}, uVelocity:{value:new THREE.Vector3(0,1,0)},
      uLength:{value:cfg.projectile.length}, uWidth:{value:cfg.projectile.width} },
    transparent:true, depthWrite:false, side:THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform vec3 uVelocity; uniform float uScale,uLength,uWidth,uMode;
      varying vec2 vUv;
      void main(){
        vUv=uv;
        vec2 d=(viewMatrix*vec4(uVelocity,0.0)).xy;
        d=length(d)<0.001?vec2(0,1):normalize(d);
        vec2 p=vec2((uv.x-0.76)*uLength,(uv.y-0.5)*uWidth);
        if(uMode>0.5) p=(uv-0.5)*uWidth;
        vec4 mv=modelViewMatrix*vec4(0,0,0,1);
        mv.xy+=(d*p.x+vec2(-d.y,d.x)*p.y)*uScale;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime,uSeed,uAlpha,uMode; varying vec2 vUv;
      ${NOISE} ${PALETTE}
      void main(){
        vec2 p=vUv;
        float t=uTime*6.0+uSeed;
        float n=flow(vec2(p.x*8.0+t,p.y*5.0-t*0.24));
        float d;
        if(uMode<0.5){
          // A rounded leading flame and a tapered, advecting wake. The field bends,
          // opens into tongues and sheds gaps; it is not a rigid ball with ribbons.
          float head=(1.0-length((p-vec2(0.76,0.5))/vec2(0.155,0.39)))*0.35;
          head+=(flow(p*9.0+vec2(t*0.6,-t))-0.5)*0.16;
          float x=clamp(p.x/0.76,0.0,1.0);
          float bend=(flow(vec2(p.x*5.0+t*0.6,3.0+uSeed))-0.5)*0.36*(1.0-x);
          float w=0.28*pow(x,0.75)*(1.0-smoothstep(0.72,0.92,p.x));
          float wake=w-abs(p.y-0.5-bend)+(n-0.58)*0.19*(1.0-x);
          float branchA=0.14*pow(x,0.8)-abs(p.y-0.64-bend*0.55)+(n-0.5)*0.11;
          float branchB=0.11*pow(clamp((p.x-0.22)/0.54,0.0,1.0),0.8)
            -abs(p.y-0.34-bend*0.8)+(n-0.5)*0.09;
          float branches=max(branchA,branchB)*(1.0-smoothstep(0.69,0.84,p.x));
          // Limit branches to their own tail intervals without an artificial end cap.
          branches=min(branches,min(p.x-0.04,0.81-p.x));
          d=max(head,max(wake,branches));
          float gap=flow(vec2(p.x*13.0+t*1.4,p.y*9.0));
          d-=smoothstep(0.66,0.86,gap)*0.11*(1.0-smoothstep(0.45,0.7,p.x));
        } else {
          vec2 q=(p-0.5)*2.0;
          vec2 radial=q/max(length(q),0.001);
          float lobes=flow(radial*2.8+vec2(uSeed,t*0.4));
          d=(0.70+(lobes-0.5)*0.42-length(q))*0.58;
        }
        float aa=max(fwidth(d),0.007);
        float alpha=smoothstep(-aa,aa,d)*uAlpha;
        if(alpha<0.01) discard;
        float heat=max(0.0,d)*1.4+(n-0.5)*0.19;
        gl_FragColor=vec4(flameColor(heat),alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(sharedQuad(),mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return mesh;
}

/** Fixed-capacity, swap-remove billboard particles. All hot-path data is numeric. */
export class FlameParticles {
  constructor(scene, cfg, capacity = 384) {
    this.cap=capacity; this.count=0; this.cfg=cfg;
    this.pos=new Float32Array(capacity*3);
    this.vel=new Float32Array(capacity*3);
    this.info=new Float32Array(capacity*4); // size, life fraction, kind, seed
    this.life=new Float32Array(capacity);
    this.total=new Float32Array(capacity);
    this.size=new Float32Array(capacity);
    const g=new THREE.InstancedBufferGeometry();
    const q=sharedQuad();
    g.index=q.index; g.attributes.position=q.attributes.position; g.attributes.uv=q.attributes.uv;
    g.setAttribute('aPos',new THREE.InstancedBufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo',new THREE.InstancedBufferAttribute(this.info,4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount=0;
    const mat=new THREE.ShaderMaterial({
      uniforms:{...palette(cfg),uTime:{value:0}},transparent:true,depthWrite:false,
      vertexShader: /* glsl */ `
        attribute vec3 aPos; attribute vec4 aInfo;
        varying vec2 vUv; varying vec4 vInfo;
        void main(){
          vUv=uv; vInfo=aInfo;
          vec2 p=(uv-0.5)*aInfo.x;
          // Wisps rise; little embers retain their slanted, needle-like silhouette.
          if(aInfo.z<0.5) p.x*=0.65;
          if(aInfo.z>0.5 && aInfo.z<1.5) { p.x*=0.22; p.y*=0.7; }
          float a=aInfo.w*6.28;
          if(aInfo.z>1.5) a=0.0;
          p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
          vec4 mv=viewMatrix*vec4(aPos,1);
          mv.xy+=p;
          gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying vec4 vInfo;
        ${NOISE} ${PALETTE}
        void main(){
          float age=vInfo.y, kind=vInfo.z, seed=vInfo.w;
          vec2 p=(vUv-0.5)*2.0;
          float n=flow(p*3.0+vec2(seed*23.0,-uTime*3.0));
          float d; vec3 col;
          if(kind>1.5){
            d=0.76+(n-0.5)*0.3-length(p);
            float light=clamp(0.5+p.y*0.35+(n-0.5)*0.4,0.0,1.0);
            col=mix(vec3(0.22,0.19,0.19),vec3(0.43,0.37,0.32),smoothstep(0.35,0.55,light));
          } else if(kind>0.5){
            d=0.75-abs(p.x)*0.65-abs(p.y);
            col=mix(uBody,uHot,1.0-age);
          } else {
            float head=(1.0-length((p-vec2(0,-0.28))/vec2(0.66,0.56)))*0.45;
            float width=0.48*pow(clamp((1.0-p.y)*0.5,0.0,1.0),1.1);
            float tongue=width-abs(p.x+(n-0.5)*0.40);
            d=min(max(head,tongue),0.9-abs(p.y))+(n-0.5)*0.10;
            col=flameColor(max(0.0,d)*0.8*(1.0-age));
          }
          float aa=max(fwidth(d),0.008);
          float fade=(1.0-smoothstep(kind>1.5?0.25:0.55,1.0,age));
          float alpha=smoothstep(-aa,aa,d)*fade*(kind>1.5?0.6*smoothstep(0.03,0.18,age):1.0);
          if(alpha<0.01) discard;
          gl_FragColor=vec4(col,alpha);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh=new THREE.Mesh(g,mat); this.mesh.frustumCulled=false; this.mesh.renderOrder=5;
    scene.add(this.mesh);
  }
  emit(x,y,z,vx,vy,vz,size,life,kind,seed) {
    if(this.count===this.cap) return;
    const i=this.count++, p=i*3, a=i*4;
    this.pos[p]=x;this.pos[p+1]=y;this.pos[p+2]=z;
    this.vel[p]=vx;this.vel[p+1]=vy;this.vel[p+2]=vz;
    this.info[a]=size;this.info[a+1]=0;this.info[a+2]=kind;this.info[a+3]=seed;
    this.size[i]=size;this.life[i]=this.total[i]=life;
  }
  update(dt) {
    this.mesh.material.uniforms.uTime.value+=dt;
    let n=this.count;
    for(let i=0;i<n;i++){
      this.life[i]-=dt;
      if(this.life[i]<=0){
        const j=--n;
        for(let k=0;k<3;k++){this.pos[i*3+k]=this.pos[j*3+k];this.vel[i*3+k]=this.vel[j*3+k];}
        for(let k=0;k<4;k++)this.info[i*4+k]=this.info[j*4+k];
        this.life[i]=this.life[j];this.total[i]=this.total[j];this.size[i]=this.size[j];
        i--;continue;
      }
      const p=i*3,a=i*4, age=1-this.life[i]/this.total[i];
      const smoke=this.info[a+2]>1.5, drag=Math.exp(-dt*(smoke?3:2));
      this.vel[p]*=drag;this.vel[p+2]*=drag;
      this.vel[p+1]=this.vel[p+1]*drag+dt*(smoke?0.6:0.8);
      this.pos[p]+=this.vel[p]*dt;this.pos[p+1]+=this.vel[p+1]*dt;this.pos[p+2]+=this.vel[p+2]*dt;
      this.info[a]=this.size[i]*(smoke?0.6+age*1.1:1.0-age*0.65);
      this.info[a+1]=age;
    }
    this.count=n;
    const g=this.mesh.geometry;g.instanceCount=n;
    g.attributes.aPos.needsUpdate=true;g.attributes.aInfo.needsUpdate=true;
  }
}
