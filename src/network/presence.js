// Independent of Game and saves. A failed connection never prevents solo play.
export function presenceEndpoint(value, pageProtocol = location.protocol) {
  if (!value) return '';
  try {
    const u = new URL(value);
    if (!['ws:', 'wss:'].includes(u.protocol) || (pageProtocol === 'https:' && u.protocol !== 'wss:') || u.username || u.password || u.search || u.hash || u.pathname !== '/presence') return '';
    return u.href;
  } catch { return ''; }
}
export class Presence {
  constructor({ endpoint, state, onStatus = () => {}, onPlayers = () => {} }) {
    Object.assign(this, { endpoint, state, onStatus, onPlayers });
    this.players = new Map(); this.enabled = false; this.attempt = 0; this.status = 'solo';
  }
  statusTo(status) { this.status = status; this.onStatus(status, this.players.size); }
  clear() { this.id = null; this.joined = ''; this.players.clear(); this.onPlayers(this.players); }
  start(room = 'lobby') {
    if (!this.endpoint || !/^[a-z0-9-]{1,24}$/.test(room)) return;
    this.stop(); this.room = room; this.enabled = true; this.attempt = 0; this.connect();
  }
  stop() {
    this.enabled = false; clearTimeout(this.retry); clearInterval(this.timer);
    const ws = this.ws; this.ws = null; ws?.close(); this.clear(); this.statusTo('solo');
  }
  connect() {
    if (!this.enabled) return;
    this.clear(); this.statusTo('connecting');
    let ws;
    try { ws = new WebSocket(this.endpoint); } catch { this.reconnect(); return; }
    this.ws = ws;
    this.lastReceive = Date.now();
    this.timer = setInterval(() => {
      if (this.ws !== ws) return;
      if (Date.now() - this.lastReceive > 45000) { ws.close(); return; }
      if (ws.readyState !== WebSocket.OPEN) return;
      const s = this.state();
      if (!s || !s.ready) return;
      if (this.joined !== s.map) {
        if (Date.now() - (this.joinSent || 0) < 1000) return;
        this.clear(); this.joinSent = Date.now(); this.joined = s.map;
        ws.send(JSON.stringify({ type: 'join', map: s.map, room: this.room, look: s.look, pose: s.pose }));
      } else if (this.id && ws.bufferedAmount < 4096) ws.send(JSON.stringify({ type: 'move', pose: s.pose }));
    }, 100);
    ws.onmessage = event => {
      if (this.ws !== ws || typeof event.data !== 'string' || event.data.length > 16384) return;
      let m; try { m = JSON.parse(event.data); } catch { return; }
      this.lastReceive = Date.now();
      if (m.type === 'welcome' && m.map === this.state()?.map && m.room === this.room && typeof m.id === 'string' && Array.isArray(m.players) && m.players.length <= 8) {
        this.id = m.id; this.attempt = 0; this.players.clear();
        for (const p of m.players) if (validPlayer(p)) this.players.set(p.id, p);
        this.statusTo('online');
      } else if (this.id && this.joined === this.state()?.map) {
        if (m.type === 'join' && validPlayer(m.player) && this.players.size < 8) this.players.set(m.player.id, m.player);
        if (m.type === 'leave') this.players.delete(m.id);
        if (m.type === 'move' && validPose(m.pose) && this.players.has(m.id)) this.players.get(m.id).pose = m.pose;
      }
      this.onPlayers(this.players); this.onStatus(this.status, this.players.size);
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null; clearInterval(this.timer); this.clear(); this.reconnect();
    };
  }
  reconnect() {
    if (!this.enabled) return;
    this.statusTo('reconnecting');
    this.retry = setTimeout(() => this.connect(), Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5)) + Math.random() * 500);
  }
}
function validPose(p) { return p && ['x', 'z', 'facing'].every(k => Number.isFinite(p[k]) && Math.abs(p[k]) < 1000) && typeof p.moving === 'boolean'; }
function validPlayer(p) {
  return p && typeof p.id === 'string' && /^[a-f0-9-]{36}$/.test(p.id) && validPose(p.pose) && p.look &&
    ['messy', 'swept', 'ponytail', 'short'].includes(p.look.hairStyle) && ['hair', 'skin', 'eyes', 'scarf', 'tunic'].every(k => /^#[a-f0-9]{6}$/i.test(p.look[k]));
}
