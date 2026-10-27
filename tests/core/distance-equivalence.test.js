import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../src/core/data-node.js';
import { distToPolyline, distToSegment, pointInPolygon } from '../../src/core/math.js';
import { cityRoadDistance } from '../../src/core/city.js';

// Startup speed-ups must not move a single seeded prop: the faster distance queries
// return exactly (Object.is) what the plain loops they replace returned.
const world = loadData().world;
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('distToPolyline equals the per-segment distToSegment minimum', () => {
  for (let n = 0; n < 5000; n++) {
    const pts = Array.from({ length: 2 + (n % 7) }, () => [rnd() * 200 - 100, rnd() * 200 - 100]);
    if (n % 5 === 0) pts.push([...pts.at(-1)]); // a zero-length segment
    const x = rnd() * 240 - 120, z = rnd() * 240 - 120;
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(x, z, ...pts[i], ...pts[i + 1]).d);
    assert.ok(Object.is(distToPolyline(x, z, pts), best), `${x},${z}`);
  }
});

test('cityRoadDistance equals the full edge scan', () => {
  const city = world.city;
  const brute = (x, z, reach = 8) => {
    let best = Infinity;
    for (const road of city.roads) {
      if (road.name.startsWith('Market ')) continue;
      const b = road.bounds;
      if (x < b[0] - reach || x > b[1] + reach || z < b[2] - reach || z > b[3] + reach) continue;
      let edge = Infinity, inside = false;
      for (const loop of road.loops) {
        if (pointInPolygon(loop, x, z)) inside = !inside;
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i], c = loop[(i + 1) % loop.length], dx = c[0] - a[0], dz = c[1] - a[1];
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
          edge = Math.min(edge, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
        }
      }
      best = Math.min(best, inside ? -edge : edge);
    }
    return best;
  };
  const xs = city.roads.flatMap(r => [r.bounds[0], r.bounds[1]]), zs = city.roads.flatMap(r => [r.bounds[2], r.bounds[3]]);
  const [x0, x1, z0, z1] = [Math.min(...xs) - 10, Math.max(...xs) + 10, Math.min(...zs) - 10, Math.max(...zs) + 10];
  let measured = 0;
  for (let n = 0; n < 6000; n++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), reach = [0.8, 8, undefined][n % 3];
    if (city.propertyBoundary) continue; // the floor gate is shared by both forms
    const d = cityRoadDistance(city, x, z, reach);
    assert.ok(Object.is(d, brute(x, z, reach)), `${x},${z}`);
    if (d < Infinity) measured++;
  }
  if (!city.propertyBoundary) assert.ok(measured > 100);
});
