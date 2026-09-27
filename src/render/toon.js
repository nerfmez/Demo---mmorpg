// Anime cel-shading helpers: stepped toon ramp and inverted-hull outlines.
import * as THREE from 'three';

let ramp = null;
/** 3-step light ramp shared by all toon materials. */
export function toonRamp() {
  if (ramp) return ramp;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const matCache = new Map();

/** Shared toon material by colour (and options). */
export function toon(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.emissiveIntensity || ''}|${opts.transparent ? opts.opacity : ''}|${opts.side || ''}|${opts.vertexColors ? 'vc' : ''}`;
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonRamp(),
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  });
  if (!opts.unique) matCache.set(key, m);
  return m;
}

const outlineCache = new Map();
/** Back-face hull material pushed out along normals: a soft same-hue dark edge. */
export function outlineMaterial(color = '#2a2230', width = 0.018) {
  const key = `${color}|${width}`;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineWidth;');
  };
  m.customProgramCacheKey = () => `outline-${width}`;
  outlineCache.set(key, m);
  return m;
}

/** Mesh plus its outline hull, grouped. */
export function outlined(geometry, material, { outline = '#2a2230', width = 0.018, castShadow = true } = {}) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  if (outline) {
    const hull = new THREE.Mesh(geometry, outlineMaterial(outline, width));
    hull.castShadow = false;
    g.add(hull);
  }
  g.userData.mesh = mesh;
  return g;
}

/** Darken a hex colour for outlines of the same hue (no pure black lines). */
export function darker(hex, k = 0.45) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), hsl.l * k);
  return `#${c.getHexString()}`;
}

// ---------- see-through: props between the camera and the hero dissolve (dithered) ----------

export const seeUniforms = {
  uSeeCenter: { value: new THREE.Vector2(-9999, -9999) }, // framebuffer pixels
  uSeeRadius: { value: 120 },
  uSeeDepth: { value: 1 }, // hero depth (window z)
};

/** Patch a material so fragments in front of the hero, near it on screen, dither away. */
export function seeThrough(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.call(material, shader, r);
    Object.assign(shader.uniforms, seeUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uSeeCenter; uniform float uSeeRadius; uniform float uSeeDepth;')
      .replace(
        'void main() {',
        `void main() {
  {
    float sd = distance(gl_FragCoord.xy, uSeeCenter);
    if (sd < uSeeRadius && gl_FragCoord.z < uSeeDepth) {
      vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
      float bayer = (q.x * 4.0 + mod(q.x + q.y * 2.0, 4.0) * 3.0 + q.y) / 16.0;
      bayer = fract(bayer * 1.618 + q.y * 0.25);
      float k = smoothstep(uSeeRadius, uSeeRadius * 0.55, sd);
      if (bayer < k * 0.8) discard;
    }
  }`
      );
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${key ? key() : ''}|see`;
  return material;
}
