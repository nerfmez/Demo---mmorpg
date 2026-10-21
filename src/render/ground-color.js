// Shared painterly surfaces in metres, linear RGB, with lighting/shadows supplied by Three.
import * as THREE from 'three';
import art from '../../data/art.json' with {type:'json'};
import { NOISE_GLSL, MEADOW_FIELD_GLSL, GROUND_FIELD_GLSL } from './ground-field.js';
export { NOISE_GLSL } from './ground-field.js';
const rgb=hex=>{const c=new THREE.Color(hex);return `vec3(${[c.r,c.g,c.b].map(v=>v.toFixed(5)).join(',')})`;};
const p=art.ground.palette;
// how strongly the brush atlas's leaf strokes darken/lighten the ground (kept low: the ground is
// mottled lawn, the standing clumps in grass.js are the grass)
const blade=art.grass;
const f=(n)=>Number(n).toFixed(3);
// All ground types share the same brush scale and warm, restrained highlight colours.
// A shared mipmapped brush atlas and analytic marks stay on real ground/deck surfaces.
export const SURFACE_PAINT_GLSL=NOISE_GLSL+/* glsl */ `
// Anti-aliasing width; a vertex-stage include defines it as 0 (one colour per vertex).
#ifndef GROUND_AA
#define GROUND_AA(x) fwidth(x)
#endif
uniform sampler2D uGroundBrush;
// Surface pixels use their footprint; point bakes supply an explicit level because
// one disconnected point per clump has no useful surface derivatives.
#ifndef GROUND_BRUSH_SAMPLE
#define GROUND_BRUSH_SAMPLE(uv) texture2D(uGroundBrush,uv)
#endif
vec3 groundBrush(vec2 w){return GROUND_BRUSH_SAMPLE(w/12.0).rgb;}
float paintDaubs(vec2 w,float scale){
  vec2 cell=floor(w*scale),q=fract(w*scale)-.5;
  q-=(vec2(hash12(cell+13.2),hash12(cell+37.7))-.5)*.60;
  float seed=hash12(cell),angle=(seed-.5)*2.5;
  q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
  float d=length(q*vec2(1.0,2.4));
  float aa=max(GROUND_AA(d),.012);
  return (1.0-smoothstep(.15-aa,.15+aa,d))*step(.36,seed);
}
vec3 paintedEarth(vec2 w,float wet){
  float broad=vnoise(w*.24+9.0),brush=vnoise(w*1.65);
  vec3 earth=mix(${rgb(p.earthShadow)},${rgb(p.earthLight)},smoothstep(.20,.79,broad+(brush-.5)*.16));
  float strokes=paintDaubs(w,2.1);
  earth=mix(earth,earth*1.12+${rgb(p.dust)}*.07,strokes*.35);
  earth*=.88+groundBrush(w).r*.24;
  vec2 cell=floor(w*1.6),q=fract(w*1.6)-.5;
  q-=(vec2(hash12(cell+7.0),hash12(cell+19.0))-.5)*.58;
  float seed=hash12(cell),d=length(q*vec2(1.1,1.6));
  float pebble=(1.0-smoothstep(.06,.09,d))*step(.90,seed);
  vec3 pebbleCol=mix(${rgb(p.stoneShadow)},${rgb(p.stoneLight)},step(.005,q.y));
  earth=mix(earth,pebbleCol,pebble*.8);
  return mix(earth,${rgb(p.mud)}*(.9+brush*.18),wet);
}
// Scattered stones in jittered cells: 1 on a stone, with a lit upper half (cel-shaded pebble).
float gravel(vec2 w,float scale,float keep,float size){
  vec2 cell=floor(w*scale),q=fract(w*scale)-.5;
  q-=(vec2(hash12(cell+3.1),hash12(cell+8.7))-.5)*.6;
  float seed=hash12(cell+21.0),d=length(q*vec2(1.0,1.35+seed));
  float aa=max(GROUND_AA(d),.01);
  return (1.0-smoothstep(size-aa,size+aa,d))*step(keep,seed);
}
// A trodden dirt road: dusty worn centre, darker trodden sides, gravel at two sizes, damp and dry
// patches and fine grit, so it reads as real ground rather than one flat paint stroke.
vec3 roadEarth(vec2 w,vec3 earth,float centreTone){
  vec3 e=mix(earth*.92,earth*1.07+${rgb(p.dust)}*.05,centreTone);
  float patches=vnoise(w*.75+23.0);
  e=mix(e*.90,e,smoothstep(.25,.55,patches));
  e=mix(e,e*1.06+${rgb(p.dust)}*.04,smoothstep(.62,.85,patches));
  float big=gravel(w,2.6,.74,.11),small=gravel(w*1.0+17.0,6.0,.62,.13);
  e=mix(e,mix(${rgb(p.stoneShadow)},${rgb(p.stoneLight)},.55),big*.75);
  e=mix(e,e*.78,small*.55);
  float grit=hash12(floor(w*13.0));
  e*=1.0-.08*step(.88,grit)+.06*step(grit,.07);
  return e;
}
vec3 paintedPaving(vec2 w,vec3 moss,float weather){
  // Unequal staggered courses, rounded worn corners, quieter mortar and chipped edges.
  vec2 warp=vec2(vnoise(w*1.9+11.0),vnoise(w*1.9+47.0))-.5;
  float height=.78,course=floor(w.y/height);
  vec2 tile=vec2(w.x*(1.05+hash12(vec2(course,19.0))*.20)+hash12(vec2(course,7.0))*.9,w.y/height)+warp*.055;
  vec2 cell=floor(tile),q=fract(tile)-.5;
  float seed=hash12(cell),radius=.075+seed*.04;
  vec2 a=abs(q)-vec2(.445-radius+(seed-.5)*.036,.424-radius+(hash12(cell+21.0)-.5)*.028);
  float distance=length(max(a,0.0))+min(max(a.x,a.y),0.0)-radius;
  distance+=(vnoise(w*7.0)-.5)*.035+(vnoise(w*19.0)-.5)*.012;
  float aa=max(GROUND_AA(distance),.005),stoneMask=1.0-smoothstep(-aa,aa,distance);
  float edge=1.0-smoothstep(-.055,-.012,distance);
  vec3 stone=mix(${rgb(p.stoneShadow)},${rgb(p.stoneLight)},seed*.75+.12);
  stone*=.90+groundBrush(w).r*.18+(vnoise(w*2.6)-.5)*.06;
  float face=paintDaubs(w,3.7);
  stone=mix(stone,stone*1.08+vec3(.012),face*.28);
  // A soft upper lip, without a bright square drawn around every slab.
  stone+=${rgb(p.dust)}*.11*(1.0-edge)*smoothstep(-.2,.38,q.y);
  stone*=.87+.13*edge;
  vec3 mortar=${rgb(p.mortar)};
  mortar=mix(mortar,moss*.79,smoothstep(.53,.73,vnoise(w*.53+72.0))*weather*.65);
  // a few slabs are sunken and darker, a few are gone and leave packed earth with moss
  float lost=hash12(cell+71.0);
  stone*=1.0-.13*step(lost,${f(art.ground.pavingSunken)});
  vec3 hole=mix(mix(${rgb(p.earthShadow)},mortar,.45)*.9,moss*.85,smoothstep(.4,.7,vnoise(w*3.1+4.0))*weather*.6);
  stoneMask*=step(${f(art.ground.pavingMissing)},abs(lost-.5)*2.0);
  return mix(mix(mortar,hole,step(abs(lost-.5)*2.0,${f(art.ground.pavingMissing)})*smoothstep(.0,-.06,distance)),stone,stoneMask);
}
vec3 paintedTimber(vec2 w){
  float board=floor(w.y/.32),offset=hash12(vec2(board,8.3));
  float along=w.x+offset*17.0;
  float edge=abs(fract(w.y/.32)-.5);
  float aa=max(GROUND_AA(edge),.009);
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
export const GROUND_COLOR_GLSL=SURFACE_PAINT_GLSL+MEADOW_FIELD_GLSL+GROUND_FIELD_GLSL+/* glsl */ `
// The meadow's own green at a point, before soil, roads or brush strokes: grass blades take this
// colour above their root, so a clump standing on a dirt edge is still green, not dirt-brown.
// In town (town=1) the lawn is kept: an even, mown green with only a soft wash of variation.
// F0/F2: the baked low-frequency fields at this point (ground-field.js).
vec3 lawnTone(vec4 F0,vec4 F2,vec3 tintL,vec3 tintD,float town){
  float patchTone=smoothstep(.14,.86,F0.x*.70+F0.z*.30);
  patchTone=mix(patchTone,.58+(F2.x-.5)*.22,town*.8);
  vec3 grass=mix(tintD*.88,tintL*1.03,patchTone);
  return mix(grass,${rgb(p.grassOchre)},smoothstep(.55,.78,F0.w)*.17*(1.0-town*.7));
}
vec3 lawnTone(vec2 w,vec3 tintL,vec3 tintD,float town){
  vec2 uv=fieldUV(w);return lawnTone(texture2D(uField0,uv),texture2D(uField2,uv),tintL,tintD,town);
}
vec3 groundColor(vec2 w,float y,vec3 tintL,vec3 tintD,vec4 splat,vec2 coast,float up,float water,float town){
  vec2 fuv=fieldUV(w);
  vec4 F0=texture2D(uField0,fuv),F1=texture2D(uField1,fuv),F2=texture2D(uField2,fuv);
  w+=uNoiseOffset; // procedural paint in world (atlas) metres: continuous across open seams
  vec2 meadow=F0.xy;
  float mid=vnoise(w*1.30+3.0),fine=vnoise(w*5.2),broad=F0.z;
  vec3 grass=lawnTone(F0,F2,tintL,tintD,town);
  vec3 brush=groundBrush(w);
  grass*=.88+brush.r*.26;
  float planted=(.32+smoothstep(.12,.65,meadow.x)*.68)*(1.0-town*.45);
  grass=mix(grass,grass*.76,brush.g*planted*${f(blade.groundStrokeShade)});
  grass=mix(grass,grass*1.27+${rgb(p.grassOchre)}*.05,brush.b*planted*${f(blade.groundStrokeLight)});
  grass*=.99+(fine-.5)*.025;
  // Irregular open soil islands are part of the painted terrain, not separate overlay quads.
  float soil=clamp(meadow.y*.30*(1.0-town)+smoothstep(.48,.90,splat.a)*.40,0.0,.68);
  // bare-soil patches get the same ragged, stubble-broken edge and dirt texture as the roads
  float bare=smoothstep(.55,.68,splat.a+(F1.x-.5)*.42+(fine-.5)*.12-max(brush.g,brush.b)*.22);
  // a ragged, natural road edge: noise at three scales wobbles the border and the width, and
  // grass stubble from the brush atlas pokes over it; the transition itself is short, like a
  // trodden path cut into a lawn rather than one soft brush stroke
  float wob=(F1.y-.5)*${f(art.ground.roadEdgeWobble)}+(mid-.5)*.24+(vnoise(w*2.7+5.0)-.5)*.14
    +(F1.z-.5)*${f(art.ground.roadWidthWobble)};
  // town lanes are laid out, so their edges only wander gently and stay clear of tufts
  wob*=1.0-town*.7;
  float tufts=max(brush.g,brush.b)*smoothstep(.12,.55,splat.r)*(1.0-smoothstep(.75,1.0,splat.r))*(1.0-town);
  float roadEdge=splat.r+wob-tufts*${f(art.ground.roadEdgeTufts)};
  float onRoad=smoothstep(.40,.54,roadEdge);
  // earth and its textures are only painted where soil, bare ground or a road actually shows
  vec3 col=grass;
  if(soil+bare+onRoad>.002){
    vec3 earth=paintedEarth(w,0.0);
    col=mix(grass,earth,soil);
    if(bare>.002||onRoad>.002){
      // roadEarth is affine in its centre tone. Combine the two layer weights
      // first: one unchanged procedural road paint, with the same final colour.
      float b=bare>.002?bare:0.0,r=onRoad>.002?onRoad:0.0;
      float bareWeight=(1.0-r)*b*.97,roadWeight=bareWeight+r;
      float centreTone=(bareWeight*smoothstep(.55,.98,splat.a)+r*smoothstep(.55,.98,splat.r))/roadWeight;
      col=col*((1.0-r)*(1.0-b))+roadEarth(w,earth,centreTone)*roadWeight;
    }
  }
  // darker soil just inside the border, under the grass overhang
  col*=1.0-.12*onRoad*(1.0-smoothstep(.54,.78,roadEdge));
  if(splat.b>.05){
    float damp=1.0-smoothstep(water+.12,water+1.15,y);
    vec3 bank=paintedEarth(w,damp*.78);
    bank=mix(bank,grass*.78,smoothstep(.43,.73,F2.y)*(1.0-damp)*.23);
    col=mix(col,bank,smoothstep(.22,.80,splat.b));
  }
  // paving frays into the soil at a wandering border, not along a ruled line
  if(splat.g>.05){
    float pave=splat.g+((F1.w-.5)*${f(art.ground.pavingEdgeWobble)}+(mid-.5)*.22)*(1.0-town*.75)+(fine-.5)*.08*(1.0-town);
    col=mix(col,paintedPaving(w,grass,1.0),smoothstep(.30,.52,pave));
    // town courts end in a kerb of long setts, not a frayed edge
    vec2 kc=floor(w*vec2(1.7,1.9));
    vec3 kerb=mix(${rgb(p.stoneShadow)}*.86,${rgb(p.stoneLight)},.25+hash12(kc)*.25)*(.92+groundBrush(w).r*.1);
    float band=smoothstep(.25,.28,pave)*(1.0-smoothstep(.40,.43,pave));
    col=mix(col,col*.82,smoothstep(.20,.25,pave)*(1.0-smoothstep(.25,.28,pave))*town); // soft shadow line outside the kerb
    col=mix(col,kerb,band*town*${f(art.ground.townKerb)});
  }
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
  sand*=.94+brush.r*.12;
  // Very shallow wind-brushed marks: curved, discontinuous, warm instead of glittery.
  float ripple=sin(w.y*11.0+vnoise(w*.8)*4.8+w.x*.33);
  sand*=1.0-.045*smoothstep(.74,.98,ripple)*smoothstep(.45,.69,vnoise(w*1.8));
  // sunny grains: sparse bright specks and a few darker ones, so the beach glitters softly
  float speck=gravel(w*1.0+41.0,7.5,.93,.10),dull=gravel(w*1.0+7.0,6.0,.95,.09);
  sand*=1.0+.22*speck-.08*dull;
  // a warm pale band up the dry beach and a cool, glossy wet band at the water's edge
  sand=mix(sand,sand*1.05+vec3(.02,.015,0.0),smoothstep(3.0,8.0,-coast.y)*.5);
  sand=mix(sand,${rgb(p.sandWet)},smoothstep(-5.5,-.2,coast.y)*.46);
  // back-beach: sandy soil with thin, sun-dried grass patches, then open sand; a wandering
  // edge so the meadow gives way gradually instead of stopping at a line
  float shoreNoise=(F2.z-.5)*.30+(fine-.5)*.10;
  float sandW=smoothstep(.60,.80,coast.x+shoreNoise);
  float soilW=smoothstep(.04,.42,coast.x+shoreNoise*1.4);
  vec3 dry=mix(grass*.95,${rgb(p.grassOchre)},.45);
  vec3 sandySoil=mix(sand*.97,dry,smoothstep(.45,.75,F2.w)*(1.0-smoothstep(.2,.6,coast.x))*.85);
  sandySoil*=.96+brush.r*.08;
  col=mix(col,sandySoil,soilW);
  col=mix(col,sand,sandW);
  }
  return col;
}
float groundCloud(vec2 w,float time){return 1.0-.045*smoothstep(.55,.72,fbm3(w*.012+vec2(time*.012,time*.006)));}
`;
// Just the drifting cloud shade, for shaders that do not need the whole ground painter.
export const GROUND_CLOUD_GLSL=NOISE_GLSL+/* glsl */ `
float groundCloud(vec2 w,float time){return 1.0-.045*smoothstep(.55,.72,fbm3(w*.012+vec2(time*.012,time*.006)));}
`;
