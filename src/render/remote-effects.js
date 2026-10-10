// Small cosmetic replay of existing authored assets, independent of View.handleEvent/Game.
import * as THREE from 'three';
import FX from '../../data/combat-fx.json';
import { approvedCut } from './melee.js';
import { v5FlameMesh } from './fireball-v5.js';
import { frostMesh } from './frost-v2.js';
import { approvedMesh } from './approved-mesh-clips.js';
import { arrowStreak } from './physical.js';
import { icon } from '../ui/icons.js';
import { disposeObject } from './dispose.js';
export class RemoteEffects {
  constructor(view, data) { this.view = view; this.data = data; this.active = []; }
  spawn(id, action, rig) {
    if (this.active.length >= 24) return; // at most one short cue per accepted action
    const s = this.data.skills.combat[action.skill], p = rig.root.position;
    let obj, duration = .6, frame, travel = false, texture;
    if (s.kind.startsWith('melee') || s.kind === 'counter_stance') {
      const cfg = FX.skills[action.skill]?.renderer === 'melee' ? FX.skills[action.skill] : FX.meleeDefaults;
      obj = approvedCut(cfg, Math.min(4, s.range || s.radius || 2.4), (s.arc || 120) * Math.PI / 180, action.step === 1, s.kind === 'melee_nova');
      duration = Math.min(.7, cfg.swing.life); obj.position.y = p.y + cfg.swing.height; frame = 'uT';
    } else if (action.skill === 'firebolt' || action.skill === 'flame_stream') {
      obj = v5FlameMesh(FX.skills.firebolt); obj.position.y = p.y + 1; travel = true;
      obj.traverse(o => { const u = o.material?.uniforms; if (u?.uVelocity) u.uVelocity.value.set(Math.sin(action.angle), 0, Math.cos(action.angle)); });
    } else if (action.skill === 'frost_nova') {
      obj = frostMesh(Math.min(5, s.radius)); obj.position.y = p.y; frame = 'uFrame'; duration = 19 / 30;
    } else if (action.skill === 'stone_burst' || action.skill === 'chain_spark') {
      obj = approvedMesh(action.skill === 'stone_burst' ? 'stone-burst' : 'lightning', Math.min(4, s.radius || 1));
      obj.position.y = p.y; frame = 'uFrame'; duration = Math.min(1.5, obj.userData.clipLife);
    } else if (['hunter_shot', 'charged_shot'].includes(action.skill)) {
      obj = arrowStreak(FX.skills.hunter_shot); obj.position.y = p.y + .9; travel = true; frame = 'uT';
    } else {
      // Remaining skills show their existing icon + the authored cast pose, not persistent zones/summons.
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      texture = new THREE.CanvasTexture(canvas);
      const image = new Image();
      image.onload = () => { if (!texture.userData.released) { canvas.getContext('2d').drawImage(image, 0, 0, 64, 64); texture.needsUpdate = true; } };
      image.src = 'data:image/svg+xml,' + encodeURIComponent(icon(s.icon));
      obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      obj.position.y = p.y + 2.15; obj.scale.set(.6, .6, .6);
    }
    obj.position.x = p.x; obj.position.z = p.z; obj.rotation.y = action.angle;
    this.view.scene.add(obj);
    this.active.push({ id, obj, texture, t: 0, duration, frame, travel, angle: action.angle });
  }
  release(e) { disposeObject(e.obj); if (e.texture) { e.texture.userData.released = true; e.texture.dispose(); } }
  clear(id) {
    let n = 0;
    for (const e of this.active) if (!id || e.id === id) this.release(e); else this.active[n++] = e;
    this.active.length = n;
  }
  update(dt) {
    let n = 0;
    for (const e of this.active) {
      e.t += dt;
      if (e.t >= e.duration) { this.release(e); continue; }
      const k = e.t / e.duration, u = e.obj.material?.uniforms;
      if (e.frame === 'uFrame') u.uFrame.value = e.obj.userData.clipFrames ? k * (e.obj.userData.clipFrames - 1) : 7 + k * 19;
      if (e.frame === 'uT') u.uT.value = k;
      if (e.travel) {
        const d = 6 * dt; e.obj.position.x += Math.sin(e.angle) * d; e.obj.position.z += Math.cos(e.angle) * d;
        e.obj.traverse(o => { const v = o.material?.uniforms; if (v?.uTime) { v.uTime.value = .625 + e.t; v.uTravelled.value = e.t * 6; } });
      }
      if (e.obj.isSprite) e.obj.material.opacity = 1 - k;
      this.active[n++] = e;
    }
    this.active.length = n;
  }
}
