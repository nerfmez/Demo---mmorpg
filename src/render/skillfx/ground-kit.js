// Ground and rock pieces shared by the big impacts (Meteor, Sky Shatter): a jittered rock shape and
// the round sunken crater the owner asked for instead of ground cracks (shaded in the game's three toon
// steps from a height field). Placed on the terrain with conformPlane.
import * as THREE from 'three';
import { NOISE } from './fx-common.js';

/** A lumpy rock, radius about 1 (not shared: each caller keeps its own). */
export function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position; let a = seed;
  const r = () => ((a = (a * 9301 + 49297) % 233280) / 233280), o = [r() * 6, r() * 6, r() * 6];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const f = 0.86 + 0.16 * Math.sin(v.x * 2.3 + o[0]) * Math.cos(v.y * 2.1 + o[1]) + 0.08 * Math.sin(v.z * 3.7 + o[2]);
    p.setXYZ(i, v.x * f * 1.05, v.y * f * 0.88, v.z * f);
  }
  g.computeVertexNormals(); return g;
}

/** A jagged stone spike: a five-sided point, base at y 0 and tip at y 1 (radius about 1 at the base),
 *  its corners jittered so no two match. */
export function spikeGeometry(seed) {
  let a = seed; const r = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  const g = new THREE.ConeGeometry(1, 1, 5, 2, false); g.translate(0, 0.5, 0);
  const p = g.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    if (!seen.has(k)) seen.set(k, [(r() - 0.5) * 0.35, (r() - 0.5) * 0.1, (r() - 0.5) * 0.35]);
    const j = seen.get(k), y = p.getY(i);
    p.setXYZ(i, p.getX(i) * (1 + j[0]) + (y > 0.99 ? (r() - 0.5) * 0.2 : 0), y + (y > 0.01 && y < 0.99 ? j[1] : 0), p.getZ(i) * (1 + j[2]));
  }
  g.computeVertexNormals(); return g;
}
export const DECAL_VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
// the crater, a decal on the ground (1 = the bowl's lip; the plane spans 1.7): shaded in the game's
// three toon steps from a height field (a sunken bowl, a raised broken lip), lit by the sun; soot
// round it; a molten floor that cools (uGlow); fading out (uA)
export const CRATER_FS = `varying vec2 vP; uniform float uA; uniform float uGlow; uniform float uSeed;` + NOISE + `
  float lipR(vec2 p){ float an = atan(p.y, p.x); return 1.0 + 0.09*(fbm(vec2(cos(an), sin(an))*2.0 + uSeed) - 0.5); }
  float H(vec2 p){
    float u = length(p)/lipR(p);
    float h = u < 1.0 ? -0.5*(1.0 - u*u) : 0.0;
    h += 0.2*exp(-pow((u - 1.0)/0.14, 2.0))*(0.75 + 0.5*fbm(p*3.0 + uSeed));
    return h + 0.05*(fbm(p*4.5 + uSeed*1.3) - 0.5); }
  void main(){
    vec2 p = vP*1.7; float r = length(p), u = r/lipR(p);
    float soot = (1.0 - smoothstep(1.1, 1.65, u))*(0.5 + 0.5*fbm(p*2.3 + uSeed));
    if (u > 1.65 || (u > 1.2 && soot < 0.12)) discard;
    float e = 0.02;
    vec3 N = normalize(vec3(-(H(p + vec2(e, 0.0)) - H(p - vec2(e, 0.0)))/(2.0*e), -(H(p + vec2(0.0, e)) - H(p - vec2(0.0, e)))/(2.0*e), 1.0));
    float l = dot(N, normalize(vec3(-0.33, -0.49, 0.82)));            // the sun, in this plane's frame
    vec3 c = l > 0.9 ? vec3(0.62, 0.48, 0.34) : (l > 0.62 ? vec3(0.47, 0.35, 0.25) : vec3(0.3, 0.21, 0.16));
    if (u < 1.0) c *= mix(0.62, 1.0, smoothstep(0.3, 1.0, u));         // scorched inside
    float a = 1.0;
    if (u > 1.2) { c = vec3(0.17, 0.13, 0.11); a = 0.55*soot; }
    else if (u > 1.08) a = 1.0 - smoothstep(1.08, 1.2, u)*(1.0 - 0.55*soot);
    float m = (1.0 - smoothstep(0.15, 0.55, u))*smoothstep(0.4, 0.62, fbm(p*3.0 + uSeed*2.0) + 0.25*(1.0 - u));
    c = mix(c, mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.82, 0.38), smoothstep(0.6, 0.9, m)), clamp(m*1.6, 0.0, 1.0)*uGlow);
    gl_FragColor = vec4(c, a*uA); }`;

/** A crater decal (a ground plane; scale it to 1.7 x 2 x the lip radius, then conformPlane). Set uA
 *  (fade), uGlow (a molten floor, 0 for none). */
export function craterMesh(scene, seed = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 16), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uGlow: { value: 0 }, uSeed: { value: seed } }, vertexShader: DECAL_VS, fragmentShader: CRATER_FS, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m); return m;
}
