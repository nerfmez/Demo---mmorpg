// Pearlshell Grotto (data/dungeons/shell-grotto.json): every room is reached on foot, stairs join
// both levels, ledges are walls, props block, and the shell's secret door opens only once found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDungeon, reachableFrom, smoothPath, turn } from '../../src/core/dungeon.js';
import { caveSourceHash } from '../../scripts/grotto-cave-input.mjs';

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

const TRACE = JSON.parse(readFileSync(new URL('../../data/dungeons/shell-grotto-trace.json', import.meta.url), 'utf8'));
/** A concept pixel in map metres (the tracing's own conversion). */
const px = ([x, y]) => [(x - TRACE.origin[0]) * TRACE.scale, (y - TRACE.origin[1]) * TRACE.zScale];
const centroid = (f) => [f.pts.reduce((a, p) => a + p[0], 0) / f.pts.length, f.pts.reduce((a, p) => a + p[1], 0) / f.pts.length];

test('the inside is traced from the concept: every zone has floor, and the high and low places are reached', () => {
  for (const z of TRACE.zones) assert.ok(inside.floors.some((f) => f.id.startsWith(`${z.id}-`)), `${z.id} has no traced floor`);
  for (const id of ['hoard-floor-0', 'dais-floor-0', 'pool-stone-0', 'throne-water-0', 'temple-water-0']) {
    const f = inside.floors.find((g) => g.id === id);
    assert.ok(f, `${id} missing`);
    assert.ok(reachedNear('inside', centroid(f), 6), `${id} not reached`);
  }
});

test('stairs are gentle and joined to the floors at both ends', () => {
  for (const f of inside.floors.filter((g) => g.shape === 'stairs')) {
    assert.ok(Math.abs(f.y1 - f.y0) / f.length <= FILE.maxSlope, `${f.id} too steep`);
    const ux = (f.b[0] - f.a[0]) / f.length, uz = (f.b[1] - f.a[1]) / f.length;
    const above = inside.surfaceAt(f.b[0] + ux * 0.6, f.b[1] + uz * 0.6);
    assert.ok(above?.walkable && Math.abs(above.y - f.y1) <= FILE.maxStep, `${f.id} top not joined`);
    // walk the flight from its foot to its head: every step small, ending on the upper floor
    const pos = { x: f.a[0] + ux * 0.3, z: f.a[1] + uz * 0.3, y: f.y0 + (f.y1 - f.y0) * (0.3 / f.length) };
    let last = pos.y;
    for (let i = 0; i < 400 && Math.hypot(pos.x - f.b[0], pos.z - f.b[1]) > 0.2; i++) {
      inside.move(pos, ux * 0.1, uz * 0.1);
      assert.ok(Math.abs(pos.y - last) <= FILE.maxStep, `${f.id}: a jump of ${pos.y - last}`);
      last = pos.y;
    }
    assert.ok(Math.abs(pos.y - f.y1) <= FILE.maxStep, `${f.id} climbs to ${pos.y}, not ${f.y1}`);
  }
});

test('a ledge is a wall: walking off the corridor toward the coral pool stays on the corridor', () => {
  const [x, z] = px([760, 420]), [, zPool] = px([760, 540]);
  const pos = { x, z, y: inside.landY(x, z) };
  assert.equal(pos.y, 0, 'starts on the corridor');
  for (let i = 0; i < 200; i++) inside.move(pos, 0, 0.1);
  assert.equal(pos.y, 0);
  assert.ok(pos.z < zPool);
  // one long frame cannot skip the ledge either
  const fast = { x, z, y: 0 };
  inside.move(fast, 0, 12);
  assert.equal(fast.y, 0);
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

test('the cave model was built from this map (rebuild: blender -b --python scripts/blender/grotto-cave.py)', () => {
  // the walls and paving of `cave` rooms are modelled from the floor outlines; a changed outline
  // with a stale model would leave walls standing in the room or gaps at its edge
  const glb = readFileSync(new URL('../../public/models/grotto/grotto-cave.glb', import.meta.url));
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  assert.equal(gltf.scenes[0].extras?.source, caveSourceHash(FILE), 'grotto-cave.glb is stale');
  const nodes = new Set(gltf.nodes.map((n) => n.name));
  const caves = FILE.inside.floors.filter((f) => f.style === 'cave');
  assert.ok(caves.length > 0, 'the entrance is a cave');
  for (const f of caves) for (const part of ['cavefloor', 'cavewall', 'caverock']) assert.ok(nodes.has(`${part}_${f.id}`), `${part}_${f.id}`);
});

test('the painted props hold every piece the map asks for (blender -b --python scripts/blender/grotto-props.py)', () => {
  // src/render/grotto/painted.js draws prop_<name>_<kind>; props.js asks for these names
  const glb = readFileSync(new URL('../../public/models/grotto/grotto-props.glb', import.meta.url));
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const byProp = new Map();
  for (const n of gltf.nodes) {
    const m = /^prop_(\w+?)_(flat|smooth|shine|shinesm|glow)$/.exec(n.name);
    if (m) byProp.set(m[1], [...(byProp.get(m[1]) || []), { kind: m[2], mesh: gltf.meshes[n.mesh] }]);
  }
  const names = ['crystal_s', 'crystal_m', 'crystal_l', 'coral_tree', 'chest', 'chest_open', 'candles', 'barrel', 'crate', 'post',
    'pillar', 'pillar_broken', 'pillar_fallen', 'arch', 'arch_shell', 'arch_sealed', 'pearl_altar'];
  for (const name of names) {
    const pieces = byProp.get(name);
    assert.ok(pieces?.some((p) => p.kind !== 'glow'), `${name} has a lit piece`);
    // each stands on its own foot: its lowest point is the floor (y = 0)
    const low = Math.min(...pieces.map((p) => gltf.accessors[p.mesh.primitives[0].attributes.POSITION].min[1]));
    assert.ok(Math.abs(low) < 0.01, `${name} stands on y = 0 (${low})`);
  }
  assert.ok(byProp.get('arch_sealed').some((p) => p.kind === 'glow'), 'the sealed door has its glowing seal');
  assert.ok(byProp.get('candles').some((p) => p.kind === 'glow'), 'the candles have flames');
});

test('the painted corals hold a body and a glow for every coral the cave rooms grow (blender -b --python scripts/blender/grotto-corals.py)', () => {
  // src/render/grotto/corals.js asks for these by name; one missing would leave a coral without its glow
  const glb = readFileSync(new URL('../../public/models/grotto/glow-corals.glb', import.meta.url));
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const nodes = new Set(gltf.nodes.map((n) => n.name));
  for (const name of ['purple', 'blue', 'teal', 'tubes', 'bubbles', 'pink']) {
    for (const part of ['body', 'glow']) assert.ok(nodes.has(`coral_${name}_${part}`), `coral_${name}_${part}`);
  }
  // each stands on its own foot: the body starts at the floor (y = 0)
  for (const m of gltf.meshes.filter((m) => m.name.endsWith('_body'))) {
    assert.ok(Math.abs(gltf.accessors[m.primitives[0].attributes.POSITION].min[1]) < 0.01, `${m.name} stands on y = 0`);
  }
});
