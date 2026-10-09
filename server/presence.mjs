// Experimental in-memory relay: coordinates are cosmetic presence, never authority.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { PROTOCOL, exact as keys, roomOK, createProtocol } from '../src/network/protocol.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const maps = [read('../data/world.json'), ...readdirSync(new URL('../data/maps/', import.meta.url)).filter(n => n.endsWith('.json')).map(n => read(`../data/maps/${n}`))];
const registry = Object.fromEntries(maps.map(m => [m.id, m]));
const { lookOK, gearOK, poseOK, actionOK } = createProtocol({ maps: registry, items: read('../data/items.json'), skills: read('../data/skills.json') });
export function createPresenceServer({ origins = [], maxClients = 32, roomCapacity = 8 } = {}) {
  if (!origins.length || origins.some(o => { try { return new URL(o).origin !== o || !/^https?:/.test(o); } catch { return true; } })) throw new Error('ALLOWED_ORIGINS requires exact http(s) origins');
  const allowed = new Set(origins);
  const server = createServer((req, res) => {
    const healthy = req.url === '/healthz' && req.method === 'GET';
    res.writeHead(healthy ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(healthy ? { ok: true, prototype: 'presence-v2', protocol: PROTOCOL } : { error: 'not found' }));
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const clients = new Map();
  const send = (ws, msg) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 64 * 1024) return ws.terminate();
    ws.send(JSON.stringify(msg));
  };
  const peers = c => [...clients.values()].filter(p => p.joined && p.map === c.map && p.room === c.room);
  const publicPlayer = c => ({ id: c.id, look: c.look, gear: c.gear, pose: c.pose });
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
    const c = { ws, id: randomUUID(), joined: false, alive: true, tokens: 30, actionTokens: 8, appearanceTokens: 2, at: Date.now(), joinAt: 0, seq: 0 };
    clients.set(ws, c);
    // Connection admission precedes map/world construction; title screens also heartbeat.
    send(ws, { type: 'hello', protocol: PROTOCOL, id: c.id });
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => { c.alive = true; });
    ws.on('close', () => { leave(c); clients.delete(ws); });
    ws.on('message', (buffer, binary) => {
      const now = Date.now();
      const elapsed = Math.max(0, now - c.at) / 1000;
      c.tokens = Math.min(30, c.tokens + elapsed * 20);
      c.actionTokens = Math.min(8, c.actionTokens + elapsed * 6);
      c.appearanceTokens = Math.min(2, c.appearanceTokens + elapsed * 2); c.at = now;
      if (--c.tokens < 0) return ws.close(1008, 'message rate');
      let m;
      try { if (binary) throw Error(); m = JSON.parse(buffer.toString()); } catch { return ws.close(1008, 'invalid JSON'); }
      if (m?.type === 'join' && keys(m, ['type', 'map', 'room', 'pose', 'look', 'gear']) && Object.hasOwn(registry, m.map) && roomOK(m.room) && poseOK(m.pose, m.map) && lookOK(m.look) && gearOK(m.gear)) {
        if (now - c.joinAt < 500) return ws.close(1008, 'join rate');
        c.joinAt = now;
        const group = peers({ map: m.map, room: m.room }).filter(p => p !== c);
        if (group.length >= roomCapacity) return ws.close(1013, 'room full');
        leave(c);
        Object.assign(c, { joined: true, map: m.map, room: m.room, pose: m.pose, look: m.look, gear: m.gear, seq: 0, dirty: false });
        send(ws, { type: 'welcome', id: c.id, map: c.map, room: c.room, players: group.map(publicPlayer) });
        for (const p of group) send(p.ws, { type: 'join', player: publicPlayer(c) });
      } else if (m?.type === 'move' && keys(m, ['type', 'pose']) && c.joined && poseOK(m.pose, c.map)) {
        c.pose = m.pose; c.dirty = true; // batch at 10Hz; no flood amplification
      } else if (m?.type === 'appearance' && keys(m, ['type', 'look', 'gear']) && c.joined && lookOK(m.look) && gearOK(m.gear)) {
        if (--c.appearanceTokens < 0) return ws.close(1008, 'appearance rate');
        c.look = m.look; c.gear = m.gear;
        for (const p of peers(c)) if (p !== c) send(p.ws, { type: 'appearance', id: c.id, look: c.look, gear: c.gear });
      } else if (m?.type === 'action' && keys(m, ['type', 'action']) && c.joined && actionOK(m.action)) {
        if (--c.actionTokens < 0) return ws.close(1008, 'action rate');
        if (m.action.seq <= c.seq) return; // duplicate/out-of-order events are never replayed
        c.seq = m.action.seq;
        for (const p of peers(c)) if (p !== c) send(p.ws, { type: 'action', id: c.id, action: m.action });
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
      if (!c.alive) { c.ws.terminate(); continue; }
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
