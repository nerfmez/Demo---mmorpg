// Painted walking slabs share terrain pigments; actual deck mesh carries every mark.
// Each material is owned by its surface group and freed by disposeObject (Lambert, not cache).
import * as THREE from 'three';
import { SURFACE_PAINT_GLSL } from './ground-color.js';
import { groundBrushUniform } from './ground-brush.js';

export function walkSurfaceMaterial(kind='wood',variant=1,offset=[0,0],crossGrain=false) {
  const material=new THREE.MeshLambertMaterial({color:0xffffff});
  const brush=groundBrushUniform(material);
  material.userData.walkSurface=kind;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uWalkKind={value:{wood:0,paving:1,earth:2}[kind]??0};
    shader.uniforms.uWalkVariant={value:variant};
    shader.uniforms.uWalkOffset={value:new THREE.Vector2(offset[0],offset[1])};
    shader.uniforms.uWalkCross={value:crossGrain?1:0};
    shader.uniforms.uGroundBrush=brush;
    const varying='varying vec3 vWalkPosition,vWalkNormal;';
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${varying}`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>\nvWalkPosition=position;vWalkNormal=normal;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${varying}
      uniform float uWalkKind,uWalkVariant,uWalkCross;uniform vec2 uWalkOffset;
      ${SURFACE_PAINT_GLSL}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p=mix(vWalkPosition.xz,vWalkPosition.zx,uWalkCross);
        // Retain local plank axes on rotated/sheared ramps. Offset changes only grain phase.
        vec2 paint=p+uWalkOffset;
        vec3 pigment;
        if(uWalkKind<.5) pigment=paintedTimber(vec2(paint.x,p.y));
        else if(uWalkKind<1.5) pigment=paintedPaving(paint,vec3(.20,.27,.11),.45);
        else pigment=paintedEarth(paint,0.0);
        diffuseColor.rgb=pigment*uWalkVariant*(.84+.16*abs(vWalkNormal.y));`);
  };
  material.customProgramCacheKey=()=> 'walk-surface-paint-v3';
  return material;
}
