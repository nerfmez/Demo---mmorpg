// Turn a clip action's weapon about its own length, key by key, so the blade's +X side (the cutting
// edge of a models.json edge 1 model; hero.js turns an edge -1 model half a turn) leads the way the
// tip travels through the strike. clip-keys.mjs keeps only the blade's direction from the reference, so
// its edge can face anywhere and a cut may hit with the flat (the owner saw it). The blade's direction
// is unchanged.
// Needs the dev server. See docs/POSE-RETARGET.md.
//
//   node scripts/pose-retarget/edge-roll.mjs --action cand.json --weapon greatblade [--offhand shield] [--tip 0.7] > out.json
// The action plays on the FX bench hero (the real rig: REST, drop and hips included) and each key's
// blade frame and tip are read there. The strike (the segment into the hit key) leads with the edge
// at both its keys; the wind-up keeps the strike's first roll (the edge faces the way it will cut), a
// fast follow-through keeps leading with the edge and slower keys hold the last roll. The first and
// last keys keep their roll (the carry), so the fades in and out do not spin the blade.
import { chromium } from 'playwright';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const clip = JSON.parse(fs.readFileSync(arg('action'), 'utf8'));
const o = { weapon: arg('weapon', 'sword'), offhand: arg('offhand', null), tip: +arg('tip', '0.7') };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(arg('site', 'http://127.0.0.1:4190') + '/fx-test.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__fxtest?.anim && window.__fxtest?.registerClip, null, { timeout: 90000 });
await page.evaluate((o) => {
  const F = window.__fxtest;
  F.state.auto = false; F.state.weapon = o.weapon; F.state.offhand = o.offhand;
  F.setSkill('slash'); F.freeze(true); F.advance(0.1);
}, o);
await page.waitForTimeout(3500); // the rebuilt hero's models load
const out = await page.evaluate(([clip, o]) => {
  const F = window.__fxtest, w = F.hero.bones.weapon, V = w.position.constructor, edge = F.hero.weaponEdge ?? 1;
  F.hideDummies(); F.advance(1);
  F.registerClip('_edge', clip);
  // a long action whose hit stays at its own key time, so the action's t maps straight onto key times
  const dur = 10;
  F.anim.play('_edge', dur, null, 0, dur * clip.hit, null);
  // the blade's frame (the data's own: an edge -1 model is shown turned half a turn, hero.js) and tip at key time t
  const at = (t) => {
    F.anim.action.t = Math.min(t * dur, dur - 1e-3); F.redraw(); // redraw poses without stepping time
    w.updateWorldMatrix(true, false);
    const e = w.matrixWorld.elements;
    return { x: new V(e[0], e[1], e[2]).normalize().multiplyScalar(edge), y: new V(e[4], e[5], e[6]).normalize().multiplyScalar(edge), z: new V(e[8], e[9], e[10]).normalize(), tip: new V(0, 0, o.tip).applyMatrix4(w.matrixWorld) };
  };
  const keys = clip.keys, n = keys.length, tips = keys.map(([t]) => at(t).tip);
  const speed = (a, b) => tips[b].distanceTo(tips[a]) / Math.max(1e-3, keys[b][0] - keys[a][0]);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10); // rig.js: every segment is eased
  // the turn the blade needs through segment (a, b) at N points: the roll that points +X along the tip's
  // velocity there, against the segment's eased fraction (the added roll is interpolated on it)
  const need = (a, b) => {
    const N = 10, t0 = keys[a][0], t1 = keys[b][0], h = (t1 - t0) * 0.02, out = [];
    for (let j = 0; j < N; j++) {
      const u = (j + 0.5) / N, t = t0 + (t1 - t0) * u, f = at(t), v = at(t + h).tip.sub(at(t - h).tip);
      v.addScaledVector(f.z, -v.dot(f.z));
      if (v.lengthSq() < 1e-12) continue;
      let tau = Math.atan2(v.dot(f.y), v.dot(f.x));
      if (out.length) tau = out[out.length - 1].tau + wrap(tau - out[out.length - 1].tau);
      out.push({ s: smoother(u), tau, w: v.length() });
    }
    return out;
  };
  // the strike (the segment into the hit key): a roll at each of its keys, fitted (weighted by the tip's
  // speed) so the edge leads all the way to the contact
  const hi = keys.reduce((b, k, i) => (Math.abs(k[0] - clip.hit) < Math.abs(keys[b][0] - clip.hit) ? i : b), 0);
  const turn = new Array(n).fill(0), fast = speed(hi - 1, hi) * 0.5;
  {
    const p = need(hi - 1, hi);
    let W = 0, S = 0, T = 0, SS = 0, ST = 0;
    for (const { s, tau, w } of p) { W += w; S += w * s; T += w * tau; SS += w * s * s; ST += w * s * tau; }
    const slope = (W * ST - S * T) / (W * SS - S * S || 1), base = (T - slope * S) / W;
    turn[hi - 1] = base; turn[hi] = base + slope;
  }
  // the wind-up keeps the strike's first roll: the edge already faces the way it will cut (the spine leads back)
  for (let i = hi - 2; i > 0; i--) turn[i] = turn[hi - 1];
  // after the contact a fast follow-through keeps leading with the edge (its last roll fitted from the
  // previous key's); slower keys hold the last roll
  for (let i = hi + 1; i < n - 1; i++) {
    turn[i] = turn[i - 1];
    if (speed(i - 1, i) < fast) continue;
    let SS = 0, ST = 0;
    for (const { s, tau, w } of need(i - 1, i)) { const d = turn[i - 1] + wrap(tau - turn[i - 1]) - turn[i - 1]; SS += w * s * s; ST += w * s * d; }
    if (SS > 0) turn[i] = turn[i - 1] + ST / SS;
  }
  // the short way from the hit's roll; the first and last keys keep the carry's roll, so the fades do not spin it
  const shift = turn[hi] - wrap(turn[hi]);
  for (let i = 1; i < n - 1; i++) turn[i] -= shift;
  turn[0] = 0; turn[n - 1] = 0;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  F.anim.action = null;
  return { edge, speeds: keys.slice(1).map((k, i) => r3(speed(i, i + 1))), turns: turn.map(r3), keys: keys.map(([t, pose], i) => [t, pose.weapon && turn[i] ? { ...pose, weapon: [pose.weapon[0], pose.weapon[1], r3(pose.weapon[2] + turn[i])] } : pose]) };
}, [clip, o]);
console.error(`model edge ${out.edge}; segment speeds ${JSON.stringify(out.speeds)}; turns per key ${JSON.stringify(out.turns)}`);
console.log(JSON.stringify({ ...clip, keys: out.keys, _from: (clip._from || '') + ` Edge: the weapon turned about its length per key so its +X edge leads the tip's travel (scripts/pose-retarget/edge-roll.mjs --weapon ${o.weapon}${o.offhand ? ' --offhand ' + o.offhand : ''} --tip ${o.tip}; turns ${JSON.stringify(out.turns)}).` }));
await browser.close();
