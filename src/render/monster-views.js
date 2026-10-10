// Monster views: one pooled rig per simulated monster near the hero, posed every frame from the
// game state (render only; the view never changes game rules). Lives apart from view.js so that
// monster animation/effect work does not touch the shared scene, light and camera module (and its
// renderer light/shadow review). View.syncMonsters() calls syncMonsterViews().
import { MonsterTrails } from './monster-trails.js';
import { disposeObject } from './dispose.js';
import { setFlash, damp } from './rig.js';
import { cameraVisibility, sleepOffscreenMatrices } from './camera-visibility.js';

export const VIEW_RADIUS = 58;
// Monster models are skinned, so three.js cannot cull them (frustumCulled is off); the view tests a
// sphere around each one against the camera instead. The margin keeps a monster just past the edge
// drawn, so its shadow and wind-up do not pop in.
const CULL_MARGIN = 2;
const MOVING_STATES = new Set(['chase', 'idle', 'return', 'circle', 'retreat']);

// a stalking monster's half-seen look: the body fades, the outline hull fades less
export function fadeRig(mat, hull, see, fade) {
  if (mat.transparent !== see) { mat.transparent = see; mat.depthWrite = !see; mat.needsUpdate = true; if (hull) hull.needsUpdate = true; } // opaque/transparent are separate programs
  mat.opacity = see ? fade : 1;
  if (hull) { hull.transparent = see; hull.depthWrite = !see; hull.opacity = see ? fade * fade : 1; }
}

/**
 * Ground speed of a monster/ally view from its simulated position (m/s, with its forward and
 * sideways parts in the model's facing), so the gait cadence follows real movement. A jump of
 * several metres in one frame (respawn, teleport) is not movement.
 */
export function measureMotion(v, x, z, facing, dt) {
  if (dt > 0 && v.px !== undefined) {
    const dx = x - v.px, dz = z - v.pz;
    const d = Math.hypot(dx, dz);
    const vx = d > 3 ? 0 : dx / dt, vz = d > 3 ? 0 : dz / dt;
    const sn = Math.sin(facing), cs = Math.cos(facing);
    v.speed = Math.min(20, Math.hypot(vx, vz));
    v.vFwd = vx * sn + vz * cs;
    v.vSide = vx * cs - vz * sn;
  } else if (v.speed === undefined) v.speed = v.vFwd = v.vSide = 0;
  v.px = x;
  v.pz = z;
}

/** Create, pose, cull and release the monster rigs of `view` for this frame. */
export function syncMonsterViews(view, dt, time) {
  const g = view.game;
  const p = g.player;
  const seen = view._monsterSeen || (view._monsterSeen = new Set());
  seen.clear();
  // render() has already moved the camera for this frame
  const visibility = cameraVisibility(view.camera);
  let drawn = 0;
  for (const m of g.monsters) {
    const dx = m.x - p.x, dz = m.z - p.z, distanceSq = dx * dx + dz * dz;
    const far = distanceSq > VIEW_RADIUS * VIEW_RADIUS;
    if (far && !view.monsterViews.has(m.id)) continue;
    if (distanceSq > (VIEW_RADIUS + 10) * (VIEW_RADIUS + 10)) continue;
    seen.add(m.id);
    let mv = view.monsterViews.get(m.id);
    if (!mv) {
      const rig = view.takeRig(m.type, m.level, m.boss);
      sleepOffscreenMatrices(rig.root);
      rig.root.position.set(m.x, view.groundAt(m.x, m.z), m.z);
      rig.root.rotation.y = m.facing;
      view.scene.add(rig.root);
      let halo = null;
      if (rig.halo) {
        halo = view.vfx.sprite(0x7fdcff, 1.9, 0.85);
        view.scene.add(halo);
      }
      mv = { rig, flash: 0, hurt: 0, spawnT: 0, lastAttack: null, y: rig.root.position.y, halo, prevFacing: m.facing, turn: 0 };
      view.monsterViews.set(m.id, mv);
    }
    const r = mv.rig;
    mv.spawnT += dt || 1 / 60; // models seen while paused still grow in
    if (m.windup) mv.lastAttack = m.windup.name;
    let d = m.facing - r.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.root.rotation.y += d * Math.min(1, dt * 12);
    mv.turn = damp(mv.turn, dt > 0 ? (d * Math.min(1, dt * 12)) / dt : 0, 6, dt);
    const gy = r.flyer || m.def.hover ? view.world.surfaceY(m.x, m.z) : view.world.groundY(m.x, m.z);
    mv.y = gy > mv.y ? damp(mv.y, gy, 20, dt) : damp(mv.y, gy, 12, dt);
    mv.kx = damp(mv.kx || 0, 0, 14, dt);
    mv.kz = damp(mv.kz || 0, 0, 14, dt);
    r.root.position.set(m.x + mv.kx, mv.y, m.z + mv.kz);
    measureMotion(mv, m.x, m.z, r.root.rotation.y, dt);
    mv.hurt = Math.max(0, mv.hurt - dt * 5);
    mv.flash = Math.max(0, mv.flash - dt);
    // off screen: not drawn and not posed (the simulation still moves it and lets it attack)
    const h = (r.height || 1.5) * (r.baseScale || 1);
    const onScreen = !view.cullMonsters || visibility.intersectsSphere(r.root.position.x, r.root.position.y + h * 0.5, r.root.position.z, Math.max(1.2, h) + CULL_MARGIN);
    r.root.visible = onScreen;
    if (!onScreen) {
      if (mv.onScreen !== false) r.trails?.clear();
      mv.onScreen = false;
      if (mv.halo) mv.halo.visible = false;
      // Keep hidden-state timers current, but do not emit off-camera transition
      // smoke, status particles, trail geometry or material updates.
      if (m.def.behavior === 'stalker' || mv.fade < 1) {
        mv.hidden = m.stealth && !m.dead;
        mv.fade = damp(mv.fade ?? 1, mv.hidden ? 0 : 1, 9, dt);
      }
      continue;
    }
    mv.onScreen = true;
    drawn++;
    const tgt = m.targetUnit || p;
    const state = mv.animationState || (mv.animationState = {});
    state.moving = m.moving && MOVING_STATES.has(m.state);
    state.speedFactor = m.aggro ? 1 : 0.4;
    state.state = m.state;
    state.windup = m.state === 'windup' && m.windup ? m.windup.name : null;
    state.windupT = m.stateT;
    state.windupTotal = m.windup?.total || 1;
    state.actT = m.stateT;
    state.actionTotal = m.melee ? m.def.attacks[m.melee.name].duration : m.stateDur;
    state.hitTime = m.melee ? m.def.attacks[m.melee.name].hitTime : 0;
    state.attack = m.def.attacks[m.melee?.name || mv.lastAttack];
    state.enraged = m.enraged;
    state.lastAttack = mv.lastAttack;
    state.hurt = mv.hurt;
    state.lookYaw = m.melee || (m.def.primaryAttack && m.windup && m.stateT >= m.windup.total * .55) ? 0 : m.aggro && !m.dead ? view.lookYaw(r.root.rotation.y, m.x, m.z, tgt.x, tgt.z) : 0;
    state.turn = mv.turn;
    state.speed = mv.speed;
    state.vFwd = mv.vFwd;
    state.vSide = mv.vSide;
    state.aggro = !!m.aggro;
    state.alt = m.alt;
    r.animate(
      r,
      state,
      dt,
      time
    );
    // claw/fang/pincer trails from the limb that strikes, open around the strike itself
    const strike = m.windup?.name || m.melee?.name || mv.lastAttack;
    const looks = r.looks || (r.looks = {}); // per rig (one type): no string keys per frame
    if (strike && !(strike in looks)) looks[strike] = r.restInverse ? view.vfx.monsterLook(m.type, strike) : null;
    const look = strike ? looks[strike] : null;
    if (look?.limbs || r.trails) {
      // the wind-up stays dark: only the strike itself (act, or the snap that follows an instant bite)
      const open = !m.dead && (m.state === 'act' || (m.state === 'recover' && m.stateT < 0.3));
      r.trails ||= new MonsterTrails(view.scene);
      r.trails.update(dt, r, look?.limbs ? look : r.trails.look, open && !!look?.limbs);
    }
    let sc = r.baseScale * Math.min(1, 0.3 + mv.spawnT * 2.5);
    if (m.dead) {
      const k = Math.min(1, m.deathT / 1.4);
      sc *= 1 - k * 0.35;
      r.root.position.y = mv.y - k * k * 0.7;
      r.root.rotation.z = Math.min(1, m.deathT / 0.4) * 1.2;
    } else r.root.rotation.z = 0;
    r.root.scale.setScalar(sc);
    if (mv.flash > 0) setFlash(r.material, 0.55, 0, 0);
    else if (m.windup && m.state === 'windup') setFlash(r.material, 0, 0.12 + 0.12 * Math.max(0, Math.sin(time * 24)), 0);
    else if (m.statuses?.chill) setFlash(r.material, 0, 0, 0.25);
    else if (m.statuses?.hex) setFlash(r.material, 0, 0, 0.12);
    else setFlash(r.material, 0, 0, 0);
    // a stalking monster is half-seen: the body fades, its eyes and outline stay readable
    if (m.def.behavior === 'stalker' || mv.fade < 1) {
      const hidden = m.stealth && !m.dead;
      if (mv.hidden !== undefined && mv.hidden !== hidden) {
        // vanishing or appearing: a puff of grey smoke hides the change
        const sy = mv.y + 0.7 * r.baseScale;
        view.vfx.dust.burst(m.x, sy, m.z, 22, { color: 0x8d8a96, size: 0.9, sizeEnd: 2.0, speed: 2.2, life: 0.9, up: 0.5, drag: 2.5 });
        view.vfx.dust.burst(m.x, sy + 0.3, m.z, 8, { color: 0x4a4656, size: 0.7, sizeEnd: 1.6, speed: 1.2, life: 1.1, up: 0.9, drag: 2 });
      }
      mv.hidden = hidden;
      mv.fade = damp(mv.fade ?? 1, hidden ? 0 : 1, 9, dt);
      const gone = hidden && mv.fade < 0.04; // truly gone, not a faint shape
      r.root.visible = onScreen && !gone;
      const see = mv.fade < 0.99;
      fadeRig(r.material, r.hull, see, mv.fade);
      if (r.modelMaterial) fadeRig(r.modelMaterial, r.modelHull, see, mv.fade);
    }
    if (mv.halo) {
      mv.halo.visible = !m.dead && onScreen && !(mv.hidden && mv.fade < 0.04);
      mv.halo.position.set(m.x, mv.y + 1.25 * r.baseScale, m.z);
      mv.halo.scale.setScalar((r.glowScale || 1.9) * r.baseScale);
    }
    // a mole digging in throws up earth for the whole wind-up
    if (m.windup?.name === 'erupt' && m.state === 'windup' && Math.random() < dt * 14) view.vfx.digDust(m.x, m.z, 1);
    // status sparkles
    if (m.statuses?.burn && Math.random() < dt * 8) view.vfx.fx.add(m.x + (Math.random() - 0.5) * 0.8, mv.y + 0.6 + Math.random() * 0.6, m.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, { color: 0xff9a40, size: 0.22, life: 0.5 });
    if (m.statuses?.poison && Math.random() < dt * 6) view.vfx.fx.add(m.x + (Math.random() - 0.5) * 0.8, mv.y + 0.6 + Math.random() * 0.6, m.z + (Math.random() - 0.5) * 0.8, 0, 0.8, 0, { color: 0xa8e04a, size: 0.2, life: 0.6 });
    if (m.statuses?.hex && Math.random() < dt * 5) view.vfx.fx.add(m.x + (Math.random() - 0.5) * 0.6, mv.y + 1.4 * r.baseScale, m.z + (Math.random() - 0.5) * 0.6, 0, 0.5, 0, { color: 0xb88cff, size: 0.22, life: 0.6 });
  }
  view.monstersDrawn = drawn;
  for (const [id, mv] of view.monsterViews) {
    if (!seen.has(id)) {
      view.releaseRig(mv.rig);
      disposeObject(mv.halo);
      view.monsterViews.delete(id);
    }
  }
}
