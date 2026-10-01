// Cartoon particle shapes, drawn once into one small atlas (no image files). Alpha holds the
// shape; red holds the core mask, where the shader paints the particle's core colour over its rim
// colour. Cut-outs have hard edges (cel look); blob and cloud are painted soft/shaded. Cell 0 is
// unused: shape 0 stays the original soft round dot, drawn by the shader.
import * as THREE from 'three';

export const SHAPES = { dot: 0, spark: 1, star: 2, flame: 3, puff: 4, shard: 5, ring: 6, flare: 7, burst: 8, streak: 9, blob: 10, cloud: 11 };
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 3;
const CELL = 64;

/** A shape name from data/combat-fx.json, or a number, to its atlas index. Unknown names are dots. */
export function shapeIndex(s) {
  if (typeof s === 'number') return s;
  return SHAPES[s] ?? 0;
}

function star(g, points, outer, inner) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

// fixed pseudo-random numbers so the atlas is identical on every device
function seeded(seed) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

// Each path is drawn around (0,0) in a cell of radius ~28px, pointing up when it has a direction.
const DRAW = {
  spark: (g, k) => star(g, 4, 29 * k, 5 * k),
  star: (g, k) => star(g, 5, 28 * k, 13 * k),
  flame: (g, k) => {
    g.beginPath();
    g.moveTo(0, -29 * k);
    g.bezierCurveTo(9 * k, -14 * k, 20 * k, 2 * k, 15 * k, 14 * k);
    g.arc(0, 12 * k, 15 * k, 0.1, Math.PI - 0.1);
    g.bezierCurveTo(-20 * k, 2 * k, -9 * k, -14 * k, 0, -29 * k);
    g.fill();
  },
  puff: (g, k) => {
    g.beginPath();
    for (const [x, y, r] of [[-10, 6, 15], [10, 6, 15], [0, -6, 17], [-15, -4, 10], [15, -4, 10]]) {
      g.moveTo(x * k + r * k, y * k);
      g.arc(x * k, y * k, r * k, 0, Math.PI * 2);
    }
    g.fill();
  },
  shard: (g, k) => {
    g.beginPath();
    g.moveTo(0, -29 * k);
    g.lineTo(9 * k, 0);
    g.lineTo(0, 29 * k);
    g.lineTo(-9 * k, 0);
    g.closePath();
    g.fill();
  },
  ring: (g, k) => {
    g.beginPath();
    g.arc(0, 0, 27 * k, 0, Math.PI * 2);
    g.arc(0, 0, 27 * k - 7, 0, Math.PI * 2, true);
    g.fill();
  },
  flare: (g, k) => {
    star(g, 8, 29 * k, 9 * k);
  },
  // an impact flash: many uneven spikes, like a comic-book hit
  burst: (g, k) => {
    const r = seeded(7);
    const n = 15;
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = ((i + (i % 2 ? 0 : (r() - 0.5) * 0.5)) / (n * 2)) * Math.PI * 2;
      const len = i % 2 ? 9 + r() * 3 : 16 + r() * 13;
      g.lineTo(Math.cos(a) * len * k, Math.sin(a) * len * k);
    }
    g.closePath();
    g.fill();
  },
  // a speed line / flying ember: a thin needle along the cell's up axis
  streak: (g, k) => {
    g.beginPath();
    g.moveTo(0, -30 * k);
    g.quadraticCurveTo(3.2 * k, 0, 0, 30 * k);
    g.quadraticCurveTo(-3.2 * k, 0, 0, -30 * k);
    g.fill();
  },
};

// Soft shapes are painted with gradients instead of a flat rim/core cut-out.
const PAINT = {
  // a lump of fire light: soft wobbly edge, white-hot centre (used additively)
  blob: (g) => {
    const r = seeded(3);
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const len = 21 + r() * 8;
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    }
    g.closePath();
    const edge = g.createRadialGradient(0, 0, 4, 0, 0, 29);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = edge;
    g.fill();
    const hot = g.createRadialGradient(0, 0, 0, 0, 0, 17);
    hot.addColorStop(0, 'rgba(255,255,255,1)');
    hot.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = hot;
    g.fillRect(-32, -32, 64, 64);
    g.globalCompositeOperation = 'source-over';
  },
  // a cartoon smoke/fire cloud: lumpy cauliflower outline. The core tone is the lit body; the rim
  // tone shows only as a shadow band along the lower-right edge, like a cel-shaded cloud.
  cloud: (g) => {
    const lobes = [[-9, 6, 13], [9, 7, 13], [0, -5, 15], [-14, -6, 9], [14, -5, 10], [0, 13, 10]];
    const outline = (dx, dy, k) => {
      g.beginPath();
      for (const [x, y, r] of lobes) {
        g.moveTo(x * k + dx + r * k, y * k + dy);
        g.arc(x * k + dx, y * k + dy, r * k, 0, Math.PI * 2);
      }
    };
    outline(0, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.95)';
    g.fill();
    g.save();
    g.clip();
    outline(-3, -4, 0.97);
    g.fillStyle = '#ffffff';
    g.fill();
    g.restore();
  },
};

let atlas = null;
export function shapeAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CELL * ATLAS_COLS;
  c.height = CELL * ATLAS_ROWS;
  const g = c.getContext('2d');
  for (const [name, i] of Object.entries(SHAPES)) {
    const draw = DRAW[name];
    if (PAINT[name]) {
      g.save();
      g.translate((i % ATLAS_COLS) * CELL + CELL / 2, Math.floor(i / ATLAS_COLS) * CELL + CELL / 2);
      PAINT[name](g);
      g.restore();
      continue;
    }
    if (!draw) continue;
    g.save();
    g.translate((i % ATLAS_COLS) * CELL + CELL / 2, Math.floor(i / ATLAS_COLS) * CELL + CELL / 2);
    // rim: the whole shape, colour channel 0 (tinted by the particle colour)
    g.fillStyle = 'rgba(0,0,0,0.92)';
    draw(g, 1);
    // core: a smaller copy, colour channel 1 (lifted toward white)
    g.fillStyle = '#ffffff';
    draw(g, name === 'ring' ? 1 : 0.5);
    g.restore();
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.generateMipmaps = false; // mip levels would bleed neighbouring cells together
  atlas.minFilter = THREE.LinearFilter;
  return atlas;
}
