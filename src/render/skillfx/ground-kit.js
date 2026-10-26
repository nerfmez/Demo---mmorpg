// Ground and rock pieces shared by the big impacts (Meteor, Earth Heave): a jittered rock shape and
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

/** A broken ground slab: a thick blunt block with chamfered edges, top face up (y 0 .. 1, x and z
 *  -1 .. 1), its corners jittered so no two match. */
export function slabGeometry(seed) {
  let a = seed; const r = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  const g = new THREE.BoxGeometry(2, 1, 2, 2, 1, 2); g.translate(0, 0.5, 0);
  const p = g.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
    if (!seen.has(k)) seen.set(k, [(r() - 0.5) * 0.3, (r() - 0.5) * 0.25, (r() - 0.5) * 0.3]);
    const j = seen.get(k), top = y > 0.5, corner = Math.abs(x) > 0.9 && Math.abs(z) > 0.9;
    const pull = top ? (corner ? 0.72 : 0.86) : 1;                       // chamfer the top edges
    p.setXYZ(i, x * pull * (1 + j[0]), y + (top ? j[1] : 0), z * pull * (1 + j[2]));
  }
  const flat = g.toNonIndexed(); flat.computeVertexNormals(); g.dispose(); return flat;   // flat faces: chipped stone
}
// stone, lit in the game's three toon steps
export const STONE_VS = `varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`;
export const STONE_FS = `varying vec3 vN; uniform float uA;
  void main(){ float l = dot(normalize(vN), normalize(vec3(-0.33, 0.82, 0.49)));
    vec3 c = l > 0.55 ? vec3(0.74, 0.66, 0.55) : (l > 0.1 ? vec3(0.55, 0.48, 0.4) : vec3(0.36, 0.31, 0.27));
    gl_FragColor = vec4(c, uA); }`;
// dust: a soft puff that swells and thins, two warm tones (Firebolt's puff shape in dust colours)
export const DUST_FS = `varying vec2 vUv; uniform float uT; uniform float uSeed;` + NOISE + `
  void main(){ float r = length(vUv);
    float n = fbm(vUv*2.0 + uSeed + vec2(0.0, -uT*1.2));
    float body = n*1.15 - r*0.95 - uT*0.7;
    if (body < 0.04) discard;
    vec3 c = body > 0.24 ? vec3(0.86, 0.78, 0.64) : vec3(0.66, 0.57, 0.45);
    gl_FragColor = vec4(c, 0.85*(1.0 - uT*0.5)); }`;

export const DECAL_VS = `varying vec2 vP; void main(){ vP=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
// the crater, a decal on the ground (1 = the bowl's lip; the plane spans 1.7): shaded in the game's
// three toon steps from a height field (a sunken bowl, a raised broken lip), lit by the sun; soot
// round it; a molten floor that cools (uGlow); fading out (uA). With uArc > 0 (half the arc, radians)
// the pit is a fan instead (Earth Heave's cone): the plane's centre is its apex, uDir its middle (in
// the plane's 2D frame), uIn where it starts (a fraction of the lip radius).
export const CRATER_FS = `varying vec2 vP; uniform float uA; uniform float uGlow; uniform float uSeed; uniform float uArc; uniform vec2 uDir; uniform float uIn;` + NOISE + `
  float lipR(vec2 p){ float an = atan(p.y, p.x); return 1.0 + 0.09*(fbm(vec2(cos(an), sin(an))*2.0 + uSeed) - 0.5); }
  // 0 at the bowl's middle, 1 at its lip: by the distance (a round pit), or a rounded fan
  float U(vec2 p){
    float r = length(p);
    if (uArc <= 0.0) return r/lipR(p);
    float ang = acos(clamp(dot(p/max(r, 1e-4), uDir), -1.0, 1.0))/uArc;
    float ur = abs(r - (1.0 + uIn)*0.5)/((1.0 - uIn)*0.5);
    return pow(pow(ur, 8.0) + pow(ang, 8.0), 0.125)/lipR(p); } // nearly sharp corners: a pie slice
  float H(vec2 p){
    float u = U(p);
    float h = u < 1.0 ? -0.5*(1.0 - u*u) : 0.0;
    h += 0.2*exp(-pow((u - 1.0)/0.14, 2.0))*(0.75 + 0.5*fbm(p*3.0 + uSeed));
    return h + 0.05*(fbm(p*4.5 + uSeed*1.3) - 0.5); }
  void main(){
    vec2 p = vP*1.7; float u = U(p), far = uArc > 0.0 ? 1.35 : 1.65; // a fan's soot stays near its edge
    float soot = (1.0 - smoothstep(1.1, far, u))*(0.5 + 0.5*fbm(p*2.3 + uSeed));
    if (u > far || (u > 1.2 && soot < 0.12)) discard;
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
 *  (fade), uGlow (a molten floor, 0 for none); for a fan-shaped pit craterFan(). */
export function craterMesh(scene, seed = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 16, 16), new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uGlow: { value: 0 }, uSeed: { value: seed }, uArc: { value: 0 }, uDir: { value: new THREE.Vector2(0, 1) }, uIn: { value: 0.15 } }, vertexShader: DECAL_VS, fragmentShader: CRATER_FS, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.visible = false; scene.add(m); return m;
}
/** Make a crater mesh a fan-shaped pit: its apex at the plane's centre, opening along the world facing
 *  `angle` over `arcDeg` degrees from `inner` (a fraction of the lip radius) out to the lip. */
export function craterFan(m, angle, arcDeg, inner = 0.15) {
  const u = m.material.uniforms;
  u.uArc.value = (arcDeg * Math.PI) / 360; u.uIn.value = inner;
  u.uDir.value.set(Math.sin(angle), -Math.cos(angle)); // the plane lies with its +Y toward world -Z
}
