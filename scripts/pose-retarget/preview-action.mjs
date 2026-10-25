// Play a candidate action on the chibi hero with the game's timing and render a frame sheet, without
// touching data/ or actions.js: the action is registered in the FX bench page only. Needs the dev
// server. See docs/POSE-RETARGET.md and .claude/skills/anime-action.
//
//   node scripts/pose-retarget/preview-action.mjs --action cand.json --weapon greatblade --cast 0.65 --out out/prev
//   node scripts/pose-retarget/preview-action.mjs --action cand.json --skill frost_nova --bench --out out/prev
//   node scripts/pose-retarget/preview-action.mjs --play slash --kind melee_arc --step 1 --weapon dagger --offhand dagger --cast 0.18
//
// cand.json is an action as data/action-clips.json holds one: {hit, sweep?, keys: [[t, pose], ...]}
// (absolute channels over the resting pose). Like the game (skill-fx.js), the keys before `hit` play
// over the cast time (--cast, seconds) and the rest over --post (default 0.28 s).
// --bench casts the bench skill for real (its effects and dummies; the action replaces the skill's own).
// --frames N evenly spaced frames plus the hit frame; --views game,q,side,front (game = the game camera).
// Prints a JSON summary: the sheet, each frame's time and beat, and the frame where the weapon tip moves
// fastest (a strike's contact should be on the hit frame).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
// --play skill: play what the game picks for that skill (with --kind, --step, --offhand) instead of a file
const play = arg('play', null), action = play ? null : JSON.parse(fs.readFileSync(arg('action'), 'utf8'));
const o = {
  skill: arg('skill', 'slash'), weapon: arg('weapon', null), offhand: arg('offhand', null), cast: +arg('cast', '0.3'), post: +arg('post', '0.28'),
  kind: arg('kind', null), step: +arg('step', '0'), frames: +arg('frames', '10'), views: arg('views', 'game,q,side').split(','),
  bench: flag('bench'), hold: +arg('hold', '0'), dummies: flag('dummies') || flag('bench'), running: flag('running'),
};
const out = arg('out', 'tests/browser/out/preview'), site = arg('site', 'http://127.0.0.1:4190');
fs.mkdirSync(out, { recursive: true });
const tag = arg('tag', (o.bench ? o.skill : o.weapon || 'hero') + '-' + (play ? play + o.step : arg('action').split('/').pop().replace(/\.json$/, '')));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(site + '/fx-test.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__fxtest?.anim && window.__fxtest?.registerClip, null, { timeout: 90000 });
await page.addStyleTag({ content: '#joy, .actions, #banner, #numbers, #panel { display: none !important; }' });
await page.evaluate((o) => {
  const F = window.__fxtest;
  F.state.auto = false; F.state.weapon = o.weapon; F.state.offhand = o.offhand;
  F.setSkill(o.bench ? o.skill : 'slash'); F.freeze(true); F.advance(0.1);
}, o);
await page.waitForTimeout(3500); // the rebuilt hero's models load
const info = await page.evaluate(([o, action, play]) => {
  const F = window.__fxtest;
  if (!o.dummies) F.hideDummies();
  F.advance(1);
  if (o.running) { F.game.setMove(1, 0); F.advance(1); }
  const name = play || (o.bench ? o.skill : '_preview');
  if (action) F.registerClip(name, action);
  if (o.bench) { F.castDown(); if (o.hold) { F.advance(o.hold); F.castUp(); } }
  else F.anim.play(name, o.cast + o.post, null, o.step, o.cast, o.kind);
  const a = F.anim.action;
  return { name: a?.name, dur: a?.dur, hitAt: a?.hitAt, weapon: F.hero.weaponKind };
}, [o, action, play]);
if (!info.name) throw new Error('the action did not start: ' + JSON.stringify(info) + ' ' + errors.join(' '));
const dur = info.dur, hitT = info.dur * info.hitAt;
// frame times: evenly over the action and the hit itself
const times = [...new Set([...Array.from({ length: o.frames }, (_, i) => (dur * i) / (o.frames - 1) * 0.999), hitT].map((t) => +t.toFixed(4)))].sort((a, b) => a - b);
// the weapon tip's speed sampled every 1/60 s (the contact should be on the hit frame)
const shots = [], speeds = [];
let now = 0;
const tmp = fs.mkdtempSync(out + '/.f-');
const beat = (t) => (Math.abs(t - hitT) < 1e-3 ? 'HIT' : t < hitT ? `-${(hitT - t).toFixed(2)}` : `+${(t - hitT).toFixed(2)}`);
for (const [i, t] of times.entries()) {
  const steps = Math.max(0, Math.round((t - now) * 60));
  const sp = await page.evaluate((steps) => {
    const F = window.__fxtest, w = F.hero.bones.weapon, V = w.position.constructor, out = [];
    const tip = () => { w.updateWorldMatrix(true, false); return new V(0, 0, 0.8).applyMatrix4(w.matrixWorld); };
    let p = tip();
    for (let k = 0; k < steps; k++) { F.advance(1 / 60); const q = tip(); out.push([F.anim.action ? F.anim.action.t : -1, p.distanceTo(q) * 60]); p = q; }
    return out;
  }, steps);
  speeds.push(...sp);
  now += steps / 60;
  for (const v of o.views) {
    await page.evaluate(([v]) => {
      const F = window.__fxtest, P = F.game.player, a = P.facing, fx = Math.sin(a), fz = Math.cos(a), rx = -fz, rz = fx;
      // game: the game camera's own angle (view.js CAM_OFFSET 0, 19, 13.5), closer
      const at = { game: [0, 5.2, 3.7], q: [fx * 2.1 + rx * 1.6, 1.15, fz * 2.1 + rz * 1.6], side: [rx * 2.6, 0.85, rz * 2.6], front: [fx * 2.6, 0.9, fz * 2.6], back: [-fx * 2.4 + rx * 0.6, 1.2, -fz * 2.4 + rz * 0.6] }[v];
      F.state.camOverride = at ? { pos: at, look: [fx * 0.2, 0.5, fz * 0.2] } : null;
      F.redraw();
    }, [v]);
    const f = `${tmp}/${i}-${v}.png`;
    await page.locator('canvas').first().screenshot({ path: f });
    shots.push({ f, v, i, label: `${t.toFixed(2)}s ${beat(t)}` });
  }
}
const fastest = speeds.reduce((b, s) => (s[1] > b[1] ? s : b), [0, 0]);
const sheet = `${out}/${tag}.png`;
execFileSync('python3', ['-c', `
import sys, json
from PIL import Image, ImageDraw
shots, views, cols, out, title = json.loads(sys.argv[1]), json.loads(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
T = 220
s = Image.new('RGB', (T * cols, T * len(views) + 20), 'white'); d = ImageDraw.Draw(s)
d.text((4, 4), title, fill='black')
for sh in shots:
    im = Image.open(sh['f']).convert('RGB'); w, h = im.size; c = min(w, h)
    im = im.crop(((w - c) // 2, (h - c) // 2, (w + c) // 2, (h + c) // 2)).resize((T, T))
    x, y = sh['i'] * T, 20 + views.index(sh['v']) * T
    s.paste(im, (x, y)); d.rectangle((x, y, x + T - 1, y + 14), fill='black' if 'HIT' not in sh['label'] else 'red')
    d.text((x + 3, y + 2), sh['v'] + ' ' + sh['label'], fill='white')
s.save(out)`, JSON.stringify(shots), JSON.stringify(o.views), String(times.length), sheet,
  `${tag}: ${info.name} ${info.weapon} dur ${dur.toFixed(2)} s, hit at ${hitT.toFixed(2)} s; fastest tip at ${fastest[0].toFixed(2)} s`]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ sheet, action: info.name, weapon: info.weapon, dur: +dur.toFixed(3), hitT: +hitT.toFixed(3), fastestTipAt: +fastest[0].toFixed(3), fastestTipSpeed: +fastest[1].toFixed(2), frames: times.map((t) => `${t.toFixed(2)} ${beat(t)}`), errors }));
await browser.close();
