import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { createPresenceServer } from '../../server/presence.mjs';
import { presenceEndpoint } from '../../src/network/presence.js';
import { loadData } from '../../src/core/data-node.js';
import { createProtocol, PROTOCOL, WORLD_ID, presencePose } from '../../src/network/protocol.js';
import { OpenWorldGame } from '../../src/core/open-world-game.js';
const data = loadData();
const origin = 'http://localhost:4173';
const look = { hairStyle: 'messy', hair: '#262a44', skin: '#f6d2b5', eyes: '#2b2e44', scarf: '#cf3a30', tunic: '#f1e3cc' };
const gear = { weapon: 'rusty_sword', offhand: null, armor: 'travel_tunic', helm: null, gloves: null, boots: 'travel_boots' };
const pose = { x: -132, z: 80, facing: 0, moving: false };
const join = (map = 'azure-harbor-v1', room = 'lobby') => ({ type: 'join', map, room, pose, look, gear });
async function fixture(t, options = {}) {
  const app = createPresenceServer({ origins: [origin], ...options });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const port = app.server.address().port;
  t.after(() => app.close());
  return { app, port, connect: async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/presence`, { origin });
    const messages = []; ws.on('message', b => messages.push(JSON.parse(b))); await once(ws, 'open');
    ws.sendJSON = m => ws.send(JSON.stringify(m));
    ws.take = async type => {
      for (let i = 0; i < 150; i++) { const n = messages.findIndex(m => m.type === type); if (n >= 0) return messages.splice(n, 1)[0]; await new Promise(r => setTimeout(r, 10)); }
      throw new Error(`Missing ${type}`);
    };
    ws.messages = messages; return ws;
  } };
}
test('health, anonymous identity, movement, room/map separation, leave, reconnect', async t => {
  const { connect, port } = await fixture(t);
  const health = await fetch(`http://127.0.0.1:${port}/healthz`); assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, prototype: 'presence-v3', protocol: PROTOCOL });
  const a = await connect(), b = await connect();
  a.sendJSON(join()); const aw = await a.take('welcome');
  b.sendJSON(join()); const bw = await b.take('welcome');
  assert.equal(bw.players[0].id, aw.id); assert.notEqual(aw.id, bw.id); await a.take('join');
  b.sendJSON({ type: 'move', pose: { ...pose, x: -130, moving: true } });
  assert.equal((await a.take('move')).pose.x, -130);
  await new Promise(r => setTimeout(r, 510));
  b.sendJSON(join('frontier-wilds-v1')); assert.equal((await b.take('welcome')).players.length, 0); assert.equal((await a.take('leave')).id, bw.id);
  await new Promise(r => setTimeout(r, 510));
  b.sendJSON(join('azure-harbor-v1', 'private')); assert.equal((await b.take('welcome')).players.length, 0);
  b.close(); await once(b, 'close');
  const c = await connect(); c.sendJSON(join()); assert.notEqual((await c.take('welcome')).id, bw.id); await a.take('join'); c.close(); await a.take('leave');
});

test('atlas poses agree across all starting origins; region metadata matches main boundary ownership and v13 saves stay local', () => {
  const wire = createProtocol(data), points = [[-160, -92], [-161, -92], [13, -120], [13, -121], [-160, -160.5], [-161, -160.5]];
  for (const initial of Object.keys(data.maps)) {
    const g = new OpenWorldGame({ ...data, world: data.maps[initial] }, { seed: 7 });
    const [ox, oz] = g.coordinateOrigin;
    for (const [x, z] of points) {
      g.player.x = x - ox; g.player.z = z - oz;
      const p = presencePose(g); assert.deepEqual([p.x, p.z], [x, z]);
      assert.equal(p.region, wire.regionAt(x, z)); assert.equal(wire.poseOK(p, WORLD_ID), true);
      assert.equal(wire.poseOK({ ...p, region: 'wrong' }, WORLD_ID), false);
      const saved = structuredClone(g.snapshot()), [rx, rz] = data.maps[saved.worldId].atlas.offset;
      assert.equal(saved.version, 13); assert.deepEqual(saved.pos, [Math.round((x - rx) * 10) / 10, Math.round((z - rz) * 10) / 10]);
    }
  }
  assert.equal(wire.poseOK({ ...pose, x: -600, z: 170, region: 'frontier-wilds-v1' }, WORLD_ID), false, 'exterior atlas notch is rejected');
});

test('one atlas membership crosses Azure/Frontier/Moonroot without leave or identity change; wrong region is rejected', async t => {
  const { connect } = await fixture(t), wire = createProtocol(data);
  const atlasJoin = (x, z, room = 'lobby') => ({ ...join(WORLD_ID, room), pose: { ...pose, x, z, region: wire.regionAt(x, z) } });
  const a = await connect(), b = await connect(), other = await connect();
  a.sendJSON(atlasJoin(-159, -92)); const aw = await a.take('welcome');
  b.sendJSON(atlasJoin(-161, -92)); const bw = await b.take('welcome'); await a.take('join');
  assert.equal(bw.players[0].id, aw.id);
  other.sendJSON(atlasJoin(13, -121, 'private')); await other.take('welcome');
  for (const [x, z] of [[-158, -92], [-162, -92], [13, -121]]) {
    b.sendJSON({ type: 'move', pose: { ...pose, x, z, region: wire.regionAt(x, z), moving: true } });
    const m = await a.take('move'); assert.equal(m.id, bw.id); assert.equal(m.pose.region, wire.regionAt(x, z));
  }
  assert.equal(a.messages.some(m => m.type === 'leave' || m.type === 'join'), false);
  assert.equal(other.messages.some(m => m.type === 'move'), false);
  const closed = once(b, 'close'); b.sendJSON({ type: 'move', pose: { ...pose, x: 13, z: -121, region: 'azure-harbor-v1' } });
  assert.equal((await closed)[0], 1008); await a.take('leave');
});
test('all three registered maps support bounded presence; Moonroot joins, moves and stays isolated', async t => {
  assert.deepEqual(Object.keys(data.maps), ['azure-harbor-v1', 'frontier-wilds-v1', 'moonroot-grove-v1']);
  const { connect } = await fixture(t);
  const a = await connect(), b = await connect();
  a.sendJSON(join()); await a.take('welcome');
  for (const map of Object.keys(data.maps)) {
    const [x, z] = data.maps[map].playerSpawn;
    const m = { ...join(map), pose: { ...pose, x, z } };
    b.sendJSON(m); const welcome = await b.take('welcome');
    assert.equal(welcome.map, map);
    assert.equal(welcome.players.length, map === 'azure-harbor-v1' ? 1 : 0);
    if (map === 'azure-harbor-v1') await a.take('join');
    if (map === 'frontier-wilds-v1') await a.take('leave');
    await new Promise(r => setTimeout(r, 510));
  }
  const map = 'moonroot-grove-v1', [x, z] = data.maps[map].playerSpawn;
  a.sendJSON({ ...join(map), pose: { ...pose, x, z } });
  assert.equal((await a.take('welcome')).players.length, 1); await b.take('join');
  b.sendJSON({ type: 'move', pose: { ...pose, x: x + 1, z, moving: true } });
  assert.equal((await a.take('move')).pose.x, x + 1);
  const closed = once(b, 'close');
  b.sendJSON({ type: 'move', pose: { ...pose, x, z: data.maps[map].bounds.maxZ + 1 } });
  assert.equal((await closed)[0], 1008); await a.take('leave');
});
test('rejects absent/foreign Origin, wrong path, unsafe endpoint configuration', async t => {
  const { port } = await fixture(t);
  for (const [path, o] of [['/presence', undefined], ['/presence', 'https://evil.test'], ['/other', origin]]) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { origin: o });
    const [error] = await once(ws, 'error'); assert.match(error.message, /403/);
  }
  assert.throws(() => createPresenceServer({ origins: ['*'] }));
  for (const url of ['ws://test/presence', 'https://test/presence', 'wss://u:p@test/presence', 'wss://test/presence?token=x']) assert.equal(presenceEndpoint(url, 'https:'), '');
  assert.equal(presenceEndpoint('wss://test/presence', 'https:'), 'wss://test/presence');
});
test('rejects spoofed identity, extra data, bad maps, poses and binary frames', async t => {
  const { connect } = await fixture(t);
  const bad = [{ ...join(), id: 'someone' }, { ...join(), save: {} }, { ...join(), map: '__proto__' }, { ...join(), room: '<script>' }, { ...join(), pose: { ...pose, x: 1e9 } }, { ...join(), pose: { ...pose, x: null } }, { ...join(), look: { ...look, hair: 'url(secret)' } }, { type: 'move', pose }];
  for (const m of bad) { const ws = await connect(); ws.sendJSON(m); assert.equal((await once(ws, 'close'))[0], 1008); }
  const binary = await connect(); binary.send(Buffer.from('{}')); assert.equal((await once(binary, 'close'))[0], 1008);
  const oversize = await connect(); oversize.send('x'.repeat(1025)); assert.equal((await once(oversize, 'close'))[0], 1009);
});
test('limits message floods and room capacity', async t => {
  const { connect } = await fixture(t, { roomCapacity: 1 });
  const a = await connect(); a.sendJSON(join()); await a.take('welcome');
  const b = await connect(); b.sendJSON(join()); assert.equal((await once(b, 'close'))[0], 1013);
  const closed = once(a, 'close'); for (let i = 0; i < 80; i++) a.sendJSON({ type: 'move', pose }); assert.equal((await closed)[0], 1008);
});

test('browser adapter reconnects, clears peers and follows streamed map changes without touching local state', async t => {
  const { Presence } = await import('../../src/network/presence.js');
  const { app, port } = await fixture(t);
  const original = globalThis.WebSocket;
  globalThis.WebSocket = class extends WebSocket { constructor(url) { super(url, { origin }); } };
  t.after(() => { globalThis.WebSocket = original; });
  const sa = { ready: true, map: 'azure-harbor-v1', look, gear, pose: { ...pose } };
  const sb = structuredClone(sa);
  const endpoint = `ws://127.0.0.1:${port}/presence`;
  const a = new Presence({ endpoint, data, state: () => sa }), b = new Presence({ endpoint, data, state: () => sb });
  t.after(() => { a.stop(); b.stop(); });
  const until = async pred => { for (let i = 0; i < 600; i++) { if (pred()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('adapter timeout'); };
  a.start(); b.start(); await until(() => a.players.size === 1 && b.players.size === 1);
  sb.pose.x = -128; await until(() => [...a.players.values()][0]?.pose.x === -128); assert.equal(sa.pose.x, -132);
  sb.map = 'frontier-wilds-v1'; await until(() => a.players.size === 0 && b.players.size === 0);
  const [x, z] = data.maps['moonroot-grove-v1'].playerSpawn;
  sb.map = 'moonroot-grove-v1'; sb.pose = { ...pose, x, z };
  await until(() => b.joined === sb.map && b.id);
  assert.equal(a.players.size, 0);
  sa.map = sb.map; sa.pose = { ...pose, x: x + 1, z };
  await until(() => a.players.size === 1 && b.players.size === 1);
  assert.equal(sa.pose.x, x + 1, 'Moonroot remote pose never overwrites local pose');
  const previous = b.id;
  for (const c of app.clients.values()) if (c.id === previous) c.ws.terminate();
  await until(() => b.id && b.id !== previous);
  b.stop(); assert.equal(b.status, 'solo'); assert.equal(b.enabled, false);
});

test('appearance/actions are bounded, deduplicated and isolated; identity belongs to the server', async t => {
  const { connect } = await fixture(t);
  const a = await connect(), b = await connect(), other = await connect();
  a.sendJSON(join()); const aw = await a.take('welcome'); b.sendJSON(join()); await b.take('welcome'); await a.take('join');
  const [mx, mz] = data.maps['moonroot-grove-v1'].playerSpawn;
  other.sendJSON({ ...join('moonroot-grove-v1', 'private'), pose: { ...pose, x: mx, z: mz } }); await other.take('welcome');
  const coat = { ...gear, armor: 'ranger_coat', boots: 'trail_boots', helm: 'ranger_hood', weapon: 'hunter_bow' };
  b.sendJSON({ type: 'appearance', look, gear: coat });
  const appearance = await a.take('appearance'); assert.deepEqual(appearance.gear, coat);
  const action = { seq: 1, skill: 'hunter_shot', phase: 'cast', angle: .2, duration: .2, step: 0 };
  b.sendJSON({ type: 'action', action }); const received = await a.take('action'); assert.equal(received.id, appearance.id); assert.notEqual(received.id, aw.id); assert.deepEqual(received.action, action);
  b.sendJSON({ type: 'action', action }); await new Promise(r => setTimeout(r, 150));
  assert.equal(a.messages.filter(m => m.type === 'action').length, 0, 'duplicate action is not relayed');
  assert.equal(other.messages.filter(m => ['appearance', 'action'].includes(m.type)).length, 0, 'other map/room sees no action or outfit');
  const c = await connect(); c.sendJSON(join()); const welcome = await c.take('welcome'); assert.deepEqual(welcome.players.find(p => p.id === received.id).gear, coat, 'late join sees current outfit');
});
test('rejects arbitrary assets, unknown skills, unbounded events and appearance/action floods', async t => {
  const { connect } = await fixture(t);
  const action = { seq: 1, skill: 'slash', phase: 'cast', angle: 0, duration: .18, step: 0 };
  const bad = [
    { type: 'appearance', look, gear: { ...gear, weapon: 'https://evil.test/model.glb' } },
    { type: 'appearance', look, gear: { ...gear, armor: 'rusty_sword' } },
    { type: 'action', id: 'spoof', action },
    ...[{ skill: '__proto__' }, { skill: 'unknown' }, { phase: 'charge' }, { duration: 100 }, { duration: null }, { angle: 4 }, { seq: -1 }, { step: 99 }, { url: 'https://evil.test' }].map(p => ({ type: 'action', action: { ...action, ...p } })),
  ];
  for (const m of bad) { const ws = await connect(); ws.sendJSON(join()); await ws.take('welcome'); const close = once(ws, 'close'); ws.sendJSON(m); assert.equal((await close)[0], 1008); }
  for (const kind of ['action', 'appearance']) {
    const ws = await connect(); ws.sendJSON(join()); await ws.take('welcome'); const close = once(ws, 'close');
    for (let i = 1; i <= 12; i++) ws.sendJSON(kind === 'action' ? { type: kind, action: { ...action, seq: i } } : { type: kind, look, gear });
    assert.equal((await close)[0], 1008);
  }
});
test('handshake readiness precedes world state; failure stays failed and retry/reconnect clears action state', async t => {
  const { Presence } = await import('../../src/network/presence.js');
  const { app, port } = await fixture(t);
  const original = globalThis.WebSocket; globalThis.WebSocket = class extends WebSocket { constructor(url) { super(url, { origin }); } };
  t.after(() => { globalThis.WebSocket = original; });
  const until = async fn => { for (let i = 0; i < 500; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('timeout'); };
  const states = [], client = new Presence({ endpoint: `ws://127.0.0.1:${port}/presence`, data, onStatus: s => states.push(s) });
  t.after(() => client.stop()); client.start(); await until(() => client.connected);
  assert.equal(client.status, 'connected'); assert.equal(client.id, null); assert.equal(app.clients.size, 1, 'admitted without building/joining a map');
  const state = { ready: true, map: 'azure-harbor-v1', look, gear, pose };
  client.state = () => state; await until(() => client.id);
  client.action({ skill: 'slash', phase: 'cast', angle: 0, duration: .18, step: 0 }); assert.equal(client.seq, 1);
  const id = client.id; app.clients.values().next().value.ws.terminate(); await until(() => client.id && client.id !== id);
  assert.ok(states.includes('reconnecting')); assert.equal(client.seq, 0); assert.equal(client.seen.size, 0);
  const failed = new Presence({ endpoint: `ws://127.0.0.1:${port}/wrong`, data }); t.after(() => failed.stop()); failed.start();
  await until(() => failed.status === 'failed'); assert.equal(failed.connected, false); assert.notEqual(failed.status, 'solo');
  failed.endpoint = `ws://127.0.0.1:${port}/presence`; failed.retryNow(); await until(() => failed.connected);
});

test('version mismatch fails immediately; missing admission has a bounded deadline and no offline fallback', async t => {
  const { Presence } = await import('../../src/network/presence.js');
  const server = createServer(), wss = new WebSocketServer({ server });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { for (const ws of wss.clients) ws.terminate(); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)); });
  const endpoint = `ws://127.0.0.1:${server.address().port}/presence`, original = globalThis.WebSocket;
  globalThis.WebSocket = WebSocket; t.after(() => { globalThis.WebSocket = original; });
  wss.once('connection', ws => ws.send(JSON.stringify({type:'hello', protocol:2, id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'})));
  const mismatch = new Presence({endpoint, data, timeoutMs:2000}); t.after(() => mismatch.stop());
  const until = async fn => { for (let i=0;i<100;i++) { if(fn()) return; await new Promise(r=>setTimeout(r,10)); } throw Error('admission timeout'); };
  mismatch.start(); await until(() => mismatch.status==='failed'); assert.equal(mismatch.connected,false);
  const stalled = new Presence({endpoint, data, timeoutMs:80}); t.after(() => stalled.stop());
  stalled.start(); await until(() => stalled.status==='failed'); assert.equal(stalled.connected,false); assert.notEqual(stalled.status,'solo');
});
