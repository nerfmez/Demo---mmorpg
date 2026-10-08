import * as THREE from 'three';
import { buildHumanoid, HumanoidAnimator, updateScarf } from './hero.js';
import { disposeObject } from './dispose.js';

// Cosmetic actors only: never registered as monsters, targets, allies or colliders.
export class RemotePlayers {
  constructor(view) { this.view = view; this.actors = new Map(); }
  sync(players) {
    for (const [id, a] of this.actors) if (!players.has(id)) {
      disposeObject(a.rig.root); disposeObject(a.rig.scarf?.mesh); this.actors.delete(id);
    }
    for (const [id, p] of players) {
      let a = this.actors.get(id);
      if (!a) {
        const rig = buildHumanoid(p.look);
        const marker = new THREE.Mesh(new THREE.RingGeometry(.38, .46, 32), new THREE.MeshBasicMaterial({ color: 0x71e3ef, side: THREE.DoubleSide, depthWrite: false }));
        marker.rotation.x = -Math.PI / 2; marker.position.y = .04; rig.root.add(marker);
        rig.root.name = `remote-${id}`;
        rig.root.position.set(p.pose.x, this.view.world.groundY(p.pose.x, p.pose.z), p.pose.z);
        rig.root.rotation.y = p.pose.facing;
        this.view.scene.add(rig.root); if (rig.scarf) this.view.scene.add(rig.scarf.mesh);
        a = { rig, animator: new HumanoidAnimator(rig), target: p.pose, state: { speed: 0, facing: p.pose.facing, moving: false, time: 0 } };
        this.actors.set(id, a);
      }
      a.target = p.pose;
    }
  }
  update(dt, time) {
    for (const a of this.actors.values()) {
      const { root } = a.rig, p = a.target, pos = root.position;
      const local = this.view.game.player;
      root.visible = Math.hypot(p.x - local.x, p.z - local.z) < 58;
      if (a.rig.scarf) a.rig.scarf.mesh.visible = root.visible;
      if (!root.visible) continue;
      const distance = Math.hypot(p.x - pos.x, p.z - pos.z);
      const k = distance > 12 ? 1 : 1 - Math.exp(-15 * dt);
      pos.x += (p.x - pos.x) * k; pos.z += (p.z - pos.z) * k;
      pos.y = this.view.world.groundY(pos.x, pos.z);
      root.rotation.y += Math.atan2(Math.sin(p.facing - root.rotation.y), Math.cos(p.facing - root.rotation.y)) * k;
      a.state.speed = Math.min(12, distance * k / Math.max(dt, .001));
      a.state.moving = p.moving && a.state.speed > .05; a.state.facing = root.rotation.y; a.state.time = time;
      a.animator.update(dt, a.state); updateScarf(a.rig, dt, a.state.speed);
    }
  }
  dispose() { this.sync(new Map()); }
}
