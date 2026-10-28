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

/** Flagstones in staggered rows (the texture spans 4 m): soft grout, a lit top-left edge, a few cracks. */
export function flagstoneTexture() {
  return canvasTexture('flagstone', 512, (g, n) => {
    const rng = createRng(31);
    g.fillStyle = '#6f6152';
    g.fillRect(0, 0, n, n);
    // rows of uneven height cut into stones of uneven width (some square, some long), each
    // drawn slightly turned and inset by its own amount so the grout never runs in straight courses
    const rows = [];
    for (let y = 0; y < n;) { const rh = rng.range(44, 76); rows.push([y, y + rh > n - 30 ? n - y : rh]); y += rows[rows.length - 1][1]; }
    for (const [y, rh] of rows) {
      let x = -Math.round(rng.range(0, 60));
      while (x < n) {
        const w = Math.round(rng.chance(0.35) ? rh * rng.range(0.9, 1.15) : rng.range(70, 150));
        const base = shade('#d8c6a2', rng.range(-0.07, 0.05));
        const inset = rng.range(2.5, 5), tilt = rng.range(-0.03, 0.03);
        const draw = (ox) => {
          const x0 = x + ox + inset, y0 = y + inset, w0 = w - inset * 2, h0 = rh - inset * 2;
          g.save();
          g.translate(x0 + w0 / 2, y0 + h0 / 2);
          g.rotate(tilt);
          g.translate(-(x0 + w0 / 2), -(y0 + h0 / 2));
          g.fillStyle = base;
          g.beginPath();
          g.roundRect(x0, y0, w0, h0, 7);
          g.fill();
          // soft painted shading: light top-left, shadowed bottom-right
          g.fillStyle = 'rgba(255,248,230,0.35)';
          g.fillRect(x0 + 3, y0 + 2, w0 - 8, 4);
          g.fillRect(x0 + 2, y0 + 3, 4, h0 - 8);
          g.fillStyle = 'rgba(70,52,36,0.22)';
          g.fillRect(x0 + 5, y0 + h0 - 6, w0 - 8, 5);
          g.fillRect(x0 + w0 - 6, y0 + 5, 5, h0 - 8);
          // mottling
          for (let i = 0; i < 6; i++) {
            g.fillStyle = `rgba(${rng.chance(0.5) ? '255,240,215' : '90,72,52'},${rng.range(0.05, 0.12)})`;
            g.beginPath();
            g.ellipse(x0 + rng.range(8, w0 - 8), y0 + rng.range(8, h0 - 8), rng.range(6, 18), rng.range(4, 10), 0, 0, Math.PI * 2);
            g.fill();
          }
          if (rng.chance(0.18)) {
            g.strokeStyle = 'rgba(60,46,34,0.45)';
            g.lineWidth = 1.5;
            g.beginPath();
            let cx = x0 + rng.range(10, w0 - 10), cy = y0 + 4;
            g.moveTo(cx, cy);
            for (let k = 0; k < 4; k++) { cx += rng.range(-10, 10); cy += h0 / 4; g.lineTo(cx, cy); }
            g.stroke();
          }
          g.restore();
        };
        draw(0);
        if (x + w > n) draw(-n); // wrap so the tile repeats seamlessly
        if (x < 0) draw(n);
        x += w;
      }
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
