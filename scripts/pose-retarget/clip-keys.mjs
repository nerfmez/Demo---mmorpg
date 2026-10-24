// A whole reference clip as an action (src/render/actions.js form): keys of absolute driver channels,
// the body drop and the weapon's turn in the hand, the `hit` key at the blade's fastest frame (its
// contact), and `sweep` (+1 when the blade sweeps toward the hero's left, the slash effect's dir).
// Needs the dev server and the reference GLBs (docs/POSE-RETARGET.md).
//
//   node scripts/pose-retarget/clip-keys.mjs --file UAL2.glb --clip Sword_Light_A --skill slash [--keys 8] [--legs 0.8] [--face]
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const opts = {
  file: arg('file', 'UAL1.glb'), clip: arg('clip'), skill: arg('skill', 'slash'), profile: arg('profile', 'ual'), prop: arg('prop', null),
  weapon: arg('weapon', null), keys: +arg('keys', '8'), legs: +arg('legs', '1'), from: +arg('from', '0'), to: +arg('to', '1'),
  face: flag('face'), mirror: flag('mirror'),
};
if (!opts.clip) throw new Error('--clip is required');
const site = arg('site', 'http://127.0.0.1:4190');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(site + '/fx-test.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__fxtest?.hero?.holds, null, { timeout: 90000 });

const result = await page.evaluate(async (o) => {
  const R = await import('/scripts/pose-retarget/retarget.js');
  const F = window.__fxtest;
  F.state.auto = false; F.state.weapon = o.weapon; F.state.offhand = null; F.setSkill(o.skill); F.freeze(true);
  const g = await R.load('/tests/browser/out/ual/' + o.file);
  const P = R.PROFILES[o.profile];
  const dur = g.animations.find((a) => a.name === o.clip).duration;
  const rest = R.sample(g, P.rest, 0, P);
  const restLocal = R.retarget(rest, { restHeadQ: rest.headQ }).local;
  const hero = F.hero, bones = hero.bones;
  const names = ['body', 'hips', 'torso', 'chest', 'head', 'legL', 'kneeL', 'footL', 'legR', 'kneeR', 'footR', 'armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR'];
  const offsets = {}, parents = {};
  for (const n of names) { offsets[n] = bones[n].position.toArray(); parents[n] = names.find((m) => bones[m] === bones[n].parent) || null; }
  offsets.body = [0, 0, 0];
  const restFk = R.fk(offsets, parents, {}), foot = (k) => Math.min(k.P.footL.y, k.P.footR.y);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  // one turn for the whole clip (its first frame faces +Z), so the swing's own twist is kept
  const t0 = dur * o.from, t1 = Math.min(dur * o.to, dur - 1e-3); // at its full length a clip wraps to its first frame
  const yaw = o.face ? -R.facingYaw(R.sample(g, o.clip, t0, P, o.prop, null, false, o.mirror)) : 0;
  const frame = (t) => {
    const j = R.sample(g, o.clip, t, P, o.prop, null, false, o.mirror);
    if (yaw) R.turn(j, yaw);
    const { local } = R.retarget(j, { restHeadQ: rest.headQ });
    for (const n of ['hips', 'torso', 'chest', 'head', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'elbowL', 'elbowR'])
      if (local[n] && restLocal[n]) local[n] = local[n].map((x, i) => x - restLocal[n][i]);
    for (const n of ['legL', 'legR', 'kneeL', 'kneeR']) if (local[n]) local[n] = local[n].map((x) => x * o.legs);
    const fk = R.fk(offsets, parents, local);
    let dir;
    if (j.weapon) dir = j.weapon.dir;
    else dir = j.indexR.clone().sub(j.pinkyR).normalize(); // the blade along the fist
    const pose = {};
    for (const n of ['hips', 'torso', 'chest', 'head', 'legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR']) pose[n] = (local[n] || [0, 0, 0]).map(r3);
    pose.weapon = R.weaponChannel(fk.W.handR, dir).map(r3);
    pose.drop = [r3(foot(restFk) - foot(fk)), 0, 0];
    const tip = j.handR.clone().addScaledVector(dir, 0.9), hip = j.hips;
    return { pose, tip, yaw: Math.atan2(tip.x - hip.x, tip.z - hip.z) };
  };
  // the contact: the blade tip's fastest frame
  const M = 40, fr = Array.from({ length: M + 1 }, (_, i) => frame(t0 + ((t1 - t0) * i) / M));
  let best = 1, speed = 0;
  for (let i = 1; i <= M; i++) { const v = fr[i].tip.distanceTo(fr[i - 1].tip); if (v > speed) { speed = v; best = i; } }
  const hitU = (best - 0.5) / M;
  let dy = fr[Math.min(M, best + 1)].yaw - fr[Math.max(0, best - 2)].yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const us = [...new Set([...Array.from({ length: o.keys }, (_, k) => k / (o.keys - 1)), hitU].map((u) => r3(u)))].sort((a, b) => a - b);
  const keys = us.map((u) => [u, frame(t0 + (t1 - t0) * u).pose]);
  return { hit: r3(hitU), sweep: dy >= 0 ? 1 : -1, seconds: r3(t1 - t0), keys, speeds: fr.slice(1).map((f, i) => r3(f.tip.distanceTo(fr[i].tip))) };
}, opts);

result.source = `${opts.profile === 'kaykit' ? 'KayKit Adventurers' : 'Quaternius Universal Animation Library'} (CC0) ${opts.clip}${opts.from || opts.to !== 1 ? ` ${opts.from}-${opts.to}` : ''}${opts.legs !== 1 ? `, legs x${opts.legs}` : ''}${opts.face ? ', faced forward' : ''}${opts.mirror ? ', mirrored' : ''} (scripts/pose-retarget/clip-keys.mjs)`;
console.log(JSON.stringify(result));
await browser.close();
