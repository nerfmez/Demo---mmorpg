// Pearlshell Grotto (data/dungeons/shell-grotto.json): every room is reached on foot, stairs join
// both levels, ledges are walls, props block, and the shell's secret door opens only once found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDungeon, reachableFrom, smoothPath, turn } from '../../src/core/dungeon.js';

const FILE = JSON.parse(readFileSync(new URL('../../data/dungeons/shell-grotto.json', import.meta.url), 'utf8'));
const inside = createDungeon(FILE.inside, FILE);
const outside = createDungeon(FILE.outside, FILE);
const maps = { inside, outside };
const reach = { inside: reachableFrom(inside, FILE.inside.spawn), outside: reachableFrom(outside, FILE.outside.spawn) };

/** Some reached cell within `r` of (x, z). */
const reachedNear = (part, [x, z], r) => {
  for (let dx = -r; dx <= r; dx += 0.5) for (let dz = -r; dz <= r; dz += 0.5) if (dx * dx + dz * dz <= r * r && reach[part](x + dx, z + dz)) return true;
  return false;
};

test('the spawns stand on walkable ground and every named area is reached on foot', () => {
  for (const part of ['inside', 'outside']) {
    const [x, z] = FILE[part].spawn;
    assert.ok(Number.isFinite(maps[part].landY(x, z)), `${part} spawn`);
    for (const r of FILE[part].regions) assert.ok(reachedNear(part, r.at, r.r / 2), `${part}: ${r.id} not reached`);
  }
});

test('the high places are reached: altar top, boss dais, treasure room and the coral island', () => {
  for (const id of ['altar-top', 'dais', 'hoard', 'island', 'alcove']) {
    const f = inside.floors.find((g) => g.id === id);
    assert.ok(reachedNear('inside', f.c, (f.r ?? f.rx) * 0.9), `${id} not reached`);
  }
});

test('stairs are gentle and joined to the floors at both ends', () => {
  for (const f of inside.floors.filter((g) => g.shape === 'stairs')) {
    assert.ok(Math.abs(f.y1 - f.y0) / f.length <= FILE.maxSlope, `${f.id} too steep`);
    const ux = (f.b[0] - f.a[0]) / f.length, uz = (f.b[1] - f.a[1]) / f.length;
    const below = inside.surfaceAt(f.a[0] - ux * 0.6, f.a[1] - uz * 0.6), above = inside.surfaceAt(f.b[0] + ux * 0.6, f.b[1] + uz * 0.6);
    assert.ok(below?.walkable && Math.abs(below.y - f.y0) <= FILE.maxStep, `${f.id} bottom not joined`);
    assert.ok(above?.walkable && Math.abs(above.y - f.y1) <= FILE.maxStep, `${f.id} top not joined`);
    assert.ok(reach.inside(f.a[0] + ux * f.length / 2, f.a[1] + uz * f.length / 2), `${f.id} middle not reached`);
  }
});

test('a ledge is a wall: walking off the corridor toward the pool stays on the corridor', () => {
  const pos = { x: -10, z: -25.5, y: 1.4 };
  for (let i = 0; i < 200; i++) inside.move(pos, 0, 0.2);
  assert.equal(pos.y, 1.4);
  assert.ok(inside.surfaceAt(pos.x, pos.z).floor.id === 'corridor', 'still on the corridor');
  // one long frame cannot skip the ledge either
  const fast = { x: -10, z: -25.5, y: 1.4 };
  inside.move(fast, 0, 12);
  assert.equal(fast.y, 1.4);
  // deep water is never stood in
  assert.ok(Number.isNaN(inside.landY(-18, 2)));
});

test('stairs carry the hero between levels smoothly', () => {
  const pos = { x: -43, z: 0, y: 0 };
  let last = pos.y;
  for (let i = 0; i < 120 && pos.z > -14; i++) {
    inside.move(pos, 0.03, -0.12);
    assert.ok(Math.abs(pos.y - last) <= FILE.maxStep);
    last = pos.y;
  }
  assert.equal(pos.y, 1.4, 'arrived on the junction');
});

test('props block and the hero slides around them', () => {
  const pillar = FILE.inside.props.find((p) => p.type === 'pillar');
  const b = inside.blockers.find((q) => q.x === pillar.at[0] && q.z === pillar.at[1]);
  assert.ok(b);
  assert.ok(inside.blockedAt(pillar.at[0], pillar.at[1]));
  const [x, z] = inside.pushOut(pillar.at[0] + 0.1, pillar.at[1]);
  assert.ok(Math.hypot(x - pillar.at[0], z - pillar.at[1]) >= b.r + FILE.heroRadius - 1e-9);
  // an arch blocks at its legs and leaves the middle open
  const arch = FILE.inside.props.find((p) => p.type === 'arch' && p.rot === 0);
  assert.ok(!inside.blockedAt(arch.at[0], arch.at[1]));
  const [lx, lz] = turn(-2.6, 0, arch.rot);
  assert.ok(inside.blockedAt(arch.at[0] + lx, arch.at[1] + lz));
});

test('every prop type is known, sits inside the bounds and on a floor', () => {
  for (const part of ['inside', 'outside']) {
    const { minX, maxX, minZ, maxZ } = FILE[part].bounds;
    for (const p of FILE[part].props) {
      assert.ok(FILE.propTypes[p.type], `${p.type} unknown`);
      assert.ok(p.at[0] > minX && p.at[0] < maxX && p.at[1] > minZ && p.at[1] < maxZ, `${p.type} at ${p.at} outside`);
      // a prop built into the wall stands at the rim with walkable floor 2 m in front of it
      const [fx, fz] = FILE.propTypes[p.type].edge ? turn(0, 2, p.rot ?? 0) : [0, 0];
      const s = maps[part].surfaceAt(p.at[0] + fx, p.at[1] + fz);
      assert.ok(s && (!FILE.propTypes[p.type].edge || s.walkable), `${part} ${p.type} at ${p.at} over the void`);
    }
  }
});

test('the giant shell hides a secret door: it opens only after inspecting it, and both doors land on reached ground', () => {
  const mouth = FILE.outside.links.find((l) => l.secret);
  const found = new Set();
  assert.equal(outside.linkAt(mouth.at[0], mouth.at[1], found), null, 'hidden before it is found');
  const near = [mouth.at[0] - 3, mouth.at[1] + 2];
  assert.equal(outside.inspectAt(near[0], near[1], found)?.id, mouth.id);
  assert.equal(outside.inspectAt(-15, 10, found), null, 'too far to notice');
  found.add(mouth.id);
  assert.equal(outside.inspectAt(near[0], near[1], found), null, 'found once');
  assert.equal(outside.linkAt(mouth.at[0], mouth.at[1], found)?.to, 'inside');
  for (const part of ['inside', 'outside']) {
    for (const l of FILE[part].links) {
      assert.ok(reachedNear(part, l.at, 1.5), `${l.id} cannot be walked to`);
      assert.ok(reach[l.to](l.spawn[0], l.spawn[1]), `${l.id} lands on unreached ground`);
      assert.equal(maps[l.to].linkAt(l.spawn[0], l.spawn[1], new Set([mouth.id])), null, `${l.id} lands inside another door`);
    }
  }
});

test('paths are smoothed but keep their ends', () => {
  const p = smoothPath([[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(p[0], [0, 0]);
  assert.deepEqual(p[p.length - 1], [10, 10]);
  assert.ok(p.length > 8);
});
