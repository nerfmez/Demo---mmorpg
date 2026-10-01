// The same deterministic meadow field drives painted ground and planted blade density.
// CPU sampling is construction-only; GLSL uses metres, including negative world coordinates.
const fract = x => x - Math.floor(x);
const mix = (a,b,t) => a+(b-a)*t;
const smooth = (a,b,x) => {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function paintHash(x,z) {
  let a=fract(x*.1031),b=fract(z*.1031),c=a;
  const d=a*(b+33.33)+b*(c+33.33)+c*(a+33.33);a+=d;b+=d;c+=d;
  return fract((a+b)*c);
}
export function paintNoise(x,z) {
  const i=Math.floor(x),j=Math.floor(z),u=fract(x),v=fract(z);
  return mix(mix(paintHash(i,j),paintHash(i+1,j),u*u*(3-2*u)),mix(paintHash(i,j+1),paintHash(i+1,j+1),u*u*(3-2*u)),v*v*(3-2*v));
}
export function meadowDensity(x,z) {
  const px=x+(paintNoise(x*.11+17,z*.11+17)-.5)*3.6;
  const pz=z+(paintNoise(x*.11+43,z*.11+43)-.5)*3.6;
  const cover=smooth(.36,.69,paintNoise(px*.19,pz*.19)*.72+paintNoise(px*.58+31,pz*.58+31)*.28);
  const worn=smooth(.66,.80,paintNoise(px*.10+59,pz*.10+59));
  return (.15+cover*.85)*(1-worn*.86);
}
export const NOISE_GLSL=/* glsl */ `
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y);}
float fbm3(vec2 p){float v=0.0,a=.5;for(int i=0;i<3;i++){v+=a*vnoise(p);p=p*2.03+17.1;a*=.5;}return v/.875;}
`;
export const MEADOW_FIELD_GLSL=/* glsl */ `
vec2 meadowField(vec2 w){
  vec2 p=w+(vec2(vnoise(w*.11+17.0),vnoise(w*.11+43.0))-.5)*3.6;
  float cover=smoothstep(.36,.69,vnoise(p*.19)*.72+vnoise(p*.58+31.0)*.28);
  float worn=smoothstep(.66,.80,vnoise(p*.10+59.0));
  return vec2((.15+cover*.85)*(1.0-worn*.86),worn);
}
`;

// ---------- baked low-frequency fields ----------
// The painted ground needs ~20 slowly varying value noises per pixel (meadow cover, wobbles,
// broad tints). They are computed here once at load into three small RGBA textures (texels per
// metre from art.ground.fieldTexels) and sampled with linear filtering, instead of re-hashed for
// every fragment of the terrain and every grass blade. Same formulas as the GLSL they replace.
// Channels: F0 meadow cover, worn, broad(.085), ochre(.47); F1 bare(.5), wobble(.42),
// width(.11), paving(.38); F2 townTone(.21), bank(.42), shore(.21), sandySoil(.62).
const noiseAt=(x,z,k,c)=>paintNoise(x*k+c,z*k+c);
export function meadowFieldAt(x,z) {
  const px=x+(paintNoise(x*.11+17,z*.11+17)-.5)*3.6;
  const pz=z+(paintNoise(x*.11+43,z*.11+43)-.5)*3.6;
  const cover=smooth(.36,.69,paintNoise(px*.19,pz*.19)*.72+paintNoise(px*.58+31,pz*.58+31)*.28);
  const worn=smooth(.66,.80,paintNoise(px*.10+59,pz*.10+59));
  return [(.15+cover*.85)*(1-worn*.86),worn];
}
export function bakeGroundFieldData(x0,z0,width,depth,texels) {
  const w=Math.ceil(width*texels)+1,h=Math.ceil(depth*texels)+1,n=w*h;
  const f=[new Uint8Array(n*4),new Uint8Array(n*4),new Uint8Array(n*4)];
  const q=v=>Math.max(0,Math.min(255,Math.round(v*255)));
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const x=x0+i/texels,z=z0+j/texels,k=(j*w+i)*4,[cover,worn]=meadowFieldAt(x,z);
    f[0][k]=q(cover);f[0][k+1]=q(worn);f[0][k+2]=q(noiseAt(x,z,.085,13));f[0][k+3]=q(noiseAt(x,z,.47,37));
    f[1][k]=q(noiseAt(x,z,.5,91));f[1][k+1]=q(noiseAt(x,z,.42,71));f[1][k+2]=q(noiseAt(x,z,.11,33));f[1][k+3]=q(noiseAt(x,z,.38,57));
    f[2][k]=q(noiseAt(x,z,.21,5));f[2][k+1]=q(noiseAt(x,z,.42,51));f[2][k+2]=q(noiseAt(x,z,.21,19));f[2][k+3]=q(noiseAt(x,z,.62,3));
  }
  return {width:w,height:h,data:f,rect:[x0,z0,(w-1)/texels,(h-1)/texels]};
}
export const GROUND_FIELD_GLSL=/* glsl */ `
uniform sampler2D uField0,uField1,uField2;uniform vec4 uFieldRect;
// half-texel inset so world coordinates land on texel centres of the baked grid
vec2 fieldUV(vec2 w){vec2 size=vec2(textureSize(uField0,0));return ((w-uFieldRect.xy)/uFieldRect.zw*(size-1.0)+.5)/size;}
`;
