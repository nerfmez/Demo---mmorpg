// A strip of frames of reference clips (ref-view.html), for choosing a clip and its time range before
// retargeting it. Needs the dev server and the reference GLBs (fetch-ual.sh). See docs/POSE-RETARGET.md.
//
//   node scripts/pose-retarget/ref-strip.mjs --file Knight.glb --anim Rig_Medium_CombatMelee.glb --props 1H_Sword \
//     --clips Melee_1H_Attack_Chop,Melee_1H_Attack_Slice_Diagonal --frames 8 --views q,side --out out/refs
//   node scripts/pose-retarget/ref-strip.mjs --file UAL2.glb --clips Sword_Heavy_A@0.2-0.9 --out out/refs
// clip@a-b limits a clip to a..b of its length. Writes <out>/<clip>.png (rows: views, columns: frames)
// and prints each clip's duration.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const file = arg('file', 'UAL1.glb'), anim = arg('anim', ''), props = arg('props', ''), out = arg('out', 'tests/browser/out/refs');
const clips = (arg('clips') || '').split(',').filter(Boolean), frames = +arg('frames', '8'), views = arg('views', 'q,side').split(',');
const site = arg('site', 'http://127.0.0.1:4190');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${site}/scripts/pose-retarget/ref-view.html?f=${file}${anim ? '&anim=' + anim : ''}`);
await page.waitForFunction(() => window.ready, null, { timeout: 90000 });
await page.evaluate((p) => window.props(p ? p.split('+') : []), props);
if (!clips.length) console.log(JSON.stringify(await page.evaluate(() => window.clips)));
const tmp = fs.mkdtempSync(out + '/.f-');
for (const spec of clips) {
  const [name, range] = spec.split('@');
  const [a, b] = range ? range.split('-').map(Number) : [0, 1];
  const dur = await page.evaluate((n) => window.clipDur(n), name);
  const ts = Array.from({ length: frames }, (_, i) => dur * (a + ((b - a) * i) / Math.max(1, frames - 1)) * 0.999);
  const shots = [];
  for (const v of views) for (const [i, t] of ts.entries()) {
    await page.evaluate(([n, t, v]) => window.pose(n, t, v), [name, t, v]);
    const f = `${tmp}/${v}-${i}.png`;
    await page.locator('canvas').screenshot({ path: f });
    shots.push([f, `${v} ${t.toFixed(2)}s`]);
  }
  const png = `${out}/${name}${range ? '@' + range : ''}.png`;
  execFileSync('python3', ['-c', `
import sys, json
from PIL import Image, ImageDraw
shots, cols, out, title = json.loads(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
T = 200; rows = (len(shots) + cols - 1) // cols
s = Image.new('RGB', (T * cols, T * rows + 18), 'white'); d = ImageDraw.Draw(s)
d.text((4, 3), title, fill='black')
for i, (f, lab) in enumerate(shots):
    x, y = (i % cols) * T, 18 + (i // cols) * T
    s.paste(Image.open(f).resize((T, T)), (x, y)); d.text((x + 3, y + 3), lab, fill='black')
s.save(out)`, JSON.stringify(shots), String(frames), png, `${file}${anim ? ' + ' + anim : ''}  ${spec}  (${dur.toFixed(2)} s)`]);
  console.log(JSON.stringify({ clip: name, duration: +dur.toFixed(3), png }));
}
fs.rmSync(tmp, { recursive: true, force: true });
if (errors.length) console.error('page errors', errors);
await browser.close();
