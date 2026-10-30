// Pearlshell Grotto focused capture: opens dungeon.html, checks the secret entrance flow and saves
// screenshots of the beach shell (sealed and open), every room and the whole-map view.
// Usage: npm run build && node tests/browser/grotto.mjs   (BROWSER=webkit for the Safari engine)
// Frames: tests/browser/out/grotto/<n>-<name>.png. Fails on page errors or a broken flow.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const OUT = new URL('./out/grotto/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4193;
const W = Number(process.env.WIDTH || 1180), H = Number(process.env.HEIGHT || 820);
const ONLY = process.argv[2] || null;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const shots = [];
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/dungeon.html`)).ok) break; } catch {}
    if (i > 60) throw new Error('preview server did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
  const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/dungeon.html`);
  await page.waitForFunction(() => window.__grotto && document.getElementById('loading').classList.contains('gone'), null, { timeout: 60000 });
  await page.evaluate(() => window.__grotto.ready());
  console.log(`grotto ready in ${Date.now() - t0} ms`);
  const settle = (ms = 900) => page.waitForTimeout(ms);
  let n = 0;
  const shot = async (name) => {
    if (ONLY && !name.includes(ONLY)) return;
    const path = `${OUT}${String(++n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path });
    shots.push(path);
  };

  // the beach: the shell is sealed, the door does not work until the shell is inspected
  await page.evaluate(() => window.__grotto.go('outside', -4.4, 4.2, 2.4));
  await settle();
  await shot('beach-sealed');
  const before = await page.evaluate(() => ({ action: document.getElementById('action').textContent, shown: document.getElementById('action').classList.contains('show') }));
  assert.ok(before.shown && before.action.includes('ตรวจสอบ'), `inspect offered near the shell: ${JSON.stringify(before)}`);
  await page.tap('#action');
  await settle(1800);
  await shot('beach-opened');
  assert.ok(await page.evaluate(() => window.__grotto.found.has('shell-mouth')), 'the secret is found');
  // walk into the mouth: the hero goes inside
  await page.evaluate(() => window.__grotto.go('outside', -2.6, 3.2, 2.6));
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__grotto.state.where)) === 'outside'; i++) await page.waitForTimeout(150);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  await settle(1000);
  assert.equal(await page.evaluate(() => window.__grotto.state.where), 'inside', 'walked through the shell mouth');
  await shot('entrance');

  // where to stand in each area, in concept pixels (data/dungeons/shell-grotto-trace.json), and the facing
  const TRACE = JSON.parse(readFileSync(new URL('../../data/dungeons/shell-grotto-trace.json', import.meta.url), 'utf8'));
  const px = ([x, y]) => [(x - TRACE.origin[0]) * TRACE.scale, (y - TRACE.origin[1]) * TRACE.zScale];
  const rooms = [
    ['coral-steps', [395, 600], 3.0],
    ['hoard', [240, 240], 3.1],
    ['junction', [520, 405], 1.6],
    ['corridor', [760, 420], 1.6],
    ['coral-island', [660, 540], 3.1],
    ['sealed-arch', [676, 345], 3.1],
    ['temple', [1060, 700], 3.1],
    ['temple-altar', [1120, 690], 3.1],
    ['throne-steps', [1160, 400], 3.1],
    ['throne', [1200, 300], 3.1],
  ].map(([name, at, f]) => [name, ...px(at), f]);
  for (const [name, x, z, f] of rooms) {
    await page.evaluate(([x, z, f]) => window.__grotto.go('inside', x, z, f), [x, z, f]);
    await settle();
    await shot(name);
  }
  await page.evaluate(() => window.__grotto.overview(true));
  await settle(1200);
  await shot('overview');
  await page.evaluate(() => { window.__grotto.overview(false); window.__grotto.go('outside', -9, 10, 2.2); window.__grotto.overview(true); });
  await settle(1200);
  await shot('beach-overview');
  assert.deepEqual(errors, [], 'no page errors');
  await browser.close();
  console.log(`saved ${shots.length} frames to ${OUT}`);
} finally {
  try { process.kill(-server.pid); } catch {}
}
