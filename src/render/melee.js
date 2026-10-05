// Original cel-cut ribbons and short directional contact shards. No textures/assets.
import * as THREE from 'three';
let cutGeo;
function ribbonGeometry() {
  if (cutGeo) return cutGeo;
  const n=64, uv=[], pos=[], idx=[];
  for(let i=0;i<=n;i++) for(let j=0;j<2;j++){uv.push(i/n,j);pos.push(0,0,0);}
  for(let i=0;i<n;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  cutGeo=new THREE.BufferGeometry();
  cutGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  cutGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));cutGeo.setIndex(idx);
  cutGeo.userData.shared=true;return cutGeo;
}
export function cutRibbon(cfg, radius, arc, reverse=false, finisher=false) {
  const f=cfg.swing;
  const mat=new THREE.ShaderMaterial({
    uniforms:{uT:{value:0},uRadius:{value:radius},uArc:{value:arc},uWidth:{value:f.width*(finisher?f.finisherWidth:1)},
      uTilt:{value:f.tilt*(finisher?1.6:reverse?-1:1)},uRev:{value:reverse?1:0},uOpacity:{value:f.opacity},
      uBody:{value:new THREE.Color(cfg.colors.body)},uCore:{value:new THREE.Color(cfg.colors.core)},uRim:{value:new THREE.Color(cfg.colors.rim)}},
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`uniform float uRadius,uArc,uWidth,uTilt; varying vec2 vUv;
      void main(){vUv=uv;float a=(uv.x-.5)*uArc;
        float taper=pow(max(0.,sin(uv.x*3.14159265)),.65);
        float r=max(0.,uRadius-uWidth*(1.-uv.y)*taper);
        vec3 p=vec3(sin(a)*r,sin(a)*uTilt,cos(a)*r);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uT,uRev,uOpacity;uniform vec3 uBody,uCore,uRim;varying vec2 vUv;
      void main(){float s=mix(vUv.x,1.-vUv.x,uRev);
        float head=smoothstep(0.,.46,uT)*1.04;
        float behind=head-s;
        float lead=1.-smoothstep(-.015,.025,s-head);
        float wake=1.-smoothstep(.22,.68,behind);
        float ends=smoothstep(0.,.045,vUv.x)*(1.-smoothstep(.94,1.,vUv.x));
        float edge=smoothstep(0.,.08,vUv.y)*(1.-smoothstep(.96,1.,vUv.y));
        float streak=.78+.22*sin(s*51.+vUv.y*8.);
        float fade=1.-smoothstep(.48,1.,uT);
        float alpha=lead*wake*ends*edge*fade*uOpacity*streak;
        vec3 col=mix(uRim,uBody,smoothstep(.05,.32,vUv.y));
        col=mix(col,uCore,smoothstep(.75,.91,vUv.y));
        gl_FragColor=vec4(col,alpha);#include <colorspace_fragment>
      }`.replace(';#include',';\n#include'),
  });
  const mesh=new THREE.Mesh(ribbonGeometry(),mat);mesh.frustumCulled=false;mesh.renderOrder=5;
  return mesh;
}

/** Fixed-capacity streaks, including two brief contact cuts. Reused numeric buffers. */
export class ContactShards {
  constructor(scene,capacity=192){
    this.cap=capacity;this.count=0;
    this.pos=new Float32Array(capacity*3);this.vel=new Float32Array(capacity*3);
    this.data=new Float32Array(capacity*4);this.life=new Float32Array(capacity);this.total=new Float32Array(capacity);
    const g=new THREE.InstancedBufferGeometry(),q=new THREE.PlaneGeometry(1,1);
    // Own this quad's attributes; no external mesh can dispose their GPU buffers.
    g.index=q.index;g.attributes.position=q.attributes.position;g.attributes.uv=q.attributes.uv;
    g.setAttribute('aPos',new THREE.InstancedBufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aVel',new THREE.InstancedBufferAttribute(this.vel,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aData',new THREE.InstancedBufferAttribute(this.data,4).setUsage(THREE.DynamicDrawUsage));g.instanceCount=0;
    this.mat=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color()},uCore:{value:new THREE.Color()}},
      transparent:true,depthWrite:false,depthTest:false,side:THREE.DoubleSide,
      vertexShader:`attribute vec3 aPos,aVel;attribute vec4 aData;varying vec2 vUv;varying vec4 vData;
        void main(){vUv=uv;vData=aData;vec4 mv=viewMatrix*vec4(aPos,1.);
          vec2 d=(viewMatrix*vec4(aVel,0.)).xy;d=length(d)<.001?vec2(0.,1.):normalize(d);
          float age=1.-aData.z;vec2 p=uv-.5;
          p.x*=aData.y*(.6+.4*aData.z);p.y*=aData.x*(1.+.5*sin(age*3.14159));
          mv.xy+=vec2(d.y,-d.x)*p.x+d*p.y;
          gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform vec3 uColor,uCore;varying vec2 vUv;varying vec4 vData;
        void main(){float along=sin(vUv.y*3.14159265);float width=pow(max(0.,along),.8)*.5;
          float x=abs(vUv.x-.5);float shape=1.-smoothstep(width*.6,width,x);
          float fade=smoothstep(0.,.3,vData.z);float core=1.-smoothstep(.03,.17,x);
          vec3 col=mix(uColor,uCore,max(core,vData.w));
          gl_FragColor=vec4(col,shape*fade);#include <colorspace_fragment>
        }`.replace(';#include',';\n#include'),
    });
    this.mesh=new THREE.Mesh(g,this.mat);this.mesh.frustumCulled=false;this.mesh.renderOrder=8;scene.add(this.mesh);
  }
  emit(x,y,z,vx,vy,vz,length,width,life,flash=0){
    if(this.count>=this.cap)return;const i=this.count++,p=i*3,d=i*4;
    this.pos[p]=x;this.pos[p+1]=y;this.pos[p+2]=z;
    this.vel[p]=vx;this.vel[p+1]=vy;this.vel[p+2]=vz;
    this.data[d]=length;this.data[d+1]=width;this.data[d+2]=1;this.data[d+3]=flash;this.life[i]=this.total[i]=life;
  }
  burst(e,cfg,y){
    const f=cfg.impact,k=e.crit?f.critScale:e.heavy?f.heavyScale:1;
    this.mat.uniforms.uColor.value.set(cfg.colors.sparks);this.mat.uniforms.uCore.value.set(cfg.colors.core);
    const angle=Math.atan2(e.x-(e.fromX??e.x-1),e.z-(e.fromZ??e.z));
    // Crossing cuts at the struck surface, then a sparse fan; no growing disc or smoke.
    for(let j=0;j<2;j++){const a=angle+1.05+j*1.1;
      this.emit(e.x,y,e.z,Math.sin(a)*.05,.035,Math.cos(a)*.05,f.flashSize*k,f.flashWidth,f.flashLife,1);}
    for(let j=0;j<f.sparks;j++){
      const a=angle+(Math.random()-.5)*f.spread,s=f.speed*(.55+Math.random()*.6);
      this.emit(e.x,y,e.z,Math.sin(a)*s,f.up*(.3+Math.random()),Math.cos(a)*s,
        f.sparkLength*k*(.6+Math.random()*.5),f.sparkWidth,f.sparkLife*(.7+Math.random()*.3));
    }
    this.upload();
  }
  clear(){this.count=0;this.mesh.geometry.instanceCount=0;}
  upload(){const g=this.mesh.geometry;g.instanceCount=this.count;
    g.attributes.aPos.needsUpdate=true;g.attributes.aVel.needsUpdate=true;g.attributes.aData.needsUpdate=true;}
  update(dt){
    for(let i=this.count-1;i>=0;i--){
      this.life[i]-=dt;
      if(this.life[i]<=0){const last=--this.count;
        if(i!==last){for(let j=0;j<3;j++){this.pos[i*3+j]=this.pos[last*3+j];this.vel[i*3+j]=this.vel[last*3+j];}
          for(let j=0;j<4;j++)this.data[i*4+j]=this.data[last*4+j];this.life[i]=this.life[last];this.total[i]=this.total[last];}continue;}
      const p=i*3;this.pos[p]+=this.vel[p]*dt;this.pos[p+1]+=this.vel[p+1]*dt;this.pos[p+2]+=this.vel[p+2]*dt;
      const drag=Math.exp(-dt*4);this.vel[p]*=drag;this.vel[p+2]*=drag;this.vel[p+1]-=dt*2;
      this.data[i*4+2]=this.life[i]/this.total[i];
    }this.upload();
  }
  dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mat.dispose();}
}

/** Direct mesh-formula translation of accepted batch02's authored crescents. */
export function approvedCut(cfg,radius,arc,reverse=false,whirl=false,half=0){
 const f=cfg.swing;
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
 uniforms:{uT:{value:0},uRadius:{value:radius},uArc:{value:arc},uWidth:{value:f.width},uOpacity:{value:f.opacity},uBody:{value:new THREE.Color(cfg.colors.body)},uCore:{value:new THREE.Color(cfg.colors.core)},uRim:{value:new THREE.Color(cfg.colors.rim)}},
 vertexShader:`varying vec2 vUv;uniform float uT,uRadius,uArc,uWidth;void main(){vUv=uv;
 float a=${whirl?'uv.x*uArc+uT*6.817+float('+half+')*3.14159265':'mix(-uArc*.5+uT*1.75,uArc*.5,uv.x)'};
 ${reverse&&!whirl?'a=-a;':''}
 float width=uWidth*${whirl?'(1.-uT*.9)':'(1.-uT*6./7.)'}*pow(max(0.,sin(uv.x*3.14159265)),.65)*(.35+.65*uv.x);
 float r=uRadius-width*1.45*(1.-uv.y);vec3 p=vec3(sin(a)*r,sin(a)*${whirl?'.14':reverse?'-.46':'.46'},cos(a)*r);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`varying vec2 vUv;uniform float uT,uOpacity;uniform vec3 uBody,uCore,uRim;void main(){vec3 c=vUv.y>.83?uCore:vUv.y>.31?uBody:uRim;float a=uOpacity*(1.-smoothstep(.88,1.,uT));gl_FragColor=vec4(c,a);
 #include <colorspace_fragment>
 }`});
 const mesh=new THREE.Mesh(ribbonGeometry(),material);mesh.frustumCulled=false;return mesh;
}
