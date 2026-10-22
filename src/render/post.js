// Screen grade (data/rendering.json → post): the scene renders into a target, then one pass adds a
// soft glow on bright highlights, a gentle distance haze in the zone's fog colour toward the top
// of the screen (farther ground in this camera), a warm sunlight wash from the sun's side, split toning (cool shadows, warm light), contrast/saturation and a
// vignette. Models and materials are untouched. Cost: one quarter-size glow pass and one
// full-screen composite; off on the low preset (the scene then draws straight to the canvas).
import * as THREE from 'three';

const VERT = `varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// bright pass + downsample: four bilinear taps cover a 4x4 block of the full-size image
const GLOW_FRAG = `uniform sampler2D tScene; uniform vec2 uTexel; uniform float uThreshold, uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tScene, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tScene, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tScene, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = clamp((l - uThreshold + uKnee) / (2.0 * uKnee), 0.0, 1.0);
  gl_FragColor = vec4(c * k * k, 1.0);
}`;

const COMPOSITE_FRAG = `uniform sampler2D tScene, tGlow; uniform vec2 uGlowTexel;
uniform float uExposure, uContrast, uSaturation, uGlow, uShadowAmt, uLightAmt, uHazeAmt, uHazeStart, uVignette, uTime;
uniform vec3 uShadowTint, uLightTint, uHaze, uSun; uniform vec2 uSunPos; uniform float uSunAmt, uAspect;
varying vec2 vUv;
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb * uExposure;
  // glow: a 9-tap tent over the quarter-size bright pass (a wide, soft halo)
  vec3 g = texture2D(tGlow, vUv).rgb * 0.25;
  g += (texture2D(tGlow, vUv + uGlowTexel * vec2(1.5, 0.0)).rgb + texture2D(tGlow, vUv - uGlowTexel * vec2(1.5, 0.0)).rgb
      + texture2D(tGlow, vUv + uGlowTexel * vec2(0.0, 1.5)).rgb + texture2D(tGlow, vUv - uGlowTexel * vec2(0.0, 1.5)).rgb) * 0.125;
  g += (texture2D(tGlow, vUv + uGlowTexel * vec2(2.5, 2.5)).rgb + texture2D(tGlow, vUv - uGlowTexel * vec2(2.5, 2.5)).rgb
      + texture2D(tGlow, vUv + uGlowTexel * vec2(2.5, -2.5)).rgb + texture2D(tGlow, vUv - uGlowTexel * vec2(2.5, -2.5)).rgb) * 0.0625;
  c += g * uGlow;
  // grade in display space (what the eye compares)
  c = toSRGB(clamp(c, 0.0, 1.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  // split toning: cool shadows, warm light (soft light-style, keeps the cel ramp readable)
  c = mix(c, c * uShadowTint * 2.0, uShadowAmt * (1.0 - smoothstep(0.0, 0.55, l)));
  c = mix(c, 1.0 - (1.0 - c) * (1.0 - uLightTint) * 2.0, uLightAmt * smoothstep(0.45, 1.0, l));
  // distance haze toward the top of the screen
  c = mix(c, uHaze, uHazeAmt * smoothstep(uHazeStart, 1.0, vUv.y));
  // warm sunlight wash from the sun's side of the screen (screen blend: lightens, never greys)
  vec2 sd = (vUv - uSunPos) * vec2(uAspect, 1.0);
  float sun = uSunAmt * (1.0 - smoothstep(0.0, 1.4, length(sd)));
  c = 1.0 - (1.0 - c) * (1.0 - uSun * sun);
  // vignette
  vec2 d = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
  // dither (no banding in the haze and vignette)
  c += (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const WHITE = new THREE.Color(1, 1, 1);

const tri = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
};

export class PostFX {
  constructor(renderer, cfg) {
    this.renderer = renderer;
    this.cfg = cfg;
    this.width = 0;
    this.height = 0;
    const isGL2 = renderer.capabilities?.isWebGL2 !== false;
    // the canvas's native AA does not apply inside a target: multisample it instead
    this.scene = new THREE.WebGLRenderTarget(1, 1, { samples: isGL2 ? cfg.samples ?? 4 : 0, colorSpace: THREE.SRGBColorSpace });
    this.glow = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }); // 8-bit: the bright pass never exceeds 1, and every iPad can render to it
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geometry = tri();
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GLOW_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: this.scene.texture }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: cfg.glowThreshold }, uKnee: { value: cfg.glowKnee } },
    });
    // tints are display colours, graded in display space: keep their raw sRGB values
    const col = (hex) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: this.scene.texture }, tGlow: { value: this.glow.texture }, uGlowTexel: { value: new THREE.Vector2() },
        uExposure: { value: cfg.exposure }, uContrast: { value: cfg.contrast }, uSaturation: { value: cfg.saturation }, uGlow: { value: cfg.glow },
        uShadowTint: { value: col(cfg.shadowTint) }, uShadowAmt: { value: cfg.shadowTintAmount },
        uLightTint: { value: col(cfg.lightTint) }, uLightAmt: { value: cfg.lightTintAmount },
        uHaze: { value: new THREE.Color(1, 1, 1) }, uHazeAmt: { value: cfg.hazeAmount }, uHazeStart: { value: cfg.hazeStart },
        uSun: { value: col(cfg.sunWashColor) }, uSunAmt: { value: cfg.sunWash }, uSunPos: { value: new THREE.Vector2(...cfg.sunWashPos) }, uAspect: { value: 1 },
        uVignette: { value: cfg.vignette }, uTime: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(this.geometry, this.glowMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
  }

  /** Match the drawing buffer; reallocates only when the size changes. */
  setSize(width, height) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    if (width === this.width && height === this.height) return false;
    this.width = width;
    this.height = height;
    this.scene.setSize(width, height);
    const gw = Math.max(1, Math.round(width / 4)), gh = Math.max(1, Math.round(height / 4));
    this.glow.setSize(gw, gh);
    this.glowMat.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.compositeMat.uniforms.uGlowTexel.value.set(1 / gw, 1 / gh);
    this.compositeMat.uniforms.uAspect.value = width / height;
    return true;
  }

  /** The haze takes the zone's fog colour (linear, as THREE.Color holds it), lifted toward white. */
  setHaze(fog) {
    const h = this.compositeMat.uniforms.uHaze.value.copy(fog).convertLinearToSRGB();
    h.lerp(WHITE, this.cfg.hazeLift);
  }

  render(scene, camera, time = 0) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    this.quad.material = this.glowMat;
    r.setRenderTarget(this.glow);
    r.render(this.quadScene, this.camera);
    this.compositeMat.uniforms.uTime.value = time % 100;
    this.quad.material = this.compositeMat;
    r.setRenderTarget(prev);
    r.render(this.quadScene, this.camera);
  }

  dispose() {
    this.scene.dispose();
    this.glow.dispose();
    this.glowMat.dispose();
    this.compositeMat.dispose();
    this.geometry.dispose();
  }
}
