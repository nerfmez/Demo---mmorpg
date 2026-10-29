// Prints the grotto paving's joints in metres (one PAVING_TILE; world z up the picture), for
// scripts/grotto-trace.py to break the floors along. The layout is flagstoneCourses() in
// src/render/grotto/textures.js; the floors map it with uv = (x, z) / PAVING_TILE and the texture's flipY.
import { flagstoneCourses, PAVING_TILE } from '../src/render/grotto/textures.js';

const N = 512, TILE = PAVING_TILE, k = TILE / N;
const rows = flagstoneCourses(N).map((r) => ({
  z0: +((N - r.y1) * k).toFixed(4),
  z1: +((N - r.y0) * k).toFixed(4),
  stones: r.stones.map((s) => [+(s.x0 * k).toFixed(4), +(s.x1 * k).toFixed(4)]),
}));
process.stdout.write(JSON.stringify({ tile: TILE, rows }));
