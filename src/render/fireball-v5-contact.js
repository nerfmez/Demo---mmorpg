// Only V5's approved pressure, lobes and warm flakes. No arena or movie assets.
// Shared half-float animation atlases: source 24 Hz samples interpolated at render
// frequency. One draw per contact; no emitted-object/material or per-frame buffers.
import * as THREE from 'three';
import clip from '../../data/fireball-v5-contact.json';
import positionURL from '../../assets/vfx/fireball-v5-positions.bin?url';
import colorURL from '../../assets/vfx/fireball-v5-colors.bin?url';
const makeTexture=()=>{
 const t=new THREE.DataTexture(new Uint16Array(clip.vertices*clip.frames*4),clip.vertices,clip.frames,THREE.RGBAFormat,THREE.HalfFloatType);
 t.magFilter=t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;t.userData.shared=true;return t;
};
const positions=makeTexture(),colors=makeTexture();
export const contactReady=Promise.all([[positions,positionURL],[colors,colorURL]].map(async([texture,url])=>{
 const response=await fetch(url);if(!response.ok)throw Error(`V5 contact asset: ${response.status}`);
 const bytes=await response.arrayBuffer();if(bytes.byteLength!==texture.image.data.byteLength)throw Error('Invalid V5 contact atlas length');
 texture.image.data.set(new Uint16Array(bytes));texture.needsUpdate=true;
}));
const geometry=new THREE.BufferGeometry();
geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(clip.vertices*3),3));
geometry.setAttribute('aVertex',new THREE.Float32BufferAttribute(Float32Array.from({length:clip.vertices},(_,i)=>i),1));
const flakeIds=new Float32Array(clip.vertices).fill(-1);let offset=0;
for(const obj of clip.objects){if(obj.name.includes('ember'))flakeIds.fill(Number(obj.name.match(/(\d+)$/)?.[1]??-1),offset,offset+obj.vertices);offset+=obj.vertices;}
geometry.setAttribute('aFlake',new THREE.Float32BufferAttribute(flakeIds,1));
geometry.setIndex(clip.indices);geometry.userData.shared=true;
export function v5ContactMesh(cfg) {
 const material=new THREE.ShaderMaterial({
  uniforms:{uEmberCount:{value:Math.min(20,cfg.impact.embers)},uPositions:{value:positions},uColors:{value:colors},uTime:{value:0},uProgress:{value:0},uAlpha:{value:1},uScale:{value:1},uWidth:{value:cfg.impact.size},uGlowRadius:{value:0},uSeed:{value:0},uVelocity:{value:new THREE.Vector3(1,0,0)}},
  transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,forceSinglePass:true,
  vertexShader:/* glsl */`
   uniform sampler2D uPositions,uColors;uniform float uProgress,uScale,uWidth;
   uniform vec3 uVelocity;uniform float uEmberCount;attribute float aVertex,aFlake;varying vec4 vColor;
   void main(){
    float f=clamp(uProgress,0.,1.)*24.;float a=floor(f),b=min(a+1.,24.);float q=fract(f);
    vec2 uvA=vec2((aVertex+.5)/${clip.vertices}.,(a+.5)/${clip.frames}.),uvB=vec2((aVertex+.5)/${clip.vertices}.,(b+.5)/${clip.frames}.);
    vec3 p=mix(texture2D(uPositions,uvA).xyz,texture2D(uPositions,uvB).xyz,q);
    vColor=mix(texture2D(uColors,uvA),texture2D(uColors,uvB),q);
    if(aFlake>=uEmberCount)vColor.a=0.;
    vec2 d=(viewMatrix*vec4(uVelocity,0.)).xy;d=length(d)<.001?vec2(1,0):normalize(d);
    vec4 mv=modelViewMatrix*vec4(0,0,0,1);
    mv.xy+=(d*p.x+vec2(-d.y,d.x)*p.y)*uScale*uWidth/1.5;
    mv.z+=p.z*.1;gl_Position=projectionMatrix*mv;
   }`,
  fragmentShader:/* glsl */`
   varying vec4 vColor;uniform float uAlpha;
   void main(){if(vColor.a<.003)discard;gl_FragColor=vec4(vColor.rgb,vColor.a*uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=8;mesh.userData.v5=true;return mesh;
}
