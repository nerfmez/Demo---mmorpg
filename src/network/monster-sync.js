// Experimental shared monsters for small friend groups. The room member with the lowest id
// (the host) runs its own monsters and streams them; everyone else hides their local monsters
// and mirrors the host's. Guest hits are forwarded to the host. Trusted-friends only: no authority.
import { MONSTER_BATCH } from './protocol.js';

const SEND_EVERY = 0.2, NEAR = 30, MAX_ROWS = MONSTER_BATCH * 2, STALE = 1.5;
const round = (n, d = 100) => Math.round(n * d) / d;

export class MonsterSync {
  constructor(game, client) {
    Object.assign(this, { game, client, role: 'solo', hostId: null, sendT: 0, mirrors: new Map() });
    this.off = [
      client.subscribe('monsters', (id, list) => { if (id === this.hostId) this.receive(list); }),
      client.subscribe('monsterHit', (id, hit) => { if (this.role === 'host') this.applyHit(hit); }),
    ];
  }
  // Atlas <-> session coordinates: peers may have started in different regions.
  toAtlas(x, z) { return this.game.world.unified ? this.game.worldPoint(x, z) : [x, z]; }
  toLocal(x, z) {
    if (!this.game.world.unified) return [x, z];
    const region = this.client.wire.regionAt(x, z);
    return region ? this.game.localPoint(region, x, z) : null;
  }
  update(dt) {
    const c = this.client, online = c.status === 'online' && !!c.id;
    const ids = online ? [c.id, ...c.players.keys()].sort() : [];
    const role = ids.length < 2 ? 'solo' : ids[0] === c.id ? 'host' : 'guest';
    this.hostId = role === 'guest' ? ids[0] : null;
    if (role !== this.role) this.switchRole(role);
    if (role === 'host' && (this.sendT -= dt) <= 0) { this.sendT = SEND_EVERY; this.broadcast(); }
    if (role === 'guest') this.smooth(dt);
  }
  switchRole(role) {
    const g = this.game;
    if (role === 'guest') {
      // Local monsters leave; the host's take their place.
      g.monsters = g.monsters.filter(m => m.remote);
      for (const sp of g.spawnPoints) sp.entity = null;
      g.mirrorMonsters = true;
    } else if (this.role === 'guest') {
      // Back to running our own world: drop mirrors and let spawn points refill.
      g.monsters = g.monsters.filter(m => !m.remote);
      this.mirrors.clear();
      g.mirrorMonsters = false;
      for (const sp of g.spawnPoints) if (!sp.entity) sp.respawnAt = 0;
    }
    this.role = role;
  }
  broadcast() {
    const g = this.game, peers = [...this.client.players.values()].map(p => p.pose);
    const rows = [];
    for (const m of g.monsters) {
      if (m.remote || !Object.hasOwn(g.data.monsters.monsters, m.type)) continue;
      const [ax, az] = this.toAtlas(m.x, m.z);
      let best = Infinity;
      for (const p of peers) best = Math.min(best, Math.hypot(p.x - ax, p.z - az));
      if (best > NEAR) continue;
      const facing = Math.atan2(Math.sin(m.facing), Math.cos(m.facing));
      rows.push({ best, row: [m.id, m.type, Math.min(99, Math.max(1, m.level)), round(ax), round(az), round(facing), Math.max(0, Math.round(Math.min(m.hp, m.maxHp))), Math.max(1, Math.round(m.maxHp)), m.dead ? 'dead' : String(m.state).slice(0, 12)] });
    }
    rows.sort((a, b) => a.best - b.best);
    const list = rows.slice(0, MAX_ROWS).map(r => r.row);
    for (let i = 0; i < list.length; i += MONSTER_BATCH) this.client.send({ type: 'monsters', list: list.slice(i, i + MONSTER_BATCH) });
  }
  receive(list) {
    const g = this.game;
    if (this.role !== 'guest') return;
    for (const [key, type, level, ax, az, facing, hp, maxHp, state] of list) {
      const local = this.toLocal(ax, az);
      if (!local) continue;
      let m = this.mirrors.get(key);
      if (m && !g.monsters.includes(m)) { this.mirrors.delete(key); m = null; }
      if (!m) {
        if (state === 'dead') continue;
        const sp = { monster: type, zone: g.world.zoneAt(local[0], local[1])?.id, level: [level, level], x: local[0], z: local[1], respawn: 0, mirror: true };
        m = g.spawnAt(sp, { x: local[0], z: local[1] });
        Object.assign(m, { remote: true, hostKey: key, aggro: true });
        this.mirrors.set(key, m);
      }
      Object.assign(m, { targetX: local[0], targetZ: local[1], facing, maxHp, seenAt: g.time });
      if (state === 'dead') {
        if (!m.dead) { m.hp = 0; g.killMonster(m); } // the party shares the kill: exp and drops are local
        continue;
      }
      if (!m.dead) { m.hp = hp; m.state = state; m.moving = state === 'chase' || state === 'return' || state === 'retreat' || state === 'circle'; }
    }
  }
  smooth(dt) {
    const g = this.game, k = Math.min(1, dt * 10);
    for (const [key, m] of this.mirrors) {
      if (!g.monsters.includes(m)) { this.mirrors.delete(key); continue; }
      if (g.time - m.seenAt > STALE && !m.dead) { g.monsters.splice(g.monsters.indexOf(m), 1); this.mirrors.delete(key); continue; }
      if (m.dead || m.targetX === undefined) continue;
      m.x += (m.targetX - m.x) * k; m.z += (m.targetZ - m.z) * k;
    }
  }
  // Guest side: forward our damage on a mirror to the host.
  handleEvent(e) {
    if (this.role !== 'guest' || e.type !== 'hit' || !(e.amount >= 1)) return;
    const m = this.game.monsters.find(x => x.id === e.id);
    if (m?.remote) this.client.send({ type: 'monsterHit', hit: { key: m.hostKey, amount: Math.min(1e6, Math.round(e.amount)) } });
  }
  applyHit({ key, amount }) {
    const g = this.game, m = g.monsters.find(x => x.id === key && !x.remote);
    if (!m || m.dead) return;
    m.hp -= amount; m.hurtT = 0.18; m.aggro = true;
    g.emit({ type: 'hit', id: m.id, amount, crit: false, heavy: false, fromX: m.x, fromZ: m.z, element: 'physical', dot: false, shell: m.shell, byAlly: true, x: m.x, z: m.z });
    if (m.hp <= 0) g.killMonster(m);
  }
  dispose() {
    for (const off of this.off) off();
    if (this.role === 'guest') this.switchRole('solo');
  }
}
