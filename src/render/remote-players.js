import * as THREE from 'three';
import { buildHumanoid, HumanoidAnimator, updateScarf } from './hero.js';
import { disposeObject } from './dispose.js';
import { characterBase, weaponModelKey } from './models.js';
import { visualGear } from '../network/protocol.js';
import { RemoteEffects } from './remote-effects.js';

// Cosmetic actors only: never monsters, targets, allies, colliders or save state.
export class RemotePlayers {
  constructor(view, data) { this.view = view; this.data = data; this.actors = new Map(); this.effects = new RemoteEffects(view, data); this.refreshT = 0; }
  remove(id, a) { this.effects.clear(id); disposeObject(a.rig.root); disposeObject(a.rig.scarf?.mesh); this.actors.delete(id); }
  target(pose) {
    const [x, z] = this.view.game.coordinateOrigin || [0, 0];
    return { ...pose, x: pose.x - (pose.region ? x : 0), z: pose.z - (pose.region ? z : 0) };
  }
  sync(players) {
    this.players = players;
    for (const [id, a] of this.actors) if (!players.has(id)) this.remove(id, a);
    for (const [id, p] of players) {
      let a = this.actors.get(id);
      const target = this.target(p.pose);
      const gear = visualGear(p.gear, this.data.items);
      const key = JSON.stringify([p.look, p.gear, weaponModelKey(gear.bases), !!characterBase('hairsample'), !!characterBase('hero_base')]);
      if (!a || a.key !== key) {
        const old = a;
        const rig = buildHumanoid(p.look, gear);
        const marker = new THREE.Mesh(new THREE.RingGeometry(.38, .46, 32), new THREE.MeshBasicMaterial({ color: 0x71e3ef, side: THREE.DoubleSide, depthWrite: false }));
        marker.rotation.x = -Math.PI / 2; marker.position.y = .04; rig.root.add(marker);
        rig.root.name = `remote-${id}`;
        if (old) {
          rig.root.position.copy(old.rig.root.position); rig.root.rotation.copy(old.rig.root.rotation);
          disposeObject(old.rig.root); disposeObject(old.rig.scarf?.mesh);
          old.animator.rig = rig; old.animator.b = rig.bones;
        } else {
          rig.root.position.set(target.x, this.view.world.groundY(target.x, target.z), target.z); rig.root.rotation.y = target.facing;
        }
        this.view.scene.add(rig.root); if (rig.scarf) this.view.scene.add(rig.scarf.mesh);
        a = { rig, key, gear, animator: old?.animator || new HumanoidAnimator(rig), target, state: old?.state || { speed: 0, facing: target.facing, moving: false, time: 0 }, pending: old?.pending || null };
        this.actors.set(id, a);
      }
      a.target = target;
    }
  }
  action(id, action) {
    const a = this.actors.get(id); if (!a) return;
    const now = performance.now();
    a.tokens = Math.min(8, (a.tokens ?? 8) + Math.max(0, now - (a.at ?? now)) * .006); a.at = now;
    if (a.tokens < 1) return; a.tokens--;
    if (action.phase === 'cancel') { a.pending = null; a.animator.action = null; this.effects.clear(id); return; }
    const local = this.view.game.player;
    if (Math.hypot(a.target.x - local.x, a.target.z - local.z) >= 58) return;
    const s = this.data.skills.combat[action.skill];
    a.animator.play(action.skill, action.duration + .28, a.gear.weapon, action.step, action.duration, s.kind);
    a.rig.root.rotation.y = action.angle;
    // Charge/channel cues are short previews. A cast alone releases the visual at its hit time.
    a.pending = action.phase === 'cast' ? { action, t: 0 } : null;
  }
  update(dt, time) {
    this.refreshT += dt;
    if (this.refreshT >= .5 && this.players) { this.refreshT = 0; this.sync(this.players); }
    for (const [id, a] of this.actors) {
      const { root } = a.rig, p = a.target, pos = root.position, local = this.view.game.player;
      root.visible = Math.hypot(p.x - local.x, p.z - local.z) < 58;
      if (a.rig.scarf) a.rig.scarf.mesh.visible = root.visible;
      if (!root.visible) { a.pending = null; a.animator.action = null; this.effects.clear(id); continue; }
      const distance = Math.hypot(p.x - pos.x, p.z - pos.z), k = distance > 12 ? 1 : 1 - Math.exp(-15 * dt);
      pos.x += (p.x - pos.x) * k; pos.z += (p.z - pos.z) * k; pos.y = this.view.world.groundY(pos.x, pos.z);
      if (!a.animator.action) root.rotation.y += Math.atan2(Math.sin(p.facing - root.rotation.y), Math.cos(p.facing - root.rotation.y)) * k;
      a.state.speed = Math.min(12, distance * k / Math.max(dt, .001)); a.state.moving = p.moving && a.state.speed > .05; a.state.facing = root.rotation.y; a.state.time = time;
      a.animator.update(dt, a.state); updateScarf(a.rig, dt, a.state.speed);
      if (a.pending) { a.pending.t += dt; if (a.pending.t >= a.pending.action.duration) { this.effects.spawn(id, a.pending.action, a.rig); a.pending = null; } }
    }
    this.effects.update(dt);
  }
  dispose() { this.sync(new Map()); this.effects.clear(); this.players = null; }
}
