// VFX-only geometry samples from the approved editable Blender scenes.
// Shared immutable GPU atlases; one disposable material per live effect.
import * as THREE from 'three';
const metadata=import.meta.glob('../../assets/vfx/approved/*/clip.json',{eager:true,import:'default'});
const urls=import.meta.glob('../../assets/vfx/approved/*/*.bin',{eager:true,query:'?url',import:'default'});
const clips=new Map(),loads=[];
for(const [path,c] of Object.entries(metadata)){
 const base=path.slice(0,-9),name=base.split('/').at(-2),textures=[];
 for(const file of ['positions.bin','colors.bin']){
  const tex=new THREE.DataTexture(new Uint16Array(c.width*c.rowsPerFrame*c.frames*4),c.width,c.rowsPerFrame*c.frames,THREE.RGBAFormat,THREE.HalfFloatType);
  tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.userData.shared=true;textures.push(tex);
  loads.push(fetch(urls[base+file]).then(async r=>{if(!r.ok)throw Error(`Approved ${name} asset: ${r.status}`);const b=await r.arrayBuffer();if(b.byteLength!==tex.image.data.byteLength)throw Error(`Invalid ${name} atlas`);tex.image.data.set(new Uint16Array(b));tex.needsUpdate=true;}));
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(c.vertices*3),3));
 geometry.setAttribute('aVertex',new THREE.Float32BufferAttribute(Float32Array.from({length:c.vertices},(_,i)=>i),1));geometry.userData.shared=true;
 clips.set(name,{...c,geometry,textures});
}
export const approvedClipsReady=Promise.all(loads);
export function approvedMesh(name,radius){
 const c=clips.get(name);if(!c)throw Error(`Unknown approved clip ${name}`);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
 uniforms:{uPositions:{value:c.textures[0]},uColors:{value:c.textures[1]},uFrame:{value:0},uScale:{value:radius?radius/c.radius:1}},
 vertexShader:`attribute float aVertex;uniform sampler2D uPositions,uColors;uniform float uFrame,uScale;varying vec4 vColor;
 vec2 coord(float f){return vec2((mod(aVertex,${c.width}.)+.5)/${c.width}.,(floor(aVertex/${c.width}.)+f*${c.rowsPerFrame}.+.5)/${c.frames*c.rowsPerFrame}.);}
 void main(){float f=clamp(uFrame,0.,${c.frames-1}.),a=floor(f),b=min(a+1.,${c.frames-1}.);vec2 ua=coord(a),ub=coord(b);
 vec3 p=mix(texture2D(uPositions,ua).xyz,texture2D(uPositions,ub).xyz,fract(f));p.xz*=uScale;
 vColor=mix(texture2D(uColors,ua),texture2D(uColors,ub),fract(f));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`varying vec4 vColor;void main(){if(vColor.a<.003)discard;gl_FragColor=vColor;
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const mesh=new THREE.Mesh(c.geometry,material);mesh.frustumCulled=false;mesh.userData.clipRadius=c.radius;mesh.userData.clipFrames=c.frames;mesh.userData.clipLife=(c.frames-1)/c.fps;return mesh;
}
