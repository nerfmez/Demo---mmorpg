// Shared world-space paint for terrain and planted grass. Linear RGB throughout.
import { animeStudy } from './anime-study.js';
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm3(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<3;i++){ v += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return v / 0.875; }
`;

export const GROUND_COLOR_GLSL = NOISE_GLSL + /* glsl */ `
vec3 groundColor(vec2 w,float y,vec3 tintL,vec3 tintD,vec4 splat,vec2 coast,float up,float water) {
  float study=${animeStudy?'1.0':'0.0'};
  float big = fbm3(w * 0.11);
  float mid = vnoise(w * 1.15);
  float fine = vnoise(w * 5.2);
  // Broad colour groups are quiet; the silhouette of tiny grass strokes supplies detail.
  float patchT = smoothstep(0.25, 0.77, big + (mid - 0.5) * 0.12);
  vec3 grass = mix(tintD, tintL, patchT);
  grass *= 0.97 + step(.48, mid)*.035 + clamp(y * .006, -.02, .035);
  vec2 grassCell=floor(w*2.5), gf=fract(w*2.5)-.5;
  gf-=(vec2(hash12(grassCell+13.2),hash12(grassCell+37.7))-.5)*.48;
  float seed=hash12(grassCell);
  float ga=(seed-.5)*1.4;gf=mat2(cos(ga),-sin(ga),sin(ga),cos(ga))*gf;
  float tuft=0.0;
  for(int b=0;b<3;b++) {
    float fi=float(b), side=fi-1.0;
    vec2 q=gf-vec2(side*.12,abs(side)*.07);
    float bend=q.y*q.y*side*.8;
    float width=.032*max(.0,1.0-(q.y+.24)/.48);
    float stem=(1.0-smoothstep(width,width+.015,abs(q.x-bend-side*q.y*.23)))*step(-.24,q.y)*(1.0-step(.26,q.y));
    tuft=max(tuft,stem);
  }
  float tuftPatch=smoothstep(.31,.53,big+mid*.18)*step(.38,seed);
  grass=mix(grass,seed>.62?grass*1.10+vec3(.008,.008,0.0):grass*.86,tuft*tuftPatch*mix(.28,.13,study));
  grass*=1.0+(fine-.5)*.045;
  vec2 blot=floor(w*3.8),bp=fract(w*3.8)-.5;
  float bd=length(bp*vec2(1.2,.7));
  float daub=(1.0-smoothstep(.12,.28,bd))*step(.53,hash12(blot));
  grass=mix(grass,hash12(blot+19.0)>.55?grass*1.08:grass*.93,daub*.25);
  vec3 dry = mix(vec3(.38,.32,.15),vec3(.46,.38,.19),smoothstep(.3,.7,mid));
  // Warm packed earth, irregular worn patches and sparse little stone faces.
  vec3 road=mix(vec3(.53,.43,.28),vec3(.64,.53,.36),smoothstep(.2,.8,big*.7+mid*.3));
  road=mix(road,mix(vec3(.59,.44,.27),vec3(.73,.60,.39),smoothstep(.2,.8,big*.8+mid*.2)),study);
  vec2 pebbles=w*3.2;vec2 pc=floor(pebbles),pf=fract(pebbles)-.5;
  float pr=length(pf*vec2(1.0,1.6));float ps=hash12(pc);
  float pebble=(1.0-smoothstep(.09,.14,pr))*step(.92,ps);
  road=mix(road,vec3(.75,.64,.42),pebble*.7);
  road*=1.0+(fine-.5)*.035;
  vec3 mud=mix(vec3(.23,.27,.16),vec3(.39,.34,.20),smoothstep(water-.2,water+.6,y));
  mud=mix(mud,vec3(.40,.45,.31),step(.72,fine)*.15);
  // dry beach sand above the waterline (sea coast and sandy banks)
  mud=mix(mud,vec3(.74,.64,.44)+(mid-.5)*.05,smoothstep(water+.35,water+.95,y));
  // Worn, bevelled paving with staggered courses and plants between stones.
  vec2 tw=w*vec2(1.10,1.35);tw+=vec2(vnoise(w*2.0),vnoise(w*2.0+7.0))*.10;
  vec2 tile=tw+vec2(step(.5,fract(tw.y*.5))*.5,0.0);
  vec2 f=abs(fract(tile)-.5);float edge=max(f.x,f.y);
  float grout=smoothstep(.448,.475,edge);
  vec3 stone=mix(vec3(.40,.37,.32),vec3(.53,.49,.41),hash12(floor(tile)));
  stone+=vec3(.035)*step(.38,edge)*(1.0-grout);
  stone=mix(stone,vec3(.24,.25,.19),grout);
  float mossAmt=w.x>110.0?.8:.24;
  stone=mix(stone,grass*.85,grout*smoothstep(.36,.60,big)*mossAmt);
  // Angular cliff strata; noise breaks the band edges rather than colouring every pixel.
  float strata=vnoise(vec2(w.x*.21+w.y*.19,y*2.7));
  vec3 rock=mix(vec3(.29,.28,.27),vec3(.43,.41,.36),step(.42,strata));
  rock=mix(rock,vec3(.49,.47,.41),step(.72,strata)*.4);
  vec3 col=mix(grass,dry,splat.a*.55);
  col=mix(col,mud,smoothstep(.2,.8,splat.b));
  float roadEdge=splat.r+(mid-.5)*.25+(fine-.5)*.10;
  col=mix(col,road,smoothstep(.41,.55,roadEdge));
  col=mix(col,stone,smoothstep(.45,.55,splat.g+(mid-.5)*.14));
  float cliff=1.0-smoothstep(.68,.82,up+(fine-.5)*.035);
  col=mix(col,rock,cliff);
  // A dedicated sand layer covers both ground grass strokes and the path texture.
  // Warm, broad paint variation; darker damp sand next to the wash, no yellow glare.
  vec3 sand=mix(vec3(.64,.56,.37),vec3(.76,.69,.49),big);
  sand*=1.0+(mid-.5)*.07+(fine-.5)*.035;
  float grain=step(.94,hash12(floor(w*17.0)));
  sand=mix(sand,sand*.87,grain*.3);
  float damp= smoothstep(-6.0,-.3,coast.y);
  sand=mix(sand,vec3(.45,.44,.32),damp*.46);
  col=mix(col,sand,coast.x);
  return col;
}
float groundCloud(vec2 w,float time) {
 return 1.0-.045*smoothstep(.55,.72,fbm3(w*.012+vec2(time*.012,time*.006)));
}
`;
