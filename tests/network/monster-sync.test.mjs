import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPresenceServer } from '../../server/presence.mjs';
import { Presence } from '../../src/network/presence.js';
import { MonsterSync } from '../../src/network/monster-sync.js';
import { createProtocol, WORLD_ID, presencePose } from '../../src/network/protocol.js';
import { loadData } from '../../src/core/data-node.js';
import { OpenWorldGame } from '../../src/core/open-world-game.js';
const data = loadData();
const origin = 'http://localhost:4173';
const look = { hairStyle: 'messy', hair: '#262a44', skin: '#f6d2b5', eyes: '#2b2e44', scarf: '#cf3a30', tunic: '#f1e3cc' };
const gear = { weapon: 'rusty_sword', offhand: null, armor: 'travel_tunic', helm: null, gloves: null, boots: 'travel_boots' };
const wait = ms => new Promise(r => setTimeout(r, ms));

// Two real game simulations (different seeds, so different local spawns) joined through the real relay.
test('guest mirrors the host monsters at the same atlas positions and its hits reach the host', async t => {
  const app = createPresenceServer({ origins: [origin] });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => app.close());
  const endpoint = `ws://127.0.0.1:${app.server.address().port}/presence`;
  const OriginWS = class extends WebSocket { constructor(url) { super(url, { headers: { origin } }); } };
  const make = seed => {
    const g = new OpenWorldGame({ ...data, world: data.maps[Object.keys(data.maps)[0]] }, { seed });
    const c = new Presence({ endpoint, data, state: () => ({ map: WORLD_ID, ready: true, look, gear, pose: presencePose(g) }) });
    return { g, c, sync: new MonsterSync(g, c) };
  };
  const prev = globalThis.WebSocket; globalThis.WebSocket = OriginWS; t.after(() => { globalThis.WebSocket = prev; });
  const a = make(11), b = make(51);
  b.g.player.x = a.g.player.x + 2; b.g.player.z = a.g.player.z;
  a.c.start('friends'); b.c.start('friends');
  t.after(() => { a.c.stop(); b.c.stop(); });
  for (let i = 0; i < 100 && !(a.c.players.size && b.c.players.size); i++) await wait(50);
  assert.equal(a.c.status, 'online'); assert.equal(b.c.players.size, 1);
  const [host, guest] = a.c.id < b.c.id ? [a, b] : [b, a];
  for (let i = 0; i < 30; i++) { for (const s of [host, guest]) { s.g.update(1 / 30); s.sync.update(1 / 30); } await wait(35); }
  assert.equal(host.sync.role, 'host'); assert.equal(guest.sync.role, 'guest');
  const mirrors = guest.g.monsters.filter(m => m.remote && !m.dead);
  assert.ok(mirrors.length > 0, 'guest sees host monsters');
  assert.equal(guest.g.monsters.filter(m => !m.remote).length, 0, 'guest local monsters are gone');
  for (const m of mirrors) {
    const h = host.g.monsters.find(x => x.id === m.hostKey);
    assert.ok(h, 'every mirror maps to a host monster'); assert.equal(h.type, m.type);
    const [hx, hz] = host.g.worldPoint(h.x, h.z), [gx, gz] = guest.g.worldPoint(m.x, m.z);
    assert.ok(Math.hypot(hx - gx, hz - gz) < 1.5, `mirror within 1.5 m (${Math.hypot(hx - gx, hz - gz).toFixed(2)})`);
  }
  const target = mirrors[0], hostTarget = host.g.monsters.find(x => x.id === target.hostKey), before = hostTarget.hp;
  guest.g.events.length = 0;
  const dmg = guest.g.hitMonster(target, 5, {});
  for (const e of guest.g.events) guest.sync.handleEvent(e);
  for (let i = 0; i < 20 && hostTarget.hp === before; i++) await wait(25);
  assert.equal(hostTarget.hp, before - dmg, 'guest damage applied on the host');
  assert.ok(createProtocol(data).monstersOK([]));
});
