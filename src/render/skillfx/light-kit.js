// The bench's light-and-ribbon language as shared pieces (owner, 2026-10-26: match the effects made on
// the FX bench). Light, not ink: a near-white core strip inside a coloured additive glow strip, soft
// radial glow sprites that pop, sharp rays, thin ring outlines on the ground, little four-point stars,
// spark streaks on gravity. No dark outlines, no flat cartoon fills.
import * as THREE from 'three';

export const CORE_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); if(d>0.9) discard;
    vec3 c = d < 0.4 ? mix(vT, vec3(1.0,0.98,0.94), 0.8) : vT; gl_FragColor=vec4(c, vA); }`;
export const GLOW_FS = `varying vec2 vUv; varying float vA; varying vec3 vT;
  void main(){ float d=abs(vUv.y); float a=pow(1.0-d,2.5)*0.65; gl_FragColor=vec4(vT*a*vA, 1.0); }`;

// element tints: edge = the core strip's body, glow = the additive halo, hot = glow-sprite centre ring
export const LIGHT = {
  fire: { edge: [1.0, 0.72, 0.32], glow: [1.0, 0.45, 0.12], stops: ['rgba(255,250,232,1)', 'rgba(255,196,110,0.75)', 'rgba(255,120,40,0.22)', 'rgba(255,90,20,0)'], star: ['#fff1a0', '#a85a00'] },
  lightning: { edge: [0.72, 0.9, 1.0], glow: [0.3, 0.62, 1.0], stops: ['rgba(255,255,255,1)', 'rgba(170,225,255,0.75)', 'rgba(70,150,255,0.22)', 'rgba(40,110,255,0)'], star: ['#f2fbff', '#2a64b8'] },
  cold: { edge: [0.82, 0.95, 1.0], glow: [0.4, 0.75, 1.0], stops: ['rgba(255,255,255,1)', 'rgba(205,240,255,0.75)', 'rgba(120,200,255,0.2)', 'rgba(90,180,255,0)'], star: ['#ffffff', '#3d86c4'] },
  holy: { edge: [1.0, 0.95, 0.74], glow: [1.0, 0.72, 0.25], stops: ['rgba(255,255,248,1)', 'rgba(255,240,190,0.8)', 'rgba(255,200,90,0.25)', 'rgba(255,180,60,0)'], star: ['#fffbe6', '#c8901c'] },
  arcane: { edge: [0.84, 0.88, 1.0], glow: [0.48, 0.36, 1.0], stops: ['rgba(255,255,255,1)', 'rgba(214,200,255,0.8)', 'rgba(140,105,255,0.25)', 'rgba(110,75,255,0)'], star: ['#f6f2ff', '#5a3fc4'] },
  steel: { edge: [0.92, 0.95, 1.0], glow: [0.5, 0.62, 0.86], stops: ['rgba(255,255,255,1)', 'rgba(222,232,246,0.75)', 'rgba(140,160,196,0.22)', 'rgba(110,130,170,0)'], star: ['#ffffff', '#4e5d74'] },
};
export const lightOf = (el) => LIGHT[el] || LIGHT.fire;

const texCache = new Map();
function canvasTexture(key, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.userData.shared = true; texCache.set(key, t); return t;
}
export const glowTexture = (el) => canvasTexture('glow|' + el, (g) => {
  const s = lightOf(el).stops, grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, s[0]); grad.addColorStop(0.25, s[1]); grad.addColorStop(0.6, s[2]); grad.addColorStop(1, s[3]);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
});
export const starTexture = (el) => canvasTexture('star|' + el, (g) => {
  const [fill, stroke] = lightOf(el).star; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 - Math.PI / 2, r = i % 2 ? 16 : 58; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 6; g.strokeStyle = stroke; g.stroke();
});
// a lens-flare glint: a hot round core, four long thin rays and four short diagonal ones
export const flareTexture = (el) => canvasTexture('flare|' + el, (g) => {
  const st = lightOf(el).stops, ray = (ang, len, w) => {
    g.save(); g.translate(64, 64); g.rotate(ang);
    const gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, st[0]); gr.addColorStop(0.35, st[1]); gr.addColorStop(1, st[3]);
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill(); g.restore();
  };
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) { ray(i * Math.PI / 2, 63, 3.2); ray(i * Math.PI / 2 + Math.PI / 4, 30, 2.2); }
  const c = g.createRadialGradient(64, 64, 0, 64, 64, 26); c.addColorStop(0, st[0]); c.addColorStop(0.4, st[1]); c.addColorStop(1, st[3]);
  g.fillStyle = c; g.fillRect(0, 0, 128, 128);
});
export function lightSprite(scene, map, additive, order = 9) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthTest: !!additive, toneMapped: false }));
  sp.visible = false; sp.renderOrder = order; scene.add(sp); return sp;
}

// strip width profiles (set W before use)
export const W = { v: 0, u: 0 };
export const lineW = () => W.v, lineGlowW = () => W.v * 2.6;
export const taperW = (x) => W.v * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.5), taperGlowW = (x) => taperW(x) * 2.6;
export const tailW = (x) => W.v * (0.15 + 0.85 * x * x), tailGlowW = (x) => W.v * (0.6 + 2.4 * x * x);
export const sparkW = (x) => W.v * Math.sin(Math.PI * x), sparkGlowW = () => W.v * 2.2;

/** Points of a ground circle (y metres above ground) into out[0..n-1]. */
export function circlePoints(out, cx, cz, r, y = 0.04, from = 0, to = Math.PI * 2) {
  const n = out.length;
  for (let i = 0; i < n; i++) { const a = from + (to - from) * (i / (n - 1)); out[i].set(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); }
  return out;
}
/** A spark streak pool step: moves, draws (3-point strips) and recycles. */
export function drawSparks(sparks, free, dt, core, glow, three, gravity = 12) {
  let w = 0;
  for (const q of sparks) {
    q.life += dt;
    if (q.life >= 0) {
      q.v.y -= gravity * dt; q.p.addScaledVector(q.v, dt);
      const u = q.life / q.max;
      if (u < 1) {
        three[0].copy(q.p).addScaledVector(q.v, -0.035); three[1].copy(q.p).lerp(three[0], 0.5); three[2].copy(q.p);
        W.v = q.w; glow.strip(three, sparkGlowW, 0.7 * (1 - u), q.glow); core.strip(three, sparkW, 1 - u * u, q.edge);
      }
    }
    if (q.life < q.max) sparks[w++] = q; else free.push(q);
  }
  sparks.length = w;
}
export function spark(sparks, free, max, p, v, life, w, look) {
  if (sparks.length >= max) return;
  const q = free.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3() };
  q.p.copy(p); q.v.copy(v); q.life = 0; q.max = life; q.w = w; q.edge = look.edge; q.glow = look.glow; sparks.push(q);
}
