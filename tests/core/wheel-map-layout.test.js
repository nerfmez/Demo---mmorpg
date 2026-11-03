// The wheel Job Tree's field-journal maps (src/ui/wheel-map-layout.js, presentation only): every node of
// the tree stands on a map, places on one map never sit on each other, and every road joins a node to a
// parent the rules name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookPages, pageMap, pageOf, radius } from '../../src/ui/wheel-map-layout.js';

const tree = JSON.parse(readFileSync(new URL('../../data/jobtree.json', import.meta.url), 'utf8'));
const N = tree.nodes;

test('every node has a map, and pageOf finds it there', () => {
  const placed = new Set();
  for (const p of bookPages(tree)) {
    const m = pageMap(tree, p);
    if (!m) continue;
    for (const id of Object.keys(m.coords)) placed.add(id);
    for (const d of m.destinations) placed.add(tree.jobs[d.job].entry);
  }
  for (const id of Object.keys(N)) {
    assert.ok(placed.has(id), id);
    const page = bookPages(tree).find((p) => p.id === pageOf(tree, id));
    const m = pageMap(tree, page);
    assert.ok(m.coords[id] || m.destinations.some((d) => tree.jobs[d.job].entry === id), `${id} on ${page.id}`);
  }
});

test('places on a map keep clear of each other and of the map edge, and roads follow the rules', () => {
  for (const p of bookPages(tree)) {
    const m = pageMap(tree, p);
    if (!m) continue;
    const pts = Object.entries(m.coords).map(([id, [x, y]]) => [id, x, y, radius(N[id])]);
    for (const d of m.destinations) pts.push([tree.jobs[d.job].entry, d.x, d.y, radius(N[tree.jobs[d.job].entry])]);
    for (const [id, x, y, r] of pts) assert.ok(x - r >= 0 && x + r <= m.width && y - r >= 0 && y + r + 34 <= m.height, `${p.id} ${id} inside`);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const [a, ax, ay, ar] = pts[i], [b, bx, by, br] = pts[j];
      assert.ok(Math.hypot(ax - bx, ay - by) >= ar + br + 40, `${p.id}: ${a} and ${b} too close`);
    }
    for (const [a, b] of m.edges) assert.ok([...(N[b].requires || []), ...(N[b].requiresAny || [])].includes(a), `${p.id} road ${a}->${b}`);
  }
});
