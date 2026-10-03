// Cosmetic water only: shared game time, fixed buffers, no particles allocated per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { timeUniform } from './patch.js';

export function cityFountain(root, world) {
  const {x,z}=world.data.city.fountain,ox=root.position.x,oy=root.position.y,oz=root.position.z;
  const pool=new THREE.MeshLambertMaterial({color:'#438f96'});
  pool.userData.walkSurface='animated-fountain';
  pool.onBeforeCompile=s=>{
    s.uniforms.uTime=timeUniform;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFountain;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvFountain=(modelMatrix*vec4(position,1.)).xyz;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFountain;uniform float uTime;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p=vFountain.xz-vec2(${x},${z});float r=length(p);
        float wave=sin(r*18.-uTime*4.5+sin(p.x*3.+uTime)*.4);
        float shimmer=sin(p.x*9.+uTime*2.)*sin(p.y*11.-uTime*2.8);
        float ripple=0.;
        float nearFlow=1.-smoothstep(28.,70.,distance(cameraPosition,vec3(${x},2.,${z})));
        if(nearFlow>.01){
          // The small rings never reach the next jet. Select the nearest of
          // eight impacts analytically instead of evaluating eight exponentials.
          float i=mod(floor((atan(p.y,p.x)+6.283185)/.785398+.5),8.);
          float a=i*.785398;vec2 hit=vec2(cos(a),sin(a))*3.9;
          float age=fract(uTime*.42+i*.137),d=length(p-hit);
          ripple=exp(-pow((d-age*.85)*37.,2.))*(1.-age)*.32*nearFlow;
        }
        diffuseColor.rgb*=.93+wave*.035+shimmer*.025;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.60,.80,.77),clamp(ripple,0.,.45));
      `);
  };
  pool.customProgramCacheKey=()=> 'city-fountain-pools-v1';
  const curves=[],hits=[];
  const vector=(r,a,y)=>new THREE.Vector3(x+Math.cos(a)*r-ox,y-oy,z+Math.sin(a)*r-oz);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    curves.push(new THREE.QuadraticBezierCurve3(vector(1.86,a,1.63),vector(2.87,a,3.68),vector(3.9,a,1.59)));
    hits.push(vector(3.9,a,1.62));
  }
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    curves.push(new THREE.QuadraticBezierCurve3(vector(1.72,a,3.07),vector(1.92,a,2.79),vector(2.13,a,1.60)));
    hits.push(vector(2.13,a,1.62));
  }
  // Small bubbling crown replaces the solid ball, with runoff into the upper bowl.
  curves.push(new THREE.QuadraticBezierCurve3(vector(0,0,4.26),vector(.18,0,5.05),vector(.64,0,4.25)));
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2+.3;
    curves.push(new THREE.QuadraticBezierCurve3(vector(.72,a,4.27),vector(.93,a,4.1),vector(1.16,a,3.06)));
  }
  const parts=curves.map((curve,i)=>{
    const g=new THREE.TubeGeometry(curve,16,i<8?.027:.037,5,false);
    const n=g.attributes.position.count,phases=new Float32Array(n);phases.fill(i*.31);
    g.setAttribute('flowPhase',new THREE.BufferAttribute(phases,1));return g;
  });
  const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  const flow=new THREE.MeshBasicMaterial({color:'#c0e8e2',transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide});
  flow.onBeforeCompile=s=>{
    s.uniforms.uTime=timeUniform;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float flowPhase;varying vec2 vFlow;varying float vFlowPhase;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvFlow=uv;vFlowPhase=flowPhase;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float uTime;varying vec2 vFlow;varying float vFlowPhase;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        float run=fract(vFlow.x*13.-uTime*2.8+vFlowPhase);
        float streak=smoothstep(.10,.23,run)*(1.-smoothstep(.65,.96,run));
        diffuseColor.a*=.36+.64*streak;diffuseColor.rgb*=.76+.24*streak;
      `);
  };
  flow.customProgramCacheKey=()=> 'city-fountain-flow-v1';
  const jets=new THREE.Mesh(geo,flow);jets.name='fountain-flowing-jets-and-cascades';root.add(jets);
  const points=[],phases=[];
  for(const [i,hit]of hits.entries())for(let j=0;j<3;j++){points.push(hit.x,hit.y,hit.z);phases.push((i*.13+j*.31)%1,i*2.39+j*2.1);}
  const splashGeo=new THREE.BufferGeometry();splashGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));splashGeo.setAttribute('splashPhase',new THREE.Float32BufferAttribute(phases,2));
  splashGeo.computeBoundingSphere();splashGeo.boundingSphere.radius+=.5;
  const splashMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:timeUniform},
    vertexShader:`attribute vec2 splashPhase;uniform float uTime;varying float vFade;
      void main(){float t=fract(uTime*1.4+splashPhase.x);vec3 p=position;
        p.xz+=vec2(cos(splashPhase.y),sin(splashPhase.y))*t*.28;p.y+=sin(t*3.14159)*.24;
        vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;
        gl_PointSize=2.5;vFade=(1.-t)*smoothstep(100.,45.,length(view.xyz));}`,
    fragmentShader:`varying float vFade;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.76,.92,.87,(1.-smoothstep(.24,.5,d))*vFade*.60);}`});
  const spray=new THREE.Points(splashGeo,splashMat);spray.name='fountain-light-splash';root.add(spray);
  return pool;
}
