// One painted picture of the whole map (zone colours, hill shading, cliffs, water, roads and
// landmarks), made once from the same world data the 3D view uses. The minimap and the world
// map panel both draw from it.
import { fromBoxLocal } from '../core/math.js';

const PX = 2; // canvas pixels per metre

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const ROCK = hex('#a39a86');
const ROAD = hex('#dcc08a');
const SHALLOW = hex('#6cc0e6');
const DEEP = hex('#2f7cc0');
const PLAZA = hex('#d9cfb8');

let cached = null;

/** @returns {{canvas: HTMLCanvasElement, px: number, minX: number, minZ: number, url: () => string}} */
export function mapImage(world) {
  if (cached && cached.world === world) return cached.image;
  const b = world.bounds;
  const W = Math.round(b.maxX - b.minX);
  const H = Math.round(b.maxZ - b.minZ);

  // 1 sample per metre, drawn smoothed at PX pixels per metre
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const sg = small.getContext('2d');
  const img = sg.createImageData(W, H);
  const pal = new Map(world.zones.map((z) => [z.id, [hex(z.palette?.[0] || '#8ac25a'), hex(z.palette?.[1] || '#6a9a44')]]));
  const town = world.data.town;
  for (let j = 0; j < H; j++) {
    const z = b.minZ + j + 0.5;
    for (let i = 0; i < W; i++) {
      const x = b.minX + i + 0.5;
      const h = world.terrainY(x, z);
      const dx = world.terrainY(x + 1, z) - world.terrainY(x - 1, z);
      const dz = world.terrainY(x, z + 1) - world.terrainY(x, z - 1);
      const [light, dark] = pal.get(world.zoneAt(x, z).id);
      // patchy grass from a cheap hash so big zones do not look flat
      const n = Math.sin(x * 0.37 + Math.sin(z * 0.21) * 2) * Math.sin(z * 0.29 + x * 0.05);
      let c = mix(light, dark, 0.35 + n * 0.25);
      const slope = Math.hypot(dx, dz) / 2;
      if (slope > 0.75) c = mix(c, ROCK, Math.min(1, (slope - 0.75) * 2.5));
      if (Math.hypot(x - town.centre[0], z - town.centre[1]) < town.plazaRadius) c = PLAZA;
      const rd = world.roadDist(x, z);
      if (rd < 0.6) c = mix(c, ROAD, Math.min(1, (0.6 - rd) / 1.2));
      // hill shade: light from the north-west (slopes facing -x/-z are lit), high ground a bit lighter
      const shade = 0.93 + Math.max(-0.3, Math.min(0.3, (dx + dz) * 0.18)) + Math.max(-0.1, Math.min(0.12, h * 0.018));
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      if (world.isWater(x, z)) {
        const depth = Math.max(0, world.waterLevel - h);
        c = mix(SHALLOW, DEEP, Math.min(1, depth / 1.6));
      }
      const k = (j * W + i) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = W * PX;
  canvas.height = H * PX;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, canvas.width, canvas.height);
  const tx = (x) => (x - b.minX) * PX;
  const tz = (z) => (z - b.minZ) * PX;

  const poly = (box, fill, stroke) => {
    const pts = [
      [-box.hx, -box.hz],
      [box.hx, -box.hz],
      [box.hx, box.hz],
      [-box.hx, box.hz],
    ].map(([lx, lz]) => fromBoxLocal(box, lx, lz));
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(tx(p.x), tz(p.z)) : g.moveTo(tx(p.x), tz(p.z))));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 1;
      g.stroke();
    }
  };
  const dot = (x, z, r, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(tx(x), tz(z), r, 0, Math.PI * 2);
    g.fill();
  };

  // landmarks
  for (const c of world.circles) {
    if (c.type === 'tree' || c.type === 'willow' || c.type === 'birch') dot(c.x, c.z, 1.6 * PX * (c.scale || 1), 'rgba(40,92,40,0.55)');
    else if (c.type === 'pine') dot(c.x, c.z, 1.3 * PX * (c.scale || 1), 'rgba(28,74,44,0.6)');
    else if (c.type === 'rock' || c.type === 'boulder') dot(c.x, c.z, c.r * PX, 'rgba(120,116,104,0.8)');
    else if (c.type === 'crystal') dot(c.x, c.z, c.r * PX, 'rgba(150,120,230,0.9)');
    else if (c.type.startsWith('pillar') || c.type === 'ruin_block' || c.type === 'statue' || c.type === 'arch_pillar') dot(c.x, c.z, Math.max(2, c.r * PX), 'rgba(214,208,228,0.95)');
  }
  for (const bx of world.boxes) {
    if (bx.type === 'house') poly(bx, '#c8744a', '#5a3322');
    else if (bx.type === 'stall' || bx.type === 'tent') poly(bx, '#e8d8b0', '#6a5a3a');
    else if (bx.type === 'workbench') poly(bx, '#8a5a32');
    else if (bx.type === 'ruin_wall') poly(bx, 'rgba(214,208,228,0.95)');
    else if (bx.type === 'fence') poly(bx, 'rgba(120,80,40,0.7)');
  }
  for (const br of world.bridges) poly(br, '#b07a44', '#5a3a1a');

  cached = {
    world,
    image: {
      canvas,
      px: PX,
      minX: b.minX,
      minZ: b.minZ,
      width: W,
      height: H,
      url() {
        if (!this._url) this._url = canvas.toDataURL('image/jpeg', 0.85);
        return this._url;
      },
    },
  };
  return cached.image;
}
