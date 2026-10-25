// The skill effects in skillfx/ (light-and-ribbon anime style, first built on the FX test bench)
// driven by core events. One director serves the game View and the bench: the host gives it the
// game, the hero's animator and rig, monster positions and a few UI hooks. Cosmetic only: it reads
// state and events and never changes rules.
//
// Heights: the effects work above a flat floor (see fxGround in skillfx/fx-common.js). Points the
// director hands them are (x, metres above the ground, z); world points from the rig are converted.
import * as THREE from 'three';
import STAFF_CAST from '../../data/staff-cast.json';
import { fxGround } from './skillfx/fx-common.js';
import { SlashFx } from './skillfx/slash-fx.js';
import { ACTIONS, pickAction } from './actions.js';
import { FireExtras } from './skillfx/fire-extras.js';
import { ChainFx } from './skillfx/chain-fx.js';
import { FrostFx } from './skillfx/frost-fx.js';
import { FlameFx } from './skillfx/flame-fx.js';
import { ModFx } from './skillfx/mod-fx.js';
import { VenomFx } from './skillfx/venom-fx.js';
import { RainFx } from './skillfx/rain-fx.js';
import { PowerFx, setPowerFacing } from './skillfx/power-fx.js';
import { SplitFx } from './skillfx/split-fx.js';
import { SunderFx, SUNDER_PALETTE } from './skillfx/sunder-fx.js';
import { MaceFx } from './skillfx/mace-fx.js';
import { ThrustFx } from './skillfx/thrust-fx.js';
import { BashFx } from './skillfx/bash-fx.js';
import { RiposteFx, RIPOSTE_PALETTE } from './skillfx/riposte-fx.js';

// skills whose presentation this director owns (the old renderer keeps every other skill)
export const SKILL_FX = new Set(['slash', 'firebolt', 'chain_spark', 'frost_nova', 'flame_stream', 'venom_mire', 'arrow_rain', 'charged_shot', 'frontline_split', 'armor_cleave', 'interrupt_slam', 'weakpoint', 'shield_bash', 'riposte']);
// projectiles drawn here instead of by the old renderer
export const OWN_PROJECTILES = new Set(['venom_mire', 'charged_shot']);
// melee contacts that are not the Slash crescent (they draw their own effect on each 'slash')
const OWN_STRIKE = new Set(['weakpoint', 'interrupt_slam', 'shield_bash']);
const SWING_LEAD = 0.12;
export const ELEMENT_COLOR = { fire: '#ff9a4a', cold: '#9fe0ff', lightning: '#ffe56a', physical: '#ffffff', poison: '#9be36a', arcane: '#d6a6ff' };

/**
 * host: {
 *   scene, camera, renderer,
 *   game(): the Game, anim(): HumanoidAnimator, rig(): hero rig, weapon(): weapon type,
 *   body(id): {x, z, h} of a monster (h: its height, for heads and centres) or null,
 *   float(x, y, z, text, color, big): a floating label (y above the ground),
 *   banner(text), shake(amp, time), vfx: the game's Vfx (Firebolt's cast, ball and impacts)
 *   showMarks: draw Flank Thrust's weak-side marks (bench: every dummy; game: the target)
 * }
 */
export class SkillFx {
  constructor(host) {
    this.host = host;
    const { scene, camera, renderer } = host;
    this.slash = new SlashFx(scene, camera);
    this.fire = new FireExtras(scene, camera);
    this.chain = new ChainFx(scene, camera);
    this.frost = new FrostFx(scene, camera);
    this.flame = new FlameFx(scene, camera, renderer);
    this.mod = new ModFx(scene, camera);
    this.venom = new VenomFx(scene, camera);
    this.rain = new RainFx(scene, camera);
    this.power = new PowerFx(scene, camera);
    this.split = new SplitFx(scene, camera);
    this.sunder = new SunderFx(scene, camera);
    this.mace = new MaceFx(scene, camera);
    this.thrust = new ThrustFx(scene, camera);
    this.bash = new BashFx(scene, camera);
    this.riposte = new RiposteFx(scene, camera);
    const shake = (amp, time) => host.shake(amp, time);
    for (const fx of [this.split, this.mace, this.thrust, this.bash, this.riposte]) fx.onShake = shake;
    this.timers = []; this.time = 0; this.primarySwing = false; this.swingStep = 0; this.lastSwingAt = -9; this.lastNovaAt = -9; this.powerRatio = 0;
    // scratch (no allocation per frame)
    this.tipV = new THREE.Vector3(); this.castV = new THREE.Vector3(); this.bladeBase = new THREE.Vector3(); this.bladeTip = new THREE.Vector3(); this.bladeDir = new THREE.Vector3();
    this.center = new THREE.Vector3(); this.head = new THREE.Vector3(); this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.mouth = new THREE.Vector3();
    this.markBuf = Array.from({ length: 8 }, () => ({ x: 0, z: 0, facing: 0 })); this.marks = [];
    this.exposedBuf = Array.from({ length: 12 }, () => ({ x: 0, z: 0, t: 0, full: 5 })); this.exposed = [];
    this.headOf = (id) => { const b = host.body(id); return b ? this.head.set(b.x, b.h + 0.4, b.z) : null; };
    this.posOf = (id) => host.body(id);
    this.timerDone = (t) => !t.done || this.time - t.at < 2;
  }
  get game() { return this.host.game(); }
  skillOf(id) { return this.game.skills.find((s) => s && s.id === id) || null; }
  // a world point from the rig, made ground-relative
  rel(v) { v.y -= fxGround.y(v.x, v.z); return v; }
  staffTip() {
    const w = this.host.rig()?.bones?.weapon, p = this.game.player;
    if (w) { w.updateWorldMatrix(true, false); return this.rel(w.localToWorld(this.tipV.set(0, 0, STAFF_CAST.tip))); }
    return this.tipV.set(p.x + Math.sin(p.facing) * 0.5, 1.6, p.z + Math.cos(p.facing) * 0.5);
  }
  // the Firebolt charge's point (vfx.castSocket: the game's charge ball sits on it; a wand's tip, not
  // the staff head's distance along it), ground-relative
  castTip() {
    const rig = this.host.rig();
    return rig ? this.rel(this.host.vfx.castSocket(rig, this.host.weapon(), this.castV)) : this.staffTip();
  }
  // the weapon's hilt-side and tip points this frame (ground-relative)
  bladePoints() {
    const w = this.host.rig()?.bones?.weapon, p = this.game.player;
    if (!w) { this.bladeBase.set(p.x, 1.1, p.z); this.bladeTip.set(p.x + Math.sin(p.facing), 1.1, p.z + Math.cos(p.facing)); return; }
    w.updateWorldMatrix(true, false); w.getWorldPosition(this.bladeBase); w.getWorldDirection(this.bladeDir);
    this.bladeTip.copy(this.bladeBase).addScaledVector(this.bladeDir, 1.0);
    this.bladeBase.addScaledVector(this.bladeDir, 0.25);
    this.rel(this.bladeBase); this.rel(this.bladeTip);
  }
  centerOf(id) { const b = this.host.body(id); return b ? this.center.set(b.x, b.h * 0.55, b.z) : null; }
  nextSwingStep() { this.swingStep = this.time - this.lastSwingAt < 1.2 ? (this.swingStep + 1) % 2 : 0; this.lastSwingAt = this.time; return this.swingStep; }
  slashOpts(s, palette = null) {
    const p = this.game.player;
    // a cut retargeted from a clip sweeps its own way (its sweep): the action just played (a two-handed
    // axe or mace plays the greatblade's cut), else the one picked for the weapon; the others alternate
    const playing = this.host.anim()?.action?.name;
    const sweep = ACTIONS[playing && ACTIONS[playing]?.sweep !== undefined ? playing : pickAction(s.id, 'melee_arc', this.host.weapon(), this.swingStep)]?.sweep;
    return { palette: palette || (s.id === 'armor_cleave' ? SUNDER_PALETTE : null), range: s.range, arc: s.arc, dir: sweep ?? (this.swingStep === 0 ? 1 : -1), where: () => ({ x: p.x, z: p.z, angle: p.facing }) };
  }
  play(action, dur, step, hit, kind) { this.host.anim().play(action, dur, this.host.weapon(), step, hit, kind); }
  // the bench's look for the Firebolt charge: only the smooth filled core of the game's charge
  smoothCharge(mesh) {
    if (!mesh?.userData.v5) return;
    mesh.material.visible = false;
    for (const ch of mesh.children) if (ch.material?.uniforms?.uFilled?.value !== 1) ch.visible = false;
  }

  /** One core event. Returns true when this director drew it (the caller then skips its own drawing). */
  event(e) {
    const g = this.game, host = this.host;
    switch (e.type) {
      case 'castStart': {
        if (!SKILL_FX.has(e.skill)) return false;
        const s = this.skillOf(e.skill); if (!s) return false;
        if (e.kind === 'counter_stance') { // Measured Riposte: a guard, or (inside the ready window) the counter cut
          if (g.player.riposte?.readyUntil > g.time) {
            this.play('slash', e.total + 0.3, this.nextSwingStep(), e.total, 'melee_arc');
            this.slash.swing(e.total, this.slashOpts(s, RIPOSTE_PALETTE)); this.riposte.counter(true); host.banner('สวนกลับ!');
          } else this.play('guardBlock', e.total + s.guard.duration, 0, e.total, e.kind);
          return true;
        }
        if (e.charge !== undefined) this.release(e.charge); // a charged shot looses: its arrow and impact grow with the charge
        this.play(e.skill, e.total + 0.28, e.kind === 'melee_arc' ? this.nextSwingStep() : e.step, e.total, e.kind);
        if (e.kind === 'melee_arc') { this.primarySwing = true; if (!OWN_STRIKE.has(e.skill)) this.slash.swing(e.total, this.slashOpts(s)); }
        if (e.kind === 'projectile' && !OWN_PROJECTILES.has(e.skill)) {
          host.vfx.beginCast(e, s.element);
          if (s.element === 'fire') { this.fire.gather(e.total); this.smoothCharge(host.vfx.castFlame?.mesh); }
        }
        if (e.kind === 'chain') this.chain.beginCharge(e.total, s.element);
        if (e.kind === 'melee_line') this.split.windup(e.total, s.range, s.width, s.element);
        if (e.kind === 'nova') { this.frost.setElement(s.element); this.frost.beginCharge(g.player.x, g.player.z, e.total, s.radius); }
        return true;
      }
      case 'channelStart': {
        if (!SKILL_FX.has(e.skill)) return false;
        const s = this.skillOf(e.skill); if (!s) return false;
        this.play(e.skill, e.total + 0.28, 0, e.total, 'channel_cone'); this.flame.begin(s, s.element);
        return true;
      }
      case 'channelPulse': if (!this.flame.state) return false; this.flame.pulse(e); return true;
      case 'channelEnd': if (!this.flame.state) return false; this.flame.end(); host.anim().action = null; return true;
      case 'chargeStart': {
        if (!SKILL_FX.has(e.skill)) return false;
        const s = this.skillOf(e.skill);
        this.play('bowDrawHold', e.total * 3, 0, null, 'projectile'); this.power.setElement(s?.element); this.power.beginCharge(e.total);
        return true;
      }
      case 'chargeEnd': if (!this.power.charge) return false; this.power.endCharge(); return true; // released or cancelled
      case 'chain': {
        const last = e.points[e.points.length - 1];
        const miss = e.points.length === 2 && !g.monsters.some((m) => !m.dead && Math.hypot(m.x - last[0], m.z - last[1]) < 0.05);
        this.chain.play(e.points, e.element, this.staffTip(), miss);
        return true;
      }
      case 'nova': {
        if (e.element === 'arcane') return false; // a ward breaking: the old renderer's ring
        const targets = g.monsters.filter((m) => !m.dead && Math.hypot(m.x - e.x, m.z - e.z) - m.r <= e.radius).map((m) => ({ x: m.x, z: m.z }));
        const echo = this.time - this.lastNovaAt < 1.2 && !this.frost.pendingCharge;
        this.lastNovaAt = this.time;
        this.frost.setElement(e.element);
        this.frost.burst(e.x, e.z, e.radius, targets, echo ? 0.7 : 1);
        if (echo) host.banner('สะท้อนซ้ำ!');
        return true;
      }
      case 'lineStrike': this.split.strike(e); return true;
      case 'guardStance': { const s = this.skillOf('riposte') || g.player.riposte?.skill; this.riposte.guard(e.duration, s?.guard?.arc || 110); return true; }
      case 'playerHit': {
        const r = g.player.riposte;
        if (!r || e.dot) return false;
        // the monster that struck: the nearest one in front within reach
        let best = null, bd = 4;
        for (const m of g.monsters) { if (m.dead) continue; const d = Math.hypot(m.x - g.player.x, m.z - g.player.z) - m.r; if (d < bd) { bd = d; best = m; } }
        if (best) {
          this.riposte.lunge(this.from.set(best.x, 1.2, best.z), this.to.set(g.player.x, 1.2, g.player.z));
          this.riposte.struck(g.player, best, e.blocked, r.skill.guard.readyDuration);
          if (e.blocked) host.banner('ปัดป้อง!');
        }
        return false; // the View still flinches the hero and shakes for the blow
      }
      case 'stunned': {
        const m = g.monsterById?.(e.id) || g.monsters.find((q) => q.id === e.id);
        const head = this.headOf(e.id);
        this.mace.interrupted(e.id, head ? head.clone() : null, e.duration ?? m?.stateDur ?? 1);
        return true;
      }
      case 'area': if (e.kind !== 'arrow_rain' || e.owner !== 'player') return false; this.rain.wave(e, this.skillOf('arrow_rain')?.element || 'physical', g.player); return true;
      case 'burst':
        if (e.kind === 'arrow_rain') { this.rain.burst(e); return true; }
        if (e.kind === 'mod_burst') { this.mod.burst(e); host.banner(e.element === 'cold' ? 'ผลึกแตก!' : 'ระเบิดเสริม!'); return true; }
        return false;
      case 'slash': {
        if (!SKILL_FX.has(e.skill)) return false;
        const s = this.skillOf(e.skill), p = g.player;
        if (!s) return true;
        if (e.skill === 'shield_bash') this.bash.bash(p.x, p.z, e.angle, e.range, e.arc);
        if (e.skill === 'weakpoint') this.thrust.thrust(p.x, 1.15, p.z, e.angle, e.range);
        if (e.skill === 'interrupt_slam') this.mace.slam(p.x, p.z, p.facing, s.range, s.arc);
        const primary = this.primarySwing; this.primarySwing = false;
        // Multistrike: each repeat replays this skill's own motion, landing on the repeat's hit time
        if (primary && !e.triggered && s.repeats) {
          for (let k = 1; k <= s.repeats; k++) {
            const at = this.time + k * s.repeatDelay - SWING_LEAD;
            this.timers.push({ at, done: false, fn: () => { this.play(e.skill, 0.3, this.nextSwingStep(), SWING_LEAD, 'melee_arc'); if (!OWN_STRIKE.has(e.skill)) this.slash.swing(SWING_LEAD, this.slashOpts(s)); } });
          }
        }
        return true;
      }
      case 'impact': {
        if (e.kind === 'venom_mire') { this.venom.impact(e); return true; }
        if (e.kind === 'charged_shot') { this.power.impact(e, this.powerRatio); return true; }
        if (e.element === 'fire' && e.kind === 'firebolt') { this.fire.impact(e.x, 1.0, e.z); return true; }
        return false;
      }
      case 'poisonStack': { const b = host.body(e.id); if (b) host.float(b.x, b.h + 0.4, b.z, 'พิษ ×' + e.stacks, ELEMENT_COLOR.poison, e.stacks >= 5); return true; }
      case 'hit': {
        if (e.dot || !SKILL_FX.has(e.skill)) return false;
        const c = this.centerOf(e.id); if (!c) return true;
        if (e.skill === 'flame_stream') this.flame.lick(c);
        if (e.skill === 'frontline_split') this.split.cut(c);
        if (e.skill === 'interrupt_slam') this.mace.hit(c, e.fromX, e.fromZ);
        if (e.skill === 'riposte') this.riposte.hit(c, e.fromX, e.fromZ);
        if (e.skill === 'shield_bash') this.bash.hit(e.id, c, e.fromX, e.fromZ, this.skillOf('shield_bash')?.taunt?.duration || 3);
        if (e.skill === 'armor_cleave') { this.sunder.hit(c, e.fromX, e.fromZ); host.shake(0.06, 0.14); }
        if (e.skill === 'weakpoint') {
          // struck from the side or behind the way it faces: the rules' positional bonus
          const m = g.monsters.find((q) => q.id === e.id), weak = !!m && (e.fromX - m.x) * Math.sin(m.facing) + (e.fromZ - m.z) * Math.cos(m.facing) < 0;
          this.thrust.hit(c, Math.atan2(c.x - e.fromX, c.z - e.fromZ), weak);
          if (weak) { const b = host.body(e.id); host.float(b.x, b.h + 0.5, b.z, 'จุดอ่อน!', '#ffd45a', true); }
        }
        return true;
      }
    }
    return false;
  }
  // a charged shot is about to be loosed with this charge (0..1)
  release(ratio) { this.powerRatio = ratio; this.power.release(ratio); }

  update(dt) {
    const g = this.game, p = g.player, host = this.host;
    this.time += dt;
    const tip = this.staffTip();
    this.chain.update(dt, tip);
    this.frost.update(dt);
    if (this.flame.state || this.flame.busy || this.flame.sparks.length) {
      // the flame's mouth: just in front of the staff head, at chest height
      const ahead = (tip.x - p.x) * Math.sin(p.facing) + (tip.z - p.z) * Math.cos(p.facing), mouth = this.mouth.copy(tip).setY(Math.max(1.5, Math.min(1.9, tip.y)));
      if (ahead < 0.75) { mouth.x += Math.sin(p.facing) * (0.75 - ahead); mouth.z += Math.cos(p.facing) * (0.75 - ahead); }
      this.flame.update(dt, mouth, p.x, p.z, p.facing);
    }
    this.mod.syncAreas(g.areas);
    this.mod.update(dt);
    this.venom.syncProjectiles(g.projectiles, 'venom_mire', dt);
    // poisoned monsters give off motes (the ones near the hero)
    for (const m of g.monsters) {
      const pz = m.statuses?.poison;
      if (!pz || m.dead || Math.abs(m.x - p.x) > 24 || Math.abs(m.z - p.z) > 24) continue;
      this.venom.poisoned(m.x, m.z, dt, pz.stacks || 1);
    }
    this.venom.update(dt, tip);
    this.rain.update(dt);
    setPowerFacing(p.facing);
    const ch = p.charging;
    this.power.syncProjectiles(g.projectiles, 'charged_shot', dt);
    this.power.update(dt, tip, ch ? Math.min(1, ch.t / ch.skill.charge.duration) : 0);
    for (const t of this.timers) if (this.time >= t.at && !t.done) { t.done = true; t.fn(); }
    let w = 0; for (const t of this.timers) if (this.timerDone(t)) this.timers[w++] = t; this.timers.length = w;
    this.slash.update(dt);
    this.fire.update(dt, this.castTip());
    this.bladePoints();
    this.split.update(dt, p, p.facing, this.bladeBase, this.bladeTip);
    // Sunder Cut's open armour on what it struck
    this.exposed.length = 0;
    for (const m of g.monsters) {
      const ex = m.statuses?.exposure;
      if (!ex || m.dead || this.exposed.length >= this.exposedBuf.length) continue;
      const o = this.exposedBuf[this.exposed.length]; o.x = m.x; o.z = m.z; o.t = ex.t; o.full = this.skillOf('armor_cleave')?.exposure?.duration || 5; this.exposed.push(o);
    }
    this.sunder.update(dt, this.exposed);
    this.mace.update(dt, this.headOf);
    // Flank Thrust: the weak side of the monsters it is aimed at
    this.marks.length = 0;
    if (host.showMarks) for (const m of host.showMarks()) { if (this.marks.length >= this.markBuf.length) break; const o = this.markBuf[this.marks.length]; o.x = m.x; o.z = m.z; o.facing = m.facing; this.marks.push(o); }
    this.thrust.update(dt, this.marks);
    this.bash.update(dt, this.posOf);
    this.riposte.update(dt, p, this.bladeBase, this.bladeTip);
  }
  // the offscreen flame passes, right before the main render
  prerender() { this.flame.prerender(); }
  resize(w, h, cssW, cssH) { this.flame.resize(w, h, cssW, cssH); }
  get counterReady() { return this.riposte.ready; }
  clear() {
    for (const fx of [this.chain, this.frost, this.flame, this.mod, this.venom, this.rain, this.power, this.split, this.sunder, this.mace, this.thrust, this.bash, this.riposte, this.slash, this.fire]) fx.clear();
    this.timers.length = 0;
  }
}
