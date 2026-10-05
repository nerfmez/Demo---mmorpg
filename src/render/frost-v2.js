// Approved FrostNova V2: source mesh corners and 30 Hz linear transform samples.
// One shared GPU clip, one material/draw per phase; no arena or actor geometry.
import * as THREE from 'three';
import clip from '../../assets/vfx/frost-v2/clip.json';
import positionURL from '../../assets/vfx/frost-v2/positions.bin?url';
import colorURL from '../../assets/vfx/frost-v2/colors.bin?url';
const texture=()=>{
 const t=new THREE.DataTexture(new Uint16Array(clip.vertices*clip.frames*4),clip.vertices,clip.frames,THREE.RGBAFormat,THREE.HalfFloatType);
 t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.userData.shared=true;return t;
};
const positions=texture(),colors=texture();
export const frostReady=Promise.all([[positions,positionURL],[colors,colorURL]].map(async([t,url])=>{
 const r=await fetch(url);if(!r.ok)throw Error(`Frost V2 asset ${r.status}`);
 const b=await r.arrayBuffer();if(b.byteLength!==t.image.data.byteLength)throw Error('Invalid Frost V2 clip');
 t.image.data.set(new Uint16Array(b));t.needsUpdate=true;
}));
const geometry=new THREE.BufferGeometry();
geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(clip.vertices*3),3));
geometry.setAttribute('aVertex',new THREE.Float32BufferAttribute(Float32Array.from({length:clip.vertices},(_,i)=>i),1));geometry.userData.shared=true;
export function frostMesh(radius=4.2,charge=false){
 const material=new THREE.ShaderMaterial({
  uniforms:{uPositions:{value:positions},uColors:{value:colors},uFrame:{value:charge?0:7},uScale:{value:radius/clip.radius}},
  transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
  vertexShader:`attribute float aVertex;uniform sampler2D uPositions,uColors;uniform float uFrame,uScale;varying vec4 vColor;
   void main(){float f=clamp(uFrame,0.,26.),a=floor(f),b=min(a+1.,26.);vec2 ua=vec2((aVertex+.5)/${clip.vertices}.,(a+.5)/27.),ub=vec2(ua.x,(b+.5)/27.);
    vec3 p=mix(texture2D(uPositions,ua).xyz,texture2D(uPositions,ub).xyz,fract(f));p.xz*=uScale;
    vColor=mix(texture2D(uColors,ua),texture2D(uColors,ub),fract(f));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader:`varying vec4 vColor;void main(){if(vColor.a<.003)discard;gl_FragColor=vColor;
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.userData.frostV2=true;return mesh;
}
