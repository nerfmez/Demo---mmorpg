// The roll of a carried weapon about its blade: find the up (blade flat) that keeps the weapon in the
// hand the way the resting socket and the actions hold it (turned about the hand's x only, hero.js
// weapon channel), so the hand does not twist when an action takes over. Prints the corrected up of
// the carry (and of its left weapon); write those into data/models.json. Needs the dev server.
//
//   node scripts/pose-retarget/match-roll.mjs <bench skill> <offhand weapon|null> <carry: one|two|dual> [right-hand weapon|null] [run]
// With `run` the hero runs and the carry's run carry (hold.run) is matched instead.
import { chromium } from 'playwright';
const [skill, off, key, weaponArg = null, mode = ''] = process.argv.slice(2);
const weapon = weaponArg === 'null' ? null : weaponArg, run = mode === 'run';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4190/fx-test.html', { waitUntil: 'load' });
await p.waitForFunction(() => window.__fxtest?.hero?.holds, null, { timeout: 90000 });
await p.waitForTimeout(2000);
const r = await p.evaluate(async ([skill, off, key, weapon, run]) => {
  const F = window.__fxtest; F.state.auto = false; F.state.weapon = weapon; F.state.offhand = off === 'null' ? null : off; F.setSkill(skill); F.freeze(true); F.advance(1.5);
  if (run) { F.game.setMove(1, 0); F.advance(1.5); } // the run carry fully blended in
  const h = F.hero, bones = h.bones, carry = h.holds[h.weaponKind][key], hold = run ? carry.run : carry;
  const left = run ? carry.run.left : carry.left, dirOf = (c, base) => c.dir ?? base.dir;
  const V = bones.body.position.constructor, Q = bones.body.quaternion.constructor;
  const fix = (sock, hand, up, dir) => {
    sock.updateWorldMatrix(true, false); hand.updateWorldMatrix(true, false);
    const m = hand.matrixWorld.clone().invert().multiply(sock.matrixWorld).elements;
    const y = new V(m[4], m[5], m[6]).normalize(), z = new V(m[8], m[9], m[10]).normalize();
    const zr = new V(0, -Math.sin(1.2), Math.cos(1.2)), yr = new V(0, Math.cos(1.2), Math.sin(1.2));
    const yd = yr.applyQuaternion(new Q().setFromUnitVectors(zr, z)); yd.addScaledVector(z, -yd.dot(z)).normalize();
    const phi = Math.atan2(new V().crossVectors(y, yd).dot(z), y.dot(yd));
    // half the turn per pass (the hand re-seats on the weapon, so a full turn can overshoot), kept square to the blade
    const d = new V(...dir).normalize(), u = new V(...up).applyAxisAngle(d, phi * 0.5);
    u.addScaledVector(d, -u.dot(d)).normalize();
    return { phi: +phi.toFixed(2), up: u.toArray().map((x) => +x.toFixed(3)) };
  };
  let out, first;
  for (let it = 0; it < 24; it++) { // the hand re-seats on the turned weapon: repeat until it settles
    out = { right: fix(bones.weapon, bones.handR, hold.up ?? carry.up, dirOf(hold, carry)) };
    if (left) out.left = fix(bones.offhand, bones.handL, left.up, left.dir);
    first ??= { right: out.right.phi, left: out.left?.phi };
    hold.up = out.right.up; if (left) left.up = out.left.up;
    F.advance(0.05);
  }
  return { ...out, before: first };
}, [skill, off || 'null', key, weapon, run]);
console.log(JSON.stringify(r));
await b.close();
