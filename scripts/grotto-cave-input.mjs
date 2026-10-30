// What scripts/blender/grotto-cave.py builds the cave from: every `style: "cave"` floor of the
// Pearlshell Grotto (data/dungeons/shell-grotto.json `inside`) and every floor with `walls`, its
// outline resampled every 0.4 m with the outward normal, and whether the hero walks on past each
// point (an opening to the next room, kept free of wall), the floor drops to a lower one there
// (water, a lower room) or it ends at the void (a wall). A cave floor is walled wherever it is not
// open and gets the old paving; a `walls` floor is walled only where it meets the void. The walk rules are the
// game's own (src/core/dungeon.js), so the walls stand exactly where the floor stops.
// Usage: node scripts/grotto-cave-input.mjs > input.json (the Blender script runs it itself).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createDungeon } from '../src/core/dungeon.js';

const STEP = 0.4;

/** The part of the map the cave model is built from; the model is stale when this changes. */
export function caveSource(grotto) {
  const inside = grotto.inside;
  const floors = inside.floors.filter((f) => f.style === 'cave' || f.walls)
    .map((f) => ({ id: f.id, y: f.y, pts: f.pts, holes: f.holes || [], paving: f.style === 'cave' }));
  const gates = (inside.props || []).filter((p) => p.type === 'shellGate').map((p) => ({ at: p.at, rot: p.rot }));
  return { floors, gates };
}

export function caveSourceHash(grotto) {
  return createHash('sha1').update(JSON.stringify(caveSource(grotto))).digest('hex').slice(0, 16);
}

function resample(ring) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const l = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < l; t += STEP) out.push([ax + ((bx - ax) * t) / l, az + ((bz - az) * t) / l]);
  }
  return out;
}

export function caveInput(grotto) {
  const map = createDungeon(grotto.inside, grotto);
  const src = caveSource(grotto);
  const out = { hash: caveSourceHash(grotto), step: STEP, floors: [], gates: src.gates };
  for (const f of src.floors) {
    const floor = map.floors.find((g) => g.id === f.id);
    const rings = [f.pts, ...f.holes];
    const edges = rings.map((ring) => {
      const pts = resample(ring);
      // the outward side: the one a short step off most points leaves this floor
      let votes = 0;
      const normal = (i, side) => {
        const [ax, az] = pts[(i - 1 + pts.length) % pts.length], [bx, bz] = pts[(i + 1) % pts.length];
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
        return [(side * dz) / l, (-side * dx) / l];
      };
      for (let i = 0; i < pts.length; i += 3) {
        const [nx, nz] = normal(i, 1), s = map.surfaceAt(pts[i][0] + nx * 0.6, pts[i][1] + nz * 0.6);
        votes += s?.floor === floor ? -1 : 1;
      }
      const side = votes >= 0 ? 1 : -1;
      // smooth the normals over a couple of metres so corners turn instead of folding
      const raw = pts.map((_, i) => normal(i, side));
      return pts.map(([x, z], i) => {
        let nx = 0, nz = 0;
        for (let k = -4; k <= 4; k++) {
          const [ax, az] = raw[(i + k + raw.length) % raw.length];
          nx += ax; nz += az;
        }
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        // past the edge: another floor the hero walks on at this level (an opening), a lower one (a drop), or nothing
        let open = false, drop = false, beyond = false;
        for (const d of [0.7, 1.4, 2.4]) {
          const s = map.surfaceAt(x + nx * d, z + nz * d);
          if (s && s.floor !== floor) beyond = true;
          if (d > 1.5) continue;
          if (s && s.floor !== floor && s.walkable && Math.abs(s.y - f.y) <= grotto.maxStep + 0.05) open = true;
          else if (s && s.floor !== floor && s.y < f.y - grotto.maxStep) drop = true;
        }
        // a wall with another room close behind it divides two rooms: it stays a low ridge, or it
        // would hide the room behind it from the camera (the concept's dividers are rubble banks)
        let divider = false;
        for (const d of [3.5, 5.5, 8, 11]) if (map.surfaceAt(x + nx * d, z + nz * d)) divider = true;
        return { x: +x.toFixed(3), z: +z.toFixed(3), nx: +nx.toFixed(4), nz: +nz.toFixed(4), open, drop, void: !beyond, divider };
      });
    });
    out.floors.push({ id: f.id, y: f.y, rings, edges, paving: f.paving });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const grotto = JSON.parse(readFileSync(new URL('../data/dungeons/shell-grotto.json', import.meta.url), 'utf8'));
  process.stdout.write(JSON.stringify(caveInput(grotto)));
}
