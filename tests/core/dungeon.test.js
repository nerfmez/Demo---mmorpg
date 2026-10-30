// Pearlshell Grotto (data/dungeons/shell-grotto.json): every room is reached on foot, stairs join
// both levels, ledges are walls, props block, and the shell's secret door opens only once found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDungeon, reachableFrom, smoothPath, turn } from '../../src/core/dungeon.js';
import { caveSourceHash } from '../../scripts/grotto-cave-input.mjs';

const FILE = JSON.parse(readFileSync(new URL('../../data/dungeons/shell-grotto.json', import.meta.url), 'utf8'));
const inside = createDungeon(FILE.inside, FILE);
const maps = { inside };
const reach = { inside: reachableFrom(inside, FILE.inside.spawn) };

/** Some reached cell within `r` of (x, z). */
const reachedNear = (part, [x, z], r) => {
  for (let dx = -r; dx <= r; dx += 0.5) for (let dz = -r; dz <= r; dz += 0.5) if (dx * dx + dz * dz <= r * r && reach[part](x + dx, z + dz)) return true;
  return false;
};

test('the spawns stand on walkable ground and every named area is reached on foot', () => {
  for (const part of ['inside']) {
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

test('every flight is walked straight on and off at both ends: no slit, ledge, strip of water or prop at its head or foot', () => {
  for (const f of FILE.inside.floors.filter((g) => g.shape === 'stairs')) {
    const [ax, az] = f.a, [bx, bz] = f.b, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    // the middle lane from 2 m before one end to 2 m past the other; the side lanes within the aprons
    for (const [off, past] of [[0, 2], [-0.3, 1], [0.3, 1]]) for (const dir of [1, -1]) {
      const o = off * f.w, t0 = dir > 0 ? -past : L + past;
      const pos = { x: ax + ux * t0 - uz * o, z: az + uz * t0 + ux * o };
      pos.y = inside.landY(pos.x, pos.z);
      assert.ok(Number.isFinite(pos.y), `${f.id}: stand ${past} m off its end`);
      for (let k = 0; k < (L + 2 * past) * 12; k++) {
        const before = (pos.x - ax) * ux + (pos.z - az) * uz;
        inside.move(pos, ux * dir * 0.1, uz * dir * 0.1);
        const t = (pos.x - ax) * ux + (pos.z - az) * uz;
        if (dir > 0 ? t >= L + past : t <= -past) break;
        assert.ok((t - before) * dir > 0.02, `${f.id}: walking ${dir > 0 ? 'up' : 'down'} lane ${off} stops at ${t.toFixed(2)} of ${L.toFixed(2)} m`);
      }
    }
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
  for (const part of ['inside']) {
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

test('the pearl gate is walked to and leads back to the game, and the spawn is clear of it', () => {
  for (const l of FILE.inside.links) {
    assert.equal(l.to, 'game');
    assert.ok(reachedNear('inside', l.at, 1.5), `${l.id} cannot be walked to`);
  }
  const [x, z] = FILE.inside.spawn;
  assert.equal(inside.linkAt(x, z, new Set()), null, 'the spawn is not inside the door');
});

test('the old stone over the water has broken away: each break is wading water beside the stone, reached, and no walkway was cut in two', () => {
  const breaks = FILE.inside.props.filter((p) => p.type === 'rubble');
  assert.ok(breaks.length >= 8, `only ${breaks.length} breaks`);
  for (const b of breaks) {
    const s = inside.surfaceAt(...b.at);
    assert.ok(s && s.walkable && s.waterY != null && s.y < s.waterY, `break at ${b.at} is not in the water`);
    assert.ok(reachedNear('inside', b.at, 2), `break at ${b.at} not reached`);
    // the stone it broke from is right there
    const r = 1.4 * b.scale + 1.5;
    const near = [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]
      .some(([dx, dz]) => inside.surfaceAt(b.at[0] + dx, b.at[1] + dz)?.floor.id.includes('-stone-'));
    assert.ok(near, `break at ${b.at} is not beside the stone`);
  }
  // the hand-drawn walkways of the temple and the throne room are still one piece each
  for (const z of ['temple', 'throne']) {
    const shapes = TRACE.zones.find((q) => q.id === z).stone.length;
    assert.ok(inside.floors.filter((f) => f.id.startsWith(`${z}-stone-`)).length <= shapes, `${z} stone split into pieces`);
  }
});

test('the boss stage is one open room of stone and wading water: nothing blocks its middle, the boss stands on the dais facing the entry, and it is all walked', () => {
  const a = FILE.inside.arena;
  assert.ok(a, 'inside.arena');
  assert.ok(a.clear >= 8, `room to fight: ${a.clear} m clear`);
  assert.equal(inside.surfaceAt(...a.boss)?.floor.id, a.floor, 'the boss stands on the dais');
  // the whole clear circle is stage floor (stone or shallow water) and walked from its middle
  for (let ring = 0.25; ring <= 1; ring += 0.25) for (let k = 0; k < 24; k++) {
    const t = (k / 24) * Math.PI * 2, x = a.at[0] + Math.cos(t) * (a.clear - 0.5) * ring, z = a.at[1] + Math.sin(t) * (a.clear - 0.5) * ring;
    const s = inside.surfaceAt(x, z);
    assert.ok(s && a.floors.includes(s.floor.id) && s.walkable, `stage floor at ${x.toFixed(1)},${z.toFixed(1)}`);
    if (inside.blockers.some((b) => b.prop === 'bossSnail' && Math.hypot(x - b.x, z - b.z) < b.r + 1)) continue; // the boss's own body is solid
    assert.ok(reach.inside(x, z) || reachedNear('inside', [x, z], 1), `walked at ${x.toFixed(1)},${z.toFixed(1)}`);
  }
  // the dais meets the water in one step: no ledge or rock between them
  const dais = inside.floors.find((f) => f.id === a.floor), water = inside.floors.find((f) => f.id.startsWith('throne-water'));
  assert.ok(Math.abs(dais.y - water.y) <= FILE.maxStep, 'the dais steps straight into the water');
  for (const p of FILE.inside.props) {
    const block = FILE.propTypes[p.type].block, r = (typeof block === 'number' ? block : 0) * (p.scale ?? 1);
    if (!r || p.type === 'bigPearl') continue;
    assert.ok(Math.hypot(p.at[0] - a.at[0], p.at[1] - a.at[1]) - r >= a.clear - 0.01, `${p.type} at ${p.at} stands in the arena`);
  }
  const throne = FILE.inside.props.find((p) => p.type === 'bigPearl' && Math.hypot(p.at[0] - a.throne[0], p.at[1] - a.throne[1]) < 0.01);
  assert.ok(throne, 'the pearl altar is the throne behind the boss');
  // the boss's body (bossSnail circles, its shell trailing behind it) stays clear of the altar
  const body = Math.max(...FILE.propTypes.bossSnail.block.map(([dx, dz, r]) => Math.hypot(dx, dz) + r));
  assert.ok(Math.hypot(a.boss[0] - a.throne[0], a.boss[1] - a.throne[1]) > body + FILE.propTypes.bigPearl.block * throne.scale, 'the boss stands clear of the altar');
  const facing = [Math.sin(a.bossFacing), Math.cos(a.bossFacing)], toEntry = [a.entry[0] - a.boss[0], a.entry[1] - a.boss[1]];
  assert.ok(facing[0] * toEntry[0] + facing[1] * toEntry[1] > 0, 'the boss faces the entry');
  // the boss's own body is solid: its spot is reached at its side
  const boss = FILE.inside.props.find((p) => p.type === 'bossSnail'), reachBoss = boss ? body * (boss.scale ?? 1) + 1 : 1;
  const within = (q) => (Math.hypot(q[0] - a.boss[0], q[1] - a.boss[1]) < reachBoss ? reachBoss : 1);
  assert.ok(reachedNear('inside', a.at, within(a.at)) && reachedNear('inside', a.boss, reachBoss), 'the stage is reached on foot');
});

test('the boss sleeps in its shell until the hero talks to the pearl on the throne, which is walked to past it', () => {
  const a = FILE.inside.arena, pearl = FILE.inside.props.find((p) => p.talk);
  assert.ok(pearl && pearl.type === 'bigPearl' && Math.hypot(pearl.at[0] - a.throne[0], pearl.at[1] - a.throne[1]) < 0.01, 'the talking pearl is the throne');
  assert.ok(FILE.inside.props.some((p) => p.type === pearl.talk.wakes), `it wakes the ${pearl.talk.wakes}`);
  assert.ok(pearl.talk.labelTh && pearl.talk.lineTh, 'its button and its line');
  // a walked spot from which it answers, and nothing answers away from it
  let spot = null;
  for (let k = 0; k < 48 && !spot; k++) {
    const t = (k / 48) * Math.PI * 2, r = pearl.talk.r - 0.3, q = [pearl.at[0] + Math.cos(t) * r, pearl.at[1] + Math.sin(t) * r];
    if (!inside.blockedAt(...q) && reachedNear('inside', q, 0.5)) spot = q;
  }
  assert.ok(spot, 'the pearl is walked to');
  assert.equal(inside.talkAt(...spot)?.at, pearl.at);
  assert.equal(inside.talkAt(...spot, new Set([pearl.talk.wakes])), null, 'once the boss is awake the pearl has nothing more to say');
  assert.equal(inside.talkAt(...a.entry), null);
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
  // the other rooms are walled where they meet the void (their drops to water keep their ledges)
  const walled = FILE.inside.floors.filter((f) => f.walls);
  assert.ok(walled.length >= 5, 'every room beyond the entrance has walls');
  for (const f of walled) assert.ok(nodes.has(`cavewall_${f.id}`), `cavewall_${f.id}`);
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

// a Meshy monster file (scripts/blender/meshy_parts.py): every part each monster's motion moves
// (src/render/grotto/monsters.js draws mon_<monster>_<part> with its monster's texture), textured,
// each monster on its own foot and about as big as the hero or bigger
function checkMonsters(path, want) {
  const glb = readFileSync(new URL(path, import.meta.url));
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const parts = new Map();
  for (const n of gltf.nodes) {
    const m = /^mon_([a-z]+)_([a-z]+)$/.exec(n.name);
    if (m) parts.set(`${m[1]}.${m[2]}`, gltf.accessors[gltf.meshes[n.mesh].primitives[0].attributes.POSITION]);
  }
  for (const [mon, list] of Object.entries(want)) {
    for (const part of list) assert.ok(parts.has(`${mon}.${part}`), `${mon} has its ${part}`);
    // textured by Meshy: every part has its texture coordinates and a material with a picture
    for (const n of gltf.nodes.filter((q) => q.name?.startsWith(`mon_${mon}_`))) {
      const prim = gltf.meshes[n.mesh].primitives[0];
      assert.ok(prim.attributes.TEXCOORD_0 !== undefined && gltf.materials[prim.material].pbrMetallicRoughness.baseColorTexture, `${n.name} is textured`);
    }
    const acc = [...parts].filter(([k]) => k.startsWith(`${mon}.`)).map(([, a]) => a);
    const low = Math.min(...acc.map((a) => a.min[1])), size = Math.max(...acc.map((a) => Math.max(a.max[0] - a.min[0], a.max[2] - a.min[2])));
    assert.ok(Math.abs(low) < 0.01, `${mon} stands on y = 0 (${low})`);
    assert.ok(size > 1.4, `${mon} is ${size} m across`);
  }
}

test('the textured monsters hold every part their motion moves (blender -b --python scripts/blender/grotto-monsters.py)', () => {
  checkMonsters('../../public/models/grotto/grotto-monsters.glb', { fish: ['body', 'tail', 'finl', 'finr'], slug: ['body', 'cerata', 'pearls'],
    clam: ['shell', 'eye', 'pearls'], boss: ['body', 'eyel', 'eyer', 'pearl'], bossshell: ['shell', 'pearl'] });
  // every monster the map places is one of them, on a floor
  const kinds = { pearlFish: 'fish', pearlSlug: 'slug', eyeClam: 'clam', bossSnail: 'boss' };
  const placed = FILE.inside.props.filter((p) => p.type in kinds);
  for (const k of Object.keys(kinds)) assert.ok(placed.some((p) => p.type === k), `a ${k} is placed`);
  for (const p of placed) assert.ok(inside.surfaceAt(...p.at)?.walkable, `${p.type} at ${p.at} is on a floor`);
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
