import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coastSample, seaContains, pointInPolygon, clamp, distToPolyline, distToPolylineBounds } from '../../src/core/math.js';

const world = JSON.parse(readFileSync(new URL('../../data/world.json', import.meta.url)));

// The brute-force forms the indexed queries replace.
function bruteSample(sea, x, z) {
  const points = sea.coastline, kinds = sea.coastKinds;
  let nearest = Infinity, index = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const vx=b[0]-a[0], vz=b[1]-a[1], len2=vx*vx+vz*vz;
    const t=len2>0?clamp(((x-a[0])*vx+(z-a[1])*vz)/len2,0,1):0;
    const dx=x-a[0]-vx*t, dz=z-a[1]-vz*t, d=dx*dx+dz*dz;
    if (d < nearest) { nearest = d; index = i; }
  }
  return { distance: Math.sqrt(nearest) * (!pointInPolygon(points, x, z) ? -1 : 1), kind: kinds?.[index] || 'beach' };
}

test('indexed coastline queries equal the brute-force answers', () => {
  const sea = world.sea;
  assert.ok(sea.coastline.length > 64);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 20000; n++) {
    // Mostly near the coast, some far outside the grid.
    const far = n % 10 === 0, x = far ? -600 + rnd() * 1200 : -250 + rnd() * 560, z = far ? -600 + rnd() * 1200 : -210 + rnd() * 375;
    assert.deepEqual(coastSample(sea, x, z), bruteSample(sea, x, z), `${x},${z}`);
    assert.equal(seaContains(sea, x, z), !pointInPolygon(sea.coastline, x, z));
  }
  // Exactly on vertices and segment midpoints.
  for (let i = 0; i < sea.coastline.length - 1; i++) {
    const [ax, az] = sea.coastline[i], [bx, bz] = sea.coastline[i + 1];
    for (const [x, z] of [[ax, az], [(ax + bx) / 2, (az + bz) / 2]]) assert.deepEqual(coastSample(sea, x, z), bruteSample(sea, x, z));
  }
});

test('the polyline bounding-box distance never exceeds the true distance', () => {
  for (const road of world.roads) for (const [x, z] of [[0, 0], [-120, 60], [80, -90], [300, 300]])
    assert.ok(distToPolylineBounds(x, z, road.points) <= distToPolyline(x, z, road.points) + 1e-9);
});
