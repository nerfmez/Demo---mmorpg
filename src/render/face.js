// Anime face painted on a canvas and laid over the skinned head (skinned.js). The texture is a
// 2x2 atlas of expressions (open, blink, attack, hurt); a per-rig uniform picks the cell, so
// blinking and expressions cost nothing. One texture per eye/hair colour pair, shared.
import * as THREE from 'three';

export const FACE_CELLS = { open: [0, 0.5], blink: [0.5, 0.5], attack: [0, 0], hurt: [0.5, 0] };
const CELL = 512; // px per expression; covers FACE_SIZE metres of the face
export const FACE_SIZE = 0.2;

const cache = new Map();

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  return '#' + c.multiplyScalar(k).getHexString();
};

/**
 * The atlas for a look. Face space: x right (character's left), y up, origin at the face
 * patch centre-bottom; landmarks come from the model config (metres, head-local bind pose).
 */
export function faceTexture(look, F) {
  const key = `${look.eyes}|${look.hair}|${look.skin}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CELL * 2;
  const g = canvas.getContext('2d');
  const cells = [['open', 0, 0], ['blink', CELL, 0], ['attack', 0, CELL], ['hurt', CELL, CELL]];
  for (const [expr, ox, oy] of cells) {
    g.save();
    g.translate(ox, oy);
    drawFace(g, expr, look, F);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.shared = true;
  cache.set(key, tex);
  return tex;
}

function drawFace(g, expr, look, F) {
  const s = CELL / FACE_SIZE;
  const X = (x) => CELL / 2 + x * s;
  const Y = (y) => CELL - (y - F.bottom) * s;
  const ink = '#2a2230';
  const brow = shade(look.hair, 0.7);
  const eyeY = Y(F.eyeY), browY = Y(F.browY), mouthY = Y(F.mouthY), noseY = Y(F.noseY);
  const ex = F.eyeX * s;
  const w = F.eyeW * s, h = F.eyeH * s;

  // soft blush and nose shadow
  g.fillStyle = 'rgba(232,120,110,0.16)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(CELL / 2 + side * (ex + w * 0.15), eyeY + h * 1.05, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(150,80,70,0.55)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(CELL / 2 - 4, noseY + 2);
  g.lineTo(CELL / 2 + 3, noseY);
  g.stroke();

  for (const side of [-1, 1]) {
    const cx = CELL / 2 + side * ex;
    g.save();
    g.translate(cx, eyeY);
    g.scale(side, 1); // draw the character's right eye, mirror for the left; +x is outward
    if (expr === 'blink') closedEye(g, w, h, ink, 0.25);
    else if (expr === 'hurt') squeezedEye(g, w, h, ink);
    else openEye(g, w, h, ink, look.eyes, expr === 'attack' ? 0.2 : 0);
    // brow
    const bl = browY - eyeY;
    g.strokeStyle = brow;
    g.lineWidth = 7;
    g.beginPath();
    if (expr === 'attack') {
      g.moveTo(-w * 0.55, bl + h * 0.22);
      g.quadraticCurveTo(0, bl + h * 0.02, w * 0.62, bl - h * 0.12);
    } else if (expr === 'hurt') {
      g.moveTo(-w * 0.55, bl - h * 0.2);
      g.quadraticCurveTo(0, bl - h * 0.05, w * 0.62, bl + h * 0.12);
    } else {
      g.moveTo(-w * 0.55, bl + h * 0.06);
      g.quadraticCurveTo(0, bl - h * 0.14, w * 0.62, bl + h * 0.02);
    }
    g.stroke();
    g.restore();
  }

  // mouth
  const mw = F.mouthW * s;
  g.strokeStyle = '#7a3a3a';
  g.fillStyle = '#8a3a3e';
  g.lineWidth = 4.5;
  g.beginPath();
  if (expr === 'attack') {
    g.moveTo(CELL / 2 - mw * 0.45, mouthY - 2);
    g.quadraticCurveTo(CELL / 2, mouthY + mw * 0.45, CELL / 2 + mw * 0.45, mouthY - 2);
    g.closePath();
    g.fill();
    g.stroke();
  } else if (expr === 'hurt') {
    g.ellipse(CELL / 2, mouthY + 2, mw * 0.28, mw * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    g.moveTo(CELL / 2 - mw * 0.5, mouthY - 3);
    g.quadraticCurveTo(CELL / 2, mouthY + mw * 0.22, CELL / 2 + mw * 0.5, mouthY - 3);
    g.stroke();
  }
}

// Eye shape: x in [-w/2 inner .. +w/2 outer], y down. `narrow` lowers the upper lid.
function eyeOutline(g, w, h, narrow) {
  const top = -h * (0.5 - narrow);
  g.beginPath();
  g.moveTo(-w * 0.5, -h * 0.05);
  g.bezierCurveTo(-w * 0.3, top - h * 0.08, w * 0.25, top - h * 0.1, w * 0.55, top + h * 0.1);
  g.bezierCurveTo(w * 0.5, h * 0.2, w * 0.3, h * 0.48, 0, h * 0.5);
  g.bezierCurveTo(-w * 0.3, h * 0.48, -w * 0.48, h * 0.25, -w * 0.5, -h * 0.05);
  g.closePath();
  return top;
}

function openEye(g, w, h, ink, iris, narrow) {
  g.save();
  const top = eyeOutline(g, w, h, narrow);
  g.fillStyle = '#fbf6ee';
  g.fill();
  g.clip();
  // iris: tall oval with a dark top and a bright lower rim
  const ir = w * 0.3;
  const grad = g.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
  grad.addColorStop(0, shade(iris, 0.35));
  grad.addColorStop(0.55, shade(iris, 0.85));
  grad.addColorStop(1, shade(iris, 1.35));
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(-w * 0.02, h * 0.04, ir, h * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = shade(iris, 0.2);
  g.beginPath();
  g.ellipse(-w * 0.02, h * 0.02, ir * 0.42, h * 0.24, 0, 0, Math.PI * 2);
  g.fill();
  // lid shadow over the top of the eye
  g.fillStyle = 'rgba(40,30,50,0.28)';
  g.fillRect(-w, -h, w * 2, h * 0.42 + top + h * 0.5);
  // highlights
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(-w * 0.12, -h * 0.12, ir * 0.36, h * 0.14, -0.3, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w * 0.1, h * 0.26, ir * 0.16, h * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // upper lash line, heavier at the outer corner with a small flick
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = 'round';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(-w * 0.52, -h * 0.02);
  g.bezierCurveTo(-w * 0.3, top - h * 0.1, w * 0.25, top - h * 0.12, w * 0.58, top + h * 0.1);
  g.stroke();
  g.beginPath();
  g.moveTo(w * 0.45, top - h * 0.02);
  g.lineTo(w * 0.72, top - h * 0.02);
  g.lineTo(w * 0.56, top + h * 0.2);
  g.fill();
  // lower lash, outer half only
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(w * 0.52, h * 0.18);
  g.quadraticCurveTo(w * 0.3, h * 0.5, w * 0.02, h * 0.52);
  g.stroke();
}

function closedEye(g, w, h, ink, curve) {
  g.strokeStyle = ink;
  g.lineCap = 'round';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(-w * 0.5, h * 0.05);
  g.quadraticCurveTo(0, h * (0.05 + curve * 1.4), w * 0.58, h * 0.0);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(w * 0.4, h * 0.08);
  g.lineTo(w * 0.62, h * 0.2);
  g.stroke();
}

function squeezedEye(g, w, h, ink) {
  g.strokeStyle = ink;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 8;
  g.beginPath();
  // points at the nose: > <
  g.moveTo(w * 0.45, -h * 0.25);
  g.lineTo(-w * 0.35, h * 0.05);
  g.lineTo(w * 0.4, h * 0.3);
  g.stroke();
}

/**
 * Face patch: the front triangles of the head, pushed 1.5 mm out along their normals, with a
 * planar UV over FACE_SIZE metres. Keeps the skin attributes so it deforms with the head.
 */
export function facePatch(geometry, F) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = src.attributes.position, nor = src.attributes.normal;
  const si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
  const keep = [];
  const inside = (i) => {
    const y = pos.getY(i), z = pos.getZ(i), x = pos.getX(i);
    return y > F.bottom - 0.01 && y < F.bottom + FACE_SIZE && z > F.frontZ && Math.abs(x) < FACE_SIZE / 2;
  };
  for (let t = 0; t < pos.count; t += 3) if (inside(t) && inside(t + 1) && inside(t + 2)) keep.push(t);
  const n = keep.length * 3;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2);
  const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
  let k = 0;
  for (const t of keep) {
    for (let j = 0; j < 3; j++, k++) {
      const i = t + j;
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      const x = pos.getX(i) + nx * 0.0015, y = pos.getY(i) + ny * 0.0015, z = pos.getZ(i) + nz * 0.0015;
      P.set([x, y, z], k * 3);
      N.set([nx, ny, nz], k * 3);
      UV.set([0.5 + x / FACE_SIZE, (y - F.bottom) / FACE_SIZE], k * 2);
      SI.set([si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], k * 4);
      SW.set([sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], k * 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  g.userData.shared = true;
  return g;
}

/** Toon material for the face patch; `cell` is the per-rig expression uniform. */
export function faceMaterial(map, cell) {
  const m = new THREE.MeshToonMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.userData.rig = true; // the shared texture is kept
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCell = cell;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uCell;')
      .replace('#include <map_fragment>', 'diffuseColor *= texture2D( map, vMapUv * 0.5 + uCell );');
  };
  m.customProgramCacheKey = () => 'face-toon';
  return m;
}
