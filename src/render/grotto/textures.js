// Painted canvas textures for the Pearlshell Grotto (made once, shared): flagstones, cliff
// masonry, nacre, sand, the rune circle and a soft glow. Cosmetic randomness only.
import * as THREE from 'three';
import { createRng } from '../../core/rng.js';

const cache = new Map();

function canvasTexture(key, size, paint, { repeat = true, color = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, k);
  return `#${c.getHexString()}`;
};

/**
 * Irregular flagstones (the texture spans 4 m): a seamless Voronoi of about thirty-six stones, each its
 * own shade with soft mottling, a lit upper-left bevel, a shadowed lower-right bevel and grout
 * between. Computed per pixel once, so no two courses line up the way bricks do.
 */
export function flagstoneTexture() {
  return canvasTexture('flagstone', 512, (g, n) => {
    const rng = createRng(31), G = 6, cell = n / G;
    const jx = [], jy = [], tone = [];
    for (let i = 0; i < G * G; i++) { jx.push(rng.range(0.2, 0.8)); jy.push(rng.range(0.2, 0.8)); tone.push(rng.range(-0.08, 0.06)); }
    const base = [214, 196, 160], grout = [132, 116, 96]; // sRGB, as the canvas stores it
    const img = g.createImageData(n, n), d = img.data;
    const hash = (x, y) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return h - Math.floor(h); };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      let d1 = Infinity, d2 = Infinity, p1x = 0, p1y = 0, p2x = 0, p2y = 0, id = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const cx = gx + ox, cy = gy + oy, k = ((cy + G) % G) * G + ((cx + G) % G);
        const px = (cx + jx[k]) * cell, py = (cy + jy[k]) * cell, dd = (px - x) ** 2 + (py - y) ** 2;
        if (dd < d1) { d2 = d1; p2x = p1x; p2y = p1y; d1 = dd; p1x = px; p1y = py; id = k; }
        else if (dd < d2) { d2 = dd; p2x = px; p2y = py; }
      }
      // distance to the edge between the nearest two stones, in pixels
      const edge = (d2 - d1) / (2 * Math.hypot(p2x - p1x, p2y - p1y));
      const ex = p2x - p1x, ey = p2y - p1y; // toward the neighbour: down-right edges are in shadow
      const lit = (ex + ey) < 0 ? 1 : -1;
      const mott = (hash(Math.floor(x / 9), Math.floor(y / 9)) - 0.5) * 0.06 + (hash(x, y) - 0.5) * 0.035;
      const shadeK = 1 + (tone[id] + mott + (edge < 7 ? lit * 0.08 * (1 - edge / 7) : 0)) * 1.6;
      const k = THREE.MathUtils.smoothstep(edge, 0.6, 2.0), i = (y * n + x) * 4;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = base[ch] * shadeK * k + grout[ch] * (1 - k);
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // a few hairline cracks
    g.strokeStyle = 'rgba(70,56,42,0.35)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      let x = rng.range(0, n), y = rng.range(0, n);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += rng.range(-12, 12); y += rng.range(-12, 12); g.lineTo(x, y); }
      g.stroke();
    }
  });
}

/** Packed cave earth under the paving (spans 4 m): dark, blotchy, with grit and small stones. */
export function dirtTexture() {
  return canvasTexture('dirt', 256, (g, n) => {
    const rng = createRng(13);
    g.fillStyle = '#5e4c3c';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(30,22,16,0.25)' : 'rgba(110,92,72,0.18)';
      g.beginPath();
      g.ellipse(rng.range(0, n), rng.range(0, n), rng.range(8, 34), rng.range(6, 22), rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(140,124,104,0.5)' : 'rgba(20,14,10,0.5)';
      g.fillRect(rng.range(0, n), rng.range(0, n), rng.range(1, 2.5), rng.range(1, 2.5));
    }
  });
}

/** Big masonry blocks for the sides of the platforms (spans 4 m wide, 4 m tall). */
export function masonryTexture() {
  return canvasTexture('masonry', 256, (g, n) => {
    const rng = createRng(77);
    g.fillStyle = '#4a423b';
    g.fillRect(0, 0, n, n);
    const rows = 6, rh = n / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rng.range(0, 40);
      while (x < n) {
        const w = rng.range(40, 80), base = shade('#b3a898', rng.range(-0.08, 0.04));
        const wraps = [0];
        if (x + w > n) wraps.push(-n);
        if (x < 0) wraps.push(n);
        for (const ox of wraps) {
          g.fillStyle = base;
          g.fillRect(x + ox + 2, r * rh + 2, w - 4, rh - 4);
          g.fillStyle = 'rgba(255,240,220,0.18)';
          g.fillRect(x + ox + 2, r * rh + 2, w - 4, 3);
          g.fillStyle = 'rgba(20,16,14,0.25)';
          g.fillRect(x + ox + 2, r * rh + rh - 6, w - 4, 4);
        }
        x += w;
      }
    }
  });
}

/** Mother-of-pearl: soft bands of pink, cyan and cream. */
export function nacreTexture() {
  return canvasTexture('nacre', 256, (g, n) => {
    const grad = g.createLinearGradient(0, 0, n, n);
    const stops = ['#fff3f7', '#f6d4ea', '#d6f2ff', '#fff6e6', '#e8d6ff', '#fff3f7'];
    stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    g.globalAlpha = 0.18;
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = i % 2 ? '#ffffff' : '#c9b7ff';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(n / 2, n * 1.2, 40 + i * 14, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

/** Warm beach sand with fine speckle. */
export function sandTexture() {
  return canvasTexture('sand', 256, (g, n) => {
    const rng = createRng(5);
    g.fillStyle = '#ead6a8';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,250,232,0.5)' : 'rgba(170,138,96,0.35)';
      g.fillRect(rng.range(0, n), rng.range(0, n), rng.range(1, 2.4), rng.range(1, 2.4));
    }
  });
}

/** The temple's rune circle: rings, ticks and glyphs (white on transparent, tinted by the material). */
export function runeTexture() {
  return canvasTexture('rune', 512, (g, n) => {
    const rng = createRng(9), c = n / 2;
    g.clearRect(0, 0, n, n);
    g.strokeStyle = '#ffffff';
    g.fillStyle = '#ffffff';
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
    ring(240, 6); ring(222, 2); ring(160, 4); ring(146, 2); ring(70, 4);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.save(); g.translate(c + Math.cos(a) * 184, c + Math.sin(a) * 184); g.rotate(a + Math.PI / 2);
      g.lineWidth = 3;
      g.beginPath();
      const k = i % 4;
      if (k === 0) { g.moveTo(-8, -12); g.lineTo(0, 12); g.lineTo(8, -12); }
      else if (k === 1) { g.arc(0, 0, 9, 0, Math.PI * 1.5); }
      else if (k === 2) { g.moveTo(-9, 0); g.lineTo(9, 0); g.moveTo(0, -11); g.lineTo(0, 11); }
      else { g.moveTo(-8, 10); g.lineTo(-8, -10); g.lineTo(8, -2); g.lineTo(-8, 4); }
      g.stroke();
      g.restore();
    }
    // a six-point star joining the inner rings
    g.lineWidth = 3;
    for (let s = 0; s < 2; s++) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI * 2 + s * Math.PI / 3 - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * 146, c + Math.sin(a) * 146); }
      g.stroke();
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * 232, c + Math.sin(a) * 232, rng.range(5, 8), 0, Math.PI * 2); g.fill(); }
  }, { repeat: false });
}

/** The carved medallion in the temple floor (the concept's circle under the water): pale stone rings
 * with a groove beside each, a ring of radial slabs, an eight-petal rosette and a boss. Not magic: it
 * does not glow. */
export function medallionTexture() {
  return canvasTexture('medallion', 512, (g, n) => {
    const c = n / 2, groove = 'rgba(24,58,60,0.75)', stone = 'rgba(236,224,182,0.95)', worn = 'rgba(236,224,182,0.55)';
    g.clearRect(0, 0, n, n);
    // each line is carved: a dark groove, then the pale edge beside it
    const ring = (r, w) => {
      g.lineWidth = w + 3; g.strokeStyle = groove; g.beginPath(); g.arc(c + 2, c + 2, r, 0, Math.PI * 2); g.stroke();
      g.lineWidth = w; g.strokeStyle = stone; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    };
    const line = (a, r0, r1, w, col = stone) => {
      const x0 = c + Math.cos(a) * r0, y0 = c + Math.sin(a) * r0, x1 = c + Math.cos(a) * r1, y1 = c + Math.sin(a) * r1;
      g.lineWidth = w + 2; g.strokeStyle = groove; g.beginPath(); g.moveTo(x0 + 2, y0 + 2); g.lineTo(x1 + 2, y1 + 2); g.stroke();
      g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    };
    ring(244, 9); ring(226, 3); ring(164, 5); ring(150, 2); ring(74, 4); ring(30, 3);
    for (let i = 0; i < 36; i++) line((i / 36) * Math.PI * 2, 166, 224, i % 3 ? 2 : 4, i % 3 ? worn : stone); // the slabs of the outer band
    for (let i = 0; i < 16; i++) line((i / 16) * Math.PI * 2 + 0.1, 76, 148, 2, worn);
    // the rosette: eight lens-shaped petals
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.save(); g.translate(c, c); g.rotate(a);
      for (const [col, off, w] of [[groove, 2, 5], [stone, 0, 3]]) {
        g.strokeStyle = col; g.lineWidth = w;
        g.beginPath(); g.moveTo(32 + off, off); g.quadraticCurveTo(90 + off, -34 + off, 146 + off, off); g.quadraticCurveTo(90 + off, 34 + off, 32 + off, off); g.stroke();
      }
      g.restore();
    }
    g.fillStyle = stone; g.beginPath(); g.arc(c, c, 14, 0, Math.PI * 2); g.fill();
  }, { repeat: false });
}

/** Radial glow (white centre to transparent edge) for light pools and halos. */
export function glowTexture() {
  return canvasTexture('glow', 128, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  }, { repeat: false });
}
