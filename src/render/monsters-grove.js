// Moonroot Grove monsters (levels 6-10), built from the owner's concept sheets
// (assets/moonroot/*_concept.jpg). Each body shows the part it drops - leaf ears, glass wings,
// ivory digging claws - and each wind-up is a pose readable from the game camera: a hare that
// rears on its hind legs or crouches to leap, a moth that spreads its mirror wings still, a mole
// that raises a claw or sinks into the ground. Same rig/cel rules as monsters.js; no per-frame
// allocations.
import * as THREE from 'three';
import { RigBuilder, damp, clamp01 } from './rig.js';

const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const windK = (s) => (s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0);

// ---------- fern-ear hare: cream fur, moss-green back, two big fern-leaf ears ----------

function leaf(rb, bone, len, width, colors, o = {}) {
  // a fern leaf: a cream blade with a green inner leaf and two side lobes
  const [cream, green] = colors;
  rb.add(bone, sph(0.5, 10, 8).scale(width, len, 0.16).translate(0, len * 0.5, 0), cream, o);
  rb.add(bone, sph(0.5, 10, 8).scale(width * 0.62, len * 0.78, 0.1).translate(0, len * 0.52, 0.035), green, { ...o, plain: true });
  for (const [s, y] of [[1, 0.42], [-1, 0.42], [1, 0.66], [-1, 0.66]]) {
    rb.add(bone, sph(0.5, 8, 6).scale(width * 0.5, len * 0.28, 0.1).translate(s * width * 0.42, len * y, 0.01), green, { ...o, plain: true, rot: [0, 0, -s * 0.5] });
  }
}

function buildHare() {
  const C = { fur: '#efe5d2', shade: '#d9cbb2', moss: '#6f8f58', mossDark: '#58744a', eye: '#f0a93a', nose: '#e7a0a2', tooth: '#fffaf0', paw: '#8a7a6a' };
  const rb = new RigBuilder({ outline: 0.02, darkness: 0.34 });
  rb.bone('body', 'root', [0, 0.44, 0]);
  rb.bone('head', 'body', [0, 0.2, 0.34]);
  // body: a round haunch behind a slimmer chest; the green back runs from neck to tail
  rb.add('body', sph(0.36, 14, 10).scale(0.9, 0.82, 1.25), C.fur, { pos: [0, 0, -0.05] });
  rb.add('body', sph(0.33, 12, 8).scale(0.86, 0.5, 1.15), C.moss, { pos: [0, 0.14, -0.06] });
  rb.add('body', sph(0.24, 10, 8).scale(1, 1, 1), C.fur, { pos: [0, 0.03, 0.24] });
  // tail: a small fern tuft
  rb.bone('tail', 'body', [0, 0.12, -0.48]);
  leaf(rb, 'tail', 0.3, 0.2, [C.fur, C.moss], { rot: [-2.1, 0, 0] });
  // head: round, a leafy ruff on the cheeks, buck teeth, amber eyes
  rb.add('head', sph(0.2, 12, 10).scale(1, 0.92, 1.05), C.fur);
  rb.add('head', sph(0.11, 8, 6).scale(1.2, 0.8, 1), C.fur, { pos: [0, -0.06, 0.15] });
  rb.add('head', sph(0.03, 6, 4), C.nose, { pos: [0, -0.02, 0.24], plain: true });
  rb.add('head', new THREE.BoxGeometry(0.06, 0.05, 0.02), C.tooth, { pos: [0, -0.12, 0.2], plain: true });
  rb.add('head', sph(0.12, 8, 6).scale(0.8, 0.35, 0.8), C.moss, { pos: [0, 0.17, 0.02], plain: true });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.045, 8, 6).scale(1, 1.15, 0.7), C.eye, { pos: [s * 0.1, 0.03, 0.15], glow: true });
    rb.add('head', sph(0.02, 6, 4), '#2a2018', { pos: [s * 0.105, 0.03, 0.18], plain: true });
    for (let i = 0; i < 3; i++) rb.add('head', sph(0.5, 6, 4).scale(0.07, 0.13, 0.04), C.moss, { pos: [s * (0.17 + i * 0.02), -0.06 - i * 0.02, 0.06], rot: [0, 0, s * (1.2 + i * 0.3)], plain: true });
  }
  // ears: two tall fern leaves, the part the hare drops
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`ear${n}`, 'head', [s * 0.08, 0.14, -0.02], [-0.25, 0, -s * 0.22]);
    leaf(rb, `ear${n}`, 0.62, 0.24, [C.fur, C.moss]);
  }
  // legs: slim forelegs, big hind thighs
  const legs = [];
  for (const [z, y, s, big] of [[0.26, -0.08, 1, 0], [0.26, -0.08, -1, 0], [-0.24, -0.02, 1, 1], [-0.24, -0.02, -1, 1]]) {
    const n = `leg${legs.length}`;
    rb.bone(n, 'body', [s * 0.15, y, z]);
    if (big) rb.add(n, sph(0.16, 10, 8).scale(0.7, 1, 1.2), C.fur, { pos: [0, -0.06, 0] });
    rb.add(n, new THREE.CylinderGeometry(0.045, 0.038, 0.32, 6).translate(0, -0.16, 0), C.fur, { pos: [0, big ? -0.08 : 0, 0] });
    rb.add(n, sph(0.06, 8, 6).scale(1, 0.55, big ? 1.8 : 1.3), C.shade, { pos: [0, big ? -0.4 : -0.32, 0.04] });
    legs.push(n);
  }
  const rig = rb.build();
  rig.legs = legs;
  rig.height = 1.15;
  return rig;
}

const hease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** A jab's reach at time t for a contact at `at` (0 cocked .. 1 out, past 1 the overshoot): a snap in, a short hold, a slower return. */
function jab(t, at) {
  if (t < at - 0.055) return 0;
  if (t < at) return hease((t - (at - 0.055)) / 0.055);
  if (t < at + 0.03) return 1 + 0.15 * hease((t - at) / 0.03);
  if (t < at + 0.06) return 1.15 - 0.15 * hease((t - at - 0.03) / 0.03);
  return 1 - hease((t - at - 0.06) / 0.09);
}
const HIP_Y = -0.12, HIP_Z = -0.3; // the hind hips in the body's space: a rear-up turns the body about them

function animHare(r, s, dt, time) {
  const b = r.bones, k = windK(s), t = s.actT || 0, a = s.attack;
  // Running: the bounding gait the owner preferred (2026-11-05: "the old run was better"), restored as it was: the
  // whole body arcs on each hop at a steady beat while it moves.
  r.phase = (r.phase || 0) + dt * (s.moving ? 9 + s.speedFactor * 4 : 0);
  const w = (r.runW = damp(r.runW || 0, s.moving ? 1 : 0, 10, dt)), hop = Math.abs(Math.sin(r.phase));
  let lift = hop * 0.22 * w, pitch = -Math.cos(r.phase) * 0.18 * w, squash = 1;
  let foreL = Math.sin(r.phase) * 0.7 * w, foreR = foreL, hind = -Math.sin(r.phase) * 0.9 * w;
  let piv = 0, ears = Math.sin(time * 2.2 + r.seed) * 0.06 - 0.25 * w, earSplit = 0;
  let headX = 0, twist = 0, roll = 0, reachL = 1, reachR = 1, z = 0;
  if (s.windup === 'box') {
    // boxing: rears straight up on its haunches, forepaws raised in a guard, ears flat; a bob of the paws in the hold,
    // then it leans back to load the first jab
    const rise = hease(k / 0.4), load = hease((k - 0.78) / 0.22);
    pitch = -1.0 * rise - 0.14 * load; piv = 1;
    const bob = Math.sin(time * 17) * 0.12 * rise * (1 - load);
    foreL = -1.3 * rise + bob + 0.25 * load; foreR = -1.3 * rise - bob + 0.1 * load;
    hind = 0.25 * rise; ears = -0.75 * rise; headX = 0.2 * rise; twist = 0.18 * load; lift = -0.03 * rise;
  } else if (s.state === 'act' && s.lastAttack === 'box') {
    // one-two: each forepaw snaps straight out at its contact (the rules' hits), the body lunging and twisting into it
    const hits = a?.hits || [{ at: 0.1 }, { at: 0.24 }];
    const jL = jab(t, hits[0].at), jR = jab(t, hits[1]?.at ?? 0.24), j = Math.max(jL, jR);
    pitch = -1.14 + 0.5 * j; piv = 1; z = 0.09 * j;
    foreL = -1.25 + 0.65 * jL - 0.1 * jR; foreR = -1.25 + 0.65 * jR - 0.1 * jL; // the other paw stays up in the guard
    reachL = 1 + 0.35 * jL; reachR = 1 + 0.35 * jR;
    twist = 0.18 - 0.42 * jL + 0.42 * jR; hind = 0.25; ears = -0.8; headX = 0.25;
  } else if (s.state === 'recover' && s.lastAttack === 'box') {
    // the guard held a beat, then down onto all fours
    const down = hease((t - 0.12) / 0.3);
    pitch = -1.0 * (1 - down) + pitch * down; piv = 1 - down * w;
    foreL = -1.25 * (1 - down) + foreL * down; foreR = -1.25 * (1 - down) + foreR * down;
    hind = 0.25 * (1 - down) + hind * down; ears = -0.75 * (1 - down) + ears * down; twist = 0.1 * (1 - down);
  } else if (s.windup === 'thump') {
    // the warning thump: up on its haunches, forepaws tucked, ears straight up and still (the hold), a hop up off the
    // hind feet, then the whole body slams down on the wind-up's last beat
    const rise = hease(k / 0.4), pop = hease((k - 0.76) / 0.13), slam = hease((k - 0.9) / 0.1);
    pitch = -0.75 * rise - 0.12 * pop + 1.07 * slam; piv = 1;
    foreL = foreR = 0.45 * rise + 0.3 * pop - 0.2 * slam;
    hind = 0.1 * rise - 0.55 * pop + 0.75 * slam;
    lift = 0.16 * pop - 0.24 * slam; squash = 1 - 0.14 * slam;
    ears = 0.3 * rise - 0.4 * slam; headX = -0.15 * rise + 0.3 * slam;
    roll = Math.sin(time * 40) * 0.025 * rise * (1 - pop); // trembling with alarm through the hold
  } else if (s.state === 'recover' && s.lastAttack === 'thump') {
    // the slam pose held, then it rises back to stand
    const up = hease((t - 0.15) / 0.4);
    pitch = 0.2 * (1 - up) + pitch * up; piv = 1 - up;
    foreL = -0.2 * (1 - up) + foreL * up; foreR = -0.2 * (1 - up) + foreR * up; hind = 0.2 * (1 - up) + hind * up;
    lift = -0.08 * (1 - up); squash = 1 - 0.14 * (1 - hease(t / 0.15)) * (1 - up); ears = -0.1 * (1 - up) + ears * up;
  } else if (s.windup === 'hop') {
    // the leap: a deep crouch, rump low and hind feet coiled under it, ears laid back; a wiggle of the rump while it
    // aims; a last dip before it springs
    const crouch = hease(k / 0.35), aim = hease((k - 0.35) / 0.15) * (1 - hease((k - 0.85) / 0.1)), dip = hease((k - 0.88) / 0.12);
    pitch = -0.12 * crouch + 0.1 * dip; piv = 0.5;
    hind = -0.65 * crouch - 0.15 * dip; foreL = foreR = 0.25 * crouch + 0.2 * dip;
    lift = -0.12 * crouch - 0.05 * dip; squash = 1 - 0.1 * crouch;
    ears = -0.9 * crouch; headX = 0.12 * crouch; twist = Math.sin(time * 22) * 0.07 * aim;
  } else if (s.state === 'act' && s.lastAttack === 'hop') {
    // in the air over the rules' air time: stretched long, nose up off the ground and nose down onto the prey,
    // forepaws reaching, the hind feet swinging forward under it to land
    const c = clamp01(t / ((a?.air) || 0.35));
    pitch = -0.4 + 0.75 * c; piv = 0;
    lift = 1.1 * Math.sin(Math.PI * c);
    foreL = foreR = -1.1 + 0.8 * hease((c - 0.55) / 0.45);
    hind = 1.0 - 1.4 * hease((c - 0.6) / 0.4);
    ears = -1.0; squash = 1.04; headX = -0.15;
  } else if (s.state === 'recover' && s.lastAttack === 'hop') {
    // landed: a squash, then up
    const up = hease((t - 0.1) / 0.3);
    pitch = 0.22 * (1 - up) + pitch * up; lift = -0.1 * (1 - up); squash = 1 - 0.15 * (1 - up);
    foreL = foreR = 0.2 * (1 - up) + foreL * up; hind = -0.5 * (1 - up) + hind * up; ears = -0.6 * (1 - up) + ears * up;
  } else if (s.state === 'stunned') {
    headX = 0.4 + Math.sin(time * 9) * 0.1; ears = -0.9; roll = Math.sin(time * 5) * 0.08; lift = -0.06;
  }
  if (s.hurt > 0) { pitch -= 0.2 * s.hurt; ears -= 0.4 * s.hurt; }
  const fast = s.state === 'act' || s.windup === 'thump' || (s.state === 'recover' && t < 0.15);
  const rate = fast ? 40 : 12;
  b.body.rotation.x = damp(b.body.rotation.x, pitch, rate, dt);
  b.body.rotation.y = damp(b.body.rotation.y, twist, rate, dt);
  b.body.rotation.z = damp(b.body.rotation.z, roll, 20, dt);
  b.body.scale.y = damp(b.body.scale.y, squash, rate, dt);
  // a rear-up turns about the hind hips (piv), so the hind feet stay on the ground and the hind legs stay upright
  r.piv = damp(r.piv ?? 1, piv, 10, dt);
  const th = Math.min(0, b.body.rotation.x) * r.piv, cs = Math.cos(th), sn = Math.sin(th);
  r.lift = damp(r.lift || 0, lift, fast ? 40 : 14, dt);
  r.z = damp(r.z || 0, z, rate, dt);
  b.body.position.y = 0.44 + r.lift + (HIP_Y - (HIP_Y * cs - HIP_Z * sn));
  b.body.position.z = r.z + (HIP_Z - (HIP_Y * sn + HIP_Z * cs));
  b.head.rotation.x = damp(b.head.rotation.x, headX - 0.6 * Math.min(0, pitch), rate, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.7 - twist * 0.6, 5, dt);
  b.earL.rotation.x = damp(b.earL.rotation.x, -0.25 + ears + earSplit, 9, dt);
  b.earR.rotation.x = damp(b.earR.rotation.x, -0.25 + ears + Math.sin(time * 3.1) * 0.04, 9, dt);
  b.tail.rotation.y = Math.sin(time * 4 + r.seed) * 0.25;
  const legRate = fast ? 45 : 16;
  b[r.legs[0]].rotation.x = damp(b[r.legs[0]].rotation.x, foreL, legRate, dt);
  b[r.legs[1]].rotation.x = damp(b[r.legs[1]].rotation.x, foreR, legRate, dt);
  b[r.legs[0]].scale.y = damp(b[r.legs[0]].scale.y, reachL, legRate, dt);
  b[r.legs[1]].scale.y = damp(b[r.legs[1]].scale.y, reachR, legRate, dt);
  const hindX = hind - th;
  b[r.legs[2]].rotation.x = damp(b[r.legs[2]].rotation.x, hindX, legRate, dt);
  b[r.legs[3]].rotation.x = damp(b[r.legs[3]].rotation.x, hindX, legRate, dt);
}

// ---------- mirrorwing moth: a navy fuzzy body, cream ruff, four glass wings ----------

function wingShape(len, width, tip) {
  // a rounded wing: wide at the tip, narrow at the root (local +X outward, +Y forward)
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.3, width * 0.9, len * 0.85, width * (0.6 + tip), len, width * 0.15 + tip * width);
  s.bezierCurveTo(len * 1.02, -width * 0.25, len * 0.6, -width * 0.55, 0, -width * 0.12);
  return new THREE.ShapeGeometry(s, 8);
}

function buildMoth() {
  const C = { body: '#2d3266', dark: '#1f2348', ruff: '#efe6d2', glass: '#bfe9f5', glint: '#e9fbff', frame: '#2b2f62', eye: '#f2b33a' };
  const rb = new RigBuilder({ outline: 0.018, darkness: 0.36, rim: 0.5 });
  rb.bone('body', 'root', [0, 1.6, 0]);
  rb.bone('head', 'body', [0, 0.06, 0.26]);
  // body: a round fuzzy abdomen under a cream ruff
  rb.add('body', sph(0.24, 12, 10).scale(0.95, 0.95, 1.25), C.body, { pos: [0, -0.06, -0.12] });
  rb.add('body', sph(0.2, 12, 8).scale(1.15, 0.7, 0.9), C.ruff, { pos: [0, 0.04, 0.12] });
  for (let i = 0; i < 3; i++) rb.add('body', new THREE.TorusGeometry(0.2 - i * 0.03, 0.012, 4, 14).rotateX(Math.PI / 2), C.dark, { pos: [0, -0.06, -0.18 - i * 0.12], plain: true });
  // six thin legs hanging under the body
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) rb.add('body', new THREE.CylinderGeometry(0.012, 0.008, 0.32, 4).translate(0, -0.16, 0), C.dark, { pos: [s * 0.08, -0.16, 0.08 - i * 0.12], rot: [0.3, 0, s * 0.35], plain: true });
  // head: a dark mask, big amber eyes, two long feathered antennae
  rb.add('head', sph(0.13, 10, 8).scale(1.1, 1, 0.95), C.body);
  for (const s of [1, -1]) {
    rb.add('head', sph(0.06, 8, 6).scale(1, 1.2, 0.7), C.eye, { pos: [s * 0.07, 0.02, 0.09], glow: true });
    rb.add('head', new THREE.CylinderGeometry(0.008, 0.012, 0.55, 4).translate(0, 0.27, 0), C.frame, { pos: [s * 0.05, 0.08, 0.04], rot: [0.5, 0, -s * 0.35], plain: true });
    rb.add('head', sph(0.5, 6, 4).scale(0.05, 0.13, 0.02), C.frame, { pos: [s * 0.27, 0.5, 0.28], rot: [0.5, 0, -s * 0.35], plain: true });
  }
  // wings: a dark frame behind each pale glass pane, upper and lower pair (the part it drops)
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`wing${n}`, 'body', [s * 0.12, 0.1, 0.02]);
    for (const [len, width, tip, y, back] of [[0.95, 0.42, 0.35, 0.12, 0], [0.62, 0.28, 0.1, -0.16, 1]]) {
      const frame = wingShape(len + 0.06, width + 0.06, tip).scale(s, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -y);
      const pane = wingShape(len - 0.04, width - 0.06, tip).scale(s, 1, 1).rotateX(-Math.PI / 2).translate(s * 0.03, 0.006, -y);
      rb.add(`wing${n}`, frame, C.frame, { plain: true, rot: [0, 0, back ? -s * 0.15 : 0] });
      rb.add(`wing${n}`, pane, back ? '#d9f1f2' : C.glass, { plain: true, rot: [0, 0, back ? -s * 0.15 : 0] });
      rb.add(`wing${n}`, new THREE.PlaneGeometry(0.05, width * 0.9).rotateX(-Math.PI / 2).rotateY(-s * 0.6).translate(s * len * 0.55, 0.012, -y), C.glint, { glow: true });
    }
  }
  const rig = rb.build();
  rig.height = 2.1;
  return rig;
}

function animMoth(r, s, dt, time) {
  // The model's glass wings stand in the plane facing forward (its concept's front view), so from the high game
  // camera they were seen edge on, dark. They are tilted back toward flat (about X first, order ZYX) so the panes
  // face up, and beat about the body's long axis (Z) like a real moth.
  const b = r.bones, k = windK(s), t = s.actT || 0, ease = hease;
  for (const w of [b.wingL, b.wingR]) if (w.rotation.order !== 'ZYX') w.rotation.order = 'ZYX';
  const v = s.smoothSpeed ?? s.speed ?? (s.moving ? 2 : 0), go = clamp01(v / 1.5);
  let hz = 2.2 + 0.6 * go, amp = 0.55, open = 0.15, tilt = -1.0, cup = 0, lift = Math.sin(time * 2.4 + r.seed) * 0.08, lean = 0.12 * go, roll = 0, headX = 0;
  if (s.windup === 'shard_rain') {
    // rises with its wings raised high over its back, held and shivering while the shards form above the marks;
    // on the last beat the wings sweep down and the shards drop
    const up = ease(k / 0.35), down = ease((k - 0.88) / 0.12);
    lift += 0.45 * up; hz = 2.2 + 5 * up; amp = 0.55 - 0.48 * up; open = 0.15 + 0.85 * up - 1.25 * down; tilt = -1.0 + 0.35 * up; lean = -0.15 * up;
  } else if (s.state === 'recover' && s.lastAttack === 'shard_rain') {
    const back = ease((t - 0.12) / 0.35);
    lift += 0.45 * (1 - back); open = -0.35 * (1 - back) + 0.15 * back; amp = 0.15 + 0.4 * back;
  } else if (s.windup === 'decoy') {
    // too close: it pulls back with its wings thrown wide and forward (the flash as its mirror image splits off),
    // held for a beat, then it beats hard and flies backward away from the prey
    const flare = ease(k / 0.4);
    tilt = -1.0 + 0.4 * flare; open = 0.15 + 0.75 * flare; amp = 0.55 * (1 - flare) + 0.05 * flare; hz = 2.2 + 8 * flare;
    lean = -0.3 * flare; lift += 0.1 * flare; headX = 0.2 * flare;
  } else if (s.state === 'act' && s.lastAttack === 'decoy') {
    // flying back fast: big, quick wing beats, the body tipped back, facing the prey it leaves the decoy with
    hz = 6.5; amp = 0.85; open = 0.1; tilt = -0.85; lean = -0.35; lift += 0.2;
  } else if (s.state === 'recover' && s.lastAttack === 'decoy') {
    const back = ease(t / 0.4);
    hz = 6.5 - 4.3 * back; amp = 0.85 - 0.3 * back; lean = -0.35 * (1 - back); lift += 0.2 * (1 - back);
  } else if (s.windup === 'glare') {
    // turns its wings on the prey like a mirror: brought up to face forward (the panes toward the prey), cupped a
    // little, the body tipped back so they catch the moon; held trembling until the flash
    const raise = ease(k / 0.35), hold = clamp01((k - 0.35) / 0.65);
    tilt = -1.0 + 0.55 * raise; cup = 0.3 * raise; open = 0.15 + 0.3 * raise; amp = 0.55 * (1 - raise) + 0.04 * raise; hz = 2.2 + 12 * hold;
    lean = -0.3 * raise; headX = 0.25 * raise;
  } else if (s.state === 'recover' && s.lastAttack === 'glare') {
    const back = ease((t - 0.08) / 0.45);
    tilt = -0.45 - 0.55 * back; cup = 0.3 * (1 - back); open = 0.45 - 0.3 * back; amp = 0.04 + 0.51 * back; lean = -0.3 * (1 - back) + 0.2 * (1 - back) * (t < 0.08 ? 1 : 0);
  } else if (s.state === 'stunned') {
    open = -0.45; amp = 0.15; hz = 1.2; lift -= 0.5; roll = Math.sin(time * 4) * 0.15;
  }
  if (s.hurt > 0) { lift -= 0.15 * s.hurt; open -= 0.3 * s.hurt; }
  r.phase = (r.phase || 0) + dt * hz * Math.PI * 2;
  // a moth's downstroke is quicker than its upstroke; the body lifts on each downstroke
  const sw = Math.sin(r.phase), beat = open + amp * (sw >= 0 ? sw : sw * 0.75);
  const fast = s.windup === 'decoy' || s.windup === 'shard_rain' || (s.state === 'recover' && t < 0.15);
  const wr = fast ? 30 : 18;
  b.wingL.rotation.z = damp(b.wingL.rotation.z, beat, wr, dt);
  b.wingR.rotation.z = damp(b.wingR.rotation.z, -beat, wr, dt);
  r.tilt = damp(r.tilt ?? tilt, tilt, 10, dt);
  r.cup = damp(r.cup || 0, cup, 10, dt);
  b.wingL.rotation.x = b.wingR.rotation.x = r.tilt;
  b.wingL.rotation.y = -r.cup; b.wingR.rotation.y = r.cup;
  b.body.position.y = damp(b.body.position.y, 1.6 + lift - 0.05 * Math.cos(r.phase) * amp, 8, dt);
  b.body.rotation.x = damp(b.body.rotation.x, lean, 6, dt);
  b.body.rotation.z = damp(b.body.rotation.z, roll, 6, dt);
  b.head.rotation.x = damp(b.head.rotation.x, headX, 8, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.8, 5, dt);
}

// ---------- rootdigger mole: a heavy purple-grey hump, cream stripe, ivory digging claws ----------

function buildMole() {
  const C = { fur: '#76678a', dark: '#544866', cream: '#ede2c8', hand: '#7b5a3f', claw: '#f2e9d4', nose: '#e59aa0', eye: '#e7922c' };
  const rb = new RigBuilder({ outline: 0.024, darkness: 0.32 });
  rb.bone('body', 'root', [0, 0.52, 0]);
  rb.bone('head', 'body', [0, 0.12, 0.6]);
  // body: a broad hump with a cream chest; a pale blaze runs from the snout over the crown
  rb.add('body', sph(0.56, 16, 12).scale(1.05, 0.88, 1.2), C.fur, { pos: [0, 0.02, -0.08] });
  rb.add('body', sph(0.38, 12, 10).scale(1.05, 0.9, 0.8), C.cream, { pos: [0, -0.16, 0.3] });
  for (let i = 0; i < 6; i++) rb.add('body', cone(0.07, 0.2, 4), C.dark, { pos: [Math.sin(i * 2.1) * 0.45, 0.22 + Math.cos(i * 1.7) * 0.18, -0.3 - (i % 3) * 0.16], rot: [-1.2, i, 0.4], plain: true });
  rb.bone('tail', 'body', [0, 0, -0.7]);
  rb.add('tail', cone(0.07, 0.36, 5).rotateX(-Math.PI / 2), C.dark);
  // head: pushed out in front of the hump so the camera sees it - a long pink-nosed snout,
  // the cream blaze from nose to crown, small round ears, narrow amber eyes
  rb.add('head', sph(0.3, 12, 10).scale(1, 0.85, 1.05), C.fur);
  rb.add('head', cone(0.17, 0.46, 10).rotateX(Math.PI / 2).scale(1, 0.72, 1), C.fur, { pos: [0, -0.06, 0.34] });
  rb.add('head', sph(0.1, 10, 8).scale(0.75, 0.32, 3.4), C.cream, { pos: [0, 0.14, 0.12], rot: [0.28, 0, 0] });
  rb.add('head', sph(0.12, 10, 8).scale(1.1, 0.8, 0.9), C.cream, { pos: [0, -0.16, 0.18] });
  rb.add('head', sph(0.065, 8, 6), C.nose, { pos: [0, -0.07, 0.57], plain: true });
  for (const s of [1, -1]) {
    rb.add('head', sph(0.034, 6, 4).scale(1.4, 0.6, 0.6), C.eye, { pos: [s * 0.13, 0.08, 0.24], glow: true });
    rb.add('head', sph(0.06, 6, 4).scale(1, 0.85, 0.5), C.nose, { pos: [s * 0.22, 0.2, 0], plain: true });
  }
  // fore-arms: brown hands with three long ivory claws each (the part it drops)
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`arm${n}`, 'body', [s * 0.5, -0.14, 0.42]);
    rb.add(`arm${n}`, new THREE.CylinderGeometry(0.12, 0.14, 0.32, 8).translate(0, -0.16, 0), C.fur, { rot: [0.5, 0, 0] });
    rb.bone(`hand${n}`, `arm${n}`, [0, -0.28, 0.16]);
    rb.add(`hand${n}`, sph(0.17, 10, 8).scale(1.1, 0.55, 1), C.hand);
    for (let i = 0; i < 3; i++) rb.add(`hand${n}`, cone(0.055, 0.46, 6).rotateX(Math.PI / 2 + 0.5), C.claw, { pos: [(i - 1) * 0.11, -0.08, 0.28] });
  }
  // hind legs (their own bones, so the feet step; data/models.json legL/legR)
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    rb.bone(`leg${n}`, 'body', [s * 0.42, -0.27, -0.24]);
    rb.add(`leg${n}`, sph(0.14, 8, 6).scale(1, 0.6, 1.3), C.hand, { pos: [0, -0.19, -0.05] });
  }
  const rig = rb.build();
  rig.height = 1.25;
  return rig;
}

// Its kit (docs/MONSTER-ATTACKS.md), each move on the anime beat - anticipation, a held pose, a very short strike,
// overshoot, a held finish, recovery:
//   ตะปบขุด (swipe): it rears back with both digging claws raised high and held, then scoops them down and across
//     in one snap on the hit, carrying through low before it settles;
//   สาดดิน (spray): hunched, nose down, its claws churn the ground faster and faster, then both fling forward
//     together as the clods fly;
//   มุดดินโผล่ราก (erupt): it digs in, claws churning, and sinks out of sight; it bursts up at the marked spot with
//     its claws flung high.
const ease = (x) => x * x * (3 - 2 * x);
function animMole(r, s, dt, time) {
  const b = r.bones, k = windK(s);
  // Walking (owner, 2026-11-05: "it must part the earth with its hands as it walks"): a breaststroke through the soil.
  // Locked to its ground speed (one stroke every 0.75 m): both front paws reach forward together, close in under the
  // nose (u 0..0.4), then part the earth, sweeping wide out to the sides and back (0.4..0.85) while the body surges
  // forward with the push, and recover in (to 1); the hind feet shuffle alternately under it. MonsterFx throws the
  // parted earth off each paw at the height of the sweep (skillfx/mole-fx.js walkDig).
  const sp = s.smoothSpeed ?? s.speed ?? (s.moving ? 1.5 : 0);
  const w = (r.runW = damp(r.runW || 0, clamp01(sp / 0.5), 8, dt));
  r.phase = (r.phase || 0) + dt * Math.min(12, (sp * Math.PI * 2) / 0.75) * (s.backing ? -1 : 1);
  const u = (((r.phase / (Math.PI * 2)) % 1) + 1) % 1, sn = Math.sin(r.phase);
  const reach = u < 0.4 ? ease(u / 0.4) : 1 - ease(Math.min(1, (u - 0.4) / 0.45));  // 1 = paws forward and in
  const part = u < 0.4 ? 0 : u < 0.85 ? ease((u - 0.4) / 0.45) : 1 - ease((u - 0.85) / 0.15); // 1 = swept wide
  const push = u > 0.4 && u < 0.85 ? Math.sin(((u - 0.4) / 0.45) * Math.PI) : 0;
  let sink = 0, armL = (-0.55 * reach + 0.35 * part) * w, armR = armL, headX = Math.sin(time * 1.4 + r.seed) * 0.04 + 0.04 * push * w;
  let armLz = (0.05 + 0.3 * part) * w, armRz = -armLz;
  let legL = 0.4 * sn * w, legR = -0.4 * sn * w;
  let armLy = (-0.25 * reach + 0.85 * part) * w, armRy = -armLy;
  let bodyZ = 0.04 * sn * w, bodyX = (0.06 + 0.06 * push) * w, twist = 0, lift = 0.03 * push * w, fast = false;
  const headY = 0;
  const after = s.state === 'recover' ? s.actT || 0 : -1;
  if (s.windup || after >= 0) { armLz = armRz = armLy = armRy = 0; legL = legR = 0; }
  // Real mole digging, not raised arms (owner, 2026-11-05: "unnatural"): a mole's front paws are turned outward and
  // dig with sideways strokes, like breaststroke; the strike is that stroke done hard.
  if (s.windup === 'erupt') {
    // digs in with fast alternating strokes, nose down, and is fully under by a third of the wind-up (only then
    // does the ground start to heave toward the mark)
    r.churn = (r.churn || 0) + dt * 24;
    sink = clamp01(k / 0.32);
    armLy = 0.15 + 0.45 * Math.max(0, Math.sin(r.churn)); armRy = -(0.15 + 0.45 * Math.max(0, -Math.sin(r.churn)));
    armL = 0.35 * Math.sin(r.churn); armR = -0.35 * Math.sin(r.churn);
    headX = 0.45; bodyX = 0.3; fast = true;
  } else if (s.windup === 'swipe') {
    // anticipation (to 0.55 of the wind-up): it hunkers down, nose low, and draws both paws in under its chest,
    // turned to scoop; held, quivering, until the strike
    const a = ease(Math.min(1, k / 0.55)), held = k > 0.55 ? Math.sin(time * 34) * 0.03 : 0;
    armL = 0.35 * a; armR = 0.35 * a; armLy = -0.35 * a + held; armRy = 0.35 * a - held;
    bodyX = 0.16 * a; lift = -0.05 * a; headX = 0.22 * a; bodyZ = 0;
  } else if (after >= 0 && s.lastAttack === 'swipe') {
    // the strike: both paws sweep forward and out to the sides in one snap (0.07 s), the body lunging with them;
    // carried a touch past, held to 0.3 s, then home
    const snap = ease(Math.min(1, after / 0.07)), back = ease(Math.min(1, Math.max(0, after - 0.3) / 0.35));
    const o = 1 + 0.12 * Math.sin(Math.min(1, after / 0.16) * Math.PI);
    armL = (0.35 - 0.95 * snap) * (1 - back); armR = armL;
    armLy = (-0.35 + 1.05 * snap * o) * (1 - back); armRy = -armLy;
    bodyX = (0.16 - 0.24 * snap) * (1 - back); headX = (0.22 - 0.3 * snap) * (1 - back); lift = (-0.05 + 0.07 * snap) * (1 - back);
    fast = after < 0.12;
  } else if (s.windup === 'spray') {
    // nose down, digging hard with alternating sideways strokes, faster and faster
    const a = ease(Math.min(1, k / 0.2)), rate = 14 + 14 * k;
    r.churn = (r.churn || 0) + dt * rate;
    armLy = (0.1 + 0.5 * Math.max(0, Math.sin(r.churn))) * a; armRy = -(0.1 + 0.5 * Math.max(0, -Math.sin(r.churn))) * a;
    armL = 0.3 * Math.sin(r.churn) * a; armR = -0.3 * Math.sin(r.churn) * a;
    bodyX = 0.22 * a; headX = 0.4 * a; sink = 0.04 * a; bodyZ = 0.05 * Math.sin(r.churn) * a; fast = true;
  } else if (after >= 0 && s.lastAttack === 'spray') {
    // the fling: both paws scoop up and forward together, the head coming up; held a beat, then settles
    const snap = ease(Math.min(1, after / 0.06)), back = ease(Math.min(1, Math.max(0, after - 0.22) / 0.3));
    armL = armR = (0.3 - 1.0 * snap) * (1 - back); armLy = 0.25 * snap * (1 - back); armRy = -armLy;
    bodyX = (0.22 - 0.3 * snap) * (1 - back); headX = (0.4 - 0.55 * snap) * (1 - back); lift = 0.04 * snap * (1 - back);
    fast = after < 0.1;
  } else if (after >= 0 && s.lastAttack === 'erupt') {
    // bursts up out of the pit, paws flung out to the sides, then shakes the earth off
    const t = Math.min(1, after / 0.12), back = ease(Math.min(1, Math.max(0, after - 0.35) / 0.35));
    armL = armR = -0.7 * t * (1 - back); armLy = 0.6 * t * (1 - back); armRy = -armLy;
    headX = -0.3 * t * (1 - back); bodyZ = Math.sin(after * 30) * 0.08 * back * (1 - back) * 4; fast = true;
  } else if (s.state === 'stunned') {
    headX = 0.3 + Math.sin(time * 10) * 0.1;
  }
  // sinking is quick on the way down and quicker on the way up (the burst)
  r.sink = damp(r.sink || 0, sink, s.windup === 'erupt' ? 12 : sink ? 3.5 : 14, dt);
  const f = fast ? 40 : 12; // strikes follow their keys almost at once; idle and walking ease
  r.lift = damp(r.lift || 0, lift, f, dt);
  b.body.position.y = 0.52 - r.sink * 1.3 + r.lift;
  b.body.rotation.z = damp(b.body.rotation.z, bodyZ, f, dt);
  b.body.rotation.x = damp(b.body.rotation.x, bodyX + (s.hurt || 0) * -0.15 + r.sink * 0.3, f, dt);
  b.body.rotation.y = damp(b.body.rotation.y, twist, f, dt);
  b.head.rotation.x = damp(b.head.rotation.x, headX, f, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.6 + headY, 5, dt);
  b.armL.rotation.x = damp(b.armL.rotation.x, armL, fast ? 40 : 14, dt);
  b.armR.rotation.x = damp(b.armR.rotation.x, armR, fast ? 40 : 14, dt);
  b.armL.rotation.z = damp(b.armL.rotation.z, armLz, 14, dt);
  b.armR.rotation.z = damp(b.armR.rotation.z, armRz, 14, dt);
  b.armL.rotation.y = damp(b.armL.rotation.y, armLy, 14, dt);
  b.armR.rotation.y = damp(b.armR.rotation.y, armRy, 14, dt);
  if (b.legL) { b.legL.rotation.x = damp(b.legL.rotation.x, legL, 16, dt); b.legR.rotation.x = damp(b.legR.rotation.x, legR, 16, dt); }
  b.tail.rotation.y = Math.sin(time * 3 + r.seed) * 0.2;
}

export const GROVE_BUILDERS = {
  fern_ear_hare: [buildHare, animHare],
  mirrorwing_moth: [buildMoth, animMoth],
  rootdigger_mole: [buildMole, animMole],
};
export const GROVE_SCALE = { fern_ear_hare: 0.7, mirrorwing_moth: 1, rootdigger_mole: 1.3 }; // the mole bigger (owner, 2026-11-05)
