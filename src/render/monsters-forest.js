// Forest monsters from the owner's sheet (docs/reference/forest-*.png; the Meshy models in
// assets/meshy/forest, prepared for the game with scripts/prep-monster-glb.py and weighted by
// data/models.json). Their attacks follow docs/MONSTER-ATTACKS.md: the body's pose tells each one.
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
import FOX_CLIPS from '../../data/beast-clips-fox.json';

const FOX = clipSet(FOX_CLIPS);
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
  rig.pose = { clip: 'attack', u: 0, w: 0, leap: 0 };
  return rig;
}

/** Turn bone b by Euler (x, y, z) on top of its pose. */
const nudge = (b, x, y, z) => { _q.setFromEuler(_e.set(x, y, z)); b.quaternion.multiply(_q); };

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
  animBeast(r, s, dt, time, { set: FOX, stride: 2.0, gallopFrom: 3, gallopFull: 5 });
  const b = r.bones;
  if (twist) nudge(b.chest, 0, twist, 0);
  if (tailSide || tailUp) nudge(b.tail, tailUp, 0, tailSide);
  if (headUp) nudge(b.head, -headUp, Math.sin(time * 1.3) * 0.04 * earPrick, 0.12 * earPrick);
}

export const FOREST_BUILDERS = {
  leaf_fox: [buildLeafFox, animLeafFox],
};
export const FOREST_SCALE = { leaf_fox: 1 };
