// The hunter's four-legged companions move by the Quaternius wolf's own clips (CC0; data/beast-clips.json,
// made by scripts/beast-clips/extract.mjs), not by guessed angles. The clips hold, per frame, the direction of
// each body part in the animal's frame; each of our bones is turned by the turn that takes the wolf's
// standing direction to its direction in the frame, so a wolf and a bear (the same rig bones, other
// proportions) both play them in their own shape. Walk and gallop are blended by ground speed and their
// cycles locked to it (no sliding feet); idle plays standing; a wind-up and its bite play the attack clip
// with the bite on the hit; a hit plays the flinch. Hips are the pivot: the hind hips stay over the hind feet.
// The bear rears onto its hind legs while it roars (s.standT), posed after the owner's standing bear.
// Each companion's own moves (owner, 2026-11-01: "each one needs its own attack and skill moves"):
//   the bear's attack is a paw swipe (opts.swipe): rearing to rake with its forelegs, the spine and forelegs
//     from a CC0 humanoid claw swipe (UAL2 Zombie_Scratch, scripts/beast-clips/extract-swipe.mjs), the hind
//     legs planted as in the rear pose;
//   Sic 'Em sends the wolf in with a pounce (s.pounce): the wolf's own Gallop_Jump, crouch and leap, the bite
//     high in the leap, carried forward onto its prey;
//   Pack Hunt makes it stand to howl (s.standT, the rules' roarT): head thrown back, jaw working.
import * as THREE from 'three';
import { clamp01 } from './rig.js';
import CLIPS from '../../data/beast-clips.json';

const BONES = ['body', 'chest', 'neck', 'head', 'tail', 'leg0', 'leg0k', 'leg1', 'leg1k', 'leg2', 'leg2k', 'leg3', 'leg3k'];
const PARENT = { body: null, chest: 'body', neck: 'chest', head: 'neck', tail: 'body', leg0: 'chest', leg1: 'chest', leg2: 'body', leg3: 'body', leg0k: 'leg0', leg1k: 'leg1', leg2k: 'leg2', leg3k: 'leg3' };
const CHILD = { body: 'chest', chest: 'neck', neck: 'head', leg0: 'leg0k', leg1: 'leg1k', leg2: 'leg2k', leg3: 'leg3k' };
const FALLBACK = { head: [0, -0.25, 0.97], tail: [0, -0.5, -0.87], leg0k: [0, -1, 0.05], leg1k: [0, -1, 0.05], leg2k: [0, -1, 0], leg3k: [0, -1, 0] };
// the bear standing on its hind legs (the owner's standing model as the reference): spine near upright, head
// level and forward, forelegs raised forward and out, hind legs straight under it
const REAR = { body: [0, 0.94, 0.33], chest: [0, 0.97, 0.22], neck: [0, 0.5, 0.86], head: [0, -0.12, 0.99], tail: [0, -0.92, -0.38],
  leg0: [0.3, -0.35, 0.89], leg0k: [0.12, -0.72, 0.68], leg1: [-0.3, -0.35, 0.89], leg1k: [-0.12, -0.72, 0.68],
  leg2: [0, -0.97, 0.24], leg2k: [0, -0.99, -0.12], leg3: [0, -0.97, 0.24], leg3k: [0, -0.99, -0.12] };
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]).normalize();
/** A set of clips from scripts/beast-clips/extract.mjs (the wolf's by default; the leaf fox plays the pack's Fox). */
export function clipSet(json) {
  return { C: json.clips, REST: Object.fromEntries(Object.entries(json.rest).map(([k, d]) => [k, V(d)])), follow: { attack: 0.58 * json.clips.attack.duration, jump: 0.4, swipe: 0.6 } };
}
const WOLF = clipSet(CLIPS);
const REARV = Object.fromEntries(Object.entries(REAR).map(([k, d]) => [k, V(d)]));
// the howl: forelegs straight, chest up a little, neck and muzzle thrown back toward the sky
const HOWL = { chest: [0, 0.4, 0.92], neck: [0, 0.92, 0.38], head: [0, 0.85, 0.52] };
const HOWLV = Object.fromEntries(Object.entries(HOWL).map(([k, d]) => [k, V(d)]));
// a swipe keeps the bear's head, tail and hind legs as in its rear pose (planted); the rest is the clip's
const SWIPE_KEEP = new Set(['head', 'tail', 'leg2', 'leg2k', 'leg3', 'leg3k']);
// where each attack clip strikes (a clip's own `hit` if it has one) and how long its follow-through plays
export const HIT = { attack: 0.42, jump: 0.68 };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _hip = new THREE.Vector3();

/** The rig's own rest directions (root space; the rigs' rest rotations are the identity) and hip offset. */
function setup(r) {
  const b = r.bones, rest = {};
  for (const n of BONES) {
    const c = CHILD[n] && b[CHILD[n]];
    rest[n] = c ? c.position.clone().normalize() : V(FALLBACK[n]);
  }
  const hip = b.leg2.position.clone().add(b.leg3.position).multiplyScalar(0.5);
  const legLen = Math.max(0.2, b.body.position.y + hip.y);
  r.beast = { rest, hip, legLen, restBody: b.body.position.clone(), world: {}, dir: Object.fromEntries(BONES.map((n) => [n, rest[n].clone()])), walkPh: 0, idlePh: Math.random(), attackT: 0, inAttack: false, lift: 0 };
  for (const n of BONES) r.beast.world[n] = new THREE.Quaternion();
  return r.beast;
}

// one clip's direction for bone n at phase u (0..1), turned onto this rig: into out
function clipDir(B, clip, u, n, out) {
  const fr = clip.frames, f = u * fr.length, i = Math.floor(f) % fr.length, j = (i + 1) % fr.length, k = f - Math.floor(f);
  const a = fr[i][n], c = fr[j][n];
  _a.set(a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k).normalize();
  _q.setFromUnitVectors(B.set.REST[n], _a);
  return out.copy(B.rest[n]).applyQuaternion(_q);
}
// an absolute clip's direction (the pose itself, the swipe) for bone n at phase u: into out
function poseDir(clip, u, n, out) {
  if (SWIPE_KEEP.has(n)) return out.copy(REARV[n]);
  const fr = clip.frames, f = u * fr.length, i = Math.min(fr.length - 1, Math.floor(f)), j = Math.min(fr.length - 1, i + 1), k = f - Math.floor(f);
  const a = fr[i][n], c = fr[j][n];
  return out.set(a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k).normalize();
}
const clipLift = (clip, u) => { const fr = clip.frames, f = u * fr.length, i = Math.floor(f) % fr.length, j = (i + 1) % fr.length, k = f - Math.floor(f); return fr[i].lift + (fr[j].lift - fr[i].lift) * k; };

/**
 * opts: stride (m per walk cycle, per m of leg), gallopFrom / gallopFull (m/s), rate (a heavier beast plays
 * slower), bodyY (the rig's body height, for the hips' rest), set (a clipSet; the wolf's by default).
 * s.pose ({clip, u, w, leap}) poses the rig directly at phase u of one of its clips with weight w instead of the
 * attack the wind-up picks (a monster's own timing: its rules move it, `leap` metres lift it in the air).
 */
export function animBeast(r, s, dt, time, opts = {}) {
  const b = r.bones, B = r.beast || setup(r), S = (B.set = opts.set || WOLF), C = S.C, FOLLOW = S.follow;
  const speed = s.moving ? Math.max(0, s.speed || 0) : 0, rate = opts.rate || 1;
  // the gait (walk or gallop) and its direction follow the eased speed when the view gives one, so a pace that
  // changes every frame does not flick the legs between clips (the cycle still advances with the true speed)
  const gaitSpeed = s.moving ? Math.max(0, s.smoothSpeed ?? speed) : 0;
  // the clips to blend: locomotion by speed, then an attack or a flinch over it
  const gFrom = opts.gallopFrom ?? 3.2, gFull = opts.gallopFull ?? 5.5;
  // the gait is chosen, not blended by speed: a gallop above the middle of gFrom..gFull (with a margin either
  // way), with a short crossfade between them (a pace hovering in between used to hold the legs half in each
  // clip, out of step)
  const gMid = (gFrom + gFull) / 2, gM = (gFull - gFrom) / 4;
  B.gait = B.gait === 'gallop' ? (gaitSpeed > gMid - gM ? 'gallop' : 'walk') : (gaitSpeed > gMid + gM ? 'gallop' : 'walk');
  let gw = B.gait === 'gallop' ? 1 : 0;
  const mw = clamp01(gaitSpeed / 0.6);
  // the cycle is locked to the ground: walk covers stride x leg per cycle, the gallop 2.6x that
  // (opts.gallopStride: the gallop's cycle in strides, 2.6 by default; a backing beast with opts.reverse walks
  // its cycle backwards)
  const stride = (opts.stride ?? 1.9) * B.legLen, gs = (opts.gallopStride ?? 2.6) - 1;
  // backwards while it backs off: decided on the eased forward speed with a margin, so it never flicks
  B.back = !opts.reverse ? 1 : s.backing !== undefined ? (s.backing ? -1 : 1) : ((s.smoothFwd ?? s.vFwd ?? 0) < (B.back === -1 ? -0.05 : -0.35) ? -1 : 1);
  const back = B.back;
  if (back < 0) gw = 0; // it backs off at a walk, never a backwards gallop
  B.gw = (B.gw ?? gw) + (gw - (B.gw ?? gw)) * Math.min(1, dt * 7); // and changes gait over a moment, not a frame
  gw = B.gw;
  B.walkPh = (B.walkPh + back * dt * speed / (stride * (1 + gs * gw)) + 1) % 1;
  B.idlePh = (B.idlePh + dt * rate / C.idle.duration) % 1;
  // a wind-up plays the attack clip up to its strike (on the hit), then the rest after it: the bite, the
  // bear's swipe, or a pounce (chosen as the wind-up starts: Sic 'Em clears its flag on the bite)
  if (s.state === 'windup') {
    if (!B.winding || (s.pounce && B.clip !== 'jump')) { B.winding = true; B.clip = s.pounce ? 'jump' : opts.swipe ? 'swipe' : 'attack'; } // sent in mid-wind-up: the pounce
    B.attackT = (C[B.clip].hit ?? HIT[B.clip]) * clamp01((s.windupT || 0) / (s.windupTotal || 0.25)); B.inAttack = true;
  } else {
    B.winding = false;
    if (B.inAttack) { const h = C[B.clip].hit ?? HIT[B.clip]; B.attackT += dt * rate * (1 - h) / FOLLOW[B.clip]; if (B.attackT >= 1) B.inAttack = false; }
  }
  const P = s.pose, name = P ? P.clip : B.clip || 'attack', clip = C[name], abs = !!clip.absolute, hitAt = clip.hit ?? HIT[name] ?? 0.5;
  const atk = Math.min(0.999, P ? P.u : B.attackT || 0), aw = P ? P.w : B.inAttack ? clamp01(Math.min(atk * (abs ? 5 : 8), (1 - atk) * (abs ? 4 : 6))) : 0;
  if (P) B.inAttack = false;

  const hw = clamp01((s.hurt || 0) * 1.5);
  // standing to call (s.standT): the bear rears to roar (up over 0.2 s, down over its last 0.2 s); a wolf
  // howls (opts.swipe marks the bear)
  const total = s.standTotal || 1.2, left = s.standT || 0, sw = left > 0 ? clamp01((total - left) / 0.22) * clamp01(left / 0.22) : 0;
  const rears = opts.swipe || opts.rear, rw = rears ? sw : 0, howl = rears ? 0 : sw; // opts.rear: a beast that stands up (the tanuki drums)
  const k = 1 - Math.exp(-dt * 16);
  let lift = 0;
  for (const n of BONES) {
    // locomotion: idle -> walk -> gallop
    const d = clipDir(B, C.idle, B.idlePh, n, _b.set(0, 0, 0));
    if (mw > 0) { clipDir(B, C.walk, B.walkPh, n, _a); d.lerp(_a, mw * (1 - gw)); }
    if (gw > 0) { clipDir(B, C.gallop, B.walkPh, n, _a); d.lerp(_a, gw); }
    if (aw > 0) { if (abs) poseDir(clip, atk, n, _a); else clipDir(B, clip, atk, n, _a); d.lerp(_a, aw); }
    if (howl > 0 && HOWLV[n]) d.lerp(HOWLV[n], howl);
    if (hw > 0) { clipDir(B, C.hit, clamp01(1 - (s.hurt || 0)) * 0.99, n, _a); d.lerp(_a, hw); }
    if (rw > 0) d.lerp(REARV[n], rw);
    d.normalize();
    B.dir[n].lerp(d, k).normalize();
  }
  lift = clipLift(C.idle, B.idlePh) * (1 - mw) + (clipLift(C.walk, B.walkPh) * (1 - gw) + clipLift(C.gallop, B.walkPh) * gw) * mw;
  if (aw > 0) lift += ((abs ? 0 : clipLift(clip, atk)) - lift) * aw;
  lift *= 1 - rw;
  B.lift += (lift - B.lift) * k;
  // aim each bone, parents first: its local turn takes its rest direction to the aimed one in the parent's frame
  for (const n of BONES) {
    const p = PARENT[n], pw = p ? B.world[p] : _q2.identity();
    _a.copy(B.dir[n]).applyQuaternion(_q.copy(pw).invert());
    b[n].quaternion.setFromUnitVectors(B.rest[n], _a);
    B.world[n].copy(pw).multiply(b[n].quaternion);
  }
  // the hips pivot: the hind hips stay over the hind feet at the clip's height
  _hip.copy(B.hip).applyQuaternion(B.world.body);
  // a pounce carries it forward onto its prey: out to the bite, back over the landing
  // (the clip's own rise is small for a wolf in place: the leap adds an arc that peaks just before the bite)
  const pj = !P && B.clip === 'jump' && aw > 0, lunge = pj ? 1.3 * B.legLen * (atk < hitAt ? Math.sin(0.5 * Math.PI * Math.max(0, atk - 0.3) / (hitAt - 0.3)) : 1 - (atk - hitAt) / (1 - hitAt)) : 0;
  const leap = P ? P.leap || 0 : pj ? 0.75 * B.legLen * Math.sin(Math.PI * clamp01((atk - 0.3) / 0.62)) : 0;
  b.body.position.set(B.restBody.x + B.hip.x - _hip.x, B.restBody.y + B.hip.y - _hip.y + B.lift * B.legLen + leap, B.restBody.z + B.hip.z - _hip.z + lunge);
  // the jaw opens on the bite, the swipe's roar, the rear's roar and the howl
  if (b.jaw) b.jaw.rotation.x = 0.45 * Math.max(aw * Math.sin(Math.PI * clamp01((atk - hitAt + 0.12) / 0.4)), rw * (0.7 + 0.3 * Math.sin(time * 30)), howl * (0.75 + 0.25 * Math.sin(time * 9)));
}
