// Small analytical paint marks on real geometry: no large texture downloads or extra passes.
// Compose after wind/hero-occlusion patches so both behaviours remain intact.
import {NOISE_GLSL} from './ground.js';
export function paintSurface(material,kind) {
 const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPaintPos; varying vec3 vPaintNormal;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvPaintPos=position; vPaintNormal=normal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vPaintPos; varying vec3 vPaintNormal;\n${NOISE_GLSL}`);
  const leaf=`
    vec3 p=vPaintPos; float up=vPaintNormal.y;
    float clusters=vnoise(p.xz*4.7+p.y*2.1);
    float leaf=vnoise(p.xz*17.0+p.y*4.0);
    float shade=step(.52,clusters)*.13-step(clusters,.30)*.1;
    diffuseColor.rgb*=.91+shade+max(up,0.0)*.08;
    // Broken brush-shaped leaf groups, not light gradients on a sphere.
    vec2 cell=floor(p.xz*12.0+p.y*2.0), f=fract(p.xz*12.0+p.y*2.0)-.5;
    float mark=(1.0-smoothstep(.26,.40,abs(f.x+f.y*.42)+abs(f.y)*.50))*step(.42,hash12(cell));
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.18+vec3(.012,.017,0.0),mark*.28*step(.24,clusters));
    diffuseColor.rgb*=1.0-step(.79,leaf)*.045;
  `;
  const bark=`
    vec3 p=vPaintPos; float grain=vnoise(vec2(atan(p.z,p.x)*17.0,p.y*1.9));
    float grooves=step(.72,grain); float scar=step(.86,vnoise(p.xy*vec2(8.0,2.0)));
    diffuseColor.rgb*=.92+.12*step(.35,grain)-grooves*.22;
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.28,scar*.34);
  `;
  const rock=`
    vec3 p=vPaintPos; float n=vnoise(p.xz*5.0+p.y*2.0);
    float edge=step(.76,vnoise(p.xy*vec2(4.0,8.0)))*.1;
    diffuseColor.rgb*=.93+step(.48,n)*.10-edge;
    float moss=smoothstep(.38,.73,vPaintNormal.y)*smoothstep(.5,.68,vnoise(p.xz*3.3));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.32,.12),moss*.72);
  `;
  const masonry=`
    vec3 p=vPaintPos;float up=vPaintNormal.y;
    float course=fract(p.y*1.8+vnoise(p.xz*2.0)*.06);
    float seam=(1.0-smoothstep(.025,.065,course))*(1.0-step(.6,up));
    float chips=step(.84,vnoise(p.xy*vec2(4.3,6.8)));
    diffuseColor.rgb*=1.0-seam*.18-chips*.07;
    float moss=smoothstep(.65,.81,vnoise(p.xz*3.1+p.y))*smoothstep(-.2,.7,up);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.26,.34,.15),moss*.55);
  `;
  const crown=`
    vec3 p=vPaintPos;
    // Volumetric paint avoids stretched marks on the sides or a repeating square atlas.
    float clusters=(vnoise(p.xy*5.5)+vnoise(p.yz*5.5+11.0)+vnoise(p.zx*5.5+27.0))/3.0;
    float leaves=(vnoise(p.xy*23.0+7.0)+vnoise(p.yz*23.0+31.0)+vnoise(p.zx*23.0+17.0))/3.0;
    float flecks=smoothstep(.55,.65,leaves)*smoothstep(.43,.60,clusters);
    diffuseColor.rgb*=.88+smoothstep(.32,.65,clusters)*.18+flecks*.13;
  `;
  const plaster=`
    float brush=vnoise(vPaintPos.xy*1.7+vPaintPos.z*.7);
    diffuseColor.rgb*=.975+.04*smoothstep(.25,.75,brush);
  `;
  const timber=`
    vec3 p=vPaintPos;
    float grain=vnoise(vec2((p.x+p.z)*22.0,p.y*.8));
    diffuseColor.rgb*=.96+.06*smoothstep(.2,.7,grain);
    diffuseColor.rgb*=1.0-smoothstep(.77,.84,grain)*.09;
  `;
  const roof=`
    vec3 p=vPaintPos;
    float row=p.y*4.2;
    vec2 tile=vec2(p.x*2.1+mod(floor(row),2.0)*.5,row);
    vec2 f=fract(tile);
    float seam=(1.0-smoothstep(.015,.065,f.y))*.13+(1.0-smoothstep(.01,.045,f.x))*.055;
    diffuseColor.rgb*=.97+hash12(floor(tile))*.06-seam;
  `;
  const studyRock=`
    vec3 p=vPaintPos;
    float broad=vnoise(p.xz*2.2+p.y*.8);
    diffuseColor.rgb*=.92+smoothstep(.25,.72,broad)*.12;
    // Readable planes and broad moss patches rather than fine mottling everywhere.
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.91,.95,1.03),(1.0-smoothstep(-.7,.1,vPaintNormal.y))*.35);
    float moss=smoothstep(.3,.8,vPaintNormal.y)*smoothstep(.58,.75,broad);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.27,.35,.16),moss*.45);
  `;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n{${({bark,rock,masonry,crown,plaster,timber,roof,studyRock})[kind]||leaf}}`);
 };
 material.customProgramCacheKey=()=>cache()+'|paint-'+kind+'-2';return material;
}
