// Experimental in-memory relay: coordinates are cosmetic presence, never authority.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const maps = [read('../data/world.json'), ...readdirSync(new URL('../data/maps/', import.meta.url)).filter(n => n.endsWith('.json')).map(n => read(`../data/maps/${n}`))];
const bounds = new Map(maps.map(m => [m.id, m.bounds]));
const keys = (o, names) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === names.length && names.every(n => Object.hasOwn(o, n));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const roomOK = room => typeof room === 'string' && /^[a-z0-9-]{1,24}$/.test(room);
const lookKeys = ['hairStyle', 'hair', 'skin', 'eyes', 'scarf', 'tunic'];
const lookOK = look => keys(look, lookKeys) && ['messy', 'swept', 'ponytail', 'short'].includes(look.hairStyle) && lookKeys.slice(1).every(k => typeof look[k] === 'string' && /^#[0-9a-f]{6}$/i.test(look[k]));
const poseOK = (p, map) => {
  const b = bounds.get(map);
  return keys(p, ['x', 'z', 'facing', 'moving']) && b && finite(p.x) && finite(p.z) && finite(p.facing) && Math.abs(p.facing) <= Math.PI && typeof p.moving === 'boolean' && p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
};
export function createPresenceServer({ origins = [], maxClients = 32, roomCapacity = 8 } = {}) {
  if (!origins.length || origins.some(o => { try { return new URL(o).origin !== o || !/^https?:/.test(o); } catch { return true; } })) throw new Error('ALLOWED_ORIGINS requires exact http(s) origins');
  const allowed = new Set(origins);
  const server = createServer((req, res) => {
    const healthy = req.url === '/healthz' && req.method === 'GET';
    res.writeHead(healthy ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(healthy ? { ok: true, prototype: 'presence-v1' } : { error: 'not found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const clients = new Map();
  const send = (ws, msg) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 64 * 1024) return ws.terminate();
    ws.send(JSON.stringify(msg));
  };
  const peers = c => [...clients.values()].filter(p => p.joined && p.map === c.map && p.room === c.room);
  const publicPlayer = c => ({ id: c.id, look: c.look, pose: c.pose });
  const leave = c => {
    if (!c.joined) return;
    c.joined = false;
    for (const p of peers(c)) send(p.ws, { type: 'leave', id: c.id });
  };
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/presence' || !allowed.has(req.headers.origin) || clients.size >= maxClients) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    const c = { ws, id: randomUUID(), joined: false, alive: true, tokens: 30, at: Date.now(), joinAt: 0, created: Date.now() };
    clients.set(ws, c);
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => { c.alive = true; });
    ws.on('close', () => { leave(c); clients.delete(ws); });
    ws.on('message', (buffer, binary) => {
      const now = Date.now();
      c.tokens = Math.min(30, c.tokens + (now - c.at) * .02); c.at = now;
      if (--c.tokens < 0) return ws.close(1008, 'message rate');
      let m;
      try { if (binary) throw Error(); m = JSON.parse(buffer.toString()); } catch { return ws.close(1008, 'invalid JSON'); }
      if (m?.type === 'join' && keys(m, ['type', 'map', 'room', 'pose', 'look']) && bounds.has(m.map) && roomOK(m.room) && poseOK(m.pose, m.map) && lookOK(m.look)) {
        if (now - c.joinAt < 500) return ws.close(1008, 'join rate');
        c.joinAt = now;
        const group = peers({ map: m.map, room: m.room }).filter(p => p !== c);
        if (group.length >= roomCapacity) return ws.close(1013, 'room full');
        leave(c);
        Object.assign(c, { joined: true, map: m.map, room: m.room, pose: m.pose, look: m.look });
        send(ws, { type: 'welcome', id: c.id, map: c.map, room: c.room, players: group.map(publicPlayer) });
        for (const p of group) send(p.ws, { type: 'join', player: publicPlayer(c) });
      } else if (m?.type === 'move' && keys(m, ['type', 'pose']) && c.joined && poseOK(m.pose, c.map)) {
        c.pose = m.pose; c.dirty = true; // batch at 10Hz; no flood amplification
      } else ws.close(1008, 'invalid message');
    });
  });
  const tick = setInterval(() => {
    for (const c of clients.values()) if (c.joined && c.dirty) {
      c.dirty = false;
      for (const p of peers(c)) if (p !== c) send(p.ws, { type: 'move', id: c.id, pose: c.pose });
    }
  }, 100);
  const heartbeat = setInterval(() => {
    for (const c of clients.values()) {
      if (!c.alive || (!c.joined && Date.now() - c.created > 10000)) { c.ws.terminate(); continue; }
      c.alive = false; c.ws.ping(); send(c.ws, { type: 'pulse' });
    }
  }, 15000);
  return { server, clients, close: async () => {
    clearInterval(tick); clearInterval(heartbeat);
    for (const ws of clients.keys()) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (server.listening) await new Promise(resolve => server.close(resolve));
  } };
}
