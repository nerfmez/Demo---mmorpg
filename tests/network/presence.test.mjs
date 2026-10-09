import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createPresenceServer } from '../../server/presence.mjs';
import { presenceEndpoint } from '../../src/network/presence.js';
import { loadData } from '../../src/core/data-node.js';
const data = loadData();
const origin = 'http://localhost:4173';
const look = { hairStyle: 'messy', hair: '#262a44', skin: '#f6d2b5', eyes: '#2b2e44', scarf: '#cf3a30', tunic: '#f1e3cc' };
const pose = { x: -132, z: 80, facing: 0, moving: false };
const join = (map = 'azure-harbor-v1', room = 'lobby') => ({ type: 'join', map, room, pose, look });
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
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
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
  const sa = { ready: true, map: 'azure-harbor-v1', look, pose: { ...pose } };
  const sb = structuredClone(sa);
  const endpoint = `ws://127.0.0.1:${port}/presence`;
  const a = new Presence({ endpoint, state: () => sa }), b = new Presence({ endpoint, state: () => sb });
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
