// Original procedural toon flames. Shared GPU geometry; no image assets or per-frame allocation.
import * as THREE from 'three';
import FX from '../../data/combat-fx.json';

let plane, sphere;
function geometry() {
  if (!plane) {
    plane = new THREE.PlaneGeometry(1, 1);
    sphere = new THREE.SphereGeometry(1, 20, 12);
    plane.userData.shared = sphere.userData.shared = true;
  }
}
const vert = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
// Tapered fingers flow backwards. Normal blending keeps the orange silhouette visible in daylight.
function flameMaterial(seed) {
  const c=FX.fireball;
  return new THREE.ShaderMaterial({
    uniforms:{uT:{value:seed},uA:{value:1},uOuter:{value:new THREE.Color(c.outer)},uMiddle:{value:new THREE.Color(c.middle)},uCore:{value:new THREE.Color(c.core)}},
    side:THREE.DoubleSide, transparent:true, depthWrite:false, toneMapped:false,
    vertexShader:vert,
    fragmentShader:`varying vec2 vUv; uniform float uT,uA; uniform vec3 uOuter,uMiddle,uCore;
      void main(){
        float x=vUv.x;
        float wave=sin(x*19.0+uT*21.0)*0.045+sin(x*37.0-uT*13.0)*0.018;
        float cy=0.5+wave*(1.0-x);
        float width=0.38*pow(max(0.0,sin(x*3.14159)),0.8);
        width*=0.73+0.27*sin(x*29.0-uT*25.0);
        float d=abs(vUv.y-cy)/max(0.003,width);
        float fingers=sin(x*42.0+uT*23.0+vUv.y*14.0)*0.15*(1.0-x);
        d+=fingers;
        if(d>1.0)discard;
        vec3 col=d<0.38?uCore:(d<0.72?uMiddle:uOuter);
        float a=(1.0-smoothstep(0.90,1.0,d))*uA;
        gl_FragColor=vec4(col,a);
        #include <colorspace_fragment>
      }`,
  });
}

export function makeFireball() {
  geometry();
  const c=FX.fireball;
  const g=new THREE.Group();
  const head=new THREE.Mesh(sphere,new THREE.ShaderMaterial({
    uniforms:{uT:{value:0},uOuter:{value:new THREE.Color(c.outer)},uMiddle:{value:new THREE.Color(c.middle)},uCore:{value:new THREE.Color(c.core)}},toneMapped:false,
    vertexShader:`varying vec3 vN; varying vec3 vP; uniform float uT;
      void main(){ vN=normalize(normalMatrix*normal); vP=position;
        float flicker=sin(position.y*16.0+position.z*11.0-uT*17.0)*0.045+sin(position.x*21.0+uT*13.0)*0.025;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position*(1.0+flicker),1.0);
      }`,
    fragmentShader:`varying vec3 vN,vP; uniform float uT; uniform vec3 uOuter,uMiddle,uCore;
      void main(){ float f=sin(vP.y*11.0+vP.z*7.0-uT*20.0)*0.09+sin(vP.x*13.0+uT*9.0)*0.05;
        float a=atan(vP.y,vP.x);
        float tongues=sin(a*5.0+vP.z*9.0-uT*10.0)*0.14+sin(a*9.0+uT*7.0)*0.07;
        float band=abs(vN.z)+f+tongues*(1.0-abs(vN.z));
        vec3 col=band<0.30?uOuter:(band<0.65?uMiddle:uCore);
        gl_FragColor=vec4(col,1.0); #include <colorspace_fragment>
      }`.replace('#include','\n#include'),
  }));
  head.scale.setScalar(c.radius);
  g.add(head);
  // Three intersecting strips form a volume from every camera angle. Local +Z is forward.
  for(let i=0;i<3;i++) {
    const tail=new THREE.Mesh(plane,flameMaterial(i*0.73));
    tail.rotation.set(0,-Math.PI/2,i*Math.PI/3);
    tail.position.z=-c.tailLength*0.44;
    tail.scale.set(c.tailLength,c.radius*2.6,1);
    // Rotate about forward axis, rather than the strip's own normal.
    const pivot=new THREE.Group(); pivot.rotation.z=i*Math.PI/3;
    tail.rotation.z=0; pivot.add(tail); g.add(pivot);
  }
  g.userData.fireball=true;
  return g;
}

export function animateFireball(g,time,scale=1) {
  const c=FX.fireball;
  g.scale.setScalar(scale);
  const head=g.children[0];
  head.scale.set(c.radius*(1+0.035*Math.sin(time*31)),c.radius*(1+0.05*Math.sin(time*27)),c.radius*1.12);
  head.material.uniforms.uT.value=time;
  for(let i=1;i<g.children.length;i++) g.children[i].children[0].material.uniforms.uT.value=time+i*0.73;
}

export function fireballImpact(v,e) {
  geometry();
  const c=FX.fireball, y=v.gy(e.x,e.z)+(e.y??1);
  const g=new THREE.Group();g.position.set(e.x,y,e.z);
  const flash=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:c.core,toneMapped:false,transparent:true,depthWrite:false}));g.add(flash);
  // Rounded, overlapping flame lobes carry the burst; short tapered tongues support it.
  const cloudMaterial=new THREE.ShaderMaterial({
    uniforms:{uT:{value:0},uA:{value:1},uOuter:{value:new THREE.Color(c.outer)},uMiddle:{value:new THREE.Color(c.middle)},uCore:{value:new THREE.Color(c.core)}},
    transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:`varying vec3 vN; uniform float uT;
      void main(){vN=normalize(normalMatrix*normal);
        float wobble=0.07*sin(position.y*13.0+position.z*9.0-uT*12.0);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position*(1.0+wobble),1.0);
      }`,
    fragmentShader:`varying vec3 vN; uniform float uA; uniform vec3 uOuter,uMiddle,uCore;
      void main(){float band=abs(vN.z);
        vec3 col=band<0.35?uOuter:(band<0.78?uMiddle:uCore);
        gl_FragColor=vec4(col,uA);
        #include <colorspace_fragment>
      }`,
  });
  const lobes=[];
  for(let i=0;i<5;i++) {const l=new THREE.Mesh(sphere,cloudMaterial);g.add(l);lobes.push(l);}
  const petals=[];
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5;
    const p=new THREE.Mesh(plane,flameMaterial(i*0.7));
    p.rotation.set(-Math.PI/2,0,-a);
    p.position.set(Math.cos(a)*0.15,0,Math.sin(a)*0.15);
    g.add(p);petals.push({p,a});
  }
  v.spawn(g,c.impactDuration,(t)=>{
    const expand=1-Math.pow(1-Math.min(1,t/0.55),3);
    flash.scale.setScalar(0.18+expand*0.6);
    flash.material.opacity=Math.max(0,1-t/0.27);
    cloudMaterial.uniforms.uT.value=t*2;
    cloudMaterial.uniforms.uA.value=1-smoothFade(t);
    for(let i=0;i<lobes.length;i++) {
      const a=i*Math.PI*2/5;
      const r=expand*c.impactRadius*0.38;
      lobes[i].position.set(Math.cos(a)*r,0.1+Math.sin(a*2)*0.12+t*0.32,Math.sin(a)*r);
      const s=(0.15+expand*0.36)*(1-t*0.25);
      lobes[i].scale.set(s,s*(1.1+i*0.06),s);
    }
    for(const {p,a} of petals) {
      const r=0.12+expand*c.impactRadius*0.50;
      p.position.set(Math.cos(a)*r,Math.sin(t*Math.PI)*0.2,Math.sin(a)*r);
      p.scale.set((0.3+expand*0.62)*(1-t*0.5),0.9*(1-t*0.6),1);
      p.material.uniforms.uT.value=t*1.4+a;
      p.material.uniforms.uA.value=1-Math.pow(t,1.4);
    }
  });
  v.fx.burst(e.x,y,e.z,12,{color:c.middle,size:0.13,sizeEnd:0.03,speed:4.2,life:0.38,up:1.5,gravity:3,drag:1.5});
  // White-grey smoke arrives behind the flash, then lifts clear of the target.
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5;
    v.dust.add(e.x+Math.cos(a)*0.2,y-0.2,e.z+Math.sin(a)*0.2,Math.cos(a)*0.8,0.8,Math.sin(a)*0.8,{color:0xd9d7d1,size:0.2,sizeEnd:0.75,life:0.62,alpha:0.55,drag:2});
  }
}

function smoothFade(t) {
  const k=Math.max(0,Math.min(1,(t-0.35)/0.65));
  return k*k*(3-2*k);
}
