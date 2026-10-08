// Monster strike marks: what a creature hits WITH, drawn where the hit lands. Claws rake three or
// four tapered streaks, jaws snap shut with a row of fangs above and below, a crab's pincer
// closes like shears. Original procedural shapes (signed distances in one camera-facing quad):
// white-hot core, the creature's colour, a dark ink edge so they read on sand and grass alike.
// Tuning (counts, sizes, colours, timing) lives in data/combat-fx.json "monsters".
import * as THREE from 'three';

const quad = new THREE.PlaneGeometry(2, 2);
quad.userData.shared = true;
export const strikeQuad = quad;

const VERT = /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const COMMON = /* glsl */ `
uniform float uT; uniform float uMirror; uniform float uSeed;
uniform vec3 uColor; uniform vec3 uCore; uniform vec3 uInk; uniform vec3 uTip;
uniform float uCount; uniform float uSpacing; uniform float uWidth; uniform float uBend; uniform float uCross;
varying vec2 vP;
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float star(vec2 p, float r){ vec2 q = abs(p); return max(q.x * 0.25 + q.y, q.y * 0.25 + q.x) - r; }
// d < 0 inside; core: 1 near the middle of the shape; ink band outside the edge
vec4 shade(float d, float core, float ink, vec3 body){
  float a = 1.0 - smoothstep(-0.004, 0.006, d - ink);
  vec3 col = mix(uInk, body, smoothstep(0.0, -0.012, d));
  col = mix(col, uCore, core * smoothstep(-0.015, -0.045, d));
  return vec4(col, a);
}`;

// --- claws: tapered crescents drawn from one end to the other, each a little after the last
const CLAW = /* glsl */ `
float streak(vec2 q, float off, float head, out float fresh){
  float L = 1.0;
  float t = q.x / L;
  float yc = off + uBend * (1.0 - t * t);
  float taper = pow(max(0.0, 1.0 - t * t), 0.6);
  float hw = uWidth * taper * (1.0 - 0.45 * smoothstep(0.45, 1.0, uT));
  float d = abs(q.y - yc) - hw;
  d = max(d, abs(t) - 1.0);
  d = max(d, t - head);          // not drawn past the travelling head yet
  fresh = 1.0 - smoothstep(0.0, 0.9, head - t);
  return d;
}
void main(){
  vec2 p = vP; p.x *= uMirror;
  float best = 1e3; float fresh = 0.0;
  for (int set = 0; set < 2; set++) {
    if (set == 1 && uCross < 0.5) break;
    vec2 q = rot(set == 0 ? p : vec2(-p.x, p.y), -0.72);
    float delay = float(set) * 0.1;
    for (int i = 0; i < 4; i++) {
      if (float(i) >= uCount) break;
      float fi = float(i) - (uCount - 1.0) * 0.5;
      float head = -1.0 + 2.6 * clamp((uT - delay - float(i) * 0.045) / 0.26, 0.0, 1.0);
      float fr;
      float d = streak(q + vec2(fi * 0.09, 0.0), fi * uSpacing, head, fr);
      if (d < best) { best = d; fresh = fr; }
    }
  }
  float fade = 1.0 - smoothstep(0.55, 1.0, uT);
  vec4 c = shade(best - 0.02, 0.3 + 0.6 * fresh, 0.03, uColor);
  gl_FragColor = vec4(c.rgb, c.a * fade);
  #include <colorspace_fragment>
}`;

// --- fangs: an upper and a lower row of teeth on curved gums, snapping shut with a pop
const FANGS = /* glsl */ `
float tooth(vec2 p, float bx, float by, float len, float hw, float dir){
  vec2 q = vec2(p.x - bx, (by - p.y) * dir);  // q.y: depth from the gum toward the tip
  float side = abs(q.x) - hw * (1.0 - clamp(q.y / len, 0.0, 1.0));
  return max(max(-q.y, q.y - len), side * 0.9);
}
void main(){
  vec2 p = vP;
  // gap: open, then shut fast (accelerating), a little bounce, then the bite lingers and fades
  float close = clamp(uT / 0.28, 0.0, 1.0); close = close * close;
  float bounce = sin(clamp((uT - 0.28) / 0.2, 0.0, 1.0) * 3.1416) * 0.05;
  float gap = mix(0.7, -0.02, close) + bounce;
  float ub = gap + 0.22 * p.x * p.x;      // upper gum line
  float lb = -gap - 0.22 * p.x * p.x;     // lower gum line
  float d = 1e3;
  // upper row: long fangs at the corners, short incisors in the middle
  d = min(d, tooth(p, -0.54, ub, 0.56, 0.16, 1.0));
  d = min(d, tooth(p, -0.19, ub, 0.26, 0.12, 1.0));
  d = min(d, tooth(p, 0.19, ub, 0.26, 0.12, 1.0));
  d = min(d, tooth(p, 0.54, ub, 0.56, 0.16, 1.0));
  // lower row interlocks between them
  d = min(d, tooth(p, -0.37, lb, 0.42, 0.13, -1.0));
  d = min(d, tooth(p, 0.0, lb, 0.2, 0.1, -1.0));
  d = min(d, tooth(p, 0.37, lb, 0.42, 0.13, -1.0));
  // gums: curved bands behind the teeth, in the creature's colour
  float span = 1.0 - smoothstep(0.62, 0.8, abs(p.x));
  float gw = 0.1 * span;
  float gu = max(abs(p.y - (ub + gw)) - gw, abs(p.x) - 0.8);
  float gl = max(abs(p.y - (lb - gw)) - gw, abs(p.x) - 0.8);
  float gum = min(gu, gl);
  float fade = 1.0 - smoothstep(0.6, 1.0, uT);
  vec4 g = shade(gum, 0.0, 0.03, uColor);
  vec4 t = shade(d, 0.65, 0.03, uTip);
  vec4 c = mix(g, t, t.a);
  c.a = max(g.a, t.a);
  // the open mouth between the jaws is dark, so it reads as jaws even before they shut
  vec2 mo = p / vec2(0.74, max(0.05, gap + 0.1));
  float mouth = (1.0 - smoothstep(0.85, 1.0, length(mo))) * (1.0 - close) * 0.45;
  c.rgb = mix(uInk, c.rgb, c.a);
  c.a = max(c.a, mouth);
  // the snap: a white star pops where the jaws meet
  float pop = clamp((uT - 0.17) / 0.25, 0.0, 1.0);
  float st = star(p, 0.08 + 0.55 * pop);
  float sa = (1.0 - smoothstep(-0.01, 0.01, st)) * (1.0 - pop) * step(0.17, uT);
  c.rgb = mix(c.rgb, uCore, sa);
  c.a = max(c.a, sa);
  gl_FragColor = vec4(c.rgb, c.a * fade);
  #include <colorspace_fragment>
}`;

// --- pincer: two hooked, serrated fingers on a shell palm close like shears
const PINCER = /* glsl */ `
float finger(vec2 p, float len, float thick, out float tip, out float outer){
  float x = clamp(p.x, 0.0, len);
  float c = 0.3 * sin(3.1416 * x / len);
  float hw = thick * pow(max(0.0, 1.0 - x / (len * 1.04)), 0.55);
  // serrations on the inner (cutting) edge
  float inner = step(p.y, c);
  hw += inner * 0.035 * max(0.0, sin(x * 24.0)) * step(0.25, x) * step(x, len - 0.2);
  float d = abs(p.y - c) - hw;
  d = max(d, max(-p.x, p.x - len));
  tip = smoothstep(len - 0.42, len - 0.15, x);
  outer = smoothstep(0.2, 0.9, (p.y - c) / max(0.01, hw));
  return d;
}
void main(){
  vec2 p = vP; p.x *= uMirror;
  // opening wide, then the snap (fast), a recoil, then it lingers and fades
  float snap = clamp((uT - 0.04) / 0.13, 0.0, 1.0); snap = snap * snap;
  float open = mix(0.62, -0.05, snap) + sin(clamp((uT - 0.17) / 0.18, 0.0, 1.0) * 3.1416) * 0.12;
  vec2 hinge = vec2(-0.72, 0.0);
  float tipU, outU, tipL, outL;
  float du = finger(rot(p - hinge, -open), 1.45, 0.2, tipU, outU);
  vec2 pl = p - hinge; pl.y = -pl.y;
  float dl = finger(rot(pl, -open * 0.8), 1.2, 0.17, tipL, outL);
  vec2 pp = (p - hinge - vec2(-0.2, 0.0)) / vec2(0.42, 0.32);
  float palm = (length(pp) - 1.0) * 0.32;
  float d = min(min(du, dl), palm);
  float tip = du < dl ? tipU : tipL;
  float outer = du < dl ? outU : outL;
  if (palm < min(du, dl)) { tip = 0.0; outer = 0.0; }
  vec3 body = mix(uColor, uTip, tip);
  vec4 c = shade(d, outer * 0.6 * (1.0 - tip), 0.035, body);
  // the snip: a sharp star where the tips meet
  float pop = clamp((uT - 0.15) / 0.25, 0.0, 1.0);
  vec2 meet = hinge + vec2(1.38, 0.0);
  float st = star(p - meet, 0.06 + 0.5 * pop);
  float sa = (1.0 - smoothstep(-0.01, 0.01, st)) * (1.0 - pop) * step(0.15, uT);
  c.rgb = mix(c.rgb, uCore, sa);
  c.a = max(c.a, sa);
  float fade = 1.0 - smoothstep(0.6, 1.0, uT);
  gl_FragColor = vec4(c.rgb, c.a * fade);
  #include <colorspace_fragment>
}`;

const FRAG = { claw: CLAW, fangs: FANGS, pincer: PINCER };
export const STRIKE_KINDS = Object.keys(FRAG);

/** A fresh strike material (one per strike; freed with it). f: the look from combat-fx.json. */
export function strikeMaterial(kind, f, mirror = 1) {
  const col = (v, d) => new THREE.Color(v ?? d);
  return new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uMirror: { value: mirror },
      uSeed: { value: 0 },
      uColor: { value: col(f.color, '#ff7a3d') },
      uCore: { value: col(f.core, '#ffffff') },
      uInk: { value: col(f.ink, '#2a1414') },
      uTip: { value: col(f.tip, '#fff8ec') },
      uCount: { value: f.count ?? 3 },
      uSpacing: { value: f.spacing ?? 0.26 },
      uWidth: { value: f.width ?? 0.075 },
      uBend: { value: f.bend ?? 0.14 },
      uCross: { value: f.cross ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    vertexShader: VERT,
    fragmentShader: COMMON + FRAG[kind],
  });
}
