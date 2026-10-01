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
