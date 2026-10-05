// Short ground-hugging dust volumes. Ray integration avoids billboard edges and opaque balls.
import * as THREE from 'three';
const box=new THREE.BoxGeometry(1,1,1);box.userData.shared=true;
const cameraLocal=new THREE.Vector3();
const noise=`float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
function volume(cfg,seed){
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.FrontSide,
 uniforms:{uCamera:{value:new THREE.Vector3()},uAge:{value:0},uAlpha:{value:0},uSeed:{value:seed},uLight:{value:new THREE.Color(cfg.color)},uDark:{value:new THREE.Color(cfg.shadow)}},
 vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 vP;uniform vec3 uCamera,uLight,uDark;uniform float uAge,uAlpha,uSeed;${noise}
 void main(){vec3 rd=normalize(vP-uCamera);vec3 inv=1./rd;vec3 a=(-.5-uCamera)*inv,b=(.5-uCamera)*inv;vec3 lo=min(a,b),hi=max(a,b);float start=max(max(lo.x,lo.y),lo.z),end=min(min(hi.x,hi.y),hi.z);float stepLen=max(0.,end-max(start,0.))/14.;vec4 sum=vec4(0.);
 for(int i=0;i<14;i++){vec3 p=uCamera+rd*(max(start,0.)+(float(i)+.5)*stepLen);vec3 q=p*2.;float n=noise(p*6.+vec3(uSeed,uAge*-.8,uAge*.6));n=.72*n+.28*noise(p*13.-uAge+uSeed);q.xz+=vec2(sin(p.y*7.+uSeed+uAge*2.),cos(p.y*6.+uSeed))*.12;float envelope=max(0.,1.-dot(q,q));float density=smoothstep(.23,.68,n)*envelope*envelope;float alpha=1.-exp(-density*stepLen*uAlpha*12.);vec3 color=mix(uDark,uLight,clamp(.38+p.y*.6+n*.3,0.,1.));sum.rgb+=(1.-sum.a)*alpha*color;sum.a+=(1.-sum.a)*alpha;}
 if(sum.a<.003)discard;gl_FragColor=vec4(sum.rgb/max(.001,sum.a),sum.a);
 #include <colorspace_fragment>
 }`});
 const mesh=new THREE.Mesh(box,mat);mesh.frustumCulled=false;
 mesh.onBeforeRender=(_r,_s,camera)=>{cameraLocal.setFromMatrixPosition(camera.matrixWorld);mesh.worldToLocal(cameraLocal);mat.uniforms.uCamera.value.copy(cameraLocal);};return mesh;
}
export function groundDust(vfx,e,cfg){
 for(let i=0;i<cfg.count;i++){
  const angle=i*2.399963,dx=Math.cos(angle),dz=Math.sin(angle),variation=.78+.22*Math.sin(i*7.13),life=cfg.life*(.86+.14*Math.cos(i*3.1));
  const mesh=volume(cfg,i*4.37),reach=cfg.radius*(.7+.3*variation);mesh.rotation.y=angle;
  vfx.spawn(mesh,life,t=>{const travel=reach*(.18+.82*(1-Math.pow(1-t,2))),x=e.x+dx*travel,z=e.z+dz*travel,height=cfg.height*(.28+.72*t)*variation;
   mesh.position.set(x,vfx.gy(x,z)+height*.42+.02,z);mesh.scale.set((.7+1.05*t)*variation,height,(.55+.9*t)*variation);
   const u=mesh.material.uniforms;u.uAge.value=t;u.uAlpha.value=cfg.opacity*Math.min(1,t/.075)*Math.pow(1-t,1.65);
  });
 }
}
