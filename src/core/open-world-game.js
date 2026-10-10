// Persistent simulation on one fixed atlas. Native regions retain their authored
// content/save identities, but crossing one never ends combat or rebuilds actors.
import { Game } from './game.js';
import { createWorld } from './world.js';
import { createUnifiedWorld } from './unified-world.js';
import { enterMap, selectMap } from './maps.js';
import { waypointUnlocked } from './atlas.js';
import { refreshQuests } from './quests.js';
import { dist } from './math.js';

export class OpenWorldGame extends Game {
  constructor(data, { worlds = null, world = null, ...options } = {}) {
    const nativeWorlds = worlds || world?.nativeWorlds || null;
    const native = world?.unified ? nativeWorlds[data.world.id] : world || nativeWorlds?.[data.world.id] || createWorld(data.world);
    super(data, { ...options, world: native });
    this.worlds = nativeWorlds || Object.fromEntries(Object.entries(data.maps || { [native.data.id]: native.data }).map(([id, map]) => [id, id === native.data.id ? native : createWorld(map)]));
    this.unifiedWorld = createUnifiedWorld(this.worlds, native.data.id);
    this.coordinateOrigin = this.unifiedWorld.coordinateOrigin;
    const initial = native.data.id;
    for (const sp of this.spawnPoints) { sp.worldId = initial; if (sp.entity) sp.entity.worldId = initial; }
    // Populate each authored layout exactly once. No GPU/scene work occurs here.
    for (const [id, region] of Object.entries(this.worlds)) {
      if (id === initial) continue;
      const first = this.spawnPoints.length;
      this.world = region;
      selectMap(this.data, id);
      super.spawnMonsters();
      for (let i = first; i < this.spawnPoints.length; i++) {
        const sp = this.spawnPoints[i], m = sp.entity;
        [sp.x, sp.z] = this.scenePoint(id, sp.x, sp.z);
        sp.worldId = id;
        if (sp.pack) sp.pack = id + ':' + sp.pack;
        if (m) { m.worldId = id; [m.x, m.z] = [sp.x, sp.z]; m.homeX = m.x; m.homeZ = m.z; }
      }
    }
    // Initial coordinates already use the chosen fixed origin.
    for (const sp of this.spawnPoints) if (sp.worldId === initial && sp.pack) sp.pack = initial + ':' + sp.pack;
    selectMap(this.data, initial);
    this.world = this.unifiedWorld;
    this.simulationRadius = data.progression.openWorldSimulation?.idleRadius ?? 85;
    this.encounterAudit = null; // use the immutable per-region layouts for the guide
    this.zoneId = this.world.zoneAt(this.player.x, this.player.z).id;
  }

  get regionWorld() { return this.world?.unified ? this.world.regionWorld : this.world; }
  worldPoint(x, z) { return this.unifiedWorld.worldPoint(x, z); }
  localPoint(id, x, z) { return this.unifiedWorld.localPoint(id, x, z); }
  scenePoint(id, x, z) { return this.unifiedWorld.scenePoint(id, x, z); }

  moveEntity(e, dx, dz, opts = {}) {
    if (e.def?.flyer && this.unifiedWorld) {
      const nx = e.x + dx, nz = e.z + dz;
      if (this.world.regionAt(nx, nz) && !this.isSafe(nx, nz)) { e.x = nx; e.z = nz; return { blocked: false, blockedHard: false }; }
      return { blocked: true, blockedHard: !!opts.stopOnBlock };
    }
    return super.moveEntity(e, dx, dz, opts);
  }

  spawnAt(sp, at = null) {
    const m = super.spawnAt(sp, at);
    m.worldId = sp.worldId || this.data.world.id;
    return m;
  }

  spawnMinion(type, level, x, z) {
    const m = super.spawnMinion(type, level, x, z);
    m.worldId = this.unifiedWorld?.regionAt(x, z)?.id || this.data.world.id;
    m.spawn.worldId = m.worldId;
    return m;
  }

  isWaypointUnlocked(id, mapId = this.data.world.id) { return waypointUnlocked(this.ch, this.data, mapId, id); }

  /** Switch only content/discovery metadata. Actors and fixed coordinates stay put. */
  activateRegion(id) {
    if (!this.unifiedWorld || id === this.data.world.id) return false;
    const from = this.data.world.id;
    this.recordDiscovery();
    const pos = this.localPoint(id, this.player.x, this.player.z);
    enterMap(this.ch, this.data, id, pos);
    selectMap(this.data, id);
    this.unifiedWorld.setRegion(id);
    this.zoneId = null;
    this.emit({ type: 'worldChanged', from, to: id, shift: [0, 0], seamless: true });
    this.completeQuests(refreshQuests(this.ch, this.data));
    return true;
  }

  updatePlayer(dt) {
    super.updatePlayer(dt);
    const region = this.unifiedWorld?.regionAt(this.player.x, this.player.z);
    if (region && this.activateRegion(region.id)) this.recordDiscovery();
  }

  // Core callers and tests can invoke the old seam API; it now changes metadata
  // only when already in that region, without a render readiness/combat gate.
  crossSeam() {
    if (this.player.dead) return { ok: false, reason: 'dead' };
    const region = this.unifiedWorld.regionAt(this.player.x, this.player.z);
    if (!region) return { ok: false, reason: 'blocked' };
    this.activateRegion(region.id);
    return { ok: true, to: region.id };
  }

  recordDiscovery() {
    if (!this.unifiedWorld || this.player.dead) return;
    const p = this.player, prog = this.ch.progress, id = this.data.world.id;
    const [x, z] = this.localPoint(id, p.x, p.z), native = this.worlds[id];
    // During a crossing the source metadata may still be active; do not infer a
    // source region's fallback zone from the point already over its boundary.
    const b = native.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return;
    for (const wp of native.waypoints) if (!prog.waypoints.includes(wp.id) && dist(x, z, wp.x, wp.z) < 3.8) {
      prog.waypoints.push(wp.id);
      const [sx, sz] = this.scenePoint(id, wp.x, wp.z);
      this.emit({ type: 'waypoint', id: wp.id, world: id, name: wp.nameTh, x: sx, z: sz });
      this.completeQuests(refreshQuests(this.ch, this.data));
    }
    const zone = native.zoneAt(x, z);
    if (zone.id !== this.zoneId) { this.zoneId = zone.id; this.emit({ type: 'zone', id: zone.id, world: id }); }
    if (!prog.zones.includes(zone.id)) {
      prog.zones.push(zone.id);
      this.emit({ type: 'zoneDiscovered', id: zone.id, world: id, name: zone.nameTh });
      this.completeQuests(refreshQuests(this.ch, this.data));
    }
  }
  checkWorld() { this.recordDiscovery(); }

  snapshot() {
    const region = this.unifiedWorld.regionAt(this.player.x, this.player.z);
    if (region) this.activateRegion(region.id);
    const [x, z] = this.localPoint(this.ch.worldId, this.player.x, this.player.z);
    this.ch.pos = this.player.dead ? null : [Math.round(x * 10) / 10, Math.round(z * 10) / 10];
    return this.ch; // v13 map-local save contract remains unchanged
  }

  nearby() {
    const p = this.player, t = this.world.data.town;
    const near = (point, r = 3.6) => !!point && dist(p.x, p.z, point[0], point[1]) < r;
    const workbench = near(t.workbench), trainer = near(t.trainer);
    const wp = this.world.waypoints.find(w => dist(p.x, p.z, w.x, w.z) < 3.8 && this.isWaypointUnlocked(w.id, w.worldId));
    const exit = this.world.exits.find(e => e.worldId === this.data.world.id && dist(p.x, p.z, e.x, e.z) < e.r);
    return { workbench, trainer, skillUpgrade: workbench || trainer || (t.skillUpgradeStations || []).some(point => near(point)), shop: near(t.shop), waypoint: wp?.id || null, exit: exit?.id || null, inTown: this.isSafe(p.x, p.z) };
  }

  teleportTo(id, mapId = this.data.world.id) {
    const p = this.player, stone = this.worlds[mapId]?.waypoints.find(w => w.id === id);
    if (!stone) return { ok: false, reason: 'unknown' };
    if (!this.isWaypointUnlocked(id, mapId)) return { ok: false, reason: 'locked' };
    if (p.dead) return { ok: false, reason: 'dead' };
    if (this.inCombat()) return { ok: false, reason: 'combat' };
    const [x, z] = this.scenePoint(mapId, stone.x, stone.z + 2.2);
    const spot = this.freeSpotNear(x, z);
    p.x = spot.x; p.z = spot.z; p.dash = null; p.cast = null; p.targetId = null;
    for (const a of this.allies) { a.x = p.x + Math.sin(a.slot) * 1.5; a.z = p.z + Math.cos(a.slot) * 1.5; }
    this.activateRegion(mapId);
    this.recordDiscovery();
    this.emit({ type: 'teleport', id, world: mapId, x: p.x, z: p.z });
    return { ok: true };
  }

  travel(id) {
    const exit = this.world.exits.find(e => e.id === id && e.worldId === this.data.world.id), p = this.player;
    if (!exit || !this.worlds[exit.to]) return { ok: false, reason: 'unknown' };
    if (dist(p.x, p.z, exit.x, exit.z) > exit.r) return { ok: false, reason: 'far' };
    if (p.dead) return { ok: false, reason: 'dead' };
    if (this.inCombat()) return { ok: false, reason: 'combat' };
    const [x, z] = this.scenePoint(exit.to, ...exit.arrive), spot = this.freeSpotNear(x, z);
    p.x = spot.x; p.z = spot.z; p.dash = null; p.cast = null; p.targetId = null;
    this.activateRegion(exit.to);
    this.emit({ type: 'teleport', id, world: exit.to, x: p.x, z: p.z });
    return { ok: true, to: exit.to };
  }

  respawnPoint() {
    const p = this.player, current = this.data.world.id;
    let best = null, nearest = Infinity;
    for (const wp of this.world.waypoints) if (wp.worldId === current && this.isWaypointUnlocked(wp.id, current)) {
      const d = dist(p.x, p.z, wp.x, wp.z);
      if (d < nearest) { best = wp; nearest = d; }
    }
    if (best && best.id !== 'town') return this.freeSpotNear(best.x, best.z + 2.2);
    const at = best ? this.world.data.town.respawn : this.world.data.playerSpawn;
    return this.freeSpotNear(...at);
  }
}
