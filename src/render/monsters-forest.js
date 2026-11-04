// Forest monsters from the owner's sheet (docs/reference/forest-*.png; the Meshy models in
// assets/meshy/forest, prepared for the game with scripts/prep-monster-glb.py and weighted by
// data/models.json). Their attacks follow docs/MONSTER-ATTACKS.md: the body's pose tells each one.
//
// Leaf tanuki: the same bones, moved by the pack's Shiba Inu clips (the stockiest dog in it;
// data/beast-clips-shiba.json): it rears up to drum its belly (the beast animator's rear, as the bear), beating
// on each ring; it bows to pluck the leaf off its head, cocks a foreleg back and flings it; it whirls about in
// place before its doubles pop out of a puff of leaves.
//
// Stone pangolin: the same bones on a low, armoured body; it walks by the Shiba Inu clips (no free pangolin clip
// exists), its attacks are posed here: it rears and rakes with its digging claws, swings its tail round behind it
// without turning (head looking back over its shoulder), and for the roll it tucks its head in and its tail over
// into a ball that spins along the lane, bounces and rolls back, then uncurls wobbling.
//
// Leaf fox: the wolf rig's bones, moved by the CC0 Fox clips of Quaternius' Ultimate Animated Animals
// (data/beast-clips-fox.json, scripts/beast-clips/extract.mjs) - walk, gallop, idle, the bite, the leap and
// the head-low sniff - never guessed angles. Its kit's beats on top of them:
//   snap: the clip's bite with its strike on the rules' hit time;
//   gust: it twists away and lifts its leaf tail to one side (held), then whips the tail across as the leaves fly;
//   pounce (mousing): it crouches, freezes with its head up and ears pricked (the held pose the player reads),
//     then leaps in a high arc (the clip's leap) onto the marked spot; a miss leaves its nose stuck in the ground.
import * as THREE from 'three';
import { RigBuilder, clamp01 } from './rig.js';
import { animBeast, clipSet, HIT } from './beast-clips.js';
import { beastLife } from './beast-life.js';
import FOX_CLIPS from '../../data/beast-clips-fox.json';
import SHIBA_CLIPS from '../../data/beast-clips-shiba.json';

const FOX = clipSet(FOX_CLIPS), SHIBA = clipSet(SHIBA_CLIPS);
const sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const smooth = (x) => x * x * (3 - 2 * x);
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

function buildLeafFox() {
  // bones where the model's joints are (data/models.json leaf_fox segments, rig space after its 0.85 scale);
  // the parts are a stand-in until the model has loaded
  const C = { fur: '#e2602a', cream: '#f3eadb', dark: '#4a2420', leaf: '#e8a23a' };
  const rb = new RigBuilder({ outline: 0.02, darkness: 0.34 });
  rb.bone('body', 'root', [0, 0.573, -0.102]);
  rb.bone('chest', 'body', [0, 0.017, 0.357]);
  rb.bone('neck', 'chest', [0, 0.102, 0.187]);
  rb.bone('head', 'neck', [0, 0.068, 0.119]);
  rb.bone('jaw', 'head', [0, -0.102, 0.119]);
  rb.bone('tail', 'body', [0, 0.017, -0.17]);
  rb.add('body', sph(0.2).scale(0.9, 0.85, 1.6), C.fur, { pos: [0, 0, 0.12] });
  rb.add('chest', sph(0.15).scale(1, 1, 1.1), C.cream);
  rb.add('head', sph(0.13).scale(1, 0.9, 1.1), C.fur, { pos: [0, 0.03, 0.06] });
  rb.add('head', new THREE.ConeGeometry(0.06, 0.18, 6).rotateX(Math.PI / 2), C.cream, { pos: [0, -0.02, 0.2] });
  for (const s of [1, -1]) rb.add('head', new THREE.ConeGeometry(0.05, 0.18, 4), C.dark, { pos: [s * 0.07, 0.17, 0] });
  rb.add('tail', sph(0.2).scale(0.8, 1.4, 1.2), C.leaf, { pos: [0, 0.25, -0.28] });
  const legs = [['leg0', 'chest', [0.145, -0.153, 0.026], [0.017, -0.23, 0.059]], ['leg1', 'chest', [-0.145, -0.153, 0.085], [-0.025, -0.23, 0.085]],
    ['leg2', 'body', [0.145, -0.085, -0.153], [-0.043, -0.281, -0.043]], ['leg3', 'body', [-0.17, -0.085, -0.11], [-0.051, -0.281, 0.094]]];
  for (const [n, parent, at, knee] of legs) {
    rb.bone(n, parent, at);
    rb.bone(n + 'k', n, knee);
    rb.add(n, new THREE.CylinderGeometry(0.04, 0.035, 0.24, 6).translate(0, -0.12, 0), C.fur);
    rb.add(n + 'k', new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6).translate(0, -0.1, 0), C.dark);
  }
  const rig = rb.build();
  rig.height = 1.2;
  rig.faceMove = true; // circling, its body turns along its path (monster-views.js)
  rig.pose = { clip: 'attack', u: 0, w: 0, leap: 0 };
  return rig;
}

/** Turn bone b by Euler (x, y, z) on top of its pose. */
const nudge = (b, x, y, z) => { _q.setFromEuler(_e.set(x, y, z)); b.quaternion.multiply(_q); };
// how much it is walking (0..1, eased in and out) and where it is in its step cycle (0..1)
// an attack's offset eased toward its value (about 0.05 s), so a pose never snaps back in one frame when a state
// ends (owner, 2026-11-04: "it stutters"; a foreleg used to jump 75 degrees in a frame as an attack ended)
// (a critically damped follow, so it also starts moving smoothly rather than with a jump; quick into an attack's
// pose so a strike stays sharp, gentler back out of it)
function sm(r, key, v, dt) {
  const e = (r.eased ||= {}), x = e[key] ?? v, vel = e[key + 'v'] || 0, w = Math.abs(v) < Math.abs(x) ? 16 : 34;
  const step = Math.min(dt, 0.05), nv = (vel + w * w * (v - x) * step) / (1 + 2 * w * step); // implicit damping: stable
  e[key + 'v'] = nv;
  return (e[key] = x + nv * step);
}
// the head and neck turned toward its prey (state.lookYaw, from the body's facing), as when it circles it
// (k: how free it is of an attack's pose, eased, so the head does not snap round as an attack starts or ends)
function watchPrey(b, s, k) { if (k > 0.001 && s.lookYaw) { nudge(b.neck, 0, s.lookYaw * 0.55 * k, 0); nudge(b.head, 0, s.lookYaw * 0.45 * k, 0); } }
function walking(r, s, pose, dt) {
  const want = !pose && s.moving && s.state !== 'windup' ? clamp01((s.smoothSpeed ?? s.speed ?? 0) / 0.6) : 0;
  r.walkW = (r.walkW || 0) + (want - (r.walkW || 0)) * (1 - Math.exp(-dt * 10));
  return [r.walkW, r.beast?.walkPh || 0]; // the cycle as a share, 0..1 (beast-life.js reads it so; it was once
  // passed in radians, which ran the spine swing and dips six times too fast - the shaking the owner saw)
}

function animLeafFox(r, s, dt, time) {
  const a = s.attack, P = r.pose, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  let pose = null, twist = 0, tailSide = 0, tailUp = 0, headUp = 0, earPrick = 0;
  const bite = HIT.attack; // the clip's teeth meet at this phase
  if (s.windup === 'snap') {
    // the bite drawn back over the wind-up, to just before the teeth meet
    pose = { clip: 'attack', u: (bite - 0.06) * smooth(k), w: 1 };
  } else if (s.state === 'act' && s.lastAttack === 'snap') {
    // the strike lands on the rules' hit time, then the clip's follow-through
    const h = s.hitTime || 0.1, t = s.actT;
    pose = { clip: 'attack', u: t < h ? bite - 0.06 + 0.06 * (t / h) : bite + (1 - bite) * 0.55 * clamp01((t - h) / Math.max(0.05, (s.actionTotal || 0.32) - h)), w: 1 };
  } else if (s.state === 'recover' && s.lastAttack === 'snap') {
    const u = bite + (1 - bite) * (0.55 + 0.45 * clamp01(s.actT / 0.35));
    pose = { clip: 'attack', u, w: clamp01((1 - u) * 8) };
  } else if (s.windup === 'gust') {
    // it twists away from its prey and lifts the leaf tail high to one side; held at the top
    const g = smooth(clamp01(k / 0.7));
    twist = -0.45 * g; tailSide = 1.1 * g; tailUp = -0.7 * g;
    pose = { clip: 'hit', u: 0.3 * g, w: 0.5 * g };
  } else if (s.state === 'recover' && s.lastAttack === 'gust') {
    // the whip: the tail swings across in a beat, the body turns through, then settles
    const t = s.actT, snap = clamp01(t / 0.1), back = clamp01((t - 0.25) / 0.4);
    twist = (-0.45 + 0.75 * smooth(snap)) * (1 - back);
    tailSide = (1.1 - 2.3 * smooth(snap)) * (1 - back);
    tailUp = (-0.7 + 0.4 * snap) * (1 - back);
  } else if (s.windup === 'pounce') {
    // mousing: a crouch, then a frozen listen (head up, ears pricked, still), then a last dip before the leap
    const crouch = smooth(clamp01(k / 0.3)), dip = smooth(clamp01((k - 0.82) / 0.18));
    pose = { clip: 'jump', u: 0.22 * crouch + 0.08 * dip, w: 1 };
    headUp = 0.35 * crouch * (1 - dip);
    earPrick = crouch;
  } else if (s.state === 'act' && s.lastAttack === 'pounce') {
    // the leap: the clip's jump from take-off to landing over the rules' air time, high in the middle
    const air = clamp01(s.actT / ((a?.air) || 0.55));
    pose = { clip: 'jump', u: 0.3 + 0.6 * air, w: 1, leap: 0.95 * Math.sin(Math.PI * air) };
  } else if (s.state === 'recover' && s.lastAttack === 'pounce') {
    pose = { clip: 'jump', u: 0.9 + 0.09 * clamp01(s.actT / 0.3), w: clamp01(1 - s.actT / 0.4) };
  } else if (s.state === 'stunned' && s.lastAttack === 'pounce') {
    // missed: its nose stuck in the ground, the head-low clip, a wag of the tail as it pulls free
    pose = { clip: 'headlow', u: (time * 0.5) % 1, w: clamp01(Math.min(s.actT * 6, (s.actionTotal - s.actT) * 4)) };
    tailSide = Math.sin(time * 9) * 0.3;
  }
  if (pose) Object.assign(P, { leap: 0 }, pose);
  s.pose = pose ? P : null;
  animBeast(r, s, dt, time, { set: FOX, stride: 2.0, gallopFrom: 3, gallopFull: 5, reverse: true });
  const free = sm(r, 'free', pose ? 0 : 1, dt);
  watchPrey(r.bones, s, free);
  { const [w, ph] = walking(r, s, pose, dt); beastLife(r, s, dt, w, ph, { gain: free }); } // spine swing, follow-through
  const b = r.bones;
  twist = sm(r, 'twist', twist, dt); tailSide = sm(r, 'tailSide', tailSide, dt); tailUp = sm(r, 'tailUp', tailUp, dt);
  headUp = sm(r, 'headUp', headUp, dt); earPrick = sm(r, 'earPrick', earPrick, dt);
  if (twist) nudge(b.chest, 0, twist, 0);
  if (tailSide || tailUp) nudge(b.tail, tailUp, 0, tailSide);
  if (headUp) nudge(b.head, -headUp, Math.sin(time * 1.3) * 0.04 * earPrick, 0.12 * earPrick);
}

function buildLeafTanuki() {
  // bones at the model's joints (data/models.json leaf_tanuki, rig space after its 0.85 scale)
  const C = { fur: '#8a6648', cream: '#efe2c8', dark: '#3a2a20', leaf: '#6aa04a' };
  const rb = new RigBuilder({ outline: 0.02, darkness: 0.34 });
  rb.bone('body', 'root', [0, 0.405, -0.1275]);
  rb.bone('chest', 'body', [0, 0.043, 0.425]);
  rb.bone('neck', 'chest', [0, 0.042, 0.17]);
  rb.bone('head', 'neck', [0, 0.043, 0.1275]);
  rb.bone('jaw', 'head', [0, -0.187, 0.136]);
  rb.bone('tail', 'body', [0, 0.043, -0.2125]);
  rb.add('body', sph(0.32).scale(1.1, 0.9, 1.2), C.fur, { pos: [0, 0.02, 0.15] });
  rb.add('head', sph(0.24).scale(1.3, 1, 1), C.fur, { pos: [0, 0.05, 0.08] });
  rb.add('head', sph(0.1).scale(1.2, 0.8, 1), C.cream, { pos: [0, -0.04, 0.24] });
  rb.add('head', sph(0.08).scale(1.2, 0.4, 1.4), C.leaf, { pos: [0, 0.28, 0.06] });
  rb.add('tail', sph(0.2).scale(1, 1.3, 1.6), C.dark, { pos: [0, 0.18, -0.2] });
  const legs = [['leg0', 'chest', [0.255, -0.102, 0.2125], [0, -0.1105, 0.068]], ['leg1', 'chest', [-0.255, -0.102, 0.2125], [0, -0.1105, 0.068]],
    ['leg2', 'body', [0.2805, -0.0845, 0], [0.0255, -0.1705, -0.0255]], ['leg3', 'body', [-0.2805, -0.0845, 0], [-0.0255, -0.1705, -0.0255]]];
  for (const [n, parent, at, knee] of legs) {
    rb.bone(n, parent, at);
    rb.bone(n + 'k', n, knee);
    rb.add(n, new THREE.CylinderGeometry(0.06, 0.05, 0.16, 6).translate(0, -0.08, 0), C.dark);
    rb.add(n + 'k', new THREE.CylinderGeometry(0.05, 0.05, 0.14, 6).translate(0, -0.07, 0), C.dark);
  }
  const rig = rb.build();
  rig.height = 0.95;
  rig.pose = { clip: 'attack', u: 0, w: 0, leap: 0 };
  rig.faceMove = true; // circling, its body turns along its path (monster-views.js)
  return rig;
}

function animLeafTanuki(r, s, dt, time) {
  const a = s.attack, P = r.pose, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  let pose = null, belly = 1, arm = 0, armSide = 0, head = 0, spin = 0, drumHit = 0;
  s.standT = 0;
  if (s.windup === 'drum' || (s.state === 'recover' && s.lastAttack === 'drum' && a?.beats)) {
    // it rears onto its hind legs and drums its belly: swelling through the wind-up, a beat on each ring
    const total = a.windup + a.beats * a.beat + 0.25, t = s.windup ? s.windupT : a.windup + s.actT;
    s.standTotal = total; s.standT = Math.max(0, total - t);
    pose = { clip: 'idle', u: 0, w: 0 }; // no bite clip under the rear
    if (s.windup) { belly = 1 + 0.12 * smooth(k); arm = -0.9 * smooth(k); }
    else {
      const b = s.actT / a.beat, ph = b - Math.floor(b), on = s.actT < a.beats * a.beat ? Math.max(0, 1 - ph * 5) : 0;
      drumHit = on; belly = 1 + 0.12 * (1 - on) - 0.1 * on; arm = -0.9 + 1.0 * on;
    }
  } else if (s.windup === 'boomerang') {
    // it bows to pluck the leaf off its head, then rears a little with a foreleg cocked back to throw
    const pluck = smooth(clamp01(k / 0.45)), cock = smooth(clamp01((k - 0.45) / 0.45));
    head = 0.35 * pluck * (1 - cock) - 0.15 * cock;
    arm = -2.0 * pluck * (1 - cock) - 1.6 * cock; armSide = -0.4 * cock;
    pose = { clip: 'attack', u: 0.1 * cock, w: 0.6 * cock };
  } else if (s.state === 'recover' && s.lastAttack === 'boomerang') {
    // the fling: the foreleg snaps forward across, then settles
    const t = clamp01(s.actT / 0.12), back = clamp01((s.actT - 0.2) / 0.3);
    arm = (-1.6 + 2.4 * smooth(t)) * (1 - back); armSide = (-0.4 + 0.8 * t) * (1 - back);
    pose = { clip: 'attack', u: 0.42 + 0.3 * t, w: 0.8 * (1 - back) };
  } else if (s.windup === 'doubles') {
    // paws together, then a whirl in place as the puff comes
    arm = -1.2 * smooth(clamp01(k / 0.3)); armSide = 0.5 * smooth(clamp01(k / 0.3));
    spin = Math.PI * 2 * smooth(clamp01((k - 0.55) / 0.45));
    pose = { clip: 'idle', u: 0, w: 0 };
  }
  if (pose) Object.assign(P, { leap: 0 }, pose);
  s.pose = pose ? P : null;
  // The walk (owner, 2026-11-04: "the walk and its rhythm are very bad"). Circling its prey, the rules keep it
  // facing the prey, so the forward walk slid sideways: now its body turns along its path (rig.faceMove,
  // monster-views.js) and its head watches the prey; backing off, the walk runs backwards. Its feet stay planted:
  // the clip's walk at its own stride (about 1.6 steps a second as it circles), a bounding run only when it
  // hurries in. Over it only follow-through on the clip's own beat: the belly bounces on the footfalls, the tail
  // sways a beat late.
  animBeast(r, s, dt, time, { set: SHIBA, stride: 1.6, gallopFrom: 1.5, gallopFull: 2.1, gallopStride: 2.0, rate: 1.1, rear: true, reverse: true });
  const b = r.bones;
  const free = sm(r, 'free', pose ? 0 : 1, dt);
  watchPrey(b, s, free);
  const [w, ph] = walking(r, s, pose, dt);
  // the spine swing, the footfall dips and the head and big tail following a beat late (beast-life.js); the
  // round belly bounces on the footfalls
  beastLife(r, s, dt, w, ph, { spine: 1.1, dip: 1.2, head: 1.2, tail: 1.5, gain: free });
  // (no belly bounce: its squash and stretch with each step read as an inchworm)
  belly = sm(r, 'belly', belly, dt); arm = sm(r, 'arm', arm, dt); armSide = sm(r, 'armSide', armSide, dt); head = sm(r, 'head', head, dt);
  b.chest.scale.set(belly, 1 / Math.sqrt(belly), belly);
  if (arm || armSide) { nudge(b.leg0, arm, 0, armSide); nudge(b.leg1, s.windup === 'boomerang' || s.lastAttack === 'boomerang' ? arm * 0.25 : arm, 0, -armSide); }
  if (head) nudge(b.head, head, 0, 0);
  if (spin) nudge(b.body, 0, spin, 0);
  r.drumHit = drumHit;
}

function buildStonePangolin() {
  // bones at the model's joints (data/models.json stone_pangolin, rig space after its 0.9 scale)
  const C = { stone: '#d8c8a4', dark: '#5a4a38', moss: '#7c9a4a' };
  const rb = new RigBuilder({ outline: 0.022, darkness: 0.34 });
  rb.bone('body', 'root', [0, 0.421, 0]);
  rb.bone('chest', 'body', [0, -0.045, 0.405]);
  rb.bone('neck', 'chest', [0, -0.045, 0.153]);
  rb.bone('head', 'neck', [0, -0.018, 0.117]);
  rb.bone('tail', 'body', [0, -0.045, -0.315]);
  rb.add('body', sph(0.42).scale(1.2, 0.85, 1.4), C.stone, { pos: [0, 0.05, 0] });
  rb.add('chest', sph(0.26).scale(1.1, 0.8, 1), C.stone);
  rb.add('head', new THREE.ConeGeometry(0.14, 0.32, 6).rotateX(Math.PI / 2), C.stone, { pos: [0, 0, 0.12] });
  rb.add('tail', new THREE.ConeGeometry(0.22, 0.6, 6).rotateX(-Math.PI / 2), C.stone, { pos: [0, -0.12, -0.3] });
  // the curled ball it rolls as, kept beside the model (data/models.json keep). Owner, 2026-11-04: the first ball
  // (14 plates) looked bare. Now it wears the walking body's armour: rows of round, domed stone plates of
  // varied size with dark skin showing between them (each plate outlined like the body's), a few mossy and
  // weathered ones, and the tail curled round the outside as a ridge of bigger plates.
  rb.bone('ball', 'root', [0, 0.5, 0]);
  rb.add('ball', new THREE.IcosahedronGeometry(0.4, 2), C.dark);
  const tones = [C.stone, '#cbb78e', '#e4d6b4', '#b9a37c'];
  const t = new THREE.Vector3(), bt = new THREE.Vector3(), n = new THREE.Vector3(), M = new THREE.Matrix4();
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  // a domed plate facing out along n (lat from the rolling axis' equator, phi round it), at radius R
  const plate = (lat, phi, size, R, color) => {
    n.set(Math.sin(lat), Math.cos(lat) * Math.cos(phi), Math.cos(lat) * Math.sin(phi));
    t.set(0, -Math.sin(phi), Math.cos(phi)); bt.crossVectors(n, t);
    const g = sph(size, 7, 4).scale(1, 0.92, 0.5).applyMatrix4(M.makeBasis(t, bt, n));
    rb.add('ball', g, color, { pos: [n.x * R, n.y * R, n.z * R] });
  };
  // rings round the rolling axis (x), spaced so the dark skin shows between the plates
  let k = 0;
  for (let row = 0; row < 9; row++) {
    const lat = -1.32 + (row / 8) * 2.64, ring = Math.cos(lat), count = Math.max(4, Math.floor((Math.PI * 2 * 0.41 * ring) / 0.225));
    for (let i = 0; i < count; i++, k++) {
      const phi = ((i + (row % 2) * 0.5 + hash(k) * 0.2) / count) * Math.PI * 2, size = (0.082 + 0.03 * hash(k + 50)) * (0.75 + 0.25 * ring);
      plate(lat + (hash(k + 90) - 0.5) * 0.08, phi, size, 0.41, k % 13 === 5 ? C.moss : tones[Math.floor(hash(k + 7) * tones.length)]);
    }
  }
  // the tail wrapped round the outside: a ridge of larger plates over one side, narrowing to its tip
  for (let i = 0; i < 8; i++) plate(0.5 - i * 0.03, -0.3 + i * 0.4, 0.13 - i * 0.008, 0.46, i === 2 ? C.moss : tones[i % 2]);
  const legs = [['leg0', 'chest', [0.198, -0.09, 0.153], [0.018, -0.117, 0.09]], ['leg1', 'chest', [-0.198, -0.09, 0.153], [-0.018, -0.117, 0.09]],
    ['leg2', 'body', [0.315, -0.09, 0.09], [0.09, -0.162, 0.018]], ['leg3', 'body', [-0.315, -0.09, 0.09], [-0.09, -0.162, 0.018]]];
  for (const [n, parent, at, knee] of legs) {
    rb.bone(n, parent, at);
    rb.bone(n + 'k', n, knee);
    rb.add(n, new THREE.CylinderGeometry(0.07, 0.06, 0.14, 6).translate(0, -0.07, 0), C.dark);
    rb.add(n + 'k', new THREE.ConeGeometry(0.06, 0.14, 5).translate(0, -0.07, 0.04), C.dark);
  }
  const rig = rb.build();
  rig.bones.ball.visible = false; // only while curled
  rig.faceMove = true;
  rig.height = 0.85;
  rig.pose = { clip: 'attack', u: 0, w: 0, leap: 0 };
  rig.spin = 0;
  return rig;
}

function animStonePangolin(r, s, dt, time) {
  const a = s.attack, P = r.pose, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  let pose = null, rear = 0, claw = 0, clawA = 0, clawB = 0, tailSwing = 0, look = 0, curl = 0, roll = false, wobble = 0;
  if (s.windup === 'rake') {
    // up on its hind legs, the digging claws raised
    rear = 0.5 * smooth(k); claw = -1.5 * smooth(k);
    pose = { clip: 'idle', u: 0, w: 0 };
  } else if (s.state === 'act' && s.lastAttack === 'rake') {
    // two rakes down across, right then left, on the rules' hit times
    const h = a?.hits || [{ at: 0.12 }, { at: 0.3 }], t = s.actT;
    const one = smooth(clamp01(t / h[0].at)), two = smooth(clamp01((t - h[0].at) / (h[1].at - h[0].at)));
    rear = 0.5 - 0.35 * one;
    clawA = -1.5 + 1.9 * one; clawB = -1.5 + 1.9 * two; // the right claw rakes on the first hit, the left on the second
    pose = { clip: 'idle', u: 0, w: 0 };
  } else if (s.windup === 'tail') {
    // it looks back over its shoulder and draws the tail round to the other side
    look = 1.1 * smooth(k); tailSwing = -0.9 * smooth(k);
    pose = { clip: 'idle', u: 0, w: 0 };
  } else if ((s.state === 'act' || s.state === 'recover') && s.lastAttack === 'tail') {
    const t = s.state === 'act' ? s.actT : 0.45 + s.actT, sw = smooth(clamp01(t / 0.15)), back = clamp01((t - 0.45) / 0.4);
    look = 1.1 * (1 - back); tailSwing = (-0.9 + 2.2 * sw) * (1 - back);
    pose = { clip: 'idle', u: 0, w: 0 };
  } else if (s.windup === 'roll') {
    // it tucks into a ball, rocking on the spot as it winds up
    curl = smooth(clamp01(k / 0.6)); wobble = Math.sin(time * 18) * 0.12 * clamp01((k - 0.6) / 0.4);
    pose = { clip: 'idle', u: 0, w: 0 };
  } else if (s.state === 'act' && s.lastAttack === 'roll') {
    curl = 1; roll = true;
    pose = { clip: 'idle', u: 0, w: 0 };
  } else if (s.state === 'stunned' && s.lastAttack === 'roll') {
    // uncurling, dizzy: it sways and its head lolls
    curl = clamp01(1 - (s.actT - 0.25) / 0.35); wobble = Math.sin(time * 9) * 0.18;
  }
  if (pose) Object.assign(P, { leap: 0 }, pose);
  s.pose = pose ? P : null;
  s.standT = 0;
  // The walk (owner, 2026-11-04: "the walk and its rhythm are very bad"): a long stride faster than its feet
  // could step made them skate. Now it walks slowly (data speed 1.6: it closes in by rolling), its feet planted at
  // the clip's own stride (about 2.5 steps a second); a heavy posture on top - the back arched and the nose low,
  // the tail held up, the front claws curled under so it walks on its knuckles - and only the head swinging once a
  // cycle as it sniffs, with the beat of the clip.
  animBeast(r, s, dt, time, { set: SHIBA, stride: 1.9, gallopFrom: 99, gallopFull: 100, rate: 0.85, reverse: true });
  const b = r.bones;
  const free = sm(r, 'free', pose ? 0 : 1, dt);
  watchPrey(b, s, free);
  const [w, ph] = walking(r, s, pose, dt);
  if (w > 0.01) {
    nudge(b.body, 0.05 * w, 0, 0);
    nudge(b.chest, 0.08 * w, 0, 0);
    nudge(b.neck, 0.1 * w, 0, 0);
    nudge(b.head, 0.06 * w, 0, 0);
    nudge(b.tail, -0.2 * w, 0, 0);
    nudge(b.leg0k, 0.6 * w, 0, 0); nudge(b.leg1k, 0.6 * w, 0, 0);
  }
  // heavy: a slower spine swing, deeper dips on each footfall, the head and armoured tail following late
  beastLife(r, s, dt, w, ph, { spine: 0.8, dip: 1.5, head: 1.0, tail: 0.8, gain: free });
  rear = sm(r, 'rear', rear, dt); claw = sm(r, 'claw', claw, dt); clawA = sm(r, 'clawA', clawA, dt); clawB = sm(r, 'clawB', clawB, dt);
  look = sm(r, 'look', look, dt); tailSwing = sm(r, 'tailSwing', tailSwing, dt); curl = sm(r, 'curl', curl, dt);
  if (rear) nudge(b.body, -rear, 0, 0);
  if (claw) { nudge(b.leg0, claw, 0, -0.2); nudge(b.leg1, claw, 0, 0.2); }
  if (clawA || clawB) { nudge(b.leg0, clawA, 0, -0.3 * (1 - clawA)); nudge(b.leg1, clawB, 0, 0.3 * (1 - clawB)); }
  if (look) { nudge(b.neck, 0, look * 0.6, 0); nudge(b.head, 0, look * 0.6, 0); nudge(b.chest, 0, look * 0.3, 0); }
  if (tailSwing) nudge(b.tail, -0.3 * Math.abs(tailSwing), tailSwing, 0);
  if (curl) {
    // a ball: head and chest tucked down and under, the tail up and over, legs drawn in
    nudge(b.chest, 0.9 * curl, 0, 0); nudge(b.neck, 0.8 * curl, 0, 0); nudge(b.head, 0.9 * curl, 0, 0);
    nudge(b.tail, -1.6 * curl, 0, 0);
    for (const n of ['leg0', 'leg1', 'leg2', 'leg3']) nudge(b[n], (n < 'leg2' ? 1.2 : -1.2) * curl, 0, 0);
  }
  // fully curled it is the ball (the model drawn in to nothing), spinning about its middle as it rolls
  const ballK = clamp01((curl - 0.75) / 0.25);
  r.spin = roll ? r.spin + dt * 16 : r.spin;
  b.ball.visible = ballK > 0;
  b.ball.scale.setScalar(Math.max(0.001, ballK * (1 + 0.15 * Math.sin(ballK * Math.PI))));
  b.ball.rotation.set(r.spin, 0, wobble);
  b.ball.position.y = 0.5 + Math.abs(Math.sin(r.spin * 2)) * 0.04 * (roll ? 1 : 0);
  // set every frame: the body comes back to full size the moment it uncurls
  b.body.scale.setScalar(ballK > 0.5 ? 0.001 : 1);
  if (ballK <= 0.5 && wobble) nudge(b.body, 0, 0, wobble);
  b.body.position.y += 0.08 * curl;
}

export const FOREST_BUILDERS = {
  leaf_fox: [buildLeafFox, animLeafFox],
  leaf_tanuki: [buildLeafTanuki, animLeafTanuki],
  stone_pangolin: [buildStonePangolin, animStonePangolin],
};
export const FOREST_SCALE = { leaf_fox: 1, leaf_tanuki: 1, stone_pangolin: 1 };
