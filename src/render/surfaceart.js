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
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n{${kind==='bark'?bark:kind==='rock'?rock:kind==='masonry'?masonry:leaf}}`);
 };
 material.customProgramCacheKey=()=>cache()+'|paint-'+kind+'-1';return material;
}
