// Shader patches shared by environment materials: wind sway, inverted-hull outline push and
// the see-through dither (props in front of the hero dissolve). One place composes them so
// fill meshes and their outline hulls move identically.
import * as THREE from 'three';
import { seeUniforms } from './toon.js';

export const timeUniform = { value: 0 };

/**
 * Patch a material in place.
 * @param {THREE.Material} material
 * @param {{wind?:number, windBase?:number, outline?:number, see?:boolean}} o
 *   wind: sway amplitude (metres per metre of height); windBase: height offset where sway starts
 *   outline: push along normals (for back-face hull materials); see: dither in front of the hero
 */
export function patchMaterial(material, o = {}) {
  const wind = o.wind || 0;
  const outline = o.outline || 0;
  const see = !!o.see;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    if (wind) {
      shader.uniforms.uWindAmp = { value: wind };
      shader.uniforms.uWindBase = { value: o.windBase || 0 };
    }
    if (outline) shader.uniforms.outlineWidth = { value: outline };
    if (see) Object.assign(shader.uniforms, seeUniforms);
    let vs = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
${wind ? 'uniform float uWindAmp; uniform float uWindBase;' : ''}
${outline ? 'uniform float outlineWidth;' : ''}`
    );
    let body = '';
    if (outline) body += 'transformed += normalize(normal) * outlineWidth;\n';
    if (wind)
      body += `{
  #ifdef USE_INSTANCING
    vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #else
    vec3 iPos = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
  #endif
  float ph = uTime * 1.55 + iPos.x * 0.31 + iPos.z * 0.23;
  float gust = 0.65 + 0.35 * sin(uTime * 0.37 + iPos.x * 0.05);
  float k = max(0.0, transformed.y + uWindBase) * uWindAmp * gust;
  transformed.x += sin(ph) * k;
  transformed.z += cos(ph * 0.83 + 1.3) * k * 0.6;
}\n`;
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
    shader.vertexShader = vs;
    if (see) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uSeeCenter; uniform float uSeeRadius; uniform float uSeeDepth;')
        .replace(
          'void main() {',
          `void main() {
  {
    float sd = distance(gl_FragCoord.xy, uSeeCenter);
    if (sd < uSeeRadius && gl_FragCoord.z < uSeeDepth) {
      vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
      float bayer = fract((q.x * 4.0 + mod(q.x + q.y * 2.0, 4.0) * 3.0 + q.y) / 16.0 * 1.618 + q.y * 0.25);
      float kk = smoothstep(uSeeRadius, uSeeRadius * 0.55, sd);
      if (bayer < kk * 0.8) discard;
    }
  }`
        );
    }
  };
  material.customProgramCacheKey = () => `patch|w${wind ? 1 : 0}|o${outline ? 1 : 0}|s${see ? 1 : 0}|${material.type}`;
  material.needsUpdate = true;
  return material;
}

/** Back-face outline hull material with the same patches as its fill. */
export function hullMaterial(color, width, o = {}) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide });
  return patchMaterial(m, { ...o, outline: width });
}
