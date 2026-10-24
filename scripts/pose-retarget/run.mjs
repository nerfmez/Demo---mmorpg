// Retarget one frame of a reference clip onto the chibi hero and print its stance and weapon carry.
// Needs the dev server (npm run dev -- --port 4190) and the reference GLBs in tests/browser/out/ual
// (scripts/pose-retarget/fetch-ual.sh). See docs/POSE-RETARGET.md.
//
//   node scripts/pose-retarget/run.mjs --file UAL1.glb --clip Sword_Idle --time 0.6 --skill slash [--shots dir]
//   node scripts/pose-retarget/run.mjs --profile kaykit --file Knight.glb --clip Idle --time 0.5 --prop 1H_Sword --propL 1H_Sword_Offhand --offhand sword
//   node scripts/pose-retarget/run.mjs --profile kaykit --file Knight.glb --clip 2H_Melee_Idle --time 0.5 --prop 2H_Sword --skill frontline_split
import { chromium } from 'playwright';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const file = arg('file', 'UAL1.glb'), clip = arg('clip'), time = +arg('time', '0'), skill = arg('skill', 'slash');
const offhand = arg('offhand', null); // preview with this weapon in the hero's left hand (a dual carry)
const legs = +arg('legs', '1'); // < 1 straightens the legs (less crouch) toward standing
const arms = +arg('arms', '1'); // < 1 brings the arms in (a bulky reference holds them away from its armour)
const site = arg('site', 'http://127.0.0.1:4190'), shots = arg('shots'), profile = arg('profile', 'ual'), prop = arg('prop', null), propL = arg('propL', null);
if (!clip) throw new Error('--clip is required');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(site + '/fx-test.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__fxtest?.hero?.holds, null, { timeout: 90000 });

const result = await page.evaluate(async ([file, clip, time, skill, profile, prop, legs, arms, propL, offhand]) => {
  const R = await import('/scripts/pose-retarget/retarget.js');
  const F = window.__fxtest;
  F.state.auto = false; F.setSkill(skill); if (offhand) F.setOffhand(offhand); F.freeze(true);
  const g = await R.load('/tests/browser/out/ual/' + file);
  const P = R.PROFILES[profile];
  const rest = R.sample(g, P.rest, 0, P);
  const j = R.sample(g, clip, time, P, prop, propL);
  const { local } = R.retarget(j, { restHeadQ: rest.headQ });
  // the reference skeleton's own bends at rest (its T/A-pose knees, sloped feet, spine curve) are not pose
  const restLocal = R.retarget(rest, { restHeadQ: rest.headQ }).local;
  for (const n of ['hips', 'torso', 'chest', 'head', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'elbowL', 'elbowR'])
    if (local[n] && restLocal[n]) local[n] = local[n].map((x, i) => x - restLocal[n][i]);
  for (const n of ['legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR']) if (local[n]) local[n] = local[n].map((x) => x * legs);
  for (const n of ['armL', 'armR']) if (local[n]) local[n][2] *= arms;
  // the hero's driver joints (bone offsets from their parents)
  const hero = F.hero, bones = hero.bones;
  const names = ['body', 'hips', 'torso', 'chest', 'head', 'legL', 'kneeL', 'footL', 'legR', 'kneeR', 'footR', 'armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR'];
  const offsets = {}, parents = {};
  for (const n of names) { offsets[n] = bones[n].position.toArray(); parents[n] = names.find((m) => bones[m] === bones[n].parent) || null; }
  offsets.body = [0, 0, 0];
  const restFk = R.fk(offsets, parents, {}), poseFk = R.fk(offsets, parents, local);
  // the body drops until the lower foot is back on the ground
  const foot = (k) => Math.min(k.P.footL.y, k.P.footR.y);
  const drop = foot(restFk) - foot(poseFk);
  // a stance adds to the standing base and the idle's arm spread (hero.js IDLE_BASE and update())
  const BASE = { kneeL: [0.04, 0, 0], kneeR: [0.04, 0, 0], armL: [-0.05, 0, 0.17], armR: [-0.05, 0, -0.17], elbowL: [-0.22, 0, 0], elbowR: [-0.22, 0, 0], torso: [0.05, 0, 0] };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const stance = {};
  for (const n of ['hips', 'torso', 'chest', 'head', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'armL', 'armR', 'elbowL', 'elbowR']) {
    const v = local[n] || [0, 0, 0], b = BASE[n] || [0, 0, 0];
    stance[n] = v.map((x, i) => r3(x - b[i]));
  }
  stance.drop = r3(drop); stance.shift = 0;
  // the weapon hand: the palm (ik.js PALM below the wrist) mapped back into the carry space (the
  // animator's 1.75 m body, ikMap), the blade along the fist (pinky -> index knuckles), its flat
  // facing across the knuckles
  const palm = poseFk.P.handR.clone().add(poseFk.P.handR.clone().set(0, -0.07, 0).applyQuaternion(poseFk.W.handR));
  palm.y += drop;
  const m = hero.ikMap;
  const hand = m ? [palm.x / m.scale, m.from + (palm.y - m.to) / m.scale, palm.z / m.scale] : palm.toArray();
  let dir, up;
  if (j.weapon) ({ dir, up } = j.weapon); // the reference holds a real weapon prop
  else {
    dir = j.indexR.clone().sub(j.pinkyR).normalize();
    const fwd = j.knuckleR.clone().sub(j.handR); fwd.addScaledVector(dir, -fwd.dot(dir)).normalize();
    up = dir.clone().cross(fwd).normalize();
  }
  const hold = { hand: hand.map(r3), dir: dir.toArray().map(r3), up: up.toArray().map(r3) };
  if (j.weaponL) {
    // the left palm and the left weapon's own axes (a dual carry's hold.left)
    const pl = poseFk.P.handL.clone().add(poseFk.P.handL.clone().set(0, -0.07, 0).applyQuaternion(poseFk.W.handL));
    pl.y += drop;
    hold.left = { hand: (m ? [pl.x / m.scale, m.from + (pl.y - m.to) / m.scale, pl.z / m.scale] : pl.toArray()).map(r3), dir: j.weaponL.dir.toArray().map(r3), up: j.weaponL.up.toArray().map(r3) };
  }
  return { stance, hold };
}, [file, clip, time, skill, profile, prop, legs, arms, propL, offhand]);

result.source = `${profile === 'kaykit' ? 'KayKit Adventurers' : 'Quaternius Universal Animation Library'} (CC0) ${clip} at ${time} s, retargeted onto the driver rig${legs !== 1 ? `, legs x${legs}` : ''}${arms !== 1 ? `, arms in x${arms}` : ''} (scripts/pose-retarget)`;
console.log(JSON.stringify(result, null, 2));

if (shots) {
  // the hero in the result (stance and carry applied for this page only), facing +Z like the reference
  await page.evaluate(async ([result, skill]) => {
    const F = window.__fxtest;
    F.stances._retarget = result.stance;
    const kind = F.hero.weaponKind;
    const old = F.hero.holds[kind] || {}, two = old.two && !F.hero.offhandKind;
    const key = result.hold.left ? 'dual' : two ? 'two' : 'one';
    F.hero.holds[kind] = { ...old, [key]: { ...old[key], ...result.hold, stance: '_retarget' } };
    F.setSkill(skill); if (result.offhand) F.setOffhand(result.offhand); F.hideDummies(); F.game.player.facing = 0; F.advance(1.5);
  }, [{ ...result, offhand }, skill]);
  fs.mkdirSync(shots, { recursive: true });
  const views = { front: [[0, 0.75, 2.4], [0, 0.5, 0]], side: [[2.4, 0.75, 0], [0, 0.5, 0]], q: [[1.75, 1.0, 1.75], [0, 0.5, 0]], top: [[0, 4.4, 3.1], [0, 0.35, 0]] };
  for (const [v, [pos, look]] of Object.entries(views)) {
    await page.evaluate((o) => { const F = window.__fxtest; F.hideDummies(); F.game.player.facing = 0; F.state.camOverride = o; F.advance(0.02); }, { pos, look });
    await page.locator('canvas').first().screenshot({ path: `${shots}/${clip}@${time}-chibi-${v}.png` });
  }
}
if (errors.length) console.error('page errors', errors);
await browser.close();
