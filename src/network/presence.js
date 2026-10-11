// Experimental visual transport. It never writes Game or save state.
import { PROTOCOL, createProtocol, exact, roomOK, identityOK } from './protocol.js';
export function presenceEndpoint(value, pageProtocol = globalThis.location?.protocol || 'http:') {
  if (!value) return '';
  try {
    const u = new URL(value);
    if (!['ws:', 'wss:'].includes(u.protocol) || (pageProtocol === 'https:' && u.protocol !== 'wss:') || u.username || u.password || u.search || u.hash || u.pathname !== '/presence') return '';
    return u.href;
  } catch { return ''; }
}
export class Presence {
  constructor({ endpoint, data, state = () => null, onStatus = () => {}, onPlayers = () => {}, onAction = () => {}, timeoutMs = 75000 }) {
    Object.assign(this, { endpoint, state, timeoutMs });
    this.wire = createProtocol(data);
    this.listeners = { status: new Set([onStatus]), players: new Set([onPlayers]), action: new Set([onAction]) };
    this.players = new Map(); this.seen = new Map(); this.enabled = false; this.connected = false; this.attempt = 0; this.status = 'solo';
  }
  subscribe(kind, fn) { this.listeners[kind].add(fn); return () => this.listeners[kind].delete(fn); }
  emit(kind, ...args) { for (const fn of this.listeners[kind]) fn(...args); }
  statusTo(status) { this.status = status; this.emit('status', status, this.players.size); }
  clear() { this.id = null; this.joined = ''; this.joinSent = 0; this.seq = 0; this.actionTokens = 8; this.actionAt = Date.now(); this.seen.clear(); this.players.clear(); this.emit('players', this.players); }
  start(room = 'lobby') {
    if (!roomOK(room)) return;
    this.stop(); this.room = room; this.enabled = true; this.attempt = 0; this.hadConnection = false;
    if (!this.endpoint) { this.statusTo('failed'); return; }
    this.connect();
  }
  retryNow() {
    if (!this.endpoint) return this.statusTo('failed');
    this.releaseSocket(); clearTimeout(this.retry); this.enabled = true; this.attempt = 0; this.connect();
  }
  releaseSocket() {
    clearTimeout(this.deadline); clearInterval(this.timer);
    const ws = this.ws; this.ws = null; ws?.close(); this.connected = false; this.clear();
  }
  stop() { this.enabled = false; clearTimeout(this.retry); this.releaseSocket(); this.statusTo('solo'); }
  fail() { this.releaseSocket(); clearTimeout(this.retry); this.statusTo('failed'); }
  send(message) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN || this.ws.bufferedAmount >= 4096) return false;
    this.ws.send(JSON.stringify(message)); return true;
  }
  connect() {
    if (!this.enabled) return;
    const wire = this.wire;
    this.clear(); this.connected = false; this.statusTo(this.hadConnection ? 'reconnecting' : 'connecting');
    let ws;
    try { ws = new WebSocket(this.endpoint); } catch { this.onLost(); return; }
    this.ws = ws; this.lastReceive = Date.now();
    this.deadline = setTimeout(() => { if (this.ws === ws) this.fail(); }, this.timeoutMs);
    this.timer = setInterval(() => {
      if (this.ws !== ws) return;
      if (Date.now() - this.lastReceive > 45000) { ws.close(); return; }
      if (!this.connected || ws.readyState !== WebSocket.OPEN) return;
      const s = this.state();
      if (!s?.ready) return;
      if (!wire.poseOK(s.pose, s.map) || !wire.lookOK(s.look) || !wire.gearOK(s.gear)) return;
      if (this.joined !== s.map) {
        if (Date.now() - this.joinSent < 600) return;
        this.clear(); this.joinSent = Date.now(); this.joined = s.map;
        this.appearanceKey = JSON.stringify([s.look, s.gear]); this.appearanceAt = Date.now();
        this.requiresRoomAck = true; this.statusTo('joining');
        this.send({ type: 'join', map: s.map, room: this.room, look: s.look, gear: s.gear, pose: s.pose });
        clearTimeout(this.deadline); this.deadline = setTimeout(() => { if (this.ws === ws && !this.id) this.fail(); }, this.timeoutMs);
      } else if (this.id) {
        this.send({ type: 'move', pose: s.pose });
        const key = JSON.stringify([s.look, s.gear]);
        if (key !== this.appearanceKey && Date.now() - this.appearanceAt >= 600 && this.send({ type: 'appearance', look: s.look, gear: s.gear })) {
          this.appearanceKey = key; this.appearanceAt = Date.now();
        }
      }
    }, 100);
    ws.onmessage = event => {
      if (this.ws !== ws || typeof event.data !== 'string' || event.data.length > 16384) return;
      let m; try { m = JSON.parse(event.data); } catch { return; }
      if (m?.type === 'hello' && !this.connected && (!exact(m, ['type', 'protocol', 'id']) || m.protocol !== PROTOCOL || !identityOK(m.id))) { this.fail(); return; }
      if (exact(m, ['type', 'protocol', 'id']) && m.type === 'hello' && m.protocol === PROTOCOL && identityOK(m.id) && !this.connected) {
        this.sessionId = m.id; this.connected = true; this.hadConnection = true; this.attempt = 0;
        clearTimeout(this.deadline); this.lastReceive = Date.now(); this.statusTo('connected'); return;
      }
      if (!this.connected) return;
      const map = this.state()?.map;
      if (exact(m, ['type']) && m.type === 'pulse') { this.lastReceive = Date.now(); return; }
      if (exact(m, ['type', 'id', 'map', 'room', 'players']) && m.type === 'welcome' && m.id === this.sessionId && m.map === map && m.map === this.joined && m.room === this.room && Array.isArray(m.players) && m.players.length <= 7 && m.players.every(p => wire.playerOK(p, map) && p.id !== m.id) && new Set(m.players.map(p => p.id)).size === m.players.length) {
        this.id = m.id; this.players.clear(); this.seen.clear(); clearTimeout(this.deadline);
        for (const p of m.players) this.players.set(p.id, p);
        this.statusTo('online');
      } else if (this.id && this.joined === map) {
        if (exact(m, ['type', 'player']) && m.type === 'join' && wire.playerOK(m.player, map) && m.player.id !== this.id && this.players.size < 7) this.players.set(m.player.id, m.player);
        else if (exact(m, ['type', 'id']) && m.type === 'leave' && identityOK(m.id)) { this.players.delete(m.id); this.seen.delete(m.id); }
        else if (exact(m, ['type', 'id', 'pose']) && m.type === 'move' && wire.poseOK(m.pose, map) && this.players.has(m.id)) this.players.get(m.id).pose = m.pose;
        else if (exact(m, ['type', 'id', 'look', 'gear']) && m.type === 'appearance' && wire.lookOK(m.look) && wire.gearOK(m.gear) && this.players.has(m.id)) Object.assign(this.players.get(m.id), { look: m.look, gear: m.gear });
        else if (exact(m, ['type', 'id', 'action']) && m.type === 'action' && this.players.has(m.id) && wire.actionOK(m.action) && m.action.seq > (this.seen.get(m.id) || 0)) {
          this.seen.set(m.id, m.action.seq); this.emit('action', m.id, m.action); this.lastReceive = Date.now(); return;
        } else return;
      } else return;
      this.lastReceive = Date.now(); this.emit('players', this.players); this.emit('status', this.status, this.players.size);
    };
    ws.onerror = () => ws.close();
    ws.onclose = event => {
      if (this.ws !== ws) return;
      this.releaseSocket();
      if ([1008, 1009, 1013].includes(event.code)) this.fail(); else this.onLost();
    };
  }
  onLost() {
    if (!this.enabled) return;
    if (!this.hadConnection) { this.fail(); return; }
    this.statusTo('reconnecting');
    this.retry = setTimeout(() => this.connect(), Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5)) + Math.random() * 300);
  }
  action(action) {
    if (!this.id || this.joined !== this.state()?.map) return false;
    const next = { ...action, seq: this.seq + 1 };
    if (!this.wire.actionOK(next)) return false;
    const now = Date.now(); this.actionTokens = Math.min(8, this.actionTokens + Math.max(0, now - this.actionAt) * .006); this.actionAt = now;
    if (this.actionTokens < 1) return false;
    if (!this.send({ type: 'action', action: next })) return false;
    this.actionTokens--; this.seq = next.seq; return true;
  }
}
