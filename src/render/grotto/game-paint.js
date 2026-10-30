// The game's own stone paint for the grotto (owner, 29 October 2026: "the same method as the
// game"). The approved scenes (src/render/accepted-scenes/*.js, `paint()`) light stone with three
// painted tones instead of the lamp's colour: each surface names its shadow and half-tone tint
// (lavender on grey stone), the shadow map only switches between them, and a light grade keeps the
// colour clean. The grotto keeps its geometry and vertex colours; this material re-tones them into
// the game's grey stone family (`look.paint` in the dungeon data) so floors, walls, rocks and steps
// read as the same game as the overworld. Every number is a uniform: one program for all of them.
import * as THREE from 'three';

const FRAG_COMMON = `
uniform vec3 uSun, uShade, uMid, uLit, uTint, uFloor;
uniform vec2 uBand;
uniform float uSat, uGain, uDim, uLamp;
varying vec3 vW; varying vec3 vWN;
vec3 gradeBy(vec3 c,float sat,float con){ vec3 g=sqrt(max(c,0.)); float l=dot(g,vec3(.299,.587,.114)); g=mix(vec3(l),g,sat); g=(g-.5)*con+.5; g=max(g,0.); return g*g; }
`;

/** The shared paint values of a map: `look.paint` over the game's stone defaults. */
export function paintLook(look = {}) {
  const p = look.paint || {};
  return {
    sun: new THREE.Vector3(...(p.sun || [-0.6, 0.77, -0.2])).normalize(),
    shade: p.shade || [0.36, 0.34, 0.44],
    mid: p.mid || [0.64, 0.62, 0.67],
    lit: p.lit || [1, 1, 1],
    band: p.band || [-0.34, 0.24],
    // how much of a surface's own (often brown) vertex colour survives, and the stone it is
    // pulled toward: the game's light grey with a cool cast
    sat: p.sat ?? 0.35,
    tint: p.tint || '#d4d0cc',
    // brightness per surface kind: the cave model's rock is painted dark (its baked occlusion
    // reads in the lum), so it is lifted to the game's stone; the textured floors are near white
    gain: p.gain || {},
    floor: p.floor || '#1c2230',
    // a dark place: the painted light is dimmed (`dim`) and the lamps (the map's point lights and
    // the hero's) light the stone around them (`lamp`), so the glowing corals, crystals and pearls
    // read as the light of the room; `tints` gives a surface kind its own stone (the cave rock)
    dim: p.dim ?? 1,
    lamp: p.lamp ?? 0,
    tints: p.tints || {},
  };
}

const cache = new Map();

/**
 * The game's 3-tone stone material. `kind` keys a shared instance (one per surface kind); options:
 * map (texture), vertexColors, color, tint (overrides look's stone), sat, gain, emissive (for water floors
 * and nacre that glow under their own light), side.
 */
export function gamePaint(look, kind, o = {}) {
  const key = `${kind}|${JSON.stringify(look?.paint || {})}`;
  if (cache.has(key)) return cache.get(key);
  const P = paintLook(look);
  const m = new THREE.MeshLambertMaterial({
    color: o.color || '#ffffff', map: o.map || null, vertexColors: o.vertexColors ?? true, side: o.side ?? THREE.FrontSide,
    emissive: o.emissive || '#000000', emissiveIntensity: o.emissiveIntensity ?? 1, transparent: !!o.transparent,
  });
  const u = {
    uSun: { value: P.sun }, uShade: { value: new THREE.Vector3(...P.shade) }, uMid: { value: new THREE.Vector3(...P.mid) },
    uLit: { value: new THREE.Vector3(...P.lit) }, uBand: { value: new THREE.Vector2(...P.band) },
    uSat: { value: o.sat ?? P.sat }, uTint: { value: new THREE.Color(o.tint || P.tints[kind] || P.tint) }, uGain: { value: o.gain ?? P.gain[kind] ?? 1 },
    uFloor: { value: new THREE.Color(P.floor) }, uDim: { value: o.dim ?? P.dim }, uLamp: { value: o.lamp ?? P.lamp },
  };
  m.userData.paint = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wp4 = vec4(transformed,1.0); vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix*wp4; wn = mat3(instanceMatrix)*wn;
  #endif
    wp4 = modelMatrix*wp4; vW = wp4.xyz; vWN = normalize(mat3(modelMatrix)*wn); }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_COMMON}`)
      .replace('#include <opaque_fragment>', `
  float sh=1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    sh = receiveShadow ? getShadow( directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0] ) : 1.0;
  #endif
  vec3 N=normalize(vWN);
  if(!gl_FrontFacing) N=-N;
  float ndl=dot(N,uSun);
  float t1=smoothstep(uBand.x-.05,uBand.x+.05,ndl)*sh;
  float t2=smoothstep(uBand.y-.05,uBand.y+.05,ndl)*sh;
  // the surface's own colour pulled into the game's stone: keep its light and dark (baked
  // occlusion, joints, wear), most of its hue goes to the stone tint
  vec3 own=diffuseColor.rgb; float lum=dot(own,vec3(.299,.587,.114));
  vec3 base=min(mix(vec3(lum),own,uSat)*uGain,vec3(1.))*uTint;
  vec3 c=mix(base*uShade,base*uMid,t1); c=mix(c,base*uLit,t2);
  c*=uDim;
  // the lamps: each point light warms the stone it reaches, soft-wrapped so floors and walls both take it
  vec3 lamp=vec3(0.);
  #if NUM_POINT_LIGHTS > 0
  for(int i=0;i<NUM_POINT_LIGHTS;i++){
    vec3 lv=pointLights[i].position+vViewPosition; float d=length(lv);
    float att=getDistanceAttenuation(d,pointLights[i].distance,pointLights[i].decay);
    lamp+=pointLights[i].color*att*(.35+.65*max(dot(normal,lv/max(d,1e-3)),0.));
  }
  #endif
  c+=base*lamp*uLamp;
  // deep under the floors it fades to the cave's dark, as the game's cliffs fade into shade
  c=mix(uFloor,c,smoothstep(-13.,-6.,vW.y));
  outgoingLight=gradeBy(c,1.04,1.12)+totalEmissiveRadiance;
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `grotto-paint|${o.map ? 1 : 0}`;
  m.userData.shared = true;
  cache.set(key, m);
  return m;
}

// The game's grey stone family (the approved beach and forest stones) and its cut-stone block:
// a chamfered eight-sided ring stack with chipped, slightly uneven corners (ruinGeometry in the
// accepted scenes), coloured per face, with an outline shell a little larger drawn on its back faces.
export const STONE = ['#cbc6c2', '#bfbab8', '#d2ccc6', '#b6b1b2', '#c7c1bc', '#bcb7b0'];
export const STAIR = ['#c6cbc4', '#bcc2bb', '#d0d4cc', '#b3b9b3'];

/**
 * One cut stone, w x h x d, standing on y = 0, appended to `out` ({pos, col, line}) placed by
 * matrix `m4`. `rng` is the caller's seeded stream (core/rng.js).
 */
export function stoneBlock(out, rng, w, h, d, color, m4, ink = 0.03) {
  const R = (a, b) => rng.range(a, b), V = THREE.Vector3;
  const bevel = Math.min(w, h, d) * 0.065, cut = Math.min(w, d) * 0.1, tone = new THREE.Color(color);
  const contour = (ww, dd, c) => [[-ww / 2 + c, -dd / 2], [ww / 2 - c, -dd / 2], [ww / 2, -dd / 2 + c], [ww / 2, dd / 2 - c], [ww / 2 - c, dd / 2], [-ww / 2 + c, dd / 2], [-ww / 2, dd / 2 - c], [-ww / 2, -dd / 2 + c]];
  const rings = [0, bevel, h - bevel, h].map((y, j) => contour(w - (j === 0 || j === 3 ? bevel * 1.2 : 0), d - (j === 0 || j === 3 ? bevel * 1.2 : 0), cut)
    .map(([x, z]) => new V(x + R(-1, 1) * bevel * 0.3, y + (j === 0 ? 0 : R(-1, 1) * bevel * 0.22), z + R(-1, 1) * bevel * 0.3).applyMatrix4(m4)));
  const centre = new V(0, h / 2, 0).applyMatrix4(m4), s = 1 + ink / Math.min(w, h, d) * 1.6;
  const tri = (a, b, c, col) => {
    for (const v of [a, b, c]) {
      out.pos.push(v.x, v.y, v.z);
      out.col.push(col.r, col.g, col.b);
      out.line.push(centre.x + (v.x - centre.x) * s, centre.y + (v.y - centre.y) * s, centre.z + (v.z - centre.z) * s);
    }
  };
  const face = (a, b, c, e, col) => { tri(a, b, c, col); tri(a, c, e, col); };
  for (let j = 0; j < 3; j++) for (let k = 0; k < 8; k++) {
    const n = (k + 1) % 8, c = tone.clone().multiplyScalar(j === 0 ? 0.9 : j === 2 ? 1.04 : 1 + R(-0.035, 0.035));
    face(rings[j][k], rings[j + 1][k], rings[j + 1][n], rings[j][n], c);
  }
  const top = tone.clone().multiplyScalar(1.03), topC = new V(0, h, 0).applyMatrix4(m4), botC = new V(0, 0, 0).applyMatrix4(m4);
  for (let k = 0; k < 8; k++) {
    tri(topC, rings[3][(k + 1) % 8], rings[3][k], top);
    tri(botC, rings[0][k], rings[0][(k + 1) % 8], tone);
  }
}

/** The collected blocks as one painted mesh and its outline (non-indexed, flat facets). */
export function stoneMesh(out, look, name) {
  const root = new THREE.Group();
  if (!out.pos.length) return root;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, gamePaint(look, 'stone-block'));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = name;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(out.line, 3));
  const line = new THREE.Mesh(lg, inkMaterial(look));
  line.name = `${name}-line`;
  root.add(mesh, line);
  return root;
}

let ink = null;
function inkMaterial(look) {
  if (ink) return ink;
  ink = new THREE.MeshBasicMaterial({ color: look?.paint?.ink || '#4a4652', side: THREE.BackSide });
  ink.userData.shared = true;
  return ink;
}
