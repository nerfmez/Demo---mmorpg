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
import { MoveFx } from './skillfx/move-fx.js';
import { MeteorFx } from './skillfx/meteor-fx.js';
import { ThunderFx } from './skillfx/thunder-fx.js';
import { BlizzardFx } from './skillfx/blizzard-fx.js';
import { ShatterFx } from './skillfx/shatter-fx.js';
import { RendFx } from './skillfx/rend-fx.js';
import { StormFx } from './skillfx/storm-fx.js';
import { ShadowFx } from './skillfx/shadow-fx.js';
import { IronFx } from './skillfx/iron-fx.js';
import { BuffFx, LOOKS as BUFF_LOOKS } from './skillfx/buff-fx.js';
import { BlessFx } from './skillfx/bless-fx.js';
import { VolleyFx } from './skillfx/volley-fx.js';
import { KillFx } from './skillfx/kill-fx.js';
import { BellFx } from './skillfx/bell-fx.js';
import { LightChainFx } from './skillfx/lightchain-fx.js';
import { WaveFx, wavePalette } from './skillfx/wave-fx.js';
import { DrawFx } from './skillfx/draw-fx.js';
import { GreatshieldFx } from './skillfx/greatshield-fx.js';
const BUFF_KEYS = Object.keys(BUFF_LOOKS);

// skills whose presentation this director owns (the old renderer keeps every other skill)
// Cross Cut's violet crescents (owner's pick)
const CROSS_PALETTE = { hot: [1, 0.95, 1], body: [0.8, 0.52, 1.0], glow: [0.56, 0.22, 1.0] };
export const SKILL_FX = new Set(['slash', 'firebolt', 'chain_spark', 'frost_nova', 'flame_stream', 'venom_mire', 'arrow_rain', 'charged_shot', 'frontline_split', 'armor_cleave', 'interrupt_slam', 'weakpoint', 'shield_bash', 'riposte', 'meteor', 'thunderstorm', 'blizzard', 'sky_shatter', 'earth_rend', 'cross_cut', 'blade_storm', 'backstab', 'iron_body', 'rally', 'frenzy_roar', 'stand_firm', 'team_stand', 'blessing', 'rapid_volley', 'killing_arrow', 'holy_bell', 'light_chain', 'spell_wave', 'draw_cut', 'shield_rush', 'shield_fort', 'faith_wall']);
// projectiles drawn here instead of by the old renderer
export const OWN_PROJECTILES = new Set(['venom_mire', 'charged_shot', 'light_chain', 'spell_wave']);
// melee contacts that are not the Slash crescent (they draw their own effect on each 'slash')
const OWN_STRIKE = new Set(['weakpoint', 'backstab', 'interrupt_slam', 'shield_bash', 'sky_shatter']);
const SWING_LEAD = 0.12;
// the follow-through after the contact, seconds (default 0.28): a pose the owner wants time to read
// a spinning skill's later spins (rules: each repeat follows repeatDelay + 0.1 s)
const stormSpan = (s) => (s.repeats || 0) * ((s.repeatDelay || 0) + 0.1);
const POST = { shield_rush: 0.6, faith_wall: 0.5, draw_cut: 0.95, sky_shatter: 0.6, earth_rend: 0.5, blade_storm: 0.45, rapid_volley: 0.88, killing_arrow: 0.6 };
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
    this.move = new MoveFx(scene, camera, () => host.vfx);
    // job-tier spells in the bench's light-and-ribbon language (skillfx/light-kit.js)
    this.meteor = new MeteorFx(scene, camera);
    this.thunder = new ThunderFx(scene, camera);
    this.blizzard = new BlizzardFx(scene, camera);
    this.shatter = new ShatterFx(scene, camera);
    this.rend = new RendFx(scene, camera);
    this.storm = new StormFx(scene, camera);
    this.shadow = new ShadowFx(scene, camera);
    this.iron = new IronFx(scene, camera);
    this.buff = new BuffFx(scene, camera); this.buffBodies = [];
    this.bless = new BlessFx(scene, camera);
    this.volley = new VolleyFx(scene, camera);
    this.kill = new KillFx(scene, camera);
    this.bell = new BellFx(scene, camera);
    this.lchain = new LightChainFx(scene, camera);
    this.wave = new WaveFx(scene, camera);
    this.draw = new DrawFx(scene, camera);
    this.gs = new GreatshieldFx(scene, camera); // the guardian's greatshield skills
    this.lchain.locate = (id) => { for (const m of this.game.monsters) if (m.id === id) return m; return null; };
    const shake = (amp, time) => host.shake(amp, time);
    for (const fx of [this.split, this.mace, this.thrust, this.bash, this.riposte, this.rend, this.storm, this.shadow, this.iron, this.buff, this.kill, this.bell, this.gs]) fx.onShake = shake;
    this.timers = []; this.time = 0; this.crossI = 0; this.stormI = 0; this.primarySwing = false; this.swingStep = 0; this.lastSwingAt = -9; this.lastNovaAt = -9; this.powerRatio = 0; this.drawEchoes = 3;
    // scratch (no allocation per frame)
    this.tipV = new THREE.Vector3(); this.castV = new THREE.Vector3(); this.bladeBase = new THREE.Vector3(); this.bladeTip = new THREE.Vector3(); this.bladeDir = new THREE.Vector3();
    this.center = new THREE.Vector3(); this.head = new THREE.Vector3(); this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.mouth = new THREE.Vector3();
    this.echoSpots = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
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
    // Cross Cut: two thin crescents bulging forward (their sharp outer edge leading), rolled 45 degrees
    // either way about the facing so they cross as an upright X, flying on forward as a wave; the first
    // is held until the second has swept across it (owner: the X comes out of the forward cut)
    const cross = s.id === 'cross_cut' ? (this.crossI++ % 2 ? -1 : 1) : 0;
    return { ...(cross ? { tilt: cross * 0.785, arcDeg: 90, inner: 0.58, overlay: true, reach: 1.0, y: 0.1, drift: 3, hold: cross > 0 ? 0.2 : 0.06 } : {}), palette: palette || (s.id === 'armor_cleave' ? SUNDER_PALETTE : s.id === 'cross_cut' ? CROSS_PALETTE : null), range: s.range, arc: s.arc, dir: cross || (sweep ?? (this.swingStep === 0 ? 1 : -1)), where: () => ({ x: p.x, z: p.z, angle: p.facing }) };
  }
  // a greatshield's basic strike is a shove, not a cut: the bash's push of light instead of the crescent
  shove(skill) { return skill === 'slash' && this.host.weapon() === 'greatshield'; }
  ownStrike(skill) { return OWN_STRIKE.has(skill) || this.shove(skill); }
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
          } else this.play('riposteGuard', e.total + s.guard.duration, 0, e.total, e.kind);
          return true;
        }
        if (e.charge !== undefined) this.release(e.charge); // a charged shot looses: its arrow and impact grow with the charge
        this.play(e.skill, e.total + (POST[e.skill] ?? 0.28), e.kind === 'melee_arc' ? this.nextSwingStep() : e.step, e.total, e.kind);
        if (e.skill === 'cross_cut') this.crossI = 0;
        if (e.skill === 'iron_body') this.iron.gather(g.player.x, g.player.z, e.total);
        if (e.skill === 'shield_rush') this.gs.windup(g.player, e.total); // Line Breaker: light drawn in to the shield's front
        if (BUFF_LOOKS[e.skill]) this.buff.rouse(e.skill, g.player.x, g.player.z, e.total);
        if (e.skill === 'blessing') this.bless.gather(g.player.x, g.player.z, e.total);
        if (e.skill === 'killing_arrow') { // the aim: the sight line, and the reticle on a target locked in reach
          const t = g.target, inReach = t && !t.dead && Math.hypot(t.x - g.player.x, t.z - g.player.z) - (t.r || 0) <= s.range + 0.5;
          this.kill.aim(g.player.x, g.player.z, e.angle, e.total, s.range, inReach ? t : null);
        }
        if (e.skill === 'blade_storm') { this.stormI = 0; this.storm.start(g.player.x, g.player.z, s.radius, e.total + stormSpan(s) + 0.3); }
        if (e.kind === 'melee_arc') { this.primarySwing = true; if (!this.ownStrike(e.skill)) this.slash.swing(e.total, this.slashOpts(s)); }
        if (e.kind === 'projectile' && !OWN_PROJECTILES.has(e.skill)) {
          host.vfx.beginCast(e, s.element);
          if (s.element === 'fire') { this.fire.gather(e.total); this.smoothCharge(host.vfx.castFlame?.mesh); }
        }
        if (e.kind === 'chain') this.chain.beginCharge(e.total, s.element);
        if (e.kind === 'melee_line') this.split.windup(e.total, s.range, s.width, s.element);
        if (e.kind === 'dash_line') this.draw.windup(e.total, s.element);
        if (e.skill === 'sky_shatter') this.shatter.charge(g.player.x, g.player.z, e.total);
        if (e.skill === 'light_chain') this.lchain.gather(this.staffTip(), e.total);
        if (e.skill === 'spell_wave') { // the downward chop sends the wave: the cut crescent stood on its edge, in the wave's colours (its element's)
          this.slash.swing(e.total, { ...this.slashOpts(s, wavePalette(s.element)), range: 1.7, arc: 120, arcDeg: 120, tilt: 1.5, reach: 1.0, y: 0.15 });
        }
        if (e.skill === 'holy_bell') this.bell.descend(g.player.x, g.player.z, e.total);
        else if (e.kind === 'nova') { this.frost.setElement(s.element); this.frost.beginCharge(g.player.x, g.player.z, e.total, s.radius); }
        return true;
      }
      case 'channelStart': {
        if (!SKILL_FX.has(e.skill)) return false;
        const s = this.skillOf(e.skill); if (!s) return false;
        // Shield Fortress: the raised shield's pane of light, held while the button is (skillfx/greatshield-fx.js)
        if (s.kind === 'guard_hold') { this.play(e.skill, e.total + 0.28, 0, e.total, 'channel_cone'); this.gs.raise(s.guard.arc); return true; }
        this.play(e.skill, e.total + 0.28, 0, e.total, 'channel_cone'); this.flame.begin(s, s.element);
        return true;
      }
      case 'channelPulse': if (!this.flame.state) return false; this.flame.pulse(e); return true;
      case 'channelEnd':
        if (this.gs.fortUp) { this.gs.lower(); host.anim().action = null; return true; }
        if (!this.flame.state) return false; this.flame.end(); host.anim().action = null; return true;
      case 'fortBlock': this.gs.block(g.player, e.fromX, e.fromZ); return true;
      case 'rushStop': this.gs.rushStop(e.x, e.z, e.angle); return true;
      case 'lightWallBlock': this.gs.wallBlock(e.id, e.x, e.z); return true;
      case 'areaEnd': this.gs.wallEnd(e.id); return false;
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
        // a chain bursting from a struck target (a fused arrow, e.from) starts there, not at the hand
        if (e.from) this.chain.play([e.points[0], ...e.points], e.element, this.tipV.set(e.points[0][0], 1.1, e.points[0][1]), false);
        else this.chain.play(e.points, e.element, this.staffTip(), miss);
        return true;
      }
      case 'whirl': {
        if (e.skill !== 'blade_storm') return false;
        // Blade Storm (a dagger main skill): each quick spin is a crescent round the whole circle in the
        // blade job's violet, the second a little higher than the first; the last one bursts
        const s = this.skillOf(e.skill), i = this.stormI++, p = g.player;
        this.storm.follow(e.x, e.z);
        this.slash.swing(0, { palette: CROSS_PALETTE, range: e.radius, arc: 340, reach: 1, inner: 0.45, tilt: (i % 2 ? -1 : 1) * 0.1, y: -0.2 + 0.2 * i, dir: -1, hold: 0.04, where: () => ({ x: p.x, z: p.z, angle: p.facing }) });
        if (s && i >= s.repeats) this.storm.burst(e.x, e.z);
        return true;
      }
      case 'nova': {
        if (e.skill === 'holy_bell') { this.bell.toll(e.x, e.z, e.radius); return true; } // skillfx/bell-fx.js
        if (e.element === 'arcane') return false; // a ward breaking: the old renderer's ring
        const targets = g.monsters.filter((m) => !m.dead && Math.hypot(m.x - e.x, m.z - e.z) - m.r <= e.radius).map((m) => ({ x: m.x, z: m.z }));
        const echo = this.time - this.lastNovaAt < 1.2 && !this.frost.pendingCharge;
        this.lastNovaAt = this.time;
        this.frost.setElement(e.element);
        this.frost.burst(e.x, e.z, e.radius, targets, echo ? 0.7 : 1);
        if (echo) host.banner('สะท้อนซ้ำ!');
        return true;
      }
      // Blink Draw: the dash's streaks, then the lane cut on arrival (skillfx/draw-fx.js)
      case 'dashStrike': {
        if (e.skill === 'shield_rush') { this.gs.rushStart(e); return true; } // Line Breaker's charge
        if (e.skill !== 'draw_cut') return false;
        this.draw.dash(e); this.drawEchoes = 0;
        host.shake(0.05, 0.08);
        return true;
      }
      case 'dashArrive':
        if (e.skill === 'shield_rush') { this.gs.rushArrive(e.x, e.z); return true; }
        if (e.skill !== 'draw_cut') return false; this.draw.arrive(e.x, e.z, e.angle); return true;
      case 'lineStrike':
        if (e.skill === 'draw_cut') { this.draw.strike(e); host.shake(0.22, 0.2); return true; }
        if (e.skill === 'earth_rend') { this.split.clear(); this.rend.strike(e); return true; }
        this.split.strike(e); return true;
      // Iron Body: the steel shell, glint and ring, then the sheen while it lasts (skillfx/iron-fx.js)
      case 'buff': {
        if (e.kind === 'iron_body') { this.iron.harden(e.x, e.z, this.skillOf(e.kind)?.duration ?? 6); return true; }
        if (e.kind === 'blessing') { this.bless.bestow(e.x, e.z, e.radius); return true; }
        if (!BUFF_LOOKS[e.kind]) return false;
        // party shouts (Rally): the ring to the true radius, and a mark over every body the buff reached
        const bodies = this.buffBodies; bodies.length = 0; bodies.push(g.player);
        for (const a of g.allies || []) if (!a.dead && Math.hypot(a.x - e.x, a.z - e.z) < e.radius) bodies.push(a);
        this.buff.shout(e.kind, e.x, e.z, e.radius, bodies);
        return true;
      }
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
      // dodges: the blink's gather and jump, the leap's landing (skillfx/move-fx.js)
      case 'movement': if (e.kind === 'blink' && g.player.dash?.kind === 'blink') this.move.gather(g.player.x, g.player.z, g.player.dash.delay || 0.08); return false;
      // Backstab: the hero leaves in shards and appears behind its target (skillfx/shadow-fx.js)
      case 'shadowStep': {
        const t = g.monsters.find((m) => m.id === e.id), sh = this.shadow;
        sh.step(e.fromX, e.fromZ, e.x, e.z, t?.x, t?.z, t?.r);
        // dark afterimages: one where the body stood, two along the curve, each facing the way it runs
        const spots = this.echoSpots; let k = 0;
        for (const q of [0, 0.38, 0.72]) {
          const a = sh.bez(q, this.from), b = sh.bez(q + 0.05, this.to);
          const o = spots[k++]; o[0] = a.x; o[1] = a.z; o[2] = Math.atan2(b.x - a.x, b.z - a.z); o[3] = q * 0.1;
        }
        host.vfx?.shadowEchoes?.(spots, host.rig?.());
        return true;
      }
      case 'blinkPlayer': this.move.jump(e.fromX, e.fromZ, e.x, e.z); host.vfx.blinkEcho(e.fromX, e.fromZ, host.rig()); return true;
      case 'area': {
        if (e.owner !== 'player') return false;
        if (e.kind === 'faith_wall') { const a = g.areas.find((q) => q.id === e.id); if (a) this.gs.wallBegin(a); return true; }
        const el = this.skillOf(e.kind)?.element;
        if (e.kind === 'arrow_rain') { this.rain.wave(e, el || 'physical', g.player); return true; }
        if (e.kind === 'meteor') { this.meteor.begin(e); return true; }
        if (e.kind === 'thunderstorm') { this.thunder.begin(e, el || 'lightning'); return true; }
        if (e.kind === 'blizzard') { this.blizzard.begin(e); return true; }
        return false;
      }
      case 'burst':
        if (e.kind === 'arrow_rain') { this.rain.burst(e); return true; }
        if (e.kind === 'meteor') { this.meteor.impact(e); host.shake(0.4, 0.3); return true; }
        if (e.kind === 'thunderstorm') { this.thunder.strike(e, g.monsters.filter((m) => !m.dead && Math.hypot(m.x - e.x, m.z - e.z) <= (e.radius || 3) + (m.r || 0)).map((m) => [m.x, m.z])); host.shake(0.14, 0.12); return true; }
        if (e.kind === 'leap') { this.move.land(e.x, e.z, e.radius); host.shake(0.2, 0.18); return true; }
        // Release Burst (a stream mod): the held fire bursts ahead - Firebolt's impact, sized to the circle
        if (e.kind === 'release_burst') { if (e.element === 'fire') this.fire.impact(e.x, 0.8, e.z, false, e.radius / 1.4); else this.mod.burst(e); host.shake(0.16, 0.16); return true; }
        if (e.kind === 'mod_burst') { this.mod.burst(e); host.banner(e.element === 'cold' ? 'ผลึกแตก!' : 'ระเบิดเสริม!'); return true; }
        return false;
      case 'slash': {
        if (!SKILL_FX.has(e.skill)) return false;
        const s = this.skillOf(e.skill), p = g.player;
        if (!s) return true;
        if (e.skill === 'shield_bash' || this.shove(e.skill)) this.bash.bash(p.x, p.z, e.angle, e.range, e.arc);
        if (e.skill === 'weakpoint') this.thrust.thrust(p.x, 1.15, p.z, e.angle, e.range);
        if (e.skill === 'backstab') this.thrust.thrust(p.x, 1.15, p.z, e.angle, e.range + 0.6, true);
        if (e.skill === 'interrupt_slam') this.mace.slam(p.x, p.z, p.facing, s.range, s.arc);
        if (e.skill === 'sky_shatter') { this.shatter.slam(p.x, p.z, p.facing, s.range, s.arc); host.shake(0.3, 0.25); }
        const primary = this.primarySwing; this.primarySwing = false;
        // Multistrike: each repeat replays this skill's own motion, landing on the repeat's hit time
        if (primary && !e.triggered && s.repeats) {
          for (let k = 1; k <= s.repeats; k++) {
            const at = this.time + k * s.repeatDelay - SWING_LEAD;
            this.timers.push({ at, done: false, fn: () => { this.play(e.skill, 0.3, this.nextSwingStep(), SWING_LEAD, 'melee_arc'); if (!this.ownStrike(e.skill)) this.slash.swing(SWING_LEAD, this.slashOpts(s)); } });
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
        if (e.skill === 'rapid_volley') this.volley.hit(c, c.x - e.fromX, c.z - e.fromZ);
        if (e.skill === 'killing_arrow') this.kill.hit(c, c.x - e.fromX, c.z - e.fromZ);
        if (e.skill === 'holy_bell') this.bell.hit(c);
        if (e.skill === 'spell_wave') this.wave.hit(c);
        if (e.skill === 'draw_cut') this.draw.hit(c);
        if (e.skill === 'shield_rush') this.gs.rushHit(c, e.fromX, e.fromZ);
        if (e.skill === 'light_chain') this.lchain.hit(e.id, c, g.monsters.find((q) => q.id === e.id)?.r);
        if (e.skill === 'frontline_split') this.split.cut(c);
        if (e.skill === 'interrupt_slam' || e.skill === 'sky_shatter') this.mace.hit(c, e.fromX, e.fromZ);
        if (e.skill === 'riposte') this.riposte.hit(c, e.fromX, e.fromZ);
        if (e.skill === 'shield_bash') this.bash.hit(e.id, c, e.fromX, e.fromZ, this.skillOf('shield_bash')?.taunt?.duration || 3);
        if (this.shove(e.skill)) this.bash.strike(c, e.fromX, e.fromZ);
        if (e.skill === 'armor_cleave') { this.sunder.hit(c, e.fromX, e.fromZ); host.shake(0.06, 0.14); }
        // struck from the side or behind the way it faces: the rules' positional bonus
        const m = g.monsters.find((q) => q.id === e.id), weak = !!m && (e.fromX - m.x) * Math.sin(m.facing) + (e.fromZ - m.z) * Math.cos(m.facing) < 0;
        if (e.skill === 'backstab') {
          this.thrust.hit(c, Math.atan2(c.x - e.fromX, c.z - e.fromZ), true, true);
          if (weak) { const b = host.body(e.id); host.float(b.x, b.h + 0.95, b.z, 'แทงหลัง!', '#c99bff', true); }
        }
        if (e.skill === 'weakpoint') {
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
    this.volley.syncProjectiles(g.projectiles, 'rapid_volley');
    this.volley.update(dt);
    this.kill.syncProjectiles(g.projectiles, 'killing_arrow');
    this.kill.update(dt);
    this.bell.follow(p.x, p.z);
    this.bell.update(dt);
    this.lchain.follow(tip);
    this.lchain.syncProjectiles(g.projectiles, 'light_chain');
    this.lchain.update(dt);
    this.wave.syncProjectiles(g.projectiles, 'spell_wave');
    this.wave.update(dt);
    this.power.update(dt, tip, ch ? Math.min(1, ch.t / ch.skill.charge.duration) : 0);
    for (const t of this.timers) if (this.time >= t.at && !t.done) { t.done = true; t.fn(); }
    let w = 0; for (const t of this.timers) if (this.timerDone(t)) this.timers[w++] = t; this.timers.length = w;
    this.slash.update(dt);
    this.fire.update(dt, this.castTip());
    this.bladePoints();
    this.split.update(dt, p, p.facing, this.bladeBase, this.bladeTip);
    this.draw.update(dt, p, this.bladeBase, this.bladeTip);
    // Blink Draw: afterimages of the body along the dash (the game's posed echoes, in its violet)
    if (p.dash?.kind === 'draw_cut' && this.drawEchoes < 3 && p.dash.t >= p.dash.dur * (0.15 + 0.3 * this.drawEchoes)) { host.vfx?.drawCutEcho?.(host.rig?.()); this.drawEchoes++; }
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
    // the leap's streak follows the body through its arc (view.js lifts the hero 1.5 m)
    if (p.dash?.kind === 'leap') this.move.leapAt(p.x, Math.sin(Math.min(1, p.dash.t / p.dash.dur) * Math.PI) * 1.5 + 0.8, p.z);
    this.move.update(dt);
    this.meteor.update(dt);
    this.thunder.update(dt, this.game.monsters);
    this.blizzard.update(dt);
    this.shatter.update(dt);
    this.rend.update(dt);
    this.storm.update(dt);
    if (this.iron.busy) { this.iron.follow(p.x, p.z); if (!p.buffs?.iron_body) this.iron.stop(); }
    this.iron.update(dt);
    // party shouts: follow the hero through the shout, then a glow off every body still buffed
    this.buff.follow(p.x, p.z);
    for (const k of BUFF_KEYS) {
      const bodies = this.buffBodies; bodies.length = 0;
      if (p.buffs?.[k] && !p.dead) bodies.push(p);
      for (const a of g.allies || []) if (!a.dead && a.buffs?.[k]) bodies.push(a);
      if (bodies.length) this.buff.linger(k, dt, bodies);
    }
    this.buff.update(dt);
    // Blessing of Light: a halo over every body holding it (skillfx/bless-fx.js)
    const blessed = this.bless.halos; blessed.length = 0;
    if (p.buffs?.blessing && !p.dead) blessed.push(p);
    for (const a of g.allies || []) if (!a.dead && a.buffs?.blessing) blessed.push(a);
    this.bless.follow(p.x, p.z);
    this.bless.update(dt);
    this.shadow.update(dt);
    this.gs.update(dt, p);
  }
  // the offscreen flame passes, right before the main render
  prerender() { this.flame.prerender(); }
  resize(w, h, cssW, cssH) { this.flame.resize(w, h, cssW, cssH); }
  get counterReady() { return this.riposte.ready; }
  clear() {
    for (const fx of [this.chain, this.frost, this.flame, this.mod, this.venom, this.rain, this.power, this.split, this.sunder, this.mace, this.thrust, this.bash, this.riposte, this.slash, this.fire, this.move, this.meteor, this.thunder, this.blizzard, this.shatter, this.rend, this.storm, this.shadow, this.iron, this.buff, this.bless, this.volley, this.kill, this.bell, this.lchain, this.wave, this.draw, this.gs]) fx.clear();
    this.timers.length = 0;
  }
}
