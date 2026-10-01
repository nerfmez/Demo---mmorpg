// Cartoon particle shapes, drawn once into one small atlas (no image files). Each shape has a
// hard-edged rim and a smaller hot core, so an effect reads as cel-shaded rather than as soft
// glow. Alpha holds the shape; red holds the core mask, which the particle shader lifts toward
// white. Cell 0 is unused: shape 0 stays the original soft round dot, drawn by the shader.
import * as THREE from 'three';

export const SHAPES = { dot: 0, spark: 1, star: 2, flame: 3, puff: 4, shard: 5, ring: 6, flare: 7 };
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;
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
