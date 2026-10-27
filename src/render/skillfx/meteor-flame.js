// Meteor's fire, made the way the owner's best effects are made (2026-10-26: Firebolt and Flame
// Stream set the bar): nested see-through shells whose fire is cut out of domain-warped noise that is
// carried along the flow, hot to cool in Firebolt's heat ramp (V5_FIELD, the same colours), glowing
// above the tone mapping, moving smoothly every frame. Our own shapes: a comet that wraps the rock
// and an explosion dome; the dome's cut-off rises with its age so the fire tears into tongues and
// burns away while it cools.
import * as THREE from 'three';
import { V5_FIELD } from '../fireball-v5.js';

export const FIRE_COLORS = { rim: '#f28328', body: '#ffb43d', hot: '#fff0a0', core: '#ffffff' }; // Firebolt's

const VS = `varying vec3 vObject; varying vec3 vNormal; varying vec3 vEye;
  void main(){ vObject = position; vec4 mv = modelViewMatrix*vec4(position, 1.0);
    vNormal = normalize(normalMatrix*normal); vEye = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
// uMode 0: a comet, object +x forward, the flow carries the fire back along -x (uFront..-uLen).
// uMode 1: a dome, radius 1, the flow carries the fire up and out.
const FS = `uniform float uTime, uLayer, uFilled, uAlpha, uMode, uFlow, uLen, uFront, uCut, uCool, uSeed;
  varying vec3 vObject; varying vec3 vNormal; varying vec3 vEye;` + V5_FIELD + `
  void main(){
    float l = uLayer, t = uTime; bool filled = uFilled > 0.5;
    vec3 a; float along;
    if (uMode < 0.5) {
      a = rotateField(vObject*vec3(0.6 + 0.17*l, 1.9 - 0.18*l, 1.9 - 0.18*l), 0.6 + 0.7*l + uSeed) + vec3(uFlow*t, 0.7*l, uSeed*3.0);
      along = clamp((vObject.x + uLen)/(uLen + uFront), 0.0, 1.0);          // 0 tail .. 1 front
    } else {
      float r = length(vObject);
      // stretched up, so the fire is cut into rising tongues; the top tears first
      a = rotateField(vObject*vec3(2.1 - 0.2*l, 0.8 + 0.15*l, 2.1 - 0.2*l), 0.9*l + uSeed) - vec3(0.0, uFlow*t*2.0, 0.0);
      along = clamp(1.0 - max(vObject.y, 0.0)*0.85, 0.0, 1.0);
    }
    float w = 6.73*l + 0.34*t;
    vec3 warp = vec3(fbm(a*0.95, w, 2.0), fbm(a*0.95 + vec3(19,7,31), w, 2.0), fbm(a*0.95 + vec3(47,23,11), w, 2.0));
    float n = fbm(a + 0.75*(warp - 0.5), 3.37*l + 0.46*t, 0.65);
    float threshold = mix(0.67 + 0.01*l, 0.41 + 0.045*l, along) + uCut;
    float coverage = filled ? 1.0 : clamp((n - threshold + 0.012)/0.034, 0.0, 1.0);
    float heat = mix(0.44 + 0.065*l, 0.62 + 0.12*l, along) - uCool;
    if (filled) heat += 0.19*abs(dot(normalize(vNormal), normalize(vEye)));
    float strength = filled ? 1.4 : mix(1.35, 1.75, l);
    float alpha = coverage*uAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(heatColor(heat, filled)*strength, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

let colors = null;
export function flameMaterial(mode, layer, filled = false) {
  if (!colors) colors = { uRim: { value: new THREE.Color(FIRE_COLORS.rim) }, uBody: { value: new THREE.Color(FIRE_COLORS.body) }, uHot: { value: new THREE.Color(FIRE_COLORS.hot) }, uCore: { value: new THREE.Color(FIRE_COLORS.core) } };
  return new THREE.ShaderMaterial({
    uniforms: { ...colors, uTime: { value: 0 }, uLayer: { value: layer }, uFilled: { value: filled ? 1 : 0 }, uAlpha: { value: 1 }, uMode: { value: mode },
      uFlow: { value: mode ? 0.9 : 3.2 }, uLen: { value: 4 }, uFront: { value: 1 }, uCut: { value: 0 }, uCool: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, forceSinglePass: true,
  });
}

const cache = new Map();
/** The comet shell round the rock: a round front (radius `head`) at +x, a tail tapering to -len with
 *  a slow sway so it is never a clean cone. Layer 1 sits a little inside layer 0. */
export function cometShell(layer, head = 1, len = 4) {
  const key = `c${layer}:${head}:${len}`; if (cache.has(key)) return cache.get(key);
  const axial = 64, radial = 32, p = [], idx = [], k = 1 - 0.14 * layer;
  for (let j = 0; j <= axial; j++) {
    const x0 = head * 0.9 - (head * 0.9 + len) * j / axial, rear = Math.max(0, -x0) / len;
    const r0 = x0 >= 0 ? head * Math.sqrt(Math.max(0, 1 - (x0 / (head * 0.9)) ** 2)) : head * Math.pow(Math.max(0, 1 - rear), 0.7) * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, rear * 3)));
    for (let i = 0; i <= radial; i++) {
      const a = i * Math.PI * 2 / radial, r = r0 * k * (1 + 0.12 * rear * Math.sin(3 * a + 5 * rear + layer));
      p.push(x0, r * Math.cos(a) + 0.18 * rear * head * Math.sin(4 * rear + layer), r * Math.sin(a) + 0.1 * rear * head * Math.sin(7 * rear + layer));
    }
  }
  for (let j = 0; j < axial; j++) for (let i = 0; i < radial; i++) { const a = j * (radial + 1) + i, b = a + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.userData.shared = true; cache.set(key, g); return g;
}
/** A unit dome for the explosion (a sphere; the ground hides its lower half). */
export function domeShell() {
  if (!cache.has('dome')) { const g = new THREE.SphereGeometry(1, 40, 28); g.userData.shared = true; cache.set('dome', g); }
  return cache.get('dome');
}
