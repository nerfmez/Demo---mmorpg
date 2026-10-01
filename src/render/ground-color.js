// Shared painterly surfaces in metres, linear RGB, with lighting/shadows supplied by Three.
import * as THREE from 'three';
import art from '../../data/art.json' with {type:'json'};
import { NOISE_GLSL, MEADOW_FIELD_GLSL } from './ground-field.js';
export { NOISE_GLSL } from './ground-field.js';
const rgb=hex=>{const c=new THREE.Color(hex);return `vec3(${[c.r,c.g,c.b].map(v=>v.toFixed(5)).join(',')})`;};
const p=art.ground.palette;
// All ground types share the same brush scale and warm, restrained highlight colours.
// Analytic strokes are anti-aliased with screen derivatives, never a floating decal plane.
export const SURFACE_PAINT_GLSL=NOISE_GLSL+/* glsl */ `
float paintDaubs(vec2 w,float scale){
  vec2 cell=floor(w*scale),q=fract(w*scale)-.5;
  q-=(vec2(hash12(cell+13.2),hash12(cell+37.7))-.5)*.60;
  float seed=hash12(cell),angle=(seed-.5)*2.5;
  q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
  float d=length(q*vec2(1.0,2.4));
  float aa=max(fwidth(d),.012);
  return (1.0-smoothstep(.15-aa,.15+aa,d))*step(.36,seed);
}
vec3 paintedEarth(vec2 w,float wet){
  float broad=vnoise(w*.24+9.0),brush=vnoise(w*1.65);
  vec3 earth=mix(${rgb(p.earthShadow)},${rgb(p.earthLight)},smoothstep(.20,.79,broad+(brush-.5)*.16));
  float strokes=paintDaubs(w,2.1);
  earth=mix(earth,earth*1.12+${rgb(p.dust)}*.07,strokes*.35);
  vec2 cell=floor(w*1.6),q=fract(w*1.6)-.5;
  q-=(vec2(hash12(cell+7.0),hash12(cell+19.0))-.5)*.58;
  float seed=hash12(cell),d=length(q*vec2(1.1,1.6));
  float pebble=(1.0-smoothstep(.06,.09,d))*step(.90,seed);
  vec3 pebbleCol=mix(${rgb(p.stoneShadow)},${rgb(p.stoneLight)},step(.005,q.y));
  earth=mix(earth,pebbleCol,pebble*.8);
  return mix(earth,${rgb(p.mud)}*(.9+brush*.18),wet);
}
vec3 paintedPaving(vec2 w,vec3 moss,float weather){
  // Unequal staggered courses, rounded worn corners, quieter mortar and chipped edges.
  vec2 warp=vec2(vnoise(w*1.9+11.0),vnoise(w*1.9+47.0))-.5;
  float height=.78,course=floor(w.y/height);
  vec2 tile=vec2(w.x*(1.05+hash12(vec2(course,19.0))*.20)+hash12(vec2(course,7.0))*.9,w.y/height)+warp*.055;
  vec2 cell=floor(tile),q=fract(tile)-.5;
  float seed=hash12(cell),radius=.075+seed*.04;
  vec2 a=abs(q)-vec2(.445-radius,.424-radius);
  float distance=length(max(a,0.0))+min(max(a.x,a.y),0.0)-radius;
  distance+=(vnoise(w*13.0)-.5)*.016;
  float aa=max(fwidth(distance),.005),stoneMask=1.0-smoothstep(-aa,aa,distance);
  float edge=1.0-smoothstep(-.055,-.012,distance);
  vec3 stone=mix(${rgb(p.stoneShadow)},${rgb(p.stoneLight)},seed*.75+.12);
  stone*=.96+(vnoise(w*2.6)-.5)*.10;
  float face=paintDaubs(w,3.7);
  stone=mix(stone,stone*1.08+vec3(.012),face*.28);
  // A soft upper lip, without a bright square drawn around every slab.
  stone+=${rgb(p.dust)}*.11*(1.0-edge)*smoothstep(-.2,.38,q.y);
  stone*=.87+.13*edge;
  vec3 mortar=${rgb(p.mortar)};
  mortar=mix(mortar,moss*.79,smoothstep(.53,.73,vnoise(w*.53+72.0))*weather*.65);
  return mix(mortar,stone,stoneMask);
}
vec3 paintedTimber(vec2 w){
  float board=floor(w.y/.32),offset=hash12(vec2(board,8.3));
  float along=w.x+offset*17.0;
  float edge=abs(fract(w.y/.32)-.5);
  float aa=max(fwidth(edge),.009);
  float seam=smoothstep(.465-aa,.49+aa,edge);
  float grain=vnoise(vec2(along*.75,w.y*18.0+offset*9.0));
  float wash=vnoise(vec2(along*.30,board*.61));
  vec3 wood=mix(${rgb(p.woodShadow)},${rgb(p.woodLight)},offset*.6+wash*.25+.1);
  wood=mix(wood,${rgb(p.woodSilver)},smoothstep(.50,.77,wash)*.18);
  // Broken, bent grain strokes rather than parallel ruled stripes.
  float line=sin(w.y*89.0+vnoise(vec2(along*.8,board)) * 5.0);
  float broken=step(.62,grain)*smoothstep(.22,.57,vnoise(vec2(along*1.8,board+33.0)));
  wood*=1.0-.11*smoothstep(.80,.98,line)*broken;
  wood=mix(wood,wood*1.10,paintDaubs(vec2(w.x*.6,w.y*1.5),3.0)*.22);
  return mix(wood,${rgb(p.woodSeam)},seam*.62);
}
`;
export const GROUND_COLOR_GLSL=SURFACE_PAINT_GLSL+MEADOW_FIELD_GLSL+/* glsl */ `
vec3 groundColor(vec2 w,float y,vec3 tintL,vec3 tintD,vec4 splat,vec2 coast,float up,float water){
  vec2 meadow=meadowField(w);
  float mid=vnoise(w*1.30+3.0),fine=vnoise(w*5.2),broad=vnoise(w*.085+13.0);
  float patchTone=smoothstep(.14,.86,meadow.x*.70+broad*.30);
  vec3 grass=mix(tintD*.88,tintL*1.03,patchTone);
  grass=mix(grass,${rgb(p.grassOchre)},smoothstep(.55,.78,vnoise(w*.47+37.0))*.17);
  grass=mix(grass,grass*1.12,paintDaubs(w,1.5)*.22);
  // Fine tapered blades with curved tips, jittered roots and grouped density.
  vec2 cell=floor(w*2.25),q=fract(w*2.25)-.5;
  q-=(vec2(hash12(cell+13.2),hash12(cell+37.7))-.5)*.60;
  float seed=hash12(cell),angle=(seed-.5)*1.7;
  q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
  float tufts=0.0;
  for(int b=0;b<4;b++){
    float side=float(b)-1.5,dy=q.y+.23-abs(side)*.035,t=dy/.43;
    float curve=side*(dy*.16+dy*dy*.72),width=.034*max(0.0,1.0-t);
    float d=abs(q.x-side*.077-curve),aa=max(fwidth(d),.005);
    float blade=(1.0-smoothstep(width-aa,width+aa,d))*step(0.0,t)*(1.0-step(1.0,t));
    tufts=max(tufts,blade);
  }
  float planted=smoothstep(.12,.65,meadow.x)*step(.24,seed);
  vec3 bladeColor=seed>.49?grass*1.24+${rgb(p.grassOchre)}*.04:grass*.77;
  grass=mix(grass,bladeColor,tufts*planted*.78);
  grass*=.99+(fine-.5)*.025;
  vec3 earth=paintedEarth(w,0.0);
  // Irregular open soil islands are part of the painted terrain, not separate overlay quads.
  float soil=meadow.y*.66+smoothstep(.28,.84,splat.a)*.74;
  vec3 col=mix(grass,earth,clamp(soil,0.0,.92));
  float roadEdge=splat.r+(mid-.5)*.17+(fine-.5)*.04;
  col=mix(col,earth,smoothstep(.18,.83,roadEdge));
  if(splat.b>.05){
    float damp=1.0-smoothstep(water+.12,water+1.15,y);
    vec3 bank=paintedEarth(w,damp*.78);
    bank=mix(bank,grass*.78,smoothstep(.43,.73,vnoise(w*.42+51.0))*(1.0-damp)*.23);
    col=mix(col,bank,smoothstep(.22,.80,splat.b));
  }
  if(splat.g>.05)col=mix(col,paintedPaving(w,grass,1.0),smoothstep(.17,.86,splat.g+(mid-.5)*.07));
  // Broad cut faces and restrained chips preserve the terrain's real slope silhouette.
  if(up<.85){
    float strata=vnoise(vec2(w.x*.21+w.y*.19,y*2.7));
    vec3 rock=mix(${rgb(p.rockShadow)},${rgb(p.rockLight)},smoothstep(.30,.63,strata));
    rock=mix(rock,rock*1.12,paintDaubs(w,2.7)*.20);
    col=mix(col,rock,1.0-smoothstep(.68,.82,up+(fine-.5)*.025));
  }
  if(coast.x>.01){
  vec3 sand=mix(${rgb(p.sandShadow)},${rgb(p.sandLight)},smoothstep(.17,.83,broad+(mid-.5)*.19));
  sand=mix(sand,sand*1.08,paintDaubs(w,3.1)*.24);
  // Very shallow wind-brushed marks: curved, discontinuous, warm instead of glittery.
  float ripple=sin(w.y*11.0+vnoise(w*.8)*4.8+w.x*.33);
  sand*=1.0-.045*smoothstep(.74,.98,ripple)*smoothstep(.45,.69,vnoise(w*1.8));
  sand=mix(sand,${rgb(p.sandWet)},smoothstep(-5.5,-.2,coast.y)*.46);
  col=mix(col,sand,coast.x);
  }
  return col;
}
float groundCloud(vec2 w,float time){return 1.0-.045*smoothstep(.55,.72,fbm3(w*.012+vec2(time*.012,time*.006)));}
`;
