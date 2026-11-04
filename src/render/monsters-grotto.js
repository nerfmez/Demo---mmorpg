// The Pearlshell Grotto's monsters as game rigs (the owner's Meshy models from assets/meshy/grotto, prepared
// with scripts/prep-monster-glb.py and weighted by data/models.json), so the game's rules can fight with them.
// No free animation clip exists for these creatures, so they move by real animal motion (docs/MONSTER-ATTACKS.md):
//
// Pearl fish: stranded on its side as the owner chose for the grotto (30 October 2026), gasping, fins
// fluttering; it moves by flopping, and its attacks are a mudskipper's: for the jet it rolls its belly up, its
// cheeks swell and its nose lifts toward the prey, then snaps; for the flop it bends nose to tail and holds it,
// then flicks through hop after hop, arching the other way each time; for the slap it curls, then its tail
// whips across.
//
// Pearl sea slug: it crawls with a ripple running down its frilled skirt, its plumes swaying behind; for the volley
// the plumes fan up and quiver, then flick forward as the darts leave; for the surge the ripple runs tail to head and
// it squashes back, then stretches long as it slides; hit hard, the plumes stand up and shiver as it sheds them.
//
// One-eyed clam: the upper shell hinges at the back; it breathes, its eye looking about. For the snipe the shell opens
// and the eye widens, fixed on its prey; for the valve jet it gapes wide and the mantle swells, then slams shut; in
// its guard it clamps tight and trembles. It travels in small leaps, crouching before each (owner, 30 October 2026).
//
// Pearl Snail King (boss): it heaves along, its skirt surging; for the crush the frill rears and the head lifts, then
// slaps down; for the harpoon the head draws back and holds there trembling (the cone snail's latch), then lunges; for
// the beam the shell tips forward so the great pearl faces its prey and the body braces as it turns; withdrawn (and
// asleep), head, stalked eyes and foot draw into the shell and it trembles until it bursts out.
import * as THREE from 'three';
import { RigBuilder, damp, clamp01 } from './rig.js';

const sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const smooth = (x) => x * x * (3 - 2 * x);

function buildPearlFish() {
  // bones at the model's joints (rig space after its 0.7 scale); the parts are a stand-in until the model loads
  const C = { body: '#e6e0f2', fin: '#4aa8e8' };
  const rb = new RigBuilder({ outline: 0.016, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0.306, 0.035]);
  rb.bone('head', 'body', [0, 0, 0.35]);
  rb.bone('tail', 'body', [0, -0.035, -0.35]);
  rb.bone('finL', 'body', [0.105, -0.07, 0.175]);
  rb.bone('finR', 'body', [-0.105, -0.07, 0.175]);
  rb.add('body', sph(0.2).scale(0.6, 1, 1.8), C.body);
  rb.add('head', sph(0.16).scale(0.7, 0.9, 1.2), C.body, { pos: [0, 0, 0.08] });
  rb.add('tail', sph(0.18).scale(0.15, 1.2, 1), C.fin, { pos: [0, 0, -0.2] });
  for (const [n, s] of [['finL', 1], ['finR', -1]]) rb.add(n, sph(0.1).scale(1.6, 0.2, 0.8), C.fin, { pos: [s * 0.1, -0.03, 0] });
  const rig = rb.build();
  rig.height = 0.6;
  return rig;
}

function animPearlFish(r, s, dt, time) {
  const b = r.bones, a = s.attack, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0;
  const seed = r.seed || 0;
  // lying on its left side, the right fin up; hops lift it and arch it
  let roll = Math.PI / 2, lift = 0, bend = 0, nose = 0, swell = 1, tail = Math.sin(time * 9 + seed) * 0.08, fin = Math.sin(time * 14 + seed) * 0.35;
  if (s.moving) {
    // flopping along: one hop a beat, arching the other way each time
    r.ph = (r.ph || 0) + dt * 3.2;
    const hop = Math.max(0, Math.sin(r.ph * Math.PI)), side = Math.floor(r.ph) % 2 ? 1 : -1;
    lift = hop * 0.22; bend = hop * 0.55 * side;
  }
  if (s.windup === 'jet') {
    // it rolls its belly up toward the prey, the nose lifts, the cheeks swell
    const g = smooth(k);
    roll = Math.PI / 2 + 0.45 * g; nose = -0.35 * g; swell = 1 + 0.18 * g; tail = -0.3 * g + Math.sin(time * 30) * 0.05 * g;
  } else if (s.state === 'recover' && s.lastAttack === 'jet') {
    // the snap: the head jerks back as the water leaves, then settles
    const t = clamp01(s.actT / 0.3);
    roll = Math.PI / 2 + 0.45 * (1 - t); nose = 0.25 * Math.sin(t * Math.PI); swell = 1 - 0.1 * Math.sin(t * Math.PI);
  } else if (s.windup === 'flop') {
    // the mudskipper's C: nose and tail bent toward each other, held, quivering
    const g = smooth(clamp01(k / 0.4));
    bend = 1.1 * g; lift = -0.03 * g; tail += Math.sin(time * 40) * 0.06 * g;
  } else if (s.state === 'act' && s.lastAttack === 'flop' && a) {
    // each hop flicks it straight and over to the other side; it lands with a squash
    const per = a.air + a.pause, t = s.actT % per, n = Math.floor(s.actT / per), air = clamp01(t / a.air);
    const side = n % 2 ? -1 : 1;
    lift = t < a.air ? Math.sin(air * Math.PI) * 0.45 : 0;
    bend = t < a.air ? side * (1.1 - 2.2 * smooth(air)) * 0.8 : -side * 0.5;
  } else if (s.windup === 'slap') {
    // it curls, tail drawn back
    const g = smooth(k);
    bend = -0.9 * g; tail = -0.8 * g;
  } else if ((s.state === 'act' || s.state === 'recover') && s.lastAttack === 'slap') {
    // the tail whips across, the body following
    const t = s.state === 'act' ? s.actT : 0.35 + s.actT, h = a?.hits?.[0]?.at || 0.12;
    const w = smooth(clamp01(t / h)), back = clamp01((t - 0.3) / 0.4);
    bend = (-0.9 + 1.6 * w) * (1 - back); tail = (-0.8 + 2.0 * w) * (1 - back);
  } else if (s.state === 'stunned') {
    fin *= 2; tail += Math.sin(time * 20) * 0.2;
  }
  const hurt = s.hurt || 0;
  b.body.rotation.z = damp(b.body.rotation.z, roll, 12, dt);
  b.body.position.y = damp(b.body.position.y, 0.17 + lift - hurt * 0.03, 18, dt);
  b.body.rotation.y = damp(b.body.rotation.y, bend * 0.3, 14, dt);
  b.head.rotation.y = damp(b.head.rotation.y, bend * 0.5, 16, dt);
  b.head.rotation.x = damp(b.head.rotation.x, nose, 14, dt);
  b.head.scale.set(swell, swell, 1);
  b.tail.rotation.y = damp(b.tail.rotation.y, -bend * 0.9 + tail, 20, dt);
  b.finL.rotation.z = damp(b.finL.rotation.z, -0.4 + fin * 0.6, 20, dt);
  b.finR.rotation.z = damp(b.finR.rotation.z, 0.2 - fin, 20, dt);
}

function buildPearlSlug() {
  const C = { body: '#2fb8b0', skirt: '#efe2c0', plume: '#5a8ce8' };
  const rb = new RigBuilder({ outline: 0.016, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0.281, 0]);
  rb.bone('head', 'body', [0, 0.21, 0.42]);
  rb.bone('cerata', 'body', [0, 0.315, 0]);
  rb.bone('tail', 'body', [0, -0.105, -0.35]);
  rb.add('body', sph(0.3).scale(1.6, 0.6, 1.9), C.skirt, { pos: [0, -0.12, 0] });
  rb.add('body', sph(0.26).scale(1.1, 0.9, 1.6), C.body);
  rb.add('head', sph(0.16), C.body);
  rb.add('cerata', sph(0.14).scale(1.6, 1.4, 1.2), C.plume, { pos: [0, 0.15, 0] });
  rb.add('tail', sph(0.12).scale(1, 0.6, 1.5), C.body);
  const rig = rb.build();
  rig.height = 1.0;
  return rig;
}

function animPearlSlug(r, s, dt, time) {
  const b = r.bones, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0, seed = r.seed || 0;
  r.crawl = (r.crawl || 0) + dt * (s.moving ? 5.5 : 1.2);
  let stretch = Math.sin(r.crawl) * (s.moving ? 0.07 : 0.02), fan = 0, flick = 0, shiver = 0, lift = 0, look = 0;
  if (s.windup === 'volley') { fan = smooth(k); shiver = Math.sin(time * 40) * 0.05 * k; look = -0.15 * k; }
  else if (s.state === 'recover' && s.lastAttack === 'volley') { const t = clamp01(s.actT / 0.25); flick = Math.sin(t * Math.PI); fan = 1 - t; }
  else if (s.windup === 'surge') { stretch = -0.18 * smooth(k) + Math.sin(time * 18) * 0.03 * k; lift = 0.04 * k; }
  else if (s.state === 'act' && s.lastAttack === 'surge') { stretch = 0.22; look = -0.1; }
  else if (s.state === 'retreat' || (s.state === 'recover' && s.lastAttack === 'surge')) { stretch = Math.sin(time * 10) * 0.06; }
  if (r.shedT > 0) { r.shedT -= dt; shiver = Math.sin(time * 50) * 0.12; fan = Math.max(fan, 0.7); }
  b.body.scale.set(1 - stretch * 0.4, 1 - stretch * 0.6 + lift, 1 + stretch);
  b.cerata.rotation.x = damp(b.cerata.rotation.x, -0.5 * fan + 0.7 * flick + Math.sin(time * 1.3 + seed) * 0.05, 12, dt);
  b.cerata.scale.setScalar(1 + 0.25 * fan);
  b.cerata.rotation.z = Math.sin(time * 0.9 + seed) * 0.05 + shiver;
  b.head.rotation.x = damp(b.head.rotation.x, look, 10, dt);
  b.head.rotation.y = damp(b.head.rotation.y, s.lookYaw * 0.6, 5, dt);
  b.tail.rotation.y = Math.sin(r.crawl * 0.5) * 0.15;
}

function buildEyeClam() {
  const C = { shell: '#e6dcd2', mantle: '#6a1e5a', eye: '#f2c86a' };
  const rb = new RigBuilder({ outline: 0.02, darkness: 0.3 });
  rb.bone('body', 'root', [0, 0.436, 0]);
  rb.bone('lid', 'body', [0, 0.52, -0.44]);
  rb.bone('eye', 'body', [0, 0.432, 0.288]);
  rb.add('body', sph(0.6).scale(1.3, 0.6, 1.1), C.shell, { pos: [0, -0.05, 0.05] });
  rb.add('lid', sph(0.6).scale(1.3, 0.5, 1.1), C.shell, { pos: [0, 0.05, 0.5] });
  rb.add('eye', sph(0.12), C.eye, { glow: true });
  const rig = rb.build();
  rig.height = 1.4;
  return rig;
}

function animEyeClam(r, s, dt, time) {
  const b = r.bones, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0, seed = r.seed || 0;
  const breathe = Math.sin(time * 1.1 + seed);
  let open = -0.08 - 0.04 * breathe, eye = 1, swell = 1, tremble = 0, lift = 0, tip = 0, squash = 1;
  if (s.moving) {
    // small leaps: a crouch, a hop with the shell tipping forward, a squash on landing
    r.hop = (r.hop || 0) + dt * 1.6;
    const ph = r.hop % 1, air = ph < 0.45 ? ph / 0.45 : -1;
    if (air >= 0) { lift = Math.sin(air * Math.PI) * 0.45; tip = Math.sin(air * Math.PI) * 0.2; squash = 1 + Math.sin(Math.min(1, air * 2) * Math.PI) * 0.12; }
    else { const g = (ph - 0.45) / 0.55; squash = 1 - Math.max(0, 1 - g * 3) * 0.18 - Math.sin(Math.max(0, (g - 0.6) / 0.4) * Math.PI * 0.5) * 0.12; }
  }
  if (s.windup === 'snipe') { open = -0.32 * smooth(k); eye = 1 + 0.35 * smooth(k); }
  else if (s.state === 'recover' && s.lastAttack === 'snipe') { const t = clamp01(s.actT / 0.3); open = -0.32 * (1 - t); eye = 1 + 0.35 * (1 - t); squash = 1 - 0.06 * Math.sin(t * Math.PI); }
  else if (s.windup === 'valve') { open = -0.55 * smooth(k); swell = 1 + 0.12 * smooth(k); eye = 1 - 0.3 * k; tremble = Math.sin(time * 30) * 0.02 * k; }
  else if (s.state === 'recover' && s.lastAttack === 'valve') { const t = clamp01(s.actT / 0.12); open = -0.55 * (1 - t) + 0.04 * t; squash = 1 - 0.14 * Math.sin(Math.min(1, s.actT / 0.3) * Math.PI); }
  if (s.state === 'shell') { open = 0.04; eye = 0.4; tremble = Math.sin(time * 34) * 0.025; }
  b.lid.rotation.x = damp(b.lid.rotation.x, open, s.state === 'recover' && s.lastAttack === 'valve' ? 40 : 14, dt);
  b.body.scale.set(swell * (2 - squash) ** 0.5, squash, swell * (2 - squash) ** 0.5);
  b.body.position.y = 0.436 + lift;
  b.body.rotation.x = tip;
  b.body.rotation.z = tremble;
  b.eye.scale.setScalar(damp(b.eye.scale.x, eye, 12, dt));
  b.eye.rotation.y = damp(b.eye.rotation.y, s.lookYaw * 0.9, 8, dt);
}

function buildSnailKing() {
  const C = { body: '#a8304a', shell: '#4a5262', pearl: '#ffe6a0' };
  const rb = new RigBuilder({ outline: 0.03, darkness: 0.32 });
  rb.bone('body', 'root', [0, 0.329, 0]);
  rb.bone('head', 'body', [0, 0.72, 1.26]);
  rb.bone('eyeL', 'head', [0.18, 0.36, 0.144]);
  rb.bone('eyeR', 'head', [-0.18, 0.36, 0.144]);
  rb.bone('shell', 'body', [0, 0.99, -0.432]);
  rb.bone('pearl', 'shell', [0, 0.882, 0.432]);
  rb.add('body', sph(0.9).scale(1.3, 0.35, 1.8), C.body);
  rb.add('head', sph(0.35).scale(1, 0.9, 1.2), C.body);
  for (const n of ['eyeL', 'eyeR']) rb.add(n, new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6).translate(0, 0.3, 0), C.body);
  rb.add('shell', sph(0.9).scale(1, 1, 1.1), C.shell);
  rb.add('pearl', sph(0.22), C.pearl, { glow: true });
  const rig = rb.build();
  rig.height = 2.6;
  return rig;
}

function animSnailKing(r, s, dt, time) {
  const b = r.bones, a = s.attack, k = s.windupTotal ? clamp01(s.windupT / s.windupTotal) : 0, seed = r.seed || 0;
  r.crawl = (r.crawl || 0) + dt * (s.moving ? 2.2 : 0.6);
  const pull = Math.sin(r.crawl);
  let surge = (s.moving ? 0.05 : 0.015) * pull, headX = 0, headZ = 0, bodyX = 0, shellX = 0, inShell = 0, tremble = 0, eyes = 0;
  if (s.windup === 'crush') { const g = smooth(k); headX = -0.7 * g; bodyX = -0.18 * g; }
  else if (s.state === 'recover' && s.lastAttack === 'crush') { const t = clamp01(s.actT / 0.15), back = clamp01((s.actT - 0.3) / 0.4); headX = (-0.7 + 1.1 * smooth(t)) * (1 - back); bodyX = (-0.18 + 0.28 * t) * (1 - back); surge = -0.08 * Math.sin(Math.min(1, s.actT / 0.3) * Math.PI); }
  else if (s.windup === 'harpoon') {
    // draws back, then holds the latch, trembling, through the last third
    const g = smooth(clamp01(k / 0.65)); headZ = -0.35 * g; headX = -0.25 * g;
    if (k > 0.65) tremble = Math.sin(time * 45) * 0.03;
  } else if (s.state === 'recover' && s.lastAttack === 'harpoon') { const t = clamp01(s.actT / 0.08), back = clamp01((s.actT - 0.2) / 0.5); headZ = (-0.35 + 0.95 * t) * (1 - back); headX = (-0.25 + 0.4 * t) * (1 - back); }
  else if (s.windup === 'beam' || (s.state === 'act' && s.lastAttack === 'beam')) { const g = s.windup ? smooth(k) : 1; shellX = 0.28 * g; headX = 0.2 * g; eyes = 0.4 * g; surge = -0.04 * g; }
  else if (s.state === 'recover' && s.lastAttack === 'beam') { const t = clamp01(s.actT / 0.6); shellX = 0.28 * (1 - t); headX = 0.2 * (1 - t); }
  if (s.state === 'shell' || (s.state === 'idle' && s.dormant)) { inShell = 1; tremble = s.state === 'shell' ? Math.sin(time * 30) * 0.02 : Math.sin(time * 0.7 + seed) * 0.004; }
  if (s.state === 'emerge') inShell = 1 - clamp01(s.actT / 0.8);
  r.inShell = damp(r.inShell || 0, inShell, inShell > (r.inShell || 0) ? 6 : 10, dt);
  const sh = r.inShell;
  b.body.scale.set(1 - surge * 0.4 - sh * 0.25, 1 - surge * 0.6 - sh * 0.3, 1 + surge - sh * 0.35);
  b.body.rotation.x = damp(b.body.rotation.x, bodyX, 10, dt);
  b.body.rotation.z = tremble;
  b.head.rotation.x = damp(b.head.rotation.x, headX + Math.sin(r.crawl + 0.8) * 0.04, 12, dt);
  b.head.position.z = damp(b.head.position.z, 1.26 + headZ - sh * 0.9, s.lastAttack === 'harpoon' && s.state === 'recover' ? 30 : 10, dt);
  b.head.position.y = 0.72 - sh * 0.35;
  b.head.scale.setScalar(1 - sh * 0.75);
  b.shell.rotation.x = damp(b.shell.rotation.x, shellX, 6, dt);
  b.shell.scale.setScalar(1 / Math.max(0.6, 1 - sh * 0.3)); // the shell stays its size as the body shrinks under it
  for (const [n, sg] of [['eyeL', 1], ['eyeR', -1]]) {
    b[n].rotation.x = damp(b[n].rotation.x, -0.15 + eyes + Math.sin(time * 0.9 + sg) * 0.1, 8, dt);
    b[n].rotation.z = sg * (0.15 + Math.sin(time * 0.7 + seed + sg) * 0.08);
    b[n].scale.setScalar(1 - sh * 0.9);
  }
}

export const GROTTO_BUILDERS = {
  pearl_snail_king: [buildSnailKing, animSnailKing],
  pearl_fish: [buildPearlFish, animPearlFish],
  pearl_slug: [buildPearlSlug, animPearlSlug],
  eye_clam: [buildEyeClam, animEyeClam],
};
export const GROTTO_SCALE = { pearl_fish: 1, pearl_slug: 1, eye_clam: 1, pearl_snail_king: 1 };
