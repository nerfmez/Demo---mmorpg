// Monster attacks drawn as shapes of light (docs/MONSTER-ATTACKS.md). The owner turned down limb trails for
// monsters; the approved language is the companions' (skillfx/claw-fx.js, bite-fx.js): marks and jaws of
// see-through light on the game camera's plane, in each monster's own colours, plus a charge cue on the body
// part that attacks and a landing on the ground. Kit monsters (data/monsters.json behavior "kit") are drawn here
// by type and attack; anything not listed falls back to the old renderer.
//   leaf fox: snap - a jaw of light shuts on the prey; gust - its leaf tail glows and leaves gather round it
//     through the wind-up, then a cone of leaves of light streams out and cuts (two leaf-red claw marks on the
//     prey); pounce - while it freezes to listen, two arcs of light pulse by its ears; the landing throws
//     leaves up, a ring of dust runs out, and a hit pins the prey under three crossed marks; a miss puffs leaves
//     round its stuck nose.
// Cosmetic only; pooled, no allocation per frame.
import * as THREE from 'three';
import { LeafFx } from './leaf-fx.js';
import { BubbleFx } from './bubble-fx.js';
import { BITE_SHUT } from './bite-fx.js';
import { lightSprite, glowTexture, bubbleTexture } from './light-kit.js';
import { MoleFx } from './mole-fx.js';
import { MothFx } from './moth-fx.js';
import { GrottoFx } from './grotto-fx.js';
import { SlimeFx } from './slime-fx.js';
import { GullFx } from './gull-fx.js';
import { BoarFx } from './boar-fx.js';
import { SporeMonFx } from './spore-mon-fx.js';
import { BeetleFx } from './beetle-fx.js';
import { WolfFx } from './wolf-fx.js';
import { HermitFx } from './hermit-fx.js';
import { MantisFx } from './mantis-fx.js';
import { GreyfangFx } from './greyfang-fx.js';
import { ViperFx } from './viper-fx.js';

const LEAF_HALO = new THREE.Color('#ff5a1e'), LEAF_RIM = new THREE.Color('#ffe2b0');
// the tanuki's own colours: the drum's warm gold sound, its green head-leaf, its transformation smoke
const DRUM = new THREE.Color('#ffc860'), DRUM_CORE = { core: [1.0, 0.95, 0.8], glow: [1.0, 0.72, 0.3] };
const HEAD_LEAF = new THREE.Color('#5ad04a'), HEAD_LEAF_RIM = new THREE.Color('#eaffd8');
const PEARL = 0xffe6a0;
const WATER_HALO = new THREE.Color('#5cc8ff');
const STONE_HALO = new THREE.Color('#e0b070'), STONE_RIM = new THREE.Color('#fff4dc'), DUST = 0xc8b48a;
// each monster's own contact look (owner, 2026-11-04: "why do they have the same effects"): claw marks only for
// real claws; a blunt blow is a burst star, a slap of water a crown splash, the clam's blast bubbles
const STONE = { core: [1.0, 0.96, 0.86], glow: [0.95, 0.66, 0.3] };
const WATER = { core: [0.93, 0.99, 1.0], glow: [0.3, 0.72, 1.0] };
const PIN_HALO = new THREE.Color('#ff7a2a'), EAR = new THREE.Color('#ffd28a'), EAR_RIM = new THREE.Color('#fff4dc');
const GLASS = { core: [0.96, 1.0, 1.0], glow: [0.42, 0.78, 1.0] }, GLASS_HALO = new THREE.Color('#9fdcff'), MOON = new THREE.Color('#d6f2ff');
const FERN_HALO = new THREE.Color('#8fd14a'), FERN_RIM = new THREE.Color('#f4ffe0');
const FERN_LEAVES = [new THREE.Color('#7fd04a'), new THREE.Color('#b8ec6a'), new THREE.Color('#4fae3c')];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
// the mole's own colours: amber claw light over warm earth

export class MonsterFx {
  /** companion: the CompanionFx whose jaw, claw marks and glints these share; call: its dust and rings. */
  constructor(scene, camera, companion, call, host) {
    this.scene = scene; this.camera = camera; this.companion = companion; this.call = call; this.host = host; this.onShake = null;
    this.leaves = new LeafFx(scene);
    // the clam's bubbles burst into a few droplets
    this.bubbles = new BubbleFx(scene, (x, y, z, size) => {
      const fx = this.host.vfx?.fx;
      if (fx) for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + Math.random(); fx.add(x, y, z, Math.sin(a) * 1.4, 0.6, Math.cos(a) * 1.4, { color: 0xe8fbff, size: 0.08 + size * 0.15, sizeEnd: 0.02, life: 0.22, drag: 3 }); }
    });
    this.cues = []; // live charge cues: { id, kind, t, total, next }
    this.glow = lightSprite(scene, glowTexture('fire'), true, 8);
    this.glow.material.opacity = 0;
    this.glowOn = null;
    // the snail king's pearl beam: a long plane of golden light with a hot core, swept with the monster's facing
    const beamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); beamGeo.userData.shared = true;
    const beamMat = (c, o) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); return m; };
    this.beam = { glow: new THREE.Mesh(beamGeo, beamMat(0xffc860, 0.5)), core: new THREE.Mesh(beamGeo, beamMat(0xfff6dc, 0.9)), id: null };
    for (const m of [this.beam.glow, this.beam.core]) { m.visible = false; m.renderOrder = 10; scene.add(m); }
    // the mole's earth (skillfx/mole-fx.js: the ground kit's dust, clods, slabs and dug pits)
    this.mole = new MoleFx(scene, camera, host);
    // the reef crab's bubble mines: a see-through bubble each, over a pale ring of its true radius
    this.crabBubbles = Array.from({ length: 6 }, () => lightSprite(scene, bubbleTexture(), true, 10));
    const mineRing = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2); mineRing.userData.shared = true;
    this.mineRings = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(mineRing, new THREE.MeshBasicMaterial({ color: 0xbfeeff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })); m.visible = false; m.renderOrder = 7; scene.add(m); return m; });
    this.mines = new Map(); this.popped = new Set();
    // the mirrorwing moth's glass shards, moonlight ring wall and wing glare (skillfx/moth-fx.js)
    this.moth = new MothFx(scene, host);
    // the pearl grotto's fish, slug, clam and king (skillfx/grotto-fx.js)
    this.grotto = new GrottoFx(scene, host, companion, call, this);
    // the salt slime's engulf, brine pools and buds (skillfx/slime-fx.js)
    this.slime = new SlimeFx(scene, host, this);
    // the shore gull's swoop and shell drop (skillfx/gull-fx.js)
    this.gull = new GullFx(scene, host, this);
    // the tusk boar's rampage and piglet stampede (skillfx/boar-fx.js)
    this.boar = new BoarFx(scene, host, this);
    // the sporecap's fairy ring, sprouts and sleepy spores (skillfx/spore-mon-fx.js)
    this.spore = new SporeMonFx(scene, host, this);
    // the moss beetle's spray, moss ball and click (skillfx/beetle-fx.js)
    this.beetle = new BeetleFx(scene, host, this);
    // the masked wolf's lunge, pincer and drag (skillfx/wolf-fx.js)
    this.wolf = new WolfFx(scene, host, this);
    // the hermit crab's clank, anemones and shed shell (skillfx/hermit-fx.js)
    this.hermit = new HermitFx(scene, host, this);
    // the thicket mantis's strike, startle wings and leap (skillfx/mantis-fx.js)
    this.mantis = new MantisFx(scene, host, this);
    // Greyfang's hamstring passes, moon orbit, rally, phase roar, moon leap and phantom rush (skillfx/greyfang-fx.js)
    this.greyfang = new GreyfangFx(scene, host, this);
    // the reed viper's strike, reed ambush and hiss (skillfx/viper-fx.js)
    this.viper = new ViperFx(scene, host, this);
    this.splashes = new Set(); // flop landings already drawn (area ids)
    this.rings = new Set(); // drum rings already drawn (area ids)
    this.spinLeaf = -1; // the leaf instance riding a boomerang
  }
  rig(id) { return this.host.monsterRig?.(id) || null; }
  bonePos(id, bone, out) { const r = this.rig(id), b = r?.bones?.[bone]; if (!b) return null; b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); }

  /** A strike reached its contact (core monsterSwing); true when drawn here. */
  swing(e, g) {
    if (this.grotto.swing(e, g)) return true;
    if (this.wolf.swing(e)) return true;
    if (this.hermit.swing(e, g)) return true;
    if (this.greyfang.swing(e)) return true;
    // a strike whose look is 'light' (data/combat-fx.json monsters): claw marks of light raked across the prey
    const look = this.host.vfx?.monsterLook?.(e.type, e.name);
    if (look?.kind === 'light') {
      if (look.scissor) { if (e.at) this.scissor(e, look); return true; }
      if (look.blunt) { if (e.at) this.punch(e, look); return true; }
      if (e.at) this.rake(e, look);
      if (e.type === 'rootdigger_mole') this.mole.scoop(e);
      return true;
    }
    if (e.type === 'stone_pangolin') return this.pangolinSwing(e);
    if (e.type === 'eye_clam' && e.name === 'valve') {
      // the shell slams shut and blasts a cone of bubbles and spray; bubbles burst round what it hits
      const fx = this.host.vfx?.fx, arc = (e.arc * Math.PI) / 180, y = (this.host.groundAt?.(e.x, e.z) ?? 0) + 0.6;
      if (fx) for (let i = 0; i < 14; i++) {
        const a = e.angle + (Math.random() - 0.5) * arc, sp = e.range * (2.2 + Math.random() * 1.6);
        fx.add(e.x + Math.sin(a) * 0.6, y, e.z + Math.cos(a) * 0.6, Math.sin(a) * sp, 0.6 + Math.random(), Math.cos(a) * sp, { color: i % 3 ? 0x9fe6ff : 0xf0fbff, size: 0.12 + Math.random() * 0.1, sizeEnd: 0.03, life: 0.4, gravity: 4, drag: 3 });
      }
      for (let i = 0; i < 9; i++) {
        const a = e.angle + (Math.random() - 0.5) * arc, sp = e.range * (2.4 + Math.random() * 1.8);
        this.bubbles.add(e.x + Math.sin(a) * 0.6, y, e.z + Math.cos(a) * 0.6, Math.sin(a) * sp, 0.3 + Math.random() * 0.6, Math.cos(a) * sp, 0.22 + Math.random() * 0.3, 0.55 + Math.random() * 0.35);
      }
      if (e.at) {
        const gy = this.host.groundAt?.(e.at[0], e.at[1]) ?? 0;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + Math.random() * 0.5, r = 0.25 + Math.random() * 0.25; this.bubbles.add(e.at[0] + Math.sin(a) * r, gy + 0.4 + Math.random() * 0.6, e.at[1] + Math.cos(a) * r, Math.sin(a) * 1.2, 0.5 + Math.random() * 0.6, Math.cos(a) * 1.2, 0.18 + Math.random() * 0.22, 0.3 + Math.random() * 0.3, 0xe0f8ff); }
        this.companion.glint(e.at[0], gy + 0.7, e.at[1], 0.7, 0.02);
      }
      this.onShake?.(0.08, 0.1);
      return true;
    }
    if (e.type !== 'leaf_fox') return false;
    if (e.name === 'snap') {
      if (!e.at) return true; // a miss: the snap is in the pose alone
      const size = 0.38;
      this.companion.axes();
      this.companion.biteFx.bite(e.at[0], 0.75, e.at[1], size, Math.sin(e.angle) > 0 ? -0.18 : 0.18);
      this.companion.glint(e.at[0], 0.75, e.at[1], 0.8, BITE_SHUT);
      this.onShake?.(0.05, 0.08);
      return true;
    }
    if (e.name === 'gust') {
      // the leaves stream out of the whipped tail across the cone, at the height of the fox's back
      const t = this.bonePos(e.id, 'tail', _v) || _v.set(e.x, 0.9, e.z);
      const arc = (e.arc * Math.PI) / 180;
      this.leaves.cone(t.x, Math.max(0.6, t.y - 0.1), t.z, e.angle, arc, e.range, 18);
      if (e.at) {
        // the leaves arrive and cut: two leaf-red marks across the prey, a beat after they leave the tail
        const d = Math.hypot(e.at[0] - e.x, e.at[1] - e.z), delay = Math.min(0.2, d / (e.range * 2.4));
        this.companion.axes();
        this.companion.clawFx.mark(e.at[0], 0.9, e.at[1], 0.55, 0.9, -0.7, 1, LEAF_HALO, LEAF_RIM, delay, 0.32);
        this.companion.clawFx.mark(e.at[0], 0.75, e.at[1], 0.5, 0.85, -0.45, -1, LEAF_HALO, LEAF_RIM, delay + 0.05, 0.32);
      }
      this.endCue(e.id);
      return true;
    }
    return false;
  }

  rake(e, look) {
    const c = this.colors(look);
    this.companion.axes();
    _v.set(e.at[0], look.height ?? 0.8, e.at[1]);
    const side = Math.sin(e.angle) * this.camRightX() + Math.cos(e.angle) * this.camRightZ() >= 0 ? 1 : -1;
    this.companion.rake(_v, side, look.marks || 3, look.len || 0.6, look.wid || 1, look.gap || 0.28, c.halo, c.rim, 0.02);
    this.companion.glint(_v.x, _v.y, _v.z, 0.8 * (look.len || 0.6) / 0.6, 0.04);
    this.onShake?.(look.shake ?? 0.05, 0.08);
  }
  /** A pincer closes on the prey (a 'scissor' light look): two marks of light crossing shut on it, a glint, spray. */
  scissor(e, look) {
    const c = this.colors(look), y = (this.host.groundAt?.(e.at[0], e.at[1]) ?? 0) + (look.height ?? 0.55), fx = this.host.vfx?.fx;
    this.companion.axes();
    this.companion.clawFx.mark(e.at[0], y, e.at[1], look.len || 0.6, look.wid || 0.9, -0.75, 1, c.halo, c.rim, 0, 0.3);
    this.companion.clawFx.mark(e.at[0], y, e.at[1], look.len || 0.6, look.wid || 0.9, -Math.PI + 0.75, -1, c.halo, c.rim, 0.03, 0.3);
    this.companion.glint(e.at[0], y, e.at[1], 0.9, 0.05);
    if (fx) for (let i = 0; i < 6; i++) { const a = Math.random() * 6.283; fx.add(e.at[0], y, e.at[1], Math.sin(a) * 1.6, 1.2 + Math.random(), Math.cos(a) * 1.6, { color: i % 2 ? 0xbfeeff : 0xfff2e0, size: 0.1, sizeEnd: 0.03, life: 0.4, gravity: 9, drag: 0.8 }); }
    this.onShake?.(look.shake ?? 0.05, 0.07);
  }
  /** A punch lands on the prey (a 'blunt' light look): a burst star on it, left then right for a one-two (e.hit). */
  punch(e, look) {
    const c = this.colors(look), side = e.hits > 1 ? (e.hit % 2 ? -1 : 1) * 0.16 : 0;
    const x = e.at[0] + this.camRightX() * side, z = e.at[1] + this.camRightZ() * side;
    const y = (this.host.groundAt?.(x, z) ?? 0) + (look.height ?? 0.6) + (e.hit === 2 ? 0.08 : 0);
    this.burstStar(x, y, z, look.size || 0.4, c.star, c.chipA, c.chipB);
    this.onShake?.(look.shake ?? 0.05, 0.07);
  }
  camRightX() { return this.camera.matrixWorld.elements[0]; }
  camRightZ() { return this.camera.matrixWorld.elements[2]; }
  colors(look) {
    this.colorCache ??= new Map();
    let c = this.colorCache.get(look);
    if (!c) {
      c = { halo: new THREE.Color(look.halo || '#ff6a3a'), rim: new THREE.Color(look.rim || '#fff6e8') };
      // a burst star's stroke colours are display values (like STONE), its chips plain hex
      c.star = { core: c.rim.getRGB({}, THREE.SRGBColorSpace), glow: c.halo.getRGB({}, THREE.SRGBColorSpace) };
      c.star = { core: [c.star.core.r, c.star.core.g, c.star.core.b], glow: [c.star.glow.r, c.star.glow.g, c.star.glow.b] };
      c.chipA = new THREE.Color(look.chips?.[0] || look.halo || '#ffffff').getHex(); c.chipB = new THREE.Color(look.chips?.[1] || look.rim || '#ffffff').getHex();
      this.colorCache.set(look, c);
    }
    return c;
  }

  /** A wind-up began: start its charge cue. */
  windup(e, g) {
    const m = g.monsterById?.(e.id);
    if (m?.type === 'sporecap') this.cues.push({ id: e.id, kind: 'spore_' + e.name, t: 0, total: e.total, next: 0 });
    if (m?.type === 'salt_slime') this.cues.push({ id: e.id, kind: 'slime_' + e.name, t: 0, total: e.total, next: 0 });
    if (m?.type === 'pearl_slug' && e.name === 'stingers') this.cues.push({ id: e.id, kind: 'slug_stingers', t: 0, total: e.total, next: 0 });
    if (m?.type === 'pearl_fish' && (e.name === 'gulp' || e.name === 'wave')) this.cues.push({ id: e.id, kind: 'fish_' + e.name, t: 0, total: e.total, next: 0 });
    if (m?.type === 'leaf_tanuki' && (e.name === 'drum' || e.name === 'boomerang' || e.name === 'doubles')) this.cues.push({ id: e.id, kind: 'tanuki_' + e.name, t: 0, total: e.total, next: 0 });
    if (m?.type === 'reef_crab' && e.name !== 'pinch') this.cues.push({ id: e.id, kind: 'crab_' + e.name, t: 0, total: e.total, next: 0 });
    if (m?.type === 'mirrorwing_moth') this.cues.push({ id: e.id, kind: 'moth_' + e.name, t: 0, total: e.total, next: 0 });
    if (m?.type === 'fern_ear_hare') this.cues.push({ id: e.id, kind: 'hare_' + e.name, t: 0, total: e.total, next: 0, off: false });
    if (m?.type === 'rootdigger_mole') {
      if (e.name === 'erupt') this.mole.windup(e, g);
      else this.cues.push({ id: e.id, kind: 'mole_' + e.name, t: 0, total: e.total, next: 0 });
    }
    if (m?.type !== 'leaf_fox') return;
    if (e.name === 'gust' || e.name === 'pounce') this.cues.push({ id: e.id, kind: e.name, t: 0, total: e.total, next: 0 });
  }

  /** A marked area went off (core burst with its source monster). */
  burst(e, g) {
    const m = e.source != null ? g.monsterById?.(e.source) : null;
    if (m?.type === 'rootdigger_mole' && e.attack === 'erupt') return this.mole.burst(e);
    if (m?.type === 'fern_ear_hare' && (e.attack === 'thump' || e.attack === 'hop')) return this.hareLand(e, e.attack === 'thump');
    if (e.attack === 'shard_rain') return this.glassShatter(e);
    if (e.attack === 'decoy') return this.decoyBurst(e);
    if (e.kind === 'bubble_mine') return this.mineBurst(e);
    if (this.grotto.burst(e)) return;
    if (e.kind === 'brine') return this.slime.burst(e, g);
    if (e.kind === 'shell_drop') return this.gull.burst(e);
    if (e.kind === 'fairy_ring') return this.spore.burst(e);
    if (e.kind === 'click') return this.beetle.burst(e);
    if (e.kind === 'coral_burst') return this.hermit.burst(e);
    if (e.kind === 'mantis_land') return this.mantis.burst(e);
    if (m?.type !== 'leaf_fox' || e.attack !== 'pounce') return;
    const y = this.host.groundAt?.(e.x, e.z) ?? 0;
    this.leaves.burst(e.x, y, e.z, 14, 3.6);
    this.call.ring(e.x, y + 0.1, e.z, e.radius * 1.4, undefined, 0.4);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; this.call.dust(e.x + Math.cos(a) * 0.4, y + 0.12, e.z + Math.sin(a) * 0.4, Math.cos(a) * 1.6, 0.35, Math.sin(a) * 1.6, 0.6, 0.45); }
    const p = g.player;
    if (!p.dead && Math.hypot(p.x - e.x, p.z - e.z) <= e.radius + (p.r || 0.4)) {
      // pinned: three marks crossed down over the prey
      this.companion.axes();
      for (let i = 0; i < 3; i++) this.companion.clawFx.mark(p.x, 0.85 - i * 0.05, p.z, 0.55, 1.0, -1.15 + i * 0.32, i % 2 ? -1 : 1, PIN_HALO, LEAF_RIM, i * 0.03, 0.36);
      this.companion.glint(p.x, 0.85, p.z, 1.1, 0.02);
    }
    this.onShake?.(0.09, 0.1);
  }

  /**
   * The hare comes down on the ground: its warning thump (the shock runs out to the area's true edge, earth puffs and
   * clods thrown out round it, a shallow dent, fern leaves shaken up) or the landing of its leap (smaller, no shock ring).
   */
  hareLand(e, thump) {
    const y = this.host.groundAt?.(e.x, e.z) ?? 0, R = e.radius || 1, r = Math.random;
    this.mole.pit(e.x, e.z, thump ? 0.75 : 0.55, thump ? 1.4 : 1.0);
    if (thump) {
      this.call.ring(e.x, y + 0.08, e.z, R, FERN_HALO, 0.42);
      this.call.ring(e.x, y + 0.08, e.z, R * 0.55, FERN_RIM, 0.3, 0.04);
    }
    const n = thump ? 12 : 8, sp = thump ? R * 1.5 : 2.2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + r() * 0.3;
      this.mole.puff(e.x + Math.sin(a) * 0.35, y + 0.12, e.z + Math.cos(a) * 0.35, Math.sin(a) * sp, Math.cos(a) * sp, thump ? 0.55 : 0.45, 0.55, 0.25);
    }
    for (let i = 0; i < (thump ? 6 : 4); i++) {
      const a = r() * 6.283, v = 1 + r() * 1.5;
      this.mole.clod(e.x + Math.sin(a) * 0.3, y + 0.15, e.z + Math.cos(a) * 0.3, Math.sin(a) * v, 2.5 + r() * 2, Math.cos(a) * v, 0.05 + r() * 0.04, 0.9);
    }
    for (let i = 0; i < (thump ? 8 : 5); i++) {
      const a = r() * 6.283, v = (thump ? 2.2 : 1.6) * (0.6 + 0.6 * r());
      this.leaves.leaf(e.x + Math.sin(a) * 0.3, y + 0.2, e.z + Math.cos(a) * 0.3, Math.sin(a) * v, 2.5 + r() * 2, Math.cos(a) * v, 0.3 + r() * 0.12, 0.8 + r() * 0.3, 2.2, 0, FERN_LEAVES[i % 3]);
    }
    this.onShake?.(thump ? 0.12 : 0.07, 0.1);
    return true;
  }

  /** A glass shard lands on its mark (the moth's Glass Rain): it shatters in a star of cold light, chips flying. */
  glassShatter(e) {
    const y = this.host.groundAt?.(e.x, e.z) ?? 0, fx = this.host.vfx?.fx;
    this.burstStar(e.x, y + 0.45, e.z, 0.6, GLASS, 0xbfe9ff, 0xffffff);
    this.call.ring(e.x, y + 0.06, e.z, e.radius, GLASS_HALO, 0.35);
    if (fx) for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 + Math.random() * 0.4, sp = 1.5 + Math.random() * 2; fx.add(e.x, y + 0.25, e.z, Math.sin(a) * sp, 1.5 + Math.random() * 2, Math.cos(a) * sp, { color: i % 3 ? 0xd6f4ff : 0xfff2fb, size: 0.13, sizeEnd: 0.04, life: 0.5, gravity: 12, drag: 0.6 }); }
    this.onShake?.(0.05, 0.07);
    return true;
  }
  /** The moth's mirror decoy bursts: the glass image shatters in a big star of cold light, glass flying out to the edge. */
  decoyBurst(e) {
    const y = this.host.groundAt?.(e.x, e.z) ?? 0, fx = this.host.vfx?.fx;
    this.moth.pop(e.x, e.z);
    this.burstStar(e.x, y + 1.4, e.z, 1.1, GLASS, 0xbfe9ff, 0xffffff);
    this.companion.glint(e.x, y + 1.4, e.z, 2.2, 0);
    this.call.ring(e.x, y + 0.06, e.z, e.radius, GLASS_HALO, 0.45);
    this.call.ring(e.x, y + 0.08, e.z, e.radius * 0.55, MOON, 0.3, 0.05);
    if (fx) for (let i = 0; i < 22; i++) {
      const a = (i / 22) * 6.283 + Math.random() * 0.3, sp = 2.5 + Math.random() * 3;
      fx.add(e.x, y + 1.3, e.z, Math.sin(a) * sp, 1 + Math.random() * 3, Math.cos(a) * sp, { color: i % 3 ? 0xd6f4ff : 0xffffff, size: 0.16 + Math.random() * 0.08, sizeEnd: 0.04, life: 0.6, gravity: 10, drag: 0.5 });
    }
    this.onShake?.(0.16, 0.14);
    return true;
  }
  /** The moth's wing glare (core beam, kind glare): the beam from its chest along the lane. */
  glare(e) {
    const b = this.bonePos(e.id, 'body', _w);
    this.moth.glare(e, b);
    if (b) this.companion.glint(b.x, b.y, b.z, 1.4, 0);
    const L = e.length, ex = e.x + Math.sin(e.angle) * L, ez = e.z + Math.cos(e.angle) * L;
    this.companion.glint(ex, (this.host.groundAt?.(ex, ez) ?? 0) + 0.5, ez, 1.0, 0.03);
    this.onShake?.(0.07, 0.08);
  }

  /** The far end of a leg bone (its foot or paw), len m down the bone, in world space. */
  limbTip(id, bone, len, out) {
    const b = this.rig(id)?.bones?.[bone];
    if (!b) return null;
    b.updateWorldMatrix(true, false);
    return out.set(0, -len, 0).applyMatrix4(b.matrixWorld);
  }

  /** A monster was stunned (core stunned; e.miss names the attack that missed). */
  stunned(e) {
    if (e.miss === 'engulf') return this.slime.splat(e);
    if (e.miss !== 'pounce') return;
    const n = this.bonePos(e.id, 'head', _v);
    if (n) this.leaves.burst(n.x, Math.max(0, n.y - 0.5), n.z, 8, 1.6);
  }

  /** A splash of water at (x, z): droplets up and out and a ripple ring; size scales both. */
  splash(x, z, size = 1) {
    const y = this.host.groundAt?.(x, z) ?? 0, fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 14 * size; i++) {
      const a = Math.random() * 6.283, sp = (1.4 + Math.random() * 2.2) * size;
      fx.add(x, y + 0.2, z, Math.sin(a) * sp, 2 + Math.random() * 2.5 * size, Math.cos(a) * sp, { color: i % 3 ? 0x8fdcff : 0xf0fffb, size: 0.14 + Math.random() * 0.12, life: 0.55, gravity: 9, drag: 0.6 });
    }
    this.call.ring(x, y + 0.06, z, 1.1 * size, WATER_HALO, 0.45);
  }

  /**
   * A blunt blow at (x, y, z): a manga burst star (a zig-zag outline of light, its points flashing out from the
   * hit), a white flash and chips thrown out and falling. R its outer radius (m); look the stroke colours; chip
   * colours a and b.
   */
  burstStar(x, y, z, R, look, a, b) {
    const c = this.companion; c.axes();
    _v.set(x, y, z);
    const n = 6, rot = Math.random() * 1.0;
    for (let i = 0; i < n * 2; i++) {
      const a0 = rot + (i / (n * 2)) * 6.283, a1 = rot + ((i + 1) / (n * 2)) * 6.283, r0 = i % 2 ? R * 0.5 : R, r1 = i % 2 ? R : R * 0.5;
      c.stroke(_v, Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a1) * r1, Math.sin(a1) * r1, 0, 0.05, look, 0.26, 0.04, 0, null);
    }
    c.glint(x, y, z, R * 1.6, 0);
    const fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 12; i++) { const t = Math.random() * 6.283, sp = 2 + Math.random() * 2.5; fx.add(x, y, z, Math.sin(t) * sp, 1.5 + Math.random() * 2.5, Math.cos(t) * sp, { color: i % 2 ? a : b, size: 0.12 + Math.random() * 0.1, sizeEnd: 0.08, life: 0.55, gravity: 14, drag: 0.8 }); }
  }
  /** A crown of water splashing up off the prey at (x, z): arcs of water curling out, droplets up and raining down. */
  waterCrown(x, z) {
    const c = this.companion, y = (this.host.groundAt?.(x, z) ?? 0) + 0.45; c.axes();
    _v.set(x, y, z);
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1, k = (i % 3) / 2, x0 = s * (0.08 + 0.1 * k), x1 = s * (0.35 + 0.35 * k);
      c.stroke(_v, x0, 0, x1, 0.55 + 0.35 * (1 - k), s * 0.12, 0.045, WATER, 0.32, 0.07, k * 0.02, null);
    }
    const fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283, sp = 0.8 + Math.random() * 1.2; fx.add(x + Math.sin(a) * 0.25, y, z + Math.cos(a) * 0.25, Math.sin(a) * sp, 3.2 + Math.random() * 2, Math.cos(a) * sp, { color: i % 3 ? 0x8fdcff : 0xf0fffb, size: 0.13 + Math.random() * 0.08, sizeEnd: 0.06, life: 0.7, gravity: 11, drag: 0.5 }); }
    this.call.ring(x, y - 0.4, z, 0.9, WATER_HALO, 0.4);
  }
  /**
   * The tanuki's transformation smoke (folklore: it changes shape in a puff): soft white-and-pink cloud puffs swell
   * out and drift up, with a pop of sparkle stars - for its doubles stepping out (core doubles) and an illusion
   * popping (illusionPop). Its own look: no leaves.
   */
  puff(x, z, n = 12) {
    const y = this.host.groundAt?.(x, z) ?? 0, dust = this.host.vfx?.dust;
    if (dust) for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + Math.random() * 0.5, sp = 0.8 + Math.random() * 1.2;
      dust.add(x + Math.sin(a) * 0.25, y + 0.35 + Math.random() * 0.6, z + Math.cos(a) * 0.25, Math.sin(a) * sp, 0.6 + Math.random() * 0.8, Math.cos(a) * sp, { color: i % 3 ? 0xfff4fa : 0xffcfe2, size: 0.55, sizeEnd: 1.5, life: 0.75 + Math.random() * 0.3, drag: 3 });
    }
    for (let i = 0; i < 3; i++) this.companion.glint(x + (Math.random() - 0.5) * 0.9, y + 0.6 + Math.random() * 0.7, z + (Math.random() - 0.5) * 0.9, 0.7, i * 0.06);
  }
  doubles(e, g) { this.puff(e.x, e.z, 16); for (const m of g.monsters) if (m.illusion?.of === e.id && !m.dead) this.puff(m.x, m.z, 10); }

  endCue(id) { for (const c of this.cues) if (c.id === id) c.t = c.total + 1; }

  update(dt, g) {
    this.tanuki(g);
    this.fish(g);
    this.grotto.update(dt, g);
    this.slime.update(dt, g);
    this.gull.update(dt, g);
    this.boar.update(dt, g);
    this.spore.update(dt, g);
    this.beetle.update(dt, g);
    this.wolf.update(dt, g);
    this.hermit.update(dt, g);
    this.mantis.update(dt, g);
    this.greyfang.update(dt, g);
    this.viper.update(dt, g);
    this.mole.update(dt, g);
    this.moth.update(dt);
    this.crab(g, dt);
    this.ageSweep(dt);
    this.king(g, dt);
    // a rolling pangolin kicks up dust behind it
    for (const m of g.monsters) if (m.type === 'stone_pangolin' && m.charge && !m.charge.hop && Math.random() < 0.7) {
      const y = this.host.groundAt?.(m.x, m.z) ?? 0;
      this.call.dust(m.x, y + 0.15, m.z, (Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8, 0.7, 0.45);
    }
    this.leaves.update(dt);
    this.bubbles.update(dt);
    let glowAt = null, glowK = 0, glowTint = 0xffffff, glowSize = 1;
    let live = 0;
    for (const c of this.cues) {
      c.t += dt;
      const m = g.monsterById?.(c.id);
      if (!m || m.dead || m.state !== 'windup' || c.t > c.total + 0.05) continue;
      this.cues[live++] = c;
      const k = Math.min(1, c.t / c.total);
      if (c.kind === 'gust') {
        // the leaf tail warms with light and leaves gather round it, faster as it nears the whip
        const t = this.bonePos(c.id, 'tail', _w);
        if (!t) continue;
        glowAt = t; glowK = k;
        c.next -= dt;
        if (c.next <= 0) { c.next = 0.09 - 0.05 * k; this.leaves.orbit(t.x, t.y + 0.1, t.z, 0.35 + 0.15 * k, 7 + 6 * k, 0.4, 0.22); }
      } else if (c.kind === 'slug_stingers') {
        // the plume tips light one by one, the stinging cells swelling there
        c.next -= dt;
        const b = this.bonePos(c.id, 'cerata', _w);
        if (b && c.next <= 0) { c.next = 0.08; const a = Math.random() * 6.283; this.host.vfx?.fx.add(b.x + Math.sin(a) * 0.35, b.y + 0.35 + Math.random() * 0.2, b.z + Math.cos(a) * 0.35, 0, 0.4, 0, { color: 0xe0ccff, size: 0.2, sizeEnd: 0.05, life: 0.35, drag: 2 }); }
        if (b) { glowAt = b; glowK = 0.3 + 0.4 * k; glowTint = 0xc8a8ff; }
      } else if (c.kind === 'spore_fairy_ring' || c.kind === 'spore_sprouts' || c.kind === 'spore_sleep_cloud') {
        // spores breathe off its cap through the wind-up, pink for the sleepy ones, its cap glowing
        const b = this.bonePos(c.id, 'cap', _w);
        if (b) { glowAt = b; glowK = 0.2 + 0.6 * k; glowTint = c.kind === 'spore_sleep_cloud' ? 0xffc8e8 : 0xc89aff; glowSize = 0.9; }
        c.next -= dt;
        if (b && c.next <= 0) { c.next = 0.1 - 0.05 * k; const a = Math.random() * 6.283; this.host.vfx?.dust.add(b.x + Math.sin(a) * 0.5, b.y + 0.2, b.z + Math.cos(a) * 0.5, Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.3, { color: c.kind === 'spore_sleep_cloud' ? 0xffc8e8 : 0xc89aff, size: 0.3, sizeEnd: 0.7, life: 0.8, drag: 2, alpha: 0.5 }); }
      } else if (c.kind === 'slime_engulf') {
        // seawater wells up round it as it flattens, bubbles rising faster as it is about to hop
        c.next -= dt;
        if (c.next <= 0) { c.next = 0.08 - 0.05 * k; const a = Math.random() * 6.283, gy = this.host.groundAt?.(m.x, m.z) ?? 0; this.bubbles.add(m.x + Math.sin(a) * m.r * 1.1, gy + 0.15, m.z + Math.cos(a) * m.r * 1.1, 0, 0.5 + k, 0, 0.08 + 0.1 * k, 0.5); }
      } else if (c.kind === 'slime_brine') {
        // brine gathers in it: a cold glow at its middle and spray off its crest
        const b = this.bonePos(c.id, 'mid', _w);
        if (b) { glowAt = b; glowK = 0.3 + 0.6 * k; glowTint = 0x9fe8ff; glowSize = 0.8; }
        c.next -= dt;
        if (b && c.next <= 0) { c.next = 0.07; const a = Math.random() * 6.283; this.host.vfx?.fx.add(b.x + Math.sin(a) * 0.4, b.y + 0.3, b.z + Math.cos(a) * 0.4, -Math.sin(a) * 0.8, 0.2, -Math.cos(a) * 0.8, { color: 0xeafcff, size: 0.1, life: 0.35, drag: 1 }); }
      } else if (c.kind === 'fish_wave') {
        // the raised tail gathers water, drops running up it
        const t = this.bonePos(c.id, 'tail', _w);
        if (t) { glowAt = t; glowK = 0.3 + 0.6 * k; glowTint = 0x8fdcff; glowSize = 0.7; }
        c.next -= dt;
        if (t && c.next <= 0) { c.next = 0.06; const a = Math.random() * 6.283; this.host.vfx?.fx.add(t.x + Math.sin(a) * 0.3, t.y - 0.2, t.z + Math.cos(a) * 0.3, 0, 1.2, 0, { color: 0xbff0ff, size: 0.11, life: 0.35, drag: 1 }); }
      } else if (c.kind === 'fish_gulp') {
        // droplets gather at its mouth as its throat swells
        c.next -= dt;
        const h = this.bonePos(c.id, 'head', _w);
        if (h && c.next <= 0) { c.next = 0.05; const a = Math.random() * 6.283; this.host.vfx?.fx.add(h.x + Math.sin(a) * 0.6, h.y + 0.2, h.z + Math.cos(a) * 0.6, -Math.sin(a) * 1.4, 0.3, -Math.cos(a) * 1.4, { color: 0xbff0ff, size: 0.12, life: 0.4, drag: 0.5 }); }
      } else if (c.kind === 'tanuki_drum') {
        // the belly glows warm as it swells
        const b = this.bonePos(c.id, 'chest', _w);
        if (b) { glowAt = b; glowK = k; glowTint = 0xffd890; }
      } else if (c.kind === 'tanuki_boomerang') {
        // the leaf on its head lights up, then leaves gather round the cocked foreleg
        const h = this.bonePos(c.id, k < 0.45 ? 'head' : 'leg0k', _w);
        if (h) { if (k < 0.45) h.y += 0.35; glowAt = h; glowK = 0.5 + 0.5 * k; glowTint = 0x9cf07a; }
      } else if (c.kind === 'tanuki_doubles') {
        c.next -= dt;
        const b = this.bonePos(c.id, 'body', _w);
        if (b && c.next <= 0) { c.next = 0.05; const a = Math.random() * 6.283; this.host.vfx?.dust.add(b.x + Math.sin(a) * 0.6, b.y - 0.2, b.z + Math.cos(a) * 0.6, Math.cos(a) * 1.5, 0.9, -Math.sin(a) * 1.5, { color: 0xfff0f6, size: 0.3, sizeEnd: 0.8, life: 0.5, drag: 2 }); }
      } else if (c.kind === 'crab_sidestep') {
        // legs dig in, scuffing sand in place, faster as it is about to sweep; its open claws warm with light
        const cl = this.bonePos(c.id, 'mandL', _w);
        if (cl && k > 0.3) { glowAt = cl; glowK = 0.3 + 0.6 * k; glowTint = 0xffa860; glowSize = 0.6; }
        c.next -= dt;
        const m2 = g.monsterById?.(c.id);
        if (m2 && c.next <= 0) { c.next = 0.1 - 0.06 * k; const a = Math.random() * 6.283, y = this.host.groundAt?.(m2.x, m2.z) ?? 0; this.call.dust(m2.x + Math.sin(a) * 0.6, y + 0.1, m2.z + Math.cos(a) * 0.6, Math.sin(a) * 0.8, 0.4, Math.cos(a) * 0.8, 0.4, 0.35); }
      } else if (c.kind === 'crab_bubbles') {
        // foam gathers at its mouth, small bubbles welling up and swelling
        c.next -= dt;
        const h = this.bonePos(c.id, 'head', _w);
        if (h && c.next <= 0) { c.next = 0.09 - 0.05 * k; this.bubbles.add(h.x + (Math.random() - 0.5) * 0.25, h.y, h.z + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.3, 0.15, (Math.random() - 0.5) * 0.3, 0.12 + 0.14 * k, 0.45); }
      } else if (c.kind === 'moth_decoy') {
        // its wings flare white as the reflection splits off it
        const b = this.bonePos(c.id, 'body', _w);
        if (b) { glowAt = b; glowK = 0.2 + 0.8 * k * k; glowTint = 0xf2fbff; glowSize = 1.5; }
      } else if (c.kind === 'moth_shard_rain') {
        // a cold shine in the raised wings while the shards form overhead
        const b = this.bonePos(c.id, 'body', _w);
        if (b && k > 0.25) { glowAt = b; glowK = 0.2 + 0.5 * k; glowTint = 0xbfe9ff; glowSize = 1.1; }
      } else if (c.kind === 'moth_glare') {
        // the wings catch the moon: their glass brightens, glints flaring on the panes faster and faster
        const b = this.bonePos(c.id, 'body', _w);
        if (b) { glowAt = b; glowK = 0.15 + 0.85 * k * k; glowTint = 0xf2fbff; glowSize = 1.4; }
        c.next -= dt;
        if (k > 0.35 && c.next <= 0) {
          c.next = 0.16 - 0.1 * k;
          const side = Math.random() < 0.5 ? 'wingL' : 'wingR', bone = this.rig(c.id)?.bones?.[side];
          if (bone) { bone.updateWorldMatrix(true, false); _v.set((side === 'wingL' ? 1 : -1) * (0.3 + 0.4 * Math.random()), 0.3 + 0.4 * Math.random(), 0).applyMatrix4(bone.matrixWorld); this.companion.glint(_v.x, _v.y, _v.z, 0.5 + 0.5 * k, 0); }
        }
      } else if (c.kind === 'hare_box') {
        // the raised forepaws light up in the guard
        const h = this.limbTip(c.id, 'leg0', 0.26, _w);
        if (h && k > 0.3) { glowAt = h; glowK = 0.25 + 0.6 * k; glowTint = 0xd8ffa8; glowSize = 0.45; }
      } else if (c.kind === 'hare_thump') {
        // the hind feet warm through the alarm, brightest as it hops up for the slam
        const h = this.limbTip(c.id, 'leg2', 0.28, _w);
        if (h && k > 0.35) { glowAt = h; glowK = 0.3 + 0.7 * k; glowTint = 0xb8f070; glowSize = 0.45; }
      } else if (c.kind === 'hare_hop') {
        // coiled hind feet light up and scrabble at the earth while it aims; earth kicked back as it springs
        const h = this.limbTip(c.id, k > 0.5 && Math.random() < 0.5 ? 'leg3' : 'leg2', 0.28, _w);
        if (h && k > 0.3) {
          glowAt = h; glowK = 0.3 + 0.6 * k; glowTint = 0xb8f070; glowSize = 0.45;
          c.next -= dt;
          if (c.next <= 0) { c.next = 0.1; this.mole.puff(h.x, (this.host.groundAt?.(h.x, h.z) ?? 0) + 0.08, h.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.3, 0.4, 0.3); }
          if (!c.off && k > 0.96) {
            c.off = true;
            const a = m.windup?.angle ?? m.facing ?? 0, gy = this.host.groundAt?.(h.x, h.z) ?? 0;
            for (let i = 0; i < 5; i++) { const s = a + Math.PI + (Math.random() - 0.5) * 1.4, v = 1.4 + Math.random(); this.mole.puff(h.x, gy + 0.1, h.z, Math.sin(s) * v, Math.cos(s) * v, 0.4, 0.5, 0.35); }
          }
        }
      } else if (c.kind === 'mole_swipe') {
        // the raised claws warm with amber light as it rears
        const h = this.bonePos(c.id, 'handR', _w);
        if (h) { glowAt = h; glowK = 0.3 + 0.7 * k; glowTint = 0xffb060; }
      } else if (c.kind === 'mole_spray') {
        // dust and clods kicked up under its churning claws, faster and higher as it nears the fling
        c.next -= dt;
        if (c.next <= 0) {
          c.next = 0.11 - 0.05 * k;
          const hand = this.bonePos(c.id, Math.random() < 0.5 ? 'handL' : 'handR', _w);
          if (hand) {
            const a = Math.random() * 6.283;
            this.mole.puff(hand.x, 0.2, hand.z, Math.sin(a) * 0.9, Math.cos(a) * 0.9, 0.5 + 0.3 * k, 0.5, 0.4);
            this.mole.clod(hand.x, 0.3, hand.z, Math.sin(a) * 1.2, 2 + 2.5 * k, Math.cos(a) * 1.2, 0.04 + 0.03 * k, 0.8);
          }
        }
      } else if (c.kind === 'pounce') {
        // listening: two little arcs of light pulse by its ears through the frozen part of the wind-up
        c.next -= dt;
        if (k > 0.3 && k < 0.85 && c.next <= 0) {
          c.next = 0.22;
          const h = this.bonePos(c.id, 'head', _w);
          if (h) {
            this.companion.axes();
            this.companion.clawFx.mark(h.x, h.y + 0.45, h.z, 0.16, 0.55, 1.2, 1, EAR, EAR_RIM, 0, 0.2, 0.8);
            this.companion.clawFx.mark(h.x, h.y + 0.45, h.z, 0.16, 0.55, -1.2, -1, EAR, EAR_RIM, 0, 0.2, 0.8);
          }
        }
      }
    }
    this.cues.length = live;
    if (glowAt) { this.glow.material.color.setHex(glowTint); const S = (1.2 + 0.8 * glowK) * glowSize;
      // never let the glow's square cut through the ground (a straight edge under small creatures' feet)
      this.glow.position.copy(glowAt); this.glow.position.y = Math.max(glowAt.y, (this.host.groundAt?.(glowAt.x, glowAt.z) ?? 0) + S * 0.5); this.glow.scale.setScalar(S); this.glow.material.opacity = 0.25 + 0.45 * glowK; this.glow.visible = true; }
    else if (this.kingGlow) this.kingGlow = false; // the king's pearl or latch lit it this frame
    else if (this.glow.visible) { this.glow.material.opacity *= Math.exp(-dt * 18); if (this.glow.material.opacity < 0.02) this.glow.visible = false; }
  }
  /**
   * The reef crab: its bubble mines (core areas kind bubble_mine) drift out from its mouth to where they will hang,
   * bob there over a pale ring on the ground (their true radius), and pop when they go (touched: a burst; left:
   * a soft pop); sand thrown up under its side-to-side sweep.
   */
  crab(g, dt) {
    const live = this.mineLive || (this.mineLive = new Set());
    live.clear();
    let n = 0;
    for (const a of g.areas) {
      if (a.kind !== 'bubble_mine' || n >= this.crabBubbles.length) continue;
      live.add(a.id);
      let q = this.mines.get(a.id);
      if (!q) {
        const mouth = this.bonePos(a.sourceId, 'head', _w) || _w.set(a.x, 0.7, a.z);
        q = { fx: mouth.x, fy: mouth.y, fz: mouth.z, ph: Math.random() * 6.283 };
        this.mines.set(a.id, q);
      }
      const sp = this.crabBubbles[n], ring = this.mineRings[n]; n++;
      const gy = this.host.groundAt?.(a.x, a.z) ?? 0, k = Math.min(1, a.t / Math.max(0.01, a.delay)), e = 1 - (1 - k) * (1 - k);
      const hy = gy + 0.75 + Math.sin(a.t * 2.2 + q.ph) * 0.08;
      sp.visible = true;
      sp.position.set(q.fx + (a.x - q.fx) * e, q.fy + (hy - q.fy) * e + Math.sin(Math.PI * k) * 0.5, q.fz + (a.z - q.fz) * e);
      // swells as it is blown out; then breathes; the last second it wobbles harder before floating off
      const left = a.delay + a.duration - a.t, warn = left < 1 ? 1 - left : 0, size = a.radius * 2 * (0.35 + 0.65 * e);
      sp.scale.set(size * (1 + 0.06 * Math.sin(a.t * 7 + q.ph) + 0.12 * warn * Math.sin(a.t * 30)), size * (1 - 0.05 * Math.sin(a.t * 7 + q.ph)), 1);
      sp.material.color.setHex(0xbfeeff); sp.material.opacity = 0.95;
      ring.visible = k >= 1; ring.position.set(a.x, gy + 0.06, a.z); ring.scale.setScalar(a.radius);
      ring.material.opacity = 0.55 + 0.25 * Math.sin(a.t * 5 + q.ph);
    }
    for (let i = n; i < this.crabBubbles.length; i++) { this.crabBubbles[i].visible = false; this.mineRings[i].visible = false; }
    for (const [id, q] of this.mines) if (!live.has(id)) {
      // gone: a burst already drew its pop; one left alone floats off with a soft pop
      if (!this.popped.has(id)) this.softPop(q.lx ?? q.fx, q.lz ?? q.fz);
      this.mines.delete(id); this.popped.delete(id);
    }
    for (const a of g.areas) if (a.kind === 'bubble_mine') { const q = this.mines.get(a.id); if (q) { q.lx = a.x; q.lz = a.z; q.lid = a.id; } }
    const fx = this.host.vfx?.fx;
    for (const m of g.monsters) {
      if (m.type !== 'reef_crab' || !m.charge?.scuttle) continue;
      const c = m.charge, y = this.host.groundAt?.(m.x, m.z) ?? 0;
      if (Math.random() < 0.8) { const a = Math.random() * 6.283; this.call.dust(m.x + Math.sin(a) * 0.5, y + 0.12, m.z + Math.cos(a) * 0.5, Math.sin(a) * 0.9, 0.5, Math.cos(a) * 0.9, 0.5, 0.4); }
      // the sweep itself is drawn where it hurts: a band of light on the ground in front of it, exactly the strip
      // that is hit (its reach ahead, the claws' width across), moving with it and leaving fading copies along the
      // ground it has swept (owner, 2026-11-05: the hit area had no effect, as if the attack happened unseen)
      const atk = m.def.attacks[m.windup?.name] || {};
      const S = this.sweep || (this.sweep = this.makeSweepBands());
      const reach = c.reach ?? 3, wide = 1.4 + 0.4, gy2 = y + 0.05;
      const live = S.live;
      live.visible = true; live.position.set(m.x, gy2, m.z); live.rotation.y = c.angle; live.scale.set(wide, 1, reach);
      live.material.opacity = 0.55 + 0.25 * Math.abs(Math.sin(c.t * 11));
      live.userData.t = c.t;
      S.next -= dt;
      if (S.next <= 0) {
        S.next = 0.045;
        const gh = S.ghosts[S.i++ % S.ghosts.length];
        gh.visible = true; gh.position.copy(live.position); gh.rotation.y = c.angle; gh.scale.copy(live.scale); gh.userData.age = 0;
      }
      // sand thrown forward off the band's far edge, where the claws reach
      if (fx && Math.random() < 0.7) {
        const dir = Math.sin(c.angle), dirz = Math.cos(c.angle), lat = (Math.random() - 0.5) * wide;
        const px = m.x + dir * reach * (0.6 + 0.4 * Math.random()) + dirz * lat, pz = m.z + dirz * reach * (0.6 + 0.4 * Math.random()) - dir * lat;
        this.call.dust(px, gy2 + 0.1, pz, dir * 1.2, 0.6, dirz * 1.2, 0.45, 0.35);
      }
      S.seen = true;
      // the claws flash as they snap shut (about seven snaps over the two passes)
      const rig = this.rig(m.id);
      for (const [bone, sx] of [['mandL', 1], ['mandR', -1]]) {
        const b = rig?.bones?.[bone];
        if (!b || !fx) continue;
        b.updateWorldMatrix(true, false);
        _v.set(sx * 0.08, 0.12, 0.6).applyMatrix4(b.matrixWorld);
        const snap = Math.floor(c.t / 0.17);
        if (snap !== (c.snap?.[bone] ?? -1)) { (c.snap ||= {})[bone] = snap; this.companion.glint(_v.x, _v.y, _v.z, 0.55, 0); }
      }
    }
  }
  /** The crab sweep's ground bands: the live strip that hurts and its fading copies (a shared soft-edged texture). */
  makeSweepBands() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    // across: soft edges; along: brightest at the far end where the claws reach, fading toward the crab
    const along = g.createLinearGradient(0, 128, 0, 0);
    along.addColorStop(0, 'rgba(255,255,255,0.15)'); along.addColorStop(0.55, 'rgba(255,255,255,0.6)'); along.addColorStop(0.9, 'rgba(255,255,255,1)'); along.addColorStop(1, 'rgba(255,255,255,0.4)');
    g.fillStyle = along; g.fillRect(0, 0, 64, 128);
    g.globalCompositeOperation = 'destination-in';
    const across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(0.2, 'rgba(0,0,0,1)'); across.addColorStop(0.8, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = across; g.fillRect(0, 0, 64, 128);
    const tex = new THREE.CanvasTexture(c); tex.userData.shared = true;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5); geo.userData.shared = true;
    const mk = (color, o) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.visible = false; m.renderOrder = 7; this.scene.add(m); return m; };
    return { live: mk(0xff8a3a, 0.7), ghosts: Array.from({ length: 8 }, () => mk(0xff7a2a, 0.35)), i: 0, next: 0, seen: false };
  }
  ageSweep(dt) {
    const S = this.sweep;
    if (!S) return;
    if (!S.seen) S.live.visible = false;
    S.seen = false;
    for (const gh of S.ghosts) {
      if (!gh.visible) continue;
      gh.userData.age += dt;
      const k = gh.userData.age / 0.32;
      if (k >= 1) { gh.visible = false; continue; }
      gh.material.opacity = 0.35 * (1 - k);
    }
  }
  /** A bubble mine left alone floats off: a soft pop, a few droplets. */
  softPop(x, z) {
    const y = (this.host.groundAt?.(x, z) ?? 0) + 0.75, fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; fx.add(x, y, z, Math.sin(a) * 0.8, 0.6, Math.cos(a) * 0.8, { color: 0xd8f6ff, size: 0.08, sizeEnd: 0.02, life: 0.3, gravity: 6, drag: 1 }); }
  }
  /** A bubble mine is touched (core burst of kind bubble_mine): it bursts in a splash of water on what touched it. */
  mineBurst(e) {
    for (const [id, q] of this.mines) if (Math.hypot((q.lx ?? 1e9) - e.x, (q.lz ?? 1e9) - e.z) < 0.05) this.popped.add(id);
    this.bubblePop(e.x, e.z);
    this.call.ring(e.x, (this.host.groundAt?.(e.x, e.z) ?? 0) + 0.06, e.z, e.radius * 1.6, WATER_HALO, 0.35);
    this.onShake?.(0.05, 0.07);
    return true;
  }
  /** A spat bubble pops on what it hits: a ring of droplets and a few small bubbles. */
  bubblePop(x, z) {
    const y = (this.host.groundAt?.(x, z) ?? 0) + 0.7, fx = this.host.vfx?.fx;
    if (fx) for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; fx.add(x, y, z, Math.sin(a) * 1.8, 0.8 + Math.random(), Math.cos(a) * 1.8, { color: i % 2 ? 0x9fe6ff : 0xf0fbff, size: 0.11, sizeEnd: 0.03, life: 0.4, gravity: 8, drag: 1 }); }
    for (let i = 0; i < 3; i++) this.bubbles.add(x, y, z, (Math.random() - 0.5) * 1.5, 0.4, (Math.random() - 0.5) * 1.5, 0.16, 0.4 + Math.random() * 0.3);
    this.companion.glint(x, y, z, 0.6, 0);
  }

  /** The snail king's sweeping pearl beam (core m.sweep), and its pearl charging before it. */
  king(g, dt) {
    const B = this.beam;
    const m = g.monsters.find((q) => q.sweep && q.type === 'pearl_snail_king' && !q.dead);
    if (m) {
      const atk = m.def.attacks[m.sweep.name], p = this.bonePos(m.id, 'pearl', _w), y = p ? p.y - 0.3 : 1.6;
      const ang = m.sweep.from + (m.sweep.to - m.sweep.from) * Math.min(1, m.sweep.t / m.sweep.dur);
      const flick = 0.85 + Math.random() * 0.3;
      for (const [mesh, w] of [[B.glow, atk.width * 1.8], [B.core, atk.width * 0.45]]) {
        mesh.visible = true; mesh.position.set(m.x, y, m.z); mesh.rotation.set(0, ang, 0); mesh.scale.set(w * flick, 1, atk.range);
      }
      // where it ends it scorches the ground with dust and sparks
      const ex = m.x + Math.sin(ang) * atk.range, ez = m.z + Math.cos(ang) * atk.range, gy = this.host.groundAt?.(ex, ez) ?? 0;
      if (Math.random() < 0.8) this.host.vfx?.fx.add(ex, gy + 0.2, ez, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, { color: 0xffe6a0, size: 0.2, sizeEnd: 0.04, life: 0.4, gravity: 6, drag: 1 });
      if (Math.random() < 0.5) this.call.dust(ex, gy + 0.15, ez, 0, 0.6, 0, 0.8, 0.5);
      if (p) { this.glow.material.color.setHex(PEARL); this.glow.position.copy(p); this.glow.scale.setScalar(2.4 + Math.random() * 0.4); this.glow.material.opacity = 0.8; this.glow.visible = true; this.kingGlow = true; }
    } else if (B.glow.visible) { B.glow.visible = B.core.visible = false; }
    // the pearl charging (its wind-up): light gathers to it, motes drawn in from round it
    for (const q of g.monsters) {
      if (q.type !== 'pearl_snail_king' || q.dead || q.state !== 'windup' || !q.windup) continue;
      const k = Math.min(1, q.stateT / q.windup.total), name = q.windup.name;
      if (name === 'beam') {
        const p = this.bonePos(q.id, 'pearl', _w);
        if (!p) continue;
        this.glow.material.color.setHex(PEARL); this.glow.position.copy(p); this.glow.scale.setScalar(1 + 1.8 * k); this.glow.material.opacity = 0.3 + 0.6 * k; this.glow.visible = true; this.kingGlow = true;
        if (Math.random() < 0.7) { const a = Math.random() * 6.283, r = 1.5 + Math.random(); this.host.vfx?.fx.add(p.x + Math.sin(a) * r, p.y + (Math.random() - 0.5), p.z + Math.cos(a) * r, -Math.sin(a) * r * 2.5, 0, -Math.cos(a) * r * 2.5, { color: PEARL, size: 0.16, sizeEnd: 0.02, life: 0.38, drag: 0.5 }); }
      } else if (name === 'eggs') {
        // the eggs form on its shell: the pearl swells pink with each heave
        const p = this.bonePos(q.id, 'pearl', _w);
        if (p) { this.glow.material.color.setHex(0xffb8d8); this.glow.position.copy(p); this.glow.scale.setScalar(1.2 + 1.2 * k + Math.sin(g.time * (6 + 10 * k)) * 0.25); this.glow.material.opacity = 0.35 + 0.5 * k; this.glow.visible = true; this.kingGlow = true; }
      } else if (name === 'grind' && k > 0.4) {
        // the rasp of its tongue glints at its mouth
        const h = this.bonePos(q.id, 'head', _w);
        if (h) { this.glow.material.color.setHex(0xffd8ec); this.glow.position.copy(h); this.glow.scale.setScalar(1.1 + Math.sin(g.time * 40) * 0.15); this.glow.material.opacity = 0.6 * k; this.glow.visible = true; this.kingGlow = true; }
        if (h && Math.random() < 0.3) this.companion.glint(h.x + (Math.random() - 0.5) * 0.5, h.y - 0.2, h.z + (Math.random() - 0.5) * 0.5, 0.5, 0);
      }
    }
  }

  /** The pearl fish's flop landings. */
  fish(g) {
    for (const a of g.areas) {
      if (a.attack !== 'flop' || a.t < a.delay || this.splashes.has(a.id)) continue;
      this.splashes.add(a.id);
      this.splash(a.x, a.z, 1);
      this.onShake?.(0.04, 0.06);
    }
    if (this.splashes.size > 64) this.splashes.clear();
  }

  /** The tanuki's drum rings (taiko sound waves) and its head-leaf boomerang. */
  tanuki(g) {
    for (const a of g.areas) {
      if (a.look !== 'drum' || a.t < a.delay || this.rings.has(a.id)) continue;
      this.rings.add(a.id);
      // a taiko beat: a ring of warm gold sound running out with the wave's edge (a thin echo ring behind it), dust
      // kicked up where the edge passes, and manga impact lines bursting off its belly; the last beat bigger
      const y = this.host.groundAt?.(a.x, a.z) ?? 0, life = (a.maxRadius - a.radius) / a.growth, last = !!a.knock;
      this.call.ring(a.x, y + 0.1, a.z, a.maxRadius, DRUM, life + 0.1);
      this.call.ring(a.x, y + 0.06, a.z, a.maxRadius * 0.82, DRUM, life + 0.18, 0.08);
      // (few, soft and faint: a crowd of dust dots read as spots on the sand)
      const dust = this.host.vfx?.dust, n = last ? 9 : 6;
      if (dust) for (let i = 0; i < n; i++) { const ang = (i / n) * 6.283 + a.beat; dust.add(a.x + Math.sin(ang) * 0.7, y + 0.15, a.z + Math.cos(ang) * 0.7, Math.sin(ang) * a.growth, 0.3, Math.cos(ang) * a.growth, { color: 0xd8c49c, size: 0.5, sizeEnd: 1.3, life: life * 0.6, drag: 0.2, alpha: 0.45 }); }
      const belly = this.bonePos(a.sourceId, 'chest', _w);
      if (belly) {
        this.companion.axes();
        const L = last ? 1.0 : 0.75;
        for (let i = 0; i < 10; i++) { const t = (i / 10) * 6.283 + a.beat * 0.3, cx = Math.cos(t), cy = Math.sin(t); this.companion.stroke(belly, cx * 0.35, cy * 0.35, cx * L, cy * L, 0, last ? 0.05 : 0.04, DRUM_CORE, 0.18, 0.04); }
        this.companion.glint(belly.x, belly.y, belly.z, last ? 1.3 : 0.9, 0);
      }
      this.onShake?.(last ? 0.12 : 0.06, 0.08);
    }
    if (this.rings.size > 64) this.rings.clear();
    // the leaf boomerang: one big leaf spinning flat along the projectile, a few small ones shed behind it
    const pr = g.projectiles.find((q) => q.boomerang);
    if (pr) {
      const y = (this.host.groundAt?.(pr.x, pr.z) ?? 0) + (pr.y ?? 0.9);
      // its own green head-leaf, spinning flat, a green swirl of wind shed behind it
      if (this.spinLeaf < 0) this.spinLeaf = this.leaves.leaf(pr.x, y, pr.z, 0, 0, 0, 1.5, 9, 0, 0, HEAD_LEAF);
      this.leaves.hold(this.spinLeaf, pr.x, y, pr.z, g.time * 22);
      const sw = g.time * 22;
      this.host.vfx?.fx.add(pr.x + Math.sin(sw) * 0.5, y, pr.z + Math.cos(sw) * 0.5, -pr.vx * 0.15, 0.2, -pr.vz * 0.15, { color: 0xb8f08a, size: 0.16, sizeEnd: 0.03, life: 0.35, drag: 2 });
    } else if (this.spinLeaf >= 0) { this.leaves.release(this.spinLeaf); this.spinLeaf = -1; }
  }
  clear() { this.leaves.clear(); this.bubbles.clear(); this.cues.length = 0; this.glow.visible = false; }
}
