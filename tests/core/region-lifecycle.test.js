// Production generator/disposal code, with instrumented Three.js/loader doubles.
// These are lifecycle contracts, NOT WebGL, GPU-byte, frame-time or iPad tests.
// Optional REGION_LIFECYCLE_SOURCE points to another src/render directory for A/B.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.env.REGION_LIFECYCLE_SOURCE || fileURLToPath(new URL('../../src/render/', import.meta.url));
function load(name, imports, exports) {
  const text = readFileSync(resolve(source, name), 'utf8');
  // Import bindings alone are injected; function implementations are not rewritten.
  const code = text.replace(/^import [^\n]*\n/gm, '').replace(/^export /gm, '');
  assert.doesNotMatch(code, /^\s*import\b/m, 'update explicit fixture loader for multi-line imports');
  return new Function(...Object.keys(imports), `${code}\nreturn {${exports}};`)(...Object.values(imports));
}

function fixture({ chunks = 2, failure = null } = {}) {
  const allocations = [], events = [];
  class Resource {
    constructor(kind) { this.kind = kind; this.userData = {}; this.disposes = 0; allocations.push(this); }
    dispose() { this.disposes++; events.push(`dispose:${this.kind}`); }
  }
  class Vector {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    setFromMatrixPosition() { return this.set(1, 2, 3); }
    applyMatrix4() { return this; }
  }
  class Node {
    constructor() { this.children = []; this.userData = {}; this.position = new Vector(); this.scale = new Vector(); this.rotation = {}; this.matrixWorld = { multiplyMatrices() {} }; }
    add(...nodes) { for (const n of nodes) { n.removeFromParent(); n.parent = this; this.children.push(n); } return this; }
    remove(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parent = null; }
    removeFromParent() { this.parent?.remove(this); }
    traverse(fn) { fn(this); for (const n of [...this.children]) n.traverse(fn); }
    updateMatrixWorld() {}
  }
  class Geometry extends Resource {
    constructor() { super('geometry'); this.attributes = {}; }
    setAttribute(k, v) { this.attributes[k] = v; return this; }
    deleteAttribute(k) { delete this.attributes[k]; }
  }
  class Attribute { constructor(array, itemSize, normalized = false) { Object.assign(this, { array, itemSize, normalized }); } }
  class Material extends Resource {
    constructor(options = {}) { super('material'); Object.assign(this, options); }
  }
  class ShaderMaterial extends Material { constructor(options) { super(options); this.kind = 'bake-material'; } }
  class Target extends Resource { constructor() { super('target'); } }
  class Mesh extends Node { constructor(geometry, material) { super(); Object.assign(this, { geometry, material }); } }
  class Color { constructor(value = 0) { this.value = value; } }
  const THREE = { Group: Node, Scene: Node, Matrix4: class {}, Vector3: Vector, Color,
    OrthographicCamera: Node, BufferGeometry: Geometry, BufferAttribute: Attribute,
    InstancedBufferAttribute: Attribute, ShaderMaterial, WebGLRenderTarget: Target,
    Points: Mesh, Mesh, Sprite: class extends Mesh { constructor(mat) { super(null, mat); this.isSprite = true; } },
    SpriteMaterial: Material, OctahedronGeometry: Geometry, AdditiveBlending: 2 };
  const { disposeObject } = load('dispose.js', {}, 'disposeObject');
  const root = new Node(), meshes = [];
  function makeGrass() {
    const g = new Geometry();
    for (const [k, n] of Object.entries({ aGrassLight: 3, aGrassDark: 3, aGrassNormal: 3, aGrassSplat: 4, aGrassCoast: 2, aGrassY: 1, aGrassTown: 1 })) g.setAttribute(k, new Attribute(new Float32Array(n * 2), n));
    const mat = new Material({ userData: { groundBrush: {} } });
    const mesh = new Mesh(g, mat); Object.assign(mesh, { name: 'ground-blended-grass', count: 2, getMatrixAt() {} });
    meshes.push(mesh); root.add(mesh);
    return mesh;
  }
  for (let i = 0; i < chunks; i++) makeGrass();
  const sharedTexture = new Resource('shared-texture'); sharedTexture.userData.shared = true;
  const initialTarget = { name: 'caller-target' };
  const renderer = {
    target: initialTarget, clearColor: 0x123456, clearAlpha: 0.7, mode: 0, reads: 0,
    getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; },
    getClearAlpha() { return this.clearAlpha; }, getClearColor(c) { c.value = this.clearColor; return c; },
    setClearColor(c, a) { this.clearColor = c instanceof Color ? c.value : c; this.clearAlpha = a; },
    clear() {},
    render(scene) { if (failure === 'render') throw Error('injected render failure'); this.mode = scene.children[0].material.uniforms.uMode.value; },
    readRenderTargetPixels(_t, _x, _y, _w, _h, out) { this.reads++; if (failure === 'readback') throw Error('injected readback failure'); out.fill(this.mode ? 128 : 64); },
  };
  const { bakeGrassSteps } = load('grass.js', { THREE, GROUND_COLOR_GLSL: '// fixture shader',
    groundFieldUniforms: () => ({ uField0: { value: sharedTexture } }),
    prepareGrassCulling: mesh => { mesh.userData.prepared = true; },
  }, 'bakeGrassSteps');
  const world = { data: { id: 'fixture-map', town: { workbench: [1, 2], trainer: [3, 4], residents: [] }, city: { enabled: false } }, groundY: () => 0, boxes: [], waterLevel: 0 };
  const remaining = kind => allocations.filter(r => r.kind === kind && !r.disposes).length;
  const externalState = () => ({ target: renderer.target, color: renderer.clearColor, alpha: renderer.clearAlpha });
  return { THREE, Node, Geometry, Material, Mesh, root, meshes, world, renderer, bakeGrassSteps, disposeObject,
    allocations, events, remaining, sharedTexture, initialTarget, externalState };
}

function regionFixture(options = {}) {
  const f = fixture(options);
  let cityResolve, kitResolve, townCalls = 0, cacheReleases = 0, terrainClosed = 0, environmentClosed = 0;
  const cityPromise = new Promise(r => { cityResolve = r; });
  const kitPromise = new Promise(r => { kitResolve = r; });
  const terrain = new f.Node(); terrain.add(new f.Mesh(new f.Geometry(), new f.Material()));
  const env = { root: f.root, waypoints: new Map() };
  const api = load('region.js', {
    THREE: f.THREE,
    terrainSteps: function* () { try { yield; return { group: terrain }; } finally { terrainClosed++; } },
    environmentSteps: function* () { try { yield; return env; } finally { environmentClosed++; } },
    createWater: () => new f.Node(), releaseGroundCaches: () => { cacheReleases++; f.events.push('release:cache'); },
    batchStatic: () => ({ before: 3, after: 1 }), bakeGrassSteps: f.bakeGrassSteps, attachWindShadow: () => {},
    buildHumanoid: () => ({ root: new f.Node(), scarf: { mesh: new f.Mesh(new f.Geometry(), new f.Material()) } }),
    HumanoidAnimator: class {}, residentTool: () => new f.Node(),
    loadCity: () => cityPromise, loadTownKit: () => { townCalls++; return kitPromise; },
    disposeObject: f.disposeObject, beginRegion: () => ({ value: new f.THREE.Vector3() }), useRegion: () => {},
    toon: () => new f.Material(), glowTexture: () => f.sharedTexture,
  }, 'regionSteps,buildRegion,disposeRegion');
  const view = { renderer: f.renderer, vfx: { sprite: () => new f.Node() } };
  return Object.assign(f, api, { view, terrain, cityResolve, kitResolve,
    counts: () => ({ townCalls, cacheReleases, terrainClosed, environmentClosed }) });
}
const drain = g => { for (;;) { const r = g.next(); if (r.done) return r.value; } };
const microtasks = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

for (const how of ['return', 'throw']) test(`grass ${how} after a chunk disposes its bake material`, () => {
  const f = fixture(), g = f.bakeGrassSteps(f.renderer, f.root, f.world);
  assert.equal(g.next().done, false);
  if (how === 'return') g.return(); else assert.throws(() => g.throw(Error('cancelled')), /cancelled/);
  assert.equal(f.remaining('bake-material'), 0);
  assert.equal(f.remaining('target'), 0);
  assert.equal(f.sharedTexture.disposes, 0);
});
for (const failure of ['render', 'readback']) test(`${failure} failure restores caller state and frees temporary resources`, () => {
  const f = fixture({ failure }), state = f.externalState();
  assert.throws(() => f.bakeGrassSteps(f.renderer, f.root, f.world).next(), /injected/);
  assert.deepEqual(f.externalState(), state);
  assert.equal(f.remaining('bake-material'), 0); assert.equal(f.remaining('target'), 0);
  assert.equal(f.remaining('geometry'), f.meshes.length, 'only caller grass geometries remain');
  assert.equal(f.sharedTexture.disposes, 0);
});
test('normal bake retains both colour outputs, all chunks and caller state at every yield', () => {
  const f = fixture(), state = f.externalState(), g = f.bakeGrassSteps(f.renderer, f.root, f.world);
  let yields = 0;
  for (;;) { const r = g.next(); assert.deepEqual(f.externalState(), state); if (r.done) { assert.equal(r.value, 2); break; } yields++; }
  assert.equal(yields, 2); assert.equal(f.renderer.reads, 4);
  for (const m of f.meshes) {
    assert.deepEqual([...m.geometry.attributes.aGrassBase.array], Array(6).fill(64));
    assert.deepEqual([...m.geometry.attributes.aGrassLawn.array], Array(6).fill(128));
    assert.equal(m.geometry.attributes.aGrassBase.normalized, true);
    assert.equal(m.userData.prepared, true);
  }
  assert.equal(f.remaining('bake-material'), 0); assert.equal(f.remaining('target'), 0);
});
test('interleaved rendering state is snapshotted anew per chunk, never restored to an old target', () => {
  const f = fixture(), g = f.bakeGrassSteps(f.renderer, f.root, f.world); g.next();
  f.renderer.target = { name: 'second-caller' }; f.renderer.clearColor = 0xabcdef; f.renderer.clearAlpha = 0.3;
  const state = f.externalState(); g.next(); assert.deepEqual(f.externalState(), state);
  g.return(); assert.deepEqual(f.externalState(), state);
});
test('empty grass roots allocate no bake resources', () => {
  const f = fixture({ chunks: 0 }); assert.equal(drain(f.bakeGrassSteps(f.renderer, f.root, f.world)), 0);
  assert.equal(f.remaining('bake-material'), 0); assert.equal(f.remaining('target'), 0);
});
test('25 interrupted bakes do not accumulate undisposed bake materials (instrumented counters)', () => {
  let undisposed = 0;
  for (let i = 0; i < 25; i++) { const f = fixture(), g = f.bakeGrassSteps(f.renderer, f.root, f.world); g.next(); g.return(); undisposed += f.remaining('bake-material'); }
  assert.equal(undisposed, 0);
});
test('region cancellation forwards return through terrain and environment adapters', () => {
  for (const stage of ['terrain', 'environment']) {
    const f = regionFixture(), g = f.regionSteps(f.view, f.world);
    g.next(); if (stage === 'environment') { g.next(); g.next(); }
    g.return();
    assert.equal(f.counts()[stage + 'Closed'], 1); assert.equal(f.counts().cacheReleases, 1);
  }
});
test('cancelling during grass bake frees adopted sections after closing the GPU generator', () => {
  const f = regionFixture(), g = f.regionSteps(f.view, f.world);
  for (let i = 0; i < 30 && f.renderer.reads === 0; i++) assert.equal(g.next().done, false);
  assert.equal(f.renderer.reads, 2); g.return();
  assert.equal(f.remaining('bake-material'), 0); assert.equal(f.counts().cacheReleases, 1);
  assert.equal(f.meshes[0].geometry.disposes, 1); assert.equal(f.terrain.children[0].geometry.disposes, 1);
  assert.ok(f.events.indexOf('dispose:bake-material') < f.events.indexOf('release:cache'));
});
test('successful ownership transfer keeps the region live; disposal includes NPC scarves and is idempotent', async () => {
  const f = regionFixture(), r = f.buildRegion(f.view, f.world);
  assert.equal(r.disposed, false); assert.equal(f.counts().cacheReleases, 0);
  assert.equal(r.npcs.length, 2);
  f.cityResolve(null); f.kitResolve(null); await r.ready;
  f.disposeRegion(r); f.disposeRegion(r);
  for (const n of r.npcs) { assert.equal(n.scarf.mesh.geometry.disposes, 1); assert.equal(n.scarf.mesh.material.disposes, 1); }
  assert.equal(f.counts().cacheReleases, 1);
});
test('a late city result is discarded and cannot start an obsolete town load or evict new cache state', async () => {
  const f = regionFixture(), r = f.buildRegion(f.view, f.world), cityRoot = new f.Node();
  const geometry = new f.Geometry(); geometry.userData.shared = true;
  const material = new f.Material(); cityRoot.add(new f.Mesh(geometry, material));
  f.disposeRegion(r); const before = r.root.children.length;
  f.cityResolve({ root: cityRoot, stats: {} }); f.kitResolve(null); await r.ready;
  assert.equal(f.counts().townCalls, 0); assert.equal(f.counts().cacheReleases, 1);
  assert.equal(r.root.children.length, before); assert.equal(cityRoot.parent, undefined);
  assert.equal(geometry.disposes, 0); assert.equal(material.disposes, 1);
});
test('an already-started town load may finish, but a disposed region never attaches it', async () => {
  const f = regionFixture(), r = f.buildRegion(f.view, f.world);
  f.cityResolve(null); await microtasks(); assert.equal(f.counts().townCalls, 1);
  f.disposeRegion(r);
  const kitRoot = new f.Node(), geometry = new f.Geometry(); kitRoot.add(new f.Mesh(geometry, new f.Material()));
  f.kitResolve({ root: kitRoot, stats: {} }); await r.ready;
  assert.equal(geometry.disposes, 1); assert.equal(r.townKitRoot, undefined);
});
test('live town completion still attaches the original result and stats', async () => {
  const f = regionFixture(), r = f.buildRegion(f.view, f.world), kitRoot = new f.Node(), stats = { kitNodes: 2 };
  f.cityResolve(null); f.kitResolve({ root: kitRoot, stats }); await r.ready;
  assert.equal(r.townKitRoot, kitRoot); assert.equal(kitRoot.parent, r.root); assert.equal(r.stats.townKit, stats);
  f.disposeRegion(r);
});
